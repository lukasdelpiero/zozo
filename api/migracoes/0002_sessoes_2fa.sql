-- =============================================================
-- ZoZo 2.1 — login próprio (sem Cloudflare Access), sessões, 2FA e
-- bloqueio progressivo. Aplicada UMA vez pelo controle de migrações do
-- D1 (wrangler d1 migrations apply). Contas e documentos existentes
-- continuam valendo: a senha e a criptografia não mudam.
-- =============================================================

-- 2FA (TOTP). O segredo fica cifrado com o SEGREDO do servidor (nunca em texto puro)
ALTER TABLE contas ADD COLUMN totp_segredo TEXT;                          -- 2FA ativo
ALTER TABLE contas ADD COLUMN totp_pendente TEXT;                         -- ativação em andamento
ALTER TABLE contas ADD COLUMN totp_ultimo_passo INTEGER NOT NULL DEFAULT 0;  -- impede reutilizar um código

-- Sessões: o navegador guarda só um identificador aleatório num cookie HttpOnly;
-- aqui fica o SHA-256 dele (vazamento do banco não entrega sessões válidas)
CREATE TABLE IF NOT EXISTS sessoes (
  id          TEXT PRIMARY KEY,                                   -- SHA-256 (hex) do identificador do cookie
  email       TEXT NOT NULL REFERENCES contas(email) ON DELETE CASCADE,
  estado      TEXT NOT NULL CHECK (estado IN ('ativa', '2fa')),   -- '2fa': senha certa, falta o código
  envelope    TEXT NOT NULL,                                      -- chave que protege a chave dos dados guardada no navegador
  criada      INTEGER NOT NULL,                                   -- segundos desde 1970 (UTC)
  ultimo_uso  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessoes_email ON sessoes(email);

-- Contadores de abuso (login por e-mail+IP, por conta, 2FA, cadastro e consultas por IP).
-- Chaves usam HMAC do e-mail/IP: o banco não guarda IPs em texto
CREATE TABLE IF NOT EXISTS limites (
  chave          TEXT PRIMARY KEY,
  falhas         INTEGER NOT NULL,
  ultima         INTEGER NOT NULL,
  bloqueado_ate  INTEGER NOT NULL DEFAULT 0
);

-- Substituída por "limites"
DROP TABLE IF EXISTS tentativas;
