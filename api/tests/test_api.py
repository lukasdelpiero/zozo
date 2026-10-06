"""
Testes da API do ZoZo (núcleo Python + banco SQLite com o mesmo schema do D1).

    python -m unittest discover -s api/tests -v
"""
import asyncio
import base64
import hashlib
import json
import os
import pathlib
import secrets
import sys
import time
import unittest

AQUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI.parent / "src"))
sys.path.insert(0, str(AQUI.parent / "dev"))

import acesso  # noqa: E402
import nucleo  # noqa: E402
from banco_sqlite import BancoSqlite, conectar  # noqa: E402

EMAIL = "ana@exemplo.com"
OUTRO = "beto@exemplo.com"
DOMINIO = "time.cloudflareaccess.com"
AUD = "aud-123"
CONFIG = {"ACCESS_TEAM_DOMAIN": DOMINIO, "ACCESS_AUD": AUD, "ALLOWED_EMAILS": f"{EMAIL}, {OUTRO.upper()}"}


def rodar(coro):
    return asyncio.run(coro)


# ---------------- RSA de teste (só para assinar tokens nos testes) ----------------
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


class FakeHttp:
    def __init__(self, chaves=None):
        self.chaves = chaves if chaves is not None else [JWK]
        self.chamadas = []

    async def __call__(self, url, cabecalhos):
        self.chamadas.append((url, dict(cabecalhos)))
        if url.endswith("/cdn-cgi/access/certs"):
            return 200, json.dumps({"keys": self.chaves})
        if url.startswith("https://api.pwnedpasswords.com/range/"):
            return 200, "0018A45C4D1DEF81644B54AB7F969B88D65:1\r\n00D4F6E8FA6EECAD2A3AA415EEC418D38EC:2"
        return 404, ""


def limpar_cache():
    acesso._cache.update(chaves=None, em=0.0, dominio=None, ultima_recarga=0.0)


class TesteAcesso(unittest.TestCase):
    def setUp(self):
        limpar_cache()
        self.http = FakeHttp()

    def ident(self, token, config=CONFIG):
        return rodar(acesso.identidade(token, config, self.http))

    def test_token_valido(self):
        self.assertEqual(self.ident(assinar(claims())), EMAIL)

    def test_email_permitido_maiusculas(self):
        self.assertEqual(self.ident(assinar(claims(email="Beto@Exemplo.com"))), OUTRO)

    def test_email_fora_da_lista(self):
        self.assertIsNone(self.ident(assinar(claims(email="intruso@exemplo.com"))))

    def test_expirado(self):
        self.assertIsNone(self.ident(assinar(claims(exp=int(time.time()) - 3600))))

    def test_sem_exp(self):
        self.assertIsNone(self.ident(assinar(claims(exp=None))))

    def test_nbf_futuro(self):
        self.assertIsNone(self.ident(assinar(claims(nbf=int(time.time()) + 3600))))

    def test_audiencia_errada(self):
        self.assertIsNone(self.ident(assinar(claims(aud=["outra"]))))

    def test_emissor_errado(self):
        self.assertIsNone(self.ident(assinar(claims(iss="https://outro.cloudflareaccess.com"))))

    def test_alg_none_e_hs256(self):
        self.assertIsNone(self.ident(assinar(claims(), alg="none")))
        self.assertIsNone(self.ident(assinar(claims(), alg="HS256")))

    def test_payload_adulterado(self):
        t = assinar(claims()).split(".")
        t[1] = _b64u(json.dumps(claims(email=OUTRO)).encode())
        self.assertIsNone(self.ident(".".join(t)))

    def test_assinatura_de_outra_chave(self):
        n2, _, d2 = _chave_rsa()
        self.assertIsNone(self.ident(assinar(claims(), d=d2, n=n2)))

    def test_lixo(self):
        for t in (None, "", "a.b", "a.b.c", "....", "x" * 20000):
            self.assertIsNone(self.ident(t))

    def test_rotacao_de_chave_recarrega(self):
        self.ident(assinar(claims()))                      # carrega o cache com k1
        self.http.chaves = [dict(JWK, kid="k2")]
        self.assertEqual(self.ident(assinar(claims(), kid="k2")), EMAIL)

    def test_configuracao_incompleta_nega(self):
        for cfg in ({**CONFIG, "ACCESS_TEAM_DOMAIN": "SEU-TIME.cloudflareaccess.com"},
                    {**CONFIG, "ACCESS_AUD": ""}, {**CONFIG, "ALLOWED_EMAILS": ""},
                    {**CONFIG, "ACCESS_TEAM_DOMAIN": "evil.com"}):
            with self.assertRaises(acesso.ErroAcesso):
                self.ident(assinar(claims()), cfg)

    def test_rsa_rejeita_chave_pequena(self):
        self.assertFalse(acesso.verificar_rs256({"kty": "RSA", "n": _int_b64u(2**1023 + 1), "e": "AQAB"}, b"x", b"\x00" * 128))


