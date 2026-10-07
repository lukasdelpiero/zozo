# ZoZo — instruções para o Claude Code

Aplicativo de finanças pessoais: trate toda mudança como sensível a segurança.
O padrão obrigatório está em @docs/SEGURANCA.md — leia antes de mexer em login, sessão, API, banco, criptografia, exportação ou configuração do Cloudflare.

## Regras que mais se aplicam a este código

- **Criptografia de ponta a ponta**: o servidor só vê documentos cifrados (AES-256-GCM no navegador). Nunca envie dados legíveis nem a senha à API. Não mude as derivações em `ui/js/bridge/host-web.js` (`zozo/dados/v2`, `zozo/prova/v2`, AAD) sem uma migração: documentos já gravados deixariam de abrir.
- **Identidade vem da sessão** (cookie HttpOnly), nunca do corpo do pedido. Rotas de dados exigem sessão **e** a prova da senha (`X-ZoZo-Prova`).
- **Banco**: só comandos parametrizados. Mudança de tabela = novo arquivo em `api/migracoes/NNNN_nome.sql` (nunca edite uma migração já aplicada).
- **Segredos** (`SEGREDO`, `TURNSTILE_SECRET`) só por `npx wrangler secret put`; nunca no `wrangler.toml`, no código ou em logs.
- **Interface**: sem `innerHTML`/`eval`; todo DOM via `ZoZo.dom` (`h`, `s`). CSP sem scripts/estilos inline.
- **Logs**: só eventos (`ctx.evento`), sem e-mail, IP, senha, prova, cookie ou código 2FA em texto.
- **Testes**: todo controle de segurança novo precisa de teste negativo em `api/tests/test_api.py`.

## Comandos

- Testes da API: `python -m unittest discover -s api/tests -v`
- Servidor local: `python api/dev/servidor_local.py` → http://127.0.0.1:8787 (demonstração: `/?mock=1`)
- Publicar na **prévia** (testes): `.\api\publicar.ps1 previa`
- Publicar em **produção**: `.\api\publicar.ps1 producao` (só depois de testar na prévia)
