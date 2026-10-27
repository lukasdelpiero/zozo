"""
ZoZo (web) — núcleo da API (Python puro, sem dependências do Cloudflare)

Camadas de proteção:
  1. login próprio do ZoZo: e-mail + PROVA DE SENHA. A senha nunca sai do navegador:
     ele deriva (PBKDF2 600.000 + HKDF) a chave dos dados e uma "prova"; o servidor
     guarda só o SHA-256 da prova;
  2. sessão no servidor: cookie aleatório HttpOnly + Secure + SameSite=Strict, sem
     data de expiração (termina ao fechar o navegador); o banco guarda só o SHA-256
     dele. Expira 24 h depois do login, mesmo em uso e com o navegador aberto. O "envelope" que
     protege a chave dos dados guardada no navegador é HMAC(SEGREDO, cookie): não fica
     no banco, então banco + navegador não bastam para abrir os dados;
  3. 2FA opcional por aplicativo autenticador (TOTP), com proteção contra reuso;
  4. bloqueio progressivo por e-mail + IP: 3 tentativas livres, CAPTCHA (Turnstile)
     da 4ª em diante, 15 min de bloqueio na 5ª falha e 24 h na 10ª. Muitas falhas
     na mesma conta vindas de IPs diferentes também passam a exigir CAPTCHA;
  5. mensagens genéricas: e-mail inexistente e senha errada são indistinguíveis
     (inclusive os parâmetros da senha, que são simulados para e-mails sem conta);
  6. cada pessoa só lê/grava os próprios dados (o e-mail vem da sessão, nunca do pedido);
  7. leitura/gravação dos dados exigem a sessão E a prova da senha;
  8. gravação com versão (409 se outro dispositivo gravou antes) + histórico;
  9. operações de várias etapas (troca de senha, apagar dados) são atômicas;
 10. CSRF: escritas só da própria origem e só com JSON (além do SameSite=Strict).
"Continuar com Google" (google.py) só confirma o e-mail: a senha continua sendo a chave dos dados.
Conta de demonstração (DEMO_EMAIL, senha pública): somente leitura — a API recusa toda rota
protegida (gravar documento, senha, nome, 2FA, apagar, excluir); os dados são gerados no navegador.
Perfis, boletos e Pix: liberados só para a demonstração e os e-mails de RECURSOS_AVANCADOS.

O servidor nunca recebe a senha nem os dados legíveis: o documento chega
cifrado (AES-256-GCM) do navegador.

O núcleo recebe:
  banco    — primeiro(sql, *p) -> dict|None · todos -> list · executar -> int · lote([(sql, p)]) -> list
  servicos — http_get(url, cab) -> (status, texto) · http_post(url, campos) -> (status, texto)
             · http_post_json(url, cab, corpo_json) -> (status, texto)   (e-mails pelo Resend)
  config   — SEGREDO, TURNSTILE_SITE_KEY, TURNSTILE_SECRET, COOKIE_SEGURO,
             GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, RECURSOS_AVANCADOS, RECURSOS_CAMBIO,
             RESEND_API_KEY, EMAIL_REMETENTE, URL_PUBLICA (e-mail: ver emails.py)
Confirmação de e-mail (com o e-mail ligado): o cadastro cria a conta PENDENTE e envia um link;
a conta é confirmada no PRIMEIRO LOGIN feito com o link (token do e-mail + senha juntos): só quem
lê a caixa de entrada E sabe a senha cadastrada ativa a conta — ninguém consegue "pré-cadastrar"
o e-mail de outra pessoa com uma senha própria e esperar que ela clique. A resposta do cadastro é
a mesma para e-mail novo ou já cadastrado (não revela quem tem conta). Derivação da senha no navegador: PBKDF2 (contas antigas)
ou Argon2id (kdf "argon2id-1": contas novas e senhas trocadas).
"""
import base64
import binascii
import hashlib
import hmac
import json
import re
import secrets
import time
import unicodedata
from collections.abc import Callable, Mapping, Sequence
from typing import Any, Protocol
from urllib.parse import parse_qs, urlsplit

import emails
import google
import totp

LIMITE_CORPO = 2_100_000        # bytes do pedido
LIMITE_CONTEUDO = 1_900_000     # caracteres do documento cifrado (D1: máx. ~2 MB por linha)
ITERACOES_MIN = 600_000
ITERACOES_MAX = 10_000_000
# Derivação da senha no navegador: "pbkdf2" (com iterações) ou "argon2id-1" (m=64 MiB, t=3, p=1)
KDF_PBKDF2, KDF_ARGON2 = "pbkdf2", "argon2id-1"
KDFS = (KDF_PBKDF2, KDF_ARGON2)
# Confirmação de e-mail
CONFIRMACAO_S = 86400                     # o link vale 24 h
PENDENTE_APAGA_S = 7 * 86400              # cadastro nunca confirmado some depois de 7 dias
EMAILS_POR_CONTA, EMAIL_JANELA_S = 3, 3600            # e-mails de confirmação/aviso por endereço
REENVIO_LOGIN_S = 600                     # entrar sem confirmar manda um link novo se o último tem mais de 10 min
LINKS_POR_IP, LINK_JANELA_S = 30, 3600                # conferências de link (tela "Verifique seu e-mail") por IP
RECUPERACAO_S = 3600                      # link de "Esqueci minha senha": 1 hora
RECUPERACOES_POR_IP, RECUPERACAO_JANELA_S = 5, 3600   # pedidos de recuperação por IP
PASSOS_RECUPERACAO_POR_IP = 60                        # etapas + conclusões de recuperação por IP por hora (cada etapa grava até 2 MB)
FORMATO_DOCUMENTO = 2           # primeiro byte do documento cifrado (versão do formato)
MAX_VERSAO = 2**53 - 1

# Sessões
SESSAO_OCIOSA_S = 86400         # sem uso por 24 h → encerra
SESSAO_MAXIMA_S = 86400         # no máximo 24 h depois do login, mesmo em uso (sem fechar o navegador)
SESSAO_2FA_S = 600              # 10 min para digitar o código do 2FA
TOQUE_SESSAO_S = 300            # "último uso" é gravado no máximo a cada 5 min
COOKIE_SEGURO = "__Host-zozo"   # HTTPS: prefixo __Host- (só este site, Path=/, Secure)
COOKIE_DEV = "zozo_dev"         # servidor local em http://127.0.0.1
COOKIE_OAUTH = "zozo_oauth"     # state/nonce/PKCE do Google (10 min)
COOKIE_GOOGLE = "zozo_google"   # e-mail confirmado pelo Google, até digitar a senha (10 min)

# Bloqueio progressivo (login e prova da senha, por e-mail + IP)
LOGIN_SEM_CAPTCHA = 3           # 1ª a 3ª tentativa: normal; da 4ª em diante: CAPTCHA
BLOQUEIO_1, BLOQUEIO_1_S = 5, 900          # 5ª falha → 15 min
BLOQUEIO_2, BLOQUEIO_2_S = 10, 86400       # 10ª falha → 24 h
ESQUECE_S = 86400                          # 24 h sem falhas → contador zera
CONTA_CAPTCHA, CONTA_JANELA_S = 20, 3600   # 20 falhas/h na conta (todos os IPs) → CAPTCHA para todos
# Limites por IP
CADASTROS_POR_IP, CADASTRO_JANELA_S = 5, 3600
ENTRADAS_POR_IP, ENTRADA_JANELA_S = 30, 600          # logins (certos ou errados) por IP: a senha da demo é pública
COTA_DADOS, COTA_JANELA_S = 600, 600                 # pedidos às rotas de dados por conta (leituras e gravações)
CONSULTAS_POR_IP, CONSULTA_JANELA_S = 60, 60

TURNSTILE_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"
FRASE_EXCLUIR = "EXCLUIR CONTA"   # excluir a conta: a pessoa digita isto (no lugar da senha); a sessão e a prova continuam exigidas

# Conta de demonstração pública (criada pela migração 0003_conta_demo.sql)
DEMO_EMAIL = "demo@usezozo.com.br"
DEMO_SESSOES_MAX = 500          # sessões abertas da demo ao mesmo tempo (as mais antigas saem)
DEMO_OCIOSA_S = 6 * 3600        # sessão da demo parada há 6 h é descartada

_B64 = re.compile(r"^[A-Za-z0-9+/]+={0,2}$")
_PREFIXO_SHA1 = re.compile(r"^[0-9A-F]{5}$")
_EMAIL = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
_AGORA_SQL = "strftime('%Y-%m-%dT%H:%M:%fZ','now')"

# ---------------- tipos ----------------
Linha = dict[str, Any]                    # linha do banco (coluna → valor)
Comando = tuple[str, tuple[Any, ...]]     # comando parametrizado: (sql, parâmetros)
Json = dict[str, Any]                     # corpo JSON lido do pedido (cada campo é conferido antes de usar)


class Banco(Protocol):
    """Adaptador do banco (D1 no Cloudflare, SQLite no servidor local e nos testes)."""
    async def primeiro(self, sql: str, *params: Any) -> Linha | None: ...
    async def todos(self, sql: str, *params: Any) -> list[Linha]: ...
    async def executar(self, sql: str, *params: Any) -> int: ...
    async def lote(self, comandos: Sequence[Comando]) -> list[int]: ...


class Servicos(Protocol):
    """Pedidos HTTP para fora (Turnstile, Google, Resend, lista de senhas vazadas)."""
    async def http_get(self, url: str, cabecalhos: Mapping[str, str]) -> tuple[int, str]: ...
    async def http_post(self, url: str, campos: Mapping[str, str]) -> tuple[int, str]: ...
    async def http_post_json(self, url: str, cabecalhos: Mapping[str, str], corpo: str) -> tuple[int, str]: ...


Config = Mapping[str, Any]                # SEGREDO, chaves, listas de recursos… (ver o topo do arquivo)


CABECALHOS = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
}


class Resposta:
    def __init__(self, status: int, dados: Any = None, cabecalhos: Mapping[str, str] | None = None) -> None:
        self.status = status
        self.dados = dados
        self.cabecalhos = dict(cabecalhos or {})

    @property
    def corpo(self) -> str | None:
        return None if self.dados is None or self.status == 204 else json.dumps(self.dados, ensure_ascii=False)


class Pedido:
    """Pedido já lido pelo adaptador (o corpo só é lido depois de conferir o tamanho)."""

    def __init__(self, metodo: str, url: str, cabecalhos: Mapping[str, str] | None, corpo: str | None = "") -> None:
        self.metodo = str(metodo).upper()
        # URL fora do padrão (ex.: mais de 20 campos na query, host IPv6 malformado) não pode estourar
        # antes do tratamento central: o pedido fica marcado e atender() responde 400
        self.invalido = False
        try:
            partes = urlsplit(url)
            self.caminho = partes.path
            self.esquema = partes.scheme.lower()
            self.host = (partes.netloc or "").lower()
            self.query = {k: v[0] for k, v in parse_qs(partes.query, max_num_fields=20).items()}
        except ValueError:
            self.invalido = True
            self.caminho, self.host, self.query = "/api/invalido", "", {}
            self.esquema = ""
        self.cabecalhos = {str(k).lower(): str(v) for k, v in (cabecalhos or {}).items()}
        self.corpo = corpo or ""
        self.ip = (self.cab("cf-connecting-ip") or "").strip()[:64] or "desconhecido"

    def cab(self, nome: str) -> str | None:
        return self.cabecalhos.get(nome.lower())

    def cookie(self, nome: str) -> str | None:
        for parte in (self.cab("cookie") or "").split(";"):
            k, _, v = parte.strip().partition("=")
            if k == nome:
                return v
        return None


