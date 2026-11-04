# Auditoria técnica de UI/UX — ZoZo

**Data:** 03/11/2026 · **Versão declarada:** 3.20.0  
**Projeto:** `C:\Users\Lukas\OneDrive\2026\zozo\app`  
**Natureza:** diagnóstico; não foram aplicadas correções ao código funcional.

## 1. Parecer

Tailwind e TypeScript estão efetivamente integrados e funcionam na compilação atual. Não são dependências meramente instaladas: o CSS de produção contém utilitários prefixados, variantes e container queries; os arquivos TypeScript da interface passam na verificação estrita. Os **161 testes da interface/serviço e os 165 testes da API passaram**.

Isso não significa que a experiência esteja integralmente aprovada. Foram identificados defeitos de estado, acessibilidade e navegação que os testes existentes não cobrem. As prioridades são corrigir a invalidação permanente do cache, nomear os interruptores de Investimentos, recuperar indicadores de foco e melhorar o tratamento de foco dos painéis sobrepostos. Há também custos desnecessários de carregamento e uma arquitetura global que limita a segurança dos tipos.

**A avaliação visual e interativa ficou incompleta por bloqueio das ferramentas.** Não é possível afirmar que todas as telas, animações, combinações responsivas e tecnologias assistivas foram aprovadas nesta execução. Este documento registra as etapas executadas e as pendentes, sem substituir evidências ausentes por resultados da auditoria anterior.

## 2. Método, cobertura e limitações

### Etapas executadas

1. Inventário da árvore do projeto, configurações, entradas, estilos, componentes, páginas e testes.
2. Leitura das orientações em `CLAUDE.md` e consulta à auditoria anterior como histórico, sem assumir que seus resultados permanecem válidos.
3. Revisão das configurações de Vite, Tailwind e TypeScript, dos contratos globais e do carregamento de módulos.
4. Inspeção estática dirigida dos fluxos de estado, roteamento, formulários, foco, menus, gráficos, painéis, estilos compartilhados e integração com dados.
5. Busca transversal de supressões de tipos, `any`, coerções, animações, observadores, eventos, classes e atributos de acessibilidade.
6. Execução do typecheck, testes JavaScript/TypeScript, build do aplicativo e build independente do portfólio.
7. Inspeção do CSS gerado e dos tamanhos dos artefatos.
8. Reprodução isolada do defeito de mesclagem de `stale`, utilizando o módulo real de estado pelo carregador de testes.
9. Cálculo de contrastes de tokens relevantes.
10. Execução complementar dos testes da API Python.
11. Tentativas de acesso ao aplicativo local pelo navegador integrado e pelo Chrome.
12. Consolidação de achados, propostas e critérios de aceite neste arquivo.

### Abrangência

O inventário de `ui/` contém **56 arquivos `.ts` (incluindo declarações), 5 CSS, 5 HTML e 12 `.mjs`**, totalizando **23.076 linhas**. Esse número mede o inventário, não uma garantia de revisão humana linha a linha. O typecheck cobre os arquivos TS incluídos no projeto; a inspeção manual concentrou-se nos caminhos de maior impacto e nas referências citadas abaixo. Nenhuma auditoria finita prova ausência de bugs.

| Área | Evidência nesta execução | Limite |
|---|---|---|
| Tailwind/CSS | Configuração, classes, camadas, variantes, CSS compilado e dois builds | Sem comparação de estilos calculados no navegador |
| TypeScript/JS | Configuração, contratos, typecheck e 161 testes | Testes `.mjs` e configuração Vite fora do `include` do typecheck |
| Estado e navegação | Leitura do fluxo e reprodução de `stale` | Sem percurso visual completo |
| Componentes e acessibilidade | DOM construído, nomes, papéis, foco, teclado e contraste dos tokens | Sem nova execução de axe, NVDA ou VoiceOver |
| Animações e fluidez | CSS, requestAnimationFrame, descarte e estratégia de renderização | Sem medição de FPS, INP, LCP ou CPU |
| Responsividade | Breakpoints, container queries, regras de gaveta e overflow | Sem validação em aparelhos reais, zoom e múltiplos navegadores |
| API | 165 testes locais aprovados | Não constitui nova auditoria de segurança integral do backend |
| Impressão e exportação | Regras de impressão e cobertura existente de testes | Sem comparação visual de PDF/PNG nesta execução |

