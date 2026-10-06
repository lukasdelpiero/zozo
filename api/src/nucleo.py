"""
ZoZo (web) — núcleo da API (Python puro, sem dependências do Cloudflare)

Camadas de proteção:
  1. Cloudflare Access na frente do site (só e-mails autorizados);
  2. o token do Access é validado de novo aqui (acesso.py);
  3. lista de e-mails permitidos (ALLOWED_EMAILS) como segunda barreira;
  4. cada pessoa só lê/grava os próprios dados (o e-mail vem do token, nunca do pedido);
  5. PROVA DE SENHA: os dados só são lidos, gravados ou apagados com a "prova"
     derivada da senha no navegador (o servidor guarda apenas o SHA-256 dela).
     Uma sessão do Access roubada não basta para ler, adulterar ou apagar nada;
  6. bloqueio de 1 minuto após 5 provas erradas;
  7. gravação com versão (409 se outro dispositivo gravou antes) + histórico;
  8. operações de várias etapas (troca de senha, apagar dados) são atômicas.

O servidor nunca recebe a senha nem os dados legíveis: o documento chega
cifrado (AES-256-GCM) do navegador.

O núcleo recebe um `banco` com três métodos assíncronos:
    primeiro(sql, *params) -> dict | None
    todos(sql, *params)    -> list[dict]
    executar(sql, *params) -> int (linhas alteradas)
    lote([(sql, params), ...]) -> list[int]   (transação: erro desfaz tudo)
e uma função `http_get(url, cabecalhos) -> (status, texto)`.
"""
import base64
import binascii
import hashlib
import hmac
import json
import re
import time
import unicodedata
from urllib.parse import urlsplit

LIMITE_CORPO = 2_100_000        # bytes do pedido
LIMITE_CONTEUDO = 1_900_000     # caracteres do documento cifrado (D1: máx. ~2 MB por linha)
ITERACOES_MIN = 600_000
ITERACOES_MAX = 10_000_000
MAX_FALHAS = 5
BLOQUEIO_S = 60
FORMATO_DOCUMENTO = 2           # primeiro byte do documento cifrado (versão do formato)
MAX_VERSAO = 2**53 - 1

_B64 = re.compile(r"^[A-Za-z0-9+/]+={0,2}$")
_PREFIXO_SHA1 = re.compile(r"^[0-9A-F]{5}$")
_AGORA_SQL = "strftime('%Y-%m-%dT%H:%M:%fZ','now')"

CABECALHOS = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
}


class Resposta:
    def __init__(self, status, dados=None):
        self.status = status
        self.dados = dados

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
        self.cabecalhos = {str(k).lower(): str(v) for k, v in (cabecalhos or {}).items()}
        self.corpo = corpo or ""

    def cab(self, nome):
        return self.cabecalhos.get(nome.lower())


class Falha(Exception):
    def __init__(self, status, codigo):
        super().__init__(codigo)
        self.status = status
        self.codigo = codigo


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


# ---------------- prova de senha + bloqueio por tentativas ----------------
async def _conferir_prova(banco, email, pedido, agora):
    """Confere a prova enviada no cabeçalho X-ZoZo-Prova. Devolve a linha da conta."""
    conta = await banco.primeiro("SELECT nome, verificador FROM contas WHERE email = ?", email)
    if not conta:
        raise Falha(404, "NOT_FOUND")
    # A tentativa é contada ANTES de conferir a prova, num único comando atômico:
    # pedidos em paralelo não conseguem ler o contador antigo e escapar do limite.
    # Durante o bloqueio o contador sobe, mas "ultima" não muda (o bloqueio não é prolongado).
    t = await banco.primeiro(
        "INSERT INTO tentativas (email, falhas, ultima) VALUES (?, 1, ?) "
        "ON CONFLICT(email) DO UPDATE SET "
        "falhas = CASE WHEN excluded.ultima - tentativas.ultima >= ? THEN 1 ELSE tentativas.falhas + 1 END, "
        "ultima = CASE WHEN tentativas.falhas >= ? AND excluded.ultima - tentativas.ultima < ? "
        "THEN tentativas.ultima ELSE excluded.ultima END "
        "RETURNING falhas",
        email, int(agora), BLOQUEIO_S, MAX_FALHAS, BLOQUEIO_S)
    if not t or t["falhas"] > MAX_FALHAS:
        raise Falha(429, "TOO_MANY_ATTEMPTS")
    try:
        prova = _prova(pedido.cab("x-zozo-prova"))
        ok = hmac.compare_digest(_verificador(prova), str(conta["verificador"]))
    except Falha:
        ok = False
    if not ok:
        raise Falha(403, "WRONG_PASSWORD")
    await banco.executar("DELETE FROM tentativas WHERE email = ?", email)
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


