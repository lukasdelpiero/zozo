/* =============================================================
   ZoZo — Investimentos (seções 23–25, 29–31)
   Visual em Tailwind (tabela T abaixo; as linhas de conta e de alocação
   estão em components/list.js). TypeScript: a página segue PaginaZoZo (src/globais.d.ts).
   ============================================================= */
(function (ZoZo: ZoZoGlobal) {
  "use strict";
  const { h } = ZoZo.dom;
  const UI = ZoZo.ui;
  const L = ZoZo.list;
  const C = ZoZo.pagesComum;
  const F = ZoZo.format;
  const A = ZoZo.messages.ACTIONS;

  /* Card do gráfico: engrenagem (contas incluídas) no canto, valor no centro, gráfico e períodos embaixo.
     Área estreita (≤ 460 px): valor menor (antes a grade virava 2 colunas e o valor saía do centro). */
  const T = {
    card: "tw:relative tw:pt-6 tw:px-6 tw:pb-4",
    engrenagem: "tw:absolute tw:top-4 tw:right-4",
    selo: "tw:absolute tw:top-[22px] tw:right-14 tw:text-[11.5px] tw:text-zz-muted",
    topo: "tw:grid tw:grid-cols-1 tw:gap-4 tw:max-w-[520px] tw:mx-auto tw:area460:gap-2",
    metade: "tw:flex tw:flex-col tw:items-center tw:gap-1 tw:text-center",
    legenda: "tw:inline-flex tw:items-center tw:gap-1.5 tw:text-zz-secondary tw:text-[13px] tw:font-medium",
    valor: "money tw:text-[28px] tw:font-semibold tw:tracking-[-0.02em] tw:leading-[1.15] tw:text-center tw:area460:text-[17px]",
    grafico: "tw:relative tw:mt-4 tw:mb-2",
    filtros: "tw:flex tw:justify-center",
  };

  /** Engrenagem: "Contas incluídas" com toggles (filtra o gráfico e as alocações) */
  function abrirContasIncluidas(btn: HTMLElement, ctx: any) {
    ZoZo.menu.abrir(btn, { largura: 290, render(el) {
      const desenhar = () => {
        const inv = ZoZo.store.get().data.investimentos;
        const excluidas = ZoZo.store.get().ui.invExcluidas || [];
        ZoZo.dom.mount(el, h("div", { class: ZoZo.estrutura.menuSecao }, "Contas incluídas"),
          (inv.contas || []).map((c: any) => h("div", { class: ZoZo.estrutura.menuInterruptor },
            h("span", { class: ZoZo.estrutura.menuAmostra, style: { background: F.cor(c.cor, "var(--palette-16)") } }),
            h("span", { class: ZoZo.estrutura.menuInterruptorRotulo }, L.nomeComDigitos(c.nome, c.ultimos4Digitos)),
            UI.Toggle("", { checked: !excluidas.includes(c.id), onChange: (v: boolean) => {
              const atual = new Set(ZoZo.store.get().ui.invExcluidas || []);
              if (v) atual.delete(c.id); else atual.add(c.id);
              ZoZo.store.set({ ui: { invExcluidas: Array.from(atual) } });
              ctx.loadData("investimentos", A.getInvestimentos, { excluir: Array.from(atual) }, { force: true }).then(desenhar).catch(() => null);
            } }))));
      };
      desenhar();
    } }, { posicao: "direita", largura: 290, label: "Contas incluídas" });
  }

  function EvolucaoCard(state: EstadoZoZo, ctx: any) {
    const resumo = state.data.investimentos.resumo;
    const intervalo = state.ui.intervaloInvestimentos;
    const serie = UI.recortarSerie(resumo.serie, intervalo);
    const chart = h("div", { class: T.grafico });
    // Uma única linha: verde quando sobe, vermelha quando desce (seção 30)
    ZoZo.charts.renderLineChart(chart, [{ name: "Evolução", colorBySlope: true, points: serie.map((p: any) => ({ data: p.data, valor: p.valor })) }],
      { height: 190, ariaLabel: "Evolução dos investimentos" });

    const engrenagem = UI.IconButton("configuracoes", "Contas incluídas no gráfico", { class: T.engrenagem, expanded: false });
    engrenagem.addEventListener("click", () => abrirContasIncluidas(engrenagem, ctx));
    const qtdExcluidas = (state.ui.invExcluidas || []).length;
    return h("section", { class: [ZoZo.pecas.card, T.card], "aria-label": "Gráfico de investimentos" },
      engrenagem,
      qtdExcluidas ? h("span", { class: T.selo }, qtdExcluidas === 1 ? "1 conta oculta" : qtdExcluidas + " contas ocultas") : null,
      h("div", { class: T.topo },
        h("div", { class: T.metade },
          h("span", { class: T.legenda }, "Evolução"),
          h("span", { class: T.valor }, F.moeda(resumo.valor)),
          UI.PercentageChange(resumo.variacaoPercentual))),
      chart,
      h("div", { class: T.filtros },
        UI.FilterTabs(intervalo, (v: string) => ZoZo.store.set({ ui: { intervaloInvestimentos: v } }), { label: "Período do gráfico de investimentos" })));
  }

  const pagina: PaginaZoZo = {
    titulo: "Investimentos",
    carregar: (ctx, force) => ctx.loadData("investimentos", A.getInvestimentos, { excluir: ZoZo.store.get().ui.invExcluidas || [] }, { force }),
    deps: (s) => [s.data.investimentos, s.errors.investimentos, s.ui.intervaloInvestimentos, s.ui.gruposFechados, s.selectedItem, s.ui.invExcluidas],
    render(state, ctx) {
      const espera = C.estadoCarregamento(state, ["investimentos"], () => this.carregar(ctx, true), {
        skeleton: h("div", null, h("div", { class: ZoZo.pecas.esqueletoCard }), UI.Skeleton(4)),
      });
      if (espera) return C.pagina("page--investimentos", espera);
      const inv = state.data.investimentos;
      const sel = state.selectedItem && state.selectedItem.tipo === "conta" ? state.selectedItem.id : null;

      return C.pagina("page--investimentos",
        EvolucaoCard(state, ctx),
        UI.Section({ key: "inv:contas", title: "Contas", class: "tw:mt-5!" },
          inv.contas && inv.contas.length
            ? h("div", { class: ZoZo.pecas.listaLinhas }, inv.contas.map((c: any) => L.AccountRow(c, {
              subtitulo: "Investimento", selected: c.id === sel,
              onClick: () => ZoZo.contasShared.abrirDetalheConta(c, ctx, "investimentos"),
            })))
            : UI.EmptyState("Nenhuma conta de investimento cadastrada.", { icon: "investimentos" })),
        UI.Section({ key: "inv:alocacoes", title: "Alocações", class: "tw:mt-5!" },
          inv.alocacoes && inv.alocacoes.length
            ? h("div", { class: ZoZo.pecas.listaLinhas }, inv.alocacoes.map(L.AllocationRow))
            : UI.EmptyState("Nenhuma alocação para exibir.", { icon: "categorias" })));
    },
    selecionar(sel, ctx) {
      const id = (sel as { id?: string } | null)?.id;
      const c = (ZoZo.store.get().data.investimentos.contas || []).find((x: any) => x.id === id);
      if (c) ZoZo.contasShared.abrirDetalheConta(c, ctx, "investimentos");
    },
  };
  ZoZo.pages.investimentos = pagina;
})(window.ZoZo);
