-- =============================================================
-- ZoZo (web) — banco SQL (Cloudflare D1 / SQLite)
-- O servidor guarda SÓ dados cifrados no navegador: sem senha e sem
-- lançamentos legíveis. Pode ser executado de novo sem perder dados.
-- =============================================================
CREATE TABLE IF NOT EXISTS contas (
  email        TEXT PRIMARY KEY,                -- identidade validada pelo Cloudflare Access
  nome         TEXT NOT NULL DEFAULT '',
  sal          TEXT NOT NULL,                   -- sal do PBKDF2 (público por definição)
  iteracoes    INTEGER NOT NULL CHECK (iteracoes >= 600000),
  verificador  TEXT NOT NULL CHECK (length(verificador) = 64),   -- SHA-256 da prova derivada da senha
  criado_em    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS documentos (
  email         TEXT PRIMARY KEY REFERENCES contas(email) ON DELETE CASCADE,
  versao        INTEGER NOT NULL CHECK (versao >= 1),   -- controle de concorrência (sobe a cada gravação)
  conteudo      TEXT NOT NULL,                          -- base64(formato ‖ IV ‖ AES-256-GCM(gzip(JSON)))
  atualizado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Histórico (backups): até 10 versões anteriores, no máximo uma a cada 10 minutos
CREATE TABLE IF NOT EXISTS historico (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  email     TEXT NOT NULL REFERENCES contas(email) ON DELETE CASCADE,
  versao    INTEGER NOT NULL,
  conteudo  TEXT NOT NULL,
  criado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_historico_email ON historico(email, versao DESC);

-- Bloqueio de 1 minuto após 5 provas de senha erradas
CREATE TABLE IF NOT EXISTS tentativas (
  email   TEXT PRIMARY KEY,
  falhas  INTEGER NOT NULL,
  ultima  INTEGER NOT NULL                             -- segundos desde 1970 (UTC)
);

-- Trava das operações de várias etapas: só aceita ok = 1. A API insere aqui o
-- número de linhas alteradas pelo comando anterior; se não for 1, o lote
-- inteiro (troca de senha, apagar dados) é desfeito. Fica sempre vazia.
CREATE TABLE IF NOT EXISTS guarda (
  ok INTEGER NOT NULL CHECK (ok = 1)
);

-- Guarda a versão anterior antes de uma atualização (se a última cópia tem mais de
-- 10 minutos) e mantém só as 10 mais recentes
DROP TRIGGER IF EXISTS trg_documento_historico;
CREATE TRIGGER trg_documento_historico
BEFORE UPDATE OF conteudo ON documentos
WHEN NOT EXISTS (
  SELECT 1 FROM historico
  WHERE email = OLD.email AND criado_em > strftime('%Y-%m-%dT%H:%M:%fZ','now','-10 minutes')
)
BEGIN
  INSERT INTO historico (email, versao, conteudo) VALUES (OLD.email, OLD.versao, OLD.conteudo);
  DELETE FROM historico WHERE email = OLD.email AND id NOT IN
    (SELECT id FROM historico WHERE email = OLD.email ORDER BY versao DESC, id DESC LIMIT 10);
END;