# ---------------- API ----------------
def b64(b):
    return base64.b64encode(b).decode()


def prova():
    return b64(secrets.token_bytes(32))


def conteudo(tamanho=64):
    return b64(bytes([2]) + secrets.token_bytes(tamanho))


class Cliente:
    def __init__(self, banco, email=EMAIL, http=None):
        self.banco, self.email, self.http = banco, email, http or FakeHttp()

    def __call__(self, metodo, caminho, corpo=None, prova=None, cab=None):
        h = {"Host": "zozo.exemplo.com"}
        if corpo is not None:
            h["Content-Type"] = "application/json"
        if prova:
            h["X-ZoZo-Prova"] = prova
        h.update(cab or {})
        texto = corpo if isinstance(corpo, str) else (json.dumps(corpo) if corpo is not None else "")
        p = nucleo.Pedido(metodo, "https://zozo.exemplo.com" + caminho, h, texto)

        async def ident(_):
            return self.email
        r = rodar(nucleo.atender(p, self.banco, self.http, ident, log=lambda *_: None))
        return r.status, (json.loads(r.corpo) if r.corpo else None)


class TesteApi(unittest.TestCase):
    def setUp(self):
        self.con = conectar()
        self.banco = BancoSqlite(self.con)
        self.api = Cliente(self.banco)
        self.prova = prova()
        self.sal = b64(os.urandom(16))
        st, _ = self.api("POST", "/api/conta", {"nome": "Ana", "sal": self.sal, "iteracoes": 600000, "prova": self.prova})
        self.assertEqual(st, 201)

    def tearDown(self):
        self.con.close()

    def gravar(self, va, c=None, p=None):
        return self.api("PUT", "/api/documento", {"versaoAnterior": va, "conteudo": c or conteudo()}, prova=p or self.prova)

    # --- conta ---
    def test_conta_publica_sem_verificador(self):
        st, c = self.api("GET", "/api/conta")
        self.assertEqual((st, c["sal"], c["iteracoes"]), (200, self.sal, 600000))
        self.assertNotIn("verificador", c)

    def test_conta_duplicada(self):
        st, b = self.api("POST", "/api/conta", {"nome": "X", "sal": self.sal, "iteracoes": 600000, "prova": prova()})
        self.assertEqual((st, b["erro"]), (409, "EMAIL_IN_USE"))
        self.assertEqual(self.api("POST", "/api/conta/verificar", prova=self.prova)[0], 204)   # prova original vale

    def test_conta_iteracoes_baixas_ou_sal_ruim(self):
        api = Cliente(self.banco, email=OUTRO)
        for corpo in ({"sal": self.sal, "iteracoes": 1000, "prova": prova()},
                      {"sal": "abc", "iteracoes": 600000, "prova": prova()},
                      {"sal": self.sal, "iteracoes": True, "prova": prova()},
                      {"sal": self.sal, "iteracoes": 600000, "prova": "curta"}):
            self.assertEqual(api("POST", "/api/conta", corpo)[0], 400)

    def test_nome_sem_caracteres_de_controle(self):
        self.api("PUT", "/api/conta/nome", {"nome": "  Ana\u0000‮ Maria  "}, prova=self.prova)
        self.assertEqual(self.api("GET", "/api/conta")[1]["nome"], "Ana Maria")

    # --- prova da senha ---
    def test_prova_obrigatoria(self):
        for m, c in (("GET", "/api/documento"), ("DELETE", "/api/conta"), ("GET", "/api/historico")):
            self.assertEqual(self.api(m, c)[0], 403)
            self.assertEqual(self.api(m, c, prova=prova())[0], 403)
            self.con.execute("DELETE FROM tentativas")

    def test_bloqueio_apos_5_erros(self):
        for _ in range(5):
            self.assertEqual(self.api("POST", "/api/conta/verificar", prova=prova())[0], 403)
        self.assertEqual(self.api("POST", "/api/conta/verificar", prova=self.prova)[0], 429)   # até a certa espera
        self.con.execute("UPDATE tentativas SET ultima = ultima - 61")
        self.assertEqual(self.api("POST", "/api/conta/verificar", prova=self.prova)[0], 204)
        self.assertIsNone(self.con.execute("SELECT 1 FROM tentativas").fetchone())

    def test_isolamento_entre_contas(self):
        self.gravar(0)
        outro = Cliente(self.banco, email=OUTRO)
        self.assertEqual(outro("GET", "/api/documento", prova=self.prova)[0], 404)    # sem conta: nada vaza
        outro("POST", "/api/conta", {"sal": self.sal, "iteracoes": 600000, "prova": self.prova})
        self.assertEqual(outro("GET", "/api/documento", prova=self.prova)[0], 404)    # mesma prova, dados separados

    def test_sem_identidade(self):
        async def ninguem(_):
            return None
        p = nucleo.Pedido("GET", "https://zozo.exemplo.com/api/eu", {})
        self.assertEqual(rodar(nucleo.atender(p, self.banco, FakeHttp(), ninguem)).status, 401)

        async def quebrado(_):
            raise RuntimeError("certs")
        self.assertEqual(rodar(nucleo.atender(p, self.banco, FakeHttp(), quebrado, log=lambda *_: None)).status, 503)

    # --- documento e concorrência ---
    def test_documento_versoes_e_conflito(self):
        c1 = conteudo()
        self.assertEqual(self.gravar(0, c1), (200, {"versao": 1}))
        self.assertEqual(self.gravar(0)[0], 409)                     # já existe
        self.assertEqual(self.gravar(1)[1], {"versao": 2})
        self.assertEqual(self.gravar(1)[0], 409)                     # outro dispositivo gravou antes
        st, d = self.api("GET", "/api/documento", prova=self.prova)
        self.assertEqual((st, d["versao"]), (200, 2))

    def test_conteudo_invalido(self):
        for c in ("não-base64", b64(b"\x01" + os.urandom(40)), b64(b"\x02" + os.urandom(5)), 123, None, ""):
            st, _ = self.api("PUT", "/api/documento", {"versaoAnterior": 0, "conteudo": c}, prova=self.prova)
            self.assertEqual(st, 400, c)
        for va in (-1, "1", True, 2**60):
            self.assertEqual(self.api("PUT", "/api/documento", {"versaoAnterior": va, "conteudo": conteudo()}, prova=self.prova)[0], 400)

    def test_documento_grande_demais(self):
        grande = "A" * (nucleo.LIMITE_CONTEUDO + 4)
        self.assertEqual(self.gravar(0, grande), (413, {"erro": "DOCUMENT_TOO_LARGE"}))

    def test_corpo_invalido_nao_consome_tentativa(self):
        self.assertEqual(self.api("PUT", "/api/documento", "{quebrado", prova=prova())[0], 400)
        self.assertIsNone(self.con.execute("SELECT 1 FROM tentativas").fetchone())

    def test_tipo_de_conteudo_obrigatorio(self):
        st, _ = self.api("PUT", "/api/documento", json.dumps({"versaoAnterior": 0, "conteudo": conteudo()}),
                         prova=self.prova, cab={"Content-Type": "text/plain"})
        self.assertEqual(st, 415)

    def test_csrf_bloqueado(self):
        for cab in ({"Origin": "https://malicioso.com"}, {"Sec-Fetch-Site": "cross-site"}):
            st, _ = self.api("PUT", "/api/documento", {"versaoAnterior": 0, "conteudo": conteudo()}, prova=self.prova, cab=cab)
            self.assertEqual(st, 403)
        st, _ = self.api("PUT", "/api/documento", {"versaoAnterior": 0, "conteudo": conteudo()}, prova=self.prova,
                         cab={"Origin": "https://zozo.exemplo.com", "Sec-Fetch-Site": "same-origin"})
        self.assertEqual(st, 200)

    # --- histórico ---
    def test_historico_espacado_e_limitado(self):
        self.gravar(0)
        for v in range(1, 30):
            self.gravar(v)
            self.con.execute("UPDATE historico SET criado_em = '2000-01-01T00:00:00.000Z'")   # simula 10 min depois
        st, h = self.api("GET", "/api/historico", prova=self.prova)
        versoes = [x["versao"] for x in h["versoes"]]
        self.assertEqual((st, len(versoes)), (200, 10))
        self.assertEqual(versoes, sorted(versoes, reverse=True))
        self.assertEqual(versoes[0], 29)

    def test_historico_no_maximo_um_a_cada_10_min(self):
        self.gravar(0)
        for v in range(1, 6):
            self.gravar(v)
        self.assertEqual(self.con.execute("SELECT count(*) FROM historico").fetchone()[0], 1)

    # --- troca de senha (atômica) ---
    def troca(self, va, prova_atual=None, nova=None, c=None):
        return self.api("PUT", "/api/conta/senha", {"sal": b64(os.urandom(16)), "iteracoes": 600000, "prova": nova or prova(),
                                                     "conteudo": c or conteudo(), "versaoAnterior": va}, prova=prova_atual or self.prova)

    def test_troca_de_senha(self):
        self.gravar(0)
        self.gravar(1)
        nova = prova()
        c = conteudo()
        self.assertEqual(self.troca(2, nova=nova, c=c), (200, {"versao": 3}))
        self.assertEqual(self.api("POST", "/api/conta/verificar", prova=self.prova)[0], 403)
        st, d = self.api("GET", "/api/documento", prova=nova)
        self.assertEqual((st, d["versao"], d["conteudo"]), (200, 3, c))
        self.assertEqual(self.con.execute("SELECT count(*) FROM historico").fetchone()[0], 0)   # cifrado com a senha antiga

    def test_troca_de_senha_sem_documento(self):
        self.assertEqual(self.troca(0)[1], {"versao": 1})

    def test_troca_de_senha_com_conflito_nao_muda_nada(self):
        self.gravar(0)
        antes = self.con.execute("SELECT sal, verificador FROM contas").fetchone()
        doc_antes = self.con.execute("SELECT versao, conteudo FROM documentos").fetchone()
        self.assertEqual(self.troca(5), (409, {"erro": "DATA_CHANGED"}))     # versão desatualizada
        self.assertEqual(tuple(self.con.execute("SELECT sal, verificador FROM contas").fetchone()), tuple(antes))
        self.assertEqual(tuple(self.con.execute("SELECT versao, conteudo FROM documentos").fetchone()), tuple(doc_antes))
        self.assertEqual(self.con.execute("SELECT count(*) FROM guarda").fetchone()[0], 0)

    def test_troca_de_senha_concorrente_desfaz_documento(self):
        """Se a conta mudou entre a conferência e a gravação, o documento recifrado NÃO fica."""
        self.gravar(0)
        doc_antes = tuple(self.con.execute("SELECT versao, conteudo FROM documentos").fetchone())
        with self.assertRaises(nucleo.Falha) as f:
            rodar(nucleo._lote_atomico(self.banco, [
                nucleo._gravar_documento(EMAIL, 1, conteudo()), nucleo._GUARDA,
                ("UPDATE contas SET verificador = ? WHERE email = ? AND verificador = ?", ("0" * 64, EMAIL, "f" * 64)), nucleo._GUARDA,
                nucleo._LIMPA_GUARDA,
            ]))
        self.assertEqual(f.exception.status, 409)
        self.assertEqual(tuple(self.con.execute("SELECT versao, conteudo FROM documentos").fetchone()), doc_antes)

    def test_troca_exige_prova_atual(self):
        self.gravar(0)
        self.assertEqual(self.troca(1, prova_atual=prova())[0], 403)

    # --- apagar dados / excluir conta ---
    def test_apagar_dados(self):
        self.gravar(0)
        for v in range(1, 4):
            self.gravar(v)
            self.con.execute("UPDATE historico SET criado_em = '2000-01-01T00:00:00.000Z'")
        vazio = conteudo()
        st, b = self.api("POST", "/api/documento/apagar", {"versaoAnterior": 4, "conteudo": vazio}, prova=self.prova)
        self.assertEqual((st, b), (200, {"versao": 5}))       # a versão continua subindo
        self.assertEqual(self.con.execute("SELECT count(*) FROM historico").fetchone()[0], 0)
        self.assertEqual(self.api("GET", "/api/documento", prova=self.prova)[1]["conteudo"], vazio)
        self.assertEqual(self.api("POST", "/api/conta/verificar", prova=self.prova)[0], 204)    # login continua

    def test_apagar_com_conflito(self):
        self.gravar(0)
        self.gravar(1)
        st, _ = self.api("POST", "/api/documento/apagar", {"versaoAnterior": 1, "conteudo": conteudo()}, prova=self.prova)
        self.assertEqual(st, 409)
        self.assertEqual(self.api("GET", "/api/documento", prova=self.prova)[1]["versao"], 2)

    def test_excluir_conta(self):
        self.gravar(0)
        self.gravar(1)
        self.assertEqual(self.api("DELETE", "/api/conta", prova=prova())[0], 403)
        self.assertEqual(self.api("DELETE", "/api/conta", prova=self.prova)[0], 204)
        for t in ("contas", "documentos", "historico", "tentativas"):
            self.assertEqual(self.con.execute(f"SELECT count(*) FROM {t}").fetchone()[0], 0, t)
        self.assertEqual(self.api("GET", "/api/conta")[0], 404)

    # --- diversos ---
    def test_senha_vazada_k_anonimato(self):
        st, b = self.api("GET", "/api/senha-vazada/0018a")
        self.assertEqual(st, 200)
        self.assertIn("0018A45C4D1DEF81644B54AB7F969B88D65", b["lista"])
        url, cab = self.api.http.chamadas[-1]
        self.assertEqual((url, cab.get("Add-Padding")), ("https://api.pwnedpasswords.com/range/0018A", "true"))
        for ruim in ("0018", "0018AB", "../x", "ZZZZZ"):
            self.assertEqual(self.api("GET", "/api/senha-vazada/" + ruim)[0], 400)

    def test_rota_inexistente_e_erro_interno(self):
        self.assertEqual(self.api("GET", "/api/nada")[0], 404)
        self.assertEqual(self.api("PATCH", "/api/documento")[0], 404)

        class Quebrado(BancoSqlite):
            async def primeiro(self, *a):
                raise RuntimeError("detalhe interno")
        st, b = Cliente(Quebrado(self.con))("GET", "/api/conta")
        self.assertEqual((st, b), (500, {"erro": "STORAGE_UNAVAILABLE"}))   # sem detalhes técnicos

    def test_schema_reaplicavel(self):
        self.gravar(0)
        self.con.executescript((AQUI.parent / "schema.sql").read_text(encoding="utf-8"))
        self.assertEqual(self.api("GET", "/api/documento", prova=self.prova)[1]["versao"], 1)


if __name__ == "__main__":
    unittest.main()
