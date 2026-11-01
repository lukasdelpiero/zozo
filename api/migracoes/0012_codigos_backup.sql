-- =============================================================
-- ZoZo — códigos de backup do 2FA
-- Dez códigos de uso único, gerados no servidor quando o 2FA é ligado (ou quando a pessoa pede novos).
-- Servem no lugar do código do aplicativo autenticador (perdeu o celular): login, recuperação de senha,
-- ações que pedem o código atual e desligar o 2FA. Só o HMAC de cada código é guardado (chave derivada
-- do SEGREDO do servidor + e-mail): o banco sozinho não revela nenhum código. Usou, a linha é apagada.
-- =============================================================
CREATE TABLE IF NOT EXISTS codigos_backup (
  email     TEXT NOT NULL REFERENCES contas(email) ON DELETE CASCADE,
  hash      TEXT NOT NULL CHECK (length(hash) = 64),
  criado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (email, hash)
);
