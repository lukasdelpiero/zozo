/* =============================================================
   ZoZo — Dashboard (Tailwind CSS)
   Saudação · Gasto mensal · Patrimônio · Top categorias
   Próximas transações · Transações recentes
   Continuam no CSS antigo só as peças que outras telas também usam
   (card, card__link, bolinha/seta/contador da categoria, linha de
   recorrência, estado vazio, esqueleto do card).
   ============================================================= */
(function (ZoZo: ZoZoGlobal) {
  "use strict";
  const { h } = ZoZo.dom;
  const { icon } = ZoZo.icons;
  const UI = ZoZo.ui;
  const L = ZoZo.list;
  const C = ZoZo.pagesComum;
  const F = ZoZo.format;
  const A = ZoZo.messages.ACTIONS;

  /* Classes Tailwind (sempre escritas por inteiro). "na-tela" = computador com duas colunas e altura
     suficiente: o Dashboard ocupa exatamente a área visível (ver ajustarNaTela). */
  const T = {
    pagina: "page--dashboard tw:@container/dashboard tw:na-tela:h-full tw:na-tela:flex tw:na-tela:flex-col tw:na-tela:pb-5 "
      + "tw:na-tela:overflow-hidden tw:na-tela:baixa860:py-4",
    saudacao: "tw:block tw:mb-5 tw:na-tela:flex-none tw:na-tela:baixa860:mb-3",
    saudacaoTitulo: "tw:block tw:m-0 tw:text-[24px] tw:font-semibold tw:tracking-[-0.02em] tw:leading-[1.15]",
    // [Gasto | Patrimônio] na mesma altura; Recentes ocupa duas linhas à esquerda (uma coluna em área ≤ 860 px)
    grade: "tw:grid tw:grid-cols-[repeat(2,minmax(0,1fr))] tw:[grid-template-areas:'gasto_patrimonio'_'recentes_top'_'recentes_proximos'] tw:gap-5 "
      + "tw:@max-[860px]/dashboard:grid-cols-[minmax(0,1fr)] tw:@max-[860px]/dashboard:[grid-template-areas:'gasto'_'patrimonio'_'recentes'_'top'_'proximos'] "
      + "tw:na-tela:flex-[1_1_0] tw:na-tela:min-h-0 tw:na-tela:grid-rows-[auto_minmax(0,1fr)_minmax(0,1fr)] tw:na-tela:baixa860:gap-4",
    area: "tw:@container tw:min-w-0 tw:flex tw:flex-col tw:na-tela:min-h-0",
    areas: {
      gasto: "tw:[grid-area:gasto]",
      patrimonio: "tw:[grid-area:patrimonio]",
      recentes: "tw:[grid-area:recentes] tw:self-start tw:na-tela:self-stretch",
      top: "tw:[grid-area:top] tw:self-start tw:na-tela:self-stretch",
      proximos: "tw:[grid-area:proximos] tw:self-start tw:na-tela:self-stretch",
    },
    // os blocos entram em sequência ao abrir a página, no mesmo ritmo das outras páginas (css/movimento.css: 380 ms, +40 ms);
    // os que têm gráfico só deslizam (o gráfico se desenha já visível)
    entrada: ["tw:in-[.page--entrar]:motion-safe:animate-zz-bloco", "tw:in-[.page--entrar]:motion-safe:animate-zz-bloco-40",
      "tw:in-[.page--entrar]:motion-safe:animate-zz-bloco-80", "tw:in-[.page--entrar]:motion-safe:animate-zz-bloco-120"],
    entradaGrafico: ["tw:in-[.page--entrar]:motion-safe:animate-zz-desliza", "tw:in-[.page--entrar]:motion-safe:animate-zz-desliza-40",
      "tw:in-[.page--entrar]:motion-safe:animate-zz-desliza-80", "tw:in-[.page--entrar]:motion-safe:animate-zz-desliza-120"],
    card: ZoZo.pecas.card + " tw:p-5 tw:na-tela:flex tw:na-tela:flex-col tw:na-tela:flex-[1_1_auto] tw:na-tela:min-h-0 tw:na-tela:overflow-hidden tw:na-tela:baixa860:p-4",
    cardEstica: "tw:flex-1",
    cardFixo: "tw:flex-none",
    cardCab: "tw:flex tw:items-center tw:justify-between tw:mb-3 tw:na-tela:baixa860:mb-2",
    cardTitulo: "tw:text-[15px] tw:font-[550]",
    lista: "tw:flex tw:flex-col tw:-mx-2 tw:na-tela:min-h-0 tw:na-tela:overflow-hidden",
    vazio: "tw:na-tela:min-h-0 tw:na-tela:py-3",
    // Gasto mensal
    gastoTopo: "tw:flex tw:flex-col tw:gap-0.5 tw:items-center tw:text-center",
    gastoValor: "tw:text-left tw:text-[1.5rem] tw:font-[550] tw:tracking-[-0.02em]",
    gastoNumero: "money tw:[font-weight:inherit]",
    gastoNumeroAcima: "money tw:[font-weight:inherit] tw:text-(--color-negative)",
    gastoPalavra: "tw:font-semibold",
    gastoNota: "tw:text-zz-cinza tw:text-[.9375rem] tw:font-[550]",
    grafico: "tw:relative tw:mt-4 tw:mb-2",
    // Top categorias: [bolinha | seta do grupo] [ícone | quantidade] nome ..... gasto  reservado
    tops: "tw:flex tw:flex-col tw:-mx-5 tw:na-tela:min-h-0 tw:na-tela:overflow-hidden",
    top: "tw:grid tw:grid-cols-[16px_26px_minmax(0,1fr)_auto_112px] tw:gap-2.5 tw:items-center tw:min-h-9 tw:px-5 tw:text-[15px] tw:font-[450] "
      + "tw:area460:grid-cols-[16px_26px_minmax(0,1fr)_auto_auto] tw:area340:grid-cols-[16px_26px_minmax(0,1fr)_auto]",
    topItem: "tw:cursor-pointer tw:hover:bg-zz-surface-hover",
    topLead: "tw:grid tw:place-items-center",
    topPonto: ZoZo.pecas.catPonto + " tw:w-2 tw:h-2",
    topIcone: "tw:grid tw:place-items-center tw:text-[15px]",
    topIconeFilho: "tw:grid tw:place-items-center tw:text-[15px] tw:ml-[18px]",
    topQtd: ZoZo.pecas.catContador + " tw:text-[11px]",
    topNome: "tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap",
    topNomeFilho: "tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap tw:pl-[18px]",
    topGasto: "money tw:justify-self-end tw:font-[620]",
    topReservado: "money tw:text-right tw:pl-4 tw:text-zz-cinza tw:font-[620] tw:area340:hidden",
    // Próximas transações (linha de recorrência compacta)
    recorrencia: "tw:grid-cols-[52px_minmax(0,1fr)_minmax(0,max-content)_auto] tw:px-2 tw:gap-3 "
      + "tw:area460:grid-cols-[48px_minmax(0,1fr)_minmax(0,max-content)_auto] tw:area340:grid-cols-[48px_minmax(0,1fr)_auto]",
    recorrenciaPartes: {
      data: "tw:text-[15px] tw:font-[450]",
      titulo: "tw:text-[15px] tw:font-[450]",
      categoria: "tw:min-w-0 tw:max-w-[140px] tw:area460:max-w-[104px] tw:area340:hidden",
      valor: "tw:text-[15px] tw:font-[620]",
    },
    // esqueleto enquanto carrega
    esqueleto: "tw:grid tw:grid-cols-[repeat(2,minmax(0,1fr))] tw:gap-5 tw:items-start tw:max-[1180px]:grid-cols-[1fr]",
    esqueletoCol: "tw:flex tw:flex-col tw:gap-5 tw:min-w-0",
  };

  /** Top categorias: [bolinha | seta do grupo] [ícone | quantidade] nome ..... gasto  reservado */
  function topCategorias(cats: any, state: any, ctx: ContextoApp) {
    const blocos = ZoZo.categoriasShared.estruturar(cats, ((state.data.dashboard || {}).categorias || {}).grupos)
      .map((b: any) => (b.tipo === "categoria" ? { ...b, gasto: F.numero(b.cat.gasto) } : b))
      .sort((a: any, b: any) => F.numero(b.gasto) - F.numero(a.gasto)).slice(0, 5);
    const abertos = state.ui.dashGruposAbertos || {};
    const abrir = (c: any) => ctx.navigate("categorias", { select: { tipo: "categoria", id: c.id } });
    const linha = (lead: any, icone: any, nome: any, gasto: any, reservado: any, o: any) => h("div", Object.assign({ class: [T.top, o.item && T.topItem] }, o.attrs),
      h("span", { class: T.topLead }, lead), h("span", { class: o.filho ? T.topIconeFilho : T.topIcone }, icone),
      h("span", { class: o.filho ? T.topNomeFilho : T.topNome }, nome),
      h("span", { class: T.topGasto }, F.moeda(gasto)), h("span", { class: T.topReservado }, F.moeda(reservado)));
    const filho = (c: any, sub: any) => linha(sub ? null : h("span", { class: T.topPonto, style: { background: F.cor(c.cor, "var(--palette-16)") } }),
      ZoZo.dom.emoji(c.icone), c.nome, c.gasto, c.reservado,
      { item: true, filho: sub, attrs: { role: "button", tabindex: "0", onClick: () => abrir(c),
        onKeydown: (e: any) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); abrir(c); } } } });
    const out: HTMLElement[] = [];
    blocos.forEach((b: any) => {
      if (b.tipo === "categoria") { out.push(filho(b.cat, false)); return; }
      const aberto = !!abertos[b.nome];
      const chave = "dash:grp:" + b.nome;
      out.push(linha(h("button", { type: "button", class: ZoZo.pecas.catSeta, "aria-expanded": String(aberto), "aria-label": (aberto ? "Ocultar" : "Mostrar") + " categorias de " + b.nome,
        onClick: () => UI.alternarArvore(chave, () => ZoZo.store.set({ ui: { dashGruposAbertos: Object.assign({}, ZoZo.store.get().ui.dashGruposAbertos || {}, { [b.nome]: !aberto }) } })) },
        icon(aberto ? "chevron-down" : "chevron-right", { size: 14, stroke: 2.25 })),
        h("span", { class: T.topQtd }, String(b.quantidade)), b.nome, b.gasto, b.reservado, {}));
      if (aberto) out.push(UI.corpoArvore(chave, h("div", { class: ZoZo.pecas.arvoreGrupo }, b.itens.map((c: any) => filho(c, true)))));
    });
    return h("div", { class: T.tops, "data-dash-lista": "" }, out);
  }

  function linkPara(label: any, onClick: any) {
    return h("button", { type: "button", class: ZoZo.pecas.cardLink, onClick }, label, icon("chevron-right", { size: 14 }));
  }
  function Card(titulo: string, link: string | null, onClick: (() => void) | null, estica: boolean, ...children: FilhoDom[]) {
    return h("section", { class: [T.card, estica ? T.cardEstica : T.cardFixo], "aria-label": titulo },
      h("header", { class: T.cardCab }, h("h3", { class: T.cardTitulo }, titulo), link ? linkPara(link, onClick) : null),
      ...children);
  }

  /* ---------- Cabe na tela ----------
     No computador (duas colunas e altura suficiente), o Dashboard ocupa exatamente a área visível:
     os gráficos ficam mais baixos em telas baixas e as listas mostram só as linhas inteiras que
     cabem no card (o link do card abre a lista completa). Em telas estreitas a página rola. */
  const ALTURA_MINIMA = 600;
  const alturaGraficos = () => (innerHeight >= 1000 ? 150 : innerHeight >= 860 ? 128 : 104);

  function ajustarNaTela() {
    const pagina = document.querySelector(".page--dashboard");
    const grade = pagina && pagina.querySelector("[data-dash-grade]");
    if (!grade) return;
    const listas = Array.from(grade.querySelectorAll<HTMLElement>("[data-dash-lista]"));
    listas.forEach((l) => Array.from(l.children as HTMLCollectionOf<HTMLElement>).forEach((x) => { x.hidden = false; }));
    const duasColunas = getComputedStyle(grade).gridTemplateColumns.trim().split(/\s+/).length >= 2;
    (pagina as HTMLElement).classList.toggle("dash--na-tela", duasColunas && innerHeight >= ALTURA_MINIMA);
    if (!pagina.classList.contains("dash--na-tela")) return;
    listas.forEach((l) => {
      const card = l.closest(".card");
      if (!card) return;
      const limite = card.getBoundingClientRect().bottom - parseFloat(getComputedStyle(card).paddingBottom || "0");
      const itens = Array.from(l.children as HTMLCollectionOf<HTMLElement>);
      // esconde de baixo para cima o que não cabe inteiro (sempre sobra ao menos a primeira linha)
      for (let i = itens.length - 1; i > 0 && itens[i].getBoundingClientRect().bottom > limite + 0.5; i--) itens[i].hidden = true;
    });
  }
  let observador: ResizeObserver | null = null;
  function acompanharTela() {
    queueMicrotask(ajustarNaTela);            // logo depois de a página entrar no lugar (o router monta em seguida)
    if (observador || !window.ResizeObserver) return;
    const main = document.getElementById("main");
    if (!main) return;
    observador = new ResizeObserver(() => requestAnimationFrame(ajustarNaTela));
    observador.observe(main);
  }

  /** Gasto acumulado do mês × ritmo do orçamento (linha tracejada) */
  function GastoMensal(g: any) {
    const acima = g.orcamento > 0 && g.total > g.orcamento;
    const diferenca = Math.abs(g.total - g.orcamento);
    const chart = h("div", { class: T.grafico });
    const cs = getComputedStyle(document.documentElement);
    const series: SerieGrafico[] = [{ name: "Gasto", color: cs.getPropertyValue(acima ? "--color-progress-over" : "--color-primary").trim(), points: g.dias, area: true }];
    if (g.orcamento > 0 && g.dias.length) {
      series.push({ name: "Orçamento", color: cs.getPropertyValue("--color-text-muted").trim(), tracejado: true,
        points: g.dias.map((d: any) => ({ data: d.data, valor: Math.round((g.orcamento * Number(d.data.slice(8, 10)) / g.ultimoDia) * 100) / 100 })) });
    }
    // Centro: quanto resta (ou quanto passou) e, abaixo, o valor reservado no mês
    const comOrcamento = g.orcamento > 0;
    const numero = h("span"), palavra = h("span", { class: T.gastoPalavra }), nota = h("span", { class: T.gastoNota });
    const resumo = () => {
      numero.className = acima ? T.gastoNumeroAcima : T.gastoNumero;
      numero.textContent = F.moeda(comOrcamento ? diferenca : g.total);
      palavra.textContent = comOrcamento ? (acima ? " acima" : " restante") : " gastos";
      nota.textContent = comOrcamento ? F.moeda(g.orcamento) + " reservado" : "neste mês";
    };
    resumo();
    // passar o mouse "filtra": o topo mostra o gasto acumulado até o dia do ponto
    ZoZo.charts.renderLineChart(chart, series, { height: alturaGraficos(), ariaLabel: "Gasto acumulado no mês",
      aoPassar: (pts) => {
        const p = pts && pts[0];
        if (!p) { resumo(); return; }
        numero.className = T.gastoNumero; numero.textContent = F.moeda(p.valor);
        palavra.textContent = " gastos";
        nota.textContent = "até " + F.dataCurta(p.data);
      } });
    return h("div", null,
      h("div", { class: T.gastoTopo }, h("span", { class: T.gastoValor }, numero, palavra), nota),
      chart);
  }

  ZoZo.pages.dashboard = {
    titulo: "Dashboard",
    carregar: (ctx, force) => Promise.all([
      ctx.loadData("dashboard", A.getDashboard, null, { force }),
      ctx.loadData("config", A.getConfig, null, { force }).catch(() => null),
    ]),
    deps: (s) => [s.data.dashboard, s.errors.dashboard, s.session.user, s.data.config, s.ui.intervaloPatrimonio, s.ui.dashGruposAbertos],
    render(state, ctx) {
      const user = state.session.user || {};
      const primeiroNome = (user.nomeUsuario || "").split(" ")[0];
      // Só a saudação pela hora do dia + nome (sem foto e sem ícones: a foto fica no rodapé do menu)
      const hora = new Date().getHours();
      const periodo = hora >= 5 && hora < 12 ? "Bom dia" : hora >= 12 && hora < 18 ? "Boa tarde" : "Boa noite";
      const saudacao = h("header", { class: T.saudacao },
        h("h2", { class: T.saudacaoTitulo }, periodo + (primeiroNome ? ", " + primeiroNome : "") + "!"));

      const espera = C.estadoCarregamento(state, ["dashboard"], () => this.carregar(ctx, true), {
        skeleton: h("div", { class: T.esqueleto },
          h("div", { class: T.esqueletoCol }, h("div", { class: ZoZo.pecas.esqueletoCard }), h("div", { class: ZoZo.pecas.esqueletoCardBaixo })),
          h("div", { class: T.esqueletoCol }, h("div", { class: ZoZo.pecas.esqueletoCardBaixo }), h("div", { class: ZoZo.pecas.esqueletoCard }))),
      });
      if (espera) return C.pagina(T.pagina, saudacao, espera);

      const d = C.carregado(state, "dashboard");
      const hojeIso = F.iso(new Date());

      // Orçamento desligado: o card mostra só o gasto (sem mexer nos dados guardados — religar o orçamento volta na hora)
      const semOrcamento = state.data.config && state.data.config.orcamentoAtivo === false;
      const gasto = d.gastoMensal && semOrcamento ? Object.assign({}, d.gastoMensal, { orcamento: 0 }) : d.gastoMensal;
      const cardGasto = gasto ? Card("Gasto mensal", "Transações", () => ctx.navigate("lancamentos"), true, GastoMensal(gasto)) : null;

      const cardPatrimonio = d.contas ? Card("Patrimônio total", "Contas", () => ctx.navigate("contas"), true,
        ZoZo.contasShared.ContasChartCard(d.contas, state.ui, { compact: true, embedded: true, filtros: true, alturaGrafico: alturaGraficos(),
          intervalo: state.ui.intervaloPatrimonio || "3M", chaveIntervalo: "intervaloPatrimonio", rotuloFiltro: "Período do patrimônio" })) : null;

      const cats = d.categorias ? (d.categorias.categorias || []).filter((c: any) => c.status === "regular") : [];
      const cardCats = Card("Top categorias", "Categorias", () => ctx.navigate("categorias"), false,
        cats.length ? topCategorias(cats, state, ctx) : UI.EmptyState("Nenhuma categoria cadastrada.", { icon: "categorias", class: T.vazio }));

      const recs = d.recorrencias ? (d.recorrencias.recorrencias || []).filter((r: any) => !r.pago && r.data >= hojeIso).slice(0, 5) : [];
      const cardRec = Card("Próximas transações", "Recorrências", () => ctx.navigate("recorrencias"), false,
        recs.length
          ? h("div", { class: T.lista, "data-dash-lista": "" }, recs.map((r: any) => L.RecurrenceRow(r, { compacta: true, class: T.recorrencia, partes: T.recorrenciaPartes, onClick: () => ctx.navigate("recorrencias") })))
          : UI.EmptyState("Nenhuma transação prevista para este mês.", { icon: "recorrencias", class: T.vazio }));

      const ultimos = d.ultimosLancamentos || [];
      const cardLanc = Card("Transações recentes", "Transações", () => ctx.navigate("lancamentos"), false,
        ultimos.length
          ? h("div", { class: T.lista, "data-dash-lista": "" }, ultimos.map((l: any) => L.LaunchRow(l, { resumo: true, onClick: () => ctx.navigate("lancamentos", { select: { tipo: "lancamento", id: l.id } }) })))
          : UI.EmptyState("Nenhuma transação cadastrada.", { class: T.vazio }));

      // Áreas na ordem da página; a entrada em sequência segue a posição de cada uma (0, 50, 100, 150 ms)
      const lista: Array<[string, HTMLElement | null, boolean?]> = [["gasto", cardGasto, true], ["patrimonio", cardPatrimonio, true], ["recentes", cardLanc], ["top", cardCats], ["proximos", cardRec]];
      const areas = lista.filter((a) => a[1])
        .map(([nome, el, grafico], i) => h("div", { class: [T.area, (T.areas as Record<string, string>)[nome], (grafico ? T.entradaGrafico : T.entrada)[Math.min(i, 3)]] }, el));
      acompanharTela();
      return C.pagina(T.pagina, saudacao, h("div", { class: T.grade, "data-dash-grade": "" }, areas));
    },
  };
})(window.ZoZo);
