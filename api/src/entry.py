"""
ZoZo (web) — ponto de entrada no Cloudflare Python Workers

Só traduz entre o Cloudflare e o núcleo (nucleo.py):
  • banco D1  → primeiro / todos / executar / lote
  • fetch     → http_get / http_post
  • Request   → Pedido;  Resposta → Response
A interface (pasta public) é servida pelo próprio Cloudflare (assets);
este código só recebe os caminhos /api/*.
Variáveis (wrangler.toml): TURNSTILE_SITE_KEY, GOOGLE_CLIENT_ID
  API_FASTAPI = "1"  → transição: os pedidos passam pelo app FastAPI + Pydantic (app_fastapi.py)
                       antes do núcleo. Desligado por padrão; ligar primeiro só na prévia, depois de
                       mover fastapi/pydantic para [project].dependencies (pyproject.toml).
Segredos (wrangler secret put): SEGREDO, TURNSTILE_SECRET, GOOGLE_CLIENT_SECRET, RECURSOS_AVANCADOS
"""
import json
from urllib.parse import urlencode

from pyodide.ffi import to_js
from workers import Response, WorkerEntrypoint, fetch

import nucleo

try:                                  # Pyodide recente representa o null do JS assim
    from pyodide.ffi import jsnull as _JSNULL
except ImportError:                   # pragma: no cover
    _JSNULL = None

_CONFIG = ("SEGREDO", "TURNSTILE_SITE_KEY", "TURNSTILE_SECRET", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "RECURSOS_AVANCADOS")
_CABECALHOS = ("cf-connecting-ip", "content-type", "content-length", "cookie", "origin", "sec-fetch-site", "x-zozo-prova")


def _py(valor):
    if valor is None or (_JSNULL is not None and valor is _JSNULL):
        return None
    return valor.to_py() if hasattr(valor, "to_py") else valor


class BancoD1:
    """Banco D1. Parâmetros são sempre str/int (None viraria `undefined`, que o D1 recusa)."""

    def __init__(self, db):
        self.db = db

    def _comando(self, sql, params):
        for p in params:
            if not isinstance(p, (str, int)) or isinstance(p, bool):
                raise TypeError("parâmetro SQL inválido")
        st = self.db.prepare(sql)
        return st.bind(*params) if params else st

    async def primeiro(self, sql, *params):
        return _py(await self._comando(sql, params).first())

    async def todos(self, sql, *params):
        r = _py(await self._comando(sql, params).all())
        return list(r.get("results") or [])

    async def executar(self, sql, *params):
        r = _py(await self._comando(sql, params).run())
        return int(r["meta"]["changes"])

    async def lote(self, comandos):
        resultados = await self.db.batch(to_js([self._comando(sql, tuple(p)) for sql, p in comandos]))
        return [int(_py(r)["meta"]["changes"]) for r in resultados]


class Servicos:
    async def http_get(self, url, cabecalhos):
        r = await fetch(url, method="GET", headers=dict(cabecalhos))
        return int(r.status), await r.text()

    async def http_post(self, url, campos):
        r = await fetch(url, method="POST", body=urlencode(campos),
                        headers={"Content-Type": "application/x-www-form-urlencoded"})
        return int(r.status), await r.text()


def _cabecalhos(request):
    h = request.headers
    return {n: h.get(n) for n in _CABECALHOS if h.get(n) is not None}


def _metodo(request):
    m = request.method
    return str(getattr(m, "value", m)).upper()


def _config(env):
    return {k: str(getattr(env, k, "") or "") for k in _CONFIG}


_APP_FASTAPI = None


def _app_fastapi():
    """App FastAPI (transição). None se o pacote não estiver no Worker: segue o caminho atual."""
    global _APP_FASTAPI
    if _APP_FASTAPI is None:
        try:
            from app_fastapi import criar_app       # noqa: PLC0415 — só carrega quando ligado
        except ImportError:
            print(json.dumps({"evento": "fastapi_indisponivel"}))
            _APP_FASTAPI = False
        else:
            _APP_FASTAPI = criar_app(lambda req: {"banco": BancoD1(req.scope["env"].DB), "servicos": Servicos(),
                                                  "config": _config(req.scope["env"])})
    return _APP_FASTAPI or None


class Default(WorkerEntrypoint):
    async def fetch(self, request):
        env = self.env
        if str(getattr(env, "API_FASTAPI", "") or "") == "1":
            app = _app_fastapi()
            if app is not None:
                import asgi                          # noqa: PLC0415 — adaptador ASGI do Python Workers
                return await asgi.fetch(app, request.js_object, env)
        config = _config(env)
        cab = _cabecalhos(request)
        metodo = _metodo(request)

        corpo = ""
        if metodo in ("POST", "PUT"):
            declarado = cab.get("content-length")
            if declarado is not None:
                # Só lê o corpo com tamanho declarado e dentro do limite (o HTTP garante que o corpo não passa disso).
                # Sem Content-Length (o site sempre envia), o corpo NÃO é lido: a rota recebe vazio e recusa.
                if not declarado.isdigit() or len(declarado) > 9:
                    return _responder(nucleo.Resposta(400, {"erro": "INVALID_REQUEST"}))
                if int(declarado) > nucleo.LIMITE_CORPO:      # recusa antes de ler o corpo
                    return _responder(nucleo.Resposta(413, {"erro": "DOCUMENT_TOO_LARGE"}))
                if int(declarado) > 0:
                    corpo = await request.text()

        pedido = nucleo.Pedido(metodo, request.url, cab, corpo)
        if not pedido.caminho.startswith("/api/"):
            return _responder(nucleo.Resposta(404, {"erro": "NOT_FOUND"}))

        resposta = await nucleo.atender(pedido, BancoD1(env.DB), Servicos(), config)
        return _responder(resposta)


def _responder(r):
    return Response(r.corpo, status=r.status, headers=dict(nucleo.CABECALHOS, **r.cabecalhos))
