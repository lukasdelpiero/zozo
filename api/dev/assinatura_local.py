"""
ZoZo — assinaturas do WebAuthn fora do Worker (testes e servidor local), só com a biblioteca padrão

Em produção quem confere é o WebCrypto do Worker (entry.py, Servicos.verificar_assinatura). Aqui ficam:
  • verificar(alg, jwk, dados, assinatura): ES256 (P-256, assinatura r ‖ s) e RS256 (PKCS#1 v1.5, SHA-256);
  • um autenticador de mentira para os testes (gerar chaves e assinar), que nunca é usado fora deles.
Não é para produção: não tem proteção contra canais laterais (aqui só se confere, com chave pública).
"""
import base64
import hashlib
import secrets

# P-256 (FIPS 186-4)
P = 0xFFFFFFFF00000001000000000000000000000000FFFFFFFFFFFFFFFFFFFFFFFF
A = P - 3
B = 0x5AC635D8AA3A93E7B3EBBD55769886BC651D06B0CC53B0F63BCE3C3E27D2604B
N = 0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551
G = (0x6B17D1F2E12C4247F8BCE6E563A440F277037D812DEB33A0F4A13945D898C296,
     0x4FE342E2FE1A7F9B8EE7EB4A7C0F9E162BCE33576B315ECECBB6406837BF51F5)
_DIGEST_SHA256 = bytes.fromhex("3031300d060960864801650304020105000420")


def _b64(t: str) -> bytes:
    return base64.urlsafe_b64decode(t + "=" * (-len(t) % 4))


def _soma(p1, p2):
    if p1 is None:
        return p2
    if p2 is None:
        return p1
    (x1, y1), (x2, y2) = p1, p2
    if x1 == x2 and (y1 + y2) % P == 0:
        return None
    if p1 == p2:
        m = (3 * x1 * x1 + A) * pow(2 * y1, -1, P) % P
    else:
        m = (y2 - y1) * pow(x2 - x1, -1, P) % P
    x3 = (m * m - x1 - x2) % P
    return x3, (m * (x1 - x3) - y1) % P


def _vezes(k, ponto):
    r = None
    while k:
        if k & 1:
            r = _soma(r, ponto)
        ponto = _soma(ponto, ponto)
        k >>= 1
    return r


def _na_curva(x, y):
    return 0 <= x < P and 0 <= y < P and (y * y - (x * x * x + A * x + B)) % P == 0


def verificar(alg: int, jwk: dict, dados: bytes, assinatura: bytes) -> bool:
    h = hashlib.sha256(dados).digest()
    if alg == -7:
        if len(assinatura) != 64 or jwk.get("crv") != "P-256":
            return False
        x, y = int.from_bytes(_b64(jwk["x"]), "big"), int.from_bytes(_b64(jwk["y"]), "big")
        r, s = int.from_bytes(assinatura[:32], "big"), int.from_bytes(assinatura[32:], "big")
        if not _na_curva(x, y) or not (1 <= r < N and 1 <= s < N):
            return False
        w = pow(s, -1, N)
        ponto = _soma(_vezes(int.from_bytes(h, "big") * w % N, G), _vezes(r * w % N, (x, y)))
        return ponto is not None and ponto[0] % N == r
    if alg == -257:
        n, e = int.from_bytes(_b64(jwk["n"]), "big"), int.from_bytes(_b64(jwk["e"]), "big")
        k = (n.bit_length() + 7) // 8
        if len(assinatura) != k:
            return False
        m = pow(int.from_bytes(assinatura, "big"), e, n).to_bytes(k, "big")
        esperado = b"\x00\x01" + b"\xff" * (k - 3 - len(_DIGEST_SHA256) - 32) + b"\x00" + _DIGEST_SHA256 + h
        return m == esperado
    return False


