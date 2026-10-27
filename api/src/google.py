"""
ZoZo — "Continuar com Google" (OpenID Connect, fluxo de código com PKCE)

O Google CONFIRMA A IDENTIDADE (o e-mail), mas não substitui a senha do ZoZo:
a senha é a chave da criptografia dos dados, e nem o servidor nem o Google
podem tê-la. Depois do Google, o usuário digita a senha (conta existente) ou
cria uma (cadastro já preenchido) — sem CAPTCHA, porque o Google já verificou.

Proteções: state (CSRF) + PKCE S256 + nonce guardados num cookie assinado
(HMAC com o SEGREDO) de 10 min; troca do código pelo servidor; ID token com
assinatura RS256 conferida nas chaves públicas do Google, emissor, audiência,
validade, nonce e e-mail verificado.

A verificação RSA é feita em Python puro, do jeito recomendado pela RFC 8017
(8.2.2): a mensagem esperada é recodificada por inteiro e comparada em tempo
constante — sem "interpretar" a assinatura, o que evita as falsificações
clássicas de PKCS#1 v1.5.
"""
import base64
import hashlib
import hmac
import json
import secrets
import time
from collections.abc import Awaitable, Callable, Mapping
from typing import Any, Protocol
from urllib.parse import urlencode

AUTORIZAR = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN = "https://oauth2.googleapis.com/token"
CHAVES = "https://www.googleapis.com/oauth2/v3/certs"
EMISSORES = ("https://accounts.google.com", "accounts.google.com")
VALIDADE_S = 600
_cache_chaves: list[dict[str, Any]] | None = None     # chaves públicas do Google (1 h)
_cache_em = 0.0

# Prefixo DER do DigestInfo para SHA-256 (RFC 8017, seção 9.2, nota 1)
_DIGEST_INFO_SHA256 = bytes.fromhex("3031300d060960864801650304020105000420")
_MIN_BITS_RSA = 2048


def b64url(texto: str) -> bytes:
    if not isinstance(texto, str) or not texto or len(texto) > 16384:
        raise ValueError("base64url inválido")
    return base64.urlsafe_b64decode(texto + "=" * (-len(texto) % 4))


def _inteiro(texto: str) -> int:
    return int.from_bytes(b64url(texto), "big")


def verificar_rs256(jwk: Mapping[str, Any], mensagem: bytes, assinatura: bytes) -> bool:
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


def b64u(dados: bytes) -> str:
    return base64.urlsafe_b64encode(dados).rstrip(b"=").decode("ascii")


def _assinar(segredo: str, carga: Mapping[str, Any]) -> str:
    corpo = b64u(json.dumps(carga, separators=(",", ":")).encode("utf-8"))
    mac = b64u(hmac.new(segredo.encode(), ("zozo-google|" + corpo).encode("ascii"), hashlib.sha256).digest())
    return corpo + "." + mac


def ler_assinado(segredo: str, texto: str | None, agora: float) -> dict[str, Any] | None:
    """Carga (dict) de um cookie assinado válido e não vencido, ou None."""
    if not isinstance(texto, str) or texto.count(".") != 1 or len(texto) > 2048:
        return None
    corpo, mac = texto.split(".")
    esperado = b64u(hmac.new(segredo.encode(), ("zozo-google|" + corpo).encode("ascii"), hashlib.sha256).digest())
    if not hmac.compare_digest(mac, esperado):
        return None
    try:
        carga = json.loads(b64url(corpo))
    except ValueError:
        return None
    if not isinstance(carga, dict) or not isinstance(carga.get("e"), int) or carga["e"] < agora:
        return None
    return carga


