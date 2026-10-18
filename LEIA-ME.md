# ZoZo

**Versão 3.11.0** · Autor: **Lukas Del Piero Barros** — Controle financeiro pessoal

Aplicativo web com design baseado no Copilot Money.

| Camada | Tecnologia |
|---|---|
| Front-end | **Vite + TypeScript + Tailwind CSS** (em transição; pasta `ui`) — módulos ainda em JavaScript convivem com os já convertidos |
| Back-end | Python 3 no **Cloudflare Python Workers** (pasta `api/src`); transição para **FastAPI + Pydantic** iniciada (`app_fastapi.py`, desligada no Cloudflare) |
| Dados | **Cloudflare D1** (banco SQL) — só dados cifrados |
| Acesso | **Login próprio do ZoZo** (e-mail + senha + 2FA opcional), cadastro aberto, conta de demonstração pública |

Padrão de segurança obrigatório para qualquer mudança: [docs/SEGURANCA.md](docs/SEGURANCA.md) (o Claude Code lê automaticamente via [CLAUDE.md](CLAUDE.md)).

## Novidades da versão 3.11.0

- **Pagar fatura do cartão:** botão "Pagar fatura" no painel do cartão de crédito. A janela "Fatura" mostra o nome e os 4 últimos dígitos (só leitura), o valor da fatura em aberto (pode pagar uma parte), o perfil e a conta a debitar (corrente, poupança ou outros, com saldo). Ao pagar, entram juntas — numa única gravação, ou nenhuma — uma transação Débito na conta (categoria "Fatura", criada se não existir) e uma Receita no cartão, as duas com o nome "Pagamento fatura", a data do dia, o perfil e a observação "Pagamento da fatura do cartão de crédito [nome] com 4 últimos dígitos [dígitos]." O serviço confere tudo de novo: valor maior que zero e até a fatura, saldo da conta, tipo e moeda da conta, perfil (inclusive arquivado).
- **Serviço de dados em TypeScript** (`data/servico.ts`): o documento cifrado tem tipos (transações, contas, categorias, perfis, recorrências); a interface inteira agora é TypeScript. Os 59 testes do serviço passam antes e depois; 6 novos (pagamento da fatura e frequências).
- **Correções:** a frequência de uma recorrência aceitava nomes herdados de `Object` (ex.: "constructor") — agora só as da lista; no celular, o "⋯" do painel do cartão saía da tela com dois botões — os botões do painel ganharam rótulo curto no celular ("Fechamento", "Pagar"), com o nome completo para leitores de tela; um texto de erro do gráfico da conta usava uma classe que não existe mais.

## Novidades da versão 3.10.0

- **Host web em TypeScript** (`bridge/host-web.ts`): a criptografia de ponta a ponta e a conversa com a API agora têm tipos (sessão, chaves, respostas da API, pedidos da interface). Mesma lógica, mesmas derivações e mesmo formato do documento — os 19 testes do host (com a derivação conferida por uma implementação independente) passam antes e depois, e o login, a gravação e a leitura foram testados no navegador. Ações herdadas de `Object` também são recusadas aqui.
- **Fim da migração para Tailwind:** CAPTCHA, espaçamento das páginas, bolinha/seta/contador das categorias, grupos que abrem e fecham e a camada do seletor de emoji. Visual conferido elemento a elemento em 1280 e 375 px. O CSS antigo ficou em 4 arquivos com papel claro: `tokens.css` (variáveis, sem as que não eram usadas), `base.css` (fontes, reset, foco, dinheiro, estados globais, lista aberta do select), `movimento.css` (animações por posição dos filhos) e `print.css` (impressão da fatura). `layout.css`, `pages.css` e `tipografia.css` deixaram de existir.
- **Tipos de todos os módulos:** `window.ZoZo` não aceita mais "qualquer coisa": cada módulo (serviço, login, fatura, painéis, Configurações, emoji…) tem a sua interface. Isso mostrou uma chamada que não atualizava a barra superior ao abrir as transações de um perfil.
- **Acessibilidade:** o rótulo de um campo com prefixo (ex.: "Saldo" com R$) apontava para o invólucro, não para o campo — o leitor de tela não anunciava o nome e clicar no rótulo não focava. Corrigido para todos os campos (`UI.Field`). A seta dos grupos de categorias ficou centralizada (estava 2 px para a direita).

## Novidades da versão 3.9.0

- **Fatura, Divisão entre perfis, Calendário e Câmbio em Tailwind CSS:** editor e folha A4 da fatura (lista, ajustes, resumo, Pix), janela de dividir transação, calendário (dias, hoje, escolhido, teclado), seletor de moedas do menu lateral e janelas de transferir entre moedas. Visual conferido elemento a elemento em 1280, 760 e 375 px (idêntico). A impressão da fatura continua em `css/print.css`. Mais ~210 linhas de CSS antigo a menos (`components.css` deixou de existir); o que resta (427 linhas): tokens de cor e espaço, a base (reset, `.page`, dinheiro, ícones, foco), CAPTCHA, seletor de emoji, lista aberta do campo de seleção, animações de entrada e a impressão da fatura.
- **Testes antes da conversão do serviço e do host:** 41 testes novos (78 no total). Serviço de dados: entrada inválida, fatura, perfis (inclusive arquivados e sem o recurso), exclusões, recorrências (pagar duas vezes não duplica), divisão, lote, gravação que falha ou entra em conflito, documento mais novo ou sumido. Host web: a API falsa confere que a senha e o conteúdo nunca saem legíveis; derivação das chaves (Argon2id e PBKDF2 → HKDF) e formato do documento conferidos com uma implementação independente; adulteração, AAD (outra versão/outra conta), versão mais antiga, conflito, chave guardada só com o envelope da sessão, troca de senha, senha vazada (só 5 caracteres do hash saem), rebaixamento de parâmetros, proteção do Cloudflare.
- **Correções encontradas pelos testes:** o serviço de dados aceitava como ação nomes herdados de `Object` (`constructor`, `toString`…) — agora só as ações da tabela; a fatura aceitava mês/ano como `"3x"` — agora só número inteiro.

