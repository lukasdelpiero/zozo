-- =============================================================
-- ZoZo — biometria e chaves de acesso (WebAuthn / passkeys)
-- chaves_acesso: a chave PÚBLICA de cada credencial (JWK), o contador de assinaturas (detecta cópia
-- clonada) e se o autenticador aceitou a extensão PRF (base para entrar sem senha no futuro).
-- desafios_webauthn: só o SHA-256 do desafio, preso à conta e à finalidade, 5 minutos, uso único.
-- =============================================================
CREATE TABLE IF NOT EXISTS chaves_acesso (
  id        TEXT PRIMARY KEY CHECK (length(id) BETWEEN 16 AND 1400),   -- id da credencial (base64url)
  email     TEXT NOT NULL REFERENCES contas(email) ON DELETE CASCADE,
  chave     TEXT NOT NULL,                                              -- chave pública (JWK)
  alg       INTEGER NOT NULL CHECK (alg IN (-7, -257)),                 -- ES256 ou RS256
  contador  INTEGER NOT NULL DEFAULT 0,
  nome      TEXT NOT NULL,
  prf       INTEGER NOT NULL DEFAULT 0,
  criado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  usado_em  TEXT
);
CREATE INDEX IF NOT EXISTS idx_chaves_acesso_email ON chaves_acesso(email);

CREATE TABLE IF NOT EXISTS desafios_webauthn (
  hash       TEXT PRIMARY KEY CHECK (length(hash) = 64),
  email      TEXT NOT NULL REFERENCES contas(email) ON DELETE CASCADE,
  finalidade TEXT NOT NULL CHECK (finalidade IN ('registro', 'confirmacao')),
  expira     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_desafios_webauthn_email ON desafios_webauthn(email);
