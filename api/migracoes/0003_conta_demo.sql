-- =============================================================
-- ZoZo 2.3 — conta de demonstração pública
--   login: demo@usezozo.com.br · senha: zozo1234 (divulgada de propósito)
-- O sal e o verificador abaixo são o que o navegador produziria no cadastro
-- (PBKDF2 600.000 + HKDF "zozo/prova/v2" → SHA-256 da prova). Não são segredos:
-- a senha é pública. A API trata esta conta como SOMENTE LEITURA (nucleo.py,
-- DEMO_EMAIL): não grava documento nem troca senha, nome, 2FA ou exclusão.
-- Os dados que o visitante vê são gerados no navegador a cada acesso.
-- =============================================================
INSERT INTO contas (email, nome, sal, iteracoes, verificador)
VALUES ('demo@usezozo.com.br', 'Demo', 'ZHjCsaSgnmMlcOckVFGREw==', 600000,
        '277fb0038efb42f5e78caaa2ba5433e011b64eb65dc42989bfa4df7a0b0d9e47')
ON CONFLICT(email) DO UPDATE SET
  nome = excluded.nome, sal = excluded.sal, iteracoes = excluded.iteracoes, verificador = excluded.verificador,
  totp_segredo = NULL, totp_pendente = NULL, totp_ultimo_passo = 0;

-- Nada gravado antes para este e-mail continua valendo
DELETE FROM historico WHERE email = 'demo@usezozo.com.br';
DELETE FROM documentos WHERE email = 'demo@usezozo.com.br';
DELETE FROM sessoes WHERE email = 'demo@usezozo.com.br';