### Bloqueios concretos

- O Vite iniciou em `http://127.0.0.1:5173/`.
- O navegador integrado retornou `net::ERR_CONNECTION_TIMED_OUT` para `127.0.0.1` e `localhost`.
- A ferramenta de controle do Chrome interrompeu o uso por não conseguir determinar a URL atual com confiança suficiente. A inspeção por computador foi encerrada.
- O primeiro comando Python encontrou um alias de execução incompatível; o `uv` encontrou bloqueio de gravação de cache no sandbox. Após execução autorizada fora do sandbox, os 165 testes passaram.
- `git status` falhou no ambiente com `fatal: cannot change to 'C:/Users/Lukas'`. Não foi possível vincular o relatório a um commit nem atestar o estado inicial do checkout. Os resultados correspondem aos arquivos presentes na execução.

## 3. Resultados reproduzíveis

| Comando | Resultado |
|---|---|
| `npm run typecheck` | Aprovado, sem diagnóstico de tipos |
| `npm test` | 161 aprovados; 0 falhas; 0 ignorados; aproximadamente 28,5 s |
| `npm run build` | Aprovado; alerta de chunk acima de 500 kB |
| `npm run build:portfolio` | Aprovado |
| `uv run python -m unittest discover -s tests -v` em `api/` | 165 testes; OK; aproximadamente 11,6 s |
| Reprodução de remoção de `stale` | Defeito confirmado: valor final permanece `true` |

Ambiente observado: Node **26.10.0**, npm **11.19.1**. Dependências declaradas: Tailwind e plugin Vite **4.3.3**, TypeScript **7.0.2**, Vite **8.3.3**. Não foi feita atualização de dependências.

Logs da execução, relativos à raiz `app/`: `audit-tests.log`, `audit-build.log`, `audit-portfolio.log` e `audit-api.log`. O build regenerou os diretórios de saída configurados; não houve publicação.

| Artefato | Tamanho emitido | Gzip informado pelo build |
|---|---:|---:|
| JS principal do aplicativo | 595,02 kB | 182,87 kB |
| CSS do aplicativo | 156,99 kB | 27,58 kB |
| Dados de emojis, chunk `native` | 429,05 kB | 82,21 kB |
| Biblioteca de emojis, chunk `module` | 76,72 kB | 27,52 kB |
| CSS do portfólio | 157,03 kB | 27,58 kB |

Gzip é uma estimativa do build, não uma medição de tráfego real. Os tamanhos de chunks não demonstram, sozinhos, lentidão percebida.

## 4. Achados prioritários

**Prioridade:** P1 = impacto relevante no uso/acessibilidade; P2 = defeito ou melhoria técnica importante; P3 = manutenção/refinamento. “Confirmado no código” não significa “reproduzido visualmente”.

### F01 — A marcação de dados desatualizados nunca é removida pela recarga — P2

**Estado:** confirmado por execução isolada do código real.

**Evidência:** `ui/js/app.ts:41` remove a chave de uma cópia de `stale`; `app.ts:45` entrega essa cópia a `store.set`. Em `ui/js/core/state.ts:60`, o setter mescla o objeto antigo com o novo. Uma chave ausente no novo objeto permanece no antigo.

**Consequência:** depois de uma invalidação, `loadData` continua encontrando `st.stale[key] === true` em `app.ts:32`, mesmo após carregamento bem-sucedido. Navegar novamente executa leituras evitáveis. Dependendo do serviço, isso representa recomputação local, não necessariamente um novo pedido HTTP.

**Reprodução executada:**

```js
const { Z } = carregar(); // ui/tests/carregar.mjs
Z.store.set({ stale: { contas: true } });
const stale = { ...Z.store.get().stale };
delete stale.contas;
Z.store.set({ stale });
console.log(Z.store.get().stale.contas); // true; deveria estar limpa
```

**Correção proposta:** gravar explicitamente `{ stale: { [key]: false } }`, ou criar uma operação de substituição/removal compatível com o contrato de estado. Não alterar globalmente a mesclagem sem verificar seus demais consumidores.

**Aceite:** invalidar → carregar → visitar novamente não deve repetir a leitura enquanto não houver nova invalidação. Acrescentar teste para essa sequência.

