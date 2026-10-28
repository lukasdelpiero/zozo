-- =============================================================
-- ZoZo 3.18 — recuperação de senha: autorização presa a quem passou pelo 2FA
-- Antes, conferir o link (e o código do 2FA) só marcava aberto = 1 no próprio link: qualquer outra pessoa com o
-- mesmo link podia concluir a troca depois. Agora o "abrir" entrega um passe aleatório novo, só para quem abriu;
-- etapas e conclusão exigem o link E o passe. Guardado só o SHA-256 dele; cada "abrir" troca o passe; vale até o
-- link vencer e morre com ele (uso único). Links abertos antes desta migração (sem passe) precisam ser abertos de novo.
-- =============================================================
ALTER TABLE tokens_recuperacao ADD COLUMN passe TEXT;
