# ZoZo

**Versão 2.2.0** · Autor: **Lukas Del Piero Barros** — Controle financeiro pessoal

Aplicativo web com design baseado no Copilot Money.

| Camada | Tecnologia |
|---|---|
| Front-end | HTML, CSS e JavaScript (pasta `ui`) |
| Back-end | Python 3 no **Cloudflare Python Workers** (pasta `api/src`) |
| Dados | **Cloudflare D1** (banco SQL) — só dados cifrados |
| Acesso | **Login próprio do ZoZo** (e-mail + senha + 2FA opcional). O Cloudflare Access protege só o **ambiente de prévia** |

Padrão de segurança obrigatório para qualquer mudança: [docs/SEGURANCA.md](docs/SEGURANCA.md) (o Claude Code lê automaticamente via [CLAUDE.md](CLAUDE.md)).

## Novidades da versão 2.2.0

- **Nova tela de login:** "Continuar com e-mail", "Continuar com Google" e "Inscreva-se". O Google confirma o e-mail; a senha do ZoZo continua sendo a chave dos dados (como ligar: [docs/AMBIENTE-DE-TESTES.md](docs/AMBIENTE-DE-TESTES.md)).
- **Pix no boleto:** QR code válido pelo padrão do Banco Central (BR Code), com o valor do boleto e um identificador novo a cada geração. A chave fica cifrada em Configurações › Geral › Pix.
- **Senha:** oculta por padrão, com "mostrar", e **sem copiar/recortar**; campos prontos para o preenchimento automático de navegadores e gerenciadores de senha.
- **Saudação** "Bom dia/Boa tarde/Boa noite, Nome!"; foto e nome no rodapé do menu, com o botão de Configurações ao lado.
- **Mais leve:** na publicação, os ~50 arquivos viram 1 script + 1 folha de estilo com cache longo (56 → 11 requisições).
- **Publicar pelo VS Code:** Terminal › Executar Tarefa… › "ZoZo: publicar na prévia" / "ZoZo: publicar em produção".
- Telas de 375 px a 1920 px verificadas; boleto, perfis e gráficos corrigidos em telas pequenas.

## Novidades da versão 2.1.0

- **Sem login da Cloudflare para os usuários:** o ZoZo tem login próprio. Sessão no servidor com cookie `HttpOnly` + `Secure` + `SameSite=Strict`, que **dura até o navegador ser fechado** (sem logout por inatividade).
- **Autenticação de dois fatores (2FA)** por aplicativo autenticador (Google/Microsoft Authenticator, Authy…): Configurações › Conta › Ativar 2FA.
- **Bloqueio progressivo** por e-mail + IP: 3 tentativas livres → CAPTCHA (Cloudflare Turnstile) da 4ª em diante → 15 min de bloqueio na 5ª falha → 24 h na 10ª. Outra rede (outro IP) continua entrando; o login certo zera tudo.
- **Ambiente de prévia** com banco separado, para testar antes de publicar para os usuários.
- **Nomes com até 50 caracteres** (lançamentos, contas, categorias e perfis); nomes longos aparecem cortados com "…".
- **Dashboard e listas em telas reduzidas** corrigidas (o layout agora depende do espaço disponível, não só da largura da janela).

## Estrutura do projeto