### F02 — Interruptores de Investimentos não têm nome acessível — P1

**Estado:** confirmado na construção do DOM.

**Evidência:** `ui/js/pages/investimentos.ts:40` chama `UI.Toggle("")`. `ui/js/components/ui.ts:121` monta o checkbox com `role="switch"` dentro de um label cujo texto também fica vazio. O nome da conta está em um elemento irmão, fora desse label, sem associação por `aria-labelledby`.

O usuário de leitor de tela consegue encontrar interruptores, mas não identificar de forma programática qual conta cada um controla. Além disso, o conteúdo é aberto no menu padrão de `components/menu.ts:81`, com `role="menu"`, embora contenha switches em vez de itens de menu apropriados.

**Correção proposta:** associar cada interruptor ao nome da conta; usar um popover/grupo nomeado para esse formulário ou implementar corretamente itens marcáveis de menu. Ao redesenhar o conteúdo depois da alteração, preservar o foco no mesmo controle: o `mount` em `investimentos.ts:36` substitui os controles existentes.

**Aceite:** cada controle anuncia conta, papel e estado; alteração por Espaço mantém foco; não há erro de estrutura de menu em auditoria automatizada.

### F03 — Campos de nome e valor da transação removem o foco visual — P1

**Estado:** confirmado nas regras; aparência efetiva ainda exige teste no navegador.

**Evidência:** `ui/js/components/pecas.ts:74` define `LP_CAMPO` com borda transparente, `tw:outline-none` e `tw:focus:[box-shadow:none]`. `lpNome` e `lpValor`, em `pecas.ts:394`, usam essa base. Os campos são criados em `ui/js/pages/lancamento-painel.ts:172` e `:187`. Não foi encontrada regra compensatória de foco desses campos no CSS inspecionado.

A camada de utilitários prevalece sobre o outline global de `css/base.css`. Portanto, a existência de um estilo global de foco não protege automaticamente todos os componentes.

**Correção proposta:** adicionar borda/outline perceptível em `focus-visible`, sem deslocar o layout. Rever também campos de pesquisa que suprimem outline, distinguindo os que têm realce no contêiner dos que não têm.

**Aceite:** percorrer nome e valor com Tab/Shift+Tab; a localização do foco precisa ser inequívoca sem depender apenas do cursor de texto.

### F04 — Painel sobreposto não tem ciclo completo de foco — P1

**Estado:** lacuna confirmada no controlador; impacto visual pendente de reprodução.

**Evidência:** `ui/js/components/estrutura.ts:138` transforma o painel em sobreposição e, no celular, em tela cheia. `ui/js/components/detail-panel.ts:40` limpa o conteúdo ao fechar sem guardar/devolver foco ao acionador. A abertura em `:91` só foca elementos com `data-autofocus`. O painel permanece um `aside`; não há isolamento do conteúdo coberto nesse controlador.

**Consequências possíveis:** ao fechar pelo botão interno, o elemento focado é removido; ao tabular no painel de tela cheia, o foco pode chegar ao conteúdo visualmente encoberto. O roteador possui restauração para linhas recriadas, mas isso não implementa o ciclo de foco da gaveta.

**Correção proposta:** guardar o acionador; definir foco inicial apropriado; devolver foco no fechamento; quando a apresentação for modal, isolar o fundo e conter o foco. Preservar a navegação normal no painel fixo de desktop.

**Aceite:** abrir/editar/fechar por teclado em desktop e celular; não perder foco nem focar controles completamente encobertos. Testar também mudança de breakpoint com painel aberto.

### F05 — Contrastes abaixo de AA continuam sendo usados — P1

**Estado:** confirmado por cálculo dos tokens; algumas escolhas estão explicitamente documentadas pelo produto.

| Combinação calculada | Contraste aproximado | Interpretação para texto normal |
|---|---:|---|
| `#7f8ba4` sobre branco | 3,42:1 | Abaixo de 4,5:1 |
| Branco sobre `#ff1a1a` | 3,88:1 | Abaixo de 4,5:1 |
| `#008a33` sobre branco | 4,48:1 | Abaixo de 4,5:1; não arredondar para aprovação |
| `#e51300` sobre branco | 4,75:1 | Passa nessa combinação específica |