def inicio(segredo: str, client_id: str, redirect_uri: str, agora: float) -> tuple[str, str]:
    """(url de autorização do Google, valor do cookie com state/nonce/verificador)."""
    state, nonce, verificador = secrets.token_urlsafe(24), secrets.token_urlsafe(24), secrets.token_urlsafe(48)
    desafio = b64u(hashlib.sha256(verificador.encode("ascii")).digest())
    url = AUTORIZAR + "?" + urlencode({
        "client_id": client_id, "redirect_uri": redirect_uri, "response_type": "code",
        "scope": "openid email profile", "state": state, "nonce": nonce,
        "code_challenge": desafio, "code_challenge_method": "S256", "prompt": "select_account",
    })
    return url, _assinar(segredo, {"s": state, "n": nonce, "v": verificador, "e": int(agora) + VALIDADE_S})


def identidade_assinada(segredo: str, email: str, nome: str, agora: float) -> str:
    """Cookie curto que lembra o e-mail confirmado pelo Google até o usuário digitar a senha."""
    return _assinar(segredo, {"m": email, "nm": nome, "e": int(agora) + VALIDADE_S})


async def _chaves(http_get: Callable[[str, Mapping[str, str]], Awaitable[tuple[int, str]]], forcar: bool = False) -> list[dict[str, Any]]:
    global _cache_chaves, _cache_em
    agora = time.time()
    if _cache_chaves is not None and not forcar and agora - _cache_em < 3600:
        return _cache_chaves
    status, corpo = await http_get(CHAVES, {})
    if status != 200:
        raise ValueError("chaves do Google indisponíveis")
    chaves = [k for k in json.loads(corpo).get("keys", []) if isinstance(k, dict)]
    _cache_chaves, _cache_em = chaves, agora
    return chaves


class _Servicos(Protocol):
    async def http_get(self, url: str, cabecalhos: Mapping[str, str]) -> tuple[int, str]: ...
    async def http_post(self, url: str, campos: Mapping[str, str]) -> tuple[int, str]: ...


async def trocar_codigo(servicos: _Servicos, client_id: str, client_secret: str, redirect_uri: str, codigo: str, verificador: str,
                        nonce: str, agora: float) -> dict[str, str] | None:
    """E-mail e nome confirmados pelo Google, ou None (qualquer falha = não autenticado)."""
    if not isinstance(codigo, str) or not codigo or len(codigo) > 2048:
        return None
    status, texto = await servicos.http_post(TOKEN, {
        "code": codigo, "client_id": client_id, "client_secret": client_secret,
        "redirect_uri": redirect_uri, "grant_type": "authorization_code", "code_verifier": verificador,
    })
    if status != 200:
        return None
    try:
        token = json.loads(texto).get("id_token")
        h, p, s = token.split(".")
        cab, claims, assinatura = json.loads(b64url(h)), json.loads(b64url(p)), b64url(s)
    except (ValueError, AttributeError, TypeError):
        return None
    if not isinstance(cab, dict) or not isinstance(claims, dict) or cab.get("alg") != "RS256" or not isinstance(cab.get("kid"), str):
        return None
    chaves = await _chaves(servicos.http_get)
    jwk = next((k for k in chaves if k.get("kid") == cab["kid"]), None)
    if jwk is None:                                   # rotação das chaves do Google
        chaves = await _chaves(servicos.http_get, forcar=True)
        jwk = next((k for k in chaves if k.get("kid") == cab["kid"]), None)
    if jwk is None or not verificar_rs256(jwk, (h + "." + p).encode("ascii"), assinatura):
        return None
    aud = claims.get("aud")
    exp = claims.get("exp")
    if (claims.get("iss") not in EMISSORES or (aud != client_id and not (isinstance(aud, list) and client_id in aud))
            or not isinstance(exp, (int, float)) or exp < agora - 60
            or not isinstance(claims.get("nonce"), str) or not hmac.compare_digest(claims["nonce"], nonce)
            or claims.get("email_verified") is not True or not isinstance(claims.get("email"), str)):
        return None
    nome = claims.get("given_name") or claims.get("name") or ""
    return {"email": claims["email"].strip().lower(), "nome": str(nome)[:80]}
