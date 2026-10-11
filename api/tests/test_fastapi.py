"""
Testes do app FastAPI (transição; api/src/app_fastapi.py).

    cd api && uv run python -m unittest discover -s tests -v

Sem o FastAPI instalado (python do sistema), estes testes são pulados; o publicar.ps1
roda com `uv run`, que instala o grupo de desenvolvimento (pyproject.toml).
"""
import asyncio
import json
import os
import pathlib
import sys
import unittest
from urllib.parse import urlsplit

AQUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI.parent / "src"))
sys.path.insert(0, str(AQUI.parent / "dev"))
sys.path.insert(0, str(AQUI))

try:
    import app_fastapi
    TEM_FASTAPI = True
except ImportError:          # pragma: no cover — python sem o grupo dev
    TEM_FASTAPI = False

import nucleo  # noqa: E402
from banco_sqlite import BancoSqlite, conectar  # noqa: E402
from test_api import CONFIG, EMAIL, FakeServicos, b64, conteudo, prova  # noqa: E402

HOST = "zozo.exemplo.com"


async def _asgi(app, metodo, caminho, corpo=b"", cab=None):
    partes = urlsplit(caminho)
    scope = {
        "type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1", "method": metodo, "scheme": "https",
        "path": partes.path, "raw_path": partes.path.encode(), "query_string": partes.query.encode(), "root_path": "",
        "headers": [(k.lower().encode("latin-1"), str(v).encode("latin-1")) for k, v in (cab or {}).items()],
        "server": (HOST, 443), "client": ("203.0.113.7", 50000),
    }
    entregue = False

    async def receive():
        nonlocal entregue
        if not entregue:
            entregue = True
            return {"type": "http.request", "body": corpo, "more_body": False}
        return {"type": "http.disconnect"}

    resposta = {"status": None, "headers": {}, "corpo": b""}

    async def send(msg):
        if msg["type"] == "http.response.start":
            resposta["status"] = msg["status"]
            resposta["headers"] = {k.decode().lower(): v.decode() for k, v in msg["headers"]}
        elif msg["type"] == "http.response.body":
            resposta["corpo"] += msg.get("body", b"")

    await app(scope, receive, send)
    return resposta


class ClienteFastAPI:
    """Um navegador falando com o app FastAPI (cookie de sessão incluso)."""

    def __init__(self, app):
        self.app, self.cookies, self.ultima = app, {}, None

    def __call__(self, metodo, caminho, corpo=None, prova=None, cab=None, bruto=None):
        h = {"Host": HOST, "CF-Connecting-IP": "203.0.113.7"}
        dados = bruto if bruto is not None else (json.dumps(corpo).encode() if corpo is not None else b"")
        if corpo is not None or bruto is not None:
            h["Content-Type"] = "application/json"
            h["Content-Length"] = str(len(dados))
        if prova:
            h["X-ZoZo-Prova"] = prova
        if self.cookies:
            h["Cookie"] = "; ".join(f"{k}={v}" for k, v in self.cookies.items())
        h.update(cab or {})
        r = asyncio.run(_asgi(self.app, metodo, caminho, dados, h))
        self.ultima = r
        sc = r["headers"].get("set-cookie")
        if sc:
            nome, _, resto = sc.partition("=")
            self.cookies[nome] = resto.split(";", 1)[0]
        return r["status"], (json.loads(r["corpo"]) if r["corpo"] else None)