**Evidência:** `ui/css/tokens.css:28`, `:38` e `:76`; aplicação em `ui/js/components/pecas.ts:36`, `:100` e `:394`. Fundos translúcidos devem ser compostos antes de calcular contraste; não se deve extrapolar o resultado sobre branco para todos os estados.

**Correção proposta:** revisar cores de texto e fundo com o responsável pelo produto; preservar as cores de marca em usos decorativos quando apropriado. A decisão de aceitar um contraste baixo não transforma o caso em conformidade WCAG. Nenhuma cor foi alterada nesta auditoria.

**Aceite:** verificar combinações reais de texto/fundo em normal, hover, selecionado e erro. Os limites variam para texto grande e elementos não textuais; esta tabela trata texto normal.

### F06 — Navegação de páginas não participa do histórico do navegador — P2

**Estado:** confirmado no roteamento.

**Evidência:** `ui/js/router.ts:84` troca página e estado sem `pushState`, URL de rota ou tratamento de `popstate`. Em `app.ts`, hashes são usados para recuperação, confirmação e Design, não para as páginas principais. O título do documento permanece “ZoZo”; o topbar atualiza apenas seu `h1`.

**Consequência:** Voltar/Avançar não percorre Dashboard → Transações → Contas; atualizar reinicia o fluxo em Dashboard; não há link direto persistente para uma seção. Para usuários de teclado/leitor de tela, também falta uma política explícita de anúncio/foco na mudança de página.

**Correção proposta:** adotar uma estratégia única de rotas por hash ou History API, preservar os fluxos de autenticação existentes, atualizar `document.title` e definir foco/aviso de navegação. Não colocar dados financeiros sensíveis na URL.

**Aceite:** link direto, atualização, Voltar/Avançar e rota sem permissão devem produzir estados previsíveis.

### F07 — Pacote inicial concentra páginas e componentes demais — P2

**Estado:** medido pelo build.

**Evidência:** imports síncronos em `ui/src/main.ts`; chunk principal de 595,02 kB, com alerta do Vite. Páginas, serviço de dados, componentes e assistente entram na mesma cadeia inicial. QR, bibliotecas de emojis, testes e Design já possuem separação em chunks.

**Consequência:** custo de download, parse e execução antes de usar partes do produto. Não foi medido o impacto em dispositivo lento.

**Correção proposta:** medir primeiro a inicialização em CPU/rede limitadas; separar funcionalidades menos usadas por imports dinâmicos e contratos explícitos. A dependência de registro global precisa ser tratada antes de dividir os módulos indiscriminadamente.

**Aceite:** reduzir o trabalho inicial sem alterar ordem de inicialização; validar primeiro acesso a cada página e erros de carregamento de chunk. Não apenas aumentar o limite que emite o alerta.

### F08 — Portfólio público recebe praticamente todo o CSS do aplicativo — P2

**Estado:** confirmado no build e na configuração.

**Evidência:** `ui/portfolio.html:11` importa `src/estilos.css`; essa entrada inclui estilos globais e fontes de classes de toda a interface. O CSS do portfólio ficou em 157,03 kB, praticamente igual aos 156,99 kB do aplicativo.

As declarações `@source` não desativam por si só a detecção automática. A ausência de `portfolio.html` na lista explícita não prova ausência de seus estilos: o build atual os detecta. O comentário “só os arquivos da interface” é mais restritivo que o mecanismo realmente configurado.

**Correção proposta:** entrada de CSS própria para páginas públicas/portfólio, com tokens e base necessários e escopo explícito de fontes. Conferir também se todas as quatro fontes emitidas são necessárias em cada entrada.

**Aceite:** páginas públicas devem manter o visual e imprimir corretamente, com redução mensurável de CSS não utilizado. Cuidado para não excluir `emoji-picker.ts` ou classes de módulos carregados sob demanda ao restringir as fontes do aplicativo.

### F09 — Tipagem dos mapas de estilos permite propriedades inexistentes — P2

**Estado:** confirmado no contrato.

**Evidência:** `ui/src/globais.d.ts:784` e `:786` declaram `estrutura` e `pecas` como `Readonly<Record<string, string>>`. Qualquer nome de propriedade é aceito pelo compilador. O projeto não habilita `noUncheckedIndexedAccess`.

