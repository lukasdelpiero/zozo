-- =============================================================
-- ZoZo 2.4 — o "envelope" da sessão deixa de ficar no banco
-- Agora ele é calculado a cada pedido: HMAC(SEGREDO, cookie da sessão).
-- Os envelopes antigos (gravados em texto) são apagados; quem estava logado
-- digita a senha uma vez (a chave guardada no navegador era protegida por eles).
-- A coluna continua existindo (vazia) para não precisar recriar a tabela.
-- =============================================================
UPDATE sessoes SET envelope = '';
