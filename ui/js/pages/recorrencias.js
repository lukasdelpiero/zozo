/* =============================================================
   ZoZo — Recorrências (seções 41–43)
   ============================================================= */
(function (ZoZo) {
  "use strict";
  const { h, mount } = ZoZo.dom;
  const UI = ZoZo.ui;
  const L = ZoZo.list;
  const C = ZoZo.pagesComum;
  const F = ZoZo.format;
  const A = ZoZo.messages.ACTIONS;

  function abrirDetalhe(r, ctx, opts) {
    // A origem da série (lançamento que define nome, valor, categoria e frequência)
    const lancs = ZoZo.store.get().data.lancamentos;
    if (!lancs) return ctx.loadData("lancamentos", A.getLancamentos).then(() => abrirDetalhe(r, ctx, opts));
    const origem = (lancs.lancamentos || []).find((l) => l.id === r.serieId);
    const reabrir = () => ctx.loadData("recorrencias", A.getRecorrencias, null, { force: true }).then((d) => {
      // A série pode ter mudado de seção (ex.: virou trimestral sem ocorrência neste mês, ou foi arquivada)
      const todas = (d.recorrencias || []).concat(d.proximas || [], d.arquivadas || []);
      const atual = todas.find((x) => x.id === r.id) || todas.find((x) => x.serieId === r.serieId);
      if (atual) abrirDetalhe(atual, ctx, opts);
    });
    const salvarOrigem = (campos) => {
      if (!origem) return Promise.reject(new ZoZo.messages.BridgeError("OPERATION_FAILED"));
      const base = { data: origem.data, descricao: origem.descricao, valor: origem.valor, tipo: origem.tipo, contaId: origem.contaId, categoriaId: origem.categoriaId,
        perfilId: origem.perfilId, notas: origem.notas, recorrencia: origem.recorrencia, parcelaAtual: origem.parcelaAtual, parcelaTotal: origem.parcelaTotal };
      return ctx.bridge.request(A.updateLancamento, { id: origem.id, lancamento: Object.assign(base, campos) })
        .then(() => { Object.assign(origem, campos); ctx.toast("Recorrência salva."); return ctx.recarregarTudo(); });
    };

    // Título: frequência com menu (parcelada fica fixa)
    const FREQ = ZoZo.servico.FREQUENCIAS;
    const freqBtn = h("button", { type: "button", class: ["tipo-select", r.recorrencia === "parcelada" && "tipo-select--fixo"], "aria-haspopup": r.recorrencia === "parcelada" ? undefined : "menu" },
      h("span", null, r.recorrencia === "parcelada" ? "Recorrência parcelada" : "Recorrência " + ((FREQ[r.recorrencia] || FREQ.mensal).rotulo || "").toLowerCase()),
      r.recorrencia === "parcelada" ? null : ZoZo.icons.icon("chevron-down", { size: 14, stroke: 2.25 }));
    if (r.recorrencia !== "parcelada") {
      freqBtn.addEventListener("click", () => ZoZo.menu.abrir(freqBtn, Object.keys(FREQ).map((k) => ({
        label: FREQ[k].texto, check: k === r.recorrencia,
        onClick: () => { if (k !== r.recorrencia) salvarOrigem({ recorrencia: k }).then(reabrir).catch((e) => ctx.toast(e.friendly, { tone: "error" })); },
      })), { posicao: "esquerda", label: "Tipo de recorrência", checkEsquerda: true }));
    }

    // Categoria acima do nome (menu com + Nova categoria)
    const cats = ((ZoZo.store.get().data.categorias || {}).categorias) || [];
    const catBtn = h("button", { type: "button", class: "hero-cat-btn", "aria-haspopup": "menu", "aria-label": "Alterar categoria" },
      r.categoria ? UI.CategoryLabel(r.categoria, { pill: true }) : h("span", { class: "lp-add" }, ZoZo.icons.icon("mais", { size: 14 })));
    catBtn.addEventListener("click", () => ZoZo.menu.abrir(catBtn, cats.map((c) => ({
      render: (api) => h("button", { type: "button", class: ["menu__item", c.id === r.categoriaId && "is-checked"], onClick: () => { api.fechar(); salvarOrigem({ categoriaId: c.id }).then(reabrir).catch((e) => ctx.toast(e.friendly, { tone: "error" })); } }, UI.CategoryLabel(c, { pill: true })),
    })).concat([{ separador: true }, { icone: "mais", label: "Nova categoria", onClick: () => ZoZo.modais.novaCategoria(ctx, { aoCriar: (c) => salvarOrigem({ categoriaId: c.id }).then(reabrir) }) }]),
    { posicao: "esquerda", largura: 260, label: "Categoria" }));

    const editarOrigem = () => ctx.loadData("lancamentos", A.getLancamentos).then((d) => {
      const origem = d.lancamentos.find((l) => l.id === r.serieId);
      if (origem) ZoZo.lancamentoPainel.abrir(origem, ctx, { voltar: () => abrirDetalhe(r, ctx, opts) });
    });
    const pagar = (btn) => {
      btn.disabled = true;
      ctx.bridge.request(A.pagarRecorrencia, { serieId: r.serieId, mes: r.mes, chave: r.chave }).then(() => {
        ctx.detail.close({ silencioso: true });
        ctx.toast("Pagamento registrado.");
        return ctx.recarregarTudo();
      }).catch((e) => { btn.disabled = false; ctx.toast(e.friendly, { tone: "error" }); });
    };
    // Arquivar: deixa de aparecer nos próximos meses (pode ser desfeito)
    const encerrar = (reabrir) => ctx.bridge.request(A.encerrarRecorrencia, { serieId: r.serieId, reabrir: !!reabrir }).then(() => {
      ctx.detail.close({ silencioso: true });
      ctx.toast(reabrir ? "Recorrência desarquivada." : "Recorrência arquivada. Ela não aparece nos próximos meses.");
      return ctx.recarregarTudo();
    }).catch((e) => ctx.toast(e.friendly, { tone: "error" }));
    const excluirRecorrencia = () => ZoZo.feedback.confirmarExclusao("Excluir recorrência?",
      "Isso removerá a recorrência e o vínculo com as transações. Não é possível desfazer essa ação.",
      { cancelar: "Manter recorrência", confirmar: "Excluir recorrência" })
      .then((ok) => ok && ctx.bridge.request(A.excluirRecorrencia, { serieId: r.serieId }).then(() => {
        ctx.detail.close({ silencioso: true });
        ctx.toast("Recorrência excluída. Os lançamentos continuam em Lançamentos.");
        return ctx.recarregarTudo();
      }).catch((e) => ctx.toast(e.friendly, { tone: "error" })));

    ctx.detail.open({
      tituloNode: freqBtn,
      title: "Recorrência",
      selected: { tipo: "recorrencia", id: r.id },
      voltar: opts && opts.voltar,
      menu: [
        { label: r.encerrada ? "Desarquivar" : "Arquivar", onClick: () => encerrar(!!r.encerrada) },
        { label: "Editar recorrência", onClick: editarOrigem },
        { separador: true },
        { label: "Excluir recorrência", perigo: true, onClick: excluirRecorrencia },
      ],
      render(body) {
        const grafico = h("div", { class: "detail-chart" });
        const historico = h("div", { class: "detail-list" }, UI.Skeleton(3, { short: true }));
        mount(body,
          // Linha 1: categoria ........ situação  |  Linha 2: nome ........ valor
          h("div", { class: "ph" },
            h("div", { class: "ph__top" },
              catBtn,
              r.encerrada ? h("span", { class: "status-chip status-chip--neutral" }, "Arquivada")
                : r.proxima ? h("span", { class: "status-chip status-chip--neutral" }, "Próxima: " + F.dataCurta(r.data))
                  : h("span", { class: ["status-chip", r.pago ? "status-chip--ok" : "status-chip--pending"] }, r.pago ? "Pago" : "Pendente")),
            h("div", { class: "ph__main" },
              ZoZo.inline.texto({ valor: r.descricao, rotulo: "Nome da recorrência", max: ZoZo.regras.limiteNome, classe: "ph__name", aoSalvar: (v) => salvarOrigem({ descricao: v }) }),
              ZoZo.inline.dinheiro({ valor: origem ? origem.valor : r.valor, rotulo: "Valor da recorrência", permitirZero: false, classe: "ph__value", aoSalvar: (v) => salvarOrigem({ valor: v }) }))),
          r.pago || r.proxima || r.encerrada ? null : h("div", { class: "detail-actions" }, UI.Button("Registrar pagamento", { variant: "primary", icon: "check", onClick: (e) => pagar(e.currentTarget) })),
          grafico,
          C.detalheSecao(null,
            C.detalheLinha("Recorrência", r.recorrencia === "parcelada" ? "Parcelada" : (ZoZo.servico.FREQUENCIAS[r.recorrencia] || ZoZo.servico.FREQUENCIAS.mensal).texto),
            r.recorrencia === "parcelada" ? C.detalheLinha("Parcela", r.parcela + " de " + r.parcelaTotal) : null,
            ZoZo.servico.FREQUENCIAS[r.recorrencia] && ZoZo.servico.FREQUENCIAS[r.recorrencia].dias ? null : C.detalheLinha("Dia do mês", String(Number(r.data.slice(8, 10))))),
          C.detalheSecao("Lançamentos", historico));

        ctx.bridge.request(A.getSerieRecorrencia, { serieId: r.serieId }).then((d) => {
          const cs = getComputedStyle(document.documentElement);
          const cor = cs.getPropertyValue("--color-progress-over").trim();
          ZoZo.charts.renderLineChart(grafico, [{ name: "Valor", color: cor, pontos: true,
            points: d.pontos.map((p) => ({ data: p.data, valor: p.valor, vazio: !p.pago })) }], {
            height: 150, ariaLabel: "Valores da recorrência por mês",
            rotuloX: (p) => F.mesAbrev(F.parseData(p.data).getMonth()) + " " + String(F.parseData(p.data).getFullYear()).slice(2),
            rotuloTooltip: (p) => F.mesNome(F.parseData(p.data).getMonth()) + " " + F.parseData(p.data).getFullYear(),
          });
          mount(historico, d.lancamentos.length
            ? L.ListaPainel(d.lancamentos, { onClick: (l) => ctx.navigate("lancamentos", { select: { tipo: "lancamento", id: l.id } }) })
            : UI.EmptyState("Nenhum pagamento registrado ainda."));
        }).catch(() => mount(historico, UI.ErrorState(ZoZo.messages.FRIENDLY.LOAD_FAILED)));
      },
    });
  }

  const novaRecorrencia = (ctx) => ZoZo.modais.novaRecorrencia(ctx);

  ZoZo.pages.recorrencias = {
    titulo: "Recorrências",
    topbar: (ctx) => [UI.IconButton("mais", "Nova recorrência", { onPrimary: true, onClick: () => novaRecorrencia(ctx) })],
    carregar: (ctx, force) => ctx.loadData("recorrencias", A.getRecorrencias, null, { force }),
    deps: (s) => [s.data.recorrencias, s.errors.recorrencias, s.ui.gruposFechados, s.selectedItem],
    render(state, ctx) {
      const espera = C.estadoCarregamento(state, ["recorrencias"], () => this.carregar(ctx, true), {
        skeleton: h("div", null, h("div", { class: "card skeleton-card skeleton-card--short" }), UI.Skeleton(8)),
      });
      if (espera) return C.pagina("page--recorrencias", espera);
      const d = state.data.recorrencias;
      const itens = d.recorrencias || [];
      const sel = state.selectedItem && state.selectedItem.tipo === "recorrencia" ? state.selectedItem.id : null;

      return C.pagina("page--recorrencias",
        C.cardResumoDonut({
          ariaLabel: "Distribuição das recorrências por categoria",
          esquerda: { valor: d.resumo ? d.resumo.restante : 0, label: "a pagar" },
          direita: { valor: d.resumo ? d.resumo.pago : 0, label: "já pago" },
          // Anel de progresso: completa até a proporção já paga
          progresso: d.resumo && (d.resumo.pago + d.resumo.restante) > 0 ? d.resumo.pago / (d.resumo.pago + d.resumo.restante) : 0,
          tituloProgresso: "Já pago: " + F.moeda(d.resumo ? d.resumo.pago : 0),
        }),
        UI.Section({ key: "rec:mes", title: "Este mês" },
          itens.length
            ? h("div", { class: "list" }, itens.map((r) => L.RecurrenceRow(r, { selected: r.id === sel, onClick: () => abrirDetalhe(r, ctx) })))
            : UI.EmptyState("Nenhuma recorrência neste mês.",
              { icon: "recorrencias", action: { label: "Nova recorrência", icon: "mais", onClick: () => novaRecorrencia(ctx) } })),
        (d.proximas || []).length ? UI.Section({ key: "rec:proximas", title: "Próximos meses" },
          h("div", { class: "list" }, d.proximas.map((r) => L.RecurrenceRow(r, { selected: r.id === sel, onClick: () => abrirDetalhe(r, ctx) })))) : null,
        (d.arquivadas || []).length ? UI.Section({ key: "rec:arquivadas", title: "Arquivadas" },
          h("div", { class: "list" }, d.arquivadas.map((r) => L.RecurrenceRow(r, { selected: r.id === sel, semData: true, onClick: () => abrirDetalhe(r, ctx) })))) : null);
    },
  };

  ZoZo.recorrenciasShared = { abrirDetalhe };
})(window.ZoZo);