**Consequência:** um erro como `ZoZo.pecas.nomeDigitadoErrado` pode passar no typecheck e resultar em classe ausente em execução. TypeScript estrito não torna automaticamente preciso um dicionário aberto.

**Correção proposta:** inferir/exportar o tipo literal dos objetos ou usar um contrato de chaves fechado. Avaliar `noUncheckedIndexedAccess` incrementalmente, sem transformar seus erros em coerções generalizadas.

**Aceite:** uma propriedade de estilo inexistente precisa falhar em compilação; propriedades válidas continuam interoperando com os consumidores.

### F10 — Arquitetura global mantém dependência implícita de ordem — P2

**Estado:** dívida arquitetural confirmada, não falha imediata de inicialização.

**Evidência:** `ui/src/main.ts:3` documenta a ordem dos imports; módulos registram APIs em `window.ZoZo`; `core/dom.ts` inicializa o namespace mediante coerção para `ZoZoGlobal` antes de todas as propriedades existirem.

**Consequência:** os tipos descrevem um objeto completo, mas a inicialização passa por estados incompletos. Mover um import pode quebrar o runtime sem violar o contrato estático. Isso dificulta isolamento de testes, remoção de código e carregamento sob demanda.

**Correção proposta:** migrar gradualmente APIs para exports/imports explícitos; começar por módulos puros e por objetos de estilos. Manter adaptador global durante a transição se necessário. Não é preciso adotar um framework para resolver esse problema.

**Aceite:** dependências passam a ser expressas por import; módulos podem ser testados sem montar um namespace global completo.

### F11 — Falta uma suíte atual de regressão em navegador real — P2

**Estado:** confirmado nos scripts e na organização dos testes.

Os testes `.mjs` exercitam serviço, host e alguns componentes com simulações de DOM. São úteis e passaram, mas não validam CSS calculado, geometria, composição de foco entre sobreposições, acessibilidade da árvore completa nem incompatibilidades de navegador.

**Evidência:** `package.json`, `ui/tests/carregar.mjs`, `ui/tests/router.test.mjs` e `ui/tests/inline.test.mjs`. O projeto não declara um comando de lint nem uma suíte E2E visual nessas configurações.

**Correção proposta:** acrescentar uma suíte pequena de jornadas críticas em navegador real, com verificação de acessibilidade e estados responsivos. Priorizar os defeitos deste relatório, em vez de reproduzir cada detalhe da implementação.

**Aceite:** detectar regressões de nome de switch, foco de painel, navegação, erros de console e overflow nas larguras suportadas.

### F12 — Animações de gráficos não possuem cancelamento explícito — P3

**Estado:** confirmado no código; impacto de desempenho não medido.

**Evidência:** `ui/js/components/charts.ts:31` agenda frames sem guardar um identificador para cancelamento. O `destroy` do gráfico de linha desconecta o ResizeObserver, mas não cancela a animação. Não foi encontrado consumo de `destroy()` nas páginas e no roteador pesquisados; há tentativa interna de desconexão quando o elemento deixa de estar conectado.

**Consequência:** trocar rapidamente de tela pode manter trabalho por frames sobre elementos removidos até terminar a animação. Isso é trabalho residual limitado pela duração; não foi demonstrado um vazamento permanente de memória.

**Correção proposta:** ter um descarte explícito por página/componente, cancelar frames pendentes e observadores. Testar abandono de tela durante a animação e mudança de preferência de movimento.

**Aceite:** nenhum frame continua atualizando um gráfico descartado; heap e número de observadores estabilizam após navegação repetida.

### F13 — Rótulos auxiliares e erros têm associação incompleta com campos — P2

**Estado:** confirmado nas APIs compartilhadas.

**Evidência:** `ui/js/components/ui.ts:57` monta `hint` sem associá-lo com `aria-describedby`. Em `components/forms.ts:132`, campos recebem `aria-invalid` e a mensagem vai a um alerta geral, mas não há ligação individual com esse erro. O controle de seleção em `forms.ts:34` devolve `foco`, mas não `input`, propriedade usada para marcar os inválidos.

