"""
Testes da API do ZoZo (núcleo Python + banco SQLite com as mesmas migrações do D1).

    python -m unittest discover -s api/tests -v
"""
import asyncio
import base64
import hashlib
import hmac
import json
import os
import pathlib
import secrets
import sqlite3
import sys
import time
import unittest
from urllib.parse import parse_qs

AQUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI.parent / "src"))
sys.path.insert(0, str(AQUI.parent / "dev"))

import emails  # noqa: E402
import google  # noqa: E402
import nucleo  # noqa: E402
import totp  # noqa: E402
from banco_sqlite import MIGRACOES, BancoSqlite, aplicar_migracoes, conectar  # noqa: E402

EMAIL = "ana@exemplo.com"
OUTRO = "beto@exemplo.com"
SEGREDO = "s" * 48
CONFIG = {"SEGREDO": SEGREDO}
DEMO = nucleo.DEMO_EMAIL
T0 = 1_800_000_000          # "agora" fixo dos testes


def rodar(coro):
    return asyncio.run(coro)


# ---------------- RSA de teste (só para assinar os ID tokens do Google nos testes) ----------------
def _primo(bits):
    while True:
        n = secrets.randbits(bits) | (1 << (bits - 1)) | 1
        if all(n % p for p in (3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37)) and _miller_rabin(n):
            return n


def _miller_rabin(n, rodadas=24):
    d, r = n - 1, 0
    while d % 2 == 0:
        d //= 2
        r += 1
    for _ in range(rodadas):
        x = pow(secrets.randbelow(n - 3) + 2, d, n)
        if x in (1, n - 1):
            continue
        for _ in range(r - 1):
            x = pow(x, 2, n)
            if x == n - 1:
                break
        else:
            return False
    return True


def _chave_rsa():
    e = 65537
    while True:
        p, q = _primo(1024), _primo(1024)
        n, phi = p * q, (p - 1) * (q - 1)
        if p != q and n.bit_length() == 2048 and phi % e:
            return n, e, pow(e, -1, phi)


