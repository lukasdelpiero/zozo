"""
ZoZo (web) — ponto de entrada no Cloudflare Python Workers

Só traduz entre o Cloudflare e o núcleo (nucleo.py):
  • banco D1  → primeiro / todos / executar / lote
  • fetch     → http_get
  • Request   → Pedido;  Resposta → Response
A interface (pasta public) é servida pelo próprio Cloudflare (assets);
este código só recebe os caminhos /api/*.
Variáveis (wrangler.toml): ACCESS_TEAM_DOMAIN, ACCESS_AUD, ALLOWED_EMAILS
"""
from pyodide.ffi import to_js
from workers import Response, WorkerEntrypoint, fetch

import acesso
import nucleo

try:                                  # Pyodide recente representa o null do JS assim
    from pyodide.ffi import jsnull as _JSNULL
except ImportError:                   # pragma: no cover
    _JSNULL = None


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


async def http_get(url, cabecalhos):
    r = await fetch(url, method="GET", headers=dict(cabecalhos))
    return int(r.status), await r.text()


def _cabecalhos(request):
    h = request.headers
    nomes = ("cf-access-jwt-assertion", "content-type", "content-length", "origin", "sec-fetch-site", "x-zozo-prova")
    return {n: h.get(n) for n in nomes if h.get(n) is not None}


def _metodo(request):
    m = request.method
    return str(getattr(m, "value", m)).upper()


class Default(WorkerEntrypoint):
    async def fetch(self, request):
        env = self.env
        config = {k: getattr(env, k, "") for k in ("ACCESS_TEAM_DOMAIN", "ACCESS_AUD", "ALLOWED_EMAILS")}
        cab = _cabecalhos(request)
        metodo = _metodo(request)

        corpo = ""
        if metodo in ("POST", "PUT"):
            try:
                tamanho = int(cab.get("content-length") or 0)
            except ValueError:
                tamanho = nucleo.LIMITE_CORPO + 1
            if tamanho > nucleo.LIMITE_CORPO:      # recusa antes de ler o corpo
                return _responder(nucleo.Resposta(413, {"erro": "DOCUMENT_TOO_LARGE"}))
            corpo = await request.text()

        pedido = nucleo.Pedido(metodo, request.url, cab, corpo)
        if not pedido.caminho.startswith("/api/"):
            return _responder(nucleo.Resposta(404, {"erro": "NOT_FOUND"}))

        async def identificar(p):
            return await acesso.identidade(p.cab("cf-access-jwt-assertion"), config, http_get)

        resposta = await nucleo.atender(pedido, BancoD1(env.DB), http_get, identificar)
        return _responder(resposta)


def _responder(r):
    return Response(r.corpo, status=r.status, headers=dict(nucleo.CABECALHOS))
