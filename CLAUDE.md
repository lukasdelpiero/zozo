# ZoZo — instruções para o Claude Code

Aplicativo de finanças pessoais: trate toda mudança como sensível a segurança.
O padrão obrigatório está em @docs/SEGURANCA.md — leia antes de mexer em login, sessão, API, banco, criptografia, exportação ou configuração do Cloudflare.

## Regras que mais se aplicam a este código

- **Criptografia de ponta a ponta**: o servidor só vê documentos cifrados (AES-256-GCM no navegador). Nunca envie dados legíveis nem a senha à API. Não mude as derivações em `ui/js/bridge/host-web.js` (`zozo/dados/v2`, `zozo/prova/v2`, AAD) sem uma migração: documentos já gravados deixariam de abrir.
- **Identidade vem da sessão** (cookie HttpOnly), nunca do corpo do pedido. Rotas de dados exigem sessão **e** a prova da senha (`X-ZoZo-Prova`).
- **Banco**: só comandos parametrizados. Mudança de tabela = novo arquivo em `api/migracoes/NNNN_nome.sql` (nunca edite uma migração já aplicada).
- **Segredos** (`SEGREDO`, `TURNSTILE_SECRET`, `RESEND_API_KEY`) só por `npx wrangler secret put`; nunca no `wrangler.toml`, no código ou em logs.
- **Interface**: sem `innerHTML`/`eval`; todo DOM via `ZoZo.dom` (`h`, `s`). CSP sem scripts/estilos inline.
- **Logs**: só eventos (`ctx.evento`), sem e-mail, IP, senha, prova, cookie ou código 2FA em texto.
- **Testes**: todo controle de segurança novo precisa de teste negativo em `api/tests/test_api.py`.

## Comandos

- Testes da API: `cd api; uv run python -m unittest discover -s tests -v` (inclui o app FastAPI; com `python` puro os testes do FastAPI são pulados)
- Testes do serviço de dados (navegador): `npm test` · Tipos: `npm run typecheck`
- Interface com recarga instantânea: `npm run dev` → http://127.0.0.1:5173 (demonstração: `/?mock=1`)
- API local + interface montada: `npm run build` e `python api/dev/servidor_local.py` → http://127.0.0.1:8787
- Interface: Vite + TypeScript + Tailwind CSS (prefixo `tw:`, sem preflight; CSS antigo na camada `legado`). Migre uma tela por vez; módulo convertido = `.ts` + tipo em `ui/src/globais.d.ts`. Já migrados: Configurações › Sobre, o login (`components/auth.js`) Transações (`pages/lancamentos.js` + `LaunchRow`) Categorias (`pages/categorias.js` + `CategoryRow`/`CategoryGroupRow`), Contas (`pages/contas.js` + `AccountRow`) e Dashboard (`pages/dashboard.js`). Orçamento desligado: variante `tw:sem-orcamento`. Colunas por largura da área: variantes `tw:area620/460/420/340` (container queries). Classes `tw:` sempre escritas por inteiro (nada de montar o nome); ao migrar, confira o resultado comparando estilos calculados antes/depois.
- Busca: local, em `ui/js/core/busca.ts` (os dados são cifrados de ponta a ponta — nunca use um servidor de busca como Meilisearch/Algolia, que exigiria os dados legíveis fora do navegador).
- E-mail no servidor local: `ZOZO_DEV_EMAIL=console` (mostra os e-mails no terminal) e `ZOZO_DEV_BANCO=<arquivo>` (banco descartável).
- Back-end: transição para FastAPI + Pydantic em `api/src/app_fastapi.py` (desligado no Cloudflare; o núcleo continua dono das regras).
- Publicar na **prévia** (testes): `.\api\publicar.ps1 previa`
- Publicar em **produção**: `.\api\publicar.ps1 producao` (só depois de testar na prévia)
