"""
ZoZo — 2FA por aplicativo autenticador (TOTP, RFC 6238) e proteção do segredo

• Código de 6 dígitos, passo de 30 s, HMAC-SHA1 — o padrão aceito por Google
  Authenticator, Microsoft Authenticator, Authy, 1Password, Bitwarden etc.
• Tolerância de ±1 passo (relógio do celular adiantado/atrasado).
• O segredo nunca fica em texto puro no banco: é cifrado com uma chave derivada
  do SEGREDO do servidor (variável secreta do Worker). Cifra: fluxo HMAC-SHA256
  (nonce aleatório por gravação) + etiqueta HMAC-SHA256 (detecta adulteração).
  Só usa a biblioteca padrão (os Python Workers não têm AES nativo).
"""
import base64
import hashlib
import hmac
import secrets
import struct
from urllib.parse import quote

PASSO = 30
DIGITOS = 6
JANELA = 1                       # aceita o passo anterior e o seguinte
TAMANHO_SEGREDO = 20             # 160 bits (recomendação da RFC 4226)


def novo_segredo() -> bytes:
    return secrets.token_bytes(TAMANHO_SEGREDO)


def base32(segredo: bytes) -> str:
    return base64.b32encode(segredo).decode("ascii").rstrip("=")


def uri(segredo: bytes, email: str, emissor: str = "ZoZo") -> str:
    """otpauth:// lido pelo QR code do aplicativo autenticador."""
    rotulo = quote(f"{emissor}:{email}", safe="@:")
    return (f"otpauth://totp/{rotulo}?secret={base32(segredo)}&issuer={quote(emissor)}"
            f"&algorithm=SHA1&digits={DIGITOS}&period={PASSO}")


def codigo(segredo: bytes, passo: int) -> str:
    mac = hmac.new(segredo, struct.pack(">Q", passo), hashlib.sha1).digest()
    o = mac[-1] & 0x0F
    n = (struct.unpack(">I", mac[o:o + 4])[0] & 0x7FFFFFFF) % (10 ** DIGITOS)
    return str(n).zfill(DIGITOS)


def conferir(segredo: bytes, texto: object, agora: float, ultimo_passo: int = 0) -> int | None:
    """
    Passo (int) em que o código vale, ou None.
    Recusa passos já usados (<= ultimo_passo): um código não serve duas vezes.
    """
    t = str(texto or "").strip().replace(" ", "")
    if len(t) != DIGITOS or not t.isascii() or not t.isdigit():          # "１２３４５６" (dígitos Unicode) não é código
        return None
    atual = int(agora) // PASSO
    achado = None
    for d in range(-JANELA, JANELA + 1):          # confere todos (tempo constante entre acertos e erros)
        p = atual + d
        if hmac.compare_digest(codigo(segredo, p), t) and p > ultimo_passo:
            achado = p
    return achado


# ---------------- segredo cifrado com o SEGREDO do servidor ----------------
def _chaves(segredo_servidor: str) -> tuple[bytes, bytes]:
    base = hashlib.sha256(("zozo/totp|" + segredo_servidor).encode("utf-8")).digest()
    return (hmac.new(base, b"cifra", hashlib.sha256).digest(),
            hmac.new(base, b"etiqueta", hashlib.sha256).digest())


def _fluxo(chave: bytes, nonce: bytes, tamanho: int) -> bytes:
    saida, i = b"", 0
    while len(saida) < tamanho:
        saida += hmac.new(chave, nonce + struct.pack(">I", i), hashlib.sha256).digest()
        i += 1
    return saida[:tamanho]


def cifrar(segredo: bytes, segredo_servidor: str) -> str:
    kc, ke = _chaves(segredo_servidor)
    nonce = secrets.token_bytes(16)
    ct = bytes(a ^ b for a, b in zip(segredo, _fluxo(kc, nonce, len(segredo))))
    tag = hmac.new(ke, nonce + ct, hashlib.sha256).digest()[:16]
    return base64.b64encode(nonce + ct + tag).decode("ascii")


def decifrar(texto: str, segredo_servidor: str) -> bytes | None:
    """Segredo (bytes) ou None se ausente/adulterado/cifrado com outro SEGREDO."""
    try:
        bruto = base64.b64decode(str(texto or ""), validate=True)
    except (ValueError, TypeError):
        return None
    if len(bruto) < 16 + 1 + 16:
        return None
    kc, ke = _chaves(segredo_servidor)
    nonce, ct, tag = bruto[:16], bruto[16:-16], bruto[-16:]
    if not hmac.compare_digest(hmac.new(ke, nonce + ct, hashlib.sha256).digest()[:16], tag):
        return None
    return bytes(a ^ b for a, b in zip(ct, _fluxo(kc, nonce, len(ct))))


# ---------------- códigos de backup (uso único, no lugar do aplicativo) ----------------
# 10 códigos de 10 caracteres no alfabeto Base32 de Crockford (sem I, L, O e U: nada de confundir 1 com I ou 0
# com O), 50 bits cada, mostrados como "ABCDE-12345". Ao conferir: maiúsculas, sem espaço nem hífen, O vira 0 e
# I ou L viram 1 (erro comum de digitação). Guardado só o HMAC (chave derivada do SEGREDO do servidor + e-mail).
CODIGOS_BACKUP = 10
_ALFABETO_BACKUP = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
_TAMANHO_BACKUP = 10


def novos_codigos_backup() -> list[str]:
    codigos: set[str] = set()
    while len(codigos) < CODIGOS_BACKUP:
        c = "".join(secrets.choice(_ALFABETO_BACKUP) for _ in range(_TAMANHO_BACKUP))
        codigos.add(c[:5] + "-" + c[5:])
    return sorted(codigos)


def normalizar_backup(texto: object) -> str | None:
    """Código de backup comparável ("abcde 12345" = "ABCDE-12345"), ou None se não tem o formato."""
    t = str(texto or "").strip().upper().replace(" ", "").replace("-", "")
    t = t.translate(str.maketrans("OIL", "011"))
    if len(t) != _TAMANHO_BACKUP or not t.isascii() or any(ch not in _ALFABETO_BACKUP for ch in t):
        return None
    return t


def hash_backup(normalizado: str, email: str, segredo_servidor: str) -> str:
    chave = hashlib.sha256(("zozo/backup/v1|" + segredo_servidor).encode("utf-8")).digest()
    return hmac.new(chave, (email + "|" + normalizado).encode("utf-8"), hashlib.sha256).hexdigest()
