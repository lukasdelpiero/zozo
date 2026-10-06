"""
ZoZo (web) — validação do token do Cloudflare Access (JWT RS256)

O Cloudflare Access fica na frente do site e envia, em cada pedido, o
cabeçalho Cf-Access-Jwt-Assertion. Aqui o token é validado de novo:
assinatura RSA (PKCS#1 v1.5 + SHA-256), validade (exp/nbf), emissor
(iss), audiência (aud) e a lista de e-mails permitidos.

A verificação RSA é feita em Python puro, do jeito recomendado pela
RFC 8017 (8.2.2): a mensagem esperada é recodificada por inteiro e
comparada em tempo constante — sem "interpretar" a assinatura, o que
evita as falsificações clássicas de PKCS#1 v1.5.
"""
import base64
import hashlib
import hmac
import json
import time

# Prefixo DER do DigestInfo para SHA-256 (RFC 8017, seção 9.2, nota 1)
_DIGEST_INFO_SHA256 = bytes.fromhex("3031300d060960864801650304020105000420")
_MIN_BITS_RSA = 2048
_FOLGA_RELOGIO = 60            # segundos de tolerância entre relógios
_CACHE_CHAVES = 3600           # renova as chaves públicas a cada hora
_INTERVALO_RECARGA = 60        # chave desconhecida: no máximo 1 recarga por minuto

_cache = {"chaves": None, "em": 0.0, "dominio": None, "ultima_recarga": 0.0}


class ErroAcesso(Exception):
    """Falha ao obter as chaves públicas do Access (serviço indisponível)."""


def b64url(texto):
    if not isinstance(texto, str) or not texto or len(texto) > 16384:
        raise ValueError("base64url inválido")
    return base64.urlsafe_b64decode(texto + "=" * (-len(texto) % 4))


def _inteiro(texto):
    return int.from_bytes(b64url(texto), "big")


def verificar_rs256(jwk, mensagem, assinatura):
    """True se `assinatura` (bytes) é uma assinatura RS256 válida de `mensagem` (bytes)."""
    try:
        if jwk.get("kty") != "RSA":
            return False
        n, e = _inteiro(jwk["n"]), _inteiro(jwk["e"])
    except (KeyError, ValueError, TypeError, AttributeError):
        return False
    k = (n.bit_length() + 7) // 8
    if n.bit_length() < _MIN_BITS_RSA or e < 3 or e % 2 == 0 or len(assinatura) != k:
        return False
    s = int.from_bytes(assinatura, "big")
    if s >= n:
        return False
    recebido = pow(s, e, n).to_bytes(k, "big")
    t = _DIGEST_INFO_SHA256 + hashlib.sha256(mensagem).digest()
    if k < len(t) + 11:
        return False
    esperado = b"\x00\x01" + b"\xff" * (k - len(t) - 3) + b"\x00" + t
    return hmac.compare_digest(recebido, esperado)


def lista_emails(texto):
    return {x.strip().lower() for x in str(texto or "").split(",") if x.strip()}


def dominio_valido(dominio):
    d = str(dominio or "").strip().lower()
    return bool(d) and d.endswith(".cloudflareaccess.com") and "/" not in d and not d.startswith("seu-time.")


async def _chaves(http_get, dominio, forcar=False):
    agora = time.time()
    c = _cache
    valido = c["chaves"] is not None and c["dominio"] == dominio and agora - c["em"] < _CACHE_CHAVES
    if valido and not forcar:
        return c["chaves"]
    if valido and forcar:
        if agora - c["ultima_recarga"] < _INTERVALO_RECARGA:   # evita recargas em excesso com tokens forjados
            return c["chaves"]
        c["ultima_recarga"] = agora
    status, corpo = await http_get(f"https://{dominio}/cdn-cgi/access/certs", {})
    if status != 200:
        if valido:
            return c["chaves"]
        raise ErroAcesso("certs")
    try:
        chaves = [k for k in json.loads(corpo).get("keys", []) if isinstance(k, dict)]
    except (ValueError, AttributeError) as ex:
        raise ErroAcesso("certs") from ex
    c.update(chaves=chaves, em=agora, dominio=dominio)
    return chaves


async def identidade(token, config, http_get, agora=None):
    """
    E-mail (minúsculo) do usuário autenticado pelo Access, ou None.
    Lança ErroAcesso se as chaves públicas não puderem ser obtidas.
    """
    dominio = str(config.get("ACCESS_TEAM_DOMAIN") or "").strip().lower()
    aud_esperada = str(config.get("ACCESS_AUD") or "").strip()
    permitidos = lista_emails(config.get("ALLOWED_EMAILS"))
    # Configuração incompleta: nega tudo (nunca "abre" o sistema)
    if not dominio_valido(dominio) or not aud_esperada or "COLE-AQUI" in aud_esperada or not permitidos:
        raise ErroAcesso("configuração")
    if not isinstance(token, str) or token.count(".") != 2 or len(token) > 16384:
        return None
    h, p, s = token.split(".")
    try:
        cab = json.loads(b64url(h))
        claims = json.loads(b64url(p))
        assinatura = b64url(s)
    except ValueError:
        return None
    if not isinstance(cab, dict) or not isinstance(claims, dict) or cab.get("alg") != "RS256":
        return None
    kid = cab.get("kid")
    if not isinstance(kid, str):
        return None

    chaves = await _chaves(http_get, dominio)
    jwk = next((k for k in chaves if k.get("kid") == kid), None)
    if jwk is None:                                   # chave nova (rotação): recarrega uma vez
        chaves = await _chaves(http_get, dominio, forcar=True)
        jwk = next((k for k in chaves if k.get("kid") == kid), None)
    if jwk is None or not verificar_rs256(jwk, (h + "." + p).encode("ascii"), assinatura):
        return None

    agora = time.time() if agora is None else agora
    exp, nbf = claims.get("exp"), claims.get("nbf")
    if not isinstance(exp, (int, float)) or isinstance(exp, bool) or exp < agora - _FOLGA_RELOGIO:
        return None
    if nbf is not None and (not isinstance(nbf, (int, float)) or nbf > agora + _FOLGA_RELOGIO):
        return None
    if claims.get("iss") != f"https://{dominio}":
        return None
    aud = claims.get("aud")
    auds = aud if isinstance(aud, list) else [aud]
    if aud_esperada not in auds:
        return None
    if claims.get("type", "app") != "app":
        return None
    email = claims.get("email")
    if not isinstance(email, str) or not email:
        return None
    email = email.strip().lower()
    return email if email in permitidos else None