**Consequência:** nem todos os controles recebem o mesmo feedback programático; ao retornar a um campo, sua dica/erro pode não ser anunciado. O alerta geral já fornece parte do feedback e não deve ser ignorado na avaliação.

**Correção proposta:** associar dicas e erros por IDs, identificar controles inválidos de forma uniforme e manter foco no primeiro erro relevante.

**Aceite:** testar input, select, controle composto e campos condicionais; cada controle anuncia nome, estado inválido e instrução pertinente.

### F14 — Documentação e padrões visuais contêm resíduos de migração — P3

**Estado:** confirmado por inspeção.

- `ui/src/globais.d.ts:6`, `:33` e `:505` ainda descrevem módulos JS ou itens como `any` que já foram migrados.
- `ui/js/components/list.ts:6` descreve o serviço como ainda em JS.
- `ui/src/estilos.css` e `ui/index.html` contêm referências antigas a arquivos `.js`.
- `ui/css/base.css` comenta “algarismos tabulares”, mas `.money` define `proportional-nums`. Se o objetivo é comparar valores em coluna, a especificação e a implementação precisam concordar.
- `tokens.css` diz que os demais arquivos usam apenas tokens, embora componentes como `components/zo.ts` e páginas públicas tenham diversas cores e medidas literais. Há centralização parcial, não exclusiva.
- `api/pyproject.toml` declara 3.18.0 enquanto o aplicativo declara 3.20.0. Pode representar versionamento independente; precisa estar documentado antes de ser tratado como erro de versão.

**Correção proposta:** atualizar comentários e explicitar exceções de design/versionamento. Consolidar valores recorrentes quando representam a mesma decisão visual; não transformar cada medida única em token.

**Aceite:** documentação descreve a arquitetura atual; tokens e componentes têm responsabilidades claras; tipografia numérica corresponde à intenção aprovada.

## 5. Tailwind: funcionamento e aplicabilidade

**Parecer:** adequado ao projeto e funcional, com oportunidades de reduzir acoplamento e CSS compartilhado em excesso.

- Plugin `@tailwindcss/vite` está registrado em `vite.config.ts`.
- `ui/src/main.ts` importa a entrada de estilos.
- `ui/src/estilos.css` importa tema e utilitários separadamente, aplica prefixo `tw` e omite Preflight deliberadamente.
- A ordem declarada é `legado, theme, base, components, utilities`; `@theme inline` conecta utilitários aos tokens do projeto.
- A variante `base` usa `:where`, reduzindo a especificidade dos estilos-base dos componentes.
- As variantes de viewport e container queries estão definidas e aparecem no CSS compilado.
- Foram confirmados no artefato seletores prefixados de flex, variantes `base`, container queries e regras de movimento reduzido.
- As concatenações examinadas combinam classes completas. Concatenar strings completas não é, por si só, um defeito de detecção do Tailwind.

**Integração com CSS:** manter tokens, reset, impressão e algumas animações em CSS é uma escolha válida. A camada chamada `legado` não deve ser apagada apenas pelo nome. Há dependências funcionais em foco, fontes, estados globais e impressão. Regras importantes de impressão e movimento precisam prevalecer sobre utilitários; o uso localizado de `!important` tem motivo técnico.

**Riscos reais:** utilitários podem neutralizar foco global (F03); estilos de todo o produto entram nas páginas públicas (F08); mapas amplos e centenas de classes em strings dificultam revisão de divergências (F09/F14). Classes sem prefixo também funcionam como ganchos de JS, variantes e impressão; não são prova de CSS morto.

## 6. TypeScript e integração com JavaScript

**Parecer:** adoção real e útil, ainda com contratos excessivamente abertos em algumas fronteiras.

