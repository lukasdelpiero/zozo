/* =============================================================
   ZoZo — Contas (seções 18–22, 26–28)
   Visual em Tailwind (tabela T abaixo; a linha da conta está em
   components/list.ts; peças compartilhadas em components/pecas.ts).
   ============================================================= */
(function (ZoZo: ZoZoGlobal) {
  "use strict";
  const { h, mount } = ZoZo.dom;
  const UI = ZoZo.ui;
  const L = ZoZo.list;
  const C = ZoZo.pagesComum;
  const F = ZoZo.format;
  const A = ZoZo.messages.ACTIONS;

  /* ---------------- Visual (Tailwind; classes escritas por inteiro) ---------------- */
  const T = {
    secao: "tw:mt-5!",
    lista: "tw:flex tw:flex-col",
    olho: "tw:ml-0.5 tw:text-zz-muted",
    olhoAtivo: "tw:ml-0.5 tw:text-zz-primary",
    aviso: "tw:px-4 tw:pb-2 tw:text-zz-muted tw:text-[13px]",
    // cartão do gráfico Ativos × Passivos (também no Dashboard, embutido)
    cartao: "tw:relative tw:rounded-[20px]",
    cartaoPadding: "tw:pt-6 tw:px-6 tw:pb-4",
    cartaoEmbutido: "tw:p-0",
    topo: "tw:grid tw:grid-cols-[1fr_1fr] tw:gap-4 tw:max-w-[520px] tw:mx-auto tw:area460:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] tw:area460:gap-2",
    metade: "tw:flex tw:flex-col tw:items-center tw:gap-1 tw:text-center",
    legenda: "tw:inline-flex tw:items-center tw:gap-1.5 tw:text-zz-cinza tw:text-[13px] tw:font-medium",
    legendaEmbutida: "tw:inline-flex tw:items-center tw:gap-1.5 tw:text-zz-cinza tw:text-[.9375rem] tw:font-[550]",      // no Dashboard
    pontoAtivos: "tw:size-[7px] tw:rounded-[50%] tw:bg-(--color-assets)",
    pontoPassivos: "tw:size-[7px] tw:rounded-[50%] tw:bg-(--color-liabilities)",
    valor: "money tw:text-[28px] tw:font-semibold tw:tracking-[-0.02em] tw:leading-[1.15] tw:text-center tw:area460:text-[17px]",
    valorEmbutido: "money tw:text-[1.5rem] tw:font-[550] tw:tracking-[-0.02em] tw:leading-[1.15] tw:text-center",
    grafico: "tw:relative tw:mt-4 tw:mb-2",
    filtros: "tw:flex tw:justify-center",
    // painel: 4 últimos dígitos editáveis no lugar (sem borda, fundo transparente)
    digitos: "tw:[field-sizing:content] tw:min-w-[3ch] tw:max-w-[5ch] tw:p-0 tw:[border:0] tw:rounded-sm tw:bg-transparent tw:text-inherit tw:text-[15px] tw:font-[550] "
      + "tw:placeholder:text-zz-muted tw:focus:outline-none tw:focus:shadow-[0_0_0_2px_var(--color-primary-soft)] tw:aria-invalid:shadow-[0_0_0_2px_var(--color-negative)]",
    // painel do cartão: editar fechamento no próprio painel
    cicloArea: "tw:flex tw:flex-col tw:items-end tw:gap-1.5",
    cicloModo: "tw:inline-flex tw:items-center tw:gap-1.5 tw:h-7 tw:px-2.5 tw:py-0 tw:border tw:border-zz-border tw:rounded-lg tw:bg-zz-surface "
      + "tw:text-[13px] tw:font-medium tw:hover:border-zz-border-strong",
    cicloMes: "tw:h-7 tw:w-auto tw:text-[13px]",
    cicloDias: "tw:flex tw:items-end tw:gap-2",
    cicloCampo: "tw:flex tw:flex-col tw:items-end tw:gap-0.5",
    cicloRotulo: "tw:text-[12px] tw:text-zz-secondary",
    cicloData: "tw:w-[150px] tw:h-9",
    cicloErro: "tw:m-0 tw:text-right tw:text-[13px] tw:text-(--color-negative)",
  };

  const GRUPOS = [
    { key: "cartoes", titulo: "Cartões de crédito", tipos: ["cartao"] },
    { key: "bancarias", titulo: "Contas bancárias", tipos: ["corrente", "poupanca"] },
    { key: "investimentos", titulo: "Investimentos", tipos: ["investimento"] },
    { key: "emprestimos", titulo: "Empréstimos", tipos: ["emprestimo"] },
    { key: "outros", titulo: "Outros", tipos: ["outros"] },
  ];

  /* ---------- Card do gráfico de Contas (Ativos × Passivos) ---------- */
  function metade(ponto: string, titulo: string, dados: ValorVariacao, embutido: boolean, passivo: boolean) {
    const valorEl = h("span", { class: embutido ? T.valorEmbutido : T.valor }, F.moeda(dados.valor));
    const pctEl = h("span", { class: "tw:contents" }, UI.PercentageChange(dados.variacaoPercentual, { passivo }));
    const el = h("div", { class: T.metade },
      h("span", { class: embutido ? T.legendaEmbutida : T.legenda }, h("span", { class: ponto, "aria-hidden": "true" }), titulo),
      valorEl, pctEl);
    // o gráfico "filtra" ao passar o mouse: o topo mostra o valor e a variação até o ponto
    return { el, mostrar(valor: number, pct: number) { valorEl.textContent = F.moeda(valor); mount(pctEl, UI.PercentageChange(pct, { passivo })); } };
  }

  /** Card Ativos × Passivos (Contas e, compacto, no Dashboard); o período fica em ui[chaveIntervalo] */
  function ContasChartCard(contas: RespostaContas, ui: EstadoUi, opts?: OpcoesCardContas) {
    const o = opts || {};
    const resumo = contas.resumo;
    const intervalo = o.intervalo || ui.intervaloContas;
    const serie = UI.recortarSerie(resumo.serie, intervalo);
    const chart = h("div", { class: T.grafico });
    const css = getComputedStyle(document.documentElement);
    const ativos = metade(T.pontoAtivos, "Ativos", resumo.ativos, !!o.embedded, false);
    const passivos = metade(T.pontoPassivos, "Passivos", resumo.passivos, !!o.embedded, true);
    const variacaoAte = (v: number, v0: number) => (v0 ? Math.round(((v - v0) / Math.abs(v0)) * 10000) / 100 : 0);
    ZoZo.charts.renderLineChart(chart, [
      // degradê: o de Ativos desce até a linha de Passivos; o de Passivos, até o fim do gráfico
      { name: "Ativos", color: css.getPropertyValue("--color-assets").trim(), points: serie.map((p) => ({ data: p.data, valor: p.ativos })) },
      { name: "Passivos", color: css.getPropertyValue("--color-liabilities").trim(), points: serie.map((p) => ({ data: p.data, valor: p.passivos })) },
    ], { height: o.alturaGrafico || (o.compact ? 150 : 190), independentScale: true, ariaLabel: "Evolução de ativos e passivos",
      aoPassar: (pts) => {
        if (!pts || !serie.length) {
          ativos.mostrar(resumo.ativos.valor, resumo.ativos.variacaoPercentual);
          passivos.mostrar(resumo.passivos.valor, resumo.passivos.variacaoPercentual);
          return;
        }
        if (pts[0]) ativos.mostrar(pts[0].valor, variacaoAte(pts[0].valor, serie[0].ativos));
        if (pts[1]) passivos.mostrar(pts[1].valor, variacaoAte(pts[1].valor, serie[0].passivos));
      } });

    return h("section", { class: [!o.embedded && ZoZo.pecas.card, T.cartao, o.embedded ? T.cartaoEmbutido : T.cartaoPadding], "aria-label": "Gráfico de contas" },
      h("div", { class: T.topo },
        ativos.el, passivos.el),
      chart,
      o.compact && !o.filtros ? null : h("div", { class: T.filtros },
        UI.FilterTabs(intervalo, (v) => ZoZo.store.set({ ui: { [o.chaveIntervalo || "intervaloContas"]: v } }), { label: o.rotuloFiltro || "Período do gráfico de contas" })));
  }

  /** "+" da barra superior: escolhe o tipo de conta (como no Copilot) */
  function botaoNovaConta(ctx: ContextoApp) {
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
   * Cartão de crédito: editar fechamento no PRÓPRIO painel (sem janela). O canto direito vira:
   *   [Mesmo fechamento para todos os meses ▾ | Diferentes fechamentos por mês ▾] (+ mês, no 2º caso)
   *   Fechamento [data]  Vencimento [data] — as datas do ciclo atual (ou do mês escolhido); grava o dia de cada uma
   * Os DOIS são obrigatórios (não dá para mudar só um); a mesma regra vale no serviço de dados.
   */
  function areaCiclo(conta: ContaTela, ctx: ContextoApp, aoSalvar: (c: ContaTela) => void) {
    const hoje = new Date();
    const meses = Array.from({ length: 13 }, (_, i) => { const d = new Date(hoje.getFullYear(), hoje.getMonth() + i - 1, 1); return F.iso(d).slice(0, 7); });
    const soEsteMes = !!(conta.cicloAtual && conta.cicloAtual.soEsteMes);
    let modo = soEsteMes ? "mes" : "fixo", mes = meses[1];
    const ciclo = () => (modo === "mes" && conta.ciclos && conta.ciclos[mes]) || { fechamento: conta.fechamento, vencimento: conta.vencimento };
    // datas do ciclo no mês de referência (o mês atual, ou o escolhido em "por mês"); dia 31 em mês curto = último dia
    const dataNoMes = (mesIso: string, dia: unknown) => { const [a, m] = mesIso.split("-").map(Number); return F.iso(new Date(a, m - 1, Math.min(Number(dia) || 1, new Date(a, m, 0).getDate()))); };
    const mesSeguinte = (mesIso: string) => { const [a, m] = mesIso.split("-").map(Number); return F.iso(new Date(a, m, 1)).slice(0, 7); };
    let fechIso = "", vencIso = "";
    const diasEl = h("div", { class: T.cicloDias });
    const erro = h("p", { class: T.cicloErro, role: "alert" });
    const modoBtn = h("button", { type: "button", class: T.cicloModo, "aria-haspopup": "menu" });
    const mesSel = UI.Select(meses.map((m) => ({ value: m, label: F.mesAno(m + "-01") })), { value: mes, ariaLabel: "Mês do fechamento", class: T.cicloMes });
    const campo = (rotulo: string, el: HTMLElement) => h("div", { class: T.cicloCampo }, h("span", { class: T.cicloRotulo }, rotulo), el);
    const preencher = () => {
      const c = ciclo(), ref = modo === "mes" ? mes : meses[1];
      fechIso = c.fechamento ? dataNoMes(ref, c.fechamento) : "";
      // vencimento depois do fechamento: no mesmo mês; antes (ou no mesmo dia): no mês seguinte
      vencIso = c.vencimento ? dataNoMes(Number(c.vencimento) > Number(c.fechamento) ? ref : mesSeguinte(ref), c.vencimento) : "";
      erro.textContent = "";
      mount(diasEl,
        campo("Fechamento", ZoZo.calendario.Campo({ valor: fechIso, rotulo: "data do fechamento", classe: T.cicloData, aoMudar: (v) => { fechIso = v; erro.textContent = ""; } })),
        campo("Vencimento", ZoZo.calendario.Campo({ valor: vencIso, rotulo: "data do vencimento", classe: T.cicloData, aoMudar: (v) => { vencIso = v; erro.textContent = ""; } })));
    };
    const pintar = () => {
      mount(modoBtn, h("span", null, modo === "fixo" ? "Mesmo fechamento para todos os meses" : "Diferentes fechamentos por mês"), ZoZo.icons.icon("chevron-down", { size: 13, stroke: 2.25 }));
      mesSel.hidden = modo !== "mes";
      preencher();
    };
    modoBtn.addEventListener("click", () => ZoZo.menu.abrir(modoBtn, [
      { label: "Mesmo fechamento para todos os meses", check: modo === "fixo", onClick: () => { modo = "fixo"; pintar(); } },
      { label: "Diferentes fechamentos por mês", check: modo === "mes", onClick: () => { modo = "mes"; pintar(); } },
    ], { posicao: "direita", checkEsquerda: true, largura: 300, label: "Tipo de fechamento" }));
    mesSel.addEventListener("change", () => { mes = mesSel.value; preencher(); });
    pintar();
    return {
      el: h("div", { class: T.cicloArea }, modoBtn, mesSel, diasEl, erro),
      salvar(btn: HTMLButtonElement | null) {
        if (!fechIso || !vencIso) { erro.textContent = ZoZo.messages.FRIENDLY.CARD_CYCLE_INVALID; return; }
        if (btn) btn.disabled = true;
        // grava o DIA de cada data (a regra do ciclo continua por dia do mês)
        ctx.bridge.request(A.updateCicloCartao, { id: conta.id, fechamento: String(Number(fechIso.slice(8, 10))), vencimento: String(Number(vencIso.slice(8, 10))), modo, mes: modo === "mes" ? mes : undefined })
          .then((r: { conta: ContaTela }) => ctx.recarregarTudo().then(() => aoSalvar(r.conta)))
          .catch((e: ErroPonte) => { erro.textContent = e.friendly; if (btn) btn.disabled = false; });
      },
    };
  }

  /** 4 últimos dígitos editáveis no lugar: um clique e já é um campo (sem borda, fundo transparente) */
  function campoDigitos(conta: ContaTela, ctx: ContextoApp) {
    let atual = conta.ultimos4Digitos || "";
    const input = h("input", { type: "text", inputmode: "numeric", autocomplete: "off", maxlength: "4", placeholder: "0000", value: atual,
      class: T.digitos, "aria-label": "4 últimos dígitos" });
    input.addEventListener("input", () => { input.value = input.value.replace(/\D/g, "").slice(0, 4); input.removeAttribute("aria-invalid"); });
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); input.blur(); } if (e.key === "Escape") { input.value = atual; input.blur(); } });
    input.addEventListener("blur", () => {
      const v = input.value.trim();
      if (v === atual) return;
      if (v && !/^\d{4}$/.test(v)) { input.setAttribute("aria-invalid", "true"); ctx.toast(ZoZo.messages.FRIENDLY.DIGITS_INVALID, { tone: "error" }); input.value = atual; return; }
      const antes = atual; atual = v;
      ctx.bridge.request(A.updateConta, { id: conta.id, ultimos4Digitos: v }).then(() => ctx.recarregarTudo())
        .catch((e: ErroPonte) => { atual = antes; input.value = antes; ctx.toast(e.friendly, { tone: "error" }); });
    });
    return input;
  }

  /** opts: editandoCiclo = fechamento do cartão em edição no painel; voltar = seta "voltar" */
  function abrirDetalheConta(conta: ContaTela, ctx: ContextoApp, opts?: OpcoesPainelConta) {
    const passivo = conta.tipo === "cartao" || conta.tipo === "emprestimo";
    let intervalo = conta.tipo === "investimento" ? "1M" : "3M";
    const editandoCiclo = !!(opts && opts.editandoCiclo) && conta.tipo === "cartao";
    const contaAtual = () => { const dados = ZoZo.store.get().data.contas; return ((dados && dados.contas) || []).find((x) => x.id === conta.id) || conta; };
    const reabrir = (extra: OpcoesPainelConta, atual?: ContaTela) => abrirDetalheConta(atual || conta, ctx, Object.assign({}, opts, extra));
    const ciclo = editandoCiclo ? areaCiclo(conta, ctx, (c) => reabrir({ editandoCiclo: false }, Object.assign({}, conta, c))) : null;
    const excluir = () => ZoZo.feedback.confirmarExclusao("Excluir conta?", "Tem certeza de que deseja excluir esta conta?")
      .then((ok) => ok && ctx.bridge.request(A.deleteConta, { id: conta.id }).then(() => { ctx.detail.close({ silencioso: true }); ctx.toast("Conta excluída."); return ctx.recarregarTudo(); })
        .catch((e: ErroPonte) => ctx.toast(e.friendly, { tone: "error" })));
    const ocultar = () => ctx.bridge.request(A.updateConta, { id: conta.id, oculta: !conta.oculta }).then(() => {
      ctx.toast(conta.oculta ? "Conta visível novamente." : "Conta oculta: ela não entra mais nos totais.");
      ctx.detail.close({ silencioso: true });
      return ctx.recarregarTudo();
    }).catch((e: ErroPonte) => ctx.toast(e.friendly, { tone: "error" }));
    ctx.detail.open({
      title: conta.tipo === "investimento" ? "Investimento" : conta.tipo === "cartao" ? "Cartão de crédito"
        : (L.SUBTITULO_CONTA[conta.tipo] ? "Conta " + L.SUBTITULO_CONTA[conta.tipo].toLowerCase() : "Conta"),
      selected: { tipo: "conta", id: conta.id },
      voltar: opts && opts.voltar,
      botoes: editandoCiclo
        ? [{ label: "Cancelar", onClick: () => reabrir({ editandoCiclo: false }) }, { label: "Salvar fechamento", primario: true, onClick: (e: MouseEvent) => { if (ciclo) ciclo.salvar(e.currentTarget as HTMLButtonElement); } }]
        : conta.tipo === "cartao" ? [
          { label: "Editar fechamento", rotuloCurto: "Fechamento", onClick: () => reabrir({ editandoCiclo: true }) },
          // depois de pagar, o painel reabre com a fatura e o saldo novos
          { label: "Pagar fatura", rotuloCurto: "Pagar", primario: true, onClick: () => ZoZo.modais.pagarFatura(ctx, conta, () => reabrir({}, contaAtual())) },
        ] : [],
      menu: [
        { label: conta.oculta ? "Mostrar conta" : "Ocultar conta", onClick: ocultar },
        { separador: true },
        { label: "Excluir conta", perigo: true, onClick: excluir },
      ],
      render(body: HTMLElement) {
        const listaEl = h("div", { class: ZoZo.pecas.painelLista }, UI.Skeleton(3, { short: true }));
        const graficoEl = h("div", { class: ZoZo.pecas.painelGrafico });
        const filtrosEl = h("div", { class: T.filtros });
        const difEl = h("span");
        let serie: PontoGrafico[] = [];
        const desenhar = () => {
          const recorte = UI.recortarSerie(serie, intervalo);
          const subiu = recorte.length > 1 && recorte[recorte.length - 1].valor >= recorte[0].valor;
          const bom = passivo ? !subiu : subiu;          // cartão/empréstimo: a dívida cair é bom (verde)
          const cs = getComputedStyle(document.documentElement);
          ZoZo.charts.renderLineChart(graficoEl, [{ name: conta.nome, color: cs.getPropertyValue(bom ? "--color-chart-up" : "--color-chart-down").trim(), points: recorte.map((p) => ({ data: p.data, valor: p.valor })) }],
            { height: 160, ariaLabel: "Evolução do saldo" });
          mount(filtrosEl, UI.FilterTabs(intervalo, (v) => { intervalo = v; desenhar(); }, { label: "Período do gráfico da conta" }));
        };
        mount(body,
          // Linha 1: ícone pequeno + 4 dígitos + tipo ........ percentuais
          // Linha 2: nome ........................................ valor
          h("div", { class: ZoZo.pecas.ph },
            h("div", { class: ZoZo.pecas.phTopo },
              h("span", { class: [ZoZo.pecas.phMeta, ZoZo.pecas.ctxIconeContaPequeno] }, UI.AccountIcon(conta),
                // 4 últimos dígitos: um clique e já edita (investimento não tem cartão/conta com dígitos)
                conta.tipo === "investimento" ? null : campoDigitos(conta, ctx),
                h("span", { class: ZoZo.pecas.phTipo }, conta.oculta ? "Ocultado" : conta.tipo === "investimento" ? conta.tipoInvestimento || "Investimento" : L.SUBTITULO_CONTA[conta.tipo] || (conta.tipo === "cartao" ? "Cartão de crédito" : "Outros"))),
              h("span", { class: ZoZo.pecas.phChips }, difEl, UI.PercentageChange(conta.variacaoPercentual, { passivo }))),
            h("div", { class: ZoZo.pecas.phLinha },
              ZoZo.inline.texto({ valor: conta.nome, rotulo: "Nome da conta", max: ZoZo.regras.limiteNome, classe: ZoZo.pecas.phNome,
                aoSalvar: (v) => ctx.bridge.request(A.updateConta, { id: conta.id, nome: v }).then(() => { ctx.toast("Nome alterado."); return ctx.recarregarTudo(); }) }),
              // editando o fechamento, o saldo dá lugar ao combobox e aos dias
              editandoCiclo && ciclo ? ciclo.el : ZoZo.inline.dinheiro({ valor: conta.valor, rotulo: "Saldo da conta", permitirNegativo: true, classe: ZoZo.pecas.phValor,
                aoSalvar: (v) => ctx.bridge.request(A.updateConta, { id: conta.id, saldo: v }).then(() => { ctx.toast("Saldo atualizado."); return ctx.recarregarTudo(); }) })),
            conta.limite && !editandoCiclo ? h("div", { class: ZoZo.pecas.phExtra }, F.moeda(conta.limite) + " de limite") : null,
            // empréstimo: o contrato (parcelas, valor contratado e 1º vencimento)
            conta.emprestimo ? h("div", { class: ZoZo.pecas.phExtra }, [
              conta.emprestimo.parcelas ? conta.emprestimo.parcelas + (conta.emprestimo.parcelas === 1 ? " parcela" : " parcelas") + (conta.emprestimo.valorParcela ? " de " + F.moeda(conta.emprestimo.valorParcela) : "") : null,
              conta.emprestimo.valorContratado ? F.moeda(conta.emprestimo.valorContratado) + " contratados" : null,
              conta.emprestimo.primeiroVencimento ? "1º vencimento " + F.dataCurta(conta.emprestimo.primeiroVencimento) : null,
            ].filter(Boolean).join(" · ")) : null,
            // cartão: fechamento e vencimento do mês atual (de todos os meses ou definidos só para este mês)
            !editandoCiclo && conta.tipo === "cartao" && conta.cicloAtual && conta.cicloAtual.fechamento ? h("div", { class: ZoZo.pecas.phExtra },
              "Fecha dia " + conta.cicloAtual.fechamento + " · vence dia " + conta.cicloAtual.vencimento + (conta.cicloAtual.soEsteMes ? " (só neste mês)" : "")) : null),
          graficoEl, filtrosEl,
          C.detalheSecao(null, listaEl));

        ctx.bridge.request(A.getContaHistorico, { id: conta.id }).then((r) => {
          serie = r.serie;
          const dif = r.diferenca;
          // passivo (cartão, empréstimo): a dívida subir é ruim (vermelho); cair é bom (verde)
          const bom = passivo ? dif < 0 : dif > 0, ruim = passivo ? dif > 0 : dif < 0;
          mount(difEl, h("span", { class: bom ? ZoZo.pecas.pctSobe : ruim ? ZoZo.pecas.pctDesce : ZoZo.pecas.pctIgual }, (dif > 0 ? "+ " : dif < 0 ? "− " : "") + F.moeda(Math.abs(dif))));
          desenhar();
        }).catch(() => mount(graficoEl, h("p", { class: "tw:text-zz-muted" }, ZoZo.messages.FRIENDLY.LOAD_FAILED)));

        ctx.loadData("lancamentos", A.getLancamentos).then((d) => {
          const itens = d.lancamentos.filter((l) => l.contaId === conta.id).slice(0, 8);
          mount(listaEl, itens.length
            // a transação abre aqui mesmo, com a seta para voltar a esta conta
            ? L.ListaPainel(itens, { onClick: (l: LancamentoTela) => { ZoZo.lancamentoPainel.abrir(l, ctx, { voltar: () => abrirDetalheConta(contaAtual(), ctx, opts) }); } })
            : UI.EmptyState("Nenhuma transação nesta conta."));
        }).catch((e: ErroPonte) => mount(listaEl, UI.ErrorState(e.friendly)));
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
        skeleton: h("div", null, h("div", { class: ZoZo.pecas.esqueletoCard }), UI.Skeleton(6)),
      });
      if (espera) return C.pagina("page--contas", espera);
      const contas = C.carregado(state, "contas").contas || [];
      const sel = state.selectedItem && state.selectedItem.tipo === "conta" ? state.selectedItem.id : null;

      const mostrar: Record<string, boolean> = (state.ui.mostrarOcultas as Record<string, boolean>) || {};
      const secoes = GRUPOS.map((g) => {
        const doGrupo = contas.filter((c) => g.tipos.includes(c.tipo));
        if (!doGrupo.length) return null;
        const temOcultas = doGrupo.some((c) => c.oculta);
        const exibindo = !!mostrar[g.key];
        const itens = doGrupo.filter((c) => !c.oculta || exibindo);
        const olho = temOcultas ? h("button", {
          type: "button", class: [ZoZo.pecasFn.botaoIcone("", true), exibindo ? T.olhoAtivo : T.olho],
          "aria-pressed": String(exibindo), title: exibindo ? "Esconder contas ocultas" : "Mostrar contas ocultas",
          "aria-label": exibindo ? "Esconder contas ocultas" : "Mostrar contas ocultas",
          onClick: (e: MouseEvent) => { e.stopPropagation(); ZoZo.store.set({ ui: { mostrarOcultas: Object.assign({}, mostrar, { [g.key]: !exibindo }) } }); },
        }, ZoZo.icons.icon(exibindo ? "olho" : "olho-fechado", { size: 15 })) : null;
        return UI.Section({ key: "contas:" + g.key, title: g.titulo, adorno: olho, class: T.secao },
          itens.length ? null : h("p", { class: T.aviso }, "Todas as contas deste grupo estão ocultas."),
          h("div", { class: T.lista }, itens.map((c) => L.AccountRow(c, {
            selected: c.id === sel,
            onClick: () => abrirDetalheConta(c, ctx),
          }))));
      });

      return C.pagina("page--contas",
        ContasChartCard(C.carregado(state, "contas"), state.ui),
        contas.length ? secoes
          : UI.EmptyState("Nenhuma conta cadastrada.", { icon: "contas", action: { label: "Nova conta", icon: "mais", onClick: () => ZoZo.modais.novaConta(ctx, "corrente") } }));
    },
    selecionar(sel, ctx) {
      const dados = ZoZo.store.get().data.contas;
      const c = ((dados && dados.contas) || []).find((x) => x.id === sel.id);
      if (c) abrirDetalheConta(c, ctx);
    },
  };

  ZoZo.contasShared = { ContasChartCard, abrirDetalheConta };
})(window.ZoZo);
