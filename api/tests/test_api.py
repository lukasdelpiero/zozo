"""
Testes da API do ZoZo (núcleo Python + banco SQLite com as mesmas migrações do D1).

    python -m unittest discover -s api/tests -v
"""
import asyncio
import base64
import hashlib
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

import acesso  # noqa: E402
import google  # noqa: E402
import nucleo  # noqa: E402
import totp  # noqa: E402
from banco_sqlite import MIGRACOES, BancoSqlite, aplicar_migracoes, conectar  # noqa: E402

EMAIL = "ana@exemplo.com"
OUTRO = "beto@exemplo.com"
DOMINIO = "time.cloudflareaccess.com"
AUD = "aud-123"
SEGREDO = "s" * 48
CONFIG = {"SEGREDO": SEGREDO, "ALLOWED_EMAILS": f"{EMAIL}, {OUTRO.upper()}"}
ACCESS_CONFIG = {"ACCESS_TEAM_DOMAIN": DOMINIO, "ACCESS_AUD": AUD, "ACCESS_EMAILS": f"{EMAIL}, {OUTRO.upper()}"}
T0 = 1_800_000_000          # "agora" fixo dos testes


def rodar(coro):
    return asyncio.run(coro)


# ---------------- RSA de teste (só para assinar tokens do Access nos testes) ----------------
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
    t = acesso._DIGEST_INFO_SHA256 + hashlib.sha256(f"{h}.{p}".encode()).digest()
    em = b"\x00\x01" + b"\xff" * (k - len(t) - 3) + b"\x00" + t
    s = pow(int.from_bytes(em, "big"), d, n).to_bytes(k, "big")
    return f"{h}.{p}.{_b64u(s)}"


def claims(**extra):
    agora = int(time.time())
    c = {"email": EMAIL, "aud": [AUD], "iss": f"https://{DOMINIO}", "exp": agora + 300, "iat": agora, "type": "app"}
    c.update(extra)
    return {k: v for k, v in c.items() if v is not None}


class FakeServicos:
    def __init__(self, chaves=None, captcha_ok=True, identidade=None):
        self.chaves = chaves if chaves is not None else [JWK]
        self.chamadas = []
        self.captcha_ok = captcha_ok
        self.identidade = identidade

    async def http_get(self, url, cabecalhos):
        self.chamadas.append((url, dict(cabecalhos)))
        if url.endswith("/cdn-cgi/access/certs"):
            return 200, json.dumps({"keys": self.chaves})
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

    async def access(self, _pedido):
        if isinstance(self.identidade, Exception):
            raise self.identidade
        return self.identidade


def limpar_cache():
    acesso._cache.update(chaves=None, em=0.0, dominio=None, ultima_recarga=0.0)


