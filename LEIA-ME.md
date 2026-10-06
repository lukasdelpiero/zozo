# ZoZo

**Versão 2.0.0** · Autor: **Lukas Del Piero Barros** — Controle financeiro pessoal

Aplicativo web com design baseado no Copilot Money.

| Camada | Tecnologia |
|---|---|
| Front-end | HTML, CSS e JavaScript (pasta `ui`) |
| Back-end | Python 3 no **Cloudflare Python Workers** (pasta `api/src`) |
| Dados | **Cloudflare D1** (banco SQL) — só dados cifrados |
| Acesso | **Cloudflare Access** (só os e-mails autorizados chegam ao site) |

## Novidades da versão 2.0.0

- **Back-end em Python 3** (antes: JavaScript no Workers e C# no computador).
- **Versão para computador aposentada** (ZoZo.exe, OneDrive, instalador e macro do Excel). Os arquivos antigos estão em `..\_desktop-aposentado` e podem ser apagados quando quiser.
- **Prova de senha no servidor**: ler, gravar ou apagar dados exige a senha, além do login do Access.
- **Bloqueio** de 1 minuto após 5 senhas erradas (feito no servidor).
- **Histórico** de versões com recuperação automática se o documento estiver danificado.
- **Aviso de retrocesso**: o navegador percebe se o servidor entregar uma versão antiga dos dados.
- **Compressão** antes da criptografia (cabe ~10× mais lançamentos no limite do banco).
- **Senhas vazadas** verificadas também na web (Have I Been Pwned, só 5 caracteres do hash saem).
- **Inatividade**: após 30 minutos sem uso, a senha é pedida de novo.

## Estrutura do projeto

```
ZoZo/
├── ui/                       ← front-end (HTML/CSS/JS)
│   ├── index.html
│   ├── css/                  tokens · base · layout · components · pages · tipografia · print
│   ├── js/
│   │   ├── core/             dom (sem innerHTML) · icons · format (pt-BR) · state
│   │   ├── config/regras.js  regras configuráveis
│   │   ├── data/servico.js   regras de dados (lançamentos, parcelas, recorrências…)
│   │   ├── bridge/           messages.js (contrato) · host-web.js (criptografia + API) · transporte.js
│   │   ├── components/ · pages/ · router.js · app.js
│   └── mock/                 modo demonstração (não é publicado)
└── api/                      ← back-end (Python 3)
    ├── src/entry.py          ponto de entrada no Cloudflare (D1, fetch)
    ├── src/nucleo.py         rotas, validações, versão, prova de senha
    ├── src/acesso.py         validação do token do Cloudflare Access (RS256)
    ├── schema.sql            tabelas do banco D1
    ├── wrangler.toml         configuração do Cloudflare
    ├── montar_interface.py   gera api/public a partir de ui/
    ├── dev/servidor_local.py servidor para testar no seu computador (SQLite)
    └── tests/test_api.py     44 testes automáticos da API
```

## Publicar (uma vez)

1. Crie uma conta gratuita na **Cloudflare**. Instale o **Node.js** (LTS) e o **uv** (https://docs.astral.sh/uv/).
2. No PowerShell, dentro de `api`:
   ```
   npx wrangler login
   npx wrangler d1 create zozo
   ```
   Copie o `database_id` mostrado para o `wrangler.toml`.
3. Crie as tabelas: `npx wrangler d1 execute zozo --remote --file=schema.sql`
4. **Cloudflare Zero Trust → Access → Applications → Add (Self-hosted)** para o seu domínio, com uma política que permita só os e-mails de vocês. Copie o **AUD** e o domínio do time (`SEU-TIME.cloudflareaccess.com`) para o `wrangler.toml`, junto com `ALLOWED_EMAILS`. Enquanto esses campos tiverem os textos de exemplo, a API recusa todos os pedidos.
5. Monte a interface: `python montar_interface.py` (cria `api/public`).
6. Publique: `uv run pywrangler deploy`.
7. Domínio: aponte para o Worker em **Workers → Settings → Domains**.

**Atualizar:** rode `python montar_interface.py` e `uv run pywrangler deploy` de novo. **Toda mudança no `wrangler.toml` (inclusive `ALLOWED_EMAILS`) só vale depois do deploy.** O `schema.sql` pode ser executado de novo sem perder dados.

> Se você chegou a publicar a versão web anterior (API em JavaScript), o formato dos dados mudou: apague e recrie o banco (`npx wrangler d1 delete zozo` e repita os passos 2–3). Como ela ainda tinha os campos de exemplo no `wrangler.toml`, provavelmente nunca foi publicada.

## Testar no seu computador

- **Testes automáticos da API:** `python -m unittest discover -s api/tests -v`
- **Aplicativo completo com a API Python:** `python api/dev/servidor_local.py` e abra http://127.0.0.1:8787 (usuário fixo `dev@zozo.local`; banco em `api/dev/zozo-local.db`, que pode ser apagado).
- **Só a interface (demonstração):** abra `ui/index.html` ou http://127.0.0.1:8787/?mock=1 — conta **demo@zozo.app / zozo1234**, dados só no navegador e sem criptografia.

## Segurança

| Item | Como está |
|---|---|
| Portão | Cloudflare Access na frente do site; a API valida de novo o token (assinatura RS256, validade, emissor, audiência) e a lista `ALLOWED_EMAILS`. Configuração incompleta = tudo negado |
| Senha | Nunca sai do navegador. PBKDF2-SHA256 com 600.000 iterações (OWASP) e sal aleatório → HKDF → chave dos dados + prova da senha. O navegador recusa parâmetros mais fracos vindos do servidor |
| Prova da senha | Enviada em cada acesso aos dados; o servidor guarda só o SHA-256. Sessão do Access roubada não lê, altera nem apaga nada |
| Login | Bloqueio de 1 minuto após 5 erros (no servidor, contado de forma atômica: pedidos em paralelo não escapam do limite); e-mail digitado precisa ser o do Access; senhas vazadas recusadas no cadastro e na troca. E-mail fora de `ALLOWED_EMAILS` → aviso na tela de login (não recarrega a página) |
| Dados | JSON → gzip → AES-256-GCM no navegador. E-mail e número da versão entram como dados autenticados: bloco adulterado, trocado entre contas ou de outra versão é recusado |
| Integridade | Gravação com versão (outro dispositivo gravou antes → recusa e recarrega, nada é sobrescrito); documento danificado → recuperado do histórico com aviso; versão mais antiga que a já vista neste navegador → aviso |
| Operações atômicas | Troca de senha e "apagar dados" acontecem numa única transação: ou tudo muda, ou nada muda (nunca fica documento cifrado com uma senha e conta com outra) |
| Histórico | Até 10 versões, no máximo uma a cada 10 minutos; descartado na troca de senha e ao apagar dados |
| CSRF | Escritas só da própria origem (`Origin` / `Sec-Fetch-Site`) e só com `Content-Type: application/json` |
| Interface | Sem `innerHTML`; CSP sem scripts/estilos inline, sem acesso a outros sites e sem ser exibida em outros sites (`frame-ancestors`, `X-Frame-Options`); HSTS |
| PDF (boleto) | Impressão do navegador ("Salvar como PDF"); só o boleto é impresso (Ctrl+P fora dele sai em branco); nome do arquivo sem caracteres inválidos |
| CSV | Gerado no navegador; valores que começam com `= + - @`, tab ou CR são neutralizados (evita fórmulas maliciosas no Excel) |
| Arquivos exportados | **PDF e CSV não são cifrados**: guarde-os em local seguro |
| Sessão | Chave só na memória; recarregar a página ou 30 min sem uso pedem a senha de novo; fechar a aba com gravação pendente pede confirmação |
| Erros | Usuário vê só mensagens amigáveis; o servidor nunca devolve detalhes técnicos |

**Senha esquecida = dados irrecuperáveis.** Nem o servidor consegue ler os dados. Guarde a senha num gerenciador de senhas.

## Limites

- Cada conta guarda um documento de até ~1,9 MB **já comprimido e cifrado** (limite de linha do D1). Isso corresponde a dezenas de milhares de lançamentos; a foto do perfil ocupa ~100–300 KB. Ao chegar no limite, a gravação é recusada com aviso e nada é perdido.

## Funcionalidades

- **Dashboard:** foto, saudação, Gasto mensal (curva do mês × orçamento), Patrimônio, Top categorias, Próximos lançamentos, Lançamentos recentes.
- **Lançamentos:** agrupados por mês e dia, ícones R (recorrente) e P (parcelado), tags de categoria e perfil, pesquisa, filtros, seleção com ações em lote; painel com histórico e edição.
- **Parcelas automáticas**, **Recorrências** (semanal a anual ou parcelada), **Dividir lançamento** entre perfis.
- **Contas e Investimentos**, **Categorias** (com orçamento fixo ou por mês), **Perfis** (com boleto por perfil).
- **Configurações:** orçamento, armazenamento e última gravação; foto, nome, alterar senha, exportar CSV, apagar dados, sair, excluir conta.

## Regras configuráveis (`ui/js/config/regras.js`)

`categorias.sinalGastoPorTipo` · `totais` · `recorrencias.pagoSomenteComLancamento` · `boleto.*` · `tiposInvestimento` · `categoriasSugeridas` · `modelosCategoria` · `paleta`.
