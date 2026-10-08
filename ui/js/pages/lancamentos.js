/* =============================================================
   ZoZo — Lançamentos (seções 14–17, 33)
   Lista agrupada por mês e dia · filtros com chips · barra de
   informações · seleção múltipla com ações em lote · painel com
   visualização e edição (Grid Superior / Central / Inferior / Notas)
   ============================================================= */
(function (ZoZo) {
  "use strict";
  const { h, mount } = ZoZo.dom;
  const { icon } = ZoZo.icons;
  const UI = ZoZo.ui;
  const L = ZoZo.list;
  const C = ZoZo.pagesComum;
  const F = ZoZo.format;
  const A = ZoZo.messages.ACTIONS;
  const store = ZoZo.store;


  /* ---------------- Filtros ---------------- */
  const FILTROS_VAZIOS = () => ({ contas: [], categorias: [], statusCategoria: "ambos", perfis: [], periodo: null, recorrencias: [], tipos: [], ordem: "data-desc" });
  const filtros = () => Object.assign(FILTROS_VAZIOS(), store.get().ui.filtros || {});
  const setFiltros = (patch, ctx) => {
    store.set({ ui: { filtros: Object.assign(filtros(), patch), selecionados: [] } });
    if (ctx) ctx.refreshTopbar();
  };

  const PERIODOS = [
    { value: "semana", label: "Esta semana" },
    { value: "semanaPassada", label: "Semana passada" },
    { value: "mes", label: "Este mês" },
    { value: "mesPassado", label: "Mês passado" },
    { value: "ultimos30", label: "Últimos 30 dias" },
    { value: "ano", label: "Este ano" },
    { value: "anoPassado", label: "Último ano" },
    { value: "ultimos365", label: "Últimos 365 dias" },
  ];
  const ORDENS = [
    { value: "data-asc", grupo: "Data", label: "Mais antigo para o mais novo" },
    { value: "data-desc", grupo: "Data", label: "Mais novo para o mais antigo" },
    { value: "valor-asc", grupo: "Valor", label: "Menor para o maior" },
    { value: "valor-desc", grupo: "Valor", label: "Maior para o menor" },
  ];
  const TIPOS_FILTRO = [
    { value: "receita", label: "Receita" },
    { value: "interno", label: "Transferência" },
    { value: "regular", label: "Regular" },
    { value: "recorrente", label: "Recorrente" },
  ];

  function intervalo(periodo) {
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const d = (y, m, dd) => new Date(y, m, dd);
    const Y = hoje.getFullYear(), M = hoje.getMonth();
    const inicioSemana = new Date(hoje); inicioSemana.setDate(hoje.getDate() - hoje.getDay());   // domingo
    switch (periodo) {
      case "semana": { const f = new Date(inicioSemana); f.setDate(f.getDate() + 6); return [inicioSemana, f]; }
      case "semanaPassada": { const i = new Date(inicioSemana); i.setDate(i.getDate() - 7); const f = new Date(inicioSemana); f.setDate(f.getDate() - 1); return [i, f]; }
      case "mes": return [d(Y, M, 1), d(Y, M + 1, 0)];
      case "mesPassado": return [d(Y, M - 1, 1), d(Y, M, 0)];
      case "ultimos30": { const i = new Date(hoje); i.setDate(i.getDate() - 29); return [i, hoje]; }
      case "ano": return [d(Y, 0, 1), d(Y, 11, 31)];
      case "anoPassado": return [d(Y - 1, 0, 1), d(Y - 1, 11, 31)];
      case "ultimos365": { const i = new Date(hoje); i.setDate(i.getDate() - 364); return [i, hoje]; }
    }
    return null;
  }

  const normalizar = (t) => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

  function aplicarFiltros(lancamentos, st) {
    // Área principal mostra só até HOJE (parcelas e agendamentos futuros ficam de fora)
    const hoje = F.iso(new Date());
    lancamentos = lancamentos.filter((l) => l.data <= hoje);
    const f = filtros();
    const termo = normalizar(st.ui.busca).trim();
    const cats = (st.data.categorias && st.data.categorias.categorias) || [];
    const statusDe = (id) => { const c = cats.find((x) => x.id === id); return c ? c.status : null; };
    const faixa = f.periodo ? intervalo(f.periodo).map(F.iso) : null;
    const comPerfis = ZoZo.recursos.perfis();            // filtro de perfil só existe para contas com o recurso
    let out = lancamentos.filter((l) => {
      if (f.contas.length && !f.contas.includes(l.contaId)) return false;
      if (f.categorias.length && !f.categorias.includes(l.categoriaId)) return false;
      if (f.statusCategoria !== "ambos" && statusDe(l.categoriaId) !== (f.statusCategoria === "excluidas" ? "excluida" : "regular")) return false;
      if (comPerfis && f.perfis.length && !f.perfis.includes(l.perfilId)) return false;
      if (faixa && (l.data < faixa[0] || l.data > faixa[1])) return false;
      if (f.tipos.length && !f.tipos.includes(l.tipo)) return false;
      if (f.recorrencias.length && !f.recorrencias.some((sid) => l.id === sid || l.serieId === sid)) return false;
      if (termo && ![l.descricao, l.nomeConta, l.ultimos4Digitos, l.categoria && l.categoria.nome, l.perfil && l.perfil.nome, l.notas].some((v) => normalizar(v).includes(termo))) return false;
      return true;
    });
    const [campo, dir] = f.ordem.split("-");
    const k = dir === "asc" ? 1 : -1;
    out = out.slice().sort((a, b) => k * (campo === "valor" ? a.valor - b.valor : a.data.localeCompare(b.data) || a.id.localeCompare(b.id)));
    return out;
  }

  function temFiltro(st) {
    const f = filtros();
    return !!(f.contas.length || f.categorias.length || f.statusCategoria !== "ambos" || (ZoZo.recursos.perfis() && f.perfis.length) || f.periodo || f.recorrencias.length || f.tipos.length || f.ordem !== "data-desc" || (st.ui.busca || "").trim());
  }

  function totais(itens) {
    const T = ZoZo.regras.totais;
    const gasto = itens.reduce((s, l) => s + (T.gasto[l.tipo] || 0) * l.valor, 0);
    const recebido = itens.reduce((s, l) => s + (T.recebido[l.tipo] || 0) * l.valor, 0);
    return { gasto, recebido, liquido: recebido - gasto };
  }

  /* ---------------- Menu de filtros (submenus ao passar o mouse) ---------------- */
  function abrirMenuFiltros(anchor, ctx, posicao) {
    const st = store.get();
    const contas = (st.data.contas && st.data.contas.contas) || [];
    const cats = (st.data.categorias && st.data.categorias.categorias) || [];
    const perfis = (st.data.perfis && st.data.perfis.perfis) || [];
    const recs = (st.data.recorrencias && st.data.recorrencias.recorrencias) || [];
    const LM = ZoZo.menu.listaMarcavel;

    const alternar = (chave) => (valor) => {
      const lista = filtros()[chave].slice();
      const i = lista.indexOf(valor);
      if (i >= 0) lista.splice(i, 1); else lista.push(valor);
      setFiltros({ [chave]: lista }, ctx);
    };
    const marcados = (chave) => () => filtros()[chave];
    const qtd = (n) => (n ? String(n) : "");
    const unico = (chave, opcoes) => () => opcoes.map((o) => ({
      label: o.label, check: filtros()[chave] === o.value, manterAberto: true,
      onClick: () => setFiltros({ [chave]: chave === "periodo" && filtros()[chave] === o.value ? null : o.value }, ctx),
    }));

    // Categoria: Regulares / Excluídas / Ambos acima da lista
    const statusCategoria = (redesenhar) => h("div", { class: "menu__segment", role: "radiogroup", "aria-label": "Tipo de categoria" },
      [["regulares", "Regulares"], ["excluidas", "Excluídas"], ["ambos", "Ambos"]].map(([v, t]) => h("button", {
        type: "button", role: "radio", "aria-checked": String(filtros().statusCategoria === v),
        class: ["popover__segment-item", filtros().statusCategoria === v && "is-active"],
        onClick: (e) => {
          setFiltros({ statusCategoria: v }, ctx);
          e.currentTarget.parentNode.querySelectorAll("button").forEach((b) => { const on = b === e.currentTarget; b.classList.toggle("is-active", on); b.setAttribute("aria-checked", String(on)); });
          redesenhar();
        },
      }, t)));

    ZoZo.menu.abrir(anchor, () => [
      { secao: "Filtrar por" },
      { icone: "contas", label: "Conta", valor: qtd(filtros().contas.length),
        submenu: LM({ itens: contas.map((c) => ({ value: c.id, label: c.nome + (c.ultimos4Digitos ? " " + c.ultimos4Digitos : ""), cor: c.cor })), marcados: marcados("contas"), alternar: alternar("contas"), vazio: "Nenhuma conta." }) },
      { icone: "categorias", label: "Categoria", valor: qtd(filtros().categorias.length + (filtros().statusCategoria !== "ambos" ? 1 : 0)),
        submenu: LM({ itens: cats.map((c) => ({ value: c.id, label: c.nome, icone: c.icone })), marcados: marcados("categorias"), alternar: alternar("categorias"), topo: statusCategoria, vazio: "Nenhuma categoria." }) },
      ...(ZoZo.recursos.perfis() ? [{ icone: "perfil", label: "Perfil", valor: qtd(filtros().perfis.length),
        submenu: LM({ itens: perfis.map((p) => ({ value: p.id, label: p.nome + (p.arquivado ? " (arquivado)" : ""), cor: p.cor })), marcados: marcados("perfis"), alternar: alternar("perfis"), vazio: "Nenhum perfil." }) }] : []),
      { icone: "calendario", label: "Data", valor: filtros().periodo ? "1" : "", submenu: unico("periodo", PERIODOS) },
      { icone: "recorrencias", label: "Recorrência", valor: qtd(filtros().recorrencias.length),
        submenu: LM({ itens: recs.filter((r, i, arr) => arr.findIndex((x) => x.serieId === r.serieId) === i).map((r) => ({ value: r.serieId, label: r.descricao + " · " + r.tipoRecorrencia, icone: r.categoria && r.categoria.icone })),
          marcados: marcados("recorrencias"), alternar: alternar("recorrencias"), vazio: "Nenhuma recorrência neste mês." }) },
      { icone: "interno", label: "Tipo", valor: qtd(filtros().tipos.length),
        submenu: LM({ itens: TIPOS_FILTRO, marcados: marcados("tipos"), alternar: alternar("tipos"), largura: 240 }) },
      { separador: true },
      { secao: "Ordenar por" },
      { icone: "calendario", label: "Data", submenu: unico("ordem", ORDENS.filter((o) => o.grupo === "Data")) },
      { icone: "ordenar", label: "Valor", submenu: unico("ordem", ORDENS.filter((o) => o.grupo === "Valor")) },
      { separador: true },
      { label: "Limpar tudo", onClick: () => { store.set({ ui: { filtros: FILTROS_VAZIOS(), busca: "", selecionados: [] } }); ctx.refreshTopbar(); } },
    ], { posicao: posicao || "direita", label: "Filtros", largura: 240, larguraSub: 250 });
  }

  /** Chips dos filtros ativos (abaixo da barra superior) */
  function chipsFiltros(st, ctx) {
    const f = filtros();
    const contas = (st.data.contas && st.data.contas.contas) || [];
    const cats = (st.data.categorias && st.data.categorias.categorias) || [];
    const perfis = (st.data.perfis && st.data.perfis.perfis) || [];
    const recs = (st.data.recorrencias && st.data.recorrencias.recorrencias) || [];
    const nomes = (ids, lista, campo) => ids.map((id) => { const x = lista.find((y) => (y.id || y.serieId) === id); return x ? x[campo || "nome"] : "—"; }).join(", ");
    const chips = [];
    const chip = (rotulo, valor, limpar) => chips.push(h("span", { class: "filter-chip" },
      h("span", { class: "filter-chip__label" }, rotulo + ": "), h("span", { class: "filter-chip__value" }, valor),
      h("button", { type: "button", class: "filter-chip__remove", "aria-label": "Remover filtro " + rotulo, onClick: limpar }, icon("fechar", { size: 12, stroke: 2.25 }))));
    if (f.contas.length) chip("Conta", nomes(f.contas, contas), () => setFiltros({ contas: [] }, ctx));
    if (f.categorias.length) chip("Categoria", nomes(f.categorias, cats), () => setFiltros({ categorias: [] }, ctx));
    if (f.statusCategoria !== "ambos") chip("Categorias", f.statusCategoria === "excluidas" ? "Excluídas" : "Regulares", () => setFiltros({ statusCategoria: "ambos" }, ctx));
    if (ZoZo.recursos.perfis() && f.perfis.length) chip("Perfil", nomes(f.perfis, perfis), () => setFiltros({ perfis: [] }, ctx));
    if (f.periodo) chip("Data", (PERIODOS.find((p) => p.value === f.periodo) || {}).label, () => setFiltros({ periodo: null }, ctx));
    if (f.recorrencias.length) chip("Recorrência", f.recorrencias.map((sid) => { const r = recs.find((x) => x.serieId === sid); return r ? r.descricao : "—"; }).join(", "), () => setFiltros({ recorrencias: [] }, ctx));
    if (f.tipos.length) chip("Tipo", f.tipos.map((t) => (TIPOS_FILTRO.find((x) => x.value === t) || {}).label).join(", "), () => setFiltros({ tipos: [] }, ctx));
    if (f.ordem !== "data-desc") chip("Ordem", (ORDENS.find((o) => o.value === f.ordem) || {}).grupo + " · " + (ORDENS.find((o) => o.value === f.ordem) || {}).label, () => setFiltros({ ordem: "data-desc" }, ctx));
    if ((st.ui.busca || "").trim()) chip("Pesquisa", st.ui.busca.trim(), () => { store.set({ ui: { busca: "" } }); ctx.refreshTopbar(); });
    const add = h("button", { type: "button", class: "filter-add", "aria-haspopup": "dialog" }, icon("mais", { size: 14 }), h("span", null, "Adicionar filtro"));
    add.addEventListener("click", () => abrirMenuFiltros(add, ctx, "esquerda"));
    return h("div", { class: "filter-chips" }, chips, add);
  }

  function barraInformacoes(itens) {
    const t = totais(itens);
    return h("div", { class: "info-bar", role: "status" },
      h("span", { class: "info-bar__count" }, itens.length === 1 ? "1 lançamento" : itens.length + " lançamentos"),
      h("span", { class: "info-bar__totals" },
        h("span", null, "Total gasto ", h("strong", { class: "money" }, F.moeda(t.gasto))),
        h("span", null, "Total recebido ", h("strong", { class: "money money--income" }, F.moeda(t.recebido))),
        h("span", null, "Saldo líquido ", h("strong", { class: ["money", t.liquido < 0 ? "money--negative" : "money--income"] }, (t.liquido < 0 ? "−" : "") + F.moeda(t.liquido)))));
  }

  /* ---------------- Datas dos grupos ---------------- */
  const rotuloDia = F.rotuloDia;

  /* ---------------- Recarregamento após alterações (seção 54) ---------------- */
  function aposAlterar(ctx) { return ctx.recarregarTudo(); }

  /* ---------------- Painel do lançamento (js/pages/lancamento-painel.js) ---------------- */
  function abrirVisualizacao(l, ctx, opts) { return ZoZo.lancamentoPainel.abrir(l, ctx, opts); }
  function abrirFormulario(l, ctx, preset) { return ZoZo.lancamentoPainel.abrir(l, ctx, l ? {} : { preset }); }

  /* ---------------- Barra de seleção (ações em lote) ---------------- */
  function barraSelecao(st, ctx, visiveis) {
    const sel = st.ui.selecionados || [];
    if (!sel.length) return null;
    const limpar = () => store.set({ ui: { selecionados: [] } });
    const aplicar = (dados, msg) => ctx.bridge.request(A.updateLancamentosEmLote, Object.assign({ ids: sel }, dados))
      .then(() => { ctx.toast(msg); limpar(); return aposAlterar(ctx); })
      .catch((e) => ctx.toast(e.friendly, { tone: "error" }));

    const botao = (icone, texto) => h("button", { type: "button", class: "selbar__btn", "aria-haspopup": "menu" }, icon(icone, { size: 15 }), texto);

    const categoriaBtn = botao("categorias", "Categoria");
    categoriaBtn.addEventListener("click", () => {
      const cats = (store.get().data.categorias && store.get().data.categorias.categorias) || [];
      ZoZo.menu.abrir(categoriaBtn, { largura: 250, render(el, api) {
        let termo = "";
        const norm = (t) => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
        const lista = h("div", { class: "menu__list" });
        const busca = h("input", { type: "search", class: "menu__search-input", placeholder: "Pesquisar categoria", "aria-label": "Pesquisar categoria" });
        const desenhar = () => mount(lista, cats.filter((c) => !termo || norm(c.nome).includes(termo)).map((c) =>
          h("button", { type: "button", class: "menu__item", onClick: () => { api.fechar(); aplicar({ categoriaId: c.id }, "Categoria definida."); } }, UI.CategoryLabel(c, { pill: true }))));
        busca.addEventListener("input", () => { termo = norm(busca.value.trim()); desenhar(); });
        mount(el, h("div", { class: "menu__search" }, icon("pesquisar", { size: 14 }), busca), lista);
        desenhar();
      } }, { posicao: "acima", largura: 250, label: "Definir categoria" });
    });

    const tipoBtn = botao("interno", "Tipo");
    tipoBtn.addEventListener("click", () => ZoZo.menu.abrir(tipoBtn, [
      ["receita", "Receita"], ["interno", "Transferência"], ["regular", "Regular"],
    ].map(([v, t]) => ({ label: t, onClick: () => aplicar({ tipo: v }, "Tipo alterado.") })), { posicao: "acima", label: "Mudar tipo" }));

    const perfilBtn = ZoZo.recursos.perfis() ? botao("perfil", "Perfil") : null;      // só contas com o recurso de Perfis
    if (perfilBtn) perfilBtn.addEventListener("click", () => {
      const perfis = ((store.get().data.perfis && store.get().data.perfis.perfis) || []).filter((p) => !p.arquivado);
      ZoZo.menu.abrir(perfilBtn, perfis.map((p) => ({ render: (api) => h("button", { type: "button", class: "menu__item", onClick: () => { api.fechar(); aplicar({ perfilId: p.id }, "Perfil definido."); } }, UI.Tag(p.nome, p.cor, { class: "tag--upper" })) }))
        .concat([{ label: "Sem perfil", onClick: () => aplicar({ perfilId: null }, "Perfil removido.") }, { separador: true },
          { icone: "mais", label: "Criar novo perfil", onClick: () => ZoZo.modais.novoPerfil(ctx, { aoCriar: (np) => aplicar({ perfilId: np.id }, "Perfil criado e definido.") }) }]), { posicao: "acima", label: "Definir perfil" });
    });

    const maisBtn = h("button", { type: "button", class: "selbar__btn selbar__btn--icon", "aria-label": "Mais ações", "aria-haspopup": "menu" }, icon("opcoes", { size: 16 }));
    maisBtn.addEventListener("click", () => ZoZo.menu.abrir(maisBtn, [
      { label: "Marcar todos", onClick: () => store.set({ ui: { selecionados: visiveis.map((l) => l.id) } }) },
      { label: "Desmarcar todos", onClick: limpar },
      { separador: true },
      { label: "Excluir", perigo: true, onClick: () => {
        ZoZo.feedback.confirmarExclusao(sel.length === 1 ? "Excluir lançamento?" : "Excluir lançamentos?",
          sel.length === 1 ? "Tem certeza de que deseja excluir este lançamento?" : "Tem certeza de que deseja excluir estes " + sel.length + " lançamentos?")
          .then((ok) => ok && ctx.bridge.request(A.deleteLancamentos, { ids: sel }).then(() => {
            ctx.detail.close({ silencioso: true }); limpar(); ctx.toast("Lançamentos excluídos."); return aposAlterar(ctx);
          }).catch((e) => ctx.toast(e.friendly, { tone: "error" })));
      } },
    ], { posicao: "acima", label: "Mais ações", class: "menu--compacto" }));

    return h("div", { class: "selbar", role: "toolbar", "aria-label": "Ações para os lançamentos selecionados" },
      h("button", { type: "button", class: "selbar__btn selbar__btn--icon", "aria-label": "Fechar seleção", onClick: limpar }, icon("fechar", { size: 15 })),
      h("span", { class: "selbar__count" }, sel.length === 1 ? "1 selecionado" : sel.length + " selecionados"),
      h("span", { class: "selbar__sep", "aria-hidden": "true" }),
      categoriaBtn, tipoBtn, perfilBtn, maisBtn);
  }

  /* ---------------- Ações da barra superior ---------------- */
  let buscaTimer = null;
  function acoes(ctx) {
    const st = store.get();
    const busca = h("input", {
      type: "search", class: "topbar-search__input", placeholder: "Pesquisar", "aria-label": "Pesquisar lançamentos", value: st.ui.busca,
      onInput: (e) => { clearTimeout(buscaTimer); const v = e.target.value; buscaTimer = setTimeout(() => store.set({ ui: { busca: v, selecionados: [] } }), 160); },
    });
    // Filtro ativo = algum filtro diferente do padrão (a pesquisa tem o próprio campo)
    const padrao = FILTROS_VAZIOS();
    const ativos = Object.keys(padrao).some((k) => JSON.stringify(filtros()[k]) !== JSON.stringify(padrao[k]));
    const filtroBtn = h("button", { type: "button", class: ["topbar-search__filter", ativos && "is-active"], "aria-label": "Filtrar", title: "Filtrar",
      "aria-haspopup": "menu", "aria-expanded": "false" }, icon("filtrar", { size: 16 }));
    filtroBtn.addEventListener("click", () => abrirMenuFiltros(filtroBtn, ctx, "direita"));
    return [
      UI.IconButton("mais", "Novo lançamento", { onPrimary: true, onClick: () => abrirFormulario(null, ctx) }),
      ZoZo.recursos.boleto() ? UI.IconButton("boleto", "Criar boleto", { onPrimary: true, onClick: () => ZoZo.boleto.open(ctx, { perfilId: filtros().perfis[0] || null }) }) : null,
      UI.IconButton("baixar-circulo", "Exportar lançamentos (CSV)", { onPrimary: true, onClick: (e) => ZoZo.exportarCsv(ctx, e.currentTarget) }),
      h("div", { class: "topbar-search topbar-search--larga" }, icon("pesquisar", { size: 15 }), busca, filtroBtn),
    ];
  }

  /* Checkbox ao lado do título: seleciona todos os lançamentos visíveis */
  let checkTodos = null;
  function prefixo() {
    const box = UI.Checkbox(false, (marcar) => {
      const st = store.get();
      const visiveis = aplicarFiltros((st.data.lancamentos && st.data.lancamentos.lancamentos) || [], st);
      store.set({ ui: { selecionados: marcar ? visiveis.map((l) => l.id) : [] } });
    }, { label: "Selecionar todos os lançamentos", class: "topbar-check" });
    checkTodos = box.querySelector("input");
    return box;
  }

  /* ---------------- Página ---------------- */
  ZoZo.pages.lancamentos = {
    titulo: "Lançamentos",
    topbar: acoes,
    prefixo,
    carregar(ctx, force) {
      return Promise.all([
        ctx.loadData("lancamentos", A.getLancamentos, null, { force }),
        ctx.loadData("perfis", A.getPerfis, null, { force }),
        ctx.loadData("categorias", A.getCategorias, null, { force }).catch(() => null),
        ctx.loadData("contas", A.getContas, null, { force }).catch(() => null),
        ctx.loadData("recorrencias", A.getRecorrencias, null, { force }).catch(() => null),
      ]).then(() => ctx.refreshTopbar());
    },
    deps: (s) => [s.data.lancamentos, s.data.perfis, s.data.categorias, s.errors.lancamentos, s.errors.perfis, s.ui.filtros, s.ui.busca, s.ui.selecionados, s.selectedItem],
    render(state, ctx) {
      const espera = C.estadoCarregamento(state, ["lancamentos", "perfis"], () => this.carregar(ctx, true), { skeleton: UI.Skeleton(10) });
      if (espera) return C.pagina("page--lancamentos", espera);

      const todos = state.data.lancamentos.lancamentos || [];
      const itens = aplicarFiltros(todos, state);
      const filtrando = temFiltro(state);
      const selId = state.selectedItem && state.selectedItem.tipo === "lancamento" ? state.selectedItem.id : null;
      const marcados = new Set(state.ui.selecionados || []);
      if (checkTodos) {
        const todosMarcados = itens.length > 0 && itens.every((l) => marcados.has(l.id));
        checkTodos.checked = todosMarcados;
        checkTodos.indeterminate = !todosMarcados && itens.some((l) => marcados.has(l.id));
      }
      const alternarMarca = (id, v) => {
        const atual = new Set(store.get().ui.selecionados || []);
        if (v) atual.add(id); else atual.delete(id);
        store.set({ ui: { selecionados: Array.from(atual) } });
      };

      const topo = filtrando ? [barraInformacoes(itens), chipsFiltros(state, ctx)] : null;

      if (!itens.length) {
        return C.pagina("page--lancamentos", topo, filtrando
          ? UI.EmptyState("Nenhum lançamento encontrado com esses filtros.", { icon: "pesquisar", action: { label: "Limpar filtros", onClick: () => { store.set({ ui: { filtros: FILTROS_VAZIOS(), busca: "" } }); ctx.refreshTopbar(); } } })
          : UI.EmptyState("Nenhum lançamento ainda.", { action: { label: "Novo lançamento", icon: "mais", onClick: () => abrirFormulario(null, ctx) } }));
      }

      const linha = (l, comData) => L.LaunchRow(l, {
        selected: l.id === selId,
        marcado: marcados.has(l.id),
        onMarcar: (v) => alternarMarca(l.id, v),
        mostrarData: comData,
        onClick: () => abrirVisualizacao(l, ctx),
      });

      const blocos = [];
      if (filtros().ordem.startsWith("valor")) {
        blocos.push(h("section", { class: "month-group" },
          h("h2", { class: "month-group__title" }, "Ordenado por valor"),
          h("div", { class: "list" }, itens.map((l) => linha(l, true)))));
      } else {
        let mesAtual = null, diaAtual = null, secao = null, lista = null;
        itens.forEach((l) => {
          const mes = l.data.slice(0, 7);
          if (mes !== mesAtual) {
            mesAtual = mes; diaAtual = null;
            // Total gasto do mês (mesma regra da barra de informações) à direita
            const doMes = itens.filter((x) => x.data.slice(0, 7) === mes);
            secao = h("section", { class: "month-group" },
              h("header", { class: "month-group__head" },
                h("h2", { class: "month-group__title" }, F.mesAno(mes + "-01")),
                h("span", { class: "month-group__total money", title: "Total gasto no mês" }, F.moeda(totais(doMes).gasto))));
            blocos.push(secao);
          }
          if (l.data !== diaAtual) {
            diaAtual = l.data;
            secao.appendChild(h("h3", { class: "day-group__title" }, rotuloDia(l.data)));
            lista = h("div", { class: "list" });
            secao.appendChild(lista);
          }
          lista.appendChild(linha(l, false));
        });
      }

      return C.pagina("page--lancamentos", topo, blocos, barraSelecao(state, ctx, itens));
    },
    selecionar(sel, ctx) {
      const l = (store.get().data.lancamentos.lancamentos || []).find((x) => x.id === sel.id);
      if (l) {
        abrirVisualizacao(l, ctx);
        requestAnimationFrame(() => {
          const row = document.querySelector('.launch-row[data-id="' + CSS.escape(l.id) + '"]');
          if (row) row.scrollIntoView({ block: "center" });
        });
      }
    },
  };

  ZoZo.lancamentosShared = { abrirFormulario, abrirVisualizacao, setFiltros, FILTROS_VAZIOS };
})(window.ZoZo);