## Novidades da versão 3.8.0

- **Perfis e Configurações em Tailwind CSS:** linhas de perfil, abas das Configurações, linhas (inclusive a do multicâmbio), foto, senha, Pix, rodapé (Sair / Excluir conta), painel do 2FA e o código de 6 dígitos (também no login e ao desativar o 2FA). Visual conferido elemento a elemento em 1280, 760 e 375 px. ~200 linhas de CSS antigo a menos; o que resta do CSS antigo é Fatura, Divisão, Calendário, câmbio (seletor do menu), login/2FA, seletor de emoji e a base (`.page`, dinheiro, animações).
- **TypeScript em toda a interface:** todos os módulos estão em `.ts`, menos `data/servico.js` (regras financeiras) e `bridge/host-web.js` (criptografia e API), que ficam por último, com testes antes. Tipos novos: peças (`ZoZoUI`), linhas, gráficos, janelas, menus, contexto das páginas (`ContextoApp`), filtros de Transações; `h("input")` já devolve `HTMLInputElement`.
- **Correções encontradas pelo TypeScript:** o campo do orçamento no painel da categoria ficava sem nome para leitores de tela (o `aria-label` era descartado) e o limite de caracteres dos itens da fatura não valia; opções de gráfico que não existiam foram removidas; menus do painel ignoram itens condicionais vazios.

## Novidades da versão 3.7.0

- **Investimentos em Tailwind CSS:** card do gráfico (engrenagem das contas incluídas, aviso de contas ocultas, valor, variação, períodos), lista de contas e linhas de alocação. No computador, idêntico ao anterior (conferido elemento a elemento); em área estreita, duas correções: o valor do card fica no centro (antes saía para a esquerda) e o nome da alocação não quebra mais em duas linhas ("Tesouro Direto").
- **Formulário do painel em Tailwind** (editar categoria, perfil): corpo, aviso e campo de ícone.
- **TypeScript:** mais 6 módulos — menu suspenso, menu lateral, formulário do painel, verificação (CAPTCHA, código de 6 dígitos, QR, senha) e as páginas Investimentos e Recorrências.
- ~50 linhas de CSS antigo a menos.

## Novidades da versão 3.6.0

- **Empréstimo novo:** nome, instituição (opcional), valor contratado, 1º vencimento, parcelas (inteiro, a partir de 1), valor da parcela e valor devido — um puxa o outro (parcela × parcelas) — com o resumo "Valor devido de R$ X (inclui R$ Y de juros da operação)" atualizado enquanto digita, e a cor. O contrato aparece no painel da conta.
- **Orçamento perto do limite:** a barra fica laranja (a mesma cor dos avisos) a partir de 80% do orçamento; acima do orçamento continua vermelha.
- **Divisão personalizada:** editar o valor ou o percentual de uma parte reajusta as outras na mesma proporção — a soma é sempre o valor da transação (100%); remover ou adicionar uma parte também redistribui.
- **Filtros de Transações:** só aparecem contas, categorias, perfis, recorrências e tipos que existem nas transações (o que já estava marcado continua, para desmarcar). Estorno entrou nos tipos.
- **Nova conta pelo painel da transação:** além de banco e cartão, Investimentos, Empréstimos e Outros.
- **Valor da transação nova:** o símbolo da moeda ("R$") aparece ao clicar e continua no campo mesmo apagando tudo.
- **Alinhamentos:** cabeçalho dos painéis de categoria, grupo e "todas" em linhas (ícones ↔ "Gasto em…", nome ↔ valor); pílulas do grupo lado a lado (estavam empilhadas e desencontradas); lista de transações dos painéis numa grade única (título, letra, ícone da categoria e valor na mesma coluna em todas as linhas); a seta dos links no topo dos cards do Dashboard termina na linha dos valores; janela Nova recorrência sem barra de rolagem horizontal.
- **Recorrências em Tailwind CSS:** página, linhas (também as do Dashboard), título com o menu de frequência e a janela de frequência/parcelas. ~80 linhas de CSS antigo a menos.
- **TypeScript:** mais 13 módulos convertidos (ícones, regras, mensagens da ponte, transporte, barra superior, painel de informações, avisos/janelas, calendário, edição no lugar, divisão, roteador e peças das páginas).

## Novidades da versão 3.5.0

- **Peças compartilhadas em Tailwind CSS:** botões, botões de ícone, campos (texto, valor com prefixo, senha com "mostrar", lista, área de texto), interruptores, seletores segmentados, paleta de cores, caixas de seleção, pílulas, rótulos, percentuais, barras, abas, cards, seções, esqueletos, estados vazios e avisos. As classes ficam em `components/pecas.ts`.
- **Painéis de informações em Tailwind CSS:** transação (topo, propriedades, pílulas, notas, situação), cabeçalhos de Categoria/Grupo/Perfil e de Conta/Investimento/Recorrência, seções, linhas, ações, edição no lugar (nome, valor, cor, ícone), lista de transações dos painéis, formulários de criação e o card de resumo com a rosca; também os gráficos (linha, barras, rosca e a dica ao passar o mouse).
- **Visual idêntico**, conferido elemento a elemento em 39 situações no computador (1280 px) e no celular (375 px); ~850 linhas de CSS antigo a menos.
- **Correção:** o cabeçalho da fatura (título e botões "Fechar"/ações) tinha perdido o estilo na 3.4.0.
- **Limpeza:** duas regras de CSS que nenhuma tela usava mais.

## Novidades da versão 3.4.0

