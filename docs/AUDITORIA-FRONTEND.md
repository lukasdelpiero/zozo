# Auditoria do frontend — 27/10/2026

Escopo: interface do ZoZo (`ui/`), a partir do commit `62a6b75` (ramo `correcao-login-e-seguranca`), versão 3.18.0.
Vite 8.3.3 · TypeScript 7.0.2 · Tailwind CSS 4.3.3 (prefixo `tw:`, sem preflight) · sem framework (DOM via `ZoZo.dom`).

## Referências de design consultadas

- `ui/css/tokens.css` (cores, espaçamentos, raios, sombras, movimento, tipografia) e `ui/src/estilos.css` (tema e variantes do Tailwind).
- Regras do `CLAUDE.md` (acessibilidade, exceções de cor escolhidas pelo produto, padrões de componentes).
- Histórico do `LEIA-ME.md`.
- **Não há** Figma, telas aprovadas nem guia visual separado: onde faltou especificação, o padrão já existente no código foi a referência (marcado como inferência).
- **Conflito documentado:** o LEIA-ME (versões antigas) diz que as cores pedidas foram trocadas por tons que passam em contraste; o `CLAUDE.md` atual registra que o produto escolheu manter #7f8ba4, #e51300, #008a33 e #ff1a1a/#e40c0c abaixo de 4,5:1. Vale o `CLAUDE.md` (decisão mais recente). Essas cores foram tratadas como exceção, não como defeito.
- Não há tema escuro: o tema claro é o único verificado.

## Como foi verificado

- Navegador: painel do Claude (Chromium), servidor local `api/dev/servidor_local.py` (banco descartável, sem CAPTCHA), conta de demonstração (Modo teste) e uma conta local de teste.
- Larguras emuladas: 1280×800, 768×1024, 375×812, 320×640 (e 260 px, abaixo do mínimo da WCAG, só para observação). **Emulação, não aparelho real.**
- axe-core 4.10.3 (regras WCAG 2.0/2.1/2.2 A e AA + boas práticas), carregado só durante o teste, com as animações desligadas (o painel oculto congela as animações no início e falseava o contraste).
- Teclado: foco inicial, Tab preso e Esc nas janelas; setas e Esc nos menus; foco na gaveta do celular; foco após abrir itens das listas.
- Desempenho: 1.000 transações sintéticas criadas na demonstração (só na memória da aba); tempos medidos com layout forçado (mesmo método antes e depois). **Laboratório, sem limitação de CPU ou rede; não são dados de usuários reais.**
- **Sem leitor de tela** (NVDA/VoiceOver não disponíveis): papéis, nomes e estados foram conferidos pela árvore de acessibilidade e pelo axe.
- Capturas de tela: o painel do navegador estava reduzido (260 px), então as capturas saíram pequenas; as evidências são medições de geometria (sobreposição, transbordamento, áreas de toque) feitas na página.

## Matriz de cobertura

| Área | Ações e estados | Larguras | Resultado |
|---|---|---|---|
| Entrada (início, e-mail, senha, cadastro, 2FA, verificação, recuperação, link inválido, nova senha) | 14 etapas pelo Modo teste; autocomplete; colar código 2FA | 1280 | Verificado — sem violações |
| Dashboard | cards, gráficos, períodos | 1280 · 768 · 375 · 320 | Verificado |
| Transações | lista, abrir item, caixas, barra de seleção, pesquisa, 1.000+ itens | 1280 · 768 · 375 · 320 | Verificado — 3 achados corrigidos |
| Painel da transação | todos os tipos (despesa, receita, estorno, débito, transferência, recorrente, parcelada, dividida) | 1280 · 375 · 320 | Verificado — 2 achados corrigidos |
| Contas, Investimentos, Categorias, Recorrências, Perfis | lista + painel do primeiro item; painéis por tipo de conta | 1280 · 768 · 375 · 320 | Verificado — 1 achado corrigido (Perfil) |
| Janelas (≈40: novas contas, pagar fatura, recorrência, divisão, câmbio, configurações, 2FA, exclusões, proteção avançada…) | abrir pelo Modo teste + axe | 1280 | Verificado — 1 achado corrigido (câmbio) |
| Janelas: comportamento | foco inicial, Tab preso, fundo inerte, Esc, foco devolvido | 1280 | Verificado (Configurações) |
| Menus flutuantes | papel, setas, Esc, foco devolvido, aria-expanded | 1280 | Verificado — 1 achado corrigido (perfis) |
| Gaveta do menu (celular) | fechada/aberta, Esc, fundo | 375 · 320 | Verificado — 1 achado corrigido |
| Fatura (boleto) | editor, prévia, títulos | 1280 | Verificado — 2 achados corrigidos |
| Avisos (toasts) | sucesso importante após apagar dados / trocar senha | 1280 | Verificado |
| Páginas públicas (/sobre, /politica-privacidade, /termos-uso) | título, idioma, títulos, axe (cópia do HTML com o mesmo CSS — a CSP das páginas bloqueia scripts) | 1280 | Parcialmente verificado |
| Formulários | máscara de valor (digitar, colar, negativo), teclados virtuais, erros, envio duplo | 1280 | Verificado no código e no navegador |
| Números do Dashboard | gasto do mês × soma das transações; total × reservado | — | Verificado (confere) |
| Datas | "hoje" local, não UTC | — | Verificado no código |
| Movimento reduzido | CSS global, gráficos, grupos | — | Verificado no código |
| Tema escuro | — | — | Não aplicável (não existe) |
| Zoom 200 %, espaçamento de texto (1.4.12), toque real, Safari/Firefox | — | — | **Não verificado** |
| Vazamento de memória (heap) | — | — | Não verificado (só revisão de código: listeners globais criados uma vez; observadores dos gráficos desconectam) |

