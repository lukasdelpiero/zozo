/* =============================================================
   ZoZo — Dashboard
   Saudação com foto · Gasto mensal · Patrimônio · Top categorias
   Próximos lançamentos · Lançamentos recentes
   ============================================================= */
(function (ZoZo) {
  "use strict";
  const { h } = ZoZo.dom;
  const { icon } = ZoZo.icons;
  const UI = ZoZo.ui;
  const L = ZoZo.list;
  const C = ZoZo.pagesComum;
  const F = ZoZo.format;
  const A = ZoZo.messages.ACTIONS;

  /** Top categorias: [bolinha | seta do grupo] [ícone | quantidade] nome ..... gasto  reservado */
  function topCategorias(cats, state, ctx) {
    const blocos = ZoZo.categoriasShared.estruturar(cats)
      .map((b) => (b.tipo === "categoria" ? { ...b, gasto: F.numero(b.cat.gasto) } : b))
      .sort((a, b) => F.numero(b.gasto) - F.numero(a.gasto)).slice(0, 5);
    const abertos = state.ui.dashGruposAbertos || {};
    const abrir = (c) => ctx.navigate("categorias", { select: { tipo: "categoria", id: c.id } });
    const linha = (lead, icone, nome, gasto, reservado, extra) => h("div", Object.assign({ class: ["top-cat", extra && extra.class] }, extra && extra.attrs),
      h("span", { class: "top-cat__lead" }, lead), h("span", { class: "top-cat__icon" }, icone), h("span", { class: "top-cat__name" }, nome),
      h("span", { class: "top-cat__spent money" }, F.moeda(gasto)), h("span", { class: "top-cat__reserved money" }, F.moeda(reservado)));
    const filho = (c, sub) => linha(sub ? null : h("span", { class: "category-row__dot", style: { background: F.cor(c.cor, "var(--palette-16)") } }),
      c.icone || "•", c.nome, c.gasto, c.reservado,
      { class: ["top-cat--item", sub && "top-cat--child"].filter(Boolean).join(" "), attrs: { role: "button", tabindex: "0", onClick: () => abrir(c), onKeydown: (e) => { if (e.key === "Enter") abrir(c); } } });
    const out = [];
    blocos.forEach((b) => {
      if (b.tipo === "categoria") { out.push(filho(b.cat, false)); return; }
      const aberto = !!abertos[b.nome];
      out.push(linha(h("button", { type: "button", class: "category-row__caret", "aria-expanded": String(aberto), "aria-label": (aberto ? "Ocultar" : "Mostrar") + " categorias de " + b.nome,
        onClick: () => ZoZo.store.set({ ui: { dashGruposAbertos: Object.assign({}, abertos, { [b.nome]: !aberto }) } }) },
        icon(aberto ? "chevron-down" : "chevron-right", { size: 14, stroke: 2.25 })),
        h("span", { class: "category-row__count" }, String(b.quantidade)), b.nome, b.gasto, b.reservado, { class: "top-cat--group" }));
      if (aberto) b.itens.forEach((c) => out.push(filho(c, true)));
    });
    return h("div", { class: "top-cats" }, out);
  }

  function linkPara(label, onClick) {
    return h("button", { type: "button", class: "card__link", onClick }, label, icon("chevron-right", { size: 14 }));
  }
  function Card(titulo, link, onClick, ...children) {
    return h("section", { class: "card dash-card dash-card--boxed", "aria-label": titulo },
      h("header", { class: "dash-card__header" }, h("h3", { class: "dash-card__title" }, titulo), link ? linkPara(link, onClick) : null),
      ...children);
  }

  /** Gasto acumulado do mês × ritmo do orçamento (linha tracejada) */
  function GastoMensal(g) {
    const acima = g.orcamento > 0 && g.total > g.orcamento;
    const diferenca = Math.abs(g.total - g.orcamento);
    const chart = h("div", { class: "chart-card__chart" });
    const cs = getComputedStyle(document.documentElement);
    const series = [{ name: "Gasto", color: cs.getPropertyValue(acima ? "--color-progress-over" : "--color-primary").trim(), points: g.dias, area: true }];
    if (g.orcamento > 0 && g.dias.length) {
      series.push({ name: "Orçamento", color: cs.getPropertyValue("--color-text-muted").trim(), tracejado: true,
        points: g.dias.map((d) => ({ data: d.data, valor: Math.round((g.orcamento * Number(d.data.slice(8, 10)) / g.ultimoDia) * 100) / 100 })) });
    }
    ZoZo.charts.renderLineChart(chart, series, { height: 150, area: true, ariaLabel: "Gasto acumulado no mês" });
    // Centro: quanto resta (ou quanto passou) e, abaixo, o valor reservado no mês
    const comOrcamento = g.orcamento > 0;
    return h("div", { class: "spend" },
      h("div", { class: "spend__head" },
        h("span", { class: ["spend__value", acima && "spend__value--over"] },
          comOrcamento ? h("span", { class: "money" }, F.moeda(diferenca)) : h("span", { class: "money" }, F.moeda(g.total)),
          h("span", { class: "spend__word" }, comOrcamento ? (acima ? " acima" : " restante") : " gastos")),
        h("span", { class: "spend__note" }, comOrcamento ? F.moeda(g.orcamento) + " reservado" : "neste mês")),
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
      const saudacao = h("header", { class: "greeting" },
        h("h2", { class: "greeting__title" }, periodo + (primeiroNome ? ", " + primeiroNome : "") + "!"));

      const espera = C.estadoCarregamento(state, ["dashboard"], () => this.carregar(ctx, true), {
        skeleton: h("div", { class: "dash-grid" },
          h("div", { class: "dash-col" }, h("div", { class: "card skeleton-card" }), h("div", { class: "card skeleton-card skeleton-card--short" })),
          h("div", { class: "dash-col" }, h("div", { class: "card skeleton-card skeleton-card--short" }), h("div", { class: "card skeleton-card" }))),
      });
      if (espera) return C.pagina("page--dashboard", saudacao, espera);

      const d = state.data.dashboard;
      const hojeIso = F.iso(new Date());

      if (d.gastoMensal && state.data.config && state.data.config.orcamentoAtivo === false) d.gastoMensal = Object.assign({}, d.gastoMensal, { orcamento: 0 });
      const cardGasto = d.gastoMensal ? Card("Gasto mensal", "Lançamentos", () => ctx.navigate("lancamentos"), GastoMensal(d.gastoMensal)) : null;

      const cardPatrimonio = d.contas ? Card("Patrimônio total", "Contas", () => ctx.navigate("contas"),
        ZoZo.contasShared.ContasChartCard({ data: { contas: d.contas }, ui: state.ui }, ctx, { compact: true, embedded: true, filtros: true,
          intervalo: state.ui.intervaloPatrimonio || "3M", chaveIntervalo: "intervaloPatrimonio", rotuloFiltro: "Período do patrimônio" })) : null;

      const cats = d.categorias ? (d.categorias.categorias || []).filter((c) => c.status === "regular") : [];
      const cardCats = Card("Top categorias", "Categorias", () => ctx.navigate("categorias"),
        cats.length ? topCategorias(cats, state, ctx) : UI.EmptyState("Nenhuma categoria.", { icon: "categorias" }));

      const recs = d.recorrencias ? (d.recorrencias.recorrencias || []).filter((r) => !r.pago && r.data >= hojeIso).slice(0, 5) : [];
      const cardRec = Card("Próximos lançamentos", "Recorrências", () => ctx.navigate("recorrencias"),
        recs.length
          ? h("div", { class: "list list--flush" }, recs.map((r) => L.RecurrenceRow(r, { class: "recurrence-row--compact", onClick: () => ctx.navigate("recorrencias") })))
          : UI.EmptyState("Nenhum lançamento previsto para este mês.", { icon: "recorrencias" }));

      const ultimos = d.ultimosLancamentos || [];
      const cardLanc = Card("Lançamentos recentes", "Lançamentos", () => ctx.navigate("lancamentos"),
        ultimos.length
          ? h("div", { class: "list list--flush" }, ultimos.map((l) => L.LaunchRow(l, { class: "launch-row--resumo", resumo: true, onClick: () => ctx.navigate("lancamentos", { select: { tipo: "lancamento", id: l.id } }) })))
          : UI.EmptyState("Nenhum lançamento ainda."));

      // Grade: [Gasto mensal | Patrimônio] com a mesma altura; Recentes e Top categorias começam na mesma linha
      const area = (nome, el) => (el ? h("div", { class: "dash-area dash-area--" + nome }, el) : null);
      return C.pagina("page--dashboard", saudacao,
        h("div", { class: "dash-layout" },
          area("gasto", cardGasto), area("patrimonio", cardPatrimonio),
          area("recentes", cardLanc), area("top", cardCats), area("proximos", cardRec)));
    },
  };
})(window.ZoZo);