class Falha(Exception):
    def __init__(self, status: int, codigo: str, extra: dict[str, Any] | None = None) -> None:
        super().__init__(codigo)
        self.status = status
        self.codigo = codigo
        self.extra = extra or {}


class Contexto:
    def __init__(self, pedido: Pedido, banco: Banco, servicos: Servicos, config: Config, log: Callable[[str], object], agora: float) -> None:
        self.pedido, self.banco, self.servicos, self.config, self.log = pedido, banco, servicos, config, log
        self.agora = int(agora)
        self.segredo = str(config.get("SEGREDO") or "")
        self.req = secrets.token_hex(8)
        self.cabecalhos: dict[str, str] = {}          # cabeçalhos extras da resposta (Set-Cookie)

    def h(self, valor: object) -> str:
        """Identificador estável e não reversível (e-mail, IP) para chaves e logs."""
        return hmac.new(self.segredo.encode(), str(valor).encode("utf-8"), hashlib.sha256).hexdigest()[:32]

    def evento(self, nome: str, email: str | None = None, **campos: Any) -> None:
        """Evento de segurança: sem senha, prova, cookie, código ou e-mail em texto."""
        dados: dict[str, Any] = {"evento": nome, "req": self.req, "ip": self.h(self.pedido.ip)[:12]}
        if email:
            dados["conta"] = self.h(email)[:12]
        dados.update(campos)
        self.log(json.dumps(dados, ensure_ascii=False))


# ---------------- validações ----------------
def _b64(valor: object, minimo: int, maximo: int) -> bytes:
    """Decodifica base64 padrão estrito; lança Falha(400) se inválido."""
    if not isinstance(valor, str) or not (minimo <= len(valor) <= maximo) or len(valor) % 4 or not _B64.match(valor):
        raise Falha(400, "INVALID_REQUEST")
    try:
        return base64.b64decode(valor, validate=True)
    except (binascii.Error, ValueError) as ex:
        raise Falha(400, "INVALID_REQUEST") from ex


def _sal(valor: object) -> str:
    if not 16 <= len(_b64(valor, 24, 88)) <= 64:
        raise Falha(400, "INVALID_REQUEST")
    return str(valor)                                  # _b64 já conferiu que é texto


def _prova(valor: object) -> bytes:
    bruto = _b64(valor, 44, 44)
    if len(bruto) != 32:
        raise Falha(400, "INVALID_REQUEST")
    return bruto


def _verificador(prova_bruta: bytes) -> str:
    return hashlib.sha256(prova_bruta).hexdigest()


def _iteracoes(valor: object) -> int:
    if not isinstance(valor, int) or isinstance(valor, bool) or not ITERACOES_MIN <= valor <= ITERACOES_MAX:
        raise Falha(400, "INVALID_REQUEST")
    return valor


def _kdf(valor: object) -> str:
    """Derivação usada pelo navegador. Ausente = PBKDF2 (navegador de versão anterior)."""
    if valor is None:
        return KDF_PBKDF2
    if valor not in KDFS:
        raise Falha(400, "INVALID_REQUEST")
    return valor


def _versao(valor: object) -> int:
    if not isinstance(valor, int) or isinstance(valor, bool) or not 0 <= valor < MAX_VERSAO:
        raise Falha(400, "INVALID_REQUEST")
    return valor


def _conteudo(valor: object) -> str:
    if isinstance(valor, str) and len(valor) > LIMITE_CONTEUDO:
        raise Falha(413, "DOCUMENT_TOO_LARGE")
    bruto = _b64(valor, 4, LIMITE_CONTEUDO)
    # formato | IV (12) | cifrado + etiqueta GCM (16+)
    if len(bruto) < 1 + 12 + 17 or bruto[0] != FORMATO_DOCUMENTO:
        raise Falha(400, "INVALID_REQUEST")
    return str(valor)                                  # _b64 já conferiu que é texto


def _nome(valor: object) -> str:
    if valor is not None and not isinstance(valor, str):     # objeto ou lista não vira texto ("{'x': 1}")
        raise Falha(400, "INVALID_REQUEST")
    texto = unicodedata.normalize("NFC", valor or "")
    texto = "".join(c for c in texto if unicodedata.category(c) not in ("Cc", "Cf", "Cs", "Co", "Cn"))
    return texto.strip()[:80]


def _email(valor: object) -> str:
    e = str(valor or "").strip().lower() if isinstance(valor, str) else ""
    if not e or len(e) > 254 or not _EMAIL.match(e) or any(unicodedata.category(c).startswith("C") for c in e):
        raise Falha(400, "INVALID_REQUEST")
    return e


def _json(pedido: Pedido) -> Json:
    if not (pedido.cab("content-type") or "").lower().startswith("application/json"):
        raise Falha(415, "INVALID_REQUEST")
    if len(pedido.corpo.encode("utf-8")) > LIMITE_CORPO:
        raise Falha(413, "DOCUMENT_TOO_LARGE")
    try:
        dados = json.loads(pedido.corpo or "{}")
    except (ValueError, RecursionError) as ex:            # RecursionError: JSON aninhado demais ("[[[[…")
        raise Falha(400, "INVALID_REQUEST") from ex
    if not isinstance(dados, dict):
        raise Falha(400, "INVALID_REQUEST")
    return dados


def _mesma_origem(pedido: Pedido) -> None:
    """Bloqueia pedidos de escrita vindos de outros sites (CSRF)."""
    if pedido.metodo in ("GET", "HEAD", "OPTIONS"):
        return
    site = (pedido.cab("sec-fetch-site") or "").lower()
    if site and site not in ("same-origin", "none"):
        raise Falha(403, "FORBIDDEN")
    origem = pedido.cab("origin")
    if origem is not None:
        try:
            partes = urlsplit(origem)
            valida = (partes.scheme.lower() == pedido.esquema and partes.scheme.lower() in ("http", "https")
                      and partes.netloc.lower() == pedido.host and not partes.path and not partes.query
                      and not partes.fragment and partes.username is None and partes.password is None)
        except ValueError:
            valida = False
        if not valida:
            raise Falha(403, "FORBIDDEN")


mesma_origem = _mesma_origem       # pública para o app FastAPI (app_fastapi.py), que confere CSRF antes de validar o corpo


# ---------------- limites (bloqueio progressivo e contadores por IP) ----------------
async def _limite(ctx: Contexto, chave: str) -> Linha | None:
    return await ctx.banco.primeiro("SELECT falhas, ultima, bloqueado_ate FROM limites WHERE chave = ?", chave)


def _proxima(ctx: Contexto, linha: Linha | None) -> int:
    """Número que a próxima tentativa terá (o contador zera após 24 h sem falhas)."""
    return 1 if not linha or ctx.agora - linha["ultima"] >= ESQUECE_S else linha["falhas"] + 1


async def _reservar(ctx: Contexto, chave: str) -> Linha | None:
    """
    Conta a tentativa ANTES de conferir (um único comando atômico): pedidos em paralelo
    não leem o contador antigo. Na 5ª e na 10ª tentativa o bloqueio já é gravado aqui;
    durante um bloqueio nada muda e nada é devolvido (None = bloqueado).
    """
    a, z = ctx.agora, ESQUECE_S
    n = "(CASE WHEN ? - limites.ultima >= ? THEN 1 ELSE limites.falhas + 1 END)"
    return await ctx.banco.primeiro(
        "INSERT INTO limites (chave, falhas, ultima, bloqueado_ate) VALUES (?, 1, ?, 0) "
        f"ON CONFLICT(chave) DO UPDATE SET falhas = {n}, "
        f"bloqueado_ate = CASE {n} WHEN ? THEN ? WHEN ? THEN ? ELSE limites.bloqueado_ate END, "
        "ultima = ? WHERE limites.bloqueado_ate <= ? RETURNING falhas, bloqueado_ate",
        chave, a, a, z, a, z, BLOQUEIO_1, a + BLOQUEIO_1_S, BLOQUEIO_2, a + BLOQUEIO_2_S, a, a)


async def _registrar_falha(ctx: Contexto, chave: str) -> Linha | None:
    """Mesma contagem de _reservar, usada depois de conferir (rotas que já exigem sessão)."""
    return await _reservar(ctx, chave)


async def _contar(ctx: Contexto, chave: str, limite: int, janela: int) -> bool:
    """Contador por janela fixa (cadastro/consultas por IP). True se passou do limite."""
    a = ctx.agora
    r = await ctx.banco.primeiro(
        "INSERT INTO limites (chave, falhas, ultima) VALUES (?, 1, ?) ON CONFLICT(chave) DO UPDATE SET "
        "falhas = CASE WHEN ? - limites.ultima >= ? THEN 1 ELSE limites.falhas + 1 END, "
        "ultima = CASE WHEN ? - limites.ultima >= ? THEN ? ELSE limites.ultima END RETURNING falhas",
        chave, a, a, janela, a, janela, a)
    return r is not None and r["falhas"] > limite


def _bloqueado(ctx: Contexto, linha: Linha | None) -> Falha | None:
    if linha and linha["bloqueado_ate"] > ctx.agora:
        return Falha(429, "TOO_MANY_ATTEMPTS", {"espera": linha["bloqueado_ate"] - ctx.agora})
    return None


async def _limpar_login(ctx: Contexto, email: str) -> None:
    h = ctx.h(email)
    await ctx.banco.executar("DELETE FROM limites WHERE chave LIKE ? OR chave = ? OR chave = ?",
                             f"login|{h}|%", f"conta|{h}", f"2fa|{h}")


async def _captcha_ok(ctx: Contexto, token: object) -> bool:
    """
    Turnstile. Sem CAPTCHA configurado (nem chave pública nem secreta: desenvolvimento), a etapa é pulada
    (o bloqueio continua valendo). Chave pública SEM a secreta é configuração incompleta: recusa (não
    deixa a proteção desligada sem ninguém perceber).
    """
    segredo = str(ctx.config.get("TURNSTILE_SECRET") or "")
    if not segredo:
        if str(ctx.config.get("TURNSTILE_SITE_KEY") or ""):
            ctx.evento("captcha_sem_segredo")
            raise Falha(503, "UNAVAILABLE")
        return True
    if not isinstance(token, str) or not token or len(token) > 2048:
        return False
    status, texto = await ctx.servicos.http_post(TURNSTILE_URL, {"secret": segredo, "response": token, "remoteip": ctx.pedido.ip})
    if status != 200:
        raise Falha(503, "UNAVAILABLE")
    try:
        return json.loads(texto).get("success") is True
    except (ValueError, AttributeError):
        return False


# ---------------- sessões ----------------
def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("ascii")).hexdigest()


def _nome_cookie(ctx: Contexto) -> str:
    return COOKIE_DEV if str(ctx.config.get("COOKIE_SEGURO", "1")) == "0" else COOKIE_SEGURO


def _definir_cookie(ctx: Contexto, valor: str | None = None) -> None:
    atributos = "Path=/; HttpOnly; SameSite=Strict" + ("" if _nome_cookie(ctx) == COOKIE_DEV else "; Secure")
    # Sem Max-Age/Expires: cookie de sessão (o navegador apaga ao ser fechado)
    ctx.cabecalhos["Set-Cookie"] = f"{_nome_cookie(ctx)}={valor}; {atributos}" if valor else f"{_nome_cookie(ctx)}=; Max-Age=0; {atributos}"


def _envelope(ctx: Contexto, token: str) -> str:
    """
    Chave AES que cifra a chave dos dados guardada no navegador. Derivada do cookie (que o JavaScript
    não lê) com o SEGREDO do servidor e NUNCA gravada: quem tiver o banco e o armazenamento do
    navegador ainda precisaria do cookie e do SEGREDO (a coluna "envelope" fica vazia).
    """
    return base64.b64encode(hmac.new(ctx.segredo.encode(), ("zozo/envelope/v2|" + token).encode("ascii"), hashlib.sha256).digest()).decode("ascii")