```
ZoZo/
├── CLAUDE.md                 ← instruções para o Claude Code (inclui docs/SEGURANCA.md)
├── docs/SEGURANCA.md         ← padrão de segurança
├── docs/AMBIENTE-DE-TESTES.md ← configurar, publicar e acessar a prévia (passo a passo)
├── ui/                       ← front-end (HTML/CSS/JS)
│   ├── index.html
│   ├── css/                  tokens · base · layout · components · pages · tipografia · print
│   ├── js/
│   │   ├── core/             dom (sem innerHTML) · icons · format (pt-BR) · state
│   │   ├── config/regras.js  regras configuráveis (inclui limiteNome = 50)
│   │   ├── data/servico.js   regras de dados (lançamentos, parcelas, recorrências…)
│   │   ├── data/pix.js       Pix copia e cola / QR (BR Code do BACEN)
│   │   ├── bridge/           messages.js (contrato) · host-web.js (criptografia + API) · transporte.js
│   │   ├── components/       … · verificacao.js (CAPTCHA, código de 6 dígitos, QR code)
│   │   ├── vendor/           qrcode-generator.js (MIT, versão e integridade no cabeçalho)
│   │   ├── pages/ · router.js · app.js
│   └── mock/                 modo demonstração (não é publicado)
└── api/                      ← back-end (Python 3)
    ├── src/entry.py          ponto de entrada no Cloudflare (D1, fetch, cookies)
    ├── src/nucleo.py         rotas, sessões, bloqueio progressivo, prova de senha
    ├── src/totp.py           2FA (TOTP RFC 6238) e cifra do segredo do 2FA
    ├── src/google.py         "Continuar com Google" (OpenID Connect + PKCE)
    ├── src/acesso.py         Cloudflare Access (só no ambiente de prévia)
    ├── migracoes/            tabelas do banco (aplicadas em ordem, uma vez)
    ├── wrangler.toml         produção + prévia
    ├── publicar.ps1          testes → interface → migrações → publicação
    ├── montar_interface.py   gera api/public a partir de ui/
    ├── dev/servidor_local.py servidor para testar no seu computador (SQLite)
    └── tests/test_api.py     59 testes automáticos da API
```

## Ambientes e publicação

| Ambiente | Endereço | Banco | Quem acessa |
|---|---|---|---|
| **Local** | http://127.0.0.1:8787 | `api/dev/zozo-local.db` | só o seu computador |
| **Prévia** | https://zozo-previa.zozo-finance-app.workers.dev | `zozo-previa` | Cloudflare Access: só **testenviroment@usezozo.com.br**; conta do ZoZo: **insight@usezozo.com.br** |
| **Produção** | https://zozo.zozo-finance-app.workers.dev | `zozo` | usuários (cadastro só para os e-mails de `ALLOWED_EMAILS`) |

Fluxo recomendado: **mudar → testar no local → publicar na prévia → testar → publicar em produção**.

```powershell
.\api\publicar.ps1 previa      # usuários não veem
.\api\publicar.ps1 producao    # pede confirmação
```

O script roda os testes, monta a interface, aplica as migrações do banco e publica; qualquer falha interrompe.

**Segredos** (uma vez por ambiente; nunca no `wrangler.toml`): `npx wrangler secret put SEGREDO` e `npx wrangler secret put TURNSTILE_SECRET` (acrescente `--env previa` para a prévia). O `SEGREDO` é uma sequência aleatória longa (gere com `python -c "import secrets; print(secrets.token_urlsafe(48))"`). **Não troque o `SEGREDO` sem necessidade** (só se ele vazar): o segredo do 2FA de cada usuário está cifrado com ele, e quem tem 2FA ativo ficaria sem conseguir entrar. Se precisar trocar, desative antes o 2FA de todos (`npx wrangler d1 execute zozo --remote --command "UPDATE contas SET totp_segredo = NULL, totp_pendente = NULL"`), troque o segredo e peça para reativarem. As sessões e os dados não dependem dele.

**Quem pode criar conta:** `ALLOWED_EMAILS` no `wrangler.toml` (lista separada por vírgula, ou `"*"` para cadastro aberto). Mudanças no `wrangler.toml` só valem depois de publicar.

**Backup:** o D1 guarda 30 dias de histórico (*Time Travel*): `npx wrangler d1 time-travel restore zozo --timestamp=<data>` volta o banco a um momento anterior.

## Testar no seu computador

- **Testes automáticos da API:** `python -m unittest discover -s api/tests -v`
- **Aplicativo completo com a API Python:** `python api/dev/servidor_local.py` e abra http://127.0.0.1:8787 (cadastre uma conta; o CAPTCHA usa as chaves de teste da Cloudflare, que sempre aprovam).
- **Modo demonstração (só interface, dados no navegador):** http://127.0.0.1:8787/?mock=1 ou abra `ui/index.html`. A conta é definida por você:
  1. No VS Code, em `ui/mock/`, copie `credenciais.exemplo.js` para **`credenciais.local.js`** (botão direito › Copiar / Colar e renomeie).
  2. Troque `TROQUE-ESTA-SENHA` pela sua senha (mínimo de 8 caracteres) e salve.
  3. Entre com **insight@usezozo.com.br** e essa senha.

  O `credenciais.local.js` está no `.gitignore` (não vai para o GitHub) e a pasta `mock` nunca é publicada.