- `strict`, `noUnusedLocals`, `noUnusedParameters`, `isolatedModules`, `erasableSyntaxOnly` e `noFallthroughCasesInSwitch` estão habilitados.
- `allowJs: false` é coerente com a interface inteiramente migrada a TS. Os arquivos continuam na pasta `js/`, mas a extensão é `.ts`.
- O Vite gera JavaScript executável; os testes removem tipos com `stripTypeScriptTypes` e executam módulos em contexto isolado. Os dois caminhos funcionaram nesta execução.
- Respostas de ações e documentos possuem contratos em `dados.d.ts`; isso reduz erros entre serviço e telas.
- Há `any` deliberado em dados brutos e dados de demonstração. Não foram encontrados `@ts-ignore`/`@ts-nocheck` na busca realizada. A existência de `any` em fronteira bruta não é automaticamente um defeito; precisa haver validação antes do uso.
- `vite.config.ts`, scripts e testes `.mjs` não fazem parte do `include` do typecheck atual. Recomenda-se configuração separada para ferramentas e, se útil, `checkJs` para os testes.
- `npm run build` não encadeia o typecheck. **O script de publicação do aplicativo já executa testes e typecheck**, portanto não é correto afirmar que a publicação oficial ignora a verificação de tipos.
- Coerções para contratos globais e dicionários abertos permanecem os pontos fracos principais (F09/F10). Tipos não validam JSON remoto automaticamente.

## 7. Animações, fluidez e aplicabilidade

Há uma linguagem de movimento consistente no código: entradas curtas com opacidade/transformação, durações globais de 160/280 ms, escalonamento de blocos e gráficos de aproximadamente 900 ms. O roteador tenta continuar animações em curso e evita redesenhos quando suas dependências não mudam.

Pontos positivos:

- Movimento reduzido tratado em CSS e no código dos gráficos.
- Conversão correta de duração CSS de segundos ou milissegundos nos gráficos.
- Atualização localizada de linhas de Transações por `depsLinhas` e `atualizarLinhas`.
- `content-visibility: auto` para grupos de meses, com tamanho intrínseco estimado.
- Conteúdo idêntico mantém identidade de objetos em `loadData`, reduzindo redesenhos.
- Emojis e QR code usam chunks separados; o seletor de emojis é preparado após autenticação em tempo ocioso.

Pontos a medir/melhorar:

- F01 mantém leituras desnecessárias depois de invalidações.
- F07 concentra trabalho no pacote inicial.
- Preparar emojis em tempo ocioso melhora a primeira abertura, mas ainda implica baixar/processar dados mesmo para quem não abrir o seletor. É um trade-off, não um bug automático.
- O shimmer anima `background-position`, e algumas transições animam padding/colunas de grid. Podem exigir pintura/layout; não devem ser chamadas de “aceleradas por GPU” sem medição.
- O cancelamento de animações não é completo (F12).
- `JSON.stringify` de coleções inteiras para comparar dados pode ficar caro em volumes altos; não houve benchmark atual para quantificar esse custo.

**Aplicabilidade:** Tailwind, TS e DOM direto atendem à aplicação financeira atual. O principal problema não é a ausência de React/Vue, mas a falta de contratos explícitos de dependência, ciclo de vida e foco. Uma reescrita integral não é justificada pelas evidências desta auditoria.

## 8. Acessibilidade e navegação: aspectos positivos e pendências

Foram encontrados idioma `pt-BR`, títulos e landmarks, controles nativos, nomes em botões de ícone, alertas/status, esqueletos com estado de carregamento, foco global, teclado em menus/calendário e isolamento do fundo nos modais compartilhados. O gerenciamento de modais empilhados guarda foco e usa `inert`, abordagem mais completa que a do painel lateral.

**Atualização em relação à auditoria antiga:** gráficos de linha e barras agora implementam navegação por setas, Home/End e anúncio dos pontos em `components/charts.ts:83`. Portanto, a pendência antiga “valores apenas no mouse” não deve ser repetida como se esse suporte ainda estivesse ausente. Toque e comportamento real com leitores de tela continuam pendentes de verificação.

As páginas públicas têm mecanismos como “Pular para o conteúdo”. Não foi encontrado equivalente no shell principal inspecionado; sua inclusão ajudaria a evitar percorrer repetidamente a navegação. A ausência de um link específico, isoladamente, não comprova violação se houver outros mecanismos adequados; o percurso real precisa ser avaliado.

Não se deve declarar conformidade WCAG integral enquanto F02–F05 e a validação de navegador estiverem pendentes. A auditoria antiga também não serve como certificação da versão atual.

## 9. Redundâncias, legado e organização