@unittest.skipUnless(TEM_FASTAPI, "FastAPI não instalado (use: uv run python -m unittest)")
class TesteFastAPI(unittest.TestCase):
    def setUp(self):
        self.con = conectar()
        self.logs = []
        banco, servicos = BancoSqlite(self.con), FakeServicos()
        self.app = app_fastapi.criar_app(lambda _req: {"banco": banco, "servicos": servicos, "config": CONFIG, "log": self.logs.append})
        self.api = ClienteFastAPI(self.app)
        self.sal, self.prova = b64(os.urandom(16)), prova()

    def tearDown(self):
        self.con.close()

    def cadastro(self, **mudar):
        return dict({"email": EMAIL, "nome": "Ana", "sal": self.sal, "iteracoes": 600000, "prova": self.prova}, **mudar)

    def contas(self):
        return self.con.execute("SELECT COUNT(*) FROM contas WHERE email = ?", (EMAIL,)).fetchone()[0]

    def test_fluxo_completo_igual_ao_nucleo(self):
        st, sessao = self.api("POST", "/api/conta", self.cadastro())
        self.assertEqual(st, 201)
        sc = self.api.ultima["headers"]["set-cookie"]
        for attr in ("__Host-zozo=", "HttpOnly", "Secure", "SameSite=Strict"):
            self.assertIn(attr, sc)
        for k, v in nucleo.CABECALHOS.items():                       # mesmos cabeçalhos de segurança
            self.assertEqual(self.api.ultima["headers"].get(k.lower()), v)
        self.assertEqual(self.api("GET", "/api/sessao")[1]["email"], EMAIL)
        self.assertEqual(self.api("PUT", "/api/documento", {"versaoAnterior": 0, "conteudo": conteudo()}, prova=self.prova)[0], 200)
        self.assertEqual(self.api("GET", "/api/documento", prova=self.prova)[0], 200)
        st, r = self.api("GET", "/api/documento", prova=prova())                     # prova errada: regra do núcleo
        self.assertEqual((st, r["erro"]), (403, "WRONG_PASSWORD"))
        self.assertEqual(set(sessao), {"email", "nome", "envelope", "doisFatores", "demo", "recursos"})

    def test_pydantic_recusa_corpo_fora_do_contrato(self):
        ruins = [
            self.cadastro(admin=True),                    # campo desconhecido
            self.cadastro(iteracoes="600000"),            # número como texto (strict)
            self.cadastro(iteracoes=1000),                # abaixo do mínimo de PBKDF2
            self.cadastro(prova=self.prova[:-4]),         # prova com tamanho errado
            self.cadastro(sal="não é base64!!" * 3),
            self.cadastro(nome=""),
            self.cadastro(email=["lista"]),
        ]
        for corpo in ruins:
            with self.subTest(corpo={k: v for k, v in corpo.items() if k not in ("prova", "sal")}):
                st, r = self.api("POST", "/api/conta", corpo)
                self.assertEqual((st, r["erro"]), (400, "INVALID_REQUEST"))
        self.assertEqual(self.contas(), 0)                # nada chegou ao banco
        self.assertEqual(self.api("POST", "/api/conta", bruto=b"{nao-json")[0], 400)

    def test_log_de_corpo_invalido_nao_tem_valores(self):
        self.api("POST", "/api/conta", self.cadastro(iteracoes="600000", turnstile=123))
        texto = " ".join(self.logs)
        self.assertIn("corpo_invalido", texto)
        for segredo in (EMAIL, self.prova, self.sal):
            self.assertNotIn(segredo, texto)

    def test_log_nao_tem_nome_de_campo_vindo_do_cliente(self):
        # auditoria F04: o nome de um campo extra vem do cliente e pode carregar qualquer dado
        segredo = "SEGREDO_SINTETICO_NO_NOME_DO_CAMPO_" + "x" * 300
        st, _ = self.api("POST", "/api/conta", dict(self.cadastro(), **{segredo: 1, "aninhado": {segredo: 2}}))
        self.assertEqual(st, 400)
        texto = " ".join(self.logs)
        self.assertIn("<extra>", texto)
        self.assertNotIn("SEGREDO_SINTETICO", texto)
        self.assertLess(len(texto), 600)

    def test_query_com_campos_demais_responde_400(self):
        # auditoria F05: 21 campos na query não podem virar erro interno
        q = "&".join(f"c{i}=1" for i in range(21))
        st, r = self.api("GET", "/api/conta/parametros?" + q)
        self.assertEqual((st, r["erro"]), (400, "INVALID_REQUEST"))
        for k, v in nucleo.CABECALHOS.items():
            self.assertEqual(self.api.ultima["headers"].get(k.lower()), v)
        st, _ = self.api("GET", "/api/conta/parametros?" + "&".join(f"c{i}=1" for i in range(20)))
        self.assertNotEqual(st, 500)

    def test_csrf_vem_antes_da_validacao(self):
        for cab in ({"Origin": "https://malicioso.exemplo"}, {"Sec-Fetch-Site": "cross-site"}):
            with self.subTest(cab=cab):
                st, r = self.api("POST", "/api/conta", self.cadastro(extra=1), cab=cab)
                self.assertEqual((st, r["erro"]), (403, "FORBIDDEN"))
        self.assertEqual(self.contas(), 0)

    def test_tamanho_do_corpo(self):
        st, _ = self.api("POST", "/api/conta", self.cadastro(), cab={"Content-Length": str(nucleo.LIMITE_CORPO + 1)})
        self.assertEqual(st, 413)
        st, _ = self.api("POST", "/api/conta", self.cadastro(), cab={"Content-Length": "12a"})
        self.assertEqual(st, 400)
        self.assertEqual(self.contas(), 0)

    def test_tipo_de_conteudo_fica_com_o_nucleo(self):
        st, _ = self.api("POST", "/api/conta", self.cadastro(), cab={"Content-Type": "text/plain"})
        self.assertEqual(st, 415)

    def test_sem_documentacao_publica_e_fora_da_api(self):
        for caminho in ("/docs", "/redoc", "/openapi.json", "/qualquer"):
            with self.subTest(caminho=caminho):
                self.assertEqual(self.api("GET", caminho)[0], 404)

    def test_toda_rota_com_corpo_tem_modelo(self):
        com_corpo = {("POST", "/api/conta"), ("POST", "/api/sessao"), ("POST", "/api/sessao/2fa")} | {
            (m, c) for m, c in nucleo._PROTEGIDAS if m in ("POST", "PUT") and c not in nucleo._SEM_CORPO}
        self.assertEqual(com_corpo, set(app_fastapi.MODELOS))


if __name__ == "__main__":
    unittest.main()
