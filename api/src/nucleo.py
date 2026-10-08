"""
ZoZo (web) — núcleo da API (Python puro, sem dependências do Cloudflare)

Camadas de proteção:
  1. login próprio do ZoZo: e-mail + PROVA DE SENHA. A senha nunca sai do navegador:
     ele deriva (PBKDF2 600.000 + HKDF) a chave dos dados e uma "prova"; o servidor
     guarda só o SHA-256 da prova;
  2. sessão no servidor: cookie aleatório HttpOnly + Secure + SameSite=Strict, sem
     data de expiração (termina ao fechar o navegador); o banco guarda só o SHA-256
     dele. Expira também por inatividade (7 dias) e idade (30 dias). O "envelope" que
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
  config   — SEGREDO, TURNSTILE_SITE_KEY, TURNSTILE_SECRET, COOKIE_SEGURO,
             GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, RECURSOS_AVANCADOS
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
from urllib.parse import parse_qs, urlsplit

import google
import totp

LIMITE_CORPO = 2_100_000        # bytes do pedido
LIMITE_CONTEUDO = 1_900_000     # caracteres do documento cifrado (D1: máx. ~2 MB por linha)
ITERACOES_MIN = 600_000
ITERACOES_MAX = 10_000_000
FORMATO_DOCUMENTO = 2           # primeiro byte do documento cifrado (versão do formato)
MAX_VERSAO = 2**53 - 1

# Sessões
SESSAO_OCIOSA_S = 7 * 86400     # sem uso por 7 dias → encerra
SESSAO_MAXIMA_S = 30 * 86400    # no máximo 30 dias, mesmo em uso
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

# Conta de demonstração pública (criada pela migração 0003_conta_demo.sql)
DEMO_EMAIL = "demo@usezozo.com.br"
DEMO_SESSOES_MAX = 500          # sessões abertas da demo ao mesmo tempo (as mais antigas saem)
DEMO_OCIOSA_S = 6 * 3600        # sessão da demo parada há 6 h é descartada

_B64 = re.compile(r"^[A-Za-z0-9+/]+={0,2}$")
_PREFIXO_SHA1 = re.compile(r"^[0-9A-F]{5}$")
_EMAIL = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
_AGORA_SQL = "strftime('%Y-%m-%dT%H:%M:%fZ','now')"

CABECALHOS = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
}


class Resposta:
    def __init__(self, status, dados=None, cabecalhos=None):
        self.status = status
        self.dados = dados
        self.cabecalhos = dict(cabecalhos or {})

    @property
    def corpo(self):
        return None if self.dados is None or self.status == 204 else json.dumps(self.dados, ensure_ascii=False)


class Pedido:
    """Pedido já lido pelo adaptador (o corpo só é lido depois de conferir o tamanho)."""

    def __init__(self, metodo, url, cabecalhos, corpo=""):
        self.metodo = str(metodo).upper()
        partes = urlsplit(url)
        self.caminho = partes.path
        self.host = (partes.netloc or "").lower()
        self.query = {k: v[0] for k, v in parse_qs(partes.query, max_num_fields=20).items()}
        self.cabecalhos = {str(k).lower(): str(v) for k, v in (cabecalhos or {}).items()}
        self.corpo = corpo or ""
        self.ip = (self.cab("cf-connecting-ip") or "").strip()[:64] or "desconhecido"

    def cab(self, nome):
        return self.cabecalhos.get(nome.lower())

    def cookie(self, nome):
        for parte in (self.cab("cookie") or "").split(";"):
            k, _, v = parte.strip().partition("=")
            if k == nome:
                return v
        return None


class Falha(Exception):
    def __init__(self, status, codigo, extra=None):
        super().__init__(codigo)
        self.status = status
        self.codigo = codigo
        self.extra = extra or {}


class Contexto:
    def __init__(self, pedido, banco, servicos, config, log, agora):
        self.pedido, self.banco, self.servicos, self.config, self.log = pedido, banco, servicos, config, log
        self.agora = int(agora)
        self.segredo = str(config.get("SEGREDO") or "")
        self.req = secrets.token_hex(8)
        self.cabecalhos = {}          # cabeçalhos extras da resposta (Set-Cookie)

    def h(self, valor):
        """Identificador estável e não reversível (e-mail, IP) para chaves e logs."""
        return hmac.new(self.segredo.encode(), str(valor).encode("utf-8"), hashlib.sha256).hexdigest()[:32]

    def evento(self, nome, email=None, **campos):
        """Evento de segurança: sem senha, prova, cookie, código ou e-mail em texto."""
        dados = {"evento": nome, "req": self.req, "ip": self.h(self.pedido.ip)[:12]}
        if email:
            dados["conta"] = self.h(email)[:12]
        dados.update(campos)
        self.log(json.dumps(dados, ensure_ascii=False))


# ---------------- validações ----------------
def _b64(valor, minimo, maximo):
    """Decodifica base64 padrão estrito; lança Falha(400) se inválido."""
    if not isinstance(valor, str) or not (minimo <= len(valor) <= maximo) or len(valor) % 4 or not _B64.match(valor):
        raise Falha(400, "INVALID_REQUEST")
    try:
        return base64.b64decode(valor, validate=True)
    except (binascii.Error, ValueError) as ex:
        raise Falha(400, "INVALID_REQUEST") from ex


def _sal(valor):
    if not 16 <= len(_b64(valor, 24, 88)) <= 64:
        raise Falha(400, "INVALID_REQUEST")
    return valor


def _prova(valor):
    bruto = _b64(valor, 44, 44)
    if len(bruto) != 32:
        raise Falha(400, "INVALID_REQUEST")
    return bruto


def _verificador(prova_bruta):
    return hashlib.sha256(prova_bruta).hexdigest()


def _iteracoes(valor):
    if not isinstance(valor, int) or isinstance(valor, bool) or not ITERACOES_MIN <= valor <= ITERACOES_MAX:
        raise Falha(400, "INVALID_REQUEST")
    return valor


def _versao(valor):
    if not isinstance(valor, int) or isinstance(valor, bool) or not 0 <= valor < MAX_VERSAO:
        raise Falha(400, "INVALID_REQUEST")
    return valor


def _conteudo(valor):
    if isinstance(valor, str) and len(valor) > LIMITE_CONTEUDO:
        raise Falha(413, "DOCUMENT_TOO_LARGE")
    bruto = _b64(valor, 4, LIMITE_CONTEUDO)
    # formato | IV (12) | cifrado + etiqueta GCM (16+)
    if len(bruto) < 1 + 12 + 17 or bruto[0] != FORMATO_DOCUMENTO:
        raise Falha(400, "INVALID_REQUEST")
    return valor


def _nome(valor):
    texto = unicodedata.normalize("NFC", str(valor if valor is not None else ""))
    texto = "".join(c for c in texto if unicodedata.category(c) not in ("Cc", "Cf", "Cs", "Co", "Cn"))
    return texto.strip()[:80]


def _email(valor):
    e = str(valor or "").strip().lower() if isinstance(valor, str) else ""
    if not e or len(e) > 254 or not _EMAIL.match(e) or any(unicodedata.category(c).startswith("C") for c in e):
        raise Falha(400, "INVALID_REQUEST")
    return e


def _json(pedido):
    if not (pedido.cab("content-type") or "").lower().startswith("application/json"):
        raise Falha(415, "INVALID_REQUEST")
    if len(pedido.corpo.encode("utf-8")) > LIMITE_CORPO:
        raise Falha(413, "DOCUMENT_TOO_LARGE")
    try:
        dados = json.loads(pedido.corpo or "{}")
    except ValueError as ex:
        raise Falha(400, "INVALID_REQUEST") from ex
    if not isinstance(dados, dict):
        raise Falha(400, "INVALID_REQUEST")
    return dados


def _mesma_origem(pedido):
    """Bloqueia pedidos de escrita vindos de outros sites (CSRF)."""
    if pedido.metodo in ("GET", "HEAD", "OPTIONS"):
        return
    site = (pedido.cab("sec-fetch-site") or "").lower()
    if site and site not in ("same-origin", "none"):
        raise Falha(403, "FORBIDDEN")
    origem = pedido.cab("origin")
    if origem is not None and urlsplit(origem).netloc.lower() != pedido.host:
        raise Falha(403, "FORBIDDEN")


# ---------------- limites (bloqueio progressivo e contadores por IP) ----------------
async def _limite(ctx, chave):
    return await ctx.banco.primeiro("SELECT falhas, ultima, bloqueado_ate FROM limites WHERE chave = ?", chave)


def _proxima(ctx, linha):
    """Número que a próxima tentativa terá (o contador zera após 24 h sem falhas)."""
    return 1 if not linha or ctx.agora - linha["ultima"] >= ESQUECE_S else linha["falhas"] + 1


async def _reservar(ctx, chave):
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


async def _registrar_falha(ctx, chave):
    """Mesma contagem de _reservar, usada depois de conferir (rotas que já exigem sessão)."""
    return await _reservar(ctx, chave)


async def _contar(ctx, chave, limite, janela):
    """Contador por janela fixa (cadastro/consultas por IP). True se passou do limite."""
    a = ctx.agora
    r = await ctx.banco.primeiro(
        "INSERT INTO limites (chave, falhas, ultima) VALUES (?, 1, ?) ON CONFLICT(chave) DO UPDATE SET "
        "falhas = CASE WHEN ? - limites.ultima >= ? THEN 1 ELSE limites.falhas + 1 END, "
        "ultima = CASE WHEN ? - limites.ultima >= ? THEN ? ELSE limites.ultima END RETURNING falhas",
        chave, a, a, janela, a, janela, a)
    return bool(r) and r["falhas"] > limite


def _bloqueado(ctx, linha):
    if linha and linha["bloqueado_ate"] > ctx.agora:
        return Falha(429, "TOO_MANY_ATTEMPTS", {"espera": linha["bloqueado_ate"] - ctx.agora})
    return None


async def _limpar_login(ctx, email):
    h = ctx.h(email)
    await ctx.banco.executar("DELETE FROM limites WHERE chave LIKE ? OR chave = ? OR chave = ?",
                             f"login|{h}|%", f"conta|{h}", f"2fa|{h}")


async def _captcha_ok(ctx, token):
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
def _hash_token(token):
    return hashlib.sha256(token.encode("ascii")).hexdigest()


def _nome_cookie(ctx):
    return COOKIE_DEV if str(ctx.config.get("COOKIE_SEGURO", "1")) == "0" else COOKIE_SEGURO


def _definir_cookie(ctx, valor=None):
    atributos = "Path=/; HttpOnly; SameSite=Strict" + ("" if _nome_cookie(ctx) == COOKIE_DEV else "; Secure")
    # Sem Max-Age/Expires: cookie de sessão (o navegador apaga ao ser fechado)
    ctx.cabecalhos["Set-Cookie"] = f"{_nome_cookie(ctx)}={valor}; {atributos}" if valor else f"{_nome_cookie(ctx)}=; Max-Age=0; {atributos}"


def _envelope(ctx, token):
    """
    Chave AES que cifra a chave dos dados guardada no navegador. Derivada do cookie (que o JavaScript
    não lê) com o SEGREDO do servidor e NUNCA gravada: quem tiver o banco e o armazenamento do
    navegador ainda precisaria do cookie e do SEGREDO (a coluna "envelope" fica vazia).
    """
    return base64.b64encode(hmac.new(ctx.segredo.encode(), ("zozo/envelope/v2|" + token).encode("ascii"), hashlib.sha256).digest()).decode("ascii")


async def _criar_sessao(ctx, email, estado):
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


async def _sessao(ctx, estado="ativa"):
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


async def _encerrar_outras(ctx, email, manter_id):
    await ctx.banco.executar("DELETE FROM sessoes WHERE email = ? AND id != ?", email, manter_id)


def _avancado(ctx, email, verificado=False):
    """
    Perfis, boletos e Pix: só a demonstração e os e-mails do segredo RECURSOS_AVANCADOS (lista separada
    por vírgula) — e só se a conta tiver o e-mail CONFIRMADO (pelo Google; as contas anteriores à 2.5
    foram marcadas na migração 0005). Cadastrar antes um e-mail da lista não dá os recursos.
    """
    if email == DEMO_EMAIL:
        return True
    if not verificado:
        return False
    # Tolerante ao jeito de digitar o segredo: vírgula, ponto e vírgula, espaço ou quebra de linha
    # separam; aspas e caracteres invisíveis (ex.: marca BOM colada pelo terminal) são ignorados
    texto = "".join(c for c in str(ctx.config.get("RECURSOS_AVANCADOS") or "") if unicodedata.category(c) != "Cf")
    lista = {e.strip("\"'<>").lower() for e in re.split(r"[,;\s]+", texto) if e.strip("\"'<>")}
    return email in lista


def _sessao_publica(ctx, email, nome, envelope, dois_fatores, verificado=False):
    av = _avancado(ctx, email, verificado)
    return {"email": email, "nome": nome, "envelope": envelope, "doisFatores": bool(dois_fatores),
            "demo": email == DEMO_EMAIL, "recursos": {"perfis": av, "boleto": av, "pix": av}}


# ---------------- prova da senha (rotas com sessão) ----------------
async def _conferir_prova(ctx, email):
    """Confere a prova do cabeçalho X-ZoZo-Prova. Erros contam no mesmo bloqueio do login (e-mail + IP)."""
    conta = await ctx.banco.primeiro(
        "SELECT nome, verificador, totp_segredo, totp_pendente, totp_ultimo_passo FROM contas WHERE email = ?", email)
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


def _gravar_documento(email, versao_anterior, conteudo):
    """Comandos que gravam o documento só se a versão no banco ainda for a lida (concorrência otimista)."""
    if versao_anterior == 0:
        return ("INSERT INTO documentos (email, versao, conteudo) SELECT ?, 1, ? "
                "WHERE NOT EXISTS (SELECT 1 FROM documentos WHERE email = ?)", (email, conteudo, email))
    return (f"UPDATE documentos SET versao = ?, conteudo = ?, atualizado_em = {_AGORA_SQL} "
            "WHERE email = ? AND versao = ?", (versao_anterior + 1, conteudo, email, versao_anterior))


# A tabela "guarda" só aceita ok = 1: se o comando anterior não alterou exatamente
# uma linha, a inserção falha e o lote inteiro é desfeito (nada fica pela metade).
_GUARDA = ("INSERT INTO guarda (ok) VALUES (changes())", ())
_LIMPA_GUARDA = ("DELETE FROM guarda", ())


async def _lote_atomico(banco, comandos):
    try:
        return await banco.lote(comandos)
    except Exception as ex:  # noqa: BLE001 — o driver do banco lança tipos variados
        if "CHECK constraint failed" in str(ex):
            raise Falha(409, "DATA_CHANGED") from ex
        raise


# ---------------- rotas públicas (sem sessão) ----------------
async def _parametros(ctx):
    """Sal e iterações para o navegador derivar a senha. E-mail sem conta recebe um sal simulado e estável."""
    email = _email(ctx.pedido.query.get("email"))
    if await _contar(ctx, f"consulta|{ctx.h(ctx.pedido.ip)}", CONSULTAS_POR_IP, CONSULTA_JANELA_S):
        raise Falha(429, "TOO_MANY_ATTEMPTS", {"espera": CONSULTA_JANELA_S})
    conta = await ctx.banco.primeiro("SELECT sal, iteracoes FROM contas WHERE email = ?", email)
    if conta:
        return Resposta(200, {"sal": conta["sal"], "iteracoes": conta["iteracoes"]})
    falso = hmac.new(ctx.segredo.encode(), ("sal-simulado|" + email).encode("utf-8"), hashlib.sha256).digest()[:16]
    return Resposta(200, {"sal": base64.b64encode(falso).decode("ascii"), "iteracoes": ITERACOES_MIN})


async def _cadastrar(ctx):
    b = _json(ctx.pedido)
    if await _contar(ctx, f"cadastro|{ctx.h(ctx.pedido.ip)}", CADASTROS_POR_IP, CADASTRO_JANELA_S):
        ctx.evento("cadastro_limitado")
        raise Falha(429, "TOO_MANY_ATTEMPTS", {"espera": CADASTRO_JANELA_S})
    email = _email(b.get("email"))
    if email == DEMO_EMAIL:                       # a conta de demonstração já existe (migração) e não é recriada
        raise Falha(409, "EMAIL_IN_USE")
    if not _google_confirmado(ctx, email) and not await _captcha_ok(ctx, b.get("turnstile")):
        raise Falha(428, "CAPTCHA_REQUIRED")
    sal, it, prova = _sal(b.get("sal")), _iteracoes(b.get("iteracoes")), _prova(b.get("prova"))
    nome = _nome(b.get("nome"))
    if not nome:
        raise Falha(400, "INVALID_REQUEST")
    verificado = 1 if _google_confirmado(ctx, email) else 0      # o Google confirmou que a pessoa é dona do e-mail
    n = await ctx.banco.executar(
        "INSERT OR IGNORE INTO contas (email, nome, sal, iteracoes, verificador, email_verificado) VALUES (?, ?, ?, ?, ?, ?)",
        email, nome, sal, it, _verificador(prova), verificado)
    if not n:
        raise Falha(409, "EMAIL_IN_USE")
    envelope = await _criar_sessao(ctx, email, "ativa")
    ctx.evento("cadastro", email)
    return Resposta(201, _sessao_publica(ctx, email, nome, envelope, False, verificado))


async def _entrar(ctx):
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
    suspeita = bool(conta_lim) and ctx.agora - conta_lim["ultima"] < CONTA_JANELA_S and conta_lim["falhas"] >= CONTA_CAPTCHA
    precisa = _proxima(ctx, linha) > LOGIN_SEM_CAPTCHA or suspeita
    if precisa and not _google_confirmado(ctx, email) and not await _captcha_ok(ctx, b.get("turnstile")):
        raise Falha(428, "CAPTCHA_REQUIRED")
    r = await _reservar(ctx, chave)
    if not r:                                         # bloqueado por um pedido simultâneo
        raise Falha(429, "TOO_MANY_ATTEMPTS", {"espera": BLOQUEIO_1_S})
    conta = await ctx.banco.primeiro("SELECT nome, verificador, totp_segredo, email_verificado FROM contas WHERE email = ?", email)
    try:
        calculado = _verificador(_prova(b.get("prova")))
    except Falha:
        calculado = ""
    # Conta inexistente: compara com um valor qualquer (mesmo caminho, mesma resposta)
    ok = hmac.compare_digest(calculado, str(conta["verificador"]) if conta else "0" * 64) and bool(conta) and bool(calculado)
    if not ok:
        await _contar(ctx, f"conta|{ctx.h(email)}", CONTA_CAPTCHA, CONTA_JANELA_S)
        ctx.evento("login_falhou", email, tentativa=r["falhas"])
        if r["falhas"] == BLOQUEIO_2:
            ctx.evento("login_bloqueio_24h", email)
        extra = {"captcha": r["falhas"] >= LOGIN_SEM_CAPTCHA}
        if r["bloqueado_ate"] > ctx.agora:
            extra["espera"] = r["bloqueado_ate"] - ctx.agora
        raise Falha(401, "INVALID_CREDENTIALS", extra)
    verificado = await _marcar_verificado(ctx, email, conta["email_verificado"])
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


async def _marcar_verificado(ctx, email, atual):
    """Senha certa + Google confirmou este e-mail agora: a conta passa a ter o e-mail verificado."""
    if atual:
        return True
    if _google_confirmado(ctx, email):
        await ctx.banco.executar("UPDATE contas SET email_verificado = 1 WHERE email = ?", email)
        ctx.evento("email_verificado", email)
        return True
    return False


async def _segundo_fator(ctx):
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
    passo = totp.conferir(segredo, b.get("codigo"), ctx.agora, conta["totp_ultimo_passo"]) if segredo else None
    if passo is not None:      # grava o passo usado: o mesmo código não serve de novo (nem em paralelo)
        n = await ctx.banco.executar("UPDATE contas SET totp_ultimo_passo = ? WHERE email = ? AND totp_ultimo_passo < ?",
                                     passo, email, passo)
        passo = passo if n == 1 else None
    if passo is None:
        ctx.evento("2fa_falhou", email, tentativa=r["falhas"])
        extra = {"espera": r["bloqueado_ate"] - ctx.agora} if r["bloqueado_ate"] > ctx.agora else {}
        raise Falha(401, "CODE_INVALID", extra)
    # Autenticação completa: a sessão parcial é trocada por uma nova (novo identificador)
    await ctx.banco.executar("DELETE FROM sessoes WHERE id = ?", s["id"])
    await _limpar_login(ctx, email)
    envelope = await _criar_sessao(ctx, email, "ativa")
    ctx.evento("login", email, segundo_fator=True)
    return Resposta(200, _sessao_publica(ctx, email, conta["nome"], envelope, True, conta["email_verificado"]))


async def _senha_vazada(ctx):
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
def _google_config(ctx):
    cid, seg = str(ctx.config.get("GOOGLE_CLIENT_ID") or ""), str(ctx.config.get("GOOGLE_CLIENT_SECRET") or "")
    return (cid, seg) if cid and seg else None


def _origem(ctx):
    return ("http" if str(ctx.config.get("COOKIE_SEGURO", "1")) == "0" else "https") + "://" + ctx.pedido.host


def _cookie_curto(ctx, nome, valor, samesite):
    seguro = str(ctx.config.get("COOKIE_SEGURO", "1")) != "0"
    nome = ("__Host-" + nome) if seguro else nome
    ctx.cabecalhos["Set-Cookie"] = (f"{nome}={valor}; Path=/; HttpOnly; SameSite={samesite}; Max-Age={google.VALIDADE_S}"
                                    + ("; Secure" if seguro else ""))


def _ler_cookie_curto(ctx, nome):
    seguro = str(ctx.config.get("COOKIE_SEGURO", "1")) != "0"
    return google.ler_assinado(ctx.segredo, ctx.pedido.cookie(("__Host-" + nome) if seguro else nome), ctx.agora)


def _google_confirmado(ctx, email):
    """True se o Google confirmou ESTE e-mail há menos de 10 min (dispensa o CAPTCHA)."""
    c = _ler_cookie_curto(ctx, COOKIE_GOOGLE)
    return bool(c) and c.get("m") == email


def _redirecionar(destino):
    return Resposta(302, None, {"Location": destino})


async def _google_inicio(ctx):
    cfg = _google_config(ctx)
    if not cfg:
        return _redirecionar("/?google=indisponivel")
    if await _contar(ctx, f"consulta|{ctx.h(ctx.pedido.ip)}", CONSULTAS_POR_IP, CONSULTA_JANELA_S):
        return _redirecionar("/?google=erro")
    url, cookie = google.inicio(ctx.segredo, cfg[0], _origem(ctx) + "/api/google/retorno", ctx.agora)
    _cookie_curto(ctx, COOKIE_OAUTH, cookie, "Lax")          # Lax: volta do Google é navegação de outro site
    return _redirecionar(url)


async def _google_retorno(ctx):
    cfg = _google_config(ctx)
    c = _ler_cookie_curto(ctx, COOKIE_OAUTH)
    q = ctx.pedido.query
    if not cfg or not c or not isinstance(q.get("state"), str) or not hmac.compare_digest(q["state"], str(c.get("s"))):
        ctx.evento("google_recusado", motivo="state")
        return _redirecionar("/?google=erro")
    if q.get("error"):
        return _redirecionar("/?google=cancelado")
    try:
        ident = await google.trocar_codigo(ctx.servicos, cfg[0], cfg[1], _origem(ctx) + "/api/google/retorno",
                                           q.get("code"), str(c.get("v")), str(c.get("n")), ctx.agora)
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


async def _google_identidade(ctx):
    c = _ler_cookie_curto(ctx, COOKIE_GOOGLE)
    if not c:
        raise Falha(404, "NOT_FOUND")
    existe = await ctx.banco.primeiro("SELECT 1 AS x FROM contas WHERE email = ?", c["m"])
    return Resposta(200, {"email": c["m"], "nome": c.get("nm") or "", "contaExiste": bool(existe)})

# ---------------- rotas ----------------
_PROTEGIDAS = {
    ("PUT", "/api/conta/nome"), ("PUT", "/api/conta/senha"), ("DELETE", "/api/conta"),
    ("GET", "/api/documento"), ("PUT", "/api/documento"), ("POST", "/api/documento/apagar"), ("GET", "/api/historico"),
    ("POST", "/api/2fa/iniciar"), ("POST", "/api/2fa/confirmar"), ("POST", "/api/2fa/desativar"),
}
_SEM_CORPO = {"/api/2fa/iniciar"}


async def _rota(ctx):
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
    if m == "POST" and c == "/api/sessao/2fa":
        return await _segundo_fator(ctx)
    if m == "GET" and c == "/api/sessao":
        s = await _sessao(ctx)
        if not s:
            if p.cookie(_nome_cookie(ctx)) and not await _sessao(ctx, "2fa"):
                _definir_cookie(ctx)                   # cookie que não vale mais: apaga (a sessão parcial do 2FA fica)
            return Resposta(204)                       # sem sessão: resposta normal (não é erro para quem só abriu o site)
        conta = await ctx.banco.primeiro("SELECT nome, totp_segredo, email_verificado FROM contas WHERE email = ?", s["email"])
        return Resposta(200, _sessao_publica(ctx, s["email"], conta["nome"], _envelope(ctx, p.cookie(_nome_cookie(ctx))), conta["totp_segredo"],
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
    b = _json(p) if m in ("POST", "PUT") and c not in _SEM_CORPO else {}
    conta = await _conferir_prova(ctx, email)

    if c == "/api/conta/nome":
        await ctx.banco.executar("UPDATE contas SET nome = ? WHERE email = ?", _nome(b.get("nome")), email)
        return Resposta(200, {"ok": True})

    if c == "/api/conta/senha":
        # Novo sal + nova prova + documento recifrado, tudo na mesma transação
        sal, it = _sal(b.get("sal")), _iteracoes(b.get("iteracoes"))
        nova_prova, conteudo, va = _prova(b.get("prova")), _conteudo(b.get("conteudo")), _versao(b.get("versaoAnterior"))
        await _lote_atomico(ctx.banco, [
            _gravar_documento(email, va, conteudo), _GUARDA,
            ("UPDATE contas SET sal = ?, iteracoes = ?, verificador = ? WHERE email = ? AND verificador = ?",
             (sal, it, _verificador(nova_prova), email, conta["verificador"])), _GUARDA,
            _LIMPA_GUARDA,
            # o histórico estava cifrado com a senha anterior: é descartado
            ("DELETE FROM historico WHERE email = ?", (email,)),
            # as outras sessões (outros dispositivos) terminam
            ("DELETE FROM sessoes WHERE email = ? AND id != ?", (email, s["id"])),
        ])
        await _limpar_login(ctx, email)
        ctx.evento("senha_alterada", email)
        return Resposta(200, {"versao": va + 1})

    if m == "DELETE" and c == "/api/conta":
        await ctx.banco.lote([
            ("DELETE FROM historico WHERE email = ?", (email,)),
            ("DELETE FROM documentos WHERE email = ?", (email,)),
            ("DELETE FROM sessoes WHERE email = ?", (email,)),
            ("DELETE FROM contas WHERE email = ?", (email,)),
        ])
        await _limpar_login(ctx, email)
        _definir_cookie(ctx)
        ctx.evento("conta_excluida", email)
        return Resposta(204)

    if m == "GET" and c == "/api/documento":
        d = await ctx.banco.primeiro("SELECT versao, conteudo FROM documentos WHERE email = ?", email)
        return Resposta(200, d) if d else Resposta(404, {"erro": "NOT_FOUND"})

    if m == "PUT" and c == "/api/documento":
        conteudo, va = _conteudo(b.get("conteudo")), _versao(b.get("versaoAnterior"))
        sql, params = _gravar_documento(email, va, conteudo)
        n = await ctx.banco.executar(sql, *params)
        return Resposta(200, {"versao": va + 1}) if n else Resposta(409, {"erro": "DATA_CHANGED"})

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
        segredo = totp.decifrar(conta["totp_segredo"], ctx.segredo) if conta["totp_segredo"] else None
        if not segredo:
            raise Falha(409, "2FA_NOT_PENDING")
        chave = f"2fa|{ctx.h(email)}"
        r = await _reservar(ctx, chave)
        if not r:
            raise _bloqueado(ctx, await _limite(ctx, chave)) or Falha(429, "TOO_MANY_ATTEMPTS")
        passo = totp.conferir(segredo, b.get("codigo"), ctx.agora, conta["totp_ultimo_passo"])
        if passo is None:
            ctx.evento("2fa_desativacao_recusada", email, tentativa=r["falhas"])
            raise Falha(401, "CODE_INVALID", {"espera": r["bloqueado_ate"] - ctx.agora} if r["bloqueado_ate"] > ctx.agora else {})
        await ctx.banco.executar("DELETE FROM limites WHERE chave = ?", chave)
        await ctx.banco.executar(
            "UPDATE contas SET totp_segredo = NULL, totp_pendente = NULL, totp_ultimo_passo = 0 WHERE email = ?", email)
        await _encerrar_outras(ctx, email, s["id"])
        ctx.evento("2fa_desativado", email)
        return Resposta(200, {"doisFatores": False})

    raise Falha(404, "NOT_FOUND")


async def atender(pedido, banco, servicos, config, log=print, agora=None):
    """Atende um pedido /api/*. Nunca devolve detalhes técnicos ao navegador."""
    ctx = Contexto(pedido, banco, servicos, config, log, time.time() if agora is None else agora)
    try:
        if len(ctx.segredo) < 32:
            log(json.dumps({"evento": "configuracao_incompleta", "req": ctx.req, "falta": "SEGREDO"}))
            r = Resposta(503, {"erro": "UNAVAILABLE"})
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
