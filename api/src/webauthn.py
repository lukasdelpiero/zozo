"""
ZoZo — biometria e chaves de acesso (WebAuthn, nível 2)

O navegador cria a credencial (navigator.credentials.create) e assina desafios (navigator.credentials.get); o
servidor confere TUDO antes de aceitar:
  • clientDataJSON: tipo certo, desafio emitido por nós (uso único, 5 min, preso à conta) e origem do próprio site;
  • authenticatorData: hash do rpId (o domínio), presença (UP) E verificação da pessoa (UV = biometria ou PIN);
  • registro: chave pública COSE → JWK (só ES256 e RS256); atestado "none" (não dependemos do fabricante);
  • confirmação: assinatura sobre authenticatorData ‖ SHA-256(clientDataJSON) com a chave guardada e o contador
    de assinaturas, que nunca volta (contador que não sobe = credencial clonada, recusada).
A assinatura é conferida por Servicos.verificar_assinatura: WebCrypto no Worker (entry.py); nos testes e no servidor
local, uma verificação em Python puro (api/dev/assinatura_local.py). Este módulo só lê e confere formatos.
"""
import base64
import hashlib
import hmac
import json
import secrets
from typing import Any

ES256, RS256 = -7, -257
ALGORITMOS = (ES256, RS256)
TEMPO_DESAFIO_S = 300
MAX_CHAVES = 10
LIMITE_B64 = 16_000             # clientDataJSON, attestationObject, authenticatorData e assinatura (base64url)
TEMPO_LIMITE_MS = 120_000       # quanto o navegador espera a pessoa tocar no sensor


class Invalido(ValueError):
    """Resposta do autenticador fora das regras (vira 400 no núcleo; nunca 500)."""


# ---------------- base64url ----------------
def b64url(dados: bytes) -> str:
    return base64.urlsafe_b64encode(dados).decode("ascii").rstrip("=")


def de_b64url(texto: object, limite: int = LIMITE_B64) -> bytes:
    if not isinstance(texto, str) or not 1 <= len(texto) <= limite:
        raise Invalido()
    if any(c not in "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_" for c in texto):
        raise Invalido()
    try:
        return base64.urlsafe_b64decode(texto + "=" * (-len(texto) % 4))
    except (ValueError, TypeError) as ex:
        raise Invalido() from ex


# ---------------- CBOR (só o que o WebAuthn usa: inteiros, bytes, texto, listas, mapas, true/false/null) ----------------
def _cbor(dados: bytes, i: int, fundo: int) -> tuple[Any, int]:
    if fundo > 8 or i >= len(dados):
        raise Invalido()
    inicial = dados[i]
    maior, menor = inicial >> 5, inicial & 0x1F
    i += 1
    if menor < 24:
        n = menor
    elif menor in (24, 25, 26, 27):
        tam = 1 << (menor - 24)
        if i + tam > len(dados):
            raise Invalido()
        n = int.from_bytes(dados[i:i + tam], "big")
        i += tam
    else:
        raise Invalido()                                   # tamanho indefinido e reservados: fora do WebAuthn
    if maior == 0:
        return n, i
    if maior == 1:
        return -1 - n, i
    if maior in (2, 3):
        if i + n > len(dados):
            raise Invalido()
        bruto = dados[i:i + n]
        if maior == 2:
            return bytes(bruto), i + n
        try:
            return bruto.decode("utf-8"), i + n
        except UnicodeDecodeError as ex:
            raise Invalido() from ex
    if maior == 4:
        if n > 64:
            raise Invalido()
        lista = []
        for _ in range(n):
            v, i = _cbor(dados, i, fundo + 1)
            lista.append(v)
        return lista, i
    if maior == 5:
        if n > 64:
            raise Invalido()
        mapa: dict[Any, Any] = {}
        for _ in range(n):
            k, i = _cbor(dados, i, fundo + 1)
            if not isinstance(k, (int, str)) or k in mapa:
                raise Invalido()
            mapa[k], i = _cbor(dados, i, fundo + 1)
        return mapa, i
    if maior == 7 and menor in (20, 21, 22):
        return {20: False, 21: True, 22: None}[menor], i
    raise Invalido()