- **Estrutura em Tailwind CSS:** menu lateral (com a gaveta do celular e o modo recolhido), barra superior (com a pesquisa), área principal, painel de informações (inclusive a gaveta sobreposta em telas estreitas), menus flutuantes e janelas modais. Visual idêntico, conferido elemento a elemento: a estrutura em 5 tamanhos de janela × 7 situações, 17 tipos de menu e 10 janelas no computador e no celular. ~690 linhas de CSS antigo a menos; as classes ficam em `components/estrutura.ts`.
- **Categorias regulares:** o cabeçalho (Gasto/Reservado) usa a mesma grade das linhas em qualquer largura — com o painel aberto o título quebrava em duas linhas e "Gasto" ficava fora do lugar.
- **Painel de informações:** as pílulas de Categoria e Perfil começam na mesma linha do "+" e dos outros valores; todos os campos de edição dos painéis (nome, valor, notas, orçamento, fechamento e vencimento) ficam sem borda e com fundo transparente também ao editar; clicar no valor põe o cursor no fim, sem deixar tudo selecionado (azul).
- **Acertos:** contorno de foco do botão de filtro visível (era branco sobre a barra branca); código sem uso removido (formulário de grupo dentro do menu e uma opção que o painel ignorava).

## Novidades da versão 3.3.0

