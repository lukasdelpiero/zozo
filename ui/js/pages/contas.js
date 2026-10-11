/* =============================================================
   ZoZo — Contas (seções 18–22, 26–28)
   ============================================================= */
(function (ZoZo) {
  "use strict";
  const { h, mount } = ZoZo.dom;
  const UI = ZoZo.ui;
  const L = ZoZo.list;
  const C = ZoZo.pagesComum;
  const F = ZoZo.format;
  const A = ZoZo.messages.ACTIONS;

  const GRUPOS = [
    { key: "cartoes", titulo: "Cartões de crédito", tipos: ["cartao"] },
    { key: "bancarias", titulo: "Contas bancárias", tipos: ["corrente", "poupanca"] },
    { key: "investimentos", titulo: "Investimentos", tipos: ["investimento"] },
    { key: "emprestimos", titulo: "Empréstimos", tipos: ["emprestimo"] },
    { key: "outros", titulo: "Outros", tipos: ["outros"] },
  ];

  /* ---------- Card do gráfico de Contas (Ativos × Passivos) ---------- */
  function metade(cls, titulo, dados) {
    return h("div", { class: ["chart-card__half", cls] },
      h("span", { class: "chart-card__legend" }, h("span", { class: "legend-dot", "aria-hidden": "true" }), titulo),
      h("span", { class: "chart-card__value money" }, F.moeda(dados.valor)),
      UI.PercentageChange(dados.variacaoPercentual));
  }

  function ContasChartCard(state, ctx, opts) {
    const o = opts || {};
    const resumo = state.data.contas.resumo;
    const intervalo = o.intervalo || state.ui.intervaloContas;
    const serie = UI.recortarSerie(resumo.serie, intervalo);
    const chart = h("div", { class: "chart-card__chart" });
    const css = getComputedStyle(document.documentElement);
    ZoZo.charts.renderLineChart(chart, [
      // degradê: o de Ativos desce até a linha de Passivos; o de Passivos, até o fim do gráfico
      { name: "Ativos", color: css.getPropertyValue("--color-assets").trim(), points: serie.map((p) => ({ data: p.data, valor: p.ativos })) },
      { name: "Passivos", color: css.getPropertyValue("--color-liabilities").trim(), points: serie.map((p) => ({ data: p.data, valor: p.passivos })) },
    ], { height: o.alturaGrafico || (o.compact ? 150 : 190), independentScale: true, ariaLabel: "Evolução de ativos e passivos" });

    return h("section", { class: ["chart-card", !o.embedded && "card", o.compact && "chart-card--compact", o.embedded && "chart-card--embedded"], "aria-label": "Gráfico de contas" },
      h("div", { class: "chart-card__top" },
        metade("chart-card__half--assets", "Ativos", resumo.ativos),
        metade("chart-card__half--liabilities", "Passivos", resumo.passivos)),
      chart,
      o.compact && !o.filtros ? null : h("div", { class: "chart-card__filters" },
        UI.FilterTabs(intervalo, (v) => ZoZo.store.set({ ui: { [o.chaveIntervalo || "intervaloContas"]: v } }), { label: o.rotuloFiltro || "Período do gráfico de contas" })));
  }

  /** "+" da barra superior: escolhe o tipo de conta (como no Copilot) */
  function botaoNovaConta(ctx) {
    const btn = UI.IconButton("mais", "Nova conta", { onPrimary: true, expanded: false });
    btn.setAttribute("aria-haspopup", "menu");
    btn.addEventListener("click", () => ZoZo.menu.abrir(btn, [
      { icone: "banco", label: "Bancos", descricao: "Conta corrente e poupança", onClick: () => ZoZo.modais.novaConta(ctx, "corrente") },
      { icone: "cartao", label: "Cartões de crédito", descricao: "Faturas e limites", onClick: () => ZoZo.modais.novaConta(ctx, "cartao") },
      { icone: "investimentos", label: "Investimentos", descricao: "Corretoras, previdência, Tesouro", onClick: () => ZoZo.modais.novaConta(ctx, "investimento") },
      { icone: "emprestimo", label: "Empréstimos", descricao: "Financiamentos e empréstimos", onClick: () => ZoZo.modais.novaConta(ctx, "emprestimo") },
      { icone: "carteira", label: "Outros", descricao: "Dinheiro e outros bens", onClick: () => ZoZo.modais.novaConta(ctx, "outros") },
    ], { posicao: "direita", largura: 280, label: "Nova conta" }));
    return btn;
  }

  /* ---------- Painel de detalhes de uma conta ---------- */
  /**
   * Cartão de crédito: fechamento e vencimento — para todos os meses ou só para um mês.
   * Os DOIS são obrigatórios (não dá para mudar só um); a mesma regra vale no serviço de dados.
   */
  function editarCiclo(conta, ctx, aoSalvar) {
    const hoje = new Date();
    const meses = Array.from({ length: 13 }, (_, i) => { const d = new Date(hoje.getFullYear(), hoje.getMonth() + i - 1, 1); return F.iso(d).slice(0, 7); });
    let modo = "fixo", mes = meses[1];
    const ciclo = (m) => (conta.ciclos && conta.ciclos[m]) || { fechamento: conta.fechamento, vencimento: conta.vencimento };
    ZoZo.modais.janela({
      titulo: "Fechamento e vencimento",
      classe: "modal--nova-conta",
      passo: function passo(api) {
        const diaInput = (rotulo, valor) => { const i = UI.Input({ type: "number", inputmode: "numeric", placeholder: "1 a 31", value: valor || "" }); i.min = "1"; i.max = "31"; i.setAttribute("aria-label", rotulo); return i; };
        const atual = ciclo(modo === "mes" ? mes : null);
        const fech = diaInput("Dia do fechamento", atual.fechamento), venc = diaInput("Dia do vencimento", atual.vencimento);
        const erro = h("p", { class: "form-error", role: "alert" });
        let salvarBtn = null;
        const valido = (v) => /^\d{1,2}$/.test(v.trim()) && Number(v) >= 1 && Number(v) <= 31;
        const conferir = () => { if (salvarBtn) salvarBtn.disabled = !(valido(fech.value) && valido(venc.value)); };
        [fech, venc].forEach((i) => i.addEventListener("input", () => { erro.textContent = ""; conferir(); }));
        const mesSel = modo === "mes" ? UI.Select(meses.map((m) => ({ value: m, label: F.mesAno(m + "-01") })), { value: mes, ariaLabel: "Mês" }) : null;
        if (mesSel) mesSel.addEventListener("change", () => { mes = mesSel.value; api.ir(passo); });
        return {
          titulo: "Fechamento e vencimento",
          corpo: h("div", { class: "zm__form" },
            UI.Segmented([{ value: "fixo", label: "Todos os meses" }, { value: "mes", label: "Só um mês" }], modo, (v) => { modo = v; api.ir(passo); },
              { label: "Vale para", class: "segmented--pilulas" }),
            mesSel ? UI.Field("Mês", mesSel) : null,
            h("div", { class: "form-row form-row--2" }, UI.Field("Fechamento (dia)", fech), UI.Field("Vencimento (dia)", venc)),
            h("p", { class: "field__hint" }, "Fechamento e vencimento são alterados juntos."),
            erro),
          botoes: [
            { label: "Cancelar", onClick: () => api.fechar() },
            { label: "Salvar", primario: true, ref: (b) => { salvarBtn = b; conferir(); }, onClick: (btn) => {
              if (!(valido(fech.value) && valido(venc.value))) { erro.textContent = ZoZo.messages.FRIENDLY.CARD_CYCLE_INVALID; return; }
              btn.disabled = true;
              ctx.bridge.request(A.updateCicloCartao, { id: conta.id, fechamento: fech.value.trim(), vencimento: venc.value.trim(), modo, mes: modo === "mes" ? mes : undefined })
                .then((r) => { api.fechar(); return ctx.recarregarTudo().then(() => aoSalvar && aoSalvar(r.conta)); })
                .catch((e) => { erro.textContent = e.friendly; btn.disabled = false; });
            } },
          ],
        };
      },
    });
  }

  function abrirDetalheConta(conta, ctx, origem, opts) {
    let intervalo = conta.tipo === "investimento" ? "1M" : "3M";
    const excluir = () => ZoZo.feedback.confirmarExclusao("Excluir conta?", "Tem certeza de que deseja excluir esta conta?")
      .then((ok) => ok && ctx.bridge.request(A.deleteConta, { id: conta.id }).then(() => { ctx.detail.close({ silencioso: true }); ctx.toast("Conta excluída."); return ctx.recarregarTudo(); })
        .catch((e) => ctx.toast(e.friendly, { tone: "error" })));
    const ocultar = () => ctx.bridge.request(A.updateConta, { id: conta.id, oculta: !conta.oculta }).then(() => {
      ctx.toast(conta.oculta ? "Conta visível novamente." : "Conta oculta: ela não entra mais nos totais.");
      ctx.detail.close({ silencioso: true });
      return ctx.recarregarTudo();
    }).catch((e) => ctx.toast(e.friendly, { tone: "error" }));
    ctx.detail.open({
      title: conta.tipo === "investimento" ? "Investimento" : conta.tipo === "cartao" ? "Cartão de crédito"
        : (L.SUBTITULO_CONTA[conta.tipo] ? "Conta " + L.SUBTITULO_CONTA[conta.tipo].toLowerCase() : "Conta"),
      selected: { tipo: "conta", id: conta.id },
      voltar: opts && opts.voltar,
      botoes: conta.tipo === "cartao" ? [{ label: "Editar fechamento", onClick: () => editarCiclo(conta, ctx, (c) => abrirDetalheConta(Object.assign({}, conta, c), ctx, origem, opts)) }] : [],
      menu: [
        { label: conta.oculta ? "Mostrar conta" : "Ocultar conta", onClick: ocultar },
        { separador: true },
        { label: "Excluir conta", perigo: true, onClick: excluir },
      ],
      render(body) {
        const listaEl = h("div", { class: "detail-list" }, UI.Skeleton(3, { short: true }));
        const graficoEl = h("div", { class: "detail-chart" });
        const filtrosEl = h("div", { class: "chart-card__filters" });
        const difEl = h("span");
        let serie = [];
        const desenhar = () => {
          const recorte = UI.recortarSerie(serie, intervalo);
          const subiu = recorte.length > 1 && recorte[recorte.length - 1].valor >= recorte[0].valor;
          const cs = getComputedStyle(document.documentElement);
          ZoZo.charts.renderLineChart(graficoEl, [{ name: conta.nome, color: cs.getPropertyValue(subiu ? "--color-chart-up" : "--color-chart-down").trim(), points: recorte.map((p) => ({ data: p.data, valor: p.valor })) }],
            { height: 160, area: true, ariaLabel: "Evolução do saldo" });
          mount(filtrosEl, UI.FilterTabs(intervalo, (v) => { intervalo = v; desenhar(); }, { label: "Período do gráfico da conta" }));
        };
        mount(body,
          // Linha 1: ícone pequeno + 4 dígitos + tipo ........ percentuais
          // Linha 2: nome ........................................ valor
          h("div", { class: "ph" },
            h("div", { class: "ph__top" },
              h("span", { class: "ph__meta" }, UI.AccountIcon(conta),
                conta.ultimos4Digitos ? h("span", { class: "ph__digits" }, conta.ultimos4Digitos) : null,
                h("span", { class: "ph__type" }, conta.oculta ? "Ocultado" : conta.tipo === "investimento" ? conta.tipoInvestimento || "Investimento" : L.SUBTITULO_CONTA[conta.tipo] || (conta.tipo === "cartao" ? "Cartão de crédito" : "Outros"))),
              h("span", { class: "ph__chips" }, difEl, UI.PercentageChange(conta.variacaoPercentual))),
            h("div", { class: "ph__main" },
              ZoZo.inline.texto({ valor: conta.nome, rotulo: "Nome da conta", max: ZoZo.regras.limiteNome, classe: "ph__name",
                aoSalvar: (v) => ctx.bridge.request(A.updateConta, { id: conta.id, nome: v }).then(() => { ctx.toast("Nome alterado."); return ctx.recarregarTudo(); }) }),
              ZoZo.inline.dinheiro({ valor: conta.valor, rotulo: "Saldo da conta", permitirNegativo: true, classe: "ph__value",
                aoSalvar: (v) => ctx.bridge.request(A.updateConta, { id: conta.id, saldo: v }).then(() => { ctx.toast("Saldo atualizado."); return ctx.recarregarTudo(); }) })),
            conta.limite ? h("div", { class: "ph__extra" }, F.moeda(conta.limite) + " de limite") : null,
            // cartão: fechamento e vencimento do mês atual (de todos os meses ou definidos só para este mês)
            conta.tipo === "cartao" && conta.cicloAtual && conta.cicloAtual.fechamento ? h("div", { class: "ph__extra" },
              "Fecha dia " + conta.cicloAtual.fechamento + " · vence dia " + conta.cicloAtual.vencimento + (conta.cicloAtual.soEsteMes ? " (só neste mês)" : "")) : null),
          graficoEl, filtrosEl,
          C.detalheSecao("Transações", listaEl));

        ctx.bridge.request(A.getContaHistorico, { id: conta.id }).then((r) => {
          serie = r.serie;
          const dif = r.diferenca;
          mount(difEl, h("span", { class: ["pct", dif > 0 ? "pct--up" : dif < 0 ? "pct--down" : "pct--flat"] }, (dif > 0 ? "+ " : dif < 0 ? "− " : "") + F.moeda(dif)));
          desenhar();
        }).catch(() => mount(graficoEl, h("p", { class: "muted" }, ZoZo.messages.FRIENDLY.LOAD_FAILED)));

        ctx.loadData("lancamentos", A.getLancamentos).then((d) => {
          const itens = d.lancamentos.filter((l) => l.contaId === conta.id).slice(0, 8);
          mount(listaEl, itens.length
            ? L.ListaPainel(itens, { onClick: (l) => ctx.navigate("lancamentos", { select: { tipo: "lancamento", id: l.id } }) })
            : UI.EmptyState("Nenhuma transação nesta conta."));
        }).catch((e) => mount(listaEl, UI.ErrorState(e.friendly)));
        void origem;
      },
    });
  }

  /* ---------- Página ---------- */
  ZoZo.pages.contas = {
    titulo: "Contas",
    topbar: (ctx) => [botaoNovaConta(ctx)],
    carregar: (ctx, force) => ctx.loadData("contas", A.getContas, null, { force }),
    deps: (s) => [s.data.contas, s.errors.contas, s.ui.intervaloContas, s.ui.gruposFechados, s.selectedItem, s.ui.mostrarOcultas],
    render(state, ctx) {
      const espera = C.estadoCarregamento(state, ["contas"], () => this.carregar(ctx, true), {
        skeleton: h("div", null, h("div", { class: "card skeleton-card" }), UI.Skeleton(6)),
      });
      if (espera) return C.pagina("page--contas", espera);
      const contas = state.data.contas.contas || [];
      const sel = state.selectedItem && state.selectedItem.tipo === "conta" ? state.selectedItem.id : null;

      const mostrar = state.ui.mostrarOcultas || {};
      const secoes = GRUPOS.map((g) => {
        const doGrupo = contas.filter((c) => g.tipos.includes(c.tipo));
        if (!doGrupo.length) return null;
        const temOcultas = doGrupo.some((c) => c.oculta);
        const exibindo = !!mostrar[g.key];
        const itens = doGrupo.filter((c) => !c.oculta || exibindo);
        const olho = temOcultas ? h("button", {
          type: "button", class: ["icon-btn", "icon-btn--sm", "section__eye", exibindo && "is-active"],
          "aria-pressed": String(exibindo), title: exibindo ? "Esconder contas ocultas" : "Mostrar contas ocultas",
          "aria-label": exibindo ? "Esconder contas ocultas" : "Mostrar contas ocultas",
          onClick: (e) => { e.stopPropagation(); ZoZo.store.set({ ui: { mostrarOcultas: Object.assign({}, mostrar, { [g.key]: !exibindo }) } }); },
        }, ZoZo.icons.icon(exibindo ? "olho" : "olho-fechado", { size: 15 })) : null;
        return UI.Section({ key: "contas:" + g.key, title: g.titulo, adorno: olho },
          itens.length ? null : h("p", { class: "section__hint" }, "Todas as contas deste grupo estão ocultas."),
          h("div", { class: "list" }, itens.map((c) => L.AccountRow(c, {
            selected: c.id === sel,
            onClick: () => abrirDetalheConta(c, ctx, "contas"),
          }))));
      });

      return C.pagina("page--contas",
        ContasChartCard(state, ctx),
        contas.length ? secoes
          : UI.EmptyState("Nenhuma conta cadastrada.", { icon: "contas", action: { label: "Nova conta", icon: "mais", onClick: () => ZoZo.modais.novaConta(ctx, "corrente") } }));
    },
    selecionar(sel, ctx) {
      const c = (ZoZo.store.get().data.contas.contas || []).find((x) => x.id === sel.id);
      if (c) abrirDetalheConta(c, ctx, "contas");
    },
  };

  ZoZo.contasShared = { ContasChartCard, abrirDetalheConta };
})(window.ZoZo);