# ---------------- autenticador de mentira (só nos testes) ----------------
def _der(r: int, s: int) -> bytes:
    def inteiro(v: int) -> bytes:
        b = v.to_bytes(32, "big").lstrip(b"\0") or b"\0"
        if b[0] & 0x80:
            b = b"\0" + b
        return b"\x02" + bytes([len(b)]) + b
    corpo = inteiro(r) + inteiro(s)
    return b"\x30" + bytes([len(corpo)]) + corpo


class ChaveEC:
    """Par de chaves P-256: COSE (para o authData) e assinatura em DER, como um autenticador de verdade."""

    def __init__(self) -> None:
        self.d = secrets.randbelow(N - 1) + 1
        self.x, self.y = _vezes(self.d, G)

    def cose(self) -> dict:
        return {1: 2, 3: -7, -1: 1, -2: self.x.to_bytes(32, "big"), -3: self.y.to_bytes(32, "big")}

    def assinar(self, dados: bytes) -> bytes:
        e = int.from_bytes(hashlib.sha256(dados).digest(), "big")
        while True:
            k = secrets.randbelow(N - 1) + 1
            r = _vezes(k, G)[0] % N
            s = pow(k, -1, N) * (e + r * self.d) % N
            if r and s:
                return _der(r, s)


def _primo(bits: int) -> int:
    while True:
        c = secrets.randbits(bits) | (1 << (bits - 1)) | 1
        if all(c % p for p in (3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37)) and _provavel(c):
            return c


def _provavel(n: int) -> bool:
    d, r = n - 1, 0
    while d % 2 == 0:
        d //= 2
        r += 1
    for _ in range(24):
        x = pow(secrets.randbelow(n - 3) + 2, d, n)
        if x in (1, n - 1):
            continue
        for _ in range(r - 1):
            x = pow(x, 2, n)
            if x == n - 1:
                break
        else:
            return False
    return True


class ChaveRSA:
    """RSA 2048 (como o Windows Hello): gerar leva alguns segundos em Python puro; os testes geram uma só."""

    def __init__(self) -> None:
        self.e = 65537
        while True:
            p, q = _primo(1024), _primo(1024)
            fi = (p - 1) * (q - 1)
            if p != q and fi % self.e and (p * q).bit_length() == 2048:
                break
        self.n, self.d = p * q, pow(self.e, -1, fi)

    def cose(self) -> dict:
        return {1: 3, 3: -257, -1: self.n.to_bytes(256, "big"), -2: self.e.to_bytes(3, "big")}

    def assinar(self, dados: bytes) -> bytes:
        em = b"\x00\x01" + b"\xff" * (256 - 3 - len(_DIGEST_SHA256) - 32) + b"\x00" + _DIGEST_SHA256 + hashlib.sha256(dados).digest()
        return pow(int.from_bytes(em, "big"), self.d, self.n).to_bytes(256, "big")


def cbor(v) -> bytes:
    """CBOR mínimo para montar atestados nos testes."""
    def cab(maior: int, n: int) -> bytes:
        if n < 24:
            return bytes([maior << 5 | n])
        for menor, tam in ((24, 1), (25, 2), (26, 4), (27, 8)):
            if n < 1 << (8 * tam):
                return bytes([maior << 5 | menor]) + n.to_bytes(tam, "big")
        raise ValueError
    if isinstance(v, bool) or v is None:
        return bytes([0xF5 if v is True else 0xF4 if v is False else 0xF6])
    if isinstance(v, int):
        return cab(0, v) if v >= 0 else cab(1, -1 - v)
    if isinstance(v, bytes):
        return cab(2, len(v)) + v
    if isinstance(v, str):
        b = v.encode("utf-8")
        return cab(3, len(b)) + b
    if isinstance(v, list):
        return cab(4, len(v)) + b"".join(cbor(x) for x in v)
    if isinstance(v, dict):
        return cab(5, len(v)) + b"".join(cbor(k) + cbor(x) for k, x in v.items())
    raise TypeError(type(v))