## Achados e correções (por prioridade)

### Alta

1. **Transações travavam com muitos itens** (desempenho, INP). Com ~1.075 transações, cada clique redesenhava as 24 mil peças da lista.
   - Causa: a página dependia de `selectedItem` e `ui.selecionados`; qualquer seleção redesenhava tudo; e o navegador calculava estilo e layout de todos os meses, mesmo fora da tela.
   - Correção: o roteador aceita `depsLinhas` + `atualizarLinhas` (só as linhas afetadas são trocadas no lugar) — `ui/js/router.ts:36`, `ui/js/pages/lancamentos.ts:519`; cada mês com `content-visibility: auto` — `ui/js/pages/lancamentos.ts:59` (com a mesma folga lateral das linhas, para não recortar o realce).
   - Medição (mesmo método antes/depois, ~1.075 itens): abrir transação 175 → 29 ms; marcar caixa 775 → 40 ms; abrir a página 695 → 141 ms; pesquisa 884 → 195 ms. Geometria conferida: nenhuma linha passa da seção; datas continuam presas no topo ao rolar.
2. **Foco perdido ao abrir uma transação pelo teclado** (WCAG 2.4.3). A linha era recriada e o foco caía no `<body>`; o Tab recomeçava do topo.
   - Correção: o roteador reencontra o elemento focado por `data-fk` ou, nas linhas, por `data-id` — `ui/js/router.ts:14`; na troca no lugar, o foco vai para a linha/caixa nova.
3. **Menu do celular fechado continuava focável** (WCAG 2.4.3/2.4.7). 25 controles invisíveis no Tab e no leitor de tela.
   - Correção: gaveta fechada fica `visibility: hidden` depois da animação de saída — `ui/js/components/estrutura.ts:52`; ao abrir, o foco entra nela; ao fechar (Esc, fundo, escolher item), volta ao botão do menu — `ui/js/app.ts:404`. Computador (menu aberto/recolhido) conferido sem mudança.

### Média

4. **Prévia da fatura rolável só com mouse** (axe `scrollable-region-focusable`, WCAG 2.1.1). Correção: região focável com nome "Prévia da fatura" — `ui/js/pages/boleto.ts:476`.
5. **Cabeçalho do painel sobreposto em 320 px** (WCAG 1.4.10). "Regular" cobria o botão "Editar divisão" em 44 px. Correção: rótulo curto "Divisão" no celular e, abaixo de 361 px, só o ícone (nome acessível e dica com o texto inteiro) — `ui/js/pages/lancamento-painel.ts:473`, `ui/js/components/detail-panel.ts:67`. 320, 375 e 1280 px conferidos.
6. **Pílula "R$ X dividido em N partes" passava da borda em 320 px.** Correção: o texto encolhe com "…" e fica inteiro no `title` — `ui/js/pages/lancamento-painel.ts:423`.
7. **Itens do menu de perfis sem papel de item** (axe `aria-required-children`, crítico). Correção: `menuitemradio` + `aria-checked`, como no menu de contas — `ui/js/components/menu.ts:247`.
8. **Aviso laranja do câmbio e da demonstração com contraste 2,7:1** (WCAG 1.4.3). O laranja `--color-alerta` não está entre as exceções escolhidas pelo produto. Correção mínima: o texto usa o token já existente `--color-warning-text` (5,6:1); ícone e fundo continuam laranja — `ui/js/components/cambio.ts:41`, `ui/js/components/estrutura.ts:75`.
9. **Ponto de cor do perfil com 14×14 px** (WCAG 2.5.8). Correção: área de toque de 24 px com `::before` invisível, sem mudar o desenho; 3 px a mais à direita para não invadir o campo do nome — `ui/js/components/pecas.ts:373`. O axe continua acusando (ele mede só a caixa do elemento); a área real foi conferida com `elementFromPoint` (4 px fora do ponto acerta o botão; a borda do campo continua sendo do campo).

