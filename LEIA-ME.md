# ZoZo

**Versão 2.4.0** · Autor: **Lukas Del Piero Barros** — Controle financeiro pessoal

Aplicativo web com design baseado no Copilot Money.

| Camada | Tecnologia |
|---|---|
| Front-end | HTML, CSS e JavaScript (pasta `ui`) |
| Back-end | Python 3 no **Cloudflare Python Workers** (pasta `api/src`) |
| Dados | **Cloudflare D1** (banco SQL) — só dados cifrados |
| Acesso | **Login próprio do ZoZo** (e-mail + senha + 2FA opcional), cadastro aberto, conta de demonstração pública |

Padrão de segurança obrigatório para qualquer mudança: [docs/SEGURANCA.md](docs/SEGURANCA.md) (o Claude Code lê automaticamente via [CLAUDE.md](CLAUDE.md)).

## Novidades da versão 2.4.0

- **Boleto agora é Fatura.** Novo cabeçalho (logo roxa à esquerda; à direita o PERFIL e "FATURA 13 OUT 2026", com a data escolhida no editor), seção **Transações** sem títulos de coluna (data "13 OUT", 4 últimos dígitos da conta, nome e parcela "1/12"), **Contribuições** (nome + valor, somam ao total; `regras.boleto.sinalContribuicao`), QR do Pix à esquerda com "Leia o QR no celular e pague por Pix" e o resumo à direita. Entram **só transações de cartão de crédito e empréstimo**. Imprimir e copiar o Pix ficam bloqueados enquanto as transações do perfil/período escolhidos não chegam (inclusive no Ctrl+P).
- **Gráficos de rosca** com fundo cinza-claro e barras de ponta arredondada, sobrepostas em sequência a partir do meio-dia.
- **Roxo da marca (#6948D8)** em textos, barras e destaques.
- **Login:** "Entrando no ZoZo" / "Preparando sua conta..." com carregando enquanto a senha é processada.
- **Celular:** menu lateral oculto, abrindo como gaveta; janelas modais e seus botões centralizados; barra de seleção só com ícones.
- **Revisão do Codex aplicada** (o que fazia sentido): a chave que protege os dados guardados no navegador não fica mais no banco (HMAC do cookie com o `SEGREDO`; quem estava logado digita a senha uma vez); documento sumido não abre vazio em silêncio (tenta o backup e avisa); falha ao salvar parcelas automáticas não é mais engolida; sem resposta ao salvar, os dados são relidos do servidor; datas inexistentes (31/02) e valores pela metade ("123abc") são recusados; documento de versão mais nova não é rebaixado; `sentido`/`direcao` das transferências unificados; resposta de outra sessão é descartada; falha ao atualizar com dados na tela aparece; Tab nas janelas ignora botões ocultos; fundo travado com a fatura aberta. **CAPTCHA:** com a chave pública e sem `TURNSTILE_SECRET`, a API recusa em vez de ficar sem proteção — e o script não publica em produção sem esse segredo.

## Novidades da versão 2.3.0

- **Conta de demonstração:** entre com **demo@usezozo.com.br** e a senha **zozo1234**. A cada acesso, o navegador sorteia perfis, contas, cartões, categorias, lançamentos e recorrências fictícios; nada é gravado (o servidor recusa gravações dessa conta e não deixa trocar senha, nome, 2FA nem excluí-la). O visitante pode criar **1 item de cada tipo** além do que foi gerado.
- **Perfis, boletos e Pix só para contas liberadas:** a demonstração e os e-mails do segredo `RECURSOS_AVANCADOS`. Para as demais contas somem o menu e a página Perfis, o campo e a pílula de perfil, a regra de perfil obrigatório, o filtro e a ação em lote de perfil, "Dividir lançamento", o botão e a página do boleto, a área do Pix nas Configurações e a coluna Perfil do CSV. Perfis já gravados ficam guardados (nada é apagado).
- **"Não foi possível concluir a operação":** a causa era o modo **Under Attack** do Cloudflare no `usezozo.com.br` desafiando também as chamadas `/api/*` (veja [Cloudflare na frente do ZoZo](#cloudflare-na-frente-do-zozo)). O ZoZo agora reconhece o desafio, explica o que houve e oferece recarregar a página; os demais erros mostram a mensagem certa (com o código, quando é genérico).
- **Dashboard cabe na tela** do computador, sem rolagem (gráficos mais baixos e listas com as linhas que cabem em telas menores).
- **Menu:** botão de atualizar removido; o botão de recolher/mostrar foi para a direita e a logo para a esquerda.
- **Perfis** com ícone redondo na cor do perfil e a inicial do nome, como em Contas; **boleto** com a logo nova.
- **Celular:** painel de informações em tela cheia e "Novo lançamento" empilhado; **Configurações** com o campo de senha arrumado; **2FA no login** com a mesma caixa das outras etapas.
- **Segurança:** limite de logins por IP; sessões da demo limitadas; código antigo do Cloudflare Access e da lista de e-mails removido.

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
│   │   ├── data/demo.js      dados sorteados da conta de demonstração
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
    ├── migracoes/            tabelas do banco (aplicadas em ordem, uma vez)
    ├── wrangler.toml         produção + prévia
    ├── publicar.ps1          testes → interface → migrações → publicação
    ├── montar_interface.py   gera api/public a partir de ui/
    ├── dev/servidor_local.py servidor para testar no seu computador (SQLite)
    └── tests/test_api.py     58 testes automáticos da API
```

## Ambientes e publicação

| Ambiente | Endereço | Banco | Quem acessa |
|---|---|---|---|
| **Local** | http://127.0.0.1:8787 | `api/dev/zozo-local.db` | só o seu computador |
| **Prévia** | https://zozo-previa.zozo-finance-app.workers.dev | `zozo-previa` | testes (aberta, banco separado) |
| **Produção** | https://usezozo.com.br · https://zozo.zozo-finance-app.workers.dev | `zozo` | usuários (cadastro aberto, com CAPTCHA) |

Fluxo recomendado: **mudar → testar no local → publicar na prévia → testar → publicar em produção**.

```powershell
.\api\publicar.ps1 previa      # usuários não veem
.\api\publicar.ps1 producao    # pede confirmação
```

O script roda os testes, monta a interface, aplica as migrações do banco e publica; qualquer falha interrompe.

**Segredos** (uma vez por ambiente; nunca no `wrangler.toml`): `npx wrangler secret put SEGREDO` e `npx wrangler secret put TURNSTILE_SECRET` (acrescente `--env previa` para a prévia). **Sem `TURNSTILE_SECRET` a produção não é publicada** (a chave pública está no `wrangler.toml`; sem a secreta, cadastro e login com CAPTCHA seriam recusados). O `SEGREDO` é uma sequência aleatória longa (gere com `python -c "import secrets; print(secrets.token_urlsafe(48))"`). **Não troque o `SEGREDO` sem necessidade** (só se ele vazar): o segredo do 2FA de cada usuário está cifrado com ele, e quem tem 2FA ativo ficaria sem conseguir entrar. Se precisar trocar, desative antes o 2FA de todos (`npx wrangler d1 execute zozo --remote --command "UPDATE contas SET totp_segredo = NULL, totp_pendente = NULL"`), troque o segredo e peça para reativarem. As sessões e os dados não dependem dele.

**Perfis, boletos e Pix:** liberados para a conta de demonstração e para os e-mails do segredo `RECURSOS_AVANCADOS` (separados por vírgula): `npx wrangler secret put RECURSOS_AVANCADOS` (e `--env previa`). Fica como segredo para os e-mails não irem para o GitHub. Sem ele, só a demonstração tem esses recursos.

**Conta de demonstração:** criada pela migração `0003_conta_demo.sql` (login `demo@usezozo.com.br`, senha `zozo1234`). Ninguém consegue recadastrá-la, trocar a senha ou ativar 2FA nela.

### Cloudflare na frente do ZoZo

O modo **"I'm Under Attack"** (ou uma regra de WAF com *Managed Challenge*) desafia **todo** pedido, inclusive as chamadas da API que o próprio site faz. Quando a verificação do navegador vence (padrão: 30 min), as ações passam a ser barradas pelo Cloudflare antes de chegar ao ZoZo — era o "Não foi possível concluir a operação". O ZoZo já tem CAPTCHA, bloqueio progressivo e limites por IP próprios, então o recomendado é:

1. **Desligar o Under Attack** (Cloudflare › usezozo.com.br › Visão geral › *Under Attack Mode* › desligado) e usar só em ataque real; **ou**
2. manter ligado e criar uma exceção para a API: Cloudflare › usezozo.com.br › **Regras › Configuration Rules** › *Create rule* → quando *URI Path* começa com `/api/` → **Security Level: Essentially Off** (ou *Medium*). Assim a página continua protegida e a API não é desafiada.

Se o desafio acontecer mesmo assim, o ZoZo mostra "Verificação de segurança" com o botão **Recarregar página**.

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
| Chave dos dados | Para não pedir a senha a cada recarga, fica no navegador **cifrada com o "envelope" da sessão** = HMAC(`SEGREDO`, cookie). O envelope **não fica no banco**: o banco + o navegador não bastam para abrir os dados. Saiu ou fechou o navegador: vira lixo ilegível e é apagada |
| 2FA | TOTP (RFC 6238), ±30 s de tolerância, um código não vale duas vezes; segredo cifrado no banco com o `SEGREDO` do servidor; 5 códigos errados → 15 min de bloqueio |
| Força bruta | Bloqueio progressivo por e-mail + IP (CAPTCHA na 4ª, 15 min na 5ª falha, 24 h na 10ª), contagem atômica (pedidos em paralelo não escapam); 20 falhas/h na mesma conta vindas de IPs diferentes → CAPTCHA para todos; no máximo 30 logins por IP a cada 10 min; cadastro e consultas também limitados por IP |
| Conta demo | Senha pública, por isso **somente leitura no servidor**: nada é gravado e senha, nome, 2FA, apagar e excluir são recusados (403); até 500 sessões abertas (as mais antigas e as paradas há 6 h saem); os dados são fictícios e gerados no navegador |
| Recursos por conta | Perfis, boletos e Pix: o servidor informa no login quais a conta tem (e-mails num segredo, nunca no código). A interface esconde e o serviço de dados recusa; como os dados são cifrados no navegador, o servidor não enxerga perfis — o recurso é de produto, não uma barreira entre contas (cada conta continua só com os próprios dados) |
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

- **Sem envio de e-mail** (o ZoZo não tem provedor de e-mail): não há aviso por e-mail no bloqueio de 24 h nem confirmação do e-mail no cadastro. Com o cadastro aberto, alguém pode criar uma conta com um e-mail que não é dele (os dados de ninguém ficam expostos, mas o dono real não conseguiria usar aquele e-mail).
- **Cadastro revela se o e-mail já tem conta** ("Já existe uma conta com esse e-mail"): inevitável sem confirmação por e-mail.
- **Argon2id** (recomendado pela OWASP) não existe no navegador sem biblioteca extra; usamos PBKDF2-SHA256 com 600.000 iterações (mínimo atual da OWASP para PBKDF2).
- **Domínio próprio:** `usezozo.com.br` já aponta para o ZoZo; regras de WAF/limite na borda devem deixar `/api/*` sem desafio (veja acima).
- **E-mail sem confirmação e recursos por lista (revisão do Codex, AUD-03):** quem cadastrar antes um e-mail que está em `RECURSOS_AVANCADOS` ganha Perfis/Fatura/Pix **nos próprios dados** (nada de outra conta). Sem provedor de e-mail não há como confirmar a titularidade: só ponha na lista e-mails cuja conta o dono **já criou**.
- **Recursos por conta só na interface:** Perfis/boletos/Pix são escondidos e recusados no navegador; quem alterar o próprio navegador conseguiria usá-los **nos próprios dados** (o servidor não lê o documento cifrado). Não dá acesso a nada de outra conta.

## Limites

- Cada conta guarda um documento de até ~1,9 MB **já comprimido e cifrado** (limite de linha do D1). Isso corresponde a dezenas de milhares de lançamentos; a foto do perfil ocupa ~100–300 KB. Ao chegar no limite, a gravação é recusada com aviso e nada é perdido.
- Nomes de lançamentos, contas, categorias e perfis: até 50 caracteres (`limiteNome` em `regras.js`).

## Funcionalidades

- **Dashboard:** foto, saudação, Gasto mensal (curva do mês × orçamento), Patrimônio, Top categorias, Próximos lançamentos, Lançamentos recentes.
- **Lançamentos:** agrupados por mês e dia, ícones R (recorrente) e P (parcelado), tags de categoria e perfil, pesquisa, filtros, seleção com ações em lote; painel com histórico e edição.
- **Parcelas automáticas**, **Recorrências** (semanal a anual ou parcelada), **Dividir lançamento** entre perfis.
- **Contas e Investimentos**, **Categorias** (com orçamento fixo ou por mês), **Perfis** (com boleto por perfil e Pix — só contas liberadas).
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