def _b64u(b):
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def _int_b64u(i):
    return _b64u(i.to_bytes((i.bit_length() + 7) // 8, "big"))


N, E, D = _chave_rsa()
JWK = {"kty": "RSA", "kid": "k1", "n": _int_b64u(N), "e": _int_b64u(E), "alg": "RS256"}


def assinar(claims, kid="k1", alg="RS256", d=D, n=N):
    h = _b64u(json.dumps({"alg": alg, "kid": kid}).encode())
    p = _b64u(json.dumps(claims).encode())
    k = (n.bit_length() + 7) // 8
    t = google._DIGEST_INFO_SHA256 + hashlib.sha256(f"{h}.{p}".encode()).digest()
    em = b"\x00\x01" + b"\xff" * (k - len(t) - 3) + b"\x00" + t
    s = pow(int.from_bytes(em, "big"), d, n).to_bytes(k, "big")
    return f"{h}.{p}.{_b64u(s)}"


class FakeServicos:
    def __init__(self, captcha_ok=True):
        self.chamadas = []
        self.captcha_ok = captcha_ok

    async def http_get(self, url, cabecalhos):
        self.chamadas.append((url, dict(cabecalhos)))
        if url == google.CHAVES:
            return 200, json.dumps({"keys": [dict(JWK, kid="g1")]})
        if url.startswith("https://api.pwnedpasswords.com/range/"):
            return 200, "0018A45C4D1DEF81644B54AB7F969B88D65:1\r\n00D4F6E8FA6EECAD2A3AA415EEC418D38EC:2"
        return 404, ""

    async def http_post(self, url, campos):
        self.chamadas.append((url, dict(campos)))
        if url == nucleo.TURNSTILE_URL:
            return 200, json.dumps({"success": self.captcha_ok and campos.get("response") == "ok"})
        if url == google.TOKEN:
            return (200, json.dumps({"id_token": self.google_token})) if self.google_token else (400, "{}")
        return 404, ""

    google_token = None        # resposta do endpoint de token do Google (falso)

    async def http_post_json(self, url, cabecalhos, corpo):
        self.chamadas.append((url, dict(cabecalhos)))
        if url == emails.RESEND_URL:
            self.emails.append(json.loads(corpo))
            return (200, '{"id":"x"}') if self.email_ok else (500, "{}")
        return 404, ""

    email_ok = True

    @property
    def emails(self):
        if not hasattr(self, "_emails"):
            self._emails = []
        return self._emails


class TesteTotp(unittest.TestCase):
    SEG = b"12345678901234567890"          # vetor da RFC 6238 (SHA-1)

    def test_vetores_rfc6238(self):
        for t, esperado in ((59, "287082"), (1111111109, "081804"), (1234567890, "005924"), (2000000000, "279037")):
            self.assertEqual(totp.codigo(self.SEG, t // 30), esperado)

    def test_janela_e_reuso(self):
        c = totp.codigo(self.SEG, T0 // 30)
        self.assertEqual(totp.conferir(self.SEG, c, T0), T0 // 30)
        self.assertEqual(totp.conferir(self.SEG, c, T0 + 30), T0 // 30)          # relógio 1 passo adiantado
        self.assertIsNone(totp.conferir(self.SEG, c, T0 + 90))                   # 3 passos: fora da janela
        self.assertIsNone(totp.conferir(self.SEG, c, T0, ultimo_passo=T0 // 30))  # já usado
        for ruim in ("", "12345", "1234567", "abcdef", None, 123456):
            self.assertIsNone(totp.conferir(self.SEG, ruim, T0))

    def test_segredo_cifrado(self):
        s = totp.novo_segredo()
        c = totp.cifrar(s, SEGREDO)
        self.assertNotIn(totp.base32(s), c)
        self.assertEqual(totp.decifrar(c, SEGREDO), s)
        self.assertIsNone(totp.decifrar(c, "outro-segredo" * 4))               # outro SEGREDO
        bruto = bytearray(base64.b64decode(c)); bruto[20] ^= 1
        self.assertIsNone(totp.decifrar(base64.b64encode(bytes(bruto)).decode(), SEGREDO))   # adulterado
        self.assertTrue(totp.uri(s, EMAIL).startswith("otpauth://totp/ZoZo:ana@exemplo.com?secret="))


# ---------------- API ----------------
def b64(b):
    return base64.b64encode(b).decode()


def prova():
    return b64(secrets.token_bytes(32))


def conteudo(tamanho=64):
    return b64(bytes([2]) + secrets.token_bytes(tamanho))


class Cliente:
    """Um navegador: guarda o cookie de sessão e tem um IP."""

    def __init__(self, banco, servicos=None, config=None, ip="203.0.113.7"):
        self.banco, self.servicos, self.ip = banco, servicos or FakeServicos(), ip
        self.config = CONFIG if config is None else config
        self.cookies = {}
        self.agora = T0
        self.ultima = None
        self.logs = []

    def __call__(self, metodo, caminho, corpo=None, prova=None, cab=None):
        h = {"Host": "zozo.exemplo.com", "CF-Connecting-IP": self.ip}
        if corpo is not None:
            h["Content-Type"] = "application/json"
        if prova:
            h["X-ZoZo-Prova"] = prova
        if self.cookies:
            h["Cookie"] = "; ".join(f"{k}={v}" for k, v in self.cookies.items())
        h.update(cab or {})
        texto = corpo if isinstance(corpo, str) else (json.dumps(corpo) if corpo is not None else "")
        p = nucleo.Pedido(metodo, "https://zozo.exemplo.com" + caminho, h, texto)
        r = rodar(nucleo.atender(p, self.banco, self.servicos, self.config, log=self.logs.append, agora=self.agora))
        self.ultima = r
        sc = r.cabecalhos.get("Set-Cookie")
        if sc:
            nome, _, resto = sc.partition("=")
            valor = resto.split(";", 1)[0]
            if "Max-Age=0" in sc:
                self.cookies.pop(nome, None)
            else:
                self.cookies[nome] = valor
        return r.status, (json.loads(r.corpo) if r.corpo else None)


class Base(unittest.TestCase):
    def setUp(self):
        self.con = conectar()
        self.banco = BancoSqlite(self.con)
        self.api = Cliente(self.banco)
        self.prova = prova()
        self.sal = b64(os.urandom(16))
        st, self.sessao = self.cadastrar(self.api, EMAIL, self.prova)
        self.assertEqual(st, 201)

    def tearDown(self):
        self.con.close()

    def cadastrar(self, cli, email, pv, nome="Ana", **extra):
        return cli("POST", "/api/conta", dict({"email": email, "nome": nome, "sal": self.sal, "iteracoes": 600000, "prova": pv}, **extra))

    def entrar(self, cli=None, email=EMAIL, pv=None, **extra):
        cli = cli or self.api
        return cli("POST", "/api/sessao", dict({"email": email, "prova": pv or self.prova}, **extra))

    def gravar(self, va, c=None, p=None):
        return self.api("PUT", "/api/documento", {"versaoAnterior": va, "conteudo": c or conteudo()}, prova=p or self.prova)


class TesteContaESessao(Base):
    def test_cadastro_abre_sessao_e_cookie_seguro(self):
        sc = self.api.ultima.cabecalhos["Set-Cookie"]
        self.assertTrue(sc.startswith("__Host-zozo="))
        for attr in ("HttpOnly", "Secure", "SameSite=Strict", "Path=/"):
            self.assertIn(attr, sc)
        self.assertNotIn("Max-Age", sc)          # cookie de sessão: some ao fechar o navegador
        self.assertNotIn("Expires", sc)
        self.assertEqual(set(self.sessao), {"email", "nome", "envelope", "doisFatores", "demo", "recursos"})
        self.assertEqual((self.sessao["demo"], self.sessao["recursos"]), (False, {"perfis": False, "boleto": False, "pix": False, "cambio": False}))
        token = self.api.cookies["__Host-zozo"]
        guardado = self.con.execute("SELECT id FROM sessoes").fetchone()[0]
        self.assertEqual(guardado, hashlib.sha256(token.encode()).hexdigest())   # banco não guarda o token
        self.assertEqual(self.api("GET", "/api/sessao")[1]["email"], EMAIL)

    def test_envelope_nao_fica_no_banco(self):
        # banco + navegador não bastam: o envelope é HMAC(SEGREDO, cookie) e a coluna fica vazia
        self.assertEqual({r[0] for r in self.con.execute("SELECT envelope FROM sessoes")}, {""})
        env = self.sessao["envelope"]
        self.assertEqual(len(base64.b64decode(env)), 32)
        self.assertEqual(self.api("GET", "/api/sessao")[1]["envelope"], env)            # o mesmo a cada recarga
        outro = Cliente(self.banco, ip="198.51.100.3")
        self.assertNotEqual(self.entrar(outro)[1]["envelope"], env)                     # cada sessão tem o seu
        trocado = Cliente(self.banco, config=dict(CONFIG, SEGREDO="t" * 48), ip="198.51.100.4")
        trocado.cookies = dict(self.api.cookies)
        self.assertNotEqual(trocado("GET", "/api/sessao")[1]["envelope"], env)          # depende do SEGREDO
        self.assertNotIn(env, json.dumps([list(r) for r in self.con.execute("SELECT * FROM sessoes").fetchall()]))

    def test_captcha_incompleto_recusa(self):
        # chave pública sem a secreta: não fica "sem CAPTCHA" sem ninguém perceber
        cfg = dict(CONFIG, TURNSTILE_SITE_KEY="0x4AAA")
        cli = Cliente(self.banco, config=cfg, ip="198.51.100.5")
        self.assertEqual(self.cadastrar(cli, "novo@exemplo.com", prova()), (503, {"erro": "UNAVAILABLE"}))
        self.assertIsNone(self.con.execute("SELECT 1 FROM contas WHERE email = 'novo@exemplo.com'").fetchone())

    def test_cadastro_aberto_e_duplicado(self):
        outro = Cliente(self.banco, ip="198.51.100.1")
        self.assertEqual(self.cadastrar(outro, EMAIL, prova())[1], {"erro": "EMAIL_IN_USE"})
        qualquer = Cliente(self.banco, ip="198.51.100.2")
        self.assertEqual(self.cadastrar(qualquer, "qualquer@exemplo.com", prova())[0], 201)   # sem lista de e-mails

    def test_cadastro_validacoes(self):
        for i, corpo in enumerate(({"email": OUTRO, "nome": "B", "sal": self.sal, "iteracoes": 1000, "prova": prova()},
                      {"email": OUTRO, "nome": "B", "sal": "abc", "iteracoes": 600000, "prova": prova()},
                      {"email": OUTRO, "nome": "B", "sal": self.sal, "iteracoes": True, "prova": prova()},
                      {"email": OUTRO, "nome": "B", "sal": self.sal, "iteracoes": 600000, "prova": "curta"},
                      {"email": "sem-arroba", "nome": "B", "sal": self.sal, "iteracoes": 600000, "prova": prova()},
                      {"email": OUTRO, "nome": "  ", "sal": self.sal, "iteracoes": 600000, "prova": prova()})):
            cli = Cliente(self.banco, ip=f"198.51.100.{100 + i}")          # um IP por caso (há limite de cadastros por IP)
            self.assertEqual(cli("POST", "/api/conta", corpo)[0], 400, corpo)

    def test_cadastro_limitado_por_ip(self):
        cli = Cliente(self.banco, ip="198.51.100.9")
        st = [self.cadastrar(cli, f"u{i}@exemplo.com", prova())[0] for i in range(7)]
        self.assertEqual(st.count(201), nucleo.CADASTROS_POR_IP)
        self.assertEqual(st[-1], 429)

    def test_cadastro_exige_captcha_quando_configurado(self):
        cfg = dict(CONFIG, TURNSTILE_SECRET="segredo-turnstile")
        cli = Cliente(self.banco, config=cfg, ip="198.51.100.10")
        self.assertEqual(self.cadastrar(cli, OUTRO, prova())[1], {"erro": "CAPTCHA_REQUIRED"})
        self.assertEqual(self.cadastrar(cli, OUTRO, prova(), turnstile="errado")[0], 428)
        self.assertEqual(self.cadastrar(cli, OUTRO, prova(), turnstile="ok")[0], 201)
        url, campos = cli.servicos.chamadas[-1]
        self.assertEqual((url, campos["remoteip"]), (nucleo.TURNSTILE_URL, "198.51.100.10"))

    def test_parametros_nao_revelam_se_a_conta_existe(self):
        cli = Cliente(self.banco, ip="198.51.100.11")
        st, real = cli("GET", "/api/conta/parametros?email=" + EMAIL)
        self.assertEqual((st, real["sal"]), (200, self.sal))
        _, falso1 = cli("GET", "/api/conta/parametros?email=ninguem@exemplo.com")
        _, falso2 = cli("GET", "/api/conta/parametros?email=NINGUEM@exemplo.com")
        self.assertEqual(falso1, falso2)                                  # estável
        self.assertEqual(len(base64.b64decode(falso1["sal"])), 16)        # mesmo formato de um sal real
        self.assertEqual(falso1["iteracoes"], 600000)
        self.assertEqual(cli("GET", "/api/conta/parametros?email=x")[0], 400)

    def test_login_generico(self):
        cli = Cliente(self.banco, ip="198.51.100.12")
        st, c = self.entrar(cli)
        self.assertEqual((st, c["email"], c["doisFatores"]), (200, EMAIL, False))
        self.assertNotEqual(c["envelope"], self.sessao["envelope"])        # cada sessão tem o próprio envelope
        cli2 = Cliente(self.banco, ip="198.51.100.13")
        errado = self.entrar(cli2, pv=prova())
        inexistente = self.entrar(cli2, email="ninguem@exemplo.com", pv=prova())
        self.assertEqual(errado, inexistente)                               # mesma resposta: não revela a conta
        self.assertEqual(errado[0], 401)
        self.assertEqual(errado[1]["erro"], "INVALID_CREDENTIALS")
        self.assertNotIn("__Host-zozo", cli2.cookies)

    def test_logout_invalida_no_servidor(self):
        token = self.api.cookies["__Host-zozo"]
        self.assertEqual(self.api("DELETE", "/api/sessao")[0], 204)
        self.assertNotIn("__Host-zozo", self.api.cookies)
        self.api.cookies["__Host-zozo"] = token                             # cookie roubado/antigo não vale mais
        self.assertEqual(self.api("GET", "/api/sessao")[0], 204)
        self.assertEqual(self.api("GET", "/api/documento", prova=self.prova)[0], 401)

    def test_sessao_expira_por_inatividade_e_idade(self):
        self.api.agora = T0 + nucleo.SESSAO_OCIOSA_S + 1
        self.assertEqual(self.api("GET", "/api/sessao")[0], 204)
        self.assertEqual(self.con.execute("SELECT count(*) FROM sessoes").fetchone()[0], 0)
        self.entrar()
        for dia in range(1, 32):                                            # usada todo dia, mas tem idade máxima
            self.api.agora = T0 + nucleo.SESSAO_OCIOSA_S + dia * 86400
            st, _ = self.api("GET", "/api/sessao")
        self.assertEqual(st, 204)

    def test_cookie_lixo(self):
        for lixo in ("", "x", "a" * 500, "'; DROP TABLE contas; --"):
            self.api.cookies = {"__Host-zozo": lixo}
            self.assertEqual(self.api("GET", "/api/sessao")[0], 204)
        self.assertEqual(self.con.execute("SELECT count(*) FROM contas WHERE email != ?", (DEMO,)).fetchone()[0], 1)


class TesteBloqueio(Base):
    def setUp(self):
        super().setUp()
        self.cfg = dict(CONFIG, TURNSTILE_SECRET="segredo-turnstile")
        self.cli = Cliente(self.banco, config=self.cfg, ip="192.0.2.50")

    def errar(self, captcha=None, cli=None):
        extra = {"turnstile": captcha} if captcha else {}
        return self.entrar(cli or self.cli, pv=prova(), **extra)

    def test_progressivo(self):
        for i in range(1, 4):                                               # 1ª a 3ª: normais
            st, b = self.errar()
            self.assertEqual(st, 401)
        self.assertTrue(b["captcha"])                                       # avisa que a próxima pede CAPTCHA
        self.assertEqual(self.errar()[1], {"erro": "CAPTCHA_REQUIRED"})     # 4ª sem CAPTCHA: nem conta
        self.assertEqual(self.errar("ok")[0], 401)                          # 4ª
        st, b = self.errar("ok")                                            # 5ª → 15 min
        self.assertEqual((st, b["espera"]), (401, nucleo.BLOQUEIO_1_S))
        st, b = self.entrar(self.cli, turnstile="ok")                       # nem a senha certa entra agora
        self.assertEqual((st, b["erro"]), (429, "TOO_MANY_ATTEMPTS"))
        self.cli.agora += nucleo.BLOQUEIO_1_S
        for _ in range(4):                                                  # 6ª a 9ª (com CAPTCHA)
            self.assertEqual(self.errar("ok")[0], 401)
        st, b = self.errar("ok")                                            # 10ª → 24 h
        self.assertEqual(b["espera"], nucleo.BLOQUEIO_2_S)
        self.cli.agora += nucleo.BLOQUEIO_1_S
        self.assertEqual(self.entrar(self.cli, turnstile="ok")[0], 429)
        # Outro IP (o usuário em outra rede) continua entrando
        casa = Cliente(self.banco, config=self.cfg, ip="192.0.2.99")
        self.assertEqual(self.entrar(casa)[0], 200)
        # e o login certo libera todos os contadores da conta
        self.assertEqual(self.con.execute("SELECT count(*) FROM limites WHERE chave LIKE 'login|%'").fetchone()[0], 0)

    def test_muitos_ips_exigem_captcha_para_todos(self):
        for i in range(nucleo.CONTA_CAPTCHA):
            self.errar(cli=Cliente(self.banco, config=self.cfg, ip=f"10.0.{i}.1"))
        novo = Cliente(self.banco, config=self.cfg, ip="10.9.9.9")
        self.assertEqual(self.entrar(novo)[1], {"erro": "CAPTCHA_REQUIRED"})
        self.assertEqual(self.entrar(novo, turnstile="ok")[0], 200)

    def test_contador_esquece_depois_de_24h(self):
        for _ in range(3):
            self.errar()
        self.cli.agora += nucleo.ESQUECE_S
        self.assertEqual(self.errar()[1].get("captcha"), False)

    def test_pedidos_em_paralelo_nao_escapam(self):
        class Intercalado(BancoSqlite):
            """Cede a vez antes de cada comando, como o D1 (pedidos simultâneos se intercalam)."""
            async def primeiro(self, sql, *params):
                await asyncio.sleep(0)
                return await super().primeiro(sql, *params)

            async def executar(self, sql, *params):
                await asyncio.sleep(0)
                return await super().executar(sql, *params)

        banco = Intercalado(self.con)
        cfg = dict(CONFIG)                                                  # sem CAPTCHA: só o bloqueio
        h = {"Host": "zozo.exemplo.com", "CF-Connecting-IP": "192.0.2.77", "Content-Type": "application/json"}

        async def varios():
            pedidos = [nucleo.Pedido("POST", "https://zozo.exemplo.com/api/sessao", h,
                                     json.dumps({"email": EMAIL, "prova": prova()})) for _ in range(12)]
            return await asyncio.gather(*(nucleo.atender(p, banco, FakeServicos(), cfg, log=lambda *_: None, agora=T0) for p in pedidos))

        status = [r.status for r in rodar(varios())]
        self.assertEqual(status.count(401), nucleo.BLOQUEIO_1)              # só 5 provas chegam a ser conferidas
        self.assertEqual(status.count(429), 12 - nucleo.BLOQUEIO_1)

    def test_prova_errada_com_sessao_tambem_conta(self):
        for _ in range(nucleo.BLOQUEIO_1):
            self.assertEqual(self.api("GET", "/api/documento", prova=prova())[0], 403)
        self.assertEqual(self.api("GET", "/api/documento", prova=self.prova)[0], 429)


class TesteDocumento(Base):
    def test_exige_sessao_e_prova(self):
        anonimo = Cliente(self.banco, ip="198.51.100.20")
        for m, c in (("GET", "/api/documento"), ("DELETE", "/api/conta"), ("GET", "/api/historico"), ("POST", "/api/2fa/iniciar")):
            self.assertEqual(anonimo(m, c, prova=self.prova)[0], 401, c)     # sem sessão
            self.assertEqual(self.api(m, c)[0], 403, c)                       # sem prova
            self.con.execute("DELETE FROM limites")

    def test_isolamento_entre_contas(self):
        self.gravar(0)
        beto = Cliente(self.banco, ip="198.51.100.21")
        pv = prova()
        self.cadastrar(beto, OUTRO, pv, nome="Beto")
        self.assertEqual(beto("GET", "/api/documento", prova=pv)[0], 404)            # só vê o próprio (vazio)
        self.assertEqual(beto("GET", "/api/documento", prova=self.prova)[0], 403)    # a prova da Ana não serve
        # e-mail no corpo/cabeçalho não muda a identidade (vem só da sessão)
        st, _ = beto("PUT", "/api/documento", {"versaoAnterior": 1, "conteudo": conteudo(), "email": EMAIL}, prova=pv)
        self.assertEqual(st, 409)
        self.assertEqual(self.api("GET", "/api/documento", prova=self.prova)[1]["versao"], 1)

    def test_versoes_e_conflito(self):
        c1 = conteudo()
        self.assertEqual(self.gravar(0, c1), (200, {"versao": 1}))
        self.assertEqual(self.gravar(0)[0], 409)
        self.assertEqual(self.gravar(1)[1], {"versao": 2})
        self.assertEqual(self.gravar(1)[0], 409)
        st, d = self.api("GET", "/api/documento", prova=self.prova)
        self.assertEqual((st, d["versao"]), (200, 2))

    def test_conteudo_invalido_e_grande(self):
        for c in ("não-base64", b64(b"\x01" + os.urandom(40)), b64(b"\x02" + os.urandom(5)), 123, None, ""):
            self.assertEqual(self.api("PUT", "/api/documento", {"versaoAnterior": 0, "conteudo": c}, prova=self.prova)[0], 400, c)
        for va in (-1, "1", True, 2**60):
            self.assertEqual(self.api("PUT", "/api/documento", {"versaoAnterior": va, "conteudo": conteudo()}, prova=self.prova)[0], 400)
        self.assertEqual(self.gravar(0, "A" * (nucleo.LIMITE_CONTEUDO + 4)), (413, {"erro": "DOCUMENT_TOO_LARGE"}))

    def test_corpo_invalido_nao_consome_tentativa(self):
        self.assertEqual(self.api("PUT", "/api/documento", "{quebrado", prova=prova())[0], 400)
        self.assertIsNone(self.con.execute("SELECT 1 FROM limites WHERE chave LIKE 'login|%'").fetchone())

    def test_tipo_de_conteudo_e_csrf(self):
        st, _ = self.api("PUT", "/api/documento", json.dumps({"versaoAnterior": 0, "conteudo": conteudo()}),
                         prova=self.prova, cab={"Content-Type": "text/plain"})
        self.assertEqual(st, 415)
        for cab in ({"Origin": "https://evil.exemplo.com"}, {"Sec-Fetch-Site": "cross-site"}):
            self.assertEqual(self.api("PUT", "/api/documento", {"versaoAnterior": 0, "conteudo": conteudo()}, prova=self.prova, cab=cab)[0], 403)
        st, _ = self.api("POST", "/api/sessao", {"email": EMAIL, "prova": self.prova}, cab={"Origin": "https://evil.exemplo.com"})
        self.assertEqual(st, 403)                                           # login CSRF

    def test_historico_a_cada_10_minutos(self):
        self.gravar(0)
        self.gravar(1)
        self.gravar(2)
        self.assertEqual(self.con.execute("SELECT count(*) FROM historico").fetchone()[0], 1)
        self.con.execute("UPDATE historico SET criado_em = '2000-01-01T00:00:00.000Z'")
        self.gravar(3)
        st, h = self.api("GET", "/api/historico", prova=self.prova)
        self.assertEqual([v["versao"] for v in h["versoes"]], [3, 1])

    def test_troca_de_senha_encerra_outras_sessoes(self):
        celular = Cliente(self.banco, ip="198.51.100.30")
        self.entrar(celular)
        self.gravar(0)
        nova, c = prova(), conteudo()
        st, b = self.api("PUT", "/api/conta/senha", {"sal": b64(os.urandom(16)), "iteracoes": 600000, "prova": nova,
                                                      "conteudo": c, "versaoAnterior": 1}, prova=self.prova)
        self.assertEqual((st, b), (200, {"versao": 2}))
        self.assertEqual(celular("GET", "/api/sessao")[0], 204)              # o outro dispositivo saiu
        self.assertEqual(self.api("GET", "/api/documento", prova=self.prova)[0], 403)
        self.assertEqual(self.api("GET", "/api/documento", prova=nova)[1]["conteudo"], c)
        self.assertEqual(self.con.execute("SELECT count(*) FROM historico").fetchone()[0], 0)

    def test_troca_de_senha_com_conflito_nao_muda_nada(self):
        self.gravar(0)
        antes = tuple(self.con.execute("SELECT sal, verificador FROM contas").fetchone())
        st, b = self.api("PUT", "/api/conta/senha", {"sal": b64(os.urandom(16)), "iteracoes": 600000, "prova": prova(),
                                                      "conteudo": conteudo(), "versaoAnterior": 5}, prova=self.prova)
        self.assertEqual((st, b), (409, {"erro": "DATA_CHANGED"}))
        self.assertEqual(tuple(self.con.execute("SELECT sal, verificador FROM contas").fetchone()), antes)
        self.assertEqual(self.con.execute("SELECT count(*) FROM guarda").fetchone()[0], 0)

    def test_apagar_dados(self):
        self.gravar(0)
        st, b = self.api("POST", "/api/documento/apagar", {"versaoAnterior": 1, "conteudo": conteudo()}, prova=self.prova)
        self.assertEqual((st, b), (200, {"versao": 2}))
        self.assertEqual(self.api("GET", "/api/sessao")[0], 200)             # login continua

    def test_excluir_conta(self):
        self.gravar(0)
        self.assertEqual(self.api("DELETE", "/api/conta", prova=prova())[0], 403)
        self.con.execute("DELETE FROM limites")
        self.assertEqual(self.api("DELETE", "/api/conta", prova=self.prova)[0], 204)
        self.assertNotIn("__Host-zozo", self.api.cookies)
        for t in ("contas", "documentos", "historico", "sessoes"):
            self.assertEqual(self.con.execute(f"SELECT count(*) FROM {t} WHERE email = ?", (EMAIL,)).fetchone()[0], 0, t)


class Teste2FA(Base):
    def codigo(self, cli=None, delta=0):
        linha = self.con.execute("SELECT totp_segredo, totp_pendente FROM contas WHERE email = ?", (EMAIL,)).fetchone()
        seg = totp.decifrar(linha[0] or linha[1], SEGREDO)
        return totp.codigo(seg, (cli or self.api).agora // 30 + delta)

    def ativar(self):
        st, b = self.api("POST", "/api/2fa/iniciar", prova=self.prova)
        self.assertEqual(st, 200)
        self.assertTrue(b["uri"].startswith("otpauth://totp/"))
        st, _ = self.api("POST", "/api/2fa/confirmar", {"codigo": self.codigo()}, prova=self.prova)
        self.assertEqual(st, 200)
        return b["chave"]

    def test_ativacao_e_segredo_cifrado(self):
        self.api("POST", "/api/2fa/iniciar", prova=self.prova)
        self.assertEqual(self.api("POST", "/api/2fa/confirmar", {"codigo": "000000"}, prova=self.prova)[1]["erro"], "CODE_INVALID")
        st, _ = self.api("POST", "/api/2fa/confirmar", {"codigo": self.codigo()}, prova=self.prova)
        self.assertEqual(st, 200)
        self.assertTrue(self.api("GET", "/api/sessao")[1]["doisFatores"])
        bruto = self.con.execute("SELECT totp_segredo FROM contas WHERE email = ?", (EMAIL,)).fetchone()[0]
        self.assertEqual(len(base64.b64decode(bruto)), 16 + 20 + 16)        # nonce + segredo cifrado + etiqueta
        self.assertEqual(self.api("POST", "/api/2fa/iniciar", prova=self.prova)[1]["erro"], "2FA_ALREADY_ON")

    def test_login_com_2fa(self):
        self.ativar()
        cel = Cliente(self.banco, ip="198.51.100.40")
        cel.agora = T0 + 60
        st, b = self.entrar(cel)
        self.assertEqual((st, b), (200, {"doisFatores": True}))             # sem envelope antes do código
        self.assertEqual(cel("GET", "/api/sessao")[0], 204)                 # sessão parcial não vale
        self.assertEqual(cel("GET", "/api/documento", prova=self.prova)[0], 401)
        parcial = dict(cel.cookies)
        self.assertEqual(cel("POST", "/api/sessao/2fa", {"codigo": "000000"})[1]["erro"], "CODE_INVALID")
        st, b = cel("POST", "/api/sessao/2fa", {"codigo": self.codigo(cel)})
        self.assertEqual((st, b["doisFatores"]), (200, True))
        self.assertNotEqual(cel.cookies, parcial)                           # identificador novo após autenticar
        self.assertEqual(cel("GET", "/api/sessao")[0], 200)
        # o mesmo código não serve de novo (outro dispositivo)
        tab = Cliente(self.banco, ip="198.51.100.41")
        tab.agora = cel.agora
        self.entrar(tab)
        self.assertEqual(tab("POST", "/api/sessao/2fa", {"codigo": self.codigo(cel)})[0], 401)

    def test_codigo_bloqueia_apos_5_erros(self):
        self.ativar()
        cel = Cliente(self.banco, ip="198.51.100.42")
        cel.agora = T0 + 60
        self.entrar(cel)
        for _ in range(5):
            st, b = cel("POST", "/api/sessao/2fa", {"codigo": "000000"})
        self.assertEqual(b["espera"], nucleo.BLOQUEIO_1_S)
        self.assertEqual(cel("POST", "/api/sessao/2fa", {"codigo": self.codigo(cel)})[0], 429)

    def test_senha_certa_com_2fa_nao_acumula_bloqueio(self):
        self.ativar()
        cel = Cliente(self.banco, ip="198.51.100.45")
        for _ in range(nucleo.BLOQUEIO_1 + 2):                             # desiste na tela do código várias vezes
            self.assertEqual(self.entrar(cel), (200, {"doisFatores": True}))

    def test_sessao_parcial_expira(self):
        self.ativar()
        cel = Cliente(self.banco, ip="198.51.100.43")
        self.entrar(cel)
        cel.agora += nucleo.SESSAO_2FA_S + 1
        self.assertEqual(cel("POST", "/api/sessao/2fa", {"codigo": self.codigo(cel)})[0], 401)

    def test_desativar_exige_codigo_atual(self):
        self.ativar()
        self.api.agora += 60                                                 # o código da ativação não vale de novo
        # sessão + prova guardadas não bastam: precisa de um código atual do aplicativo
        self.assertEqual(self.api("POST", "/api/2fa/desativar", {}, prova=self.prova)[1]["erro"], "CODE_INVALID")
        self.assertEqual(self.api("POST", "/api/2fa/desativar", {"codigo": "１２３４５６"}, prova=self.prova)[1]["erro"], "CODE_INVALID")
        self.assertEqual(self.api("POST", "/api/2fa/desativar", {"codigo": self.codigo()}, prova=prova())[0], 403)    # e a senha
        self.con.execute("DELETE FROM limites")
        self.assertEqual(self.api("POST", "/api/2fa/desativar", {"codigo": self.codigo()}, prova=self.prova)[1], {"doisFatores": False})
        self.assertFalse(self.entrar(Cliente(self.banco, ip="198.51.100.44"))[1]["doisFatores"])

    def test_codigo_com_digitos_unicode_nao_quebra(self):
        self.ativar()
        cel = Cliente(self.banco, ip="198.51.100.46")
        cel.agora = T0 + 60
        self.entrar(cel)
        self.assertEqual(cel("POST", "/api/sessao/2fa", {"codigo": "１２３４５６"}), (401, {"erro": "CODE_INVALID"}))


class TesteDiversos(Base):
    def test_sem_segredo_nega_tudo(self):
        for cfg in ({}, {"SEGREDO": "curto"}):
            cli = Cliente(self.banco, config=cfg)
            self.assertEqual(cli("GET", "/api/publico")[0], 503)

    def test_publico(self):
        self.assertEqual(self.api("GET", "/api/publico"), (200, {"turnstile": None, "google": False}))
        cli = Cliente(self.banco, config=dict(CONFIG, TURNSTILE_SITE_KEY="0x4AAA"))
        self.assertEqual(cli("GET", "/api/publico")[1], {"turnstile": "0x4AAA", "google": False})

    def test_senha_vazada_k_anonimato(self):
        st, b = self.api("GET", "/api/senha-vazada/0018a")
        self.assertEqual(st, 200)
        self.assertIn("0018A45C4D1DEF81644B54AB7F969B88D65", b["lista"])
        url, cab = self.api.servicos.chamadas[-1]
        self.assertEqual((url, cab.get("Add-Padding")), ("https://api.pwnedpasswords.com/range/0018A", "true"))
        for ruim in ("0018", "0018AB", "../x", "ZZZZZ"):
            self.assertEqual(self.api("GET", "/api/senha-vazada/" + ruim)[0], 400)

    def test_rota_inexistente_erro_interno_e_request_id(self):
        self.assertEqual(self.api("GET", "/api/nada")[0], 404)
        self.assertEqual(self.api("PATCH", "/api/documento")[0], 404)
        self.assertRegex(self.api.ultima.cabecalhos["X-Request-Id"], r"^[0-9a-f]{16}$")

        class Quebrado(BancoSqlite):
            async def primeiro(self, *a):
                raise RuntimeError("detalhe interno")
        st, b = Cliente(Quebrado(self.con))("GET", "/api/conta/parametros?email=" + EMAIL)
        self.assertEqual((st, b), (500, {"erro": "STORAGE_UNAVAILABLE"}))   # sem detalhes técnicos

    def test_logs_sem_segredos(self):
        linhas = []
        h = {"Host": "zozo.exemplo.com", "CF-Connecting-IP": "203.0.113.7", "Content-Type": "application/json"}
        p = nucleo.Pedido("POST", "https://zozo.exemplo.com/api/sessao", h, json.dumps({"email": EMAIL, "prova": self.prova}))
        rodar(nucleo.atender(p, self.banco, FakeServicos(), CONFIG, log=linhas.append, agora=T0))
        texto = "\n".join(linhas)
        self.assertIn('"evento": "login"', texto)
        for segredo in (EMAIL, self.prova, "203.0.113.7", SEGREDO):
            self.assertNotIn(segredo, texto)


class TesteGoogle(Base):
    CID = "cliente-123.apps.googleusercontent.com"

    def setUp(self):
        super().setUp()
        google._cache.update(chaves=None, em=0.0)
        self.cfg = dict(CONFIG, GOOGLE_CLIENT_ID=self.CID, GOOGLE_CLIENT_SECRET="segredo-google", TURNSTILE_SECRET="t")
        self.cli = Cliente(self.banco, config=self.cfg, ip="192.0.2.80")

    def iniciar(self):
        st, _ = self.cli("GET", "/api/google/inicio")
        r = self.cli.ultima
        self.assertEqual(st, 302)
        local = r.cabecalhos["Location"]
        self.assertTrue(local.startswith(google.AUTORIZAR + "?"))
        q = {k: v[0] for k, v in parse_qs(local.split("?", 1)[1]).items()}
        self.assertEqual((q["code_challenge_method"], q["redirect_uri"]), ("S256", "https://zozo.exemplo.com/api/google/retorno"))
        self.assertIn("SameSite=Lax", r.cabecalhos["Set-Cookie"])
        return q

    def token(self, **extra):
        c = {"iss": "https://accounts.google.com", "aud": self.CID, "exp": T0 + 300, "email": EMAIL,
             "email_verified": True, "given_name": "Ana", "nonce": self.q["nonce"]}
        c.update(extra)
        return assinar({k: v for k, v in c.items() if v is not None}, kid="g1")

    def voltar(self, token, state=None):
        self.cli.servicos.google_token = token
        self.cli("GET", "/api/google/retorno?code=abc&state=" + (state or self.q["state"]))
        return self.cli.ultima.cabecalhos["Location"]

    def test_publico_e_sem_configuracao(self):
        self.assertFalse(self.api("GET", "/api/publico")[1]["google"])
        self.assertTrue(self.cli("GET", "/api/publico")[1]["google"])
        self.api("GET", "/api/google/inicio")
        self.assertEqual(self.api.ultima.cabecalhos["Location"], "/?google=indisponivel")

    def test_google_confirma_o_email_da_conta(self):
        self.assertEqual(self.con.execute("SELECT email_verificado FROM contas WHERE email = ?", (EMAIL,)).fetchone()[0], 0)
        self.q = self.iniciar()
        self.voltar(self.token())
        self.assertEqual(self.entrar(self.cli)[0], 200)                      # senha certa + Google
        self.assertEqual(self.con.execute("SELECT email_verificado FROM contas WHERE email = ?", (EMAIL,)).fetchone()[0], 1)
        # cadastro feito pelo Google já nasce confirmado
        self.q = self.iniciar()
        self.voltar(self.token(email=OUTRO, given_name="Beto"))
        self.cadastrar(self.cli, OUTRO, prova(), nome="Beto")
        self.assertEqual(self.con.execute("SELECT email_verificado FROM contas WHERE email = ?", (OUTRO,)).fetchone()[0], 1)

    def test_fluxo_completo_dispensa_captcha(self):
        self.q = self.iniciar()
        self.assertEqual(self.voltar(self.token()), "/?google=ok")
        self.assertEqual(self.cli("GET", "/api/google/identidade")[1], {"email": EMAIL, "nome": "Ana", "contaExiste": True})
        troca = next(c for u, c in self.cli.servicos.chamadas if u == google.TOKEN)
        self.assertEqual(troca["grant_type"], "authorization_code")
        self.assertTrue(troca["code_verifier"])
        for _ in range(4):                       # da 4ª em diante pediria CAPTCHA: o Google já confirmou a pessoa
            self.assertEqual(self.entrar(self.cli, pv=prova())[0], 401)
        self.assertEqual(self.entrar(self.cli)[0], 200)     # a senha continua obrigatória (é a chave dos dados)

    def test_ataques_recusados(self):
        for extra in ({"aud": "outro-app"}, {"iss": "https://evil.exemplo.com"}, {"email_verified": False},
                      {"nonce": "outro"}, {"exp": T0 - 3600}, {"email": None}):
            self.q = self.iniciar()
            self.assertEqual(self.voltar(self.token(**extra)), "/?google=erro", extra)
        self.q = self.iniciar()
        n2, _, d2 = _chave_rsa()                 # assinatura de outra chave
        forjado = assinar({"iss": "https://accounts.google.com", "aud": self.CID, "exp": T0 + 300, "email": EMAIL,
                           "email_verified": True, "nonce": self.q["nonce"]}, kid="g1", d=d2, n=n2)
        self.assertEqual(self.voltar(forjado), "/?google=erro")
        self.q = self.iniciar()
        self.assertEqual(self.voltar(self.token(), state="state-de-outro-site"), "/?google=erro")      # CSRF
        self.assertEqual(self.cli("GET", "/api/google/identidade")[0], 404)

    def test_cookie_adulterado_e_vencido(self):
        self.q = self.iniciar()
        self.voltar(self.token())
        nome = "__Host-zozo_google"
        valor = self.cli.cookies[nome]
        self.cli.cookies[nome] = valor[:-3] + "AAA"
        self.assertEqual(self.cli("GET", "/api/google/identidade")[0], 404)
        self.cli.cookies[nome] = valor
        self.cli.agora += google.VALIDADE_S + 1
        self.assertEqual(self.cli("GET", "/api/google/identidade")[0], 404)

    def test_rsa_rejeita_chave_pequena_e_lixo(self):
        self.assertFalse(google.verificar_rs256({"kty": "RSA", "n": _int_b64u(2**1023 + 1), "e": "AQAB"}, b"x", b"\x00" * 128))
        self.assertFalse(google.verificar_rs256({"kty": "EC"}, b"x", b"\x00" * 256))
        for lixo in (None, "", "a" * 20000):
            with self.assertRaises(ValueError):
                google.b64url(lixo)

    def test_cadastro_com_google_sem_captcha(self):
        self.q = self.iniciar()
        self.voltar(self.token(email=OUTRO, given_name="Beto"))
        self.assertEqual(self.cli("GET", "/api/google/identidade")[1]["contaExiste"], False)
        self.assertEqual(self.cadastrar(self.cli, OUTRO, prova(), nome="Beto")[0], 201)


def prova_da_senha(senha, sal_b64, iteracoes=600000):
    """Mesma derivação do navegador (host-web.js): PBKDF2-SHA256 → HKDF-SHA256 (sal zerado, info zozo/prova/v2)."""
    mestre = hashlib.pbkdf2_hmac("sha256", senha.encode("utf-8"), base64.b64decode(sal_b64), iteracoes, 32)
    prk = hmac.new(b"\x00" * 32, mestre, hashlib.sha256).digest()
    return b64(hmac.new(prk, b"zozo/prova/v2\x01", hashlib.sha256).digest())


class TesteDemo(Base):
    """Conta de demonstração pública (senha zozo1234): entra, mas não grava nem altera nada no servidor."""
    PROVA = None

    def setUp(self):
        super().setUp()
        if TesteDemo.PROVA is None:                                         # PBKDF2 de 600 mil iterações: uma vez só
            sal = self.con.execute("SELECT sal FROM contas WHERE email = ?", (DEMO,)).fetchone()[0]
            TesteDemo.PROVA = prova_da_senha("zozo1234", sal)
        self.demo = Cliente(self.banco, ip="198.51.100.60")

    def test_senha_publica_entra_com_recursos(self):
        st, s = self.entrar(self.demo, email=DEMO, pv=self.PROVA)
        self.assertEqual((st, s["demo"], s["recursos"]), (200, True, {"perfis": True, "boleto": True, "pix": True, "cambio": True}))
        self.assertTrue(self.demo("GET", "/api/sessao")[1]["demo"])
        self.assertEqual(self.entrar(Cliente(self.banco, ip="198.51.100.61"), email=DEMO, pv=prova())[0], 401)   # senha errada

    def test_somente_leitura(self):
        self.entrar(self.demo, email=DEMO, pv=self.PROVA)
        consulta = "SELECT nome, sal, verificador, totp_segredo, totp_pendente FROM contas WHERE email = ?"
        antes = tuple(self.con.execute(consulta, (DEMO,)).fetchone())
        for m, c, corpo in (("PUT", "/api/documento", {"versaoAnterior": 0, "conteudo": conteudo()}),
                            ("GET", "/api/documento", None), ("GET", "/api/historico", None),
                            ("PUT", "/api/conta/nome", {"nome": "Invasor"}),
                            ("PUT", "/api/conta/senha", {"sal": b64(os.urandom(16)), "iteracoes": 600000, "prova": prova(),
                                                         "conteudo": conteudo(), "versaoAnterior": 0}),
                            ("POST", "/api/documento/apagar", {"versaoAnterior": 0, "conteudo": conteudo()}),
                            ("DELETE", "/api/conta", None), ("POST", "/api/2fa/iniciar", None),
                            ("POST", "/api/2fa/confirmar", {"codigo": "123456"}), ("POST", "/api/2fa/desativar", None)):
            self.assertEqual(self.demo(m, c, corpo, prova=self.PROVA), (403, {"erro": "DEMO_READ_ONLY"}), c)
        self.assertEqual(tuple(self.con.execute(consulta, (DEMO,)).fetchone()), antes)
        self.assertEqual(self.con.execute("SELECT count(*) FROM documentos WHERE email = ?", (DEMO,)).fetchone()[0], 0)
        self.assertEqual(self.demo("GET", "/api/sessao")[0], 200)              # continua logada
        self.assertEqual(self.demo("DELETE", "/api/sessao")[0], 204)           # e pode sair

    def test_nao_pode_ser_recadastrada(self):
        cli = Cliente(self.banco, ip="198.51.100.62")
        self.assertEqual(self.cadastrar(cli, DEMO.upper(), prova())[1], {"erro": "EMAIL_IN_USE"})
        self.assertEqual(self.con.execute("SELECT count(*) FROM contas WHERE email = ?", (DEMO,)).fetchone()[0], 1)

    def test_sessoes_da_demo_tem_limite(self):
        original = nucleo.DEMO_SESSOES_MAX
        nucleo.DEMO_SESSOES_MAX = 3
        try:
            for i in range(6):
                self.assertEqual(self.entrar(Cliente(self.banco, ip=f"198.51.101.{i}"), email=DEMO, pv=self.PROVA)[0], 200)
        finally:
            nucleo.DEMO_SESSOES_MAX = original
        self.assertEqual(self.con.execute("SELECT count(*) FROM sessoes WHERE email = ?", (DEMO,)).fetchone()[0], 3)
        # sessões da demo paradas há mais de 6 h também saem
        velho = Cliente(self.banco, ip="198.51.101.50")
        self.entrar(velho, email=DEMO, pv=self.PROVA)
        novo = Cliente(self.banco, ip="198.51.101.51")
        novo.agora = T0 + nucleo.DEMO_OCIOSA_S + 1
        self.entrar(novo, email=DEMO, pv=self.PROVA)
        self.assertEqual(velho("GET", "/api/sessao")[0], 204)
        self.assertEqual(self.con.execute("SELECT count(*) FROM sessoes WHERE email = ?", (DEMO,)).fetchone()[0], 1)

    def test_cota_das_rotas_de_dados(self):
        original = nucleo.COTA_DADOS
        nucleo.COTA_DADOS = 5
        try:
            st = [self.api("GET", "/api/documento", prova=self.prova)[0] for _ in range(7)]
        finally:
            nucleo.COTA_DADOS = original
        self.assertEqual(st[:5], [404] * 5)                                  # conta sem documento ainda
        self.assertEqual(st[5:], [429, 429])
        self.api.agora += nucleo.COTA_JANELA_S
        self.assertEqual(self.api("GET", "/api/documento", prova=self.prova)[0], 404)

    def test_logins_por_ip_tem_limite(self):
        cli = Cliente(self.banco, ip="198.51.100.70")
        st = [self.entrar(cli, email=DEMO, pv=self.PROVA)[0] for _ in range(nucleo.ENTRADAS_POR_IP + 1)]
        self.assertEqual(st.count(200), nucleo.ENTRADAS_POR_IP)
        self.assertEqual(st[-1], 429)                                       # nem a senha certa entra agora
        self.assertEqual(self.entrar(Cliente(self.banco, ip="198.51.100.71"))[0], 200)   # outro IP continua
        cli.agora += nucleo.ENTRADA_JANELA_S
        self.assertEqual(self.entrar(cli, email=DEMO, pv=self.PROVA)[0], 200)

    def test_recursos_exigem_email_confirmado(self):
        cfg = dict(CONFIG, RECURSOS_AVANCADOS=EMAIL)
        cli = Cliente(self.banco, config=cfg, ip="198.51.100.66")
        # cadastrou o e-mail da lista sem confirmar que é dono dele: não ganha nada
        self.assertFalse(self.entrar(cli)[1]["recursos"]["perfis"])
        self.assertEqual(self.con.execute("SELECT email_verificado FROM contas WHERE email = ?", (EMAIL,)).fetchone()[0], 0)

    def test_recursos_so_para_a_lista(self):
        self.con.execute("UPDATE contas SET email_verificado = 1 WHERE email = ?", (EMAIL,))
        self.assertFalse(self.entrar()[1]["recursos"]["perfis"])
        cfg = dict(CONFIG, RECURSOS_AVANCADOS=f" outro@exemplo.com , {EMAIL.upper()} ")
        cli = Cliente(self.banco, config=cfg, ip="198.51.100.63")
        st, s = self.entrar(cli)
        self.assertEqual((st, s["recursos"], s["demo"]), (200, {"perfis": True, "boleto": True, "pix": True, "cambio": True}, False))
        self.assertTrue(cli("GET", "/api/sessao")[1]["recursos"]["pix"])
        # a lista não dá privilégio nenhum além disso: o documento continua exigindo a prova da própria conta
        self.assertEqual(cli("GET", "/api/documento", prova=prova())[0], 403)

    def test_cambio_so_para_a_lista_e_email_confirmado(self):
        cfg = dict(CONFIG, RECURSOS_CAMBIO=f"outro@exemplo.com, {EMAIL}")
        cli = Cliente(self.banco, config=cfg, ip="198.51.100.67")
        self.assertFalse(self.entrar(cli)[1]["recursos"]["cambio"])          # e-mail não confirmado: nada
        self.con.execute("UPDATE contas SET email_verificado = 1 WHERE email = ?", (EMAIL,))
        st, s = self.entrar(cli)
        self.assertEqual((st, s["recursos"]), (200, {"perfis": False, "boleto": False, "pix": False, "cambio": True}))  # só o câmbio
        cli2 = Cliente(self.banco, config=dict(CONFIG, RECURSOS_CAMBIO="outro@exemplo.com"), ip="198.51.100.68")
        self.assertFalse(self.entrar(cli2)[1]["recursos"]["cambio"])         # fora da lista

    def test_segredo_dos_recursos_digitado_de_varios_jeitos(self):
        self.con.execute("UPDATE contas SET email_verificado = 1 WHERE email = ?", (EMAIL,))
        for valor in (f"﻿{EMAIL}\r\n", f'"{EMAIL}"', f"outro@exemplo.com; {EMAIL}", f"outro@exemplo.com\n{EMAIL.upper()}"):
            cli = Cliente(self.banco, config=dict(CONFIG, RECURSOS_AVANCADOS=valor), ip="198.51.100.64")
            self.assertTrue(self.entrar(cli)[1]["recursos"]["perfis"], repr(valor))
        cli = Cliente(self.banco, config=dict(CONFIG, RECURSOS_AVANCADOS="ana@exemplo.co"), ip="198.51.100.65")
        self.assertFalse(self.entrar(cli)[1]["recursos"]["perfis"])           # e-mail parecido não vale


CONFIG_EMAIL = dict(CONFIG, RESEND_API_KEY="re_teste_123", EMAIL_REMETENTE="ZoZo <nao-responda@usezozo.com.br>",
                    URL_PUBLICA="https://usezozo.com.br")


class TesteEmail(unittest.TestCase):
    """Confirmação de e-mail (Resend) e avisos de segurança."""

    def setUp(self):
        self.con = conectar()
        self.addCleanup(self.con.close)
        self.banco = BancoSqlite(self.con)
        self.serv = FakeServicos()
        self.cli = Cliente(self.banco, self.serv, CONFIG_EMAIL, ip="198.51.100.90")
        self.cli.agora = time.time()                  # o banco usa o relógio real (criado_em)
        self.sal, self.pv = b64(os.urandom(16)), prova()

    def cadastrar(self, cli=None, email=EMAIL, pv=None, **extra):
        return (cli or self.cli)("POST", "/api/conta", dict({"email": email, "nome": "Ana <b>", "sal": self.sal, "iteracoes": 600000,
                                                              "prova": pv or self.pv}, **extra))

    def entrar(self, cli=None, email=EMAIL, pv=None):
        return (cli or self.cli)("POST", "/api/sessao", {"email": email, "prova": pv or self.pv})

    def token(self, i=-1):
        texto = self.serv.emails[i]["text"]
        return texto.split("#confirmar=", 1)[1].split()[0]

    def test_cadastro_fica_pendente_ate_confirmar(self):
        st, r = self.cadastrar()
        self.assertEqual((st, r), (202, {"confirmar": True}))
        self.assertNotIn("Set-Cookie", self.cli.ultima.cabecalhos)                     # sem sessão antes de confirmar
        self.assertEqual(tuple(self.con.execute("SELECT confirmacao_pendente, email_verificado FROM contas WHERE email = ?", (EMAIL,)).fetchone()), (1, 0))
        m = self.serv.emails[0]
        self.assertEqual((m["to"], m["from"], m["subject"]), ([EMAIL], "ZoZo <nao-responda@usezozo.com.br>", "Confirme seu e-mail no ZoZo"))
        self.assertIn("Ana &lt;b&gt;", m["html"])                                      # nome escapado no HTML
        url, cab = [c for c in self.serv.chamadas if c[0] == emails.RESEND_URL][0]
        self.assertEqual(cab["Authorization"], "Bearer re_teste_123")
        token = self.token()
        guardado = self.con.execute("SELECT hash FROM tokens_email").fetchone()[0]
        self.assertNotEqual(guardado, token)                                            # o banco guarda só o hash
        self.assertEqual(self.entrar()[1]["erro"], "EMAIL_NOT_CONFIRMED")
        self.assertEqual(self.entrar(pv=prova())[1]["erro"], "INVALID_CREDENTIALS")    # senha errada: resposta genérica
        self.assertEqual(self.cli("POST", "/api/email/confirmar", {"token": token}), (200, {"ok": True}))
        self.assertEqual(self.entrar()[0], 200)
        self.assertEqual(tuple(self.con.execute("SELECT confirmacao_pendente, email_verificado FROM contas WHERE email = ?", (EMAIL,)).fetchone()), (0, 1))
        self.assertEqual(self.cli("POST", "/api/email/confirmar", {"token": token})[1]["erro"], "TOKEN_INVALID")   # uso único
        texto = " ".join(self.cli.logs)
        self.assertNotIn(EMAIL, texto)
        self.assertNotIn(token, texto)

    def test_link_usa_url_publica_e_nao_o_host(self):
        # pedido que chegou com o Host (e a URL) de outro site: o link do e-mail continua sendo o do ZoZo
        corpo = json.dumps({"email": EMAIL, "nome": "Ana", "sal": self.sal, "iteracoes": 600000, "prova": self.pv})
        pedido = nucleo.Pedido("POST", "https://phishing.exemplo/api/conta",
                               {"Host": "phishing.exemplo", "Content-Type": "application/json", "CF-Connecting-IP": "198.51.100.96"}, corpo)
        r = rodar(nucleo.atender(pedido, self.banco, self.serv, CONFIG_EMAIL, log=lambda *_: None, agora=time.time()))
        self.assertEqual(r.status, 202)
        texto = self.serv.emails[0]["text"]
        self.assertIn("https://usezozo.com.br/#confirmar=", texto)
        self.assertNotIn("phishing", texto)

    def test_resposta_igual_para_email_ja_cadastrado(self):
        self.cadastrar()
        self.cli("POST", "/api/email/confirmar", {"token": self.token()})
        antes = tuple(self.con.execute("SELECT verificador FROM contas WHERE email = ?", (EMAIL,)).fetchone())
        outro = Cliente(self.banco, self.serv, CONFIG_EMAIL, ip="198.51.100.91")
        outro.agora = self.cli.agora
        st, r = self.cadastrar(outro, pv=prova())
        self.assertEqual((st, r), (202, {"confirmar": True}))                          # não revela que já existe
        self.assertEqual(self.serv.emails[-1]["subject"], "Tentativa de cadastro no ZoZo")
        self.assertEqual(tuple(self.con.execute("SELECT verificador FROM contas WHERE email = ?", (EMAIL,)).fetchone()), antes)

    def test_cadastro_pendente_recente_nao_e_sobrescrito(self):
        self.cadastrar()
        intruso = prova()
        self.cadastrar(pv=intruso)                                                      # outra senha antes da confirmação
        self.cli("POST", "/api/email/confirmar", {"token": self.token()})               # o link novo confirma a senha ORIGINAL
        self.assertEqual(self.entrar(pv=intruso)[0], 401)
        self.assertEqual(self.entrar()[0], 200)

    def test_link_vencido_ou_de_outra_senha(self):
        self.cadastrar()
        token = self.token()
        self.con.execute("UPDATE tokens_email SET expira = 1")
        self.assertEqual(self.cli("POST", "/api/email/confirmar", {"token": token})[1]["erro"], "TOKEN_INVALID")
        self.cli("POST", "/api/email/reenviar", {"email": EMAIL})
        novo = self.token()
        self.con.execute("UPDATE contas SET verificador = ? WHERE email = ?", ("f" * 64, EMAIL))   # senha mudou depois do link
        self.assertEqual(self.cli("POST", "/api/email/confirmar", {"token": novo})[1]["erro"], "TOKEN_INVALID")
        for ruim in ("", "curto", "x" * 200, "<script>alert(1)</script>xxxxxxxxxxxx", 123):
            self.assertEqual(self.cli("POST", "/api/email/confirmar", {"token": ruim})[0], 400, repr(ruim))

    def test_reenviar_sempre_igual_e_limitado(self):
        self.assertEqual(self.cli("POST", "/api/email/reenviar", {"email": "ninguem@exemplo.com"}), (202, {"ok": True}))
        self.assertEqual(self.serv.emails, [])                                          # sem conta pendente: nada enviado
        self.cadastrar()
        for _ in range(5):
            self.cli("POST", "/api/email/reenviar", {"email": EMAIL})
        self.assertEqual(len(self.serv.emails), nucleo.EMAILS_POR_CONTA)               # no máximo 3 por hora

    def test_falha_do_resend_nao_quebra_o_cadastro(self):
        self.serv.email_ok = False
        self.assertEqual(self.cadastrar()[0], 202)
        self.assertIn("email_falhou", " ".join(self.cli.logs))

    def test_aviso_de_senha_alterada(self):
        self.cadastrar()
        self.cli("POST", "/api/email/confirmar", {"token": self.token()})
        self.entrar()
        nova = prova()
        st, _ = self.cli("PUT", "/api/conta/senha", {"sal": b64(os.urandom(16)), "iteracoes": 600000, "prova": nova, "kdf": "argon2id-1",
                                                       "conteudo": conteudo(), "versaoAnterior": 0}, prova=self.pv)
        self.assertEqual(st, 200)
        self.assertEqual(self.serv.emails[-1]["subject"], "Sua senha do ZoZo foi alterada")
        self.assertEqual(self.con.execute("SELECT kdf FROM contas WHERE email = ?", (EMAIL,)).fetchone()[0], "argon2id-1")

    def test_sem_configuracao_o_cadastro_e_como_antes(self):
        cli = Cliente(self.banco, self.serv, dict(CONFIG_EMAIL, RESEND_API_KEY=""), ip="198.51.100.92")
        self.assertEqual(self.cadastrar(cli)[0], 201)
        self.assertEqual(self.serv.emails, [])
        cli = Cliente(self.banco, self.serv, dict(CONFIG_EMAIL, URL_PUBLICA="javascript:alert(1)"), ip="198.51.100.93")
        self.assertFalse(emails.ativo(cli.config))


class TesteKdf(Base):
    def test_kdf_argon2_no_cadastro_e_nos_parametros(self):
        cli = Cliente(self.banco, ip="198.51.100.94")
        st, _ = self.cadastrar(cli, OUTRO, prova(), kdf="argon2id-1")
        self.assertEqual(st, 201)
        self.assertEqual(cli("GET", "/api/conta/parametros?email=" + OUTRO)[1]["kdf"], "argon2id-1")
        self.assertEqual(self.api("GET", "/api/conta/parametros?email=" + EMAIL)[1]["kdf"], "pbkdf2")       # conta antiga
        # e-mail sem conta: parâmetros iguais aos de uma conta nova (não revela quem tem conta)
        self.assertEqual(self.api("GET", "/api/conta/parametros?email=ninguem@exemplo.com")[1]["kdf"], "argon2id-1")
        for ruim in ("md5", "", 1, "ARGON2ID-1"):
            st, r = self.cadastrar(Cliente(self.banco, ip="198.51.100.95"), "x" + str(len(str(ruim))) + "@exemplo.com", prova(), kdf=ruim)
            self.assertEqual((st, r["erro"]), (400, "INVALID_REQUEST"), repr(ruim))


class TestePedidoInvalido(Base):
    def test_query_com_campos_demais_e_url_quebrada(self):
        # auditoria F05: parse_qs(max_num_fields=20) lança ValueError — vira 400, nunca 500
        q = "&".join(f"c{i}=1" for i in range(21))
        st, r = self.api("GET", "/api/conta/parametros?" + q)
        self.assertEqual((st, r["erro"]), (400, "INVALID_REQUEST"))
        self.assertIn("X-Request-Id", self.api.ultima.cabecalhos)
        p = nucleo.Pedido("GET", "https://[::1/api/sessao", {})
        self.assertTrue(p.invalido)
        r = rodar(nucleo.atender(p, self.banco, FakeServicos(), CONFIG, log=lambda *_: None))
        self.assertEqual(r.status, 400)


class TesteMigracoes(unittest.TestCase):
    def test_0005_confirma_contas_existentes(self):
        con = sqlite3.connect(":memory:", isolation_level=None)
        self.addCleanup(con.close)
        con.execute("PRAGMA foreign_keys = ON")
        for nome in ("0001_inicial.sql", "0002_sessoes_2fa.sql", "0003_conta_demo.sql", "0004_envelope_fora_do_banco.sql"):
            con.executescript((MIGRACOES / nome).read_text(encoding="utf-8"))
        con.execute("INSERT INTO contas (email, nome, sal, iteracoes, verificador) VALUES (?, 'A', 'c2Fs', 600000, ?)", (EMAIL, "0" * 64))
        con.executescript((MIGRACOES / "0005_email_verificado.sql").read_text(encoding="utf-8"))
        self.assertEqual(con.execute("SELECT email_verificado FROM contas WHERE email = ?", (EMAIL,)).fetchone()[0], 1)
        con.execute("INSERT INTO contas (email, nome, sal, iteracoes, verificador) VALUES ('novo@exemplo.com', 'B', 'c2Fs', 600000, ?)", ("0" * 64,))
        self.assertEqual(con.execute("SELECT email_verificado FROM contas WHERE email = 'novo@exemplo.com'").fetchone()[0], 0)

    def test_0004_apaga_envelopes_antigos(self):
        con = sqlite3.connect(":memory:", isolation_level=None)
        self.addCleanup(con.close)
        con.execute("PRAGMA foreign_keys = ON")
        for nome in ("0001_inicial.sql", "0002_sessoes_2fa.sql", "0003_conta_demo.sql"):
            con.executescript((MIGRACOES / nome).read_text(encoding="utf-8"))
        con.execute("INSERT INTO contas (email, nome, sal, iteracoes, verificador) VALUES (?, 'A', 'c2Fs', 600000, ?)", (EMAIL, "0" * 64))
        con.execute("INSERT INTO sessoes (id, email, estado, envelope, criada, ultimo_uso) VALUES ('x', ?, 'ativa', 'segredo-antigo', 1, 1)", (EMAIL,))
        con.executescript((MIGRACOES / "0004_envelope_fora_do_banco.sql").read_text(encoding="utf-8"))
        self.assertEqual(con.execute("SELECT envelope FROM sessoes").fetchone()[0], "")

    def test_reaplicar_nao_faz_nada(self):
        con = conectar()
        self.addCleanup(con.close)
        aplicar_migracoes(con)
        aplicar_migracoes(con)
        self.assertEqual(con.execute("SELECT count(*) FROM d1_migrations").fetchone()[0], len(list(MIGRACOES.glob("*.sql"))))

    def test_0002_preserva_conta_e_documento_de_producao(self):
        con = sqlite3.connect(":memory:", isolation_level=None)
        self.addCleanup(con.close)
        con.row_factory = sqlite3.Row
        con.execute("PRAGMA foreign_keys = ON")
        con.executescript((MIGRACOES / "0001_inicial.sql").read_text(encoding="utf-8"))
        pv = prova()
        con.execute("INSERT INTO contas (email, nome, sal, iteracoes, verificador) VALUES (?, 'Lukas', ?, 600000, ?)",
                    (EMAIL, b64(os.urandom(16)), hashlib.sha256(base64.b64decode(pv)).hexdigest()))
        c = conteudo()
        con.execute("INSERT INTO documentos (email, versao, conteudo) VALUES (?, 3, ?)", (EMAIL, c))
        con.execute("INSERT INTO tentativas (email, falhas, ultima) VALUES (?, 2, 1)", (EMAIL,))
        # produção: a 0001 já está aplicada (sem registro) → o wrangler aplica as duas; a 0001 é idempotente
        aplicar_migracoes(con)
        cli = Cliente(BancoSqlite(con))
        self.assertEqual(cli("POST", "/api/sessao", {"email": EMAIL, "prova": pv})[0], 200)
        self.assertEqual(cli("GET", "/api/documento", prova=pv)[1], {"versao": 3, "conteudo": c})


if __name__ == "__main__":
    unittest.main()
