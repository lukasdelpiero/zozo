-- =============================================================
-- ZoZo 3.15 — recuperação de senha pelo e-mail
-- Padrão: o navegador guarda no servidor uma CÓPIA da chave dos dados, cifrada (no próprio navegador)
-- com uma chave de custódia que só o servidor sabe calcular (HMAC do SEGREDO + e-mail + nonce).
-- Quem esquece a senha abre o link do e-mail (e o código do 2FA, se tiver): o servidor devolve a chave
-- de custódia, o navegador abre a cópia, recifra os dados com a senha nova e tudo é trocado numa transação.
-- Proteção avançada (opcional, por conta): sem cópia; esqueceu a senha = a conta recomeça vazia.
-- A cópia vale só para a senha da época (verificador): trocou a senha, ela é apagada e refeita no login.
-- =============================================================
ALTER TABLE contas ADD COLUMN protecao_avancada INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS custodia (
  email       TEXT PRIMARY KEY REFERENCES contas(email) ON DELETE CASCADE,
  nonce       TEXT NOT NULL,                   -- base64 de 16 bytes (entra na chave de custódia)
  chave       TEXT NOT NULL,                   -- base64(IV ‖ AES-256-GCM(chave dos dados)), cifrada no navegador
  verificador TEXT NOT NULL,                   -- senha da época
  criado_em   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Links de "Esqueci minha senha": só o SHA-256 do token, 1 hora, uso único, presos à senha da época.
-- aberto = 1 depois que o link (e o código do 2FA, se a conta tiver) foi conferido.
CREATE TABLE IF NOT EXISTS tokens_recuperacao (
  hash        TEXT PRIMARY KEY CHECK (length(hash) = 64),
  email       TEXT NOT NULL REFERENCES contas(email) ON DELETE CASCADE,
  verificador TEXT NOT NULL,
  expira      INTEGER NOT NULL,
  aberto      INTEGER NOT NULL DEFAULT 0,
  usado       INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_tokens_recuperacao ON tokens_recuperacao(email);
