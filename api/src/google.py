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
"""
import base64
import hashlib
import hmac
import json
import secrets
import time
from urllib.parse import urlencode

import acesso

AUTORIZAR = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN = "https://oauth2.googleapis.com/token"
CHAVES = "https://www.googleapis.com/oauth2/v3/certs"
EMISSORES = ("https://accounts.google.com", "accounts.google.com")
VALIDADE_S = 600
_cache = {"chaves": None, "em": 0.0}


def b64u(dados):
    return base64.urlsafe_b64encode(dados).rstrip(b"=").decode("ascii")


def _assinar(segredo, carga):
    corpo = b64u(json.dumps(carga, separators=(",", ":")).encode("utf-8"))
    mac = b64u(hmac.new(segredo.encode(), ("zozo-google|" + corpo).encode("ascii"), hashlib.sha256).digest())
    return corpo + "." + mac


def ler_assinado(segredo, texto, agora):
    """Carga (dict) de um cookie assinado válido e não vencido, ou None."""
    if not isinstance(texto, str) or texto.count(".") != 1 or len(texto) > 2048:
        return None
    corpo, mac = texto.split(".")
    esperado = b64u(hmac.new(segredo.encode(), ("zozo-google|" + corpo).encode("ascii"), hashlib.sha256).digest())
    if not hmac.compare_digest(mac, esperado):
        return None
    try:
        carga = json.loads(acesso.b64url(corpo))
    except ValueError:
        return None
    if not isinstance(carga, dict) or not isinstance(carga.get("e"), int) or carga["e"] < agora:
        return None
    return carga


def inicio(segredo, client_id, redirect_uri, agora):
    """(url de autorização do Google, valor do cookie com state/nonce/verificador)."""
    state, nonce, verificador = secrets.token_urlsafe(24), secrets.token_urlsafe(24), secrets.token_urlsafe(48)
    desafio = b64u(hashlib.sha256(verificador.encode("ascii")).digest())
    url = AUTORIZAR + "?" + urlencode({
        "client_id": client_id, "redirect_uri": redirect_uri, "response_type": "code",
        "scope": "openid email profile", "state": state, "nonce": nonce,
        "code_challenge": desafio, "code_challenge_method": "S256", "prompt": "select_account",
    })
    return url, _assinar(segredo, {"s": state, "n": nonce, "v": verificador, "e": int(agora) + VALIDADE_S})


def identidade_assinada(segredo, email, nome, agora):
    """Cookie curto que lembra o e-mail confirmado pelo Google até o usuário digitar a senha."""
    return _assinar(segredo, {"m": email, "nm": nome, "e": int(agora) + VALIDADE_S})


async def _chaves(http_get, forcar=False):
    agora = time.time()
    if _cache["chaves"] is not None and not forcar and agora - _cache["em"] < 3600:
        return _cache["chaves"]
    status, corpo = await http_get(CHAVES, {})
    if status != 200:
        raise ValueError("chaves do Google indisponíveis")
    chaves = [k for k in json.loads(corpo).get("keys", []) if isinstance(k, dict)]
    _cache.update(chaves=chaves, em=agora)
    return chaves


async def trocar_codigo(servicos, client_id, client_secret, redirect_uri, codigo, verificador, nonce, agora):
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
        cab, claims, assinatura = json.loads(acesso.b64url(h)), json.loads(acesso.b64url(p)), acesso.b64url(s)
    except (ValueError, AttributeError, TypeError):
        return None
    if not isinstance(cab, dict) or not isinstance(claims, dict) or cab.get("alg") != "RS256" or not isinstance(cab.get("kid"), str):
        return None
    chaves = await _chaves(servicos.http_get)
    jwk = next((k for k in chaves if k.get("kid") == cab["kid"]), None)
    if jwk is None:                                   # rotação das chaves do Google
        chaves = await _chaves(servicos.http_get, forcar=True)
        jwk = next((k for k in chaves if k.get("kid") == cab["kid"]), None)
    if jwk is None or not acesso.verificar_rs256(jwk, (h + "." + p).encode("ascii"), assinatura):
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
