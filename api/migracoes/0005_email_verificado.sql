-- =============================================================
-- ZoZo 2.5 — e-mail confirmado
-- Recursos liberados por e-mail (RECURSOS_AVANCADOS: Perfis, fatura, Pix) passam a
-- exigir que a conta tenha o e-mail CONFIRMADO — hoje, pelo "Continuar com Google".
-- As contas que já existem são marcadas como confirmadas: foram criadas pelos donos
-- (até 07/10/2026 o cadastro era restrito à lista de e-mails autorizados). Contas novas
-- começam sem confirmação e a ganham ao entrar (ou se cadastrar) pelo Google.
-- =============================================================
ALTER TABLE contas ADD COLUMN email_verificado INTEGER NOT NULL DEFAULT 0;
UPDATE contas SET email_verificado = 1;