# ---------------- rotas ----------------
async def _rota(pedido, email, banco, http_get, agora):
    m, c = pedido.metodo, pedido.caminho

    if m == "GET" and c == "/api/eu":
        return Resposta(200, {"email": email})

    if m == "GET" and c == "/api/conta":
        conta = await banco.primeiro("SELECT nome, sal, iteracoes FROM contas WHERE email = ?", email)
        return Resposta(200, conta) if conta else Resposta(404, {"erro": "NOT_FOUND"})

    if m == "POST" and c == "/api/conta":
        b = _json(pedido)
        sal, it, prova = _sal(b.get("sal")), _iteracoes(b.get("iteracoes")), _prova(b.get("prova"))
        n = await banco.executar(
            "INSERT OR IGNORE INTO contas (email, nome, sal, iteracoes, verificador) VALUES (?, ?, ?, ?, ?)",
            email, _nome(b.get("nome")), sal, it, _verificador(prova))
        return Resposta(201, {"criada": True}) if n else Resposta(409, {"erro": "EMAIL_IN_USE"})

    if m == "GET" and c.startswith("/api/senha-vazada/"):
        # k-anonimato: só os 5 primeiros caracteres do SHA-1 saem do navegador
        prefixo = c.rsplit("/", 1)[-1].upper()
        if not _PREFIXO_SHA1.match(prefixo):
            raise Falha(400, "INVALID_REQUEST")
        status, texto = await http_get(f"https://api.pwnedpasswords.com/range/{prefixo}",
                                       {"Add-Padding": "true", "User-Agent": "ZoZo-web"})
        if status != 200 or len(texto) > 2_000_000:
            raise Falha(502, "UNAVAILABLE")
        return Resposta(200, {"lista": texto})

    # ---- daqui em diante: exige a prova da senha ----
    rotas_protegidas = {
        ("POST", "/api/conta/verificar"), ("PUT", "/api/conta/nome"), ("PUT", "/api/conta/senha"),
        ("DELETE", "/api/conta"), ("GET", "/api/documento"), ("PUT", "/api/documento"),
        ("POST", "/api/documento/apagar"), ("GET", "/api/historico"),
    }
    if (m, c) not in rotas_protegidas:
        raise Falha(404, "NOT_FOUND")
    # Corpo validado ANTES da prova: pedido malformado não consome tentativa
    b = _json(pedido) if m in ("POST", "PUT") and c != "/api/conta/verificar" else {}
    conta = await _conferir_prova(banco, email, pedido, agora)

    if c == "/api/conta/verificar":
        return Resposta(204)

    if c == "/api/conta/nome":
        await banco.executar("UPDATE contas SET nome = ? WHERE email = ?", _nome(b.get("nome")), email)
        return Resposta(200, {"ok": True})

    if c == "/api/conta/senha":
        # Novo sal + nova prova + documento recifrado, tudo na mesma transação
        sal, it = _sal(b.get("sal")), _iteracoes(b.get("iteracoes"))
        nova_prova, conteudo, va = _prova(b.get("prova")), _conteudo(b.get("conteudo")), _versao(b.get("versaoAnterior"))
        await _lote_atomico(banco, [
            _gravar_documento(email, va, conteudo), _GUARDA,
            ("UPDATE contas SET sal = ?, iteracoes = ?, verificador = ? WHERE email = ? AND verificador = ?",
             (sal, it, _verificador(nova_prova), email, conta["verificador"])), _GUARDA,
            _LIMPA_GUARDA,
            # o histórico estava cifrado com a senha anterior: é descartado
            ("DELETE FROM historico WHERE email = ?", (email,)),
            ("DELETE FROM tentativas WHERE email = ?", (email,)),
        ])
        return Resposta(200, {"versao": va + 1})

    if m == "DELETE" and c == "/api/conta":
        await banco.lote([
            ("DELETE FROM historico WHERE email = ?", (email,)),
            ("DELETE FROM documentos WHERE email = ?", (email,)),
            ("DELETE FROM tentativas WHERE email = ?", (email,)),
            ("DELETE FROM contas WHERE email = ?", (email,)),
        ])
        return Resposta(204)

    if m == "GET" and c == "/api/documento":
        d = await banco.primeiro("SELECT versao, conteudo FROM documentos WHERE email = ?", email)
        return Resposta(200, d) if d else Resposta(404, {"erro": "NOT_FOUND"})

    if m == "PUT" and c == "/api/documento":
        conteudo, va = _conteudo(b.get("conteudo")), _versao(b.get("versaoAnterior"))
        sql, params = _gravar_documento(email, va, conteudo)
        n = await banco.executar(sql, *params)
        return Resposta(200, {"versao": va + 1}) if n else Resposta(409, {"erro": "DATA_CHANGED"})

    if c == "/api/documento/apagar":
        # "Apagar todos os dados": grava o documento vazio (a versão continua subindo,
        # então nenhum dispositivo confunde isso com um retrocesso) e descarta o histórico
        conteudo, va = _conteudo(b.get("conteudo")), _versao(b.get("versaoAnterior"))
        await _lote_atomico(banco, [
            _gravar_documento(email, va, conteudo), _GUARDA, _LIMPA_GUARDA,
            ("DELETE FROM historico WHERE email = ?", (email,)),
        ])
        return Resposta(200, {"versao": va + 1})

    if c == "/api/historico":
        versoes = await banco.todos(
            "SELECT versao, conteudo, criado_em AS criadoEm FROM historico WHERE email = ? ORDER BY versao DESC LIMIT 10", email)
        return Resposta(200, {"versoes": versoes})

    raise Falha(404, "NOT_FOUND")


async def atender(pedido, banco, http_get, identificar, log=print):
    """
    Atende um pedido /api/*. `identificar(pedido)` devolve o e-mail autenticado
    (ou None) e pode lançar Exception se a autenticação estiver indisponível.
    """
    try:
        _mesma_origem(pedido)
        try:
            email = await identificar(pedido)
        except Exception as ex:  # noqa: BLE001
            log(f"autenticação indisponível: {type(ex).__name__}")
            return Resposta(503, {"erro": "UNAVAILABLE"})
        if not email:
            return Resposta(401, {"erro": "UNAUTHORIZED"})
        return await _rota(pedido, email, banco, http_get, time.time())
    except Falha as f:
        return Resposta(f.status, {"erro": f.codigo})
    except Exception as ex:  # noqa: BLE001 — nunca devolve detalhes técnicos
        log(f"falha no servidor: {type(ex).__name__}")
        return Resposta(500, {"erro": "STORAGE_UNAVAILABLE"})