async def _criar_sessao(ctx: Contexto, email: str, estado: str) -> str:
    anterior = ctx.pedido.cookie(_nome_cookie(ctx))
    if anterior and len(anterior) <= 128:            # o cookie será trocado: a sessão antiga deste navegador termina
        await ctx.banco.executar("DELETE FROM sessoes WHERE id = ?", _hash_token(anterior))
    token = secrets.token_urlsafe(32)
    envelope = _envelope(ctx, token)
    await ctx.banco.executar(
        "INSERT INTO sessoes (id, email, estado, envelope, criada, ultimo_uso) VALUES (?, ?, ?, ?, ?, ?)",
        _hash_token(token), email, estado, "", ctx.agora, ctx.agora)
    _definir_cookie(ctx, token)
    if email == DEMO_EMAIL:
        # Senha pública: qualquer um abre sessões da demo. A tabela não cresce sem limite.
        await ctx.banco.executar("DELETE FROM sessoes WHERE email = ? AND ultimo_uso < ?", email, ctx.agora - DEMO_OCIOSA_S)
        await ctx.banco.executar(
            "DELETE FROM sessoes WHERE email = ? AND id NOT IN (SELECT id FROM sessoes WHERE email = ? ORDER BY ultimo_uso DESC, criada DESC LIMIT ?)",
            email, email, DEMO_SESSOES_MAX)
    if secrets.randbelow(20) == 0:          # limpeza ocasional do que já venceu
        await ctx.banco.executar(
            "DELETE FROM sessoes WHERE ultimo_uso < ? OR criada < ? OR (estado = '2fa' AND criada < ?)",
            ctx.agora - SESSAO_OCIOSA_S, ctx.agora - SESSAO_MAXIMA_S, ctx.agora - SESSAO_2FA_S)
        await ctx.banco.executar("DELETE FROM limites WHERE ultima < ? AND bloqueado_ate < ?", ctx.agora - 2 * ESQUECE_S, ctx.agora)
    return envelope


async def _sessao(ctx: Contexto, estado: str = "ativa") -> Linha | None:
    """Sessão válida do cookie (ou None). Sessões vencidas são apagadas."""
    token = ctx.pedido.cookie(_nome_cookie(ctx))
    if not token or len(token) > 128:
        return None
    sid = _hash_token(token)
    s = await ctx.banco.primeiro("SELECT id, email, estado, criada, ultimo_uso FROM sessoes WHERE id = ?", sid)
    if not s:
        return None
    vencida = (ctx.agora - s["ultimo_uso"] > SESSAO_OCIOSA_S or ctx.agora - s["criada"] > SESSAO_MAXIMA_S
               or (s["estado"] == "2fa" and ctx.agora - s["criada"] > SESSAO_2FA_S))
    if vencida:
        await ctx.banco.executar("DELETE FROM sessoes WHERE id = ?", sid)
        return None
    if s["estado"] != estado:
        return None
    if ctx.agora - s["ultimo_uso"] > TOQUE_SESSAO_S:
        await ctx.banco.executar("UPDATE sessoes SET ultimo_uso = ? WHERE id = ?", ctx.agora, sid)
    return s


async def _encerrar_outras(ctx: Contexto, email: str, manter_id: str) -> None:
    await ctx.banco.executar("DELETE FROM sessoes WHERE email = ? AND id != ?", email, manter_id)


def _na_lista(ctx: Contexto, segredo: str, email: str, verificado: object) -> bool:
    """
    E-mail liberado num segredo de lista (separada por vírgula) — e só se a conta tiver o e-mail
    CONFIRMADO (pelo Google; as contas anteriores à 2.5 foram marcadas na migração 0005).
    Cadastrar antes um e-mail da lista não dá o recurso. A demonstração tem tudo.
    """
    if email == DEMO_EMAIL:
        return True
    if not verificado:
        return False
    # Tolerante ao jeito de digitar o segredo: vírgula, ponto e vírgula, espaço ou quebra de linha
    # separam; aspas e caracteres invisíveis (ex.: marca BOM colada pelo terminal) são ignorados
    texto = "".join(c for c in str(ctx.config.get(segredo) or "") if unicodedata.category(c) != "Cf")
    lista = {e.strip("\"'<>").lower() for e in re.split(r"[,;\s]+", texto) if e.strip("\"'<>")}
    return email in lista


def _avancado(ctx: Contexto, email: str, verificado: object = False) -> bool:
    """Perfis, faturas e Pix: segredo RECURSOS_AVANCADOS."""
    return _na_lista(ctx, "RECURSOS_AVANCADOS", email, verificado)


def _sessao_publica(ctx: Contexto, email: str, nome: str, envelope: str, dois_fatores: object, verificado: object = False) -> Json:
    av = _avancado(ctx, email, verificado)
    # Levar transações de uma moeda para outra (multicâmbio): contas avançadas + segredo RECURSOS_CAMBIO
    cambio = av or _na_lista(ctx, "RECURSOS_CAMBIO", email, verificado)
    return {"email": email, "nome": nome, "envelope": envelope, "doisFatores": bool(dois_fatores),
            "demo": email == DEMO_EMAIL, "recursos": {"perfis": av, "boleto": av, "pix": av, "cambio": cambio}}


# ---------------- prova da senha (rotas com sessão) ----------------
async def _conferir_prova(ctx: Contexto, email: str) -> Linha:
    """Confere a prova do cabeçalho X-ZoZo-Prova. Erros contam no mesmo bloqueio do login (e-mail + IP)."""
    conta = await ctx.banco.primeiro(
        "SELECT nome, verificador, totp_segredo, totp_pendente, totp_ultimo_passo, protecao_avancada FROM contas WHERE email = ?", email)
    if not conta:
        raise Falha(401, "UNAUTHORIZED")
    chave = f"login|{ctx.h(email)}|{ctx.h(ctx.pedido.ip)}"
    linha = await _limite(ctx, chave)
    bloqueio = _bloqueado(ctx, linha)
    if bloqueio:
        raise bloqueio
    try:
        ok = hmac.compare_digest(_verificador(_prova(ctx.pedido.cab("x-zozo-prova"))), str(conta["verificador"]))
    except Falha:
        ok = False
    if not ok:
        await _registrar_falha(ctx, chave)
        ctx.evento("prova_recusada", email)
        raise Falha(403, "WRONG_PASSWORD")
    if linha:
        await ctx.banco.executar("DELETE FROM limites WHERE chave = ?", chave)
    return conta


async def _exigir_codigo_atual(ctx: Contexto, email: str, conta: Linha, codigo: object) -> None:
    """
    Conta com 2FA: ações que não têm volta (excluir a conta, trocar a senha, desligar a proteção avançada) pedem um
    código ATUAL do aplicativo — a sessão e a prova guardadas no navegador não bastam. Mesmo bloqueio do código no
    login (5 erros → 15 min) e o código usado não serve de novo. Conta sem 2FA: nada a conferir.
    """
    if not conta["totp_segredo"]:
        return
    if codigo is None:
        raise Falha(401, "CODE_REQUIRED")
    chave = f"2fa|{ctx.h(email)}"
    r = await _reservar(ctx, chave)
    if not r:
        raise _bloqueado(ctx, await _limite(ctx, chave)) or Falha(429, "TOO_MANY_ATTEMPTS", {"espera": BLOQUEIO_1_S})
    segredo = totp.decifrar(conta["totp_segredo"], ctx.segredo)
    passo = totp.conferir(segredo, codigo, ctx.agora, conta["totp_ultimo_passo"]) if segredo else None
    if passo is not None:
        n = await ctx.banco.executar("UPDATE contas SET totp_ultimo_passo = ? WHERE email = ? AND totp_ultimo_passo < ?", passo, email, passo)
        passo = passo if n == 1 else None
    if passo is None:
        ctx.evento("2fa_acao_recusada", email, tentativa=r["falhas"])
        raise Falha(401, "CODE_INVALID", {"espera": r["bloqueado_ate"] - ctx.agora} if r["bloqueado_ate"] > ctx.agora else {})
    await ctx.banco.executar("DELETE FROM limites WHERE chave = ?", chave)


def _gravar_documento(email: str, versao_anterior: int, conteudo: str) -> Comando:
    """Comandos que gravam o documento só se a versão no banco ainda for a lida (concorrência otimista)."""
    if versao_anterior == 0:
        return ("INSERT INTO documentos (email, versao, conteudo) SELECT ?, 1, ? "
                "WHERE NOT EXISTS (SELECT 1 FROM documentos WHERE email = ?)", (email, conteudo, email))
    return (f"UPDATE documentos SET versao = ?, conteudo = ?, atualizado_em = {_AGORA_SQL} "
            "WHERE email = ? AND versao = ?", (versao_anterior + 1, conteudo, email, versao_anterior))


# A tabela "guarda" só aceita ok = 1: se o comando anterior não alterou exatamente
# uma linha, a inserção falha e o lote inteiro é desfeito (nada fica pela metade).
_GUARDA: Comando = ("INSERT INTO guarda (ok) VALUES (changes())", ())
_LIMPA_GUARDA: Comando = ("DELETE FROM guarda", ())


async def _lote_atomico(banco: Banco, comandos: Sequence[Comando]) -> list[int]:
    try:
        return await banco.lote(comandos)
    except Exception as ex:  # noqa: BLE001 — o driver do banco lança tipos variados
        if "CHECK constraint failed" in str(ex):
            raise Falha(409, "DATA_CHANGED") from ex
        raise


# ---------------- rotas públicas (sem sessão) ----------------
async def _parametros(ctx: Contexto) -> Resposta:
    """Sal e iterações para o navegador derivar a senha. E-mail sem conta recebe um sal simulado e estável."""
    email = _email(ctx.pedido.query.get("email"))
    if await _contar(ctx, f"consulta|{ctx.h(ctx.pedido.ip)}", CONSULTAS_POR_IP, CONSULTA_JANELA_S):
        raise Falha(429, "TOO_MANY_ATTEMPTS", {"espera": CONSULTA_JANELA_S})
    conta = await ctx.banco.primeiro("SELECT sal, iteracoes, kdf FROM contas WHERE email = ?", email)
    if conta:
        return Resposta(200, {"sal": conta["sal"], "iteracoes": conta["iteracoes"], "kdf": conta["kdf"] or KDF_PBKDF2})
    # e-mail sem conta: parâmetros iguais aos de uma conta nova (Argon2id). Contas Argon2id ficam indistinguíveis
    # de e-mails sem conta; contas ANTIGAS ainda em PBKDF2 respondem "pbkdf2" e, por isso, revelam que existem
    # até o próximo login (a 3.12 as converte para Argon2id ali, PUT /api/conta/kdf). Mitigação: limite de consultas por IP.
    falso = hmac.new(ctx.segredo.encode(), ("sal-simulado|" + email).encode("utf-8"), hashlib.sha256).digest()[:16]
    return Resposta(200, {"sal": base64.b64encode(falso).decode("ascii"), "iteracoes": ITERACOES_MIN, "kdf": KDF_ARGON2})


