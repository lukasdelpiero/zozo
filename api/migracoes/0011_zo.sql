-- =============================================================
-- ZoZo — Zo, o assistente
-- Consentimento da pessoa para o Zo ler e alterar os dados dela (com trechos enviados à OpenAI só para
-- responder). Vazio = sem consentimento: POST /api/zo é recusado. Guarda a data do aceite (texto ISO).
-- =============================================================
ALTER TABLE contas ADD COLUMN zo_consentimento TEXT NOT NULL DEFAULT '';
