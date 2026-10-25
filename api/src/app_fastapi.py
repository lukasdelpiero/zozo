"""
ZoZo (web) — API em FastAPI com validação Pydantic (TRANSIÇÃO)

Etapa 1 (esta): o FastAPI recebe os pedidos /api/*, confere o tamanho do corpo,
bloqueia CSRF e valida o JSON de cada rota com modelos Pydantic ESTRITOS
(tipos exatos, limites de tamanho, campos desconhecidos recusados). Depois
entrega o pedido ao mesmo núcleo de sempre (nucleo.atender), que continua sendo
a única fonte das regras: sessão, prova da senha, limites, 2FA, criptografia.
Assim nada de segurança fica duplicado ou diferente entre os dois caminhos.

Etapa 2 (feita): fastapi/pydantic no pacote do Worker ([project].dependencies; o
pydantic-core é o compilado para o Pyodide) e API_FASTAPI = "1" na PRÉVIA. Produção
continua no caminho direto até a prévia aprovar (aí: API_FASTAPI = "1" em [vars]).
Etapa 3: mover rota por rota do nucleo._rota para endpoints FastAPI.

Este módulo não importa nada do Cloudflare: os testes rodam com o SQLite local
(api/tests/test_fastapi.py). Quem cria o app informa como obter banco, serviços
e configuração de cada pedido (entry.py no Worker; os testes, em memória).
"""
import json
import secrets
from collections.abc import Callable, Mapping
from typing import Annotated, Any, Literal

from fastapi import FastAPI, Request
from fastapi.responses import Response
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, ValidationError

import nucleo

# ---------------- modelos (o núcleo ainda confere tudo de novo, com as regras completas) ----------------
_B64 = r"^[A-Za-z0-9+/]*={0,2}$"
Email = Annotated[str, StringConstraints(min_length=3, max_length=254)]
Nome = Annotated[str, StringConstraints(min_length=1, max_length=200)]
Sal = Annotated[str, StringConstraints(min_length=24, max_length=88, pattern=_B64)]
Prova = Annotated[str, StringConstraints(min_length=44, max_length=44, pattern=_B64)]
Iteracoes = Annotated[int, Field(ge=nucleo.ITERACOES_MIN, le=nucleo.ITERACOES_MAX)]
Versao = Annotated[int, Field(ge=0, lt=nucleo.MAX_VERSAO)]
Conteudo = Annotated[str, StringConstraints(min_length=4, max_length=nucleo.LIMITE_CONTEUDO)]
Turnstile = Annotated[str, StringConstraints(max_length=2048)]
Codigo = Annotated[str, StringConstraints(max_length=16)]
Kdf = Literal["pbkdf2", "argon2id-1"]
TokenEmail = Annotated[str, StringConstraints(min_length=20, max_length=100, pattern=r"^[A-Za-z0-9_-]+$")]


class Modelo(BaseModel):
    # strict: "600000" (texto) não vira número; extra="forbid": campo desconhecido = pedido inválido
    model_config = ConfigDict(strict=True, extra="forbid")


class Cadastro(Modelo):
    email: Email
    nome: Nome
    sal: Sal
    iteracoes: Iteracoes
    prova: Prova
    kdf: Kdf | None = None
    turnstile: Turnstile | None = None


class Entrada(Modelo):
    email: Email
    prova: Prova
    turnstile: Turnstile | None = None
    confirmacao: TokenEmail | None = None        # link do e-mail: confirma a conta pendente junto com a senha


class CodigoDoisFatores(Modelo):
    codigo: Codigo


class NovoNome(Modelo):
    nome: Nome


class Documento(Modelo):
    versaoAnterior: Versao
    conteudo: Conteudo


class NovaSenha(Documento):
    sal: Sal
    iteracoes: Iteracoes
    prova: Prova
    kdf: Kdf | None = None


class VersaoCifrada(Modelo):
    versao: Versao
    conteudo: Conteudo


