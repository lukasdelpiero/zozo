-- =============================================================
-- ZoZo 3.0 — Argon2id na derivação da senha (no navegador)
-- kdf = 'pbkdf2'     → PBKDF2-SHA256 com "iteracoes" (contas existentes, até trocarem a senha)
-- kdf = 'argon2id-1' → Argon2id m=64 MiB, t=3, p=1 (contas novas e senhas trocadas)
-- Para Argon2id a coluna "iteracoes" (CHECK >= 600000 da 0001) guarda só o mínimo, sem uso.
-- O servidor continua guardando apenas o SHA-256 da prova; nada muda para os dados cifrados já gravados.
-- =============================================================
ALTER TABLE contas ADD COLUMN kdf TEXT NOT NULL DEFAULT 'pbkdf2';
