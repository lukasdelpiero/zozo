/* =============================================================
   ZoZo — Categorias (seções 34–40)
   Visual em Tailwind (tabela T abaixo; as linhas estão em components/list.ts).
   Continuam no CSS antigo só as peças compartilhadas com outras telas: seção,
   cartão de resumo com a rosca, cabeçalho do painel, pílula da
   categoria, barra de progresso e a árvore do grupo (também no Dashboard).
   page--categorias fica como gancho (resumo com o orçamento desligado).
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
  const COLUNA = "tw:text-[13px] tw:font-[620] tw:uppercase tw:tracking-[0.04em] tw:text-zz-muted tw:area420:hidden";
  // campo do painel: edição "invisível" (sem borda nem fundo, também com foco); erro = texto vermelho
  const T = {
    // painel da categoria: bolinha de cor 8×8 e ícone 32×32
    edicaoCategoria: "tw:[&_.ponto-cor]:size-2 tw:[&_.icon-pick]:size-8! tw:[&_.icon-pick]:text-[20px]!",
    lista: "tw:flex tw:flex-col tw:mb-2",
    // GASTO (à direita) e RESERVADO (à esquerda) alinhados com as colunas das linhas: a MESMA grade de
    // CategoryRow (components/list.ts) em todas as larguras — antes, com a área estreita (painel aberto),
    // as linhas passavam a 3 colunas e o cabeçalho não: o título quebrava e "Gasto" saía do lugar
    cabecalho: "tw:grid tw:grid-cols-[minmax(8em,1.4fr)_112px_minmax(80px,2fr)_104px] tw:gap-4 tw:px-4 "
      + "tw:area620:grid-cols-[minmax(0,1fr)_112px_104px] tw:area420:grid-cols-[minmax(0,1fr)_112px]",
    cabecalhoLead: "tw:-ml-4 tw:whitespace-nowrap tw:overflow-hidden",          // título numa linha só
    colGasto: COLUNA + " tw:text-right",
    colEspaco: COLUNA + " tw:area620:hidden",
    colReservado: COLUNA + " tw:text-left",
    vazioInicio: "tw:min-h-[280px]",
    subtitulo: "tw:text-zz-secondary tw:text-[15px] tw:font-[450]",
    // pílulas das categorias + "+N" no topo dos painéis de grupo e de "todas"
    leadPilha: "tw:flex-col tw:items-start tw:gap-1.5",
    // pílulas e "+N" sempre lado a lado: as pílulas encolhem (com "…") antes de quebrar a linha
    // (flex-row: o topo do painel põe os seus blocos em coluna, e as pílulas ficavam empilhadas e centralizadas)
    pilulas: "tw:flex tw:flex-row tw:flex-nowrap tw:items-center tw:gap-1.5 tw:min-w-0 tw:max-w-full tw:*:min-w-0",
    /* Topo dos painéis em linhas: [ícones | pílulas] ↔ rótulo, [nome] ↔ valor, [grupo] ↔ dica — cada par na mesma
       linha (as duas colunas viram uma grade só; "contents" deixa os filhos de cada lado irem direto para ela) */
    topoLinhas: "tw:grid-flow-row-dense tw:items-center tw:gap-y-1",
    colEsq: "tw:contents tw:*:col-start-1",
    colDir: "tw:contents tw:*:col-start-2 tw:*:justify-self-end tw:*:text-right",
    colDirEditando: "tw:col-start-2 tw:row-start-1 tw:row-span-3 tw:self-start",
    mais: "tw:flex-none tw:inline-grid tw:place-items-center tw:h-[22px] tw:px-2 tw:py-0 tw:[border:0] tw:rounded-(--radius-pill) tw:bg-(--color-neutral-soft) "
      + "tw:text-(--color-neutral) tw:text-[11px] tw:font-semibold tw:cursor-pointer tw:hover:bg-zz-primary-soft tw:hover:text-zz-primary "
      + "tw:[&.is-open]:bg-zz-primary-soft tw:[&.is-open]:text-zz-primary",
    // editar orçamento no painel
    orcArea: "tw:gap-1.5",
    orcModo: "tw:inline-flex tw:items-center tw:gap-1.5 tw:h-7 tw:px-2.5 tw:py-0 tw:border tw:border-zz-border tw:rounded-lg tw:bg-zz-surface "
      + "tw:text-[13px] tw:font-medium tw:hover:border-zz-border-strong",
    // valor do orçamento editável no lugar (mesma cara do valor no topo do painel)
    orcCampo: "tw:w-[170px] tw:text-right tw:text-[20px] tw:font-[550]",
    grupoCampoValor: "tw:w-[150px] tw:text-[17px] tw:font-semibold",
    // painel do grupo
    // [pílulas] ↔ botão do modo, [nome] ↔ valores (no painel, área estreita: o lado direito alinhado à esquerda)
    grupoOrc: "tw:contents tw:*:col-start-2 tw:*:justify-self-end tw:area420:*:justify-self-start",
    grupoNome: "tw:self-end",
    grupoValores: "tw:grid tw:grid-flow-col tw:gap-5",
    grupoItem: "tw:grid tw:justify-items-end tw:gap-0.5 tw:area420:justify-items-start",
    grupoRotulo: "tw:text-[12px] tw:text-zz-secondary",
    grupoValor: "money tw:text-[17px] tw:font-semibold",
    // tabela "Todas as categorias regulares"
    tabela: "tw:flex tw:flex-col",
    tabelaLinha: "tw:grid tw:grid-cols-[minmax(0,1.4fr)_1fr_1fr_1fr] tw:gap-2 tw:items-center tw:min-h-[34px] tw:px-2 tw:py-0 tw:[border:0] "
      + "tw:rounded-lg tw:bg-transparent tw:text-left tw:text-[13px]",
    tabelaLinhaBotao: "tw:hover:bg-zz-surface-hover",
    tabelaCab: "tw:text-zz-secondary tw:font-semibold",
    tabelaNome: "tw:flex tw:items-center tw:gap-2 tw:min-w-0 tw:overflow-hidden tw:whitespace-nowrap tw:text-ellipsis",
  };

  function mesAbrevDe(mesIso: any) {
    const d = F.parseData((mesIso || "") + "-01") || new Date();
    return F.mesAbrev(d.getMonth());
  }
  /** Nome do mês por extenso (painéis: "Gasto em Outubro") */
  function mesNomeDe(mesIso: any) {
    const d = F.parseData((mesIso || "") + "-01") || new Date();
    return F.mesNome(d.getMonth());
  }

  /** Mantém a ordem original: grupos (na 1ª aparição) e categorias soltas.
      infoGrupos (do serviço): "não atribuído" de cada grupo, que entra no orçamento do grupo */
  function estruturar(categorias: any, infoGrupos: any) {
    const blocos: any[] = [];
    const grupos = new Map();
    categorias.forEach((c: any) => {
      if (c.grupo) {
        if (!grupos.has(c.grupo)) {
          const g = { tipo: "grupo", nome: c.grupo, itens: [] };
          grupos.set(c.grupo, g);
          blocos.push(g);
        }
        grupos.get(c.grupo).itens.push(c);
      } else blocos.push({ tipo: "categoria", cat: c });
    });
    // Totais do grupo = soma das categorias do grupo (seções 36 e 38)
    grupos.forEach((g) => {
      g.gasto = g.itens.reduce((s: any, c: any) => s + F.numero(c.gasto), 0);
      const info = (infoGrupos || {})[g.nome];
      g.naoAtribuido = info && g.itens.some((c: any) => c.status === "regular") ? F.numero(info.naoAtribuido) : 0;
      g.reservado = g.itens.reduce((s: any, c: any) => s + F.numero(c.reservado), 0) + g.naoAtribuido;
      g.quantidade = g.itens.length;
    });
    return blocos;
  }

  function linhas(categorias: any, excluida: any, state: any, ctx: ContextoApp) {
    const sel = state.selectedItem && state.selectedItem.tipo === "categoria" ? state.selectedItem.id : null;
    const fechados = state.ui.gruposFechados;
    const out: HTMLElement[] = [];
    const grupoSel = state.selectedItem && state.selectedItem.tipo === "grupo" ? state.selectedItem.id : null;
    estruturar(categorias, (state.data.categorias || {}).grupos).forEach((b) => {
      const linha = (c: any, filho: any) => L.CategoryRow(c, { excluida, filho, selected: c.id === sel, onClick: () => abrirDetalhe(c, ctx) });
      if (b.tipo === "categoria") { out.push(linha(b.cat, false)); return; }
      const key = "cat:grp:" + (excluida ? "x:" : "r:") + b.nome;
      const fechado = !!fechados[key];
      out.push(L.CategoryGroupRow(b, { excluida, fechado, onToggle: () => UI.alternarGrupo(key), selected: grupoSel === b.nome,
        onClick: () => abrirGrupo(b.nome, ctx) }));
      if (!fechado) out.push(UI.corpoArvore(key, h("div", { class: ZoZo.pecas.arvoreGrupo }, b.itens.map((c: any) => linha(c, true)))));
    });
    return out;
  }

  function abrirFormCategoria(ctx: ContextoApp, cat: any, preset: any, voltar: any) {
    const novo = !cat;
    const todas = (ZoZo.store.get().data.categorias && ZoZo.store.get().data.categorias.categorias) || [];
    const grupos = Array.from(new Set(todas.map((c: any) => c.grupo).filter(Boolean)));
    ZoZo.forms.abrir(ctx, {
      titulo: novo ? "Nova categoria" : "Editar categoria",
      voltar,
      selected: cat ? { tipo: "categoria", id: cat.id } : null,
      valores: cat ? { nome: cat.nome, icone: cat.icone, grupo: cat.grupo || "", status: cat.status, reservado: cat.reservado, cor: cat.cor }
        : Object.assign({ status: "regular", icone: "", cor: ZoZo.regras.corSugerida() }, preset || {}),
      campos: [
        { nome: "nome", rotulo: "Nome", obrigatorio: true, placeholder: "Ex.: Mercado", max: ZoZo.regras.limiteNome },
        { nome: "icone", rotulo: "Ícone", tipo: "emoji" },
        { nome: "grupo", rotulo: "Grupo", tipo: "lista", opcoes: grupos, placeholder: "Ex.: Alimentação", dica: "Opcional. Categorias do mesmo grupo aparecem juntas e somadas.", max: 60 },
        // Excluída (fora do orçamento): só para categoria sem transações (a regra também está no serviço)
        cat && cat.usada && cat.status !== "excluida" ? null : { nome: "status", rotulo: "Tipo de categoria", tipo: "selecao", opcoes: [
          { value: "regular", label: "Regular (entra no orçamento)" },
          { value: "excluida", label: "Excluída (não entra no orçamento)" },
        ] },
        { nome: "reservado", rotulo: "Valor reservado por mês", tipo: "dinheiro", mostrarSe: (x: any) => x.status === "regular" },
        { nome: "cor", rotulo: "Cor", tipo: "cor" },
      ].filter(Boolean) as CampoForm[],
      validar: (d) => (typeof d.reservado === "number" && Number.isFinite(d.reservado) && d.reservado < 0 ? "O valor reservado não pode ser negativo." : null),
      salvar: (d) => {
        if (!Number.isFinite(d.reservado)) d.reservado = 0;
        const req = novo ? ctx.bridge.request(A.createCategoria, { categoria: d }) : ctx.bridge.request(A.updateCategoria, { id: cat.id, categoria: d });
        return req.then(() => { ctx.toast(novo ? "Categoria criada." : "Categoria salva."); return ctx.recarregarTudo(); });
      },
    });
  }

  /** Gráfico de barras dos últimos 12 meses (uma categoria ou todas as regulares) */
  function graficoMeses(ctx: ContextoApp, categoriaId: any, alvo: any) {
    ctx.bridge.request(A.getCategoriaSerie, { categoriaId: categoriaId || null }).then((r: any) => {
      ZoZo.charts.renderBarChart(alvo, r.meses.map((m: any, i: any) => {
        const dt = F.parseData(m.mes + "-01") || new Date();
        return { rotuloMes: F.mesAbrev(dt.getMonth()), rotuloAno: dt.getMonth() === 0 || i === 0 || i === r.meses.length - 1 ? String(dt.getFullYear()) : "",
          titulo: F.mesNome(dt.getMonth()) + " " + dt.getFullYear(), valor: m.gasto, destaque: i === r.meses.length - 1 };
      }), { limite: r.reservado, nomeValor: "Gasto", ariaLabel: "Gasto nos últimos 12 meses" });
    }).catch(() => mount(alvo, h("p", { class: "tw:text-zz-muted" }, ZoZo.messages.FRIENDLY.LOAD_FAILED)));
  }

  function resumoGasto(gasto: any, reservado: any) {
    const dif = F.numero(gasto) - F.numero(reservado);
    if (!(F.numero(reservado) > 0)) return null;
    return h("span", { class: dif > 0 ? ZoZo.pecas.painelTopoDicaAcima : ZoZo.pecas.painelTopoDica }, F.moeda(Math.abs(dif)) + (dif > 0 ? " acima" : " disponíveis"));
  }

  const orcamentoAtivo = () => !(ZoZo.store.get().data.config && ZoZo.store.get().data.config.orcamentoAtivo === false);

  function abrirDetalhe(cat: any, ctx: ContextoApp, opts?: any) {
    const mes = (ZoZo.store.get().data.categorias || {}).mes || F.iso(new Date()).slice(0, 7);   // aberto de outro painel antes de carregar Categorias
    const excluir = () => ZoZo.feedback.confirmarExclusao("Excluir categoria?",
      "A categoria “" + cat.nome + "” e o histórico de orçamentos dela serão apagados. Essa ação não pode ser desfeita. As transações dessa categoria serão movidas para “Outros”.")
      .then((ok) => ok && ctx.bridge.request(A.deleteCategoria, { id: cat.id }).then(() => { ctx.detail.close({ silencioso: true }); ctx.toast("Categoria excluída."); return ctx.recarregarTudo(); })
        .catch((e: any) => ctx.toast(e.friendly, { tone: "error" })));

    // Alterações rápidas pelo menu (grupo, tipo) e reabertura do painel atualizado
    const alterar = (dados: any, msg: any) => ctx.bridge.request(A.updateCategoria, Object.assign({ id: cat.id }, dados)).then(() => {
      ctx.toast(msg);
      return ctx.recarregarTudo().then(() => {
        const atual = ((ZoZo.store.get().data.categorias || {}).categorias || []).find((c: any) => c.id === cat.id);
        if (atual) abrirDetalhe(atual, ctx, opts);
      });
    }).catch((e: any) => ctx.toast(e.friendly, { tone: "error" }));

    const grupos = () => Array.from(new Set(((ZoZo.store.get().data.categorias || {}).categorias || []).map((c: any) => c.grupo).filter(Boolean))).sort((a: any, b: any) => a.localeCompare(b, "pt-BR")) as string[];

    /* ---------- Editar orçamento (modo de edição no próprio painel) ---------- */
    const editando = !!(opts && opts.editandoOrcamento);
    const mesAtualIso = mes || F.iso(new Date()).slice(0, 7);
    let modo = cat.orcamentoPorMes ? "mes" : "fixo";
    // como o valor da transação: exibido; clicou, apaga e digita (grava no "Salvar orçamento")
    const valorOrc = ZoZo.inline.dinheiroCampo({ valor: cat.reservado || 0, rotulo: "Valor do orçamento", classe: T.orcCampo, aoEnter: () => salvarOrcamento() });
    const rotuloMes = h("span", { class: ZoZo.pecas.painelTopoRotulo });
    const modoBtn = h("button", { type: "button", class: T.orcModo, "aria-haspopup": "menu" });
    const pintarModo = () => {
      ZoZo.dom.mount(modoBtn, h("span", null, modo === "fixo" ? "Orçamento mensal fixo" : "Orçamentos por mês"), ZoZo.icons.icon("chevron-down", { size: 13, stroke: 2.25 }));
      const dt = F.parseData(mesAtualIso + "-01") || new Date();
      rotuloMes.textContent = modo === "mes" ? "Orçamento para " + F.mesNome(dt.getMonth()) + " " + dt.getFullYear() : "";
      valorOrc.definir(modo === "fixo" ? (cat.reservadoFixo || 0) : (cat.reservado || 0));
    };
    modoBtn.addEventListener("click", () => ZoZo.menu.abrir(modoBtn, [
      { label: "Mesmo orçamento para todos os meses", check: modo === "fixo", onClick: () => { modo = "fixo"; pintarModo(); } },
      { label: "Diferentes orçamentos por mês", check: modo === "mes", onClick: () => { modo = "mes"; pintarModo(); } },
    ], { posicao: "direita", checkEsquerda: true, largura: 290, label: "Tipo de orçamento" }));
    pintarModo();
    const areaOrcamento = h("div", { class: [ZoZo.pecas.painelTopoNumero, T.orcArea, T.colDirEditando] }, modoBtn, rotuloMes, valorOrc.el);
    function salvarOrcamento() {
      const v = valorOrc.ler();
      if (!(v >= 0)) { valorOrc.campo.setAttribute("aria-invalid", "true"); valorOrc.editar(); return; }
      const dados = modo === "fixo" ? { reservado: v, modoOrcamento: "fixo" } : { orcamentoMes: { mes: mesAtualIso, valor: v } };
      ctx.bridge.request(A.updateCategoria, Object.assign({ id: cat.id }, dados)).then(() => {
        ctx.toast("Orçamento salvo.");
        return ctx.recarregarTudo().then(() => {
          const atual = ((ZoZo.store.get().data.categorias || {}).categorias || []).find((c: any) => c.id === cat.id);
          if (atual) abrirDetalhe(atual, ctx, Object.assign({}, opts, { editandoOrcamento: false }));
        });
      }).catch((e: any) => ctx.toast(e.friendly, { tone: "error" }));
    }

    ctx.detail.open({
      title: "Categoria",
      selected: { tipo: "categoria", id: cat.id },
      voltar: opts && opts.voltar,
      botoes: editando
        ? [{ label: "Cancelar", onClick: () => abrirDetalhe(cat, ctx, Object.assign({}, opts, { editandoOrcamento: false })) },
          { label: "Salvar orçamento", primario: true, onClick: () => salvarOrcamento() }]
        : (cat.status === "regular" && orcamentoAtivo() ? [{ label: "Editar orçamento", onClick: () => abrirDetalhe(cat, ctx, Object.assign({}, opts, { editandoOrcamento: true })) }] : []),
      menu: [
        { label: "Grupo de categorias", checkEsquerda: true, submenu: () => grupos().map((g): ItemMenu => ({ label: g, check: cat.grupo === g, onClick: () => alterar({ grupo: g }, "Grupo alterado.") }))
          .concat([{ label: "Sem grupo", check: !cat.grupo, onClick: () => alterar({ grupo: "" }, "Categoria sem grupo.") }, { separador: true },
            { icone: "mais", label: "Criar novo grupo", onClick: () => ZoZo.modais.criarGrupo((nome: any) => alterar({ grupo: nome }, "Grupo criado.")) }]) },
        // Tirar do orçamento só quando a categoria não tem nenhuma transação
        cat.usada && cat.status !== "excluida" ? null : { label: "Tipo de categoria", checkEsquerda: true, submenu: () => [
          { label: "Regular", check: cat.status === "regular", onClick: () => alterar({ status: "regular" }, "Categoria regular.") },
          { label: "Excluída", check: cat.status === "excluida", onClick: () => alterar({ status: "excluida" }, "Categoria excluída do orçamento.") },
        ] },
        // Cancelar/salvar voltam para este painel (com os dados atualizados)
        { label: "Editar categoria", onClick: () => abrirFormCategoria(ctx, cat, null, () => {
          const atual = (((ZoZo.store.get().data.categorias || {}).categorias) || []).find((c: any) => c.id === cat.id);
          if (atual) abrirDetalhe(atual, ctx, Object.assign({}, opts, { editandoOrcamento: false })); else ctx.detail.close({ silencioso: true });
        }) },
        { separador: true },
        { label: "Excluir categoria", perigo: true, onClick: excluir },
      ].filter(Boolean),
      render(body: any) {
        const listaEl = h("div", { class: ZoZo.pecas.painelLista }, UI.Skeleton(3, { short: true }));
        const grafico = h("div", { class: ZoZo.pecas.painelGrafico });
        const acima = F.numero(cat.gasto) > F.numero(cat.reservado);
        mount(body,
          h("div", { class: [ZoZo.pecas.painelTopo, T.topoLinhas] },
            // Cor (bolinha), ícone e nome editáveis no lugar
            h("div", { class: [ZoZo.pecas.edicaoTopo, T.colEsq, T.edicaoCategoria] },
              h("div", { class: ZoZo.pecas.edicaoTopoLinha },
                ZoZo.inline.corDot(cat.cor, (c) => alterar({ cor: c }, "Cor alterada.")),
                ZoZo.modais.seletorIcone(cat.icone, (e) => alterar({ icone: e }, "Ícone alterado."))),
              ZoZo.inline.texto({ valor: cat.nome, rotulo: "Nome da categoria", max: ZoZo.regras.limiteNome, aoSalvar: (v) => alterar({ nome: v }, "Nome alterado.") }),
              cat.grupo ? h("span", { class: T.subtitulo }, cat.grupo) : null),
            editando ? areaOrcamento : h("div", { class: [ZoZo.pecas.painelTopoNumero, T.colDir] },
              h("span", { class: ZoZo.pecas.painelTopoRotulo }, "Gasto em " + mesNomeDe(mes)),
              h("span", { class: [ZoZo.pecas.painelTopoValor, "money"] }, F.moeda(cat.gasto)),
              cat.status === "excluida" || !orcamentoAtivo() ? null : resumoGasto(cat.gasto, cat.reservado))),
          grafico,
          cat.status === "excluida" ? null : C.detalheSecao(null,
            C.detalheLinha("Orçamento mensal", F.moeda(cat.reservado)),
            UI.ProgressBar(F.numero(cat.reservado) > 0 ? F.numero(cat.gasto) / F.numero(cat.reservado) : (F.numero(cat.gasto) > 0 ? 1 : 0), {
              tone: acima ? "over" : "ok", grande: true, label: acima ? "Gasto acima do orçamento" : "Gasto dentro do orçamento",
            })),
          C.detalheSecao("Transações do mês", listaEl));
        graficoMeses(ctx, cat.id, grafico);
        ctx.loadData("lancamentos", A.getLancamentos).then((d: any) => {
          const itens = d.lancamentos.filter((l: any) => l.categoriaId === cat.id && (!mes || l.data.startsWith(mes)));
          mount(listaEl, itens.length
            // a transação abre aqui mesmo, com a seta para voltar a esta categoria
            ? L.ListaPainel(itens, { onClick: (l) => ZoZo.lancamentoPainel.abrir(l, ctx, { voltar: () => abrirDetalhe((((ZoZo.store.get().data.categorias || {}).categorias) || []).find((x: any) => x.id === cat.id) || cat, ctx, Object.assign({}, opts, { editandoOrcamento: false })) }) })
            : UI.EmptyState("Nenhuma transação nesta categoria no mês."));
        }).catch((e: any) => mount(listaEl, UI.ErrorState(e.friendly)));
      },
    });
  }

  /* ---------- Painel do grupo de categorias ----------
     Subcategorias = soma dos orçamentos das categorias do grupo (não editável aqui).
     Não atribuído = orçamento do próprio grupo. Total do grupo = subcategorias + não atribuído.
     Ao salvar o não atribuído, o que falta para uma categoria do grupo sair do vermelho no mês sai dele. */
  function abrirGrupo(nome: any, ctx: ContextoApp, opts?: any) {
    const o = opts || {};
    const d = ZoZo.store.get().data.categorias || {};
    const mes = d.mes || F.iso(new Date()).slice(0, 7);
    const cats = (d.categorias || []).filter((c: any) => c.grupo === nome);
    if (!cats.length) { ctx.detail.close({ silencioso: true }); return; }
    const info = (d.grupos || {})[nome] || { naoAtribuido: 0, naoAtribuidoFixo: 0, porMes: false,
      subcategorias: cats.filter((c: any) => c.status === "regular").reduce((s: any, c: any) => s + F.numero(c.reservado), 0) };
    info.total = F.numero(info.subcategorias) + F.numero(info.naoAtribuido);
    const gasto = cats.filter((c: any) => c.status === "regular").reduce((s: any, c: any) => s + F.numero(c.gasto), 0);
    const editando = !!o.editando;
    const reabrir = (extra: any) => ctx.recarregarTudo().then(() => abrirGrupo(nome, ctx, Object.assign({}, o, extra)));

    let modo = info.porMes ? "mes" : "fixo";
    const dt = F.parseData(mes + "-01") || new Date();
    const rotuloModo = () => (modo === "fixo" ? "Orçamento para todos os meses" : "Orçamento de " + F.mesNome(dt.getMonth()) + " " + dt.getFullYear());
    const modoBtn = h("button", { type: "button", class: T.orcModo, "aria-haspopup": "menu" });
    // como o valor da transação: exibido; clicou, apaga e digita (grava no "Salvar orçamento")
    const valorNA = ZoZo.inline.dinheiroCampo({ valor: 0, rotulo: "Valor não atribuído", classe: T.grupoCampoValor, aoEnter: () => salvar() });
    const pintarModo = () => {
      mount(modoBtn, h("span", null, rotuloModo()), editando ? ZoZo.icons.icon("chevron-down", { size: 13, stroke: 2.25 }) : null);
      valorNA.definir(modo === "fixo" ? info.naoAtribuidoFixo : (info.porMes ? info.naoAtribuidoBase : info.naoAtribuidoFixo));
    };
    if (editando) modoBtn.addEventListener("click", () => ZoZo.menu.abrir(modoBtn, [
      { label: "Mesmo orçamento para todos os meses", check: modo === "fixo", onClick: () => { modo = "fixo"; pintarModo(); } },
      { label: "Orçamento só deste mês", check: modo === "mes", onClick: () => { modo = "mes"; pintarModo(); } },
    ], { posicao: "direita", checkEsquerda: true, largura: 290, label: "Tipo de orçamento" }));
    pintarModo();
    function salvar() {
      const v = valorNA.ler();
      if (!(v >= 0)) { valorNA.campo.setAttribute("aria-invalid", "true"); valorNA.editar(); return; }
      ctx.bridge.request(A.updateGrupo, { nome, naoAtribuido: v, modo, mes }).then((r: any) => {
        ctx.toast(r.coberto > 0 ? "Orçamento salvo. " + F.moeda(r.coberto) + " cobriram categorias acima do orçamento; " + F.moeda(r.restante) + " ficaram sem atribuir."
          : "Orçamento do grupo salvo.", { duration: r.coberto > 0 ? 7000 : 3200 });
        return reabrir({ editando: false });
      }).catch((e: any) => ctx.toast(e.friendly, { tone: "error" }));
    }
    function desagrupar() {
      ZoZo.feedback.confirmarExclusao("Desagrupar categorias?", "O valor não planejado do grupo será apagado. Os orçamentos das categorias individuais continuam valendo. Essa ação não pode ser desfeita.",
        { confirmar: "Desagrupar" })
        .then((ok) => ok && ctx.bridge.request(A.desagruparCategorias, { nome }).then(() => {
          ctx.detail.close({ silencioso: true }); ctx.toast("Categorias desagrupadas."); return ctx.recarregarTudo();
        }).catch((e: any) => ctx.toast(e.friendly, { tone: "error" })));
    }

    const ordenadas = cats.slice().sort((a: any, b: any) => F.numero(b.gasto) - F.numero(a.gasto));
    const figura = (rotulo: any, conteudo: any) => h("div", { class: T.grupoItem }, h("span", { class: T.grupoRotulo }, rotulo), conteudo);
    ctx.detail.open({
      title: "Grupo de categorias",
      selected: { tipo: "grupo", id: nome },
      voltar: o.voltar,
      botoes: editando
        ? [{ label: "Cancelar", onClick: () => abrirGrupo(nome, ctx, Object.assign({}, o, { editando: false })) }, { label: "Salvar orçamento", primario: true, onClick: salvar }]
        : (orcamentoAtivo() ? [{ label: "Editar orçamento", onClick: () => abrirGrupo(nome, ctx, Object.assign({}, o, { editando: true })) }] : []),
      menu: [{ label: "Desagrupar categorias", onClick: desagrupar }],
      render(body: any) {
        const listaEl = h("div", { class: ZoZo.pecas.painelLista }, UI.Skeleton(3, { short: true }));
        mount(body,
          h("div", { class: [ZoZo.pecas.painelTopo, T.topoLinhas] },
            h("div", { class: [ZoZo.pecas.painelTopoInicio, T.leadPilha, T.colEsq] },
              h("div", { class: T.pilulas }, ordenadas.slice(0, 2).map((c: any) => UI.CategoryLabel(c, { pill: true })),
                maisCategorias(ordenadas, 2)),
              h("span", { class: [ZoZo.pecas.painelTopoNome, T.grupoNome] }, nome)),
            orcamentoAtivo() ? h("div", { class: T.grupoOrc },
              modoBtn,
              h("div", { class: T.grupoValores },
                figura("Subcategorias", h("span", { class: T.grupoValor }, F.moeda(info.subcategorias))),
                figura("Não atribuído", editando ? valorNA.el
                  : h("span", { class: T.grupoValor }, F.moeda(info.naoAtribuido))))) : null),
          orcamentoAtivo() ? C.detalheSecao(null,
            C.detalheLinha("Orçamento total do grupo", F.moeda(info.total)),
            C.detalheLinha("Gasto em " + mesNomeDe(mes), F.moeda(gasto)),
            UI.ProgressBar(info.total > 0 ? gasto / info.total : (gasto > 0 ? 1 : 0), { tone: gasto > info.total ? "over" : "ok", grande: true,
              label: gasto > info.total ? "Gasto acima do orçamento do grupo" : "Gasto dentro do orçamento do grupo" })) : null,
          C.detalheSecao("Categorias do grupo", h("div", { class: "tw:flex tw:flex-col" },
            ordenadas.map((c: any) => L.CategoryRow(c, { excluida: c.status === "excluida", onClick: () => abrirDetalhe(c, ctx, { voltar: () => abrirGrupo(nome, ctx, o) }) })))),
          C.detalheSecao("Transações do mês", listaEl));
        ctx.loadData("lancamentos", A.getLancamentos).then((dl: any) => {
          const ids = new Set(cats.map((c: any) => c.id));
          const itens = dl.lancamentos.filter((l: any) => ids.has(l.categoriaId) && l.data.startsWith(mes));
          mount(listaEl, itens.length
            // a transação abre aqui mesmo, com a seta para voltar a este grupo
            ? L.ListaPainel(itens, { onClick: (l) => ZoZo.lancamentoPainel.abrir(l, ctx, { voltar: () => abrirGrupo(nome, ctx, Object.assign({}, o, { editando: false })) }) })
            : UI.EmptyState("Nenhuma transação deste grupo no mês."));
        }).catch((e: any) => mount(listaEl, UI.ErrorState(e.friendly)));
      },
    });
  }

  /** "+N": abre a lista (só leitura) das categorias que não couberam nas pílulas */
  function maisCategorias(lista: any, visiveis: any) {
    if (lista.length <= visiveis) return null;
    const btn = h("button", { type: "button", class: T.mais, "aria-haspopup": "menu",
      "aria-label": "Ver as outras " + (lista.length - visiveis) + " categorias" }, "+" + (lista.length - visiveis));
    btn.addEventListener("click", () => ZoZo.menu.abrir(btn, lista.map((c: any) => ({
      render: () => h("div", { class: ZoZo.estrutura.menuItemEstatico, role: "menuitem", "aria-disabled": "true" }, UI.CategoryLabel(c, { pill: true })),
    })), { posicao: "esquerda", label: "Categorias", class: "tw:min-w-0! tw:w-max" }));       // largura das pílulas, sem sobra
    return btn;
  }

  /** Painel "Todas as categorias regulares" (ao clicar no gráfico) */
  function abrirTodas(ctx: ContextoApp) {
    const d = ZoZo.store.get().data.categorias;
    const regulares = (d.categorias || []).filter((c: any) => c.status === "regular");
    ctx.detail.open({
      title: "Categorias regulares",
      selected: { tipo: "categoria", id: "*" },
      render(body: any) {
        const grafico = h("div", { class: ZoZo.pecas.painelGrafico });
        const tags = regulares.slice().sort((a: any, b: any) => b.gasto - a.gasto);
        mount(body,
          h("div", { class: [ZoZo.pecas.painelTopo, T.topoLinhas] },
            h("div", { class: [ZoZo.pecas.painelTopoInicio, T.leadPilha, T.colEsq] },
              h("div", { class: T.pilulas }, tags.slice(0, 2).map((c: any) => UI.CategoryLabel(c, { pill: true })),
                maisCategorias(tags, 2)),
              h("span", { class: ZoZo.pecas.painelTopoNome }, "Todas as categorias regulares")),
            h("div", { class: [ZoZo.pecas.painelTopoNumero, T.colDir] },
              h("span", { class: ZoZo.pecas.painelTopoRotulo }, "Gasto em " + mesNomeDe(d.mes)),
              h("span", { class: [ZoZo.pecas.painelTopoValor, "money"] }, F.moeda(d.resumo.gasto)),
              resumoGasto(d.resumo.gasto, d.resumo.reservado))),
          grafico,
          C.detalheSecao(null,
            h("div", { class: T.tabela, role: "table", "aria-label": "Categorias regulares" },
              h("div", { class: [T.tabelaLinha, T.tabelaCab], role: "row" },
                h("span", { role: "columnheader" }, "Categoria"), h("span", { role: "columnheader", class: "tw:text-right" }, "Gasto"),
                h("span", { role: "columnheader", class: "tw:text-right" }, "Orçamento"), h("span", { role: "columnheader", class: "tw:text-right" }, "Restante")),
              regulares.map((c: any) => {
                const resto = F.numero(c.reservado) - F.numero(c.gasto);
                return h("button", { type: "button", class: [T.tabelaLinha, T.tabelaLinhaBotao], role: "row", onClick: () => abrirDetalhe(c, ctx) },
                  h("span", { class: T.tabelaNome, role: "cell" }, h("span", { class: ZoZo.pecas.catPonto, style: { background: F.cor(c.cor, "var(--palette-16)") } }), h("span", null, c.icone ? [ZoZo.dom.emoji(c.icone), " "] : null, c.nome)),
                  h("span", { class: "money", role: "cell" }, F.moeda(c.gasto)),
                  h("span", { class: "money", role: "cell" }, F.moeda(c.reservado)),
                  h("span", { class: ["money", resto < 0 && "money--negative"], role: "cell" }, (resto < 0 ? "−" : "") + F.moeda(resto)));
              }))));
        graficoMeses(ctx, null, grafico);
      },
    });
  }

  /** "+": pesquisa em modelos prontos + "Nova categoria" (como no Copilot) */
  function botaoNovaCategoria(ctx: ContextoApp) {
    const btn = UI.IconButton("mais", "Nova categoria", { onPrimary: true, expanded: false });
    btn.setAttribute("aria-haspopup", "menu");
    btn.addEventListener("click", () => ZoZo.menu.abrir(btn, { largura: 270, render(el, api) {
      const existentes = new Set((((ZoZo.store.get().data.categorias || {}).categorias) || []).map((c: any) => c.nome.toLowerCase()));
      const modelos = (ZoZo.regras.modelosCategoria || ZoZo.regras.categoriasSugeridas || []).filter((m) => !existentes.has(m.nome.toLowerCase()));
      const norm = (t: any) => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      let termo = "";
      const busca = h("input", { type: "search", class: ZoZo.estrutura.menuPesquisaCampo, placeholder: "Pesquisar", "aria-label": "Pesquisar modelos" });
      const lista = h("div", { class: ZoZo.estrutura.menuListaRolagem });
      const desenhar = () => {
        const itens = modelos.filter((m) => !termo || norm(m.nome).includes(termo));
        mount(lista, h("div", { class: ZoZo.estrutura.menuSecao }, "Modelos de categoria"),
          itens.length ? itens.map((m) => h("button", { type: "button", class: ZoZo.estrutura.menuItem, onClick: () => {
            api.fechar();
            ctx.bridge.request(A.createCategoria, { categoria: Object.assign({ reservado: 0, status: "regular", grupo: null }, m) }).then((r: any) => {
              ctx.toast("Categoria criada.");
              return ctx.recarregarTudo().then(() => abrirDetalhe(Object.assign({ gasto: 0 }, r.categoria), ctx));
            }).catch((e: any) => ctx.toast(e.friendly, { tone: "error" }));
          } }, h("span", { class: ZoZo.estrutura.menuEmoji }, ZoZo.dom.emoji(m.icone)), h("span", { class: ZoZo.estrutura.menuRotulo }, m.nome)))
            : h("p", { class: ZoZo.estrutura.menuVazio }, termo ? "Nenhum modelo encontrado." : "Todos os modelos já foram criados."));
      };
      busca.addEventListener("input", () => { termo = norm(busca.value.trim()); desenhar(); });
      mount(el, h("div", { class: ZoZo.estrutura.menuPesquisa }, ZoZo.icons.icon("pesquisar", { size: 14 }), busca), lista,
        h("div", { class: ZoZo.estrutura.menuSeparador }),
        h("button", { type: "button", class: ZoZo.estrutura.menuItem, onClick: () => { api.fechar(); ZoZo.modais.novaCategoria(ctx, { nome: termo ? busca.value.trim() : "", aoCriar: (c: any) => abrirDetalhe(Object.assign({ gasto: 0 }, c), ctx) }); } },
          ZoZo.icons.icon("mais", { size: 16, class: ZoZo.estrutura.menuIcone }), h("span", { class: ZoZo.estrutura.menuRotulo }, "Nova categoria")));
      desenhar();
      requestAnimationFrame(() => busca.focus());
    } }, { posicao: "direita", largura: 270, label: "Nova categoria", focar: false }));
    return btn;
  }

  ZoZo.categoriasShared = { abrirFormCategoria: (ctx: ContextoApp, cat: any, preset?: any, voltar?: any) => abrirFormCategoria(ctx, cat, preset, voltar), abrirDetalhe: (cat: any, ctx: ContextoApp, opts?: any) => abrirDetalhe(cat, ctx, opts), estruturar: (c: any, g: any) => estruturar(c, g), abrirGrupo: (nome: any, ctx: ContextoApp, opts?: any) => abrirGrupo(nome, ctx, opts) };

  ZoZo.pages.categorias = {
    titulo: "Categorias",
    topbar: (ctx) => [botaoNovaCategoria(ctx)],
    carregar: (ctx, force) => ctx.loadData("categorias", A.getCategorias, null, { force }),
    deps: (s) => [s.data.categorias, s.errors.categorias, s.ui.gruposFechados, s.selectedItem],
    render(state, ctx) {
      const espera = C.estadoCarregamento(state, ["categorias"], () => this.carregar(ctx, true), {
        skeleton: h("div", null, h("div", { class: ZoZo.pecas.esqueletoCardBaixo }), UI.Skeleton(8)),
      });
      if (espera) return C.pagina("page--categorias", espera);
      const d = state.data.categorias;
      const todas = d.categorias || [];
      const regulares = todas.filter((c: any) => c.status === "regular");
      const excluidas = todas.filter((c: any) => c.status === "excluida");

      if (!todas.length) {
        return C.pagina("page--categorias", h("div", { class: [ZoZo.pecas.vazio, T.vazioInicio] },
          ZoZo.icons.icon("categorias", { size: 22, class: ZoZo.pecas.vazioIcone }),
          h("p", { class: ZoZo.pecas.vazioTexto }, "Nenhuma categoria cadastrada."),
          h("div", { class: ZoZo.pecas.painelAcoes },
            UI.Button("Criar categorias sugeridas", { variant: "primary", icon: "categorias", onClick: (e) => {
              (e.currentTarget as HTMLButtonElement).disabled = true;
              ctx.bridge.request(A.createCategoriasSugeridas).then(() => { ctx.toast("Categorias criadas."); return ctx.recarregarTudo(); })
                .catch((err: any) => ctx.toast(err.friendly, { tone: "error" }));
            } }),
            UI.Button("Nova categoria", { icon: "mais", onClick: () => ZoZo.modais.novaCategoria(ctx, {}) }))));
      }

      return C.pagina("page--categorias",
        C.cardResumoDonut({
          ariaLabel: "Distribuição dos gastos por categoria",
          esquerda: { valor: d.resumo ? d.resumo.gasto : 0, label: "gasto em " + mesAbrevDe(d.mes) },
          direita: { valor: d.resumo ? d.resumo.reservado : 0, label: "orçamento total" },
          segmentos: regulares.map((c: any) => ({ label: c.nome, cor: c.cor, valor: c.gasto })),
          onClick: () => abrirTodas(ctx),
        }),
        UI.Section({ key: "cat:regulares", title: "Categorias regulares", classeCabecalho: T.cabecalho, classeLead: T.cabecalhoLead,
          aside: [h("span", { class: T.colGasto }, "Gasto"), h("span", { class: T.colEspaco }), h("span", { class: T.colReservado }, "Reservado")] },
          regulares.length ? h("div", { class: T.lista }, linhas(regulares, false, state, ctx)) : UI.EmptyState("Nenhuma categoria regular.", { icon: "categorias" })),
        UI.Section({ key: "cat:excluidas", title: "Categorias excluídas" },
          excluidas.length ? h("div", { class: T.lista }, linhas(excluidas, true, state, ctx)) : UI.EmptyState("Nenhuma categoria excluída.", { icon: "categorias" })));
    },
  };
})(window.ZoZo);