- **Busca nova (Transações):** várias palavras em qualquer ordem e em qualquer campo ("mercado outubro", "uber nubank"), prefixo enquanto digita, trecho no meio da palavra, tolerância a erros de digitação ("supermecado"), valores ("1.234,56", "150") e filtros de valor (">100", "<= 50"), datas ("11/10", "setembro"), tipo ("receita", "parcelado") e o trecho encontrado destacado no nome. Pesquisando, também aparecem parcelas e agendamentos futuros. Atalho **/** ou **Ctrl+K** de qualquer página; **Enter** pesquisa na hora e **Esc** limpa. Roda inteira no navegador (índice invertido, ~200 ms para montar e pesquisar 10 mil transações): como os dados são cifrados de ponta a ponta, nada é enviado a um servidor de busca (o Meilisearch exigiria os dados legíveis fora do navegador).
- **Busca que "não funcionava":** o campo era recriado quando a barra superior se redesenhava (dados recarregados, atualização de outra aba) e perdia o foco e as últimas letras digitadas; agora é sempre o mesmo campo.
- **Dashboard em Tailwind CSS:** saudação, grade, cards, Gasto mensal, Top categorias, Próximas transações e o modo "cabe na tela". Visual idêntico, conferido em 5 tamanhos de janela e 3 situações; ~130 linhas de CSS antigo a menos.
- **Correções:** desligar e religar o orçamento deixava o Gasto mensal em "gastos" até recarregar; a conferência de atualização em tempo real podia disparar em rajada (trocas de janela) e gastar a cota da conta — agora no máximo 1 pedido a cada 10 s; Top categorias abre também com a barra de espaço.
- **Limpeza:** ~25 regras de CSS antigo que nenhuma tela usava mais.

## Novidades da versão 3.2.0

- **Contas em Tailwind CSS:** página, linhas de conta (também as de Investimentos), gráfico de ativos e passivos (também o do Dashboard) e o painel da conta. Visual idêntico, conferido em 4 larguras e 15 situações; ~45 linhas de CSS antigo a menos.
- **Saldo das contas e cartões:** toda transação nova, editada ou apagada atualiza o saldo — compra no cartão aumenta a fatura, estorno e pagamento diminuem, receita e transferências mudam a conta (antes só débitos contavam). As transações que já existiam não mexem no saldo informado.
- **Atualização em tempo real:** o que for gravado em outra aba ou dispositivo aparece sozinho (ao voltar para a aba e a cada minuto), sem F5. O servidor só informa o número da versão; o documento só é baixado quando mudou.
- **Sessão de 24 h:** a sessão termina 24 h depois do login, mesmo com o navegador aberto.
- **Fechamento do cartão sem janela:** "Editar fechamento" troca o canto do painel por "Mesmo fechamento para todos os meses" / "Diferentes fechamentos por mês", com fechamento e vencimento logo abaixo.
- **Painéis:** a transação clicada no painel de conta, categoria, grupo, recorrência ou perfil abre ali mesmo, com seta para voltar; "Cancelar" na edição da categoria volta ao painel; últimos 4 dígitos editáveis com um clique no título; valor editado com o símbolo da moeda; "Gasto em Outubro" (mês por extenso).
- **Interface:** troca de moeda instantânea; gráficos animados também ao trocar de moeda; pílulas de Recorrência e Divisão do tamanho das de Categoria e Perfil; emoji da pílula alinhado; "+N" das categorias ao lado das pílulas, com menu mais estreito; janelas de criação e de transferência com a mesma largura (560 px); ícone da fatura já carregado; sem espaço sobrando entre a caixa de seleção e o nome da transação.

## Novidades da versão 3.1.1

- **Categorias em Tailwind CSS:** página (colunas Gasto/Reservado, listas, grupos), linhas de categoria e de grupo e os painéis (categoria, grupo, "todas as categorias", edição de orçamento). Visual idêntico, conferido elemento a elemento em 4 larguras e 9 situações (inclusive orçamento desligado); ~75 linhas de CSS antigo a menos. Continuam no CSS antigo só as peças que outras telas também usam (bolinha, seta e contador da categoria, árvore do grupo, resumo com a rosca).

## Novidades da versão 3.1.0

- **Gráficos animados de novo:** a causa era o build, que reescrevia a duração "900ms" como ".9s" — o código lia 0,9 ms e a animação acontecia num piscar. Os gráficos voltam a se desenhar junto com a entrada da página, como antes da 2.8; o cartão do gráfico só desliza (não esmaece) e, se a página se redesenha logo depois de abrir, o gráfico continua de onde estava.
- **Transações em Tailwind CSS:** página, barra de informações, filtros, meses e dias, barra de seleção e a linha da transação (também a do Dashboard). Visual idêntico, conferido elemento a elemento em computador, tablet e celular; ~195 linhas de CSS antigo e duas variantes que não eram usadas saíram.
- **Barra de seleção:** sem "Sem perfil"; o menu de categoria ganhou "+ Nova categoria" (criada e já aplicada às selecionadas) e rolagem. Pelo teclado, a barra é uma parada só no Tab e as setas andam entre os botões.
- **Acessibilidade:** a caixa de seleção saiu de dentro do botão da linha e o nome do grupo de categorias virou um botão próprio ao lado da seta (antes, controle dentro de controle: leitores de tela não alcançavam a caixa nem a seta).
- **Por dentro:** estado central em TypeScript; total do mês calculado numa passada só (listas longas).

## Novidades da versão 3.0.0

- **Confirmação de e-mail no cadastro** (Resend, domínio `usezozo.com.br`): a conta nasce pendente e é ativada no **primeiro login feito com o link do e-mail** — o link sozinho não basta, é preciso a senha. Assim ninguém consegue cadastrar o e-mail de outra pessoa com uma senha própria e esperar que ela clique. A resposta do cadastro é a mesma para e-mail novo ou já cadastrado (quem já tem conta recebe um aviso por e-mail): o cadastro **não revela mais quem tem conta**. "Reenviar link" com espera de 60 s; links valem 24 h e uma vez só; o mais recente vale.
- **Avisos por e-mail:** senha alterada e verificação em duas etapas desativada.
- **Argon2id** (64 MiB, 3 passagens) no lugar do PBKDF2 para **contas novas e senhas trocadas**; as contas antigas continuam em PBKDF2 até trocarem a senha (nenhum dado precisa ser recifrado de surpresa).
- **Login em Tailwind CSS:** as telas de entrada, cadastro, 2FA e confirmação saíram do CSS antigo (~210 linhas repetidas a menos). De quebra: o carregando de "Entrando no ZoZo" voltou a girar e o aviso de servidor indisponível não sai mais do centro.
- **Segurança (auditoria):** novo login encerra a sessão anterior do mesmo navegador; cadastro com Google substitui um cadastro pendente de outra pessoa; o e-mail de confirmação não leva o nome digitado; corpo do pedido lido com limite real (FastAPI); `ZoZo.dom` em TypeScript, descartando `on…` em texto e links `javascript:`.
- **Interface (2.9.x):** "+" da divisão igual ao da recorrência; lista dos menus de seleção emendada no campo (estilo Apple); "Salvar" do Pix desativado enquanto houver campo inválido; animação dos gráficos de volta; menu recolhido sem desalinhar a borda; Regular → Receita; alinhamentos das transações e das recorrências sem "pago".

## Novidades da versão 2.9.0

- **Divisão em recorrentes já criadas:** "+ Adicionar divisão" no painel de qualquer transação. Na origem da série, cada parte vira uma série; numa ocorrência já lançada, divide só aquele mês (as partes continuam na série).
- **Regular: Despesa ou Estorno** também ao editar.
- **Gráficos:** a animação de entrada continua se o gráfico for redesenhado no meio (ex.: a barra de rolagem aparece) — antes pulava direto para o fim.
- **Pix:** escolha CPF, Celular ou E-mail; CPF com máscara 000.000.000-00 e dígitos verificadores conferidos; celular +55 (00) 90000-0000 só com DDD do Brasil e começando por 9; nome só com letras. Regras também no serviço de dados. CNPJ e chave aleatória sem suporte.
- **Cartão de crédito:** painel com o título "Cartão de crédito" e **Editar fechamento** — fechamento e vencimento juntos (nunca só um), para todos os meses ou só para um mês.
- **Transferir entre moedas:** Enviar | Importar, a outra moeda no botão do canto inferior esquerdo (com menu) e aviso laranja "O valor numérico não será convertido, apenas a moeda será alterada."
- **Emojis instantâneos:** um único seletor fica pronto desde que o app abre (abre em ~8 ms).
- **Avisos no canto da tela:** as confirmações de sucesso não aparecem mais; erros e avisos continuam.
- **Ajustes:** conta e 4 dígitos juntos e nomes alinhados em Transações; alternadores da janela de conta centralizados; alocação de Investimentos sem ícone e com a barra maior; textos de listas vazias; CSV sem a observação; hover do ícone da categoria centralizado; ação em lote "Tipo → Débito" funcionando (só para transações em conta).

## Novidades da versão 2.8.0

- **Emojis com emoji-mart:** cantos arredondados e roxo do ZoZo ao passar o mouse e no emoji atual; pesquisa em português; dados locais (nada é buscado na internet) e CSS compatível com o CSP; carrega sob demanda e é pré-carregado quando o navegador fica ocioso (abre em ~40 ms).
- **Débito em transação existente:** trocar o tipo para Débito agora funciona; se a transação estava num cartão, passa para a primeira conta (com aviso).
- **Trazer transações de outra moeda a qualquer momento:** botão ao lado do CSV em Transações (multicâmbio, contas liberadas). Também dá para trazer de volta para o Real.
- **Menu:** trilho da barra de rolagem na cor do menu; "Câmbio" no mesmo estilo de "Conta bancária"; moeda escolhida sem borda branca.
- **Animações:** painel ao criar uma transação, entrada das páginas em sequência, cartão do login e troca de etapas (para a frente e para trás). Respeitam "reduzir movimento".
- **Auditoria do Codex (cfd242e) — aplicado:**
  - **F01** transferência entre moedas leva série e divisão de forma transitiva (nada fica metade em cada moeda);
  - **F02** valor ilegível ou ID repetido no documento não vira zero gravado: abre só para leitura e o original fica intacto (texto "123.45" é convertido de forma determinística);
  - **F03** falha de uma carga antiga não sobrescreve a mais nova;
  - **F04** o log de corpo inválido (FastAPI) não registra nomes de campos vindos do cliente;
  - **F05** query com campos demais ou URL quebrada responde 400 (nunca erro interno), nos dois caminhos;
  - **F07** com `API_FASTAPI = 1` e sem o pacote, a API recusa (503) em vez de voltar em silêncio ao caminho antigo;
  - **F10** publicação sempre roda `npm ci` e, em produção, para sem ponto de restauração do banco (a não ser com `-SemPontoDeRestauracao`);
  - **F11** gráfico de barras para de observar o tamanho ao sair da tela;
  - textos: CSV diz qual moeda exporta; o aviso de criptografia não promete mais do que entrega.
- **Auditoria — fica como ação/decisão sua:** F06 (confirmar quem eram as contas marcadas como confirmadas pela migração 0005), F08/F09 (limites de leitura no runtime e backup externo com restauração ensaiada), F12 (tipar os contratos principais aos poucos).

## Novidades da versão 2.7.0

- **Campos de valor como maquininha:** os dígitos entram pelos centavos (1 → 0,01 · 1200 → 12,00 · 120000 → 1.200,00); colar "1.234,56" mantém o valor.
- **Painel da transação:** a seta ao lado da conta, categoria, perfil e recorrência abre o painel dela (com "voltar"), sem mexer nos filtros da lista; a conta abre a lista com um clique (sem a setinha) e tem **+ Nova conta** (corrente/poupança ou cartão, já escolhida na transação); a recorrência usa o mesmo menu da criação, com **Sem recorrência**; sem "Sem perfil" nas contas com Perfis; Débito sem o rótulo "Saída"; nome e valor sem fundo/borda ao editar.
- **Calendário do ZoZo** (cantos arredondados, roxo no dia escolhido e ao passar o mouse) no painel, na divisão e na fatura — o do navegador não aceita estilo.
- **Gráficos:** degradê em todas as linhas; com duas linhas, o da de cima vai até a de baixo; Investimentos com linha contínua.
- **Contas:** janela própria para cartão de crédito; poupança e corrente juntas.
- **Categorias:** "+N" do grupo abre a lista das categorias; "Excluída" (fora do orçamento) só para categoria sem transações (regra também no serviço); texto novo e botão vermelho ao desagrupar; janelas de aviso mais largas.
- **Parcelas:** valor total = valor da transação (não editável), sem o texto explicativo.
- **Multicâmbio:** textos novos; levar transações para outra moeda só para contas liberadas (segredo `RECURSOS_CAMBIO`, além das de `RECURSOS_AVANCADOS` e da demonstração).
- **Pix:** "Definir chave Pix para o QRCode.", aceita CPF, telefone ou e-mail (CNPJ sem suporte por enquanto), Salvar na mesma linha; na fatura, QR maior e texto com peso 620.
- **Outros:** barra de rolagem do sistema; Configurações maiores (Geral sem rolagem); menu "Contas incluídas" de Investimentos alinhado; check de pago sem fundo; aviso de demonstração laranja; pesquisa de Transações com animação; CSV com ícone de carregando e sem aviso; fatura abre e fecha com transição.

## Novidades da versão 2.6.0

- **Lançamentos agora se chamam Transações** em toda a interface (menu, títulos, avisos, CSV `ZoZo-transacoes-….csv`).
- **Novo tipo Débito** (Regular, Transferência, Receita, Débito): só saída, sai do saldo da conta escolhida (cartão não vale), com Categoria e Recorrência. Editar valor/conta/data ajusta o saldo; excluir devolve; data futura só debita no dia.
- **Conta editável** depois de criada, em qualquer tipo; **seta →** ao lado da conta e das pílulas (categoria, perfil, recorrência) abre as transações filtradas.
- **Parcelamento pelo valor total:** 141,00 em 7× a partir da 1ª parcela → 20,16 + 6 × 20,14; divisão exata → todas iguais; começando na 2ª ou depois → todas iguais (20,14). Prévia das parcelas na janela.
- **Dividido + recorrente:** dá para dividir uma recorrente (cada parte vira uma série) e tornar recorrente uma transação dividida.
- **Grupos de categorias:** clique no grupo → painel com **Subcategorias** (soma dos orçamentos), **Não atribuído** (orçamento do grupo, fixo ou só do mês) e **Desagrupar categorias**. O não atribuído cobre, na hora, o que falta para cada categoria do grupo sair do vermelho (maior estouro primeiro); o resto continua sem atribuir. Ex.: A 2.000 (gastou 2.500), B 1.000 (gastou 2.000), não atribuído 4.000 → A recebe 500, B 1.000, sobram 2.500; total do grupo 7.000.
- **Multicâmbio** (Configurações › Geral): Real, Euro e Dólar, cada um com as próprias transações, contas, cartões, categorias, perfis, recorrências, orçamentos e faturas — sem conversão. Grade **Câmbio** com bandeiras no menu. Na 1ª vez numa moeda, oferece levar transações (a série inteira de parcelas/recorrência vai junto; conta/categoria/perfil são recriados na moeda, conta nova com saldo zero). Desativar guarda tudo e volta ao Real. CSV com coluna Moeda.
- **Campos de valor** com milhar e centavos enquanto digita (12000 → 12.000; ao sair, 12.000,00).
- **Correções:** categoria criada no meio de uma transação aparece e já fica escolhida; trocar o tipo redesenha o painel; a barra de seleção fica presa ao rodapé mesmo com poucas transações.
- **Base técnica:** interface montada pelo **Vite** (substitui o `montar_interface.py`), primeiros módulos em **TypeScript** (`format`, `pix`), **Tailwind CSS** com prefixo `tw:` (1ª tela: Configurações › Sobre), cabeçalhos de segurança numa fonte única (`api/cabecalhos_ui.json`), dependências com versão fixa e sem scripts de instalação (`.npmrc`). Back-end: app **FastAPI** com validação **Pydantic** estrita na frente do núcleo, testado e ainda desligado no Cloudflare. Plano de e-mails (confirmação, recuperação, avisos): [docs/PLANO-EMAIL.md](docs/PLANO-EMAIL.md).

## Novidades da versão 2.5.0

- **Animações:** ao recolher/mostrar o menu, o menu desliza junto com o conteúdo; grupos que abrem e fecham (contas do menu, seções, grupos de categorias, Top categorias) animam a altura.
- **Fatura:** botão Fechar branco (fundo ao passar/clicar igual ao do menu); texto do QR no topo, roxo #6948D8, peso 550; QR com margem de 4 módulos; ajuste com valor inválido bloqueia imprimir e o Pix; somas em centavos (as linhas exibidas batem com o total).
- **Patrimônio total** com o degradê do Gasto mensal; **avisos** (ex.: CSV gerado) com largura limitada e texto alinhado; no celular o título do painel de informações não fica mais embaixo do botão do menu.
- **Segunda revisão do Codex:**
  - a publicação não troca mais o `SEGREDO` por engano (lista de segredos com falha = para tudo; em produção nunca é criado automaticamente);
  - documento sumido sem backup abre **só para leitura** (recomeço só por "Apagar todos os dados");
  - recursos por e-mail exigem **e-mail confirmado** (pelo Google; contas existentes já marcadas);
  - **desativar o 2FA pede o código atual**;
  - cota por conta nas rotas de dados;
  - corpo da requisição só é lido com tamanho declarado;
  - chave Pix no formato do DICT (e-mail ASCII, CNPJ alfanumérico);
  - código 2FA com dígitos Unicode recusado sem erro interno;
  - documento carregado validado item a item.

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

- **Sem login da Cloudflare para os usuários:** o ZoZo tem login próprio. Sessão no servidor com cookie `HttpOnly` + `Secure` + `SameSite=Strict`, que dura até o navegador ser fechado ou, no máximo, **24 h depois do login**.
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
├── package.json · package-lock.json · .npmrc   ← interface: Vite, TypeScript, Tailwind (versões fixas)
├── vite.config.ts            ← build (api/public + _headers; a demonstração nunca entra)
├── tsconfig.json
├── ui/                       ← front-end
│   ├── index.html            só carrega src/main.ts
│   ├── src/                  main.ts (ordem dos módulos) · estilos.css (CSS atual em camada + Tailwind) · globais.d.ts (tipos)
│   ├── public/assets/img/    imagens usadas pelo JS (copiadas como estão)
│   ├── assets/fonts/         fontes (entram no build com hash)
│   ├── css/                  tokens · base · layout · components · pages · tipografia · print
│   ├── js/
│   │   ├── core/             dom (sem innerHTML) · icons · format.ts (pt-BR) · state
│   │   ├── config/regras.js  regras configuráveis (inclui limiteNome = 50)
│   │   ├── data/servico.js   regras de dados (lançamentos, parcelas, recorrências…)
│   │   ├── data/pix.ts       Pix copia e cola / QR (BR Code do BACEN)
│   │   ├── data/demo.js      dados sorteados da conta de demonstração
│   │   ├── bridge/           messages.js (contrato) · host-web.js (criptografia + API) · transporte.js
│   │   ├── components/       … · verificacao.js (CAPTCHA, código de 6 dígitos, QR code — qrcode-generator do npm) · cambio.js
│   │   ├── pages/ · router.js · app.js
│   ├── tests/                testes do serviço de dados e do host web (node --test)
│   └── mock/                 modo demonstração (só no npm run dev; nunca no build)
└── api/                      ← back-end (Python 3)
    ├── src/entry.py          ponto de entrada no Cloudflare (D1, fetch, cookies)
    ├── src/nucleo.py         rotas, sessões, bloqueio progressivo, prova de senha
    ├── src/totp.py           2FA (TOTP RFC 6238) e cifra do segredo do 2FA
    ├── src/google.py         "Continuar com Google" (OpenID Connect + PKCE)
    ├── src/app_fastapi.py    transição: FastAPI + Pydantic na frente do núcleo (desligado: API_FASTAPI)
    ├── migracoes/            tabelas do banco (aplicadas em ordem, uma vez)
    ├── wrangler.toml         produção + prévia
    ├── publicar.ps1          testes → interface → migrações → publicação
    ├── cabecalhos_ui.json    cabeçalhos de segurança da interface (build e servidor local)
    ├── dev/servidor_local.py servidor para testar no seu computador (SQLite)
    └── tests/                test_api.py (63) · test_fastapi.py (8)
```

## Ambientes e publicação

| Ambiente | Endereço | Banco | Quem acessa |
|---|---|---|---|
| **Local** | http://127.0.0.1:5173 (Vite) · http://127.0.0.1:8787 (API + interface montada) | `api/dev/zozo-local.db` | só o seu computador |
| **Prévia** | https://zozo-previa.zozo-finance-app.workers.dev | `zozo-previa` | testes (aberta, banco separado) |
| **Produção** | https://usezozo.com.br · https://zozo.zozo-finance-app.workers.dev | `zozo` | usuários (cadastro aberto, com CAPTCHA) |

Fluxo recomendado: **mudar → testar no local → publicar na prévia → testar → publicar em produção**.

```powershell
.\api\publicar.ps1 previa      # usuários não veem
.\api\publicar.ps1 producao    # pede confirmação
```

O script roda os testes (API, serviço de dados e tipos), monta a interface com o Vite, aplica as migrações do banco e publica; qualquer falha interrompe. Requer Node.js (npm) e uv.

**Segredos** (uma vez por ambiente; nunca no `wrangler.toml`): `npx wrangler secret put SEGREDO`, `npx wrangler secret put TURNSTILE_SECRET` e `npx wrangler secret put RESEND_API_KEY` (acrescente `--env previa` para a prévia). **Sem `TURNSTILE_SECRET` a produção não é publicada** (a chave pública está no `wrangler.toml`; sem a secreta, cadastro e login com CAPTCHA seriam recusados). O `SEGREDO` é uma sequência aleatória longa (gere com `python -c "import secrets; print(secrets.token_urlsafe(48))"`). **Não troque o `SEGREDO` sem necessidade** (só se ele vazar): o segredo do 2FA de cada usuário está cifrado com ele, e quem tem 2FA ativo ficaria sem conseguir entrar. Se precisar trocar, desative antes o 2FA de todos (`npx wrangler d1 execute zozo --remote --command "UPDATE contas SET totp_segredo = NULL, totp_pendente = NULL"`), troque o segredo e peça para reativarem. As sessões e os dados não dependem dele.

**E-mail (Resend):** com `RESEND_API_KEY` + `EMAIL_REMETENTE` e `URL_PUBLICA` (estes dois no `wrangler.toml`) o cadastro passa a exigir a confirmação do e-mail. Sem a chave, o e-mail fica desligado e o cadastro funciona como na 2.9 (sem confirmação). Os links usam sempre `URL_PUBLICA`, nunca o endereço do pedido.

**Perfis, boletos e Pix:** liberados para a conta de demonstração e para os e-mails do segredo `RECURSOS_AVANCADOS` (separados por vírgula): `npx wrangler secret put RECURSOS_AVANCADOS` (e `--env previa`). Fica como segredo para os e-mails não irem para o GitHub. Sem ele, só a demonstração tem esses recursos.

**Transferir transações entre moedas (multicâmbio):** liberado para a demonstração, para os e-mails de `RECURSOS_AVANCADOS` e para os do segredo `RECURSOS_CAMBIO`: `npx wrangler secret put RECURSOS_CAMBIO` (e `--env previa`). Também exige e-mail confirmado.

**Conta de demonstração:** criada pela migração `0003_conta_demo.sql` (login `demo@usezozo.com.br`, senha `zozo1234`). Ninguém consegue recadastrá-la, trocar a senha ou ativar 2FA nela.

### Cloudflare na frente do ZoZo

O modo **"I'm Under Attack"** (ou uma regra de WAF com *Managed Challenge*) desafia **todo** pedido, inclusive as chamadas da API que o próprio site faz. Quando a verificação do navegador vence (padrão: 30 min), as ações passam a ser barradas pelo Cloudflare antes de chegar ao ZoZo — era o "Não foi possível concluir a operação". O ZoZo já tem CAPTCHA, bloqueio progressivo e limites por IP próprios, então o recomendado é:

1. **Desligar o Under Attack** (Cloudflare › usezozo.com.br › Visão geral › *Under Attack Mode* › desligado) e usar só em ataque real; **ou**
2. manter ligado e criar uma exceção para a API: Cloudflare › usezozo.com.br › **Regras › Configuration Rules** › *Create rule* → quando *URI Path* começa com `/api/` → **Security Level: Essentially Off** (ou *Medium*). Assim a página continua protegida e a API não é desafiada.

Se o desafio acontecer mesmo assim, o ZoZo mostra "Verificação de segurança" com o botão **Recarregar página**.

**Backup:** o D1 guarda 30 dias de histórico (*Time Travel*): `npx wrangler d1 time-travel restore zozo --timestamp=<data>` volta o banco a um momento anterior.

## Testar no seu computador

- **Primeira vez:** `npm ci` na pasta `ZoZo` (instala Vite, TypeScript e Tailwind nas versões do `package-lock.json`).
- **Testes:** `cd api; uv run python -m unittest discover -s tests -v` (API + FastAPI) · `npm test` (serviço de dados e host web, com a criptografia) · `npm run typecheck` (TypeScript).
- **E-mail no computador:** `$env:ZOZO_DEV_EMAIL = "console"` antes do `python api/dev/servidor_local.py` liga a confirmação e **mostra os e-mails no terminal** (nada é enviado). `$env:ZOZO_DEV_BANCO` aponta para outro arquivo SQLite (ex.: um banco descartável).
- **Aplicativo completo com a API Python:** `python api/dev/servidor_local.py` (http://127.0.0.1:8787, serve a interface montada por `npm run build`). Para mexer na interface: `npm run dev` → http://127.0.0.1:5173 (recarga instantânea; repassa `/api/*` para o servidor Python). Cadastre uma conta; o CAPTCHA usa as chaves de teste da Cloudflare, que sempre aprovam.
- **Modo demonstração (só interface, dados no navegador):** `npm run dev` e abra http://127.0.0.1:5173/?mock=1. A conta é definida por você:
  1. No VS Code, em `ui/mock/`, copie `credenciais.exemplo.js` para **`credenciais.local.js`** (botão direito › Copiar / Colar e renomeie).
  2. Troque `TROQUE-ESTA-SENHA` pela sua senha (mínimo de 8 caracteres) e salve.
  3. Entre com **insight@usezozo.com.br** e essa senha.

  O `credenciais.local.js` está no `.gitignore` (não vai para o GitHub) e a pasta `mock` nunca é publicada. Se o arquivo tiver erro de digitação, o `npm run dev` avisa e segue sem a conta de prévia.

## Segurança

| Item | Como está |
|---|---|
| Login | E-mail + prova da senha. Mensagem única para e-mail inexistente e senha errada; e-mail sem conta recebe parâmetros simulados (não revela quem tem conta) |
| Cadastro | Com o e-mail ligado: resposta igual para e-mail novo ou já cadastrado; conta pendente até o **primeiro login com o link do e-mail + a senha** (token de 256 bits, banco guarda só o hash, 24 h, uso único, só o mais recente vale); até 3 e-mails por hora por endereço; pendentes somem em 7 dias |
| Senha | Nunca sai do navegador. **Argon2id** (64 MiB, 3 passagens; contas novas e senhas trocadas) ou PBKDF2-SHA256 com 600.000 iterações (contas antigas), sal aleatório → HKDF → chave dos dados + prova da senha. O servidor guarda só o SHA-256 da prova. O navegador recusa parâmetros mais fracos ou desconhecidos vindos do servidor |
| Sessão | Identificador aleatório de 256 bits em cookie `__Host-` `HttpOnly` `Secure` `SameSite=Strict`, sem data de validade (termina ao fechar o navegador); o banco guarda só o SHA-256 dele; novo identificador a cada login e após o 2FA; encerra no "Sair", na troca de senha (outros dispositivos), e **24 h depois do login** (mesmo em uso, sem fechar o navegador) |
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
| Interface | Sem `innerHTML`/`eval`; `ZoZo.dom` descarta atributos `on…` em texto e links `javascript:`; CSP sem scripts/estilos inline (só `challenges.cloudflare.com`, para o CAPTCHA, e `'wasm-unsafe-eval'`, que permite só compilar o WebAssembly do Argon2id); não pode ser exibida em outros sites; HSTS |
| Logs | Eventos de segurança (login, falhas, bloqueios, 2FA, senha, exclusão) com identificadores HMAC — sem e-mail, IP, senha, cookie ou código em texto; cada resposta tem `X-Request-Id` |
| PDF (boleto) | Impressão do navegador ("Salvar como PDF"); montado só com texto (sem HTML dos dados); nome do arquivo sem caracteres inválidos |
| CSV | Gerado no navegador; valores que começam com `= + - @`, tab ou CR são neutralizados (evita fórmulas maliciosas no Excel) |
| Arquivos exportados | **PDF e CSV não são cifrados**: guarde-os em local seguro |
| Erros | Usuário vê só mensagens amigáveis; o servidor nunca devolve detalhes técnicos |

**Senha esquecida = dados irrecuperáveis.** Nem o servidor consegue ler os dados (por isso não existe "esqueci minha senha"). Guarde a senha num gerenciador de senhas.

### Pontos em aberto (documentados, não escondidos)

- **Sem "esqueci minha senha"**: a senha é a chave dos dados. A recuperação depende da migração de chaves v3 (chave de recuperação), planejada em [docs/PLANO-EMAIL.md](docs/PLANO-EMAIL.md).
- **Sem `RESEND_API_KEY`** o e-mail fica desligado: o cadastro volta a não confirmar o e-mail e a dizer "Já existe uma conta com esse e-mail".
- **Contas antigas em PBKDF2** até trocarem a senha (Argon2id só para contas novas e senhas trocadas).
- **Contas anteriores à 2.5** foram marcadas como de e-mail confirmado pela migração 0005 (premissa: eram de pessoas conhecidas). Se isso não valer para alguma conta, corrija com uma migração nova — nunca editando a 0005.
- **Cópia de segurança fora do D1:** o Time Travel (30 dias) e o histórico de versões ficam no mesmo banco; uma cópia independente e testada ainda não existe.
- **Domínio próprio:** `usezozo.com.br` já aponta para o ZoZo; regras de WAF/limite na borda devem deixar `/api/*` sem desafio (veja acima).
- **E-mail confirmado:** recursos de `RECURSOS_AVANCADOS`/`RECURSOS_CAMBIO` exigem o e-mail confirmado — pelo link do e-mail (3.0) ou pelo "Continuar com Google".
- **Recursos por conta só na interface:** Perfis/boletos/Pix são escondidos e recusados no navegador; quem alterar o próprio navegador conseguiria usá-los **nos próprios dados** (o servidor não lê o documento cifrado). Não dá acesso a nada de outra conta.

## Limites

- Cada conta guarda um documento de até ~1,9 MB **já comprimido e cifrado** (limite de linha do D1). Isso corresponde a dezenas de milhares de lançamentos; a foto do perfil ocupa ~100–300 KB. Ao chegar no limite, a gravação é recusada com aviso e nada é perdido.
- Nomes de lançamentos, contas, categorias e perfis: até 50 caracteres (`limiteNome` em `regras.js`).

## Funcionalidades

- **Dashboard:** foto, saudação, Gasto mensal (curva do mês × orçamento), Patrimônio, Top categorias, Próximas transações, Transações recentes.
- **Transações:** agrupadas por mês e dia, ícones R (recorrente), P (parcelado), T (transferência), I (receita) e D (débito), tags de categoria e perfil, pesquisa, filtros, seleção com ações em lote; painel com histórico e edição.
- **Parcelas automáticas** (pelo valor total), **Recorrências** (semanal a anual ou parcelada), **Dividir transação** entre perfis, **Multicâmbio** (Real, Euro, Dólar).
- **Contas e Investimentos**, **Categorias** (com orçamento fixo ou por mês e grupos com valor não atribuído), **Perfis** (com boleto por perfil e Pix — só contas liberadas).
- **Configurações:** orçamento, armazenamento e última gravação; foto, nome, alterar senha, **2FA**, exportar CSV, apagar dados, sair, excluir conta.

## Regras configuráveis (`ui/js/config/regras.js`)

`limiteNome` · `categorias.sinalGastoPorTipo` · `totais` · `recorrencias.pagoSomenteComLancamento` · `boleto.*` · `tiposInvestimento` · `categoriasSugeridas` · `modelosCategoria` · `paleta`.

## Do Figma para o ZoZo

O ZoZo não usa framework: o visual vem de `ui/css/tokens.css` (cores, espaços, raios, sombras), das classes Tailwind dos componentes (`ui/js/components/estrutura.ts` e `pecas.ts`). Para trazer um projeto do Figma:

1. **Conecte o Figma ao Claude Code** (recomendado): no Figma desktop, abra o arquivo › menu **Figma › Preferências › Enable Dev Mode MCP Server**. Depois, num terminal, `claude mcp add --transport http figma-dev-mode http://127.0.0.1:3845/mcp`. Selecione um frame no Figma e peça ao Claude Code: *"atualize o card X do ZoZo conforme o frame selecionado, usando os tokens existentes"*.
2. **Organize o Figma com Variáveis** (cores, espaçamentos, raios, tipografia) com nomes parecidos com os de `tokens.css` (`color-primary`, `space-4`, `radius-large`…). Exporte (Dev Mode › Variables, ou o plugin *Variables to CSS*) e peça para mapear em `tokens.css` — a interface toda muda de uma vez.
3. **Ícones:** exporte como SVG de traço (24×24, stroke) e eles entram em `ui/js/core/icons.js`.
4. **Fontes:** coloque os `.woff2` em `ui/assets/fonts/` (a CSP só permite fontes do próprio site).
5. **Não cole HTML/CSS gerado automaticamente** sem revisão: a CSP bloqueia estilos e scripts inline, e o código precisa usar `ZoZo.dom` (sem `innerHTML`).
6. Teste em `/?mock=1`, depois na prévia, e só então publique.