class NovoKdf(Documento):
    """Conta antiga (PBKDF2) → Argon2id com a mesma senha: documento e histórico recifrados."""
    sal: Sal
    prova: Prova
    kdf: Literal["argon2id-1"]
    historico: Annotated[list[VersaoCifrada], Field(max_length=10)] = []


class KdfEtapa(Modelo):
    """Uma cópia do histórico recifrada (migração Argon2id em etapas)."""
    sal: Sal
    versao: Versao
    conteudo: Conteudo


class Custodia(Modelo):
    """Cópia da chave dos dados, trancada no navegador com a chave de custódia (recuperação de senha)."""
    nonce: Annotated[str, StringConstraints(min_length=24, max_length=24, pattern=_B64)]
    chave: Annotated[str, StringConstraints(min_length=80, max_length=80, pattern=_B64)]


class Protecao(Modelo):
    avancada: bool


class PedirRecuperacao(Modelo):
    email: Email


class AbrirRecuperacao(Modelo):
    token: TokenEmail
    codigo: Codigo | None = None


class EtapaRecuperacao(KdfEtapa):
    token: TokenEmail


class ConcluirRecuperacao(Documento):
    token: TokenEmail
    modo: Literal["manter", "recomecar"]
    sal: Sal
    prova: Prova
    kdf: Literal["argon2id-1"]
    historico: Annotated[list[VersaoCifrada], Field(max_length=10)] = []


class ReenviarEmail(Modelo):
    email: Email


class LinkEmail(Modelo):
    token: TokenEmail


MODELOS: dict[tuple[str, str], type[Modelo]] = {
    ("POST", "/api/conta"): Cadastro,
    ("POST", "/api/sessao"): Entrada,
    ("POST", "/api/sessao/2fa"): CodigoDoisFatores,
    ("POST", "/api/email/reenviar"): ReenviarEmail,
    ("POST", "/api/email/link"): LinkEmail,
    ("PUT", "/api/conta/nome"): NovoNome,
    ("PUT", "/api/conta/senha"): NovaSenha,
    ("PUT", "/api/conta/kdf"): NovoKdf,
    ("PUT", "/api/conta/kdf/historico"): KdfEtapa,
    ("PUT", "/api/custodia"): Custodia,
    ("PUT", "/api/conta/protecao"): Protecao,
    ("POST", "/api/recuperacao/pedir"): PedirRecuperacao,
    ("POST", "/api/recuperacao/abrir"): AbrirRecuperacao,
    ("PUT", "/api/recuperacao/historico"): EtapaRecuperacao,
    ("PUT", "/api/recuperacao/concluir"): ConcluirRecuperacao,
    ("PUT", "/api/documento"): Documento,
    ("POST", "/api/documento/apagar"): Documento,
    ("POST", "/api/2fa/confirmar"): CodigoDoisFatores,
    ("POST", "/api/2fa/desativar"): CodigoDoisFatores,
}

# Os mesmos cabeçalhos que o entry.py repassa ao núcleo (nada além disso chega às regras)
_CABECALHOS = ("cf-connecting-ip", "content-type", "content-length", "cookie", "origin", "sec-fetch-site", "x-zozo-prova", "host")

# Para cada pedido: {"banco", "servicos", "config"} e, opcionalmente, "log" e "agora" (testes)
Dependencias = Callable[[Request], dict[str, Any]]


def _responder(r: "nucleo.Resposta") -> Response:
    return Response(content=r.corpo or b"", status_code=r.status, headers=dict(nucleo.CABECALHOS, **r.cabecalhos))


def _falha(status: int, codigo: str) -> Response:
    r = nucleo.Resposta(status, {"erro": codigo})
    r.cabecalhos["X-Request-Id"] = secrets.token_hex(8)
    return _responder(r)


