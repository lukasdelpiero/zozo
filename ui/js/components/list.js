/* =============================================================
   ZoZo — Linhas de lista
   LaunchRow · AccountRow · CategoryRow · CategoryGroupRow
   RecurrenceRow · AllocationRow · SidebarAccountGroup
   ============================================================= */
(function (ZoZo) {
  "use strict";
  const { h } = ZoZo.dom;
  const { icon } = ZoZo.icons;
  const F = ZoZo.format;
  const UI = ZoZo.ui;

  const SUBTITULO_CONTA = { corrente: "Corrente", poupanca: "Poupança", investimento: "Investimento", emprestimo: "Empréstimo" };

  function rowBase(cls, opts, ...children) {
    const o = opts || {};
    const tag = o.onClick ? "button" : "div";
    return h(tag, {
      type: o.onClick ? "button" : undefined,
      class: ["row", cls, o.selected && "is-selected", o.onClick && "row--interactive", o.class],
      onClick: o.onClick,
      "aria-current": o.selected ? "true" : undefined,
      "data-id": o.id,
    }, ...children);
  }

  /** Nome + 4 últimos dígitos (mais claro) */
  function nomeComDigitos(nome, digitos, cls) {
    return h("span", { class: ["name-digits", cls] },
      h("span", { class: "name-digits__name" }, nome || ""),
      digitos ? h("span", { class: "name-digits__digits" }, digitos) : null);
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
      grade: "tw:grid-cols-[12px_minmax(0,1fr)_minmax(0,max-content)_minmax(84px,max-content)_112px] "
        + "tw:area620:grid-cols-[12px_minmax(0,1fr)_minmax(0,max-content)_96px] tw:area420:grid-cols-[12px_minmax(0,1fr)_96px]",
      gradeSemPerfil: "tw:grid-cols-[12px_minmax(0,1fr)_minmax(0,max-content)_112px] tw:area620:grid-cols-[12px_minmax(0,1fr)_96px]",
      data: "tw:min-w-[46px] tw:text-[13px]",
      categoria: "tw:overflow-hidden tw:max-w-[180px] tw:area620:hidden",
      perfil: "tw:max-w-[180px] tw:area620:max-w-[110px] tw:area420:hidden",
    },
    resumo: {
      linha: "tw:w-full tw:px-2 tw:gap-2 tw:rounded-lg",
      grade: "tw:grid-cols-[minmax(110px,1fr)_minmax(0,max-content)_minmax(0,max-content)_auto] "
        + "tw:area460:grid-cols-[minmax(0,1fr)_minmax(0,max-content)_auto] tw:area340:grid-cols-[minmax(0,1fr)_auto]",
      gradeSemPerfil: "tw:grid-cols-[minmax(110px,1fr)_minmax(0,max-content)_auto] "
        + "tw:area460:grid-cols-[minmax(0,1fr)_minmax(0,max-content)_auto] tw:area340:grid-cols-[minmax(0,1fr)_auto]",
      data: "tw:min-w-[44px] tw:text-[15px] tw:font-[450]",
      categoria: "tw:overflow-hidden tw:max-w-[120px] tw:area460:max-w-[96px] tw:area340:hidden",
      perfil: "tw:max-w-[140px] tw:area460:hidden",
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
    data: "tw:flex-none tw:w-[52px] tw:text-zz-secondary " + NUMEROS,
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
  const nomeDestacado = (texto, destacar) => (destacar
    ? destacar(texto).map((p) => (typeof p === "string" ? p : h("mark", { class: LR.destaque }, p.marca)))
    : texto);

  function LaunchRow(l, opts) {
    const o = opts || {};
    const verde = ZoZo.regras.tiposValorVerde.includes(l.tipo) || (l.tipo === "interno" && l.sentido === "entrada");
    const marca = l.tipo === "recorrente" ? (l.recorrencia === "parcelada" ? "P" : "R") : l.tipo === "interno" ? "T" : l.tipo === "receita" ? "I" : l.tipo === "debito" ? "D" : null;
    const marcaTitulo = { P: "Parcelado", R: "Recorrente", T: "Transferência", I: "Receita", D: "Débito" }[marca] || "";
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
        marca && !resumo ? h("span", { class: ["kind-badge", LR.letra], title: marcaTitulo, "aria-label": marcaTitulo }, marca) : null,
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
    const caixa = UI.Checkbox(o.marcado, o.onMarcar, { label: "Selecionar " + l.descricao, class: [LR.caixa, o.marcado ? "tw:opacity-100" : LR.caixaApagada].join(" ") });
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
  function AccountRow(c, opts) {
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
      h("span", { class: AR.variacao }, UI.PercentageChange(c.variacaoPercentual, { contexto: "em relação ao mês anterior" })),
      h("span", { class: ["money", AR.valor] }, F.moeda(c.valor)));
  }

  /* ---------- Categoria (seções 35–39) ----------
     Visual em Tailwind (tw:). category-row* são ganchos; a bolinha, a seta e o contador
     (category-row__dot / __caret / __count) continuam no CSS antigo porque o Dashboard (Top categorias)
     também os usa. Colunas por largura da área: a barra sai em ≤ 620 px e o reservado em ≤ 420 px. */
  const CR = {
    linha: "tw:grid tw:items-center tw:gap-4 tw:w-full tw:min-h-(--row-height) tw:px-4 tw:py-0 tw:[border:0] tw:rounded-lg tw:text-inherit tw:text-left "
      + "tw:text-[15px] tw:focus-visible:outline-offset-[-2px] tw:grid-cols-[minmax(8em,1.4fr)_112px_minmax(80px,2fr)_104px] "
      + "tw:area620:grid-cols-[minmax(0,1fr)_auto_auto] tw:area420:grid-cols-[minmax(0,1fr)_auto]",
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
  function barraCategoria(gasto, reservado) {
    const acima = F.numero(gasto) > F.numero(reservado);
    const ratio = F.numero(reservado) > 0 ? F.numero(gasto) / F.numero(reservado) : (F.numero(gasto) > 0 ? 1 : 0);
    return UI.ProgressBar(ratio, { tone: acima ? "over" : "ok", label: acima ? "Gasto acima do reservado" : "Gasto dentro do reservado" });
  }

  function CategoryRow(cat, opts) {
    const o = opts || {};
    return h(o.onClick ? "button" : "div", {
      type: o.onClick ? "button" : undefined,
      class: ["category-row", CR.linha, o.selected ? CR.selecionada : CR.normal, o.onClick && CR.interativa],
      onClick: o.onClick,
      "aria-current": o.selected ? "true" : undefined,
      "data-id": cat.id,
    },
      h("span", { class: [CR.lead, o.filho && CR.leadFilho] },
        o.pill ? null : h("span", { class: "category-row__dot", style: { background: F.cor(cat.cor, "var(--palette-16)") }, "aria-hidden": "true" }),
        UI.CategoryLabel(cat, { pill: !!o.pill })),
      h("span", { class: ["money", CR.gasto] }, F.moeda(cat.gasto)),
      o.excluida ? null : h("span", { class: CR.barra }, barraCategoria(cat.gasto, cat.reservado)),
      o.excluida ? null : h("span", { class: ["money", CR.reservado, "tw:text-zz-secondary"] }, F.moeda(cat.reservado)));
  }

  function CategoryGroupRow(grupo, opts) {
    const o = opts || {};
    // A linha do grupo abre o painel do grupo (orçamento "não atribuído", desagrupar); a seta só abre/fecha.
    // Teclado e leitor de tela: o NOME é o botão que abre o painel e a seta é outro botão, lado a lado
    // (antes a linha inteira era role="button" com a seta dentro: controle dentro de controle, inacessível).
    const abrir = (e) => { if (o.onClick && !e.target.closest(".category-row__caret, .category-row__group-name")) o.onClick(); };
    const nome = o.onClick
      ? h("button", { type: "button", class: ["category-row__group-name", CR.nomeGrupo, CR.nomeGrupoBotao],
        "aria-current": o.selected ? "true" : undefined, onClick: (e) => { e.stopPropagation(); o.onClick(); } }, grupo.nome)
      : h("span", { class: ["category-row__group-name", CR.nomeGrupo] }, grupo.nome);
    return h("div", { class: ["category-row", CR.linha, CR.grupo, o.selected ? CR.grupoSelecionado : CR.normal, o.onClick && CR.interativa], onClick: abrir },
      h("span", { class: CR.lead },
        h("button", { type: "button", class: "category-row__caret", "aria-expanded": String(!o.fechado), "aria-label": (o.fechado ? "Mostrar" : "Ocultar") + " categorias de " + grupo.nome,
          onClick: (e) => { e.stopPropagation(); o.onToggle(); } },
          icon(o.fechado ? "chevron-right" : "chevron-down", { size: 14, stroke: 2.25 })),
        h("span", { class: ["category-row__count", o.excluida && CR.contadorExcluido] }, String(grupo.quantidade)),
        nome),
      h("span", { class: ["money", CR.gasto] }, F.moeda(grupo.gasto)),
      o.excluida ? null : h("span", { class: CR.barra }, barraCategoria(grupo.gasto, grupo.reservado)),
      o.excluida ? null : h("span", { class: ["money", CR.reservado, "tw:text-zz-text"] }, F.moeda(grupo.reservado)));
  }

  /* ---------- Recorrência (seção 42) ---------- */
  function RecurrenceRow(r, opts) {
    const p = (opts && opts.partes) || {};     // classes extras por parte: { data, titulo, categoria, valor }
    return rowBase("recurrence-row", Object.assign({ id: r.id }, opts),
      h("span", { class: ["recurrence-row__date", p.data] }, (opts || {}).semData ? h("span", { class: "recurrence-row__icon", "aria-hidden": "true" }, (r.categoria && r.categoria.icone) || "•")
        : F.dataCurta(r.data) + (r.data.slice(0, 4) !== String(new Date().getFullYear()) ? " " + r.data.slice(2, 4) : "")),
      h("span", { class: "recurrence-row__desc" },
        h("span", { class: ["recurrence-row__title", p.titulo] }, r.descricao),
        h("span", { class: "recurrence-row__type" }, r.tipoRecorrencia)),
      h("span", { class: ["recurrence-row__category", p.categoria] }, UI.CategoryLabel(r.categoria, { pill: true })),
      h("span", { class: ["recurrence-row__value money", p.valor] },
        F.moeda(r.valor),
        r.pago ? h("span", { class: "recurrence-row__paid", title: "Pago", "aria-label": "Pago",
          style: { "--tag-color": F.cor(r.categoria && r.categoria.cor, "var(--color-progress-ok)") } }, icon("check", { size: 13, stroke: 2.5 }))
          : h("span", { class: "recurrence-row__paid recurrence-row__paid--vazio", "aria-hidden": "true" })));
  }

  /* ---------- Alocação (seção 25) ---------- */
  function AllocationRow(a) {
    return h("div", { class: "row allocation-row" },
      h("span", { class: "allocation-row__lead" }, h("span", null, a.tipoInvestimento)),
      h("span", { class: "allocation-row__bar" }, UI.ProgressBar(F.numero(a.percentual) / 100, { tone: "allocation", label: a.tipoInvestimento })),
      h("span", { class: "allocation-row__pct" }, F.percentual(a.percentual)));
  }

  /* ---------- Sidebar: grupo de contas (seção 7) ---------- */
  function SidebarAccountGroup(titulo, contas, opts) {
    const o = opts || {};
    const key = "sidebar:" + titulo;
    const fechado = !!ZoZo.store.get().ui.gruposFechados[key];
    const toggle = () => UI.alternarGrupo(key);
    return h("div", { class: ["side-group", fechado && "is-collapsed"] },
      h("button", { type: "button", class: "side-group__header", "aria-expanded": String(!fechado), onClick: toggle },
        icon("chevron-down", { size: 12, class: "side-group__caret", stroke: 2.5 }),
        h("span", null, titulo)),
      fechado ? null : UI.corpoArvore(key, h("ul", { class: "side-group__list" },
        contas.map((c) => h("li", null, h("button", { type: "button", class: "side-account", onClick: () => o.onSelect && o.onSelect(c) },
          h("span", { class: "side-account__dot", style: { background: F.cor(c.cor, "var(--palette-16)") }, "aria-hidden": "true" }),
          h("span", { class: "side-account__name" }, c.nome),
          h("span", { class: "side-account__value" }, F.moeda(c.valor, { inteiro: true, comSinal: true }))))))));
  }

  /* ---------- Lista de lançamentos nos painéis (formato do Copilot) ----------
     Mês (total) → dia → [☐] [T|R|I|P] Nome ........ [ícone da categoria] valor */
  function ListaPainel(itens, opts) {
    const o = opts || {};
    const T = ZoZo.regras.totais;
    const marcados = new Set(ZoZo.store.get().ui.selecionados || []);
    const ordenados = itens.slice().sort((a, b) => b.data.localeCompare(a.data));
    const blocos = [];
    let mesAtual = null, diaAtual = null, secao = null, lista = null;
    ordenados.forEach((l) => {
      const mes = l.data.slice(0, 7);
      if (mes !== mesAtual) {
        mesAtual = mes; diaAtual = null;
        const doMes = ordenados.filter((x) => x.data.startsWith(mes));
        const gasto = doMes.reduce((s, x) => s + (T.gasto[x.tipo] || 0) * x.valor, 0);
        const recebido = doMes.reduce((s, x) => s + (T.recebido[x.tipo] || 0) * x.valor, 0);
        secao = h("section", { class: "pl-month" }, h("header", { class: "pl-month__head" },
          h("h4", { class: "pl-month__title" }, F.mesAno(mes + "-01")),
          h("span", { class: "pl-month__total" },
            recebido > 0 ? h("span", { class: "money money--income" }, F.moeda(recebido)) : null,
            recebido > 0 && gasto > 0 ? h("span", { class: "money pl-month__paren" }, "(" + F.moeda(gasto) + ")") : null,
            !(recebido > 0) ? h("span", { class: "money" }, F.moeda(gasto)) : null)));
        blocos.push(secao);
      }
      if (l.data !== diaAtual) {
        diaAtual = l.data;
        secao.appendChild(h("h5", { class: "pl-day" }, F.rotuloDia(l.data)));
        lista = h("div", { class: "pl-list" });
        secao.appendChild(lista);
      }
      const marca = l.tipo === "recorrente" ? (l.recorrencia === "parcelada" ? "P" : "R") : l.tipo === "interno" ? "T" : l.tipo === "receita" ? "I" : l.tipo === "debito" ? "D" : null;
      const verde = ZoZo.regras.tiposValorVerde.includes(l.tipo) || (l.tipo === "interno" && l.sentido === "entrada");
      const marcado = marcados.has(l.id);
      lista.appendChild(h("div", { class: ["pl-row", marcado && "is-checked"], role: "button", tabindex: "0", "data-id": l.id,
        onClick: () => o.onClick && o.onClick(l),
        onKeydown: (e) => { if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) { e.preventDefault(); if (o.onClick) o.onClick(l); } } },
        UI.Checkbox(marcado, (v) => {
          const atual = new Set(ZoZo.store.get().ui.selecionados || []);
          if (v) atual.add(l.id); else atual.delete(l.id);
          ZoZo.store.set({ ui: { selecionados: Array.from(atual) } });
        }, { label: "Selecionar " + l.descricao, class: "pl-row__check" }),
        h("span", { class: "pl-row__name" },
          marca ? h("span", { class: "kind-badge", title: { P: "Parcelado", R: "Recorrente", T: "Transferência", I: "Receita", D: "Débito" }[marca] }, marca) : null,
          h("span", { class: "pl-row__title" }, l.descricao),
          l.parcelaTotal ? h("span", { class: "launch-row__parcel" }, l.parcelaAtual + "/" + l.parcelaTotal) : null),
        l.categoria ? h("span", { class: "pl-row__cat", title: l.categoria.nome, style: { "--tag-color": F.cor(l.categoria.cor, "var(--palette-16)") } }, l.categoria.icone || "•") : h("span"),
        h("span", { class: ["pl-row__value", "money", verde && "money--income"] }, F.moeda(l.valor))));
    });
    return h("div", { class: "pl" }, blocos);
  }

  ZoZo.list = {
    ListaPainel, LaunchRow, AccountRow, CategoryRow, CategoryGroupRow, RecurrenceRow, AllocationRow, SidebarAccountGroup, nomeComDigitos, SUBTITULO_CONTA };
})(window.ZoZo);
