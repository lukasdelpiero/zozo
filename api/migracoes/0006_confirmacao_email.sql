-- =============================================================
-- ZoZo 3.0 — confirmação de e-mail (Resend)
-- Com o e-mail ligado (RESEND_API_KEY + EMAIL_REMETENTE + URL_PUBLICA), o cadastro cria a
-- conta PENDENTE: ela só entra depois de confirmar o link enviado. Contas existentes não mudam.
-- tokens_email guarda só o SHA-256 do token (o token em si só existe no e-mail), com prazo,
-- uso único e o verificador da senha da época (o link confirma só a senha que pediu o cadastro).
-- =============================================================
ALTER TABLE contas ADD COLUMN confirmacao_pendente INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS tokens_email (
  hash        TEXT PRIMARY KEY CHECK (length(hash) = 64),
  email       TEXT NOT NULL REFERENCES contas(email) ON DELETE CASCADE,
  finalidade  TEXT NOT NULL CHECK (finalidade IN ('confirmar')),
  verificador TEXT NOT NULL,
  expira      INTEGER NOT NULL,
  usado       INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_tokens_email ON tokens_email(email, finalidade);