class TesteAcesso(unittest.TestCase):
    def setUp(self):
        limpar_cache()
        self.http = FakeServicos().http_get

    def ident(self, token, config=ACCESS_CONFIG):
        return rodar(acesso.identidade(token, config, self.http))

    def test_token_valido(self):
        self.assertEqual(self.ident(assinar(claims())), EMAIL)

    def test_email_permitido_maiusculas(self):
        self.assertEqual(self.ident(assinar(claims(email="Beto@Exemplo.com"))), OUTRO)

    def test_email_fora_da_lista(self):
        self.assertIsNone(self.ident(assinar(claims(email="intruso@exemplo.com"))))

    def test_expirado_sem_exp_nbf_futuro(self):
        self.assertIsNone(self.ident(assinar(claims(exp=int(time.time()) - 3600))))
        self.assertIsNone(self.ident(assinar(claims(exp=None))))
        self.assertIsNone(self.ident(assinar(claims(nbf=int(time.time()) + 3600))))

    def test_audiencia_e_emissor_errados(self):
        self.assertIsNone(self.ident(assinar(claims(aud=["outra"]))))
        self.assertIsNone(self.ident(assinar(claims(iss="https://outro.cloudflareaccess.com"))))

    def test_alg_none_e_hs256(self):
        self.assertIsNone(self.ident(assinar(claims(), alg="none")))
        self.assertIsNone(self.ident(assinar(claims(), alg="HS256")))

    def test_payload_adulterado_e_outra_chave(self):
        t = assinar(claims()).split(".")
        t[1] = _b64u(json.dumps(claims(email=OUTRO)).encode())
        self.assertIsNone(self.ident(".".join(t)))
        n2, _, d2 = _chave_rsa()
        self.assertIsNone(self.ident(assinar(claims(), d=d2, n=n2)))

    def test_lixo(self):
        for t in (None, "", "a.b", "a.b.c", "....", "x" * 20000):
            self.assertIsNone(self.ident(t))

    def test_rotacao_de_chave_recarrega(self):
        self.ident(assinar(claims()))
        fake = FakeServicos(chaves=[dict(JWK, kid="k2")])
        self.http = fake.http_get
        self.assertEqual(self.ident(assinar(claims(), kid="k2")), EMAIL)

    def test_configuracao_incompleta_nega(self):
        for cfg in ({**ACCESS_CONFIG, "ACCESS_TEAM_DOMAIN": "SEU-TIME.cloudflareaccess.com"},
                    {**ACCESS_CONFIG, "ACCESS_AUD": ""}, {**ACCESS_CONFIG, "ACCESS_EMAILS": ""},
                    {**ACCESS_CONFIG, "ACCESS_TEAM_DOMAIN": "evil.com"}):
            with self.assertRaises(acesso.ErroAcesso):
                self.ident(assinar(claims()), cfg)

    def test_rsa_rejeita_chave_pequena(self):
        self.assertFalse(acesso.verificar_rs256({"kty": "RSA", "n": _int_b64u(2**1023 + 1), "e": "AQAB"}, b"x", b"\x00" * 128))


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
        r = rodar(nucleo.atender(p, self.banco, self.servicos, self.config, log=lambda *_: None, agora=self.agora))
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
        self.assertEqual(set(self.sessao), {"email", "nome", "envelope", "doisFatores"})
        token = self.api.cookies["__Host-zozo"]
        guardado = self.con.execute("SELECT id FROM sessoes").fetchone()[0]
        self.assertEqual(guardado, hashlib.sha256(token.encode()).hexdigest())   # banco não guarda o token
        self.assertEqual(self.api("GET", "/api/sessao")[1]["email"], EMAIL)

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
        cli = Cliente(self.banco, config=dict(CONFIG, ALLOWED_EMAILS="*"), ip="198.51.100.9")
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
        self.assertEqual(self.con.execute("SELECT count(*) FROM contas").fetchone()[0], 1)


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
            self.assertEqual(self.con.execute(f"SELECT count(*) FROM {t}").fetchone()[0], 0, t)


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
        bruto = self.con.execute("SELECT totp_segredo FROM contas").fetchone()[0]
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

    def test_desativar(self):
        self.ativar()
        self.assertEqual(self.api("POST", "/api/2fa/desativar", prova=prova())[0], 403)    # exige a senha
        self.con.execute("DELETE FROM limites")
        self.assertEqual(self.api("POST", "/api/2fa/desativar", prova=self.prova)[1], {"doisFatores": False})
        self.assertFalse(self.entrar(Cliente(self.banco, ip="198.51.100.44"))[1]["doisFatores"])


class TesteDiversos(Base):
    def test_sem_segredo_nega_tudo(self):
        for cfg in ({}, {"SEGREDO": "curto"}):
            cli = Cliente(self.banco, config=cfg)
            self.assertEqual(cli("GET", "/api/publico")[0], 503)

    def test_ambiente_de_previa_exige_access(self):
        cfg = dict(CONFIG, EXIGIR_ACCESS="1")
        self.assertEqual(Cliente(self.banco, FakeServicos(identidade=None), cfg)("GET", "/api/publico"), (401, {"erro": "ACCESS_DENIED"}))
        self.assertEqual(Cliente(self.banco, FakeServicos(identidade=RuntimeError("x")), cfg)("GET", "/api/publico")[0], 503)
        self.assertEqual(Cliente(self.banco, FakeServicos(identidade="teste@exemplo.com"), cfg)("GET", "/api/publico")[0], 200)

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

    def test_cadastro_com_google_sem_captcha(self):
        self.q = self.iniciar()
        self.voltar(self.token(email=OUTRO, given_name="Beto"))
        self.assertEqual(self.cli("GET", "/api/google/identidade")[1]["contaExiste"], False)
        self.assertEqual(self.cadastrar(self.cli, OUTRO, prova(), nome="Beto")[0], 201)


class TesteMigracoes(unittest.TestCase):
    def test_reaplicar_nao_faz_nada(self):
        con = conectar()
        aplicar_migracoes(con)
        aplicar_migracoes(con)
        self.assertEqual(con.execute("SELECT count(*) FROM d1_migrations").fetchone()[0], len(list(MIGRACOES.glob("*.sql"))))

    def test_0002_preserva_conta_e_documento_de_producao(self):
        con = sqlite3.connect(":memory:", isolation_level=None)
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