| Elemento | Avaliação | Ação recomendada |
|---|---|---|
| `window.ZoZo` e IIFEs | Legado arquitetural ainda funcional | Migração gradual para módulos explícitos |
| CSS em `legado` | Ainda tem responsabilidades ativas | Preservar; revisar por uso real |
| Classes sem `tw:` | Muitas são ganchos necessários | Não excluir sem rastrear consumidores |
| `pecas.ts` e `estrutura.ts` | Reuso útil, contratos abertos e arquivos extensos | Tipar chaves; dividir por domínio quando melhorar legibilidade |
| Formulários em painel, modal e inline | Há diferenças legítimas de interação | Unificar validação, feedback e ciclo de foco; evitar fusão indiscriminada |
| `servico.ts`, `perfil.ts`, `host-web.ts` | Módulos extensos com várias responsabilidades | Extrair partes coesas mantendo testes e contratos |
| Migrações e compatibilidade de dados | Não são automaticamente código morto | Manter enquanto houver documentos/contas compatíveis a suportar |
| Documentação de migração | Parte está desatualizada | Corrigir F14 |

Não foi demonstrada duplicação de código suficiente para recomendar exclusão de módulos. Não houve análise de cobertura runtime para declarar seletores ou funções inteiras sem uso.

## 10. Plano de correção e validação

| Ordem | Trabalho | Critério de conclusão |
|---|---|---|
| 1 | F01: limpar `stale` corretamente | Teste de invalidar/carregar/reutilizar aprovado |
| 2 | F02: nome e semântica dos switches | Nome por conta, papel correto, foco preservado |
| 3 | F03/F04: foco visual e ciclo de painéis | Teclado completo em desktop e celular |
| 4 | F05: revisão de contraste com produto | Combinações de texto relevantes atingem seus limites |
| 5 | F06: navegação integrada ao navegador | Voltar, Avançar, refresh e link direto coerentes |
| 6 | F11: regressão em navegador | Jornadas críticas automatizadas e acessibilidade conferida |
| 7 | F08/F07: CSS público e carregamento inicial | Ganho medido sem regressão visual/funcional |
| 8 | F09/F10: contratos e módulos | Erros de chave/dependência capturados pelo compilador |
| 9 | F12–F14: ciclo de vida, feedback e documentação | Descarte correto e documentação consistente |

### Roteiro visual ainda necessário

1. Login, cadastro, recuperação, erros, 2FA e sessão expirada em ambiente local descartável.
2. Dashboard, Transações, Contas, Categorias, Recorrências, Investimentos e Perfis: vazio, carregando, sucesso, erro e repetição da leitura.
3. Painel de cada tipo de lançamento; criar/editar/cancelar; teclado do início ao fim.
4. Modais empilhados, menus, calendário, emoji picker e assistente; foco inicial, Esc, Tab e retorno ao acionador.
5. Fatura: filtros, estado de carregamento, exportação PNG, impressão A4 e conteúdo longo.
6. Viewports de 320, 375, 768 e 1280 px; alturas baixas; zoom de 200%/400%; espaçamento de texto; textos e valores extensos.
7. Movimento reduzido e navegação rápida; verificar se existem elementos temporariamente invisíveis/focáveis.
8. Chromium, Firefox e Safari; toque real e pelo menos um leitor de tela de desktop e um móvel.
9. Medir carregamento, long tasks, resposta a filtros/seleção e heap com conjuntos de dados grandes. Comparar antes/depois com o mesmo cenário e equipamento.

Essas etapas permanecem **pendentes**, e não “aprovadas por inspeção estática”.

## 11. Referências

- [Tailwind — Preflight e imports separados](https://tailwindcss.com/docs/preflight): base para avaliar a integração sem reset automático.
- [Tailwind — detecção de classes](https://tailwindcss.com/docs/detecting-classes-in-source-files): classes completas e escopo de fontes.
- [Tailwind — funções e diretivas](https://tailwindcss.com/docs/functions-and-directives): `@theme`, `@source` e variantes.
- [TypeScript — strict](https://www.typescriptlang.org/tsconfig/strict): alcance da configuração estrita.
- [WCAG 2.2](https://www.w3.org/TR/WCAG22/): referência para teclado, nome/papel/valor e foco.
- [W3C — contraste mínimo](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html): texto normal requer 4,5:1, com exceções e critérios próprios para texto grande.

As referências externas fundamentam os critérios; os resultados do ZoZo vêm dos arquivos e comandos descritos neste relatório.