def cbor(dados: bytes, inicio: int = 0) -> tuple[Any, int]:
    """(valor, posição logo depois dele)"""
    return _cbor(dados, inicio, 0)


# ---------------- authenticatorData ----------------
UP, UV, AT, ED = 0x01, 0x04, 0x40, 0x80


def ler_dados_autenticador(dados: bytes, rp_id: str, com_credencial: bool) -> dict[str, Any]:
    """rpIdHash do nosso domínio, presença e verificação da pessoa; no registro, a credencial e a chave COSE."""
    if len(dados) < 37:
        raise Invalido()
    if not hmac.compare_digest(dados[:32], hashlib.sha256(rp_id.encode("utf-8")).digest()):
        raise Invalido()                                   # credencial de outro site
    flags = dados[32]
    if not flags & UP or not flags & UV:
        raise Invalido()                                   # sem toque ou sem biometria/PIN: não vale
    saida: dict[str, Any] = {"contador": int.from_bytes(dados[33:37], "big")}
    if not com_credencial:
        return saida
    if not flags & AT or len(dados) < 55:
        raise Invalido()
    tam = int.from_bytes(dados[53:55], "big")
    if not 16 <= tam <= 1023 or len(dados) < 55 + tam:
        raise Invalido()
    saida["credencial"] = dados[55:55 + tam]
    chave, fim = cbor(dados, 55 + tam)
    if fim != len(dados) and not flags & ED:
        raise Invalido()                                   # sobra sem extensões declaradas
    saida["jwk"], saida["alg"] = cose_para_jwk(chave)
    return saida


def cose_para_jwk(chave: object) -> tuple[dict[str, Any], int]:
    """Chave COSE → JWK aceita pelo WebCrypto. Só EC2 P-256 (ES256) e RSA (RS256, 2048 bits ou mais)."""
    if not isinstance(chave, dict):
        raise Invalido()
    kty, alg = chave.get(1), chave.get(3)
    if kty == 2 and alg == ES256:
        x, y = chave.get(-2), chave.get(-3)
        if chave.get(-1) != 1 or not isinstance(x, bytes) or not isinstance(y, bytes) or len(x) != 32 or len(y) != 32:
            raise Invalido()
        return {"kty": "EC", "crv": "P-256", "x": b64url(x), "y": b64url(y)}, ES256
    if kty == 3 and alg == RS256:
        n, e = chave.get(-1), chave.get(-2)
        if not isinstance(n, bytes) or not isinstance(e, bytes) or not 256 <= len(n.lstrip(b"\0")) <= 512 or not 1 <= len(e) <= 4:
            raise Invalido()
        return {"kty": "RSA", "n": b64url(n), "e": b64url(e)}, RS256
    raise Invalido()


def der_para_raw(assinatura: bytes) -> bytes:
    """ECDSA do WebAuthn vem em DER (SEQUENCE de dois INTEGER); o WebCrypto quer r ‖ s com 32 bytes cada."""
    try:
        if assinatura[0] != 0x30 or assinatura[1] != len(assinatura) - 2:
            raise Invalido()
        i, partes = 2, []
        for _ in range(2):
            if assinatura[i] != 0x02:
                raise Invalido()
            tam = assinatura[i + 1]
            v = assinatura[i + 2:i + 2 + tam]
            if not 1 <= tam <= 33 or len(v) != tam:
                raise Invalido()
            v = v.lstrip(b"\0")
            if len(v) > 32:
                raise Invalido()
            partes.append(v.rjust(32, b"\0"))
            i += 2 + tam
        if i != len(assinatura):
            raise Invalido()
    except IndexError as ex:
        raise Invalido() from ex
    return partes[0] + partes[1]