## Segurança

| Item | Como está |
|---|---|
| Login | E-mail + prova da senha. Mensagem única para e-mail inexistente e senha errada; e-mail sem conta recebe parâmetros simulados (não revela quem tem conta) |
| Senha | Nunca sai do navegador. PBKDF2-SHA256 com 600.000 iterações e sal aleatório → HKDF → chave dos dados + prova da senha. O servidor guarda só o SHA-256 da prova. O navegador recusa parâmetros mais fracos vindos do servidor |
| Sessão | Identificador aleatório de 256 bits em cookie `__Host-` `HttpOnly` `Secure` `SameSite=Strict`, sem data de validade (termina ao fechar o navegador); o banco guarda só o SHA-256 dele; novo identificador a cada login e após o 2FA; encerra no "Sair", na troca de senha (outros dispositivos), após 7 dias sem uso ou 30 dias de idade |
| Chave dos dados | Para não pedir a senha a cada recarga, fica no navegador **cifrada com o "envelope" da sessão**, que só o servidor entrega enquanto o cookie existir. Saiu ou fechou o navegador: vira lixo ilegível e é apagada |
| 2FA | TOTP (RFC 6238), ±30 s de tolerância, um código não vale duas vezes; segredo cifrado no banco com o `SEGREDO` do servidor; 5 códigos errados → 15 min de bloqueio |
| Força bruta | Bloqueio progressivo por e-mail + IP (CAPTCHA na 4ª, 15 min na 5ª falha, 24 h na 10ª), contagem atômica (pedidos em paralelo não escapam); 20 falhas/h na mesma conta vindas de IPs diferentes → CAPTCHA para todos; cadastro e consultas também limitados por IP |
| Dados | JSON → gzip → AES-256-GCM no navegador. E-mail e número da versão entram como dados autenticados: bloco adulterado, trocado entre contas ou de outra versão é recusado |
| Prova da senha | Exigida, além da sessão, em toda leitura/gravação dos dados: um cookie roubado sozinho não lê nem altera nada |
| Integridade | Gravação com versão (outro dispositivo gravou antes → recusa e recarrega); documento danificado → recuperado do histórico com aviso; versão mais antiga que a já vista neste navegador → aviso |
| Operações atômicas | Troca de senha e "apagar dados" numa única transação: ou tudo muda, ou nada muda |
| CSRF | Cookie `SameSite=Strict` + escritas só da própria origem (`Origin` / `Sec-Fetch-Site`) + só `Content-Type: application/json` |
| Interface | Sem `innerHTML`/`eval`; CSP sem scripts/estilos inline (só `challenges.cloudflare.com` liberado, para o CAPTCHA); não pode ser exibida em outros sites; HSTS |
| Logs | Eventos de segurança (login, falhas, bloqueios, 2FA, senha, exclusão) com identificadores HMAC — sem e-mail, IP, senha, cookie ou código em texto; cada resposta tem `X-Request-Id` |
| PDF (boleto) | Impressão do navegador ("Salvar como PDF"); montado só com texto (sem HTML dos dados); nome do arquivo sem caracteres inválidos |
| CSV | Gerado no navegador; valores que começam com `= + - @`, tab ou CR são neutralizados (evita fórmulas maliciosas no Excel) |
| Arquivos exportados | **PDF e CSV não são cifrados**: guarde-os em local seguro |
| Erros | Usuário vê só mensagens amigáveis; o servidor nunca devolve detalhes técnicos |

**Senha esquecida = dados irrecuperáveis.** Nem o servidor consegue ler os dados (por isso não existe "esqueci minha senha"). Guarde a senha num gerenciador de senhas.

### Pontos em aberto (documentados, não escondidos)

