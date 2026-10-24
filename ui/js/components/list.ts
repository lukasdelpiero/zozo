/* =============================================================
   ZoZo — Linhas de lista
   LaunchRow · AccountRow · CategoryRow · CategoryGroupRow
   RecurrenceRow · AllocationRow · SidebarAccountGroup
   TypeScript: as opções de cada linha estão tipadas abaixo; os itens (lançamento, conta…) vêm do
   documento do usuário (serviço de dados, ainda em JS) e ficam como `any` até ele ser convertido.
   ============================================================= */
(function (ZoZo: ZoZoGlobal) {
  "use strict";
  const { h } = ZoZo.dom;
  const { icon } = ZoZo.icons;
  const F = ZoZo.format;
  const UI = ZoZo.ui;

  /** Opções comuns das linhas clicáveis */
  type OpcoesLinha = { onClick?: () => void; selected?: boolean; class?: string };
  type Destacar = (texto: string) => Array<string | { marca: string }>;
  const MARCAS: Record<string, string> = { P: "Parcelado", R: "Recorrente", T: "Transferência", I: "Receita", D: "Débito" };

  const SUBTITULO_CONTA: Record<string, string> = { corrente: "Corrente", poupanca: "Poupança", investimento: "Investimento", emprestimo: "Empréstimo" };

  /** Nome + 4 últimos dígitos (mais claro) */
  function nomeComDigitos(nome: string, digitos?: string | null, cls?: string): HTMLElement {
    const P = ZoZo.pecas;
    return h("span", { class: [P.nomeDigitos, cls] },
      h("span", { class: P.nomeDigitosNome }, nome || ""),
      digitos ? h("span", { class: P.nomeDigitosDigitos }, digitos) : null);
  }

  /* ---------- Lançamento (seção 15) ----------
     [☐] [R|P] Descrição  conta 1234 ........ [CATEGORIA] [PERFIL]  R$ 0,00
     Visual em Tailwind (tw:). Duas variantes: "pagina" (Transações: de ponta a ponta, com caixa de
     seleção, letra do tipo e conta) e "resumo" (Dashboard: com a data, sem caixa, letra e conta).
     As colunas saem conforme a largura da ÁREA (tw:area620 etc.: container queries), não da tela.
     A caixa de seleção NÃO fica dentro do <button> da linha (controle dentro de controle é HTML
     inválido e some para leitores de tela): ela vem antes, sobreposta à 1ª coluna, que fica vazia.
     Espaços: a 1ª coluna (12 px) + o vão (12 px) põem o conteúdo 8 px depois da caixa (16 px); dentro
     da descrição, letra, nome, parcela e conta ficam a 6 px (o mesmo vão entre a conta e os dígitos).
     launch-row e launch-row__* são só ganchos (JS/testes), sem CSS. */
  const NUMEROS = "tw:[font-variant-numeric:lining-nums_proportional-nums]";
  const LR = {
    base: "tw:group/linha tw:grid tw:items-center tw:min-h-(--row-height) tw:py-0 tw:[border:0] tw:text-inherit tw:text-left tw:text-[15px] "
      + "tw:focus-visible:outline-offset-[-2px]",
    interativa: "tw:[transition:background_var(--duration-fast)_var(--easing),box-shadow_var(--duration-fast)_var(--easing)]",
    pagina: {
      linha: "tw:w-auto tw:-mx-(--page-gutter) tw:px-(--page-gutter) tw:gap-3 tw:rounded-none",
      // categoria e perfil do tamanho da pílula, encostados à direita (perfil junto do valor, categoria junto do perfil):
      // nada de coluna com largura mínima, que abria um vão entre as duas pílulas
      grade: "tw:grid-cols-[12px_minmax(0,1fr)_minmax(0,max-content)_minmax(0,max-content)_112px] "
        + "tw:area620:grid-cols-[12px_minmax(0,1fr)_minmax(0,max-content)_96px] tw:area420:grid-cols-[12px_minmax(0,1fr)_96px]",
      gradeSemPerfil: "tw:grid-cols-[12px_minmax(0,1fr)_minmax(0,max-content)_112px] tw:area620:grid-cols-[12px_minmax(0,1fr)_96px]",
      data: "tw:min-w-[46px] tw:text-[13px] tw:text-zz-secondary",
      categoria: "tw:overflow-hidden tw:max-w-[180px] tw:area620:hidden",
      perfil: "tw:max-w-[180px] tw:area620:max-w-[110px] tw:area420:hidden",
    },
    resumo: {
      linha: "tw:w-full tw:px-2 tw:gap-2 tw:rounded-lg",
      // colunas de largura fixa: as pílulas de categoria e perfil ficam alinhadas de uma linha para a outra
      grade: "tw:grid-cols-[minmax(110px,1fr)_120px_120px_96px] "
        + "tw:area460:grid-cols-[minmax(0,1fr)_96px_96px] tw:area340:grid-cols-[minmax(0,1fr)_96px]",
      gradeSemPerfil: "tw:grid-cols-[minmax(110px,1fr)_120px_96px] "
        + "tw:area460:grid-cols-[minmax(0,1fr)_96px_96px] tw:area340:grid-cols-[minmax(0,1fr)_96px]",
      data: "tw:min-w-[44px] tw:text-[15px] tw:font-[450] tw:text-zz-cinza",
      categoria: "tw:justify-self-start tw:overflow-hidden tw:max-w-[120px] tw:area460:max-w-[96px] tw:area340:hidden",
      perfil: "tw:justify-self-start tw:max-w-[120px] tw:area460:hidden",
    },
    // fundo conforme o estado: normal (realce ao passar o mouse), clicada (fina linha roxa junto ao menu),
    // marcada (roxo claro) e marcada + clicada
    normal: "tw:bg-transparent tw:group-hover/linha:bg-zz-surface-hover",
    clicada: "tw:bg-zz-surface-hover tw:shadow-[inset_3px_0_0_var(--color-primary)]",
    marcada: "tw:bg-zz-primary-soft",
    marcadaClicada: "tw:bg-zz-primary-soft tw:shadow-[inset_3px_0_0_var(--color-primary)]",
    // caixa sobre a 1ª coluna, centrada na altura da linha
    caixa: "tw:absolute tw:left-0 tw:inset-y-0 tw:w-4 tw:flex tw:items-center tw:[transition:opacity_var(--duration-fast)]",
    caixaApagada: "tw:opacity-55 tw:group-hover/linha:opacity-100 tw:focus-within:opacity-100",
    desc: "tw:flex tw:items-baseline tw:gap-1.5 tw:min-w-0 tw:whitespace-nowrap tw:overflow-hidden",
    data: "tw:flex-none tw:w-[52px] " + NUMEROS,
    letra: "tw:self-center tw:flex-none",
    titulo: "tw:flex-[0_1_auto] tw:min-w-[3em] tw:overflow-hidden tw:text-ellipsis tw:text-zz-text tw:text-[15px] tw:font-[450]",
    parcela: "tw:flex-none tw:py-px tw:px-1.5 tw:rounded-md tw:bg-(--color-neutral-soft) tw:text-(--color-neutral) tw:text-[11.5px] tw:font-semibold " + NUMEROS,
    conta: "tw:inline-flex tw:items-baseline tw:gap-1.5 tw:flex-[0_8_auto] tw:min-w-0 tw:overflow-hidden tw:area420:hidden",
    contaNome: "tw:flex-none tw:min-w-0 tw:overflow-hidden tw:text-ellipsis tw:text-zz-muted",
    contaDigitos: "tw:flex-none tw:text-zz-muted " + NUMEROS,
    // etiquetas de categoria/perfil têm largura máxima: o nome do lançamento nunca é espremido até sumir
    etiqueta: "tw:min-w-0 tw:flex tw:justify-end tw:*:min-w-0 tw:*:max-w-full "
      + "tw:[&_.cat-pill]:text-[11px] tw:[&_.cat-pill]:font-[620] tw:[&_.tag--upper]:text-[11px] tw:[&_.tag--upper]:font-[620]",
    valor: "tw:[justify-self:end] tw:text-[15px] tw:font-[620]",
    // trecho que atende a pesquisa (Transações)
    destaque: "tw:bg-zz-primary-soft tw:text-inherit tw:rounded-[3px] tw:shadow-[0_0_0_1px_var(--color-primary-soft)]",
  };
  /** Nome com o trecho pesquisado marcado (<mark>); sem pesquisa, o texto puro */
  const nomeDestacado = (texto: string, destacar?: Destacar | null): FilhoDom => (destacar
    ? destacar(texto).map((p) => (typeof p === "string" ? p : h("mark", { class: LR.destaque }, p.marca)))
    : texto);

  function LaunchRow(l: any, opts?: OpcoesLinha & { marcado?: boolean; onMarcar?: (marcado: boolean) => void; resumo?: boolean; mostrarData?: boolean; destacar?: Destacar | null }): HTMLElement {
    const o = opts || {};
    const verde = ZoZo.regras.tiposValorVerde.includes(l.tipo) || (l.tipo === "interno" && l.sentido === "entrada");
    const marca = l.tipo === "recorrente" ? (l.recorrencia === "parcelada" ? "P" : "R") : l.tipo === "interno" ? "T" : l.tipo === "receita" ? "I" : l.tipo === "debito" ? "D" : null;
    const marcaTitulo = (marca && MARCAS[marca]) || "";
    const resumo = !!o.resumo;
    const V = resumo ? LR.resumo : LR.pagina;
    const comPerfil = ZoZo.recursos.perfis();          // pílula de perfil só para contas com o recurso
    const estado = o.marcado ? (o.selected ? LR.marcadaClicada : LR.marcada) : o.selected ? LR.clicada : LR.normal;
    const linha = h(o.onClick ? "button" : "div", {
      type: o.onClick ? "button" : undefined,
      class: ["launch-row", LR.base, V.linha, comPerfil ? V.grade : V.gradeSemPerfil, estado, o.onClick && LR.interativa],
      onClick: o.onClick,
      "aria-current": o.selected ? "true" : undefined,
      "data-id": l.id,
    },
      resumo ? null : h("span", { "aria-hidden": "true" }),             // coluna da caixa de seleção
      h("span", { class: ["launch-row__desc", LR.desc] },
        // data primeiro (largura fixa) para os nomes alinharem com ou sem a letra T/R/I/P
        o.mostrarData || resumo ? h("span", { class: [LR.data, V.data] }, F.dataCurta(l.data)) : null,
        // letra (R/P/T/I/D) só quando existe: a Regular começa logo ao lado da caixa de seleção
        marca && !resumo ? h("span", { class: [ZoZo.pecas.letra, LR.letra], title: marcaTitulo, "aria-label": marcaTitulo }, marca) : null,
        h("span", { class: ["launch-row__title", LR.titulo] }, nomeDestacado(l.descricao, o.destacar)),
        l.parcelaTotal ? h("span", { class: LR.parcela, title: "Parcela " + l.parcelaAtual + " de " + l.parcelaTotal }, l.parcelaAtual + "/" + l.parcelaTotal) : null,
        // conta e 4 dígitos juntos ("Itaú 4821"): o nome encurta com "…" se faltar espaço
        (l.nomeConta || l.ultimos4Digitos) && !resumo ? h("span", { class: LR.conta },
          l.nomeConta ? h("span", { class: LR.contaNome }, l.nomeConta) : null,
          l.ultimos4Digitos ? h("span", { class: LR.contaDigitos }, l.ultimos4Digitos) : null) : null),
      h("span", { class: ["launch-row__category", LR.etiqueta, V.categoria] }, UI.CategoryLabel(l.categoria, { pill: true })),
      comPerfil ? h("span", { class: ["launch-row__profile", LR.etiqueta, V.perfil] }, UI.Tag(l.perfil && l.perfil.nome, l.perfil && l.perfil.cor, { class: "tag--upper" })) : null,
      h("span", { class: ["launch-row__value", "money", verde && "money--income", LR.valor] }, F.moeda(l.valor)));
    if (resumo || !o.onMarcar) return linha;
    // caixa + linha num envoltório: passar o mouse em qualquer parte realça a linha e mostra a caixa
    const caixa = UI.Checkbox(!!o.marcado, o.onMarcar, { label: "Selecionar " + l.descricao, class: [LR.caixa, o.marcado ? "tw:opacity-100" : LR.caixaApagada].join(" ") });
    return h("div", { class: "tw:relative tw:flex tw:flex-col tw:group/linha", "data-linha": "" }, caixa, linha);
  }

  /* ---------- Conta (seções 19–22, 24) ----------
     Visual em Tailwind (Contas e Investimentos). account-row* são ganchos. Área estreita (≤ 620 px):
     ícone e nome ocupam duas linhas; o valor fica em cima e a variação embaixo, à direita. */
  const AR = {
    linha: "tw:grid tw:items-center tw:gap-4 tw:w-full tw:min-h-(--row-height-tall) tw:px-4 tw:py-0 tw:[border:0] tw:rounded-lg tw:text-inherit "
      + "tw:text-left tw:text-[15px] tw:focus-visible:outline-offset-[-2px] tw:grid-cols-[36px_minmax(0,1fr)_auto_136px] "
      + "tw:area620:grid-cols-[36px_minmax(0,1fr)_auto] tw:area620:grid-rows-[auto_auto] tw:area620:gap-y-0.5",
    interativa: "tw:[transition:background_var(--duration-fast)_var(--easing),box-shadow_var(--duration-fast)_var(--easing)]",
    normal: "tw:bg-transparent tw:hover:bg-zz-surface-hover",
    selecionada: "tw:bg-zz-primary-soft",
    icone: "tw:area620:row-span-2",
    info: "tw:flex tw:flex-col tw:min-w-0 tw:area620:row-span-2",
    nomeLinha: "tw:flex tw:items-center tw:gap-1.5 tw:min-w-0",
    olho: "tw:inline-grid tw:place-items-center tw:flex-none tw:size-[18px] tw:rounded-sm tw:bg-zz-text tw:text-white",
    nome: "tw:*:text-[15px] tw:*:font-[450]",
    sub: "tw:text-zz-secondary tw:text-[13px] tw:font-[450]",
    variacao: "tw:[justify-self:end] tw:text-[13px] tw:font-[550] tw:[&_.pct]:text-[13px] tw:[&_.pct]:font-[550] tw:area620:col-start-3 tw:area620:row-start-2",
    valor: "tw:[justify-self:end] tw:text-[15px] tw:font-[550] tw:area620:col-start-3 tw:area620:row-start-1",
  };
  function AccountRow(c: any, opts?: OpcoesLinha & { subtitulo?: string }): HTMLElement {
    const o = opts || {};
    const sub = c.oculta ? "Ocultado" : o.subtitulo !== undefined ? o.subtitulo : SUBTITULO_CONTA[c.tipo];
    const icone = UI.AccountIcon(c);
    icone.classList.add(...AR.icone.split(" "));
    if (c.oculta) icone.classList.add("tw:opacity-55");                // conta oculta: ícone apagado
    return h(o.onClick ? "button" : "div", {
      type: o.onClick ? "button" : undefined,
      class: ["account-row", AR.linha, o.selected ? AR.selecionada : AR.normal, o.onClick && AR.interativa],
      onClick: o.onClick,
      "aria-current": o.selected ? "true" : undefined,
      "data-id": c.id,
    },
      icone,
      h("span", { class: AR.info },
        h("span", { class: AR.nomeLinha },
          c.oculta ? h("span", { class: AR.olho, title: "Conta oculta", "aria-label": "Conta oculta" }, icon("olho-fechado", { size: 13 })) : null,
          nomeComDigitos(c.nome, c.ultimos4Digitos, AR.nome)),
        sub ? h("span", { class: AR.sub }, sub) : null),
      h("span", { class: AR.variacao }, UI.PercentageChange(c.variacaoPercentual, { contexto: "em relação ao mês anterior", passivo: c.tipo === "cartao" || c.tipo === "emprestimo" })),
      h("span", { class: ["money", AR.valor] }, F.moeda(c.valor)));
  }

  /* ---------- Categoria (seções 35–39) ----------
     Visual em Tailwind (tw:). category-row* são ganchos; a bolinha, a seta e o contador vêm de pecas.cat*
     (o Dashboard › Top categorias também os usa). Colunas por largura da área: a barra sai em ≤ 620 px e o reservado em ≤ 420 px. */
  const CR = {
    linha: "tw:grid tw:items-center tw:gap-4 tw:w-full tw:min-h-(--row-height) tw:px-4 tw:py-0 tw:[border:0] tw:rounded-lg tw:text-inherit tw:text-left "
      + "tw:text-[15px] tw:focus-visible:outline-offset-[-2px] tw:grid-cols-[minmax(8em,1.4fr)_112px_minmax(80px,2fr)_104px] "
      + "tw:area620:grid-cols-[minmax(0,1fr)_112px_104px] tw:area420:grid-cols-[minmax(0,1fr)_112px]",   // mesmas colunas do cabeçalho (Categorias)
    interativa: "tw:[transition:background_var(--duration-fast)_var(--easing),box-shadow_var(--duration-fast)_var(--easing)]",
    normal: "tw:bg-transparent tw:hover:bg-zz-surface-hover",
    selecionada: "tw:bg-zz-primary-soft",
    grupoSelecionado: "tw:bg-zz-surface-hover tw:hover:bg-zz-primary-soft",
    grupo: "tw:font-medium tw:cursor-pointer",
    lead: "tw:flex tw:items-center tw:gap-2.5 tw:min-w-0",
    // categoria dentro de um grupo: recuada, com a linha vertical do grupo à esquerda
    leadFilho: "tw:relative tw:pl-[30px] tw:before:content-[''] tw:before:absolute tw:before:left-2.5 tw:before:-top-2.5 tw:before:-bottom-2.5 "
      + "tw:before:border-l tw:before:border-zz-border",
    gasto: "tw:[justify-self:end] tw:text-[15px] tw:font-[620]",
    barra: "tw:area620:hidden tw:sem-orcamento:invisible",
    reservado: "tw:text-left tw:text-[15px] tw:font-[620] tw:area420:hidden tw:sem-orcamento:invisible",
    contadorExcluido: "tw:bg-zz-warning-soft tw:text-zz-warning-text",
    nomeGrupo: "tw:text-[15px] tw:font-[450]",
    nomeGrupoBotao: "tw:min-w-0 tw:p-0 tw:[border:0] tw:bg-transparent tw:text-inherit tw:text-left tw:cursor-pointer",
  };
  function barraCategoria(gasto: unknown, reservado: unknown): HTMLElement {
    const acima = F.numero(gasto) > F.numero(reservado);
    const ratio = F.numero(reservado) > 0 ? F.numero(gasto) / F.numero(reservado) : (F.numero(gasto) > 0 ? 1 : 0);
    return UI.ProgressBar(ratio, { tone: acima ? "over" : "ok", label: acima ? "Gasto acima do reservado" : "Gasto dentro do reservado" });
  }

  function CategoryRow(cat: any, opts?: OpcoesLinha & { filho?: boolean; pill?: boolean; excluida?: boolean }): HTMLElement {
    const o = opts || {};
    return h(o.onClick ? "button" : "div", {
      type: o.onClick ? "button" : undefined,
      class: ["category-row", CR.linha, o.selected ? CR.selecionada : CR.normal, o.onClick && CR.interativa],
      onClick: o.onClick,
      "aria-current": o.selected ? "true" : undefined,
      "data-id": cat.id,
    },
      h("span", { class: [CR.lead, o.filho && CR.leadFilho] },
        o.pill ? null : h("span", { class: ZoZo.pecas.catPonto, style: { background: F.cor(cat.cor, "var(--palette-16)") }, "aria-hidden": "true" }),
        UI.CategoryLabel(cat, { pill: !!o.pill })),
      h("span", { class: ["money", CR.gasto] }, F.moeda(cat.gasto)),
      o.excluida ? null : h("span", { class: CR.barra }, barraCategoria(cat.gasto, cat.reservado)),
      o.excluida ? null : h("span", { class: ["money", CR.reservado, "tw:text-zz-secondary"] }, F.moeda(cat.reservado)));
  }

  function CategoryGroupRow(grupo: any, opts?: OpcoesLinha & { fechado?: boolean; excluida?: boolean; onToggle?: () => void }): HTMLElement {
    const o = opts || {};
    // A linha do grupo abre o painel do grupo (orçamento "não atribuído", desagrupar); a seta só abre/fecha.
    // Teclado e leitor de tela: o NOME é o botão que abre o painel e a seta é outro botão, lado a lado
    // (antes a linha inteira era role="button" com a seta dentro: controle dentro de controle, inacessível).
    const abrir = (e: MouseEvent) => { if (o.onClick && !(e.target as Element).closest(".category-row__caret, .category-row__group-name")) o.onClick(); };
    const nome = o.onClick
      ? h("button", { type: "button", class: ["category-row__group-name", CR.nomeGrupo, CR.nomeGrupoBotao],
        "aria-current": o.selected ? "true" : undefined, onClick: (e: MouseEvent) => { e.stopPropagation(); if (o.onClick) o.onClick(); } }, grupo.nome)
      : h("span", { class: ["category-row__group-name", CR.nomeGrupo] }, grupo.nome);
    return h("div", { class: ["category-row", CR.linha, CR.grupo, o.selected ? CR.grupoSelecionado : CR.normal, o.onClick && CR.interativa], onClick: abrir },
      h("span", { class: CR.lead },
        h("button", { type: "button", class: ZoZo.pecas.catSeta, "aria-expanded": String(!o.fechado), "aria-label": (o.fechado ? "Mostrar" : "Ocultar") + " categorias de " + grupo.nome,
          onClick: (e: MouseEvent) => { e.stopPropagation(); if (o.onToggle) o.onToggle(); } },
          icon(o.fechado ? "chevron-right" : "chevron-down", { size: 14, stroke: 2.25 })),
        h("span", { class: [ZoZo.pecas.catContador, o.excluida && CR.contadorExcluido] }, String(grupo.quantidade)),
        nome),
      h("span", { class: ["money", CR.gasto] }, F.moeda(grupo.gasto)),
      o.excluida ? null : h("span", { class: CR.barra }, barraCategoria(grupo.gasto, grupo.reservado)),
      o.excluida ? null : h("span", { class: ["money", CR.reservado, "tw:text-zz-text"] }, F.moeda(grupo.reservado)));
  }

  /* ---------- Recorrência (seção 42) ----------
     Visual em Tailwind (Recorrências e, compacta, Próximas transações do Dashboard). recurrence-row é gancho.
     [data | ícone] Nome  frequência ........ [CATEGORIA]  R$ 0,00 ✓ — a base tem especificidade zero (tw:base:):
     o Dashboard troca colunas, respiros e tamanhos pelas classes que passa (opts.class / opts.partes).
     Área estreita: a categoria sai em ≤ 620 px (página) e a frequência em ≤ 420 px. */
  const RR = {
    linha: "recurrence-row tw:base:grid tw:base:items-center tw:base:gap-3 tw:base:w-full tw:base:min-h-(--row-height) tw:base:px-4 tw:base:py-0 tw:[border:0] "
      + "tw:base:rounded-lg tw:text-inherit tw:text-left tw:text-[15px] tw:focus-visible:outline-offset-[-2px]",
    // página: a categoria não reserva largura mínima (o nome nunca some); com o ícone no lugar da data (arquivadas), 22 px
    // categoria numa coluna de largura fixa: as pílulas ficam alinhadas à esquerda, uma embaixo da outra
    colunas: "tw:grid-cols-[52px_minmax(0,1fr)_180px_120px] tw:area620:grid-cols-[52px_minmax(0,1fr)_110px]",
    colunasIcone: "tw:grid-cols-[22px_minmax(0,1fr)_180px_120px] tw:area620:grid-cols-[52px_minmax(0,1fr)_110px]",
    interativa: "tw:cursor-pointer tw:[transition:background_var(--duration-fast)_var(--easing),box-shadow_var(--duration-fast)_var(--easing)]",
    normal: "tw:bg-transparent tw:hover:bg-zz-surface-hover",
    // selecionada (fundo roxo claro): a data volta ao cinza mais escuro para manter o contraste ≥ 4,5:1
    selecionada: "tw:bg-zz-primary-soft tw:[&>span:first-child]:text-zz-secondary",
    data: "tw:base:text-zz-cinza tw:base:whitespace-nowrap " + NUMEROS,
    icone: "tw:text-[15px]",
    desc: "tw:flex tw:items-baseline tw:gap-2 tw:min-w-0 tw:whitespace-nowrap tw:overflow-hidden",
    titulo: "tw:base:overflow-hidden tw:base:text-ellipsis tw:base:text-[15px] tw:base:font-[450]",
    tipo: "tw:flex-none tw:text-zz-muted tw:text-[15px] tw:font-[450] tw:area420:hidden",
    categoria: "tw:base:min-w-0 tw:base:flex tw:base:justify-self-start tw:base:max-w-[180px] tw:*:min-w-0 tw:*:max-w-full",
    categoriaPagina: "tw:area620:hidden",
    valor: "money tw:[justify-self:end] tw:inline-flex tw:items-center tw:gap-1.5 tw:base:text-[15px] tw:base:font-[620]",
    // check de pago na cor da categoria; vazio com a mesma largura (os valores ficam alinhados)
    pago: "tw:inline-grid tw:place-items-center tw:w-3.5 tw:h-[18px] tw:flex-none tw:rounded-[50%] tw:text-[color-mix(in_srgb,var(--tag-color)_60%,black)]",
  };
  function RecurrenceRow(r: any, opts?: OpcoesLinha & { compacta?: boolean; semData?: boolean; partes?: { data?: string; titulo?: string; categoria?: string; valor?: string } }): HTMLElement {
    const o = opts || {};
    const p = o.partes || {};     // classes extras por parte: { data, titulo, categoria, valor }
    const colunas = o.compacta ? null : o.semData ? RR.colunasIcone : RR.colunas;
    return h(o.onClick ? "button" : "div", {
      type: o.onClick ? "button" : undefined,
      class: [RR.linha, colunas, o.selected ? RR.selecionada : RR.normal, o.onClick && RR.interativa, o.class],
      onClick: o.onClick,
      "aria-current": o.selected ? "true" : undefined,
      "data-id": r.id,
    },
      h("span", { class: [RR.data, p.data] }, o.semData ? h("span", { class: RR.icone, "aria-hidden": "true" }, ZoZo.dom.emoji(r.categoria && r.categoria.icone))
        : F.dataCurta(r.data) + (r.data.slice(0, 4) !== String(new Date().getFullYear()) ? " " + r.data.slice(2, 4) : "")),
      h("span", { class: RR.desc },
        h("span", { class: [RR.titulo, p.titulo] }, r.descricao),
        h("span", { class: RR.tipo }, r.tipoRecorrencia)),
      h("span", { class: [RR.categoria, o.compacta ? null : RR.categoriaPagina, ZoZo.pecas.ctxPilulaLinha, p.categoria] }, UI.CategoryLabel(r.categoria, { pill: true })),
      h("span", { class: [RR.valor, p.valor] },
        F.moeda(r.valor),
        r.pago ? h("span", { class: RR.pago, title: "Pago", "aria-label": "Pago",
          style: { "--tag-color": F.cor(r.categoria && r.categoria.cor, "var(--color-progress-ok)") } }, icon("check", { size: 13, stroke: 2.5 }))
          : h("span", { class: RR.pago, "aria-hidden": "true" })));
  }

  /* ---------- Alocação (seção 25) ----------
     Visual em Tailwind: [tipo] [barra ........] [%]; a barra começa logo depois do nome.
     Área estreita (≤ 420 px): colunas menores, sem passar da largura. allocation-row é gancho. */
  const AL = {
    linha: "allocation-row tw:grid tw:items-center tw:gap-x-4 tw:w-full tw:min-h-12 tw:px-4 tw:py-0 tw:rounded-lg tw:text-left tw:text-[15px] "
      + "tw:grid-cols-[minmax(96px,max-content)_minmax(120px,1fr)_64px] tw:area420:grid-cols-[minmax(0,1fr)_minmax(48px,1fr)_56px]",
    tipo: "tw:flex tw:items-center tw:gap-2.5 tw:min-w-0",
    pct: "tw:[justify-self:end] tw:font-medium " + NUMEROS,
  };
  function AllocationRow(a: any): HTMLElement {
    return h("div", { class: AL.linha },
      h("span", { class: AL.tipo }, h("span", null, a.tipoInvestimento)),
      h("span", null, UI.ProgressBar(F.numero(a.percentual) / 100, { tone: "allocation", label: a.tipoInvestimento })),
      h("span", { class: AL.pct }, F.percentual(a.percentual)));
  }

  /* ---------- Sidebar: grupo de contas (seção 7) ---------- */
  function SidebarAccountGroup(titulo: string, contas: any[], opts?: { onSelect?: (conta: any) => void }): HTMLElement {
    const o = opts || {};
    const key = "sidebar:" + titulo;
    const fechado = !!ZoZo.store.get().ui.gruposFechados[key];
    const toggle = () => UI.alternarGrupo(key);
    const E = ZoZo.estrutura;                 // visual em Tailwind (components/estrutura.ts)
    return h("div", { class: E.grupo },
      h("button", { type: "button", class: E.grupoTopo, "aria-expanded": String(!fechado), onClick: toggle },
        icon("chevron-down", { size: 12, class: fechado ? E.grupoSetaFechado : E.grupoSeta, stroke: 2.5 }),
        h("span", null, titulo)),
      fechado ? null : UI.corpoArvore(key, h("ul", null,
        contas.map((c: any) => h("li", null, h("button", { type: "button", class: E.conta, onClick: () => o.onSelect && o.onSelect(c) },
          h("span", { class: E.contaPonto, style: { background: F.cor(c.cor, "var(--palette-16)") }, "aria-hidden": "true" }),
          h("span", { class: E.contaNome }, c.nome),
          h("span", { class: E.contaValor }, F.moeda(c.valor, { inteiro: true, comSinal: true }))))))));
  }

  /* ---------- Lista de lançamentos nos painéis (formato do Copilot) ----------
     Mês (total) → dia → [☐] [T|R|I|P] Nome ........ [ícone da categoria] valor */
  function ListaPainel(itens: any[], opts?: { onClick?: (l: any) => void }): HTMLElement {
    const o = opts || {};
    const T = ZoZo.regras.totais;
    const marcados = new Set(ZoZo.store.get().ui.selecionados || []);
    const ordenados = itens.slice().sort((a, b) => b.data.localeCompare(a.data));
    const blocos: HTMLElement[] = [];
    let mesAtual: string | null = null, diaAtual: string | null = null;
    let secao: HTMLElement = h("section"), lista: HTMLElement = h("div");
    ordenados.forEach((l: any) => {
      const mes = l.data.slice(0, 7);
      if (mes !== mesAtual) {
        mesAtual = mes; diaAtual = null;
        const doMes = ordenados.filter((x: any) => x.data.startsWith(mes));
        const gasto = doMes.reduce((s: number, x: any) => s + (T.gasto[x.tipo] || 0) * x.valor, 0);
        const recebido = doMes.reduce((s: number, x: any) => s + (T.recebido[x.tipo] || 0) * x.valor, 0);
        secao = h("section", { class: ZoZo.pecas.plMes }, h("header", { class: ZoZo.pecas.plMesTopo },
          h("h3", { class: ZoZo.pecas.plMesTitulo }, F.mesAno(mes + "-01")),
          h("span", { class: ZoZo.pecas.plMesTotal },
            recebido > 0 ? UI.Dinheiro(recebido, { class: "money--income" }) : null,
            recebido > 0 && gasto > 0 ? h("span", { class: ZoZo.pecas.plMesParenteses }, "(", UI.Dinheiro(gasto), ")") : null,
            !(recebido > 0) ? UI.Dinheiro(gasto) : null)));
        blocos.push(secao);
      }
      if (l.data !== diaAtual) {
        diaAtual = l.data;
        secao.appendChild(h("h4", { class: ZoZo.pecas.plDia }, F.rotuloDia(l.data)));
        lista = h("div", { class: ZoZo.pecas.plLista });
        secao.appendChild(lista);
      }
      const marca = l.tipo === "recorrente" ? (l.recorrencia === "parcelada" ? "P" : "R") : l.tipo === "interno" ? "T" : l.tipo === "receita" ? "I" : l.tipo === "debito" ? "D" : null;
      const verde = ZoZo.regras.tiposValorVerde.includes(l.tipo) || (l.tipo === "interno" && l.sentido === "entrada");
      const marcado = marcados.has(l.id);
      // A linha inteira abre com o mouse; no teclado (e no leitor de tela) quem abre é o botão do nome —
      // um "botão" com a caixa de seleção dentro seria controle aninhado (WCAG 4.1.2)
      lista.appendChild(h("div", { class: [ZoZo.pecas.plLinha, marcado && "is-checked"], "data-id": l.id,
        onClick: (e: MouseEvent) => { if (!(e.target as Element).closest("button, input, label") && o.onClick) o.onClick(l); } },
        UI.Checkbox(marcado, (v) => {
          const atual = new Set(ZoZo.store.get().ui.selecionados || []);
          if (v) atual.add(l.id); else atual.delete(l.id);
          ZoZo.store.set({ ui: { selecionados: Array.from(atual) } });
        }, { label: "Selecionar " + l.descricao, class: ZoZo.pecas.plCaixa }),
        marca ? h("span", { class: [ZoZo.pecas.letra, ZoZo.pecas.plLetra], title: MARCAS[marca] }, marca) : null,
        h("span", { class: ZoZo.pecas.plNome },
          h("button", { type: "button", class: [ZoZo.pecas.plTitulo, ZoZo.pecas.plTituloBotao], onClick: () => o.onClick && o.onClick(l) }, l.descricao),
          l.parcelaTotal ? h("span", { class: "launch-row__parcel" }, l.parcelaAtual + "/" + l.parcelaTotal) : null),
        l.categoria ? h("span", { class: ZoZo.pecas.plCategoria, title: l.categoria.nome, style: { "--tag-color": F.cor(l.categoria.cor, "var(--palette-16)") } }, ZoZo.dom.emoji(l.categoria.icone)) : null,
        UI.Dinheiro(l.valor, { class: [ZoZo.pecas.plValor, verde && "money--income"].filter(Boolean).join(" ") })));
    });
    return h("div", { class: ZoZo.pecas.pl }, blocos);
  }

  ZoZo.list = {
    ListaPainel, LaunchRow, AccountRow, CategoryRow, CategoryGroupRow, RecurrenceRow, AllocationRow, SidebarAccountGroup, nomeComDigitos, SUBTITULO_CONTA };
})(window.ZoZo);
