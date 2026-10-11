/* =============================================================
   ZoZo — Investimentos (seções 23–25, 29–31)
   ============================================================= */
(function (ZoZo) {
  "use strict";
  const { h } = ZoZo.dom;
  const UI = ZoZo.ui;
  const L = ZoZo.list;
  const C = ZoZo.pagesComum;
  const F = ZoZo.format;
  const A = ZoZo.messages.ACTIONS;

  /** Engrenagem: "Contas incluídas" com toggles (filtra o gráfico e as alocações) */
  function abrirContasIncluidas(btn, ctx) {
    ZoZo.menu.abrir(btn, { largura: 290, render(el) {
      const desenhar = () => {
        const inv = ZoZo.store.get().data.investimentos;
        const excluidas = ZoZo.store.get().ui.invExcluidas || [];
        ZoZo.dom.mount(el, h("div", { class: "menu__section" }, "Contas incluídas"),
          (inv.contas || []).map((c) => h("div", { class: "menu__toggle" },
            h("span", { class: "menu__swatch", style: { background: F.cor(c.cor, "var(--palette-16)") } }),
            h("span", { class: "menu__label" }, L.nomeComDigitos(c.nome, c.ultimos4Digitos)),
            UI.Toggle("", { checked: !excluidas.includes(c.id), onChange: (v) => {
              const atual = new Set(ZoZo.store.get().ui.invExcluidas || []);
              if (v) atual.delete(c.id); else atual.add(c.id);
              ZoZo.store.set({ ui: { invExcluidas: Array.from(atual) } });
              ctx.loadData("investimentos", A.getInvestimentos, { excluir: Array.from(atual) }, { force: true }).then(desenhar).catch(() => null);
            } }))));
      };
      desenhar();
    } }, { posicao: "direita", largura: 290, label: "Contas incluídas" });
  }

  function EvolucaoCard(state, ctx) {
    const resumo = state.data.investimentos.resumo;
    const intervalo = state.ui.intervaloInvestimentos;
    const serie = UI.recortarSerie(resumo.serie, intervalo);
    const chart = h("div", { class: "chart-card__chart" });
    // Uma única linha: verde quando sobe, vermelha quando desce (seção 30)
    ZoZo.charts.renderLineChart(chart, [{ name: "Evolução", colorBySlope: true, points: serie.map((p) => ({ data: p.data, valor: p.valor })) }],
      { height: 190, ariaLabel: "Evolução dos investimentos" });

    const engrenagem = UI.IconButton("configuracoes", "Contas incluídas no gráfico", { class: "chart-card__gear", expanded: false });
    engrenagem.addEventListener("click", () => abrirContasIncluidas(engrenagem, ctx));
    const qtdExcluidas = (state.ui.invExcluidas || []).length;
    return h("section", { class: "card chart-card", "aria-label": "Gráfico de investimentos" },
      engrenagem,
      qtdExcluidas ? h("span", { class: "chart-card__badge" }, qtdExcluidas === 1 ? "1 conta oculta" : qtdExcluidas + " contas ocultas") : null,
      h("div", { class: "chart-card__top chart-card__top--single" },
        h("div", { class: "chart-card__half" },
          h("span", { class: "chart-card__legend" }, "Evolução"),
          h("span", { class: "chart-card__value money" }, F.moeda(resumo.valor)),
          UI.PercentageChange(resumo.variacaoPercentual))),
      chart,
      h("div", { class: "chart-card__filters" },
        UI.FilterTabs(intervalo, (v) => ZoZo.store.set({ ui: { intervaloInvestimentos: v } }), { label: "Período do gráfico de investimentos" })));
  }

  ZoZo.pages.investimentos = {
    titulo: "Investimentos",
    carregar: (ctx, force) => ctx.loadData("investimentos", A.getInvestimentos, { excluir: ZoZo.store.get().ui.invExcluidas || [] }, { force }),
    deps: (s) => [s.data.investimentos, s.errors.investimentos, s.ui.intervaloInvestimentos, s.ui.gruposFechados, s.selectedItem, s.ui.invExcluidas],
    render(state, ctx) {
      const espera = C.estadoCarregamento(state, ["investimentos"], () => this.carregar(ctx, true), {
        skeleton: h("div", null, h("div", { class: "card skeleton-card" }), UI.Skeleton(4)),
      });
      if (espera) return C.pagina("page--investimentos", espera);
      const inv = state.data.investimentos;
      const sel = state.selectedItem && state.selectedItem.tipo === "conta" ? state.selectedItem.id : null;

      return C.pagina("page--investimentos",
        EvolucaoCard(state, ctx),
        UI.Section({ key: "inv:contas", title: "Contas" },
          inv.contas && inv.contas.length
            ? h("div", { class: "list" }, inv.contas.map((c) => L.AccountRow(c, {
              subtitulo: "Investimento", selected: c.id === sel,
              onClick: () => ZoZo.contasShared.abrirDetalheConta(c, ctx, "investimentos"),
            })))
            : UI.EmptyState("Nenhuma conta de investimento cadastrada.", { icon: "investimentos" })),
        UI.Section({ key: "inv:alocacoes", title: "Alocações" },
          inv.alocacoes && inv.alocacoes.length
            ? h("div", { class: "list" }, inv.alocacoes.map(L.AllocationRow))
            : UI.EmptyState("Nenhuma alocação para exibir.", { icon: "categorias" })));
    },
    selecionar(sel, ctx) {
      const c = (ZoZo.store.get().data.investimentos.contas || []).find((x) => x.id === sel.id);
      if (c) ZoZo.contasShared.abrirDetalheConta(c, ctx, "investimentos");
    },
  };
})(window.ZoZo);