- **Sem envio de e-mail** (o ZoZo não tem provedor de e-mail): não há aviso por e-mail no bloqueio de 24 h nem confirmação do e-mail no cadastro. Por isso o cadastro é limitado a `ALLOWED_EMAILS` — quem souber um e-mail da lista poderia criar a conta antes do dono (os dados de ninguém ficam expostos, mas o dono não conseguiria usar aquele e-mail). Crie as contas permitidas logo.
- **Cadastro revela se o e-mail já tem conta** ("Já existe uma conta com esse e-mail"): inevitável sem confirmação por e-mail.
- **Argon2id** (recomendado pela OWASP) não existe no navegador sem biblioteca extra; usamos PBKDF2-SHA256 com 600.000 iterações (mínimo atual da OWASP para PBKDF2).
- **Domínio próprio:** `usezozo.com.br` já está na sua conta Cloudflare; ligar o ZoZo a ele permite regras de WAF/limite de requisições na borda.

## Limites

- Cada conta guarda um documento de até ~1,9 MB **já comprimido e cifrado** (limite de linha do D1). Isso corresponde a dezenas de milhares de lançamentos; a foto do perfil ocupa ~100–300 KB. Ao chegar no limite, a gravação é recusada com aviso e nada é perdido.
- Nomes de lançamentos, contas, categorias e perfis: até 50 caracteres (`limiteNome` em `regras.js`).

## Funcionalidades

- **Dashboard:** foto, saudação, Gasto mensal (curva do mês × orçamento), Patrimônio, Top categorias, Próximos lançamentos, Lançamentos recentes.
- **Lançamentos:** agrupados por mês e dia, ícones R (recorrente) e P (parcelado), tags de categoria e perfil, pesquisa, filtros, seleção com ações em lote; painel com histórico e edição.
- **Parcelas automáticas**, **Recorrências** (semanal a anual ou parcelada), **Dividir lançamento** entre perfis.
- **Contas e Investimentos**, **Categorias** (com orçamento fixo ou por mês), **Perfis** (com boleto por perfil).
- **Configurações:** orçamento, armazenamento e última gravação; foto, nome, alterar senha, **2FA**, exportar CSV, apagar dados, sair, excluir conta.

## Regras configuráveis (`ui/js/config/regras.js`)

`limiteNome` · `categorias.sinalGastoPorTipo` · `totais` · `recorrencias.pagoSomenteComLancamento` · `boleto.*` · `tiposInvestimento` · `categoriasSugeridas` · `modelosCategoria` · `paleta`.

## Do Figma para o ZoZo

O ZoZo não usa framework: o visual vem de `ui/css/tokens.css` (cores, espaços, raios, sombras), `tipografia.css` (fontes e tamanhos) e dos componentes em `ui/js/components/`. Para trazer um projeto do Figma:

1. **Conecte o Figma ao Claude Code** (recomendado): no Figma desktop, abra o arquivo › menu **Figma › Preferências › Enable Dev Mode MCP Server**. Depois, num terminal, `claude mcp add --transport http figma-dev-mode http://127.0.0.1:3845/mcp`. Selecione um frame no Figma e peça ao Claude Code: *"atualize o card X do ZoZo conforme o frame selecionado, usando os tokens existentes"*.
2. **Organize o Figma com Variáveis** (cores, espaçamentos, raios, tipografia) com nomes parecidos com os de `tokens.css` (`color-primary`, `space-4`, `radius-large`…). Exporte (Dev Mode › Variables, ou o plugin *Variables to CSS*) e peça para mapear em `tokens.css` — a interface toda muda de uma vez.
3. **Ícones:** exporte como SVG de traço (24×24, stroke) e eles entram em `ui/js/core/icons.js`.
4. **Fontes:** coloque os `.woff2` em `ui/assets/fonts/` (a CSP só permite fontes do próprio site).
5. **Não cole HTML/CSS gerado automaticamente** sem revisão: a CSP bloqueia estilos e scripts inline, e o código precisa usar `ZoZo.dom` (sem `innerHTML`).
6. Teste em `/?mock=1`, depois na prévia, e só então publique.