# ---------------- clientDataJSON ----------------
def ler_dados_cliente(bruto: bytes, tipo: str, origem: str) -> bytes:
    """Confere tipo e origem; devolve o desafio (bytes) para quem chama conferir que é nosso e não foi usado."""
    try:
        c = json.loads(bruto.decode("utf-8"))
    except (UnicodeDecodeError, ValueError) as ex:
        raise Invalido() from ex
    if not isinstance(c, dict) or c.get("type") != tipo or c.get("origin") != origem:
        raise Invalido()
    if c.get("crossOrigin") is True:
        raise Invalido()                                   # dentro de um iframe de outro site
    return de_b64url(c.get("challenge"), 200)


def hash_desafio(desafio: bytes) -> str:
    return hashlib.sha256(desafio).hexdigest()


def novo_desafio() -> bytes:
    return secrets.token_bytes(32)


def usuario_id(email: str, segredo: str) -> str:
    """Identificador da pessoa para o autenticador: estável, sem o e-mail (HMAC do SEGREDO)."""
    return b64url(hmac.new(("zozo/webauthn/v1|" + segredo).encode("utf-8"), email.encode("utf-8"), hashlib.sha256).digest()[:16])


def opcoes_registro(desafio: bytes, rp_id: str, email: str, nome: str, segredo: str, existentes: list[str]) -> dict[str, Any]:
    return {
        "challenge": b64url(desafio),
        "rp": {"id": rp_id, "name": "ZoZo"},
        "user": {"id": usuario_id(email, segredo), "name": email, "displayName": nome or email},
        "pubKeyCredParams": [{"type": "public-key", "alg": ES256}, {"type": "public-key", "alg": RS256}],
        "authenticatorSelection": {"residentKey": "preferred", "userVerification": "required"},
        "excludeCredentials": [{"type": "public-key", "id": c} for c in existentes],
        "attestation": "none",
        "timeout": TEMPO_LIMITE_MS,
    }


def opcoes_confirmacao(desafio: bytes, rp_id: str, credenciais: list[str]) -> dict[str, Any]:
    return {
        "challenge": b64url(desafio),
        "rpId": rp_id,
        "allowCredentials": [{"type": "public-key", "id": c} for c in credenciais],
        "userVerification": "required",
        "timeout": TEMPO_LIMITE_MS,
    }


def ler_registro(b: dict[str, Any], rp_id: str, origem: str) -> dict[str, Any]:
    """Registro vindo do navegador → desafio, id, JWK, algoritmo e contador. A credencial precisa ter id = o do authData."""
    cliente = de_b64url(b.get("clientDataJSON"))
    desafio = ler_dados_cliente(cliente, "webauthn.create", origem)
    atestado, fim = cbor(de_b64url(b.get("attestationObject")))
    if not isinstance(atestado, dict) or not isinstance(atestado.get("authData"), bytes) or not isinstance(atestado.get("fmt"), str):
        raise Invalido()
    dados = ler_dados_autenticador(atestado["authData"], rp_id, True)
    cid = de_b64url(b.get("id"), 1400)
    if not hmac.compare_digest(cid, dados["credencial"]):
        raise Invalido()
    return {"desafio": desafio, "id": b64url(cid), "jwk": dados["jwk"], "alg": dados["alg"], "contador": dados["contador"]}


def ler_confirmacao(b: dict[str, Any], rp_id: str, origem: str) -> dict[str, Any]:
    """Asserção vinda do navegador → desafio, id, contador e (dados assinados, assinatura) para conferir com a chave."""
    cliente = de_b64url(b.get("clientDataJSON"))
    desafio = ler_dados_cliente(cliente, "webauthn.get", origem)
    autenticador = de_b64url(b.get("authenticatorData"))
    dados = ler_dados_autenticador(autenticador, rp_id, False)
    return {"desafio": desafio, "id": b64url(de_b64url(b.get("id"), 1400)), "contador": dados["contador"],
            "assinado": autenticador + hashlib.sha256(cliente).digest(), "assinatura": de_b64url(b.get("signature"), 1024)}