### Baixa

10. **Título vazio no painel sem item aberto** (axe `empty-heading`). Correção: o `h2` fica oculto enquanto o painel está vazio — `ui/js/components/detail-panel.ts:30`.
11. **Títulos da fatura pulavam do `h1` para `h3`** (axe `heading-order`). Correção: seções do editor em `h2` (mesmo visual, estilo por classe) — `ui/js/pages/boleto.ts:447`.
12. **Esqueleto de carregamento com `aria-label` numa `div` sem papel** (axe `aria-prohibited-attr`). Correção: `role="status"` — `ui/js/components/ui.ts:346`.

### Corrigidos antes desta auditoria, no mesmo ramo

- Janela de confirmação continuava aberta depois de sair (43a8cf2). Aviso de "dados apagados" e "senha alterada" não aparecia (2959a28).

## Testes de regressão

- `ui/tests/router.test.mjs` (7 testes, DOM mínimo simulado, sem biblioteca nova): troca no lugar quando só a seleção muda; redesenho quando os dados mudam ou a página não consegue trocar no lugar; foco devolvido por `data-id` e por `data-fk`. Rodados contra o `router.ts` antigo: 4 de 7 falham; no novo, 7 de 7 passam.
- As correções visuais e de ARIA não têm teste automatizado (o projeto não tem testes de DOM); foram verificadas no navegador como descrito acima.

## Comandos executados

- `npm run typecheck` — sem erros.
- `npm test` — 117 de 117 (110 antigos + 7 novos).
- `npm run build` — ok (pacote principal 486 kB, 148 kB comprimido).
- O projeto não tem lint configurado.

## Achados não corrigidos (pendências)

| Item | Tipo | Motivo / quem decide |
|---|---|---|
| Valores ponto a ponto dos gráficos só no tooltip do mouse (sem teclado/toque nem tabela) | Acessibilidade (WCAG 1.1.1 parcial) | Os totais estão em texto ao lado; uma tabela ou navegação por teclado no gráfico é decisão de produto |
| Seletor de emojis (emoji-mart): atributos ARIA inválidos e área rolável sem foco | Biblioteca de terceiros (shadow DOM) | Exigiria corrigir/substituir a biblioteca |
| Dados dos emojis (~110 kB comprimidos) baixados logo após entrar | Desempenho | Escolha documentada no código: o seletor é criado no tempo ocioso para abrir na hora |
| Mensagens de erro de formulário com `role="alert"`, sem `aria-describedby` no campo | Melhoria opcional | Atende WCAG 3.3.1; a associação é boa prática |
| Colar "1,234.56" (padrão americano com vírgula de milhar) esvazia o campo de valor | Melhoria opcional | Formatos brasileiros e "1234.56" funcionam |
| Abrir a página Transações com milhares de itens ainda custa ~140 ms de JavaScript | Desempenho (residual) | Paginação ou virtualização mudam a experiência: decisão de produto |
| 404 no console ao abrir conta nova (`GET /api/documento` sem documento) | Ruído | Comportamento da API; inofensivo |
| Zoom 200 %, espaçamento de texto (WCAG 1.4.12), aparelhos reais, Safari e Firefox | Não verificado | Exige ambiente/dispositivos que não estavam disponíveis |

## Riscos residuais

- `content-visibility: auto` nos meses: o tamanho estimado (900 px) faz a barra de rolagem se ajustar enquanto se rola por meses ainda não desenhados (o navegador lembra o tamanho real depois). A busca da página (Ctrl+F) e o leitor de tela continuam encontrando o conteúdo.
- A troca de linhas no lugar vale só para Transações (a lista que cresce sem limite). As outras listas continuam redesenhando inteiras; com volumes típicos (dezenas de itens) o custo medido é baixo.
- Nada disso foi publicado. Antes de produção: publicar na prévia e repetir os fluxos de Transações (abrir, marcar, pesquisar, painel) num celular real.
