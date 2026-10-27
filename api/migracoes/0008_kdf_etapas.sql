-- =============================================================
-- ZoZo 3.14 — migração PBKDF2 → Argon2id em etapas
-- Conta antiga com histórico grande demais para um pedido só: o navegador envia cada cópia do
-- histórico já recifrada com a chave nova (uma por pedido) e depois fecha a migração numa
-- transação (PUT /api/conta/kdf), que troca documento, chave e histórico de uma vez.
-- Até o fechamento nada aqui é lido pela conta: a chave e o histórico em uso continuam os antigos.
-- "sal" é o sal novo da tentativa: outra tentativa (outro sal) descarta as etapas anteriores.
-- Só dados cifrados; no máximo uma linha por versão do histórico (10 por conta).
-- =============================================================
CREATE TABLE IF NOT EXISTS kdf_etapas (
  email     TEXT NOT NULL REFERENCES contas(email) ON DELETE CASCADE,
  sal       TEXT NOT NULL,
  versao    INTEGER NOT NULL,
  conteudo  TEXT NOT NULL,
  criado_em TEXT,                                    -- data original da cópia, copiada no fechamento
  enviado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (email, versao)
);