async def _cadastrar(ctx: Contexto) -> Resposta:
    b = _json(ctx.pedido)
    if await _contar(ctx, f"cadastro|{ctx.h(ctx.pedido.ip)}", CADASTROS_POR_IP, CADASTRO_JANELA_S):
        ctx.evento("cadastro_limitado")
        raise Falha(429, "TOO_MANY_ATTEMPTS", {"espera": CADASTRO_JANELA_S})
    email = _email(b.get("email"))
    if email == DEMO_EMAIL:                       # a conta de demonstração já existe (migração) e não é recriada
        raise Falha(409, "EMAIL_IN_USE")
    if not _google_confirmado(ctx, email) and not await _captcha_ok(ctx, b.get("turnstile")):
        raise Falha(428, "CAPTCHA_REQUIRED")
    sal, it, prova, kdf = _sal(b.get("sal")), _iteracoes(b.get("iteracoes")), _prova(b.get("prova")), _kdf(b.get("kdf"))
    nome = _nome(b.get("nome"))
    if not nome:
        raise Falha(400, "INVALID_REQUEST")
    google_ok = _google_confirmado(ctx, email)
    verificado = 1 if google_ok else 0                    # o Google confirmou que a pessoa é dona do e-mail
    if emails.ativo(ctx.config) and not google_ok:
        return await _cadastrar_pendente(ctx, email, nome, sal, it, prova, kdf)
    # O Google provou a posse do e-mail: um cadastro PENDENTE (nunca confirmado, talvez de outra pessoa) dá lugar a este
    descartar: list[Comando] = [("DELETE FROM contas WHERE email = ? AND confirmacao_pendente = 1", (email,))] if google_ok else []
    n = (await ctx.banco.lote(descartar + [(
        "INSERT OR IGNORE INTO contas (email, nome, sal, iteracoes, verificador, email_verificado, kdf) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (email, nome, sal, it, _verificador(prova), verificado, kdf))]))[-1]
    if not n:
        raise Falha(409, "EMAIL_IN_USE")
    envelope = await _criar_sessao(ctx, email, "ativa")
    ctx.evento("cadastro", email)
    return Resposta(201, _sessao_publica(ctx, email, nome, envelope, False, verificado))


# ---------------- confirmação de e-mail ----------------
def _hash_link(token: str) -> str:
    return hashlib.sha256(("zozo/email/v1|" + token).encode("utf-8")).hexdigest()


async def _enviar_confirmacao(ctx: Contexto, email: str, verificador: str) -> None:
    """
    Novo link e o e-mail. Limitado por endereço. Links anteriores do MESMO cadastro (mesma senha) continuam
    valendo até vencer — um reenvio não estraga o e-mail que a pessoa está para abrir; os de um cadastro
    refeito (outra senha) e os vencidos deixam de existir.
    """
    if await _contar(ctx, f"email|{ctx.h(email)}", EMAILS_POR_CONTA, EMAIL_JANELA_S):
        ctx.evento("email_limitado", email)
        return
    token = secrets.token_urlsafe(32)
    await ctx.banco.lote([
        ("DELETE FROM tokens_email WHERE email = ? AND finalidade = 'confirmar' AND (verificador != ? OR expira < ?)",
         (email, verificador, int(ctx.agora))),
        ("INSERT INTO tokens_email (hash, email, finalidade, verificador, expira) VALUES (?, ?, 'confirmar', ?, ?)",
         (_hash_link(token), email, verificador, int(ctx.agora) + CONFIRMACAO_S)),
    ])
    ok = await emails.enviar(ctx.servicos, ctx.config, email, emails.confirmacao(ctx.config, token))
    ctx.evento("email_confirmacao_enviado" if ok else "email_falhou", email)


async def _cadastrar_pendente(ctx: Contexto, email: str, nome: str, sal: str, it: int, prova: bytes, kdf: str) -> Resposta:
    """
    Cadastro com e-mail ligado: a conta nasce pendente e só entra depois do link.
    Resposta SEMPRE igual (202) — e-mail novo, pendente ou já cadastrado —, para não revelar quem tem conta.
    Um cadastro ainda pendente é SUBSTITUÍDO pelo mais recente (quem errou a senha refaz o cadastro):
    isso não abre sequestro porque a confirmação exige o link E a senha juntos (ver _confirmar_no_login).
    """
    await ctx.banco.executar(
        "DELETE FROM contas WHERE confirmacao_pendente = 1 AND email != ? AND criado_em < strftime('%Y-%m-%dT%H:%M:%fZ', ?, 'unixepoch')",
        DEMO_EMAIL, int(ctx.agora) - PENDENTE_APAGA_S)
    existente = await ctx.banco.primeiro("SELECT confirmacao_pendente FROM contas WHERE email = ?", email)
    if existente and not existente["confirmacao_pendente"]:
        # já tem conta confirmada: avisa o dono por e-mail (limitado) e responde igual a um cadastro novo
        if not await _contar(ctx, f"email|{ctx.h(email)}", EMAILS_POR_CONTA, EMAIL_JANELA_S):
            await emails.enviar(ctx.servicos, ctx.config, email, emails.ja_tem_conta(ctx.config))
        ctx.evento("cadastro_email_existente", email)
        return Resposta(202, {"confirmar": True})
    verificador = _verificador(prova)
    pendente: list[Comando] = [("DELETE FROM contas WHERE email = ? AND confirmacao_pendente = 1", (email,))] if existente else []
    await ctx.banco.lote(pendente + [
        ("INSERT OR IGNORE INTO contas (email, nome, sal, iteracoes, verificador, email_verificado, kdf, confirmacao_pendente) "
         "VALUES (?, ?, ?, ?, ?, 0, ?, 1)", (email, nome, sal, it, verificador, kdf)),
    ])
    ctx.evento("cadastro_pendente", email)
    await _enviar_confirmacao(ctx, email, verificador)
    return Resposta(202, {"confirmar": True})


async def _confirmar_no_login(ctx: Contexto, email: str, token: object) -> None:
    """
    Confirma o e-mail DENTRO do login, depois de a senha conferir: o token prova a posse da caixa de
    entrada e a prova prova a senha. Só o link mais recente vale, uma única vez e por 24 h.
    """
    if not isinstance(token, str) or not re.fullmatch(r"[A-Za-z0-9_-]{20,100}", token):
        raise Falha(400, "TOKEN_INVALID")
    hash_ = _hash_link(token)
    # o link só vale para o cadastro (a senha) que o gerou
    t = await ctx.banco.primeiro(
        "SELECT t.expira, t.usado FROM tokens_email t JOIN contas c ON c.email = t.email AND c.verificador = t.verificador "
        "WHERE t.hash = ? AND t.email = ? AND t.finalidade = 'confirmar'", hash_, email)
    if not t or t["usado"] or int(t["expira"]) < int(ctx.agora):
        ctx.evento("confirmacao_recusada", email)
        raise Falha(400, "TOKEN_INVALID")
    await _lote_atomico(ctx.banco, [
        ("UPDATE tokens_email SET usado = 1 WHERE hash = ? AND usado = 0", (hash_,)), _GUARDA, _LIMPA_GUARDA,
        ("UPDATE contas SET confirmacao_pendente = 0, email_verificado = 1 WHERE email = ? AND confirmacao_pendente = 1", (email,)),
        _GUARDA, _LIMPA_GUARDA,
        ("DELETE FROM tokens_email WHERE email = ? AND usado = 0", (email,)),
    ])
    ctx.evento("email_confirmado", email)


async def _conferir_link(ctx: Contexto) -> Resposta:
    """
    Tela aberta pelo link do e-mail: diz se o link ainda serve, SEM usá-lo (a conta só é ativada no login,
    com o link E a senha). Devolve o e-mail do cadastro para a tela já pedir a senha certa: quem tem o
    link tem a caixa de entrada. Link já usado com a conta ativa: avisa que a conta está ativa.
    """
    if await _contar(ctx, f"link|{ctx.h(ctx.pedido.ip)}", LINKS_POR_IP, LINK_JANELA_S):
        raise Falha(429, "TOO_MANY_ATTEMPTS", {"espera": LINK_JANELA_S})
    token = _json(ctx.pedido).get("token")
    if not isinstance(token, str) or not re.fullmatch(r"[A-Za-z0-9_-]{20,100}", token):
        raise Falha(400, "TOKEN_INVALID")
    t = await ctx.banco.primeiro(
        "SELECT t.email, t.expira, t.usado, c.confirmacao_pendente FROM tokens_email t "
        "JOIN contas c ON c.email = t.email AND c.verificador = t.verificador WHERE t.hash = ? AND t.finalidade = 'confirmar'",
        _hash_link(token))
    if t and t["usado"] and not t["confirmacao_pendente"]:
        return Resposta(200, {"email": t["email"], "ativa": True})
    if not t or t["usado"] or not t["confirmacao_pendente"] or int(t["expira"]) < int(ctx.agora):
        ctx.evento("link_recusado")
        raise Falha(400, "TOKEN_INVALID")
    return Resposta(200, {"email": t["email"], "ativa": False})


async def _reenviar_confirmacao(ctx: Contexto) -> Resposta:
    """Sempre 202 (não revela se o e-mail tem cadastro pendente)."""
    b = _json(ctx.pedido)
    email = _email(b.get("email"))
    if await _contar(ctx, f"reenviar|{ctx.h(ctx.pedido.ip)}", CADASTROS_POR_IP, CADASTRO_JANELA_S):
        raise Falha(429, "TOO_MANY_ATTEMPTS", {"espera": CADASTRO_JANELA_S})
    if emails.ativo(ctx.config):
        c = await ctx.banco.primeiro("SELECT verificador FROM contas WHERE email = ? AND confirmacao_pendente = 1", email)
        if c:
            await _enviar_confirmacao(ctx, email, c["verificador"])
    return Resposta(202, {"ok": True})


# ---------------- troca da chave com o histórico recifrado (migração Argon2id e recuperação de senha) ----------------
async def _guardar_etapa(ctx: Contexto, email: str, b: Json, campos: set[str]) -> None:
    """Uma cópia do histórico já recifrada com a chave nova, guardada à parte (kdf_etapas) até o fechamento."""
    if set(b) != campos:
        raise Falha(400, "INVALID_REQUEST")
    sal, v, conteudo = _sal(b.get("sal")), _versao(b.get("versao")), _conteudo(b.get("conteudo"))
    if not await ctx.banco.primeiro("SELECT 1 AS x FROM historico WHERE email = ? AND versao = ?", email, v):
        raise Falha(400, "INVALID_REQUEST")
    await ctx.banco.lote([
        ("DELETE FROM kdf_etapas WHERE email = ? AND sal != ?", (email, sal)),
        ("INSERT INTO kdf_etapas (email, sal, versao, conteudo) VALUES (?, ?, ?, ?) "
         "ON CONFLICT(email, versao) DO UPDATE SET sal = excluded.sal, conteudo = excluded.conteudo, "
         f"enviado_em = {_AGORA_SQL}", (email, sal, v, conteudo)),
    ])


async def _historico_recifrado(ctx: Contexto, email: str, b: Json, sal: str, completo: bool) -> tuple[list[Comando], list[Comando]]:
    """
    Confere o histórico recifrado (o que veio junto + o das etapas com este sal) e devolve os comandos da
    transação: (antes da gravação do documento, depois dela). Só versões que existem, sem repetir.
    completo=True: tem de cobrir TODAS as versões (migração automática nunca descarta backup).
    completo=False: recuperação de senha — uma cópia que já não abria fica de fora (as datas das outras ficam).
    """
    hist = b.get("historico", [])
    if not isinstance(hist, list) or len(hist) > 10:
        raise Falha(400, "INVALID_REQUEST")
    existentes = {int(r["versao"]): r["criado_em"] for r in await ctx.banco.todos(
        "SELECT versao, criado_em FROM historico WHERE email = ?", email)}
    novas: list[tuple[int, str]] = []
    for item in hist:
        if not isinstance(item, dict) or set(item) != {"versao", "conteudo"}:
            raise Falha(400, "INVALID_REQUEST")
        v = _versao(item.get("versao"))
        # só versões que já existem (recifradas), sem repetir: o navegador não inventa cópias de segurança
        if v not in existentes or any(v == x[0] for x in novas):
            raise Falha(400, "INVALID_REQUEST")
        novas.append((v, _conteudo(item.get("conteudo"))))
    etapas = {int(r["versao"]) for r in await ctx.banco.todos(
        "SELECT versao FROM kdf_etapas WHERE email = ? AND sal = ?", email, sal)}
    if etapas & {v for v, _ in novas}:
        raise Falha(400, "INVALID_REQUEST")                # a mesma cópia por dois caminhos
    if completo and {v for v, _ in novas} | etapas != set(existentes):
        # Cliente antigo, pedido truncado ou etapa que faltou não podem apagar backups numa migração automática.
        raise Falha(409, "DATA_CHANGED")
    # cópias das etapas: ganham a data original e entram no histórico; a guarda confere que vieram TODAS
    # (se outra tentativa trocou as etapas no meio do caminho, a transação inteira é desfeita)
    antes: list[Comando] = [
        ("UPDATE kdf_etapas SET criado_em = (SELECT h.criado_em FROM historico h WHERE h.email = kdf_etapas.email "
         "AND h.versao = kdf_etapas.versao ORDER BY h.id DESC LIMIT 1) WHERE email = ? AND sal = ?", (email, sal)),
        ("INSERT INTO guarda (ok) VALUES (changes() = ?)", (len(etapas),)), _LIMPA_GUARDA,
    ] if etapas else []
    depois: list[Comando] = [
        # o histórico passa a ser o recifrado, com as datas originais
        ("DELETE FROM historico WHERE email = ?", (email,)),
        *[("INSERT INTO historico (email, versao, conteudo, criado_em) VALUES (?, ?, ?, ?)", (email, v, cv, existentes[v])) for v, cv in novas],
        *([("INSERT INTO historico (email, versao, conteudo, criado_em) "
            "SELECT email, versao, conteudo, criado_em FROM kdf_etapas WHERE email = ? AND sal = ?", (email, sal)),
           ("INSERT INTO guarda (ok) VALUES (changes() = ?)", (len(etapas),)), _LIMPA_GUARDA] if etapas else []),
        ("DELETE FROM kdf_etapas WHERE email = ?", (email,)),
    ]
    return antes, depois


# ---------------- recuperação de senha ("Esqueci minha senha") ----------------
def _hash_recuperacao(token: str) -> str:
    return hashlib.sha256(("zozo/recuperar/v1|" + token).encode("utf-8")).hexdigest()


def _chave_custodia(ctx: Contexto, email: str, nonce: str) -> str:
    """Chave que tranca a cópia da chave dos dados. Só o servidor calcula (HMAC do SEGREDO); não fica guardada."""
    return base64.b64encode(hmac.new(ctx.segredo.encode(), ("zozo/custodia/v1|" + email + "|" + nonce).encode("utf-8"),
                                     hashlib.sha256).digest()).decode("ascii")


async def _pedir_recuperacao(ctx: Contexto) -> Resposta:
    """Sempre 202 (não revela se o e-mail tem conta). Link de 1 h; no máximo 3 e-mails por hora por endereço."""
    b = _json(ctx.pedido)
    email = _email(b.get("email"))
    if await _contar(ctx, f"recuperar|{ctx.h(ctx.pedido.ip)}", RECUPERACOES_POR_IP, RECUPERACAO_JANELA_S):
        raise Falha(429, "TOO_MANY_ATTEMPTS", {"espera": RECUPERACAO_JANELA_S})
    if not emails.ativo(ctx.config) or email == DEMO_EMAIL:
        return Resposta(202, {"ok": True})
    c = await ctx.banco.primeiro("SELECT nome, verificador FROM contas WHERE email = ? AND confirmacao_pendente = 0", email)
    if not c:
        return Resposta(202, {"ok": True})
    if await _contar(ctx, f"email|{ctx.h(email)}", EMAILS_POR_CONTA, EMAIL_JANELA_S):
        ctx.evento("email_limitado", email)
        return Resposta(202, {"ok": True})
    token = secrets.token_urlsafe(32)
    await ctx.banco.lote([
        ("DELETE FROM tokens_recuperacao WHERE email = ? AND (expira < ? OR usado = 1 OR verificador != ?)",
         (email, int(ctx.agora), c["verificador"])),
        ("INSERT INTO tokens_recuperacao (hash, email, verificador, expira) VALUES (?, ?, ?, ?)",
         (_hash_recuperacao(token), email, c["verificador"], int(ctx.agora) + RECUPERACAO_S)),
    ])
    ok = await emails.enviar(ctx.servicos, ctx.config, email, emails.recuperacao(ctx.config, token, c["nome"]))
    ctx.evento("recuperacao_enviada" if ok else "email_falhou", email)
    return Resposta(202, {"ok": True})


async def _token_recuperacao(ctx: Contexto, token: object, aberto: bool = False) -> Linha:
    """Link válido: existe, não usado, no prazo e da senha ATUAL (trocou a senha, os links antigos morrem)."""
    if not isinstance(token, str) or not re.fullmatch(r"[A-Za-z0-9_-]{20,100}", token):
        raise Falha(400, "TOKEN_INVALID")
    t = await ctx.banco.primeiro(
        "SELECT t.hash, t.email, t.expira, t.aberto, c.nome, c.verificador, c.totp_segredo, c.totp_ultimo_passo, c.protecao_avancada "
        "FROM tokens_recuperacao t JOIN contas c ON c.email = t.email AND c.verificador = t.verificador "
        "WHERE t.hash = ? AND t.usado = 0 AND c.confirmacao_pendente = 0", _hash_recuperacao(token))
    if not t or int(t["expira"]) < int(ctx.agora) or (aberto and not t["aberto"]):
        ctx.evento("recuperacao_recusada")
        raise Falha(400, "TOKEN_INVALID")
    return t


async def _abrir_recuperacao(ctx: Contexto) -> Resposta:
    """
    Link do e-mail aberto (+ código do 2FA, se a conta tiver): devolve a cópia da chave e a chave de custódia,
    o documento e o histórico (cifrados) — o navegador abre, recifra com a senha nova e conclui.
    Proteção avançada (ou cópia ainda não guardada): sem cópia; a conta só pode recomeçar vazia.
    """
    if await _contar(ctx, f"link|{ctx.h(ctx.pedido.ip)}", LINKS_POR_IP, LINK_JANELA_S):
        raise Falha(429, "TOO_MANY_ATTEMPTS", {"espera": LINK_JANELA_S})
    b = _json(ctx.pedido)
    t = await _token_recuperacao(ctx, b.get("token"))
    email = t["email"]
    if t["totp_segredo"]:
        if b.get("codigo") is None:
            raise Falha(401, "CODE_REQUIRED")
        chave = f"2fa|{ctx.h(email)}"                        # mesmo bloqueio do código no login
        r = await _reservar(ctx, chave)
        if not r:
            raise _bloqueado(ctx, await _limite(ctx, chave)) or Falha(429, "TOO_MANY_ATTEMPTS", {"espera": BLOQUEIO_1_S})
        segredo = totp.decifrar(t["totp_segredo"], ctx.segredo)
        passo = totp.conferir(segredo, b.get("codigo"), ctx.agora, t["totp_ultimo_passo"]) if segredo else None
        if passo is not None:
            n = await ctx.banco.executar("UPDATE contas SET totp_ultimo_passo = ? WHERE email = ? AND totp_ultimo_passo < ?",
                                         passo, email, passo)
            passo = passo if n == 1 else None
        if passo is None:
            ctx.evento("recuperacao_2fa_falhou", email, tentativa=r["falhas"])
            raise Falha(401, "CODE_INVALID", {"espera": r["bloqueado_ate"] - ctx.agora} if r["bloqueado_ate"] > ctx.agora else {})
        await ctx.banco.executar("DELETE FROM limites WHERE chave = ?", chave)
    await ctx.banco.executar("UPDATE tokens_recuperacao SET aberto = 1 WHERE hash = ?", t["hash"])
    cu = None if t["protecao_avancada"] else await ctx.banco.primeiro(
        "SELECT nonce, chave FROM custodia WHERE email = ? AND verificador = ?", email, t["verificador"])
    doc = await ctx.banco.primeiro("SELECT versao, conteudo FROM documentos WHERE email = ?", email)
    resposta: Json = {"email": email, "versao": int(doc["versao"]) if doc else 0, "custodia": None, "documento": None, "historico": []}
    if cu:
        resposta["custodia"] = {"nonce": cu["nonce"], "chave": cu["chave"], "r": _chave_custodia(ctx, email, cu["nonce"])}
        resposta["documento"] = {"versao": int(doc["versao"]), "conteudo": doc["conteudo"]} if doc else None
        resposta["historico"] = await ctx.banco.todos(
            "SELECT versao, conteudo FROM historico WHERE email = ? ORDER BY versao DESC LIMIT 10", email)
    ctx.evento("recuperacao_aberta", email, copia=bool(cu))
    return Resposta(200, resposta)


async def _limite_passos_recuperacao(ctx: Contexto) -> None:
    """Etapas e conclusão da recuperação gravam muito: limite por IP (quem tem o link não enche o banco em laço)."""
    if await _contar(ctx, f"recuperar-passo|{ctx.h(ctx.pedido.ip)}", PASSOS_RECUPERACAO_POR_IP, RECUPERACAO_JANELA_S):
        ctx.evento("recuperacao_limitada")
        raise Falha(429, "TOO_MANY_ATTEMPTS", {"espera": RECUPERACAO_JANELA_S})


async def _etapa_recuperacao(ctx: Contexto) -> Resposta:
    """Histórico grande na recuperação: uma cópia recifrada por pedido (como na migração em etapas)."""
    await _limite_passos_recuperacao(ctx)
    b = _json(ctx.pedido)
    t = await _token_recuperacao(ctx, b.get("token"), aberto=True)
    await _guardar_etapa(ctx, t["email"], {k: v for k, v in b.items() if k != "token"}, {"sal", "versao", "conteudo"})
    return Resposta(200, {"ok": True})


async def _concluir_recuperacao(ctx: Contexto) -> Resposta:
    """
    Senha nova numa transação: link usado, nova senha (Argon2id), documento recifrado (modo "manter", com a
    cópia da chave) ou vazio (modo "recomecar": proteção avançada ou sem cópia), histórico, cópia da chave
    antiga apagada e TODAS as sessões encerradas. Depois, login normal com a senha nova.
    """
    await _limite_passos_recuperacao(ctx)
    b = _json(ctx.pedido)
    t = await _token_recuperacao(ctx, b.get("token"), aberto=True)
    email = t["email"]
    modo = b.get("modo")
    if modo not in ("manter", "recomecar") or b.get("kdf") != KDF_ARGON2:
        raise Falha(400, "INVALID_REQUEST")
    sal, nova_prova = _sal(b.get("sal")), _prova(b.get("prova"))
    conteudo, va = _conteudo(b.get("conteudo")), _versao(b.get("versaoAnterior"))
    if modo == "manter":
        if t["protecao_avancada"] or not await ctx.banco.primeiro(
                "SELECT 1 AS x FROM custodia WHERE email = ? AND verificador = ?", email, t["verificador"]):
            raise Falha(409, "DATA_CHANGED")
        antes, depois = await _historico_recifrado(ctx, email, b, sal, completo=False)
    else:
        if b.get("historico", []) != []:
            raise Falha(400, "INVALID_REQUEST")
        antes, depois = [], [("DELETE FROM historico WHERE email = ?", (email,)), ("DELETE FROM kdf_etapas WHERE email = ?", (email,))]  # recomeçar: sem cópias
    await _lote_atomico(ctx.banco, [
        ("UPDATE tokens_recuperacao SET usado = 1 WHERE hash = ? AND usado = 0 AND aberto = 1", (t["hash"],)), _GUARDA, _LIMPA_GUARDA,
        *antes,
        _gravar_documento(email, va, conteudo), _GUARDA,
        ("UPDATE contas SET sal = ?, iteracoes = ?, verificador = ?, kdf = ? WHERE email = ? AND verificador = ?",
         (sal, ITERACOES_MIN, _verificador(nova_prova), KDF_ARGON2, email, t["verificador"])), _GUARDA,
        _LIMPA_GUARDA,
        *depois,
        ("DELETE FROM custodia WHERE email = ?", (email,)),
        ("DELETE FROM tokens_recuperacao WHERE email = ? AND hash != ?", (email, t["hash"])),
        ("DELETE FROM sessoes WHERE email = ?", (email,)),
    ])
    await _limpar_login(ctx, email)
    ctx.evento("senha_redefinida", email, modo=modo)
    await _avisar(ctx, email, emails.senha_redefinida(t["nome"], ctx.agora, modo == "recomecar"), "email_aviso_senha")
    return Resposta(200, {"ok": True})


async def _avisar(ctx: Contexto, email: str, mensagem: emails.Mensagem, evento: str) -> None:
    """Aviso de segurança por e-mail (senha trocada, 2FA desligado): nunca atrapalha a operação."""
    if not emails.ativo(ctx.config):
        return
    ok = await emails.enviar(ctx.servicos, ctx.config, email, mensagem)
    ctx.evento(evento if ok else "email_falhou", email)


async def _entrar(ctx: Contexto) -> Resposta:
    b = _json(ctx.pedido)
    email = _email(b.get("email"))
    if await _contar(ctx, f"entrada|{ctx.h(ctx.pedido.ip)}", ENTRADAS_POR_IP, ENTRADA_JANELA_S):
        ctx.evento("login_limitado_ip")
        raise Falha(429, "TOO_MANY_ATTEMPTS", {"espera": ENTRADA_JANELA_S})
    chave = f"login|{ctx.h(email)}|{ctx.h(ctx.pedido.ip)}"
    linha, conta_lim = await _limite(ctx, chave), await _limite(ctx, f"conta|{ctx.h(email)}")
    bloqueio = _bloqueado(ctx, linha)
    if bloqueio:
        ctx.evento("login_bloqueado", email)
        raise bloqueio
    suspeita = conta_lim is not None and ctx.agora - conta_lim["ultima"] < CONTA_JANELA_S and conta_lim["falhas"] >= CONTA_CAPTCHA
    precisa = _proxima(ctx, linha) > LOGIN_SEM_CAPTCHA or suspeita
    if precisa and not _google_confirmado(ctx, email) and not await _captcha_ok(ctx, b.get("turnstile")):
        raise Falha(428, "CAPTCHA_REQUIRED")
    r = await _reservar(ctx, chave)
    if not r:                                         # bloqueado por um pedido simultâneo
        raise Falha(429, "TOO_MANY_ATTEMPTS", {"espera": BLOQUEIO_1_S})
    conta = await ctx.banco.primeiro(
        "SELECT nome, verificador, totp_segredo, email_verificado, confirmacao_pendente FROM contas WHERE email = ?", email)
    try:
        calculado = _verificador(_prova(b.get("prova")))
    except Falha:
        calculado = ""
    # Conta inexistente: compara com um valor qualquer (mesmo caminho, mesma resposta)
    ok = hmac.compare_digest(calculado, str(conta["verificador"]) if conta else "0" * 64) and bool(conta) and bool(calculado)
    if not ok or conta is None:                       # (ok já exige a conta; o "is None" é para o verificador de tipos)
        await _contar(ctx, f"conta|{ctx.h(email)}", CONTA_CAPTCHA, CONTA_JANELA_S)
        ctx.evento("login_falhou", email, tentativa=r["falhas"])
        if r["falhas"] == BLOQUEIO_2:
            ctx.evento("login_bloqueio_24h", email)
        extra = {"captcha": r["falhas"] >= LOGIN_SEM_CAPTCHA}
        if r["bloqueado_ate"] > ctx.agora:
            extra["espera"] = r["bloqueado_ate"] - ctx.agora
        raise Falha(401, "INVALID_CREDENTIALS", extra)
    verificado = await _marcar_verificado(ctx, email, conta["email_verificado"])
    if conta["confirmacao_pendente"] and not verificado:
        # senha certa, mas o e-mail ainda não foi confirmado (só aqui: senha errada recebe a resposta genérica)
        await ctx.banco.executar("DELETE FROM limites WHERE chave = ?", chave)
        if b.get("confirmacao") is None:
            ctx.evento("login_email_pendente", email)
            # sem o link: manda um novo, a não ser que o último tenha saído há pouco (a tela diz "enviamos um link")
            recente = await ctx.banco.primeiro(
                "SELECT 1 AS x FROM tokens_email WHERE email = ? AND finalidade = 'confirmar' AND usado = 0 AND verificador = ? AND expira > ?",
                email, conta["verificador"], int(ctx.agora) + CONFIRMACAO_S - REENVIO_LOGIN_S)
            if not recente and emails.ativo(ctx.config):
                await _enviar_confirmacao(ctx, email, conta["verificador"])
            raise Falha(403, "EMAIL_NOT_CONFIRMED")
        await _confirmar_no_login(ctx, email, b.get("confirmacao"))     # link + senha: ativa a conta e entra
        verificado = True
    if conta["totp_segredo"]:
        # Senha certa: zera o contador deste IP (o código do 2FA tem o próprio limite) e falta o código
        await ctx.banco.executar("DELETE FROM limites WHERE chave = ?", chave)
        await _criar_sessao(ctx, email, "2fa")
        ctx.evento("login_aguarda_2fa", email)
        return Resposta(200, {"doisFatores": True})
    await _limpar_login(ctx, email)
    envelope = await _criar_sessao(ctx, email, "ativa")
    ctx.evento("login", email)
    return Resposta(200, _sessao_publica(ctx, email, conta["nome"], envelope, False, verificado))


async def _marcar_verificado(ctx: Contexto, email: str, atual: object) -> bool:
    """Senha certa + Google confirmou este e-mail agora: a conta passa a ter o e-mail verificado."""
    if atual:
        return True
    if _google_confirmado(ctx, email):
        # o Google provou a posse do e-mail: confirma também um cadastro pendente
        await ctx.banco.executar("UPDATE contas SET email_verificado = 1, confirmacao_pendente = 0 WHERE email = ?", email)
        ctx.evento("email_verificado", email)
        return True
    return False


async def _segundo_fator(ctx: Contexto) -> Resposta:
    s = await _sessao(ctx, "2fa")
    if not s:
        raise Falha(401, "UNAUTHORIZED")
    b = _json(ctx.pedido)
    email = s["email"]
    chave = f"2fa|{ctx.h(email)}"
    r = await _reservar(ctx, chave)
    if not r:
        raise _bloqueado(ctx, await _limite(ctx, chave)) or Falha(429, "TOO_MANY_ATTEMPTS", {"espera": BLOQUEIO_1_S})
    conta = await ctx.banco.primeiro("SELECT nome, totp_segredo, totp_ultimo_passo, email_verificado FROM contas WHERE email = ?", email)
    segredo = totp.decifrar(conta["totp_segredo"], ctx.segredo) if conta else None
    passo = totp.conferir(segredo, b.get("codigo"), ctx.agora, conta["totp_ultimo_passo"]) if segredo and conta else None
    if passo is not None:      # grava o passo usado: o mesmo código não serve de novo (nem em paralelo)
        n = await ctx.banco.executar("UPDATE contas SET totp_ultimo_passo = ? WHERE email = ? AND totp_ultimo_passo < ?",
                                     passo, email, passo)
        passo = passo if n == 1 else None
    if passo is None or conta is None:
        ctx.evento("2fa_falhou", email, tentativa=r["falhas"])
        extra = {"espera": r["bloqueado_ate"] - ctx.agora} if r["bloqueado_ate"] > ctx.agora else {}
        raise Falha(401, "CODE_INVALID", extra)
    # Autenticação completa: a sessão parcial é trocada por uma nova (novo identificador)
    await ctx.banco.executar("DELETE FROM sessoes WHERE id = ?", s["id"])
    await _limpar_login(ctx, email)
    envelope = await _criar_sessao(ctx, email, "ativa")
    ctx.evento("login", email, segundo_fator=True)
    return Resposta(200, _sessao_publica(ctx, email, conta["nome"], envelope, True, conta["email_verificado"]))


async def _senha_vazada(ctx: Contexto) -> Resposta:
    # k-anonimato: só os 5 primeiros caracteres do SHA-1 saem do navegador
    prefixo = ctx.pedido.caminho.rsplit("/", 1)[-1].upper()
    if not _PREFIXO_SHA1.match(prefixo):
        raise Falha(400, "INVALID_REQUEST")
    if await _contar(ctx, f"hibp|{ctx.h(ctx.pedido.ip)}", CONSULTAS_POR_IP, CONSULTA_JANELA_S):
        raise Falha(429, "TOO_MANY_ATTEMPTS", {"espera": CONSULTA_JANELA_S})
    status, texto = await ctx.servicos.http_get(f"https://api.pwnedpasswords.com/range/{prefixo}",
                                                {"Add-Padding": "true", "User-Agent": "ZoZo-web"})
    if status != 200 or len(texto) > 2_000_000:
        raise Falha(502, "UNAVAILABLE")
    return Resposta(200, {"lista": texto})


# ---------------- Continuar com Google ----------------
def _google_config(ctx: Contexto) -> tuple[str, str] | None:
    cid, seg = str(ctx.config.get("GOOGLE_CLIENT_ID") or ""), str(ctx.config.get("GOOGLE_CLIENT_SECRET") or "")
    return (cid, seg) if cid and seg else None


def _origem(ctx: Contexto) -> str:
    return ("http" if str(ctx.config.get("COOKIE_SEGURO", "1")) == "0" else "https") + "://" + ctx.pedido.host


def _cookie_curto(ctx: Contexto, nome: str, valor: str, samesite: str) -> None:
    seguro = str(ctx.config.get("COOKIE_SEGURO", "1")) != "0"
    nome = ("__Host-" + nome) if seguro else nome
    ctx.cabecalhos["Set-Cookie"] = (f"{nome}={valor}; Path=/; HttpOnly; SameSite={samesite}; Max-Age={google.VALIDADE_S}"
                                    + ("; Secure" if seguro else ""))


def _ler_cookie_curto(ctx: Contexto, nome: str) -> dict[str, Any] | None:
    seguro = str(ctx.config.get("COOKIE_SEGURO", "1")) != "0"
    return google.ler_assinado(ctx.segredo, ctx.pedido.cookie(("__Host-" + nome) if seguro else nome), ctx.agora)


def _google_confirmado(ctx: Contexto, email: str) -> bool:
    """True se o Google confirmou ESTE e-mail há menos de 10 min (dispensa o CAPTCHA)."""
    c = _ler_cookie_curto(ctx, COOKIE_GOOGLE)
    return c is not None and c.get("m") == email


def _redirecionar(destino: str) -> Resposta:
    return Resposta(302, None, {"Location": destino})


async def _google_inicio(ctx: Contexto) -> Resposta:
    cfg = _google_config(ctx)
    if not cfg:
        return _redirecionar("/?google=indisponivel")
    if await _contar(ctx, f"consulta|{ctx.h(ctx.pedido.ip)}", CONSULTAS_POR_IP, CONSULTA_JANELA_S):
        return _redirecionar("/?google=erro")
    url, cookie = google.inicio(ctx.segredo, cfg[0], _origem(ctx) + "/api/google/retorno", ctx.agora)
    _cookie_curto(ctx, COOKIE_OAUTH, cookie, "Lax")          # Lax: volta do Google é navegação de outro site
    return _redirecionar(url)


async def _google_retorno(ctx: Contexto) -> Resposta:
    cfg = _google_config(ctx)
    c = _ler_cookie_curto(ctx, COOKIE_OAUTH)
    q = ctx.pedido.query
    if not cfg or not c or not isinstance(q.get("state"), str) or not hmac.compare_digest(q["state"], str(c.get("s"))):
        ctx.evento("google_recusado", motivo="state")
        return _redirecionar("/?google=erro")
    if q.get("error"):
        return _redirecionar("/?google=cancelado")
    codigo = q.get("code")
    if not codigo:
        return _redirecionar("/?google=erro")
    try:
        ident = await google.trocar_codigo(ctx.servicos, cfg[0], cfg[1], _origem(ctx) + "/api/google/retorno",
                                           codigo, str(c.get("v")), str(c.get("n")), ctx.agora)
    except Exception:  # noqa: BLE001 — Google indisponível
        ident = None
    if not ident:
        ctx.evento("google_recusado", motivo="token")
        return _redirecionar("/?google=erro")
    try:
        email = _email(ident["email"])
    except Falha:
        return _redirecionar("/?google=erro")
    _cookie_curto(ctx, COOKIE_GOOGLE, google.identidade_assinada(ctx.segredo, email, _nome(ident["nome"]), ctx.agora), "Strict")
    ctx.evento("google_confirmado", email)
    return _redirecionar("/?google=ok")


async def _google_identidade(ctx: Contexto) -> Resposta:
    c = _ler_cookie_curto(ctx, COOKIE_GOOGLE)
    if not c:
        raise Falha(404, "NOT_FOUND")
    # cadastro pendente (nunca confirmado) não conta como conta: o Google já provou a posse do e-mail
    existe = await ctx.banco.primeiro("SELECT 1 AS x FROM contas WHERE email = ? AND confirmacao_pendente = 0", c["m"])
    return Resposta(200, {"email": c["m"], "nome": c.get("nm") or "", "contaExiste": bool(existe)})

# ---------------- rotas ----------------
_PROTEGIDAS = {
    ("PUT", "/api/conta/nome"), ("PUT", "/api/conta/senha"), ("PUT", "/api/conta/kdf"), ("PUT", "/api/conta/kdf/historico"), ("DELETE", "/api/conta"),
    ("GET", "/api/documento"), ("GET", "/api/documento/versao"), ("PUT", "/api/documento"), ("POST", "/api/documento/apagar"), ("GET", "/api/historico"),
    ("POST", "/api/2fa/iniciar"), ("POST", "/api/2fa/confirmar"), ("POST", "/api/2fa/desativar"),
    ("GET", "/api/custodia"), ("POST", "/api/custodia/chave"), ("PUT", "/api/custodia"), ("PUT", "/api/conta/protecao"),
}
_SEM_CORPO = {"/api/2fa/iniciar", "/api/custodia/chave"}


async def _rota(ctx: Contexto) -> Resposta:
    p = ctx.pedido
    m, c = p.metodo, p.caminho

    if m == "GET" and c == "/api/publico":
        return Resposta(200, {"turnstile": str(ctx.config.get("TURNSTILE_SITE_KEY") or "") or None, "google": bool(_google_config(ctx))})
    if m == "GET" and c == "/api/google/inicio":
        return await _google_inicio(ctx)
    if m == "GET" and c == "/api/google/retorno":
        return await _google_retorno(ctx)
    if m == "GET" and c == "/api/google/identidade":
        return await _google_identidade(ctx)
    if m == "GET" and c == "/api/conta/parametros":
        return await _parametros(ctx)
    if m == "POST" and c == "/api/conta":
        return await _cadastrar(ctx)
    if m == "POST" and c == "/api/sessao":
        return await _entrar(ctx)
    if m == "POST" and c == "/api/email/reenviar":
        return await _reenviar_confirmacao(ctx)
    if m == "POST" and c == "/api/email/link":
        return await _conferir_link(ctx)
    if m == "POST" and c == "/api/recuperacao/pedir":
        return await _pedir_recuperacao(ctx)
    if m == "POST" and c == "/api/recuperacao/abrir":
        return await _abrir_recuperacao(ctx)
    if m == "PUT" and c == "/api/recuperacao/historico":
        return await _etapa_recuperacao(ctx)
    if m == "PUT" and c == "/api/recuperacao/concluir":
        return await _concluir_recuperacao(ctx)
    if m == "POST" and c == "/api/sessao/2fa":
        return await _segundo_fator(ctx)
    if m == "GET" and c == "/api/sessao":
        s = await _sessao(ctx)
        if not s:
            if p.cookie(_nome_cookie(ctx)) and not await _sessao(ctx, "2fa"):
                _definir_cookie(ctx)                   # cookie que não vale mais: apaga (a sessão parcial do 2FA fica)
            return Resposta(204)                       # sem sessão: resposta normal (não é erro para quem só abriu o site)
        conta = await ctx.banco.primeiro("SELECT nome, totp_segredo, email_verificado FROM contas WHERE email = ?", s["email"])
        token = p.cookie(_nome_cookie(ctx))
        if not conta or not token:                     # conta excluída no meio da sessão: a sessão acaba
            await ctx.banco.executar("DELETE FROM sessoes WHERE id = ?", s["id"])
            _definir_cookie(ctx)
            return Resposta(204)
        return Resposta(200, _sessao_publica(ctx, s["email"], conta["nome"], _envelope(ctx, token), conta["totp_segredo"],
                                             conta["email_verificado"]))
    if m == "DELETE" and c == "/api/sessao":
        token = p.cookie(_nome_cookie(ctx))
        if token and len(token) <= 128:
            await ctx.banco.executar("DELETE FROM sessoes WHERE id = ?", _hash_token(token))
        _definir_cookie(ctx)
        return Resposta(204)
    if m == "GET" and c.startswith("/api/senha-vazada/"):
        return await _senha_vazada(ctx)

    # ---- daqui em diante: exige sessão completa E a prova da senha ----
    if (m, c) not in _PROTEGIDAS:
        raise Falha(404, "NOT_FOUND")
    s = await _sessao(ctx)
    if not s:
        raise Falha(401, "UNAUTHORIZED")
    email = s["email"]
    if email == DEMO_EMAIL:
        # Demonstração (senha pública): nada é gravado no servidor e a conta não pode ser alterada por ninguém
        ctx.evento("demo_somente_leitura", rota=c)
        raise Falha(403, "DEMO_READ_ONLY")
    # Cota por conta nas rotas de dados: uma sessão não consome o banco sem limite
    if await _contar(ctx, f"cota|{ctx.h(email)}", COTA_DADOS, COTA_JANELA_S):
        ctx.evento("cota_excedida", email)
        raise Falha(429, "TOO_MANY_ATTEMPTS", {"espera": COTA_JANELA_S})
    # Corpo validado ANTES da prova: pedido malformado não consome tentativa
    b = _json(p) if m in ("POST", "PUT", "DELETE") and c not in _SEM_CORPO else {}
    conta = await _conferir_prova(ctx, email)

    if c == "/api/conta/nome":
        nome = _nome(b.get("nome"))
        if not nome:
            raise Falha(400, "INVALID_REQUEST")
        await ctx.banco.executar("UPDATE contas SET nome = ? WHERE email = ?", nome, email)
        return Resposta(200, {"ok": True})

    if c == "/api/conta/senha":
        # Novo sal + nova prova + documento recifrado, tudo na mesma transação
        sal, it, kdf = _sal(b.get("sal")), _iteracoes(b.get("iteracoes")), _kdf(b.get("kdf"))
        nova_prova, conteudo, va = _prova(b.get("prova")), _conteudo(b.get("conteudo")), _versao(b.get("versaoAnterior"))
        await _exigir_codigo_atual(ctx, email, conta, b.get("codigo"))
        await _lote_atomico(ctx.banco, [
            _gravar_documento(email, va, conteudo), _GUARDA,
            ("UPDATE contas SET sal = ?, iteracoes = ?, verificador = ?, kdf = ? WHERE email = ? AND verificador = ?",
             (sal, it, _verificador(nova_prova), kdf, email, conta["verificador"])), _GUARDA,
            _LIMPA_GUARDA,
            # o histórico estava cifrado com a senha anterior: é descartado (e uma migração em etapas pela metade);
            # a cópia da chave (recuperação) era da chave antiga: o navegador guarda a nova logo depois
            ("DELETE FROM historico WHERE email = ?", (email,)),
            ("DELETE FROM kdf_etapas WHERE email = ?", (email,)),
            ("DELETE FROM custodia WHERE email = ?", (email,)),
            ("DELETE FROM tokens_recuperacao WHERE email = ?", (email,)),
            # as outras sessões (outros dispositivos) terminam
            ("DELETE FROM sessoes WHERE email = ? AND id != ?", (email, s["id"])),
        ])
        await _limpar_login(ctx, email)
        ctx.evento("senha_alterada", email)
        await _avisar(ctx, email, emails.senha_alterada(conta["nome"], ctx.agora), "email_aviso_senha")
        return Resposta(200, {"versao": va + 1})

    if c == "/api/conta/kdf/historico":
        # Migração em etapas: UMA cópia do histórico, já recifrada com a chave nova, fica guardada à parte até o
        # fechamento (PUT /api/conta/kdf). Só versões que existem; outra tentativa (outro sal) recomeça do zero.
        atual = await ctx.banco.primeiro("SELECT kdf FROM contas WHERE email = ?", email)
        if not atual or (atual["kdf"] or KDF_PBKDF2) != KDF_PBKDF2:
            raise Falha(409, "KDF_CURRENT")
        await _guardar_etapa(ctx, email, b, {"sal", "versao", "conteudo"})
        return Resposta(200, {"ok": True})

    if c == "/api/conta/kdf":
        # Conta antiga (PBKDF2) passa para Argon2id com a MESMA senha: o navegador faz logo depois de um login que deu certo.
        # Numa transação só: novo sal + nova prova + documento E histórico recifrados com a chave nova (as cópias
        # anteriores continuam abrindo — diferente da troca de senha, que descarta o histórico). Só PBKDF2 → Argon2id.
        # Histórico grande: as cópias chegam antes, uma por pedido (kdf/historico), e aqui só fecham a migração.
        atual = await ctx.banco.primeiro("SELECT kdf FROM contas WHERE email = ?", email)
        if not atual or (atual["kdf"] or KDF_PBKDF2) != KDF_PBKDF2:
            raise Falha(409, "KDF_CURRENT")
        if b.get("kdf") != KDF_ARGON2:
            raise Falha(400, "INVALID_REQUEST")
        sal, nova_prova = _sal(b.get("sal")), _prova(b.get("prova"))
        conteudo, va = _conteudo(b.get("conteudo")), _versao(b.get("versaoAnterior"))
        # Migração automática nunca descarta backups: o histórico recifrado tem de cobrir TODAS as versões
        antes, depois = await _historico_recifrado(ctx, email, b, sal, completo=True)
        await _lote_atomico(ctx.banco, [
            *antes,
            _gravar_documento(email, va, conteudo), _GUARDA,
            ("UPDATE contas SET sal = ?, iteracoes = ?, verificador = ?, kdf = ? WHERE email = ? AND verificador = ? AND kdf = ?",
             (sal, ITERACOES_MIN, _verificador(nova_prova), KDF_ARGON2, email, conta["verificador"], KDF_PBKDF2)), _GUARDA,
            _LIMPA_GUARDA,
            *depois,
            # a cópia da chave (recuperação) era da chave antiga: o navegador guarda a nova logo depois
            ("DELETE FROM custodia WHERE email = ?", (email,)),
            # a chave mudou: as outras sessões (outros dispositivos) terminam e entram de novo com a mesma senha
            ("DELETE FROM sessoes WHERE email = ? AND id != ?", (email, s["id"])),
        ])
        await _limpar_login(ctx, email)
        ctx.evento("kdf_atualizado", email)
        return Resposta(200, {"versao": va + 1})

    if m == "DELETE" and c == "/api/conta":
        # no lugar da senha, a frase digitada; com 2FA, também um código atual
        if set(b) - {"confirmacao", "codigo"} or b.get("confirmacao") != FRASE_EXCLUIR:
            raise Falha(400, "CONFIRMATION_REQUIRED")
        await _exigir_codigo_atual(ctx, email, conta, b.get("codigo"))
        await ctx.banco.lote([
            ("DELETE FROM historico WHERE email = ?", (email,)),
            ("DELETE FROM kdf_etapas WHERE email = ?", (email,)),
            ("DELETE FROM custodia WHERE email = ?", (email,)),
            ("DELETE FROM tokens_recuperacao WHERE email = ?", (email,)),
            ("DELETE FROM documentos WHERE email = ?", (email,)),
            ("DELETE FROM sessoes WHERE email = ?", (email,)),
            ("DELETE FROM contas WHERE email = ?", (email,)),
        ])
        await _limpar_login(ctx, email)
        _definir_cookie(ctx)
        ctx.evento("conta_excluida", email)
        await _avisar(ctx, email, emails.conta_excluida(conta["nome"], ctx.agora), "email_aviso_exclusao")
        return Resposta(204)

    if m == "GET" and c == "/api/documento":
        d = await ctx.banco.primeiro("SELECT versao, conteudo FROM documentos WHERE email = ?", email)
        return Resposta(200, d) if d else Resposta(404, {"erro": "NOT_FOUND"})

    if m == "GET" and c == "/api/documento/versao":
        # Só o número da versão (sem o documento): a tela confere se outro dispositivo/aba gravou algo
        # e só então baixa o documento de novo. Mesma proteção das outras rotas de dados.
        d = await ctx.banco.primeiro("SELECT versao FROM documentos WHERE email = ?", email)
        return Resposta(200, {"versao": int(d["versao"]) if d else 0})

    if m == "PUT" and c == "/api/documento":
        conteudo, va = _conteudo(b.get("conteudo")), _versao(b.get("versaoAnterior"))
        sql, params = _gravar_documento(email, va, conteudo)
        n = await ctx.banco.executar(sql, *params)
        return Resposta(200, {"versao": va + 1}) if n else Resposta(409, {"erro": "DATA_CHANGED"})

    if c == "/api/custodia" and m == "GET":
        cu = await ctx.banco.primeiro("SELECT 1 AS x FROM custodia WHERE email = ? AND verificador = ?", email, conta["verificador"])
        return Resposta(200, {"avancada": bool(conta["protecao_avancada"]), "ativa": bool(cu)})

    if c == "/api/custodia/chave":
        # Recuperação pelo e-mail: o navegador tranca a chave dos dados com esta chave de custódia e guarda a cópia
        # (PUT /api/custodia). Nada a fazer com proteção avançada ou com uma cópia da senha atual já guardada.
        if conta["protecao_avancada"]:
            return Resposta(200, {"avancada": True})
        if await ctx.banco.primeiro("SELECT 1 AS x FROM custodia WHERE email = ? AND verificador = ?", email, conta["verificador"]):
            return Resposta(200, {"atual": True})
        nonce = base64.b64encode(secrets.token_bytes(16)).decode("ascii")
        return Resposta(200, {"nonce": nonce, "r": _chave_custodia(ctx, email, nonce)})

    if c == "/api/custodia":
        if set(b) != {"nonce", "chave"} or len(_b64(b.get("nonce"), 24, 24)) != 16 or len(_b64(b.get("chave"), 80, 80)) != 60:
            raise Falha(400, "INVALID_REQUEST")                # 12 (IV) + 32 (chave) + 16 (etiqueta GCM)
        if conta["protecao_avancada"]:
            raise Falha(409, "DATA_CHANGED")
        await ctx.banco.executar(
            "INSERT INTO custodia (email, nonce, chave, verificador) VALUES (?, ?, ?, ?) ON CONFLICT(email) DO UPDATE SET "
            f"nonce = excluded.nonce, chave = excluded.chave, verificador = excluded.verificador, criado_em = {_AGORA_SQL}",
            email, b["nonce"], b["chave"], conta["verificador"])
        ctx.evento("custodia_guardada", email)
        return Resposta(200, {"ok": True})

    if c == "/api/conta/protecao":
        avancada = b.get("avancada")
        if set(b) - {"codigo"} != {"avancada"} or not isinstance(avancada, bool):
            raise Falha(400, "INVALID_REQUEST")
        if not avancada:                    # desligar volta a guardar a cópia da chave no servidor: código atual
            await _exigir_codigo_atual(ctx, email, conta, b.get("codigo"))
        await ctx.banco.lote([
            ("UPDATE contas SET protecao_avancada = ? WHERE email = ?", (1 if avancada else 0, email)),
            *([("DELETE FROM custodia WHERE email = ?", (email,)), ("DELETE FROM tokens_recuperacao WHERE email = ?", (email,))]
              if avancada else []),
        ])
        ctx.evento("protecao_avancada_ligada" if avancada else "protecao_avancada_desligada", email)
        return Resposta(200, {"avancada": avancada})

    if c == "/api/documento/apagar":
        # "Apagar todos os dados": grava o documento vazio (a versão continua subindo,
        # então nenhum dispositivo confunde isso com um retrocesso) e descarta o histórico
        conteudo, va = _conteudo(b.get("conteudo")), _versao(b.get("versaoAnterior"))
        await _lote_atomico(ctx.banco, [
            _gravar_documento(email, va, conteudo), _GUARDA, _LIMPA_GUARDA,
            ("DELETE FROM historico WHERE email = ?", (email,)),
        ])
        ctx.evento("dados_apagados", email)
        return Resposta(200, {"versao": va + 1})

    if c == "/api/historico":
        versoes = await ctx.banco.todos(
            "SELECT versao, conteudo, criado_em AS criadoEm FROM historico WHERE email = ? ORDER BY versao DESC LIMIT 10", email)
        return Resposta(200, {"versoes": versoes})

    if c == "/api/2fa/iniciar":
        if conta["totp_segredo"]:
            raise Falha(409, "2FA_ALREADY_ON")
        segredo = totp.novo_segredo()
        await ctx.banco.executar("UPDATE contas SET totp_pendente = ? WHERE email = ?", totp.cifrar(segredo, ctx.segredo), email)
        return Resposta(200, {"chave": totp.base32(segredo), "uri": totp.uri(segredo, email)})

    if c == "/api/2fa/confirmar":
        pendente = totp.decifrar(conta["totp_pendente"], ctx.segredo) if conta["totp_pendente"] else None
        if not pendente or conta["totp_segredo"]:
            raise Falha(409, "2FA_NOT_PENDING")
        chave = f"2fa|{ctx.h(email)}"
        r = await _reservar(ctx, chave)
        if not r:
            raise _bloqueado(ctx, await _limite(ctx, chave)) or Falha(429, "TOO_MANY_ATTEMPTS")
        passo = totp.conferir(pendente, b.get("codigo"), ctx.agora, 0)
        if passo is None:
            ctx.evento("2fa_ativacao_falhou", email, tentativa=r["falhas"])
            raise Falha(401, "CODE_INVALID", {"espera": r["bloqueado_ate"] - ctx.agora} if r["bloqueado_ate"] > ctx.agora else {})
        n = await ctx.banco.executar(
            "UPDATE contas SET totp_segredo = totp_pendente, totp_pendente = NULL, totp_ultimo_passo = ? "
            "WHERE email = ? AND totp_pendente = ?", passo, email, conta["totp_pendente"])
        if n != 1:
            raise Falha(409, "DATA_CHANGED")
        await ctx.banco.executar("DELETE FROM limites WHERE chave = ?", chave)
        await _encerrar_outras(ctx, email, s["id"])
        ctx.evento("2fa_ativado", email)
        return Resposta(200, {"doisFatores": True})

    if c == "/api/2fa/desativar":
        # Exige um código ATUAL do aplicativo (fator recente): a sessão e a prova guardadas não bastam
        segredo_atual = totp.decifrar(conta["totp_segredo"], ctx.segredo) if conta["totp_segredo"] else None
        if not segredo_atual:
            raise Falha(409, "2FA_NOT_PENDING")
        chave = f"2fa|{ctx.h(email)}"
        r = await _reservar(ctx, chave)
        if not r:
            raise _bloqueado(ctx, await _limite(ctx, chave)) or Falha(429, "TOO_MANY_ATTEMPTS")
        passo = totp.conferir(segredo_atual, b.get("codigo"), ctx.agora, conta["totp_ultimo_passo"])
        if passo is None:
            ctx.evento("2fa_desativacao_recusada", email, tentativa=r["falhas"])
            raise Falha(401, "CODE_INVALID", {"espera": r["bloqueado_ate"] - ctx.agora} if r["bloqueado_ate"] > ctx.agora else {})
        await ctx.banco.executar("DELETE FROM limites WHERE chave = ?", chave)
        await ctx.banco.executar(
            "UPDATE contas SET totp_segredo = NULL, totp_pendente = NULL, totp_ultimo_passo = 0 WHERE email = ?", email)
        await _encerrar_outras(ctx, email, s["id"])
        ctx.evento("2fa_desativado", email)
        await _avisar(ctx, email, emails.dois_fatores_desativado(conta["nome"], ctx.agora), "email_aviso_2fa")
        return Resposta(200, {"doisFatores": False})

    raise Falha(404, "NOT_FOUND")


async def atender(pedido: Pedido, banco: Banco, servicos: Servicos, config: Config, log: Callable[[str], object] = print,
                  agora: float | None = None) -> Resposta:
    """Atende um pedido /api/*. Nunca devolve detalhes técnicos ao navegador."""
    ctx = Contexto(pedido, banco, servicos, config, log, time.time() if agora is None else agora)
    try:
        if len(ctx.segredo) < 32:
            log(json.dumps({"evento": "configuracao_incompleta", "req": ctx.req, "falta": "SEGREDO"}))
            r = Resposta(503, {"erro": "UNAVAILABLE"})
        elif pedido.invalido:
            ctx.evento("pedido_invalido")
            r = Resposta(400, {"erro": "INVALID_REQUEST"})
        else:
            _mesma_origem(pedido)
            r = await _rota(ctx)
    except Falha as f:
        r = Resposta(f.status, dict({"erro": f.codigo}, **f.extra))
    except Exception as ex:  # noqa: BLE001 — nunca devolve detalhes técnicos
        log(json.dumps({"evento": "falha_no_servidor", "req": ctx.req, "tipo": type(ex).__name__}))
        r = Resposta(500, {"erro": "STORAGE_UNAVAILABLE"})
    r.cabecalhos.update(ctx.cabecalhos)
    r.cabecalhos["X-Request-Id"] = ctx.req
    return r
