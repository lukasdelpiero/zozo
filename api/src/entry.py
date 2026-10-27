"""
ZoZo (web) — ponto de entrada no Cloudflare Python Workers

Só traduz entre o Cloudflare e o núcleo (nucleo.py):
  • banco D1  → primeiro / todos / executar / lote
  • fetch     → http_get / http_post
  • Request   → Pedido;  Resposta → Response
A interface (pasta public) é servida pelo próprio Cloudflare (assets);
este código só recebe os caminhos /api/*.
Variáveis (wrangler.toml): TURNSTILE_SITE_KEY, GOOGLE_CLIENT_ID
  API_FASTAPI = "1"  → os pedidos passam pelo app FastAPI + Pydantic (app_fastapi.py) antes do
                       núcleo. Ligado na prévia; produção só depois de aprovado lá.
Segredos (wrangler secret put): SEGREDO, TURNSTILE_SECRET, GOOGLE_CLIENT_SECRET, RECURSOS_AVANCADOS, RECURSOS_CAMBIO, RESEND_API_KEY
Variáveis de e-mail (wrangler.toml): EMAIL_REMETENTE, URL_PUBLICA
"""
import json
from collections.abc import Mapping, Sequence
from http import HTTPMethod
from typing import TYPE_CHECKING, Any
from urllib.parse import urlencode

from pyodide.ffi import to_js
from workers import Request, Response, WorkerEntrypoint, fetch

import nucleo

if TYPE_CHECKING:
    from fastapi import FastAPI

_JSNULL: object
try:                                  # Pyodide recente representa o null do JS assim
    from pyodide.ffi import jsnull as _JSNULL
except ImportError:                   # pragma: no cover
    _JSNULL = None

_CONFIG = ("SEGREDO", "TURNSTILE_SITE_KEY", "TURNSTILE_SECRET", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "RECURSOS_AVANCADOS", "RECURSOS_CAMBIO",
           "RESEND_API_KEY", "EMAIL_REMETENTE", "URL_PUBLICA")
_CABECALHOS = ("cf-connecting-ip", "content-type", "content-length", "cookie", "origin", "sec-fetch-site", "x-zozo-prova")


def _py(valor: Any) -> Any:                  # objeto do JS → Python (null → None)
    if valor is None or (_JSNULL is not None and valor is _JSNULL):
        return None
    return valor.to_py() if hasattr(valor, "to_py") else valor


class BancoD1:
    """Banco D1. Parâmetros são sempre str/int (None viraria `undefined`, que o D1 recusa)."""

    def __init__(self, db: Any) -> None:
        self.db = db

    def _comando(self, sql: str, params: Sequence[Any]) -> Any:
        for p in params:
            if not isinstance(p, (str, int)) or isinstance(p, bool):
                raise TypeError("parâmetro SQL inválido")
        st = self.db.prepare(sql)
        return st.bind(*params) if params else st

    async def primeiro(self, sql: str, *params: Any) -> nucleo.Linha | None:
        linha = _py(await self._comando(sql, params).first())
        return dict(linha) if linha is not None else None

    async def todos(self, sql: str, *params: Any) -> list[nucleo.Linha]:
        r = _py(await self._comando(sql, params).all())
        return list(r.get("results") or [])

    async def executar(self, sql: str, *params: Any) -> int:
        r = _py(await self._comando(sql, params).run())
        return int(r["meta"]["changes"])

    async def lote(self, comandos: Sequence[nucleo.Comando]) -> list[int]:
        # O SDK do Python Workers (pywrangler recente) devolve os comandos EMBRULHADOS (_BindingWrapper, objeto
        # Python). Passados ao to_js, viravam proxies "emprestados", destruídos antes de o D1 ler o lote
        # ("borrowed proxy was automatically destroyed") e TODO lote falhava (cadastro com e-mail, troca de senha,
        # apagar dados, Argon2id). O batch recebe os objetos JS de verdade; com o SDK antigo já são JS (fica igual).
        comandos_js = [getattr(st, "_binding", st) for st in (self._comando(sql, tuple(p)) for sql, p in comandos)]
        resultados = await self.db.batch(to_js(comandos_js))
        return [int(_py(r)["meta"]["changes"]) for r in resultados]


class Servicos:
    async def http_get(self, url: str, cabecalhos: Mapping[str, str]) -> tuple[int, str]:
        r = await fetch(url, method=HTTPMethod.GET, headers=dict(cabecalhos))
        return int(r.status), await r.text()

    async def http_post(self, url: str, campos: Mapping[str, str]) -> tuple[int, str]:
        r = await fetch(url, method=HTTPMethod.POST, body=urlencode(campos),
                        headers={"Content-Type": "application/x-www-form-urlencoded"})
        return int(r.status), await r.text()

    async def http_post_json(self, url: str, cabecalhos: Mapping[str, str], corpo: str) -> tuple[int, str]:
        r = await fetch(url, method=HTTPMethod.POST, body=corpo, headers=dict(cabecalhos))
        return int(r.status), (await r.text())[:2000]          # resposta do Resend: só o começo interessa


def _cabecalhos(request: Request) -> dict[str, str]:
    h = request.headers
    return {n: h.get(n) for n in _CABECALHOS if h.get(n) is not None}


def _metodo(request: Request) -> str:
    m = request.method
    return str(getattr(m, "value", m)).upper()


def _config(env: Any) -> dict[str, str]:
    return {k: str(getattr(env, k, "") or "") for k in _CONFIG}


# Importado E montado no carregamento (não no 1º pedido): o Cloudflare guarda o estado depois do código do
# topo num "snapshot" de memória, então importar FastAPI + Pydantic e montar as rotas e os validadores não
# custa CPU a cada isolado novo. O app só é usado com API_FASTAPI = "1"; sem isso os pedidos seguem direto
# para o núcleo.
_APP_FASTAPI: "FastAPI | None"
try:
    import asgi                                      # adaptador ASGI do Python Workers
    from app_fastapi import criar_app
except ImportError:                                  # pragma: no cover — pacote fora do Worker
    _APP_FASTAPI = None
else:
    _APP_FASTAPI = criar_app(lambda req: {"banco": BancoD1(req.scope["env"].DB), "servicos": Servicos(),
                                          "config": _config(req.scope["env"])})


def _app_fastapi() -> "FastAPI | None":
    """App FastAPI. None se o pacote não estiver no Worker (aí o pedido é RECUSADO: ver fetch)."""
    if _APP_FASTAPI is None:
        print(json.dumps({"evento": "fastapi_indisponivel"}))
    return _APP_FASTAPI


class Default(WorkerEntrypoint):
    async def fetch(self, request: Request) -> Response:
        env = self.env
        if str(getattr(env, "API_FASTAPI", "") or "") == "1":
            app = _app_fastapi()
            if app is None:
                # Ligado mas sem o pacote: falha VISÍVEL (503) em vez de voltar em silêncio ao caminho antigo —
                # assim "API_FASTAPI = 1" sempre significa que a validação Pydantic está mesmo valendo
                return _responder(nucleo.Resposta(503, {"erro": "UNAVAILABLE"}))
            via_fastapi: Response = await asgi.fetch(app, request.js_object, env)
            return via_fastapi
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


def _responder(r: nucleo.Resposta) -> Response:
    return Response(r.corpo, status=r.status, headers=dict(nucleo.CABECALHOS, **r.cabecalhos))