async def _ler_corpo(request: Request) -> str | Response:
    """
    Mesma regra do entry.py: só lê corpo com Content-Length válido e dentro do limite. A leitura é em
    blocos e para assim que passar do tamanho DECLARADO (um corpo maior que o anunciado não é acumulado
    na memória); texto que não é UTF-8 válido é recusado (nada de "consertar" bytes em silêncio).
    """
    if request.method not in ("POST", "PUT"):
        return ""
    declarado = request.headers.get("content-length")
    if declarado is None:
        return ""                                   # a rota recebe vazio e recusa
    if not declarado.isdigit() or len(declarado) > 9:
        return _falha(400, "INVALID_REQUEST")
    limite = int(declarado)
    if limite > nucleo.LIMITE_CORPO:
        return _falha(413, "DOCUMENT_TOO_LARGE")
    if not limite:
        return ""
    partes, total = [], 0
    async for bloco in request.stream():
        total += len(bloco)
        if total > limite:
            return _falha(400, "INVALID_REQUEST")
        partes.append(bloco)
    try:
        return b"".join(partes).decode("utf-8")
    except UnicodeDecodeError:
        return _falha(400, "INVALID_REQUEST")


def criar_app(dependencias: Dependencias) -> FastAPI:
    # Sem /docs, /redoc nem /openapi.json: a API não se descreve publicamente
    app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None, redirect_slashes=False)

    @app.api_route("/api/{caminho:path}", methods=["GET", "POST", "PUT", "DELETE"], include_in_schema=False)
    async def api(request: Request, caminho: str) -> Response:   # noqa: ARG001 — o caminho vem de request.url
        corpo = await _ler_corpo(request)
        if isinstance(corpo, Response):
            return corpo
        cab = {n: request.headers[n] for n in _CABECALHOS if n in request.headers}
        pedido = nucleo.Pedido(request.method, str(request.url), cab, corpo)
        dep = dependencias(request)
        log = dep.get("log", print)

        # 1) CSRF antes de olhar o corpo (mesma regra do núcleo)
        try:
            nucleo.mesma_origem(pedido)
        except nucleo.Falha as f:
            return _falha(f.status, f.codigo)

        # 2) Validação Pydantic do JSON da rota (Content-Type errado fica com o núcleo: 415)
        modelo = MODELOS.get((pedido.metodo, pedido.caminho))
        if modelo and (pedido.cab("content-type") or "").lower().startswith("application/json"):
            try:
                modelo.model_validate_json(corpo or "{}")
            except ValidationError as erro:
                # só o tipo do erro e o nome do campo QUANDO ele é do contrato: nunca o valor, e um campo
                # desconhecido (o nome vem do cliente e pode conter qualquer coisa) vira "<extra>"
                conhecidos = set(modelo.model_fields)
                def campo(e: Mapping[str, Any]) -> str:
                    nome = e["loc"][0] if e.get("loc") else ""
                    return nome if isinstance(nome, str) and nome in conhecidos else ("<extra>" if nome else "<corpo>")
                def tipo(e: Mapping[str, Any]) -> str:
                    return "".join(c for c in str(e.get("type", ""))[:40] if c.isalnum() or c == "_")
                log(json.dumps({"evento": "corpo_invalido", "rota": pedido.caminho if pedido.caminho in {c for _, c in MODELOS} else "<outra>",
                                "erros": sorted({f"{campo(e)}:{tipo(e)}" for e in erro.errors()})[:10]}))
                return _falha(400, "INVALID_REQUEST")

        # 3) Regras de sempre
        resposta = await nucleo.atender(pedido, dep["banco"], dep["servicos"], dep["config"], log=log, agora=dep.get("agora"))
        return _responder(resposta)

    @app.api_route("/{caminho:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"], include_in_schema=False)
    async def fora_da_api(caminho: str) -> Response:   # noqa: ARG001
        return _falha(404, "NOT_FOUND")

    return app


__all__ = ["criar_app", "MODELOS", "Dependencias"]
