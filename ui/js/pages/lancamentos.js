/* =============================================================
   ZoZo — Transações (seções 14–17, 33)
   Lista agrupada por mês e dia · filtros com chips · barra de
   informações · seleção múltipla com ações em lote · painel com
   visualização e edição (Grid Superior / Central / Inferior / Notas)
   Visual em Tailwind (tabela T abaixo; a linha da transação está em
   components/list.js). Classes sem tw: que sobraram são ganchos
   (selbar: impressão; page--lancamentos: página atual).
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

  /* ---------------- Visual (Tailwind; classes escritas por inteiro) ---------------- */
  const BOTAO_SELBAR = "tw:inline-flex tw:items-center tw:gap-1.5 tw:h-8 tw:py-0 tw:border tw:border-zz-border tw:rounded-lg tw:bg-zz-surface "
    + "tw:text-[13px] tw:font-medium tw:hover:bg-zz-surface-hover tw:gaveta:size-[34px] tw:gaveta:p-0 tw:gaveta:justify-center tw:gaveta:flex-none";
  const TITULO_MES = "tw:text-[20px] tw:font-[620] tw:tracking-[-0.01em]";
  const T = {
    // pesquisa na barra superior (branca com contorno; o filtro fica dentro, à direita). topbar-search__input: gancho do atalho / e Ctrl+K
    pesquisa: "tw:flex tw:items-center tw:gap-1.5 tw:h-8 tw:w-[clamp(140px,32vw,380px)] tw:min-w-0 tw:pt-0 tw:pr-1 tw:pb-0 tw:pl-2.5 tw:rounded-lg "
      + "tw:bg-zz-surface tw:border tw:border-zz-border-strong tw:text-zz-muted tw:[transition:background_var(--duration-fast)] "
      + "tw:focus-within:border-zz-primary tw:focus-within:[box-shadow:0_0_0_3px_var(--color-primary-soft)] tw:focus-within:text-zz-secondary "
      + "tw:ate520:w-auto tw:ate520:flex-auto",
    pesquisaCampo: "topbar-search__input tw:flex-1 tw:min-w-0 tw:h-full tw:[border:0] tw:bg-transparent tw:outline-none tw:text-zz-text tw:text-[15px] "
      + "tw:placeholder:text-zz-muted tw:[&::-webkit-search-cancel-button]:opacity-60 tw:ate520:w-full",
    pesquisaFiltro: "tw:w-7 tw:h-[26px] tw:grid tw:place-items-center tw:flex-none tw:[border:0] tw:rounded-lg "
      + "tw:focus-visible:outline-2 tw:focus-visible:outline-[color:var(--color-focus)] tw:focus-visible:outline-offset-0",
    pesquisaFiltroNormal: "tw:bg-transparent tw:text-zz-secondary tw:hover:bg-zz-surface-hover tw:hover:text-zz-text "
      + "tw:[&.is-open]:bg-zz-surface-hover tw:[&.is-open]:text-zz-text",
    pesquisaFiltroAtivo: "tw:bg-zz-primary-soft tw:text-zz-primary",
    // a barra de seleção fica presa ao rodapé da área (mesmo com poucas transações)
    pagina: "page--lancamentos tw:flex tw:flex-col tw:min-h-full tw:*:shrink-0 tw:[&>:has(+.selbar)]:mb-5",
    info: "tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-x-5 tw:gap-y-2 tw:min-h-11 tw:py-2 tw:px-(--page-gutter) "
      + "tw:-mt-5 tw:-mx-(--page-gutter) tw:mb-4 tw:border-b tw:border-b-zz-border tw:bg-zz-surface tw:text-[13px] tw:text-zz-secondary",
    infoQtd: "tw:font-semibold tw:text-zz-text",
    infoTotais: "tw:flex tw:flex-wrap tw:justify-end tw:gap-x-5 tw:gap-y-2",
    infoValor: "tw:ml-1 tw:text-zz-text",
    // os chips surgem suaves; na entrada da página valem as animações da própria página
    chips: "tw:flex tw:flex-wrap tw:items-center tw:gap-2 tw:mb-3 tw:[:not(.page--entrar)>&]:animate-zz-chips tw:motion-reduce:animate-none",
    chip: "tw:inline-flex tw:items-center tw:gap-0.5 tw:h-7 tw:pl-2.5 tw:pr-1 tw:max-w-[360px] tw:border tw:border-zz-border-strong "
      + "tw:rounded-(--radius-pill) tw:bg-zz-surface tw:text-[13px]",
    chipRotulo: "tw:flex-none tw:text-zz-secondary",
    chipValor: "tw:font-medium tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap",
    chipRemover: "tw:grid tw:place-items-center tw:size-[22px] tw:ml-1 tw:flex-none tw:[border:0] tw:rounded-[50%] tw:bg-transparent "
      + "tw:text-zz-secondary tw:hover:bg-zz-surface-hover tw:hover:text-zz-text",
    adicionar: "tw:inline-flex tw:items-center tw:gap-1.5 tw:h-7 tw:px-3 tw:py-0 tw:border tw:border-dashed tw:border-zz-border-strong "
      + "tw:rounded-(--radius-pill) tw:bg-transparent tw:text-zz-secondary tw:text-[13px] tw:hover:text-zz-primary tw:hover:border-zz-primary",
    mesSeguinte: "tw:mt-4",
    mesCab: "tw:flex tw:items-baseline tw:justify-between tw:gap-4 tw:pt-2",
    mesTitulo: "tw:p-0 " + TITULO_MES,
    mesTituloSolto: "tw:pt-2 tw:px-4 tw:pb-1 " + TITULO_MES,          // "Ordenado por valor" (sem total ao lado)
    mesTotal: "money " + TITULO_MES,
    // data do dia fica presa no topo enquanto a lista rola
    dia: "tw:sticky tw:top-0 tw:z-2 tw:pt-3 tw:mb-4 tw:leading-[1.2] tw:bg-(--color-background) tw:text-zz-secondary tw:text-[13px] "
      + "tw:font-[620] tw:tracking-normal tw:normal-case",
    lista: "tw:flex tw:flex-col",
    // a lista entra suave quando a pesquisa muda (meses em sequência)
    busca: ["tw:animate-zz-busca tw:motion-reduce:animate-none", "tw:animate-zz-busca-30 tw:motion-reduce:animate-none",
      "tw:animate-zz-busca-60 tw:motion-reduce:animate-none"],
    selbar: "selbar tw:sticky tw:bottom-5 tw:z-5 tw:flex tw:items-center tw:gap-1 tw:w-max tw:max-w-full tw:mt-auto tw:mx-auto tw:mb-0 "
      + "tw:self-center tw:p-[5px] tw:border tw:border-zz-border tw:rounded-xl tw:bg-zz-surface tw:shadow-(--shadow-popover) "
      + "tw:animate-zz-selbar tw:motion-reduce:animate-none tw:gaveta:w-auto tw:gaveta:max-w-[calc(100%-8px)] tw:gaveta:flex-nowrap tw:gaveta:justify-center",
    selbarBtn: BOTAO_SELBAR + " tw:px-3",
    selbarIcone: BOTAO_SELBAR + " tw:w-8 tw:px-0 tw:justify-center",
    selbarTxt: "tw:gaveta:hidden",
    selbarQtd: "tw:pl-1 tw:pr-2.5 tw:text-[13px] tw:font-semibold tw:whitespace-nowrap tw:gaveta:px-1.5",
    selbarSep: "tw:w-px tw:h-[22px] tw:mx-1 tw:bg-zz-border",
  };


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
    { value: "debito", label: "Débito" },
    { value: "regular", label: "Regular" },
    { value: "estorno", label: "Estorno" },
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

  const normalizar = (t) => ZoZo.busca.normalizar(t);

  /* ---------------- Pesquisa (busca local: js/core/busca.ts) ----------------
     Os dados são cifrados de ponta a ponta, então a busca roda aqui. Campos e pesos: descrição pesa
     mais; valor e data entram em vários formatos ("1.234,56", "1234", "11/10", "outubro"). */
  const TIPO_BUSCA = { regular: "regular despesa", recorrente: "recorrente", interno: "transferencia", receita: "receita entrada", estorno: "estorno", debito: "debito" };
  function valorBusca(v) {
    const n = Math.abs(F.numero(v)), inteiro = Math.trunc(n);
    return [F.moedaEditavel(n), n.toFixed(2).replace(".", ","), n.toFixed(2), String(inteiro), F.moedaEditavel(inteiro).replace(/,00$/, "")].join(" ");
  }
  function dataBusca(iso) {
    const [a, m, d] = String(iso || "").split("-");
    if (!d) return "";
    const mes = Number(m), dia = Number(d);
    return [d + "/" + m, d + "/" + m + "/" + a, dia + "/" + mes, dia + "/" + mes + "/" + a, F.mesNome(mes - 1), a].join(" ");
  }
  const camposBusca = (comPerfis) => (l) => [
    [l.descricao, 3],
    [l.categoria && l.categoria.nome, 2], [l.nomeConta, 2], [l.ultimos4Digitos, 2],
    [comPerfis && l.perfil ? l.perfil.nome : null, 1.5],
    [l.notas, 1],
    [valorBusca(l.valor), 2],
    [dataBusca(l.data), 1],
    [(TIPO_BUSCA[l.tipo] || "") + (l.recorrencia === "parcelada" ? " parcelado parcela" : "") + (l.parcelaTotal ? " " + l.parcelaAtual + "/" + l.parcelaTotal : ""), 1],
  ];
  /** Índice da lista atual (montado uma vez por lista e guardado enquanto ela existir) */
  const indiceBusca = (lancamentos, comPerfis) => ZoZo.busca.indice(lancamentos, camposBusca(comPerfis), comPerfis ? "perfis" : "");

  function aplicarFiltros(lancamentos, st) {
    const hoje = F.iso(new Date());
    const f = filtros();
    const termo = String(st.ui.busca || "").trim();
    const cats = (st.data.categorias && st.data.categorias.categorias) || [];
    const statusDe = (id) => { const c = cats.find((x) => x.id === id); return c ? c.status : null; };
    const faixa = f.periodo ? intervalo(f.periodo).map(F.iso) : null;
    const comPerfis = ZoZo.recursos.perfis();            // filtro de perfil só existe para contas com o recurso
    // Área principal mostra só até HOJE; pesquisando, também acha parcelas e agendamentos futuros
    lancamentos = termo ? indiceBusca(lancamentos, comPerfis).buscar(termo).itens : lancamentos.filter((l) => l.data <= hoje);
    let out = lancamentos.filter((l) => {
      if (f.contas.length && !f.contas.includes(l.contaId)) return false;
      if (f.categorias.length && !f.categorias.includes(l.categoriaId)) return false;
      if (f.statusCategoria !== "ambos" && statusDe(l.categoriaId) !== (f.statusCategoria === "excluidas" ? "excluida" : "regular")) return false;
      if (comPerfis && f.perfis.length && !f.perfis.includes(l.perfilId)) return false;
      if (faixa && (l.data < faixa[0] || l.data > faixa[1])) return false;
      if (f.tipos.length && !f.tipos.includes(l.tipo)) return false;
      if (f.recorrencias.length && !f.recorrencias.some((sid) => l.id === sid || l.serieId === sid)) return false;
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
  /**
   * O que aparece nos filtros: só contas, categorias, perfis, recorrências e tipos presentes nas transações
   * da página (até hoje — as mesmas que Transações lista sem pesquisa). Os já marcados ficam, para poder desmarcar.
   */
  function opcoesFiltro(st) {
    const hoje = F.iso(new Date());
    const base = ((st.data.lancamentos && st.data.lancamentos.lancamentos) || []).filter((l) => l.data <= hoje);
    const f = filtros();
    const usados = (campo, marcados) => new Set(base.map((l) => l[campo]).filter(Boolean).concat(marcados));
    const contasUsadas = usados("contaId", f.contas), catsUsadas = usados("categoriaId", f.categorias), perfisUsados = usados("perfilId", f.perfis);
    const tiposUsados = new Set(base.map((l) => l.tipo).concat(f.tipos));
    // recorrência = série: a transação de origem (recorrente com frequência) e as ocorrências (serieId)
    const serieDe = (l) => (l.serieId && !String(l.serieId).startsWith("removida:") ? l.serieId : (l.tipo === "recorrente" && l.recorrencia ? l.id : null));
    const series = new Map();
    base.forEach((l) => {
      const sid = serieDe(l); if (!sid) return;
      const origem = base.find((x) => x.id === sid) || l;
      if (!series.has(sid) || origem.id === sid) series.set(sid, origem);
    });
    const recs = (st.data.recorrencias && st.data.recorrencias.recorrencias) || [];
    const FREQ = (ZoZo.servico && ZoZo.servico.FREQUENCIAS) || {};
    const rotuloSerie = (sid, l) => {
      const r = recs.find((x) => x.serieId === sid);
      if (r) return r.descricao + " · " + r.tipoRecorrencia;
      const freq = l.recorrencia === "parcelada" ? "Parcelado" : (FREQ[l.recorrencia] || {}).rotulo;
      return l.descricao + (freq ? " · " + freq : "");
    };
    f.recorrencias.forEach((sid) => { if (!series.has(sid)) { const r = recs.find((x) => x.serieId === sid); if (r) series.set(sid, r); } });
    const icone = (l) => (l.categoria && l.categoria.icone) || ((st.data.categorias && st.data.categorias.categorias) || []).find((c) => c.id === l.categoriaId)?.icone;
    return {
      contas: ((st.data.contas && st.data.contas.contas) || []).filter((c) => contasUsadas.has(c.id)),
      cats: ((st.data.categorias && st.data.categorias.categorias) || []).filter((c) => catsUsadas.has(c.id)),
      perfis: ((st.data.perfis && st.data.perfis.perfis) || []).filter((p) => perfisUsados.has(p.id)),
      recorrencias: Array.from(series, ([sid, l]) => ({ value: sid, label: rotuloSerie(sid, l), icone: icone(l) })).sort((a, b) => a.label.localeCompare(b.label, "pt-BR")),
      tipos: TIPOS_FILTRO.filter((t) => tiposUsados.has(t.value)),
    };
  }

  function abrirMenuFiltros(anchor, ctx, posicao) {
    const st = store.get();
    const { contas, cats, perfis, recorrencias, tipos } = opcoesFiltro(st);
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
    const statusCategoria = (redesenhar) => h("div", { class: ZoZo.estrutura.menuSegmento, role: "radiogroup", "aria-label": "Tipo de categoria" },
      [["regulares", "Regulares"], ["excluidas", "Excluídas"], ["ambos", "Ambos"]].map(([v, t]) => h("button", {
        type: "button", role: "radio", "aria-checked": String(filtros().statusCategoria === v),
        class: [ZoZo.estrutura.menuSegmentoItem, filtros().statusCategoria === v && "is-active"],
        onClick: (e) => {
          setFiltros({ statusCategoria: v }, ctx);
          e.currentTarget.parentNode.querySelectorAll("button").forEach((b) => { const on = b === e.currentTarget; b.classList.toggle("is-active", on); b.setAttribute("aria-checked", String(on)); });
          redesenhar();
        },
      }, t)));

    ZoZo.menu.abrir(anchor, () => [
      { secao: "Filtrar por" },
      { icone: "contas", label: "Conta", valor: qtd(filtros().contas.length),
        submenu: LM({ itens: contas.map((c) => ({ value: c.id, label: c.nome + (c.ultimos4Digitos ? " " + c.ultimos4Digitos : ""), cor: c.cor })), marcados: marcados("contas"), alternar: alternar("contas"), vazio: "Nenhuma conta nas transações." }) },
      { icone: "categorias", label: "Categoria", valor: qtd(filtros().categorias.length + (filtros().statusCategoria !== "ambos" ? 1 : 0)),
        submenu: LM({ itens: cats.map((c) => ({ value: c.id, label: c.nome, icone: c.icone })), marcados: marcados("categorias"), alternar: alternar("categorias"), topo: statusCategoria, vazio: "Nenhuma categoria nas transações." }) },
      ...(ZoZo.recursos.perfis() ? [{ icone: "perfil", label: "Perfil", valor: qtd(filtros().perfis.length),
        submenu: LM({ itens: perfis.map((p) => ({ value: p.id, label: p.nome + (p.arquivado ? " (arquivado)" : ""), cor: p.cor })), marcados: marcados("perfis"), alternar: alternar("perfis"), vazio: "Nenhum perfil nas transações." }) }] : []),
      { icone: "calendario", label: "Data", valor: filtros().periodo ? "1" : "", submenu: unico("periodo", PERIODOS) },
      { icone: "recorrencias", label: "Recorrência", valor: qtd(filtros().recorrencias.length),
        submenu: LM({ itens: recorrencias, marcados: marcados("recorrencias"), alternar: alternar("recorrencias"), vazio: "Nenhuma recorrência nas transações." }) },
      { icone: "interno", label: "Tipo", valor: qtd(filtros().tipos.length),
        submenu: LM({ itens: tipos, marcados: marcados("tipos"), alternar: alternar("tipos"), largura: 240, vazio: "Nenhum tipo." }) },
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
    const chip = (rotulo, valor, limpar) => chips.push(h("span", { class: T.chip },
      h("span", { class: T.chipRotulo }, rotulo + ": "), h("span", { class: T.chipValor }, valor),
      h("button", { type: "button", class: T.chipRemover, "aria-label": "Remover filtro " + rotulo, onClick: limpar }, icon("fechar", { size: 12, stroke: 2.25 }))));
    if (f.contas.length) chip("Conta", nomes(f.contas, contas), () => setFiltros({ contas: [] }, ctx));
    if (f.categorias.length) chip("Categoria", nomes(f.categorias, cats), () => setFiltros({ categorias: [] }, ctx));
    if (f.statusCategoria !== "ambos") chip("Categorias", f.statusCategoria === "excluidas" ? "Excluídas" : "Regulares", () => setFiltros({ statusCategoria: "ambos" }, ctx));
    if (ZoZo.recursos.perfis() && f.perfis.length) chip("Perfil", nomes(f.perfis, perfis), () => setFiltros({ perfis: [] }, ctx));
    if (f.periodo) chip("Data", (PERIODOS.find((p) => p.value === f.periodo) || {}).label, () => setFiltros({ periodo: null }, ctx));
    if (f.recorrencias.length) chip("Recorrência", f.recorrencias.map((sid) => { const r = recs.find((x) => x.serieId === sid); return r ? r.descricao : "—"; }).join(", "), () => setFiltros({ recorrencias: [] }, ctx));
    if (f.tipos.length) chip("Tipo", f.tipos.map((t) => (TIPOS_FILTRO.find((x) => x.value === t) || {}).label).join(", "), () => setFiltros({ tipos: [] }, ctx));
    if (f.ordem !== "data-desc") chip("Ordem", (ORDENS.find((o) => o.value === f.ordem) || {}).grupo + " · " + (ORDENS.find((o) => o.value === f.ordem) || {}).label, () => setFiltros({ ordem: "data-desc" }, ctx));
    if ((st.ui.busca || "").trim()) chip("Pesquisa", st.ui.busca.trim(), () => { store.set({ ui: { busca: "" } }); ctx.refreshTopbar(); });
    const add = h("button", { type: "button", class: T.adicionar, "aria-haspopup": "dialog" }, icon("mais", { size: 14 }), h("span", null, "Adicionar filtro"));
    add.addEventListener("click", () => abrirMenuFiltros(add, ctx, "esquerda"));
    return h("div", { class: T.chips }, chips, add);
  }

  function barraInformacoes(itens) {
    const t = totais(itens);
    // valores na cor do texto; só o saldo negativo fica vermelho
    const valor = (v, negativo) => h("strong", { class: ["money", T.infoValor, negativo && "money--negative"] }, v);
    return h("div", { class: T.info, role: "status" },
      h("span", { class: T.infoQtd }, itens.length === 1 ? "1 transação" : itens.length + " transações"),
      h("span", { class: T.infoTotais },
        h("span", null, "Total gasto ", valor(F.moeda(t.gasto))),
        h("span", null, "Total recebido ", valor(F.moeda(t.recebido))),
        h("span", null, "Saldo líquido ", valor((t.liquido < 0 ? "−" : "") + F.moeda(t.liquido), t.liquido < 0))));
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

    // no celular só o ícone aparece (o nome continua no aria-label)
    const botao = (icone, texto) => h("button", { type: "button", class: T.selbarBtn, "aria-haspopup": "menu", "aria-label": texto, title: texto },
      icon(icone, { size: 15 }), h("span", { class: T.selbarTxt }, texto));

    const categoriaBtn = botao("categorias", "Categoria");
    categoriaBtn.addEventListener("click", () => {
      const cats = (store.get().data.categorias && store.get().data.categorias.categorias) || [];
      ZoZo.menu.abrir(categoriaBtn, { largura: 250, render(el, api) {
        let termo = "";
        const norm = (t) => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
        const lista = h("div", { class: ZoZo.estrutura.menuListaRolagem });
        const busca = h("input", { type: "search", class: ZoZo.estrutura.menuPesquisaCampo, placeholder: "Pesquisar categoria", "aria-label": "Pesquisar categoria" });
        const desenhar = () => mount(lista, cats.filter((c) => !termo || norm(c.nome).includes(termo)).map((c) =>
          h("button", { type: "button", class: ZoZo.estrutura.menuItem, onClick: () => { api.fechar(); aplicar({ categoriaId: c.id }, "Categoria definida."); } }, UI.CategoryLabel(c, { pill: true }))));
        busca.addEventListener("input", () => { termo = norm(busca.value.trim()); desenhar(); });
        // + Nova categoria (como nos outros menus de categoria): já é aplicada às selecionadas
        const nova = h("button", { type: "button", class: ZoZo.estrutura.menuItem, onClick: () => { api.fechar();
          ZoZo.modais.novaCategoria(ctx, { nome: termo ? busca.value.trim() : "", aoCriar: (c) => aplicar({ categoriaId: c.id }, "Categoria criada e definida.") }); } },
          icon("mais", { size: 16, class: ZoZo.estrutura.menuIcone }), h("span", { class: ZoZo.estrutura.menuRotulo }, "Nova categoria"));
        mount(el, h("div", { class: ZoZo.estrutura.menuPesquisa }, icon("pesquisar", { size: 14 }), busca), lista, h("div", { class: ZoZo.estrutura.menuSeparador }), nova);
        desenhar();
        requestAnimationFrame(() => busca.focus());
      } }, { posicao: "acima", largura: 250, label: "Definir categoria", focar: false });
    });

    const tipoBtn = botao("interno", "Tipo");
    tipoBtn.addEventListener("click", () => ZoZo.menu.abrir(tipoBtn, [
      ["receita", "Receita"], ["interno", "Transferência"], ["debito", "Débito"], ["regular", "Regular"],
    ].map(([v, t]) => ({ label: t, onClick: () => aplicar({ tipo: v }, "Tipo alterado.") })), { posicao: "acima", label: "Mudar tipo" }));

    const perfilBtn = ZoZo.recursos.perfis() ? botao("perfil", "Perfil") : null;      // só contas com o recurso de Perfis
    if (perfilBtn) perfilBtn.addEventListener("click", () => {
      const perfis = ((store.get().data.perfis && store.get().data.perfis.perfis) || []).filter((p) => !p.arquivado);
      ZoZo.menu.abrir(perfilBtn, perfis.map((p) => ({ render: (api) => h("button", { type: "button", class: ZoZo.estrutura.menuItem, onClick: () => { api.fechar(); aplicar({ perfilId: p.id }, "Perfil definido."); } }, UI.Tag(p.nome, p.cor, { class: "tag--upper" })) }))
        .concat([{ separador: true },
          { icone: "mais", label: "Criar novo perfil", onClick: () => ZoZo.modais.novoPerfil(ctx, { aoCriar: (np) => aplicar({ perfilId: np.id }, "Perfil criado e definido.") }) }]), { posicao: "acima", label: "Definir perfil" });
    });

    const maisBtn = h("button", { type: "button", class: T.selbarIcone, "aria-label": "Mais ações", "aria-haspopup": "menu" }, icon("opcoes", { size: 16 }));
    maisBtn.addEventListener("click", () => ZoZo.menu.abrir(maisBtn, [
      { label: "Marcar todas", onClick: () => store.set({ ui: { selecionados: visiveis.map((l) => l.id) } }) },
      { label: "Desmarcar todas", onClick: limpar },
      { separador: true },
      { label: "Excluir", perigo: true, onClick: () => {
        ZoZo.feedback.confirmarExclusao(sel.length === 1 ? "Excluir transação?" : "Excluir transações?",
          sel.length === 1 ? "Tem certeza de que deseja excluir esta transação?" : "Tem certeza de que deseja excluir estas " + sel.length + " transações?")
          .then((ok) => ok && ctx.bridge.request(A.deleteLancamentos, { ids: sel }).then(() => {
            ctx.detail.close({ silencioso: true }); limpar(); ctx.toast("Transações excluídas."); return aposAlterar(ctx);
          }).catch((e) => ctx.toast(e.friendly, { tone: "error" })));
      } },
    ], { posicao: "acima", label: "Mais ações", class: ZoZo.estrutura.menuCompacto }));

    const barra = h("div", { class: T.selbar, role: "toolbar", "aria-label": "Ações para as transações selecionadas", onKeydown: navegarBarra },
      h("button", { type: "button", class: T.selbarIcone, "aria-label": "Fechar seleção", onClick: limpar }, icon("fechar", { size: 15 })),
      h("span", { class: T.selbarQtd }, sel.length === 1 ? "1 selecionada" : sel.length + " selecionadas"),
      h("span", { class: T.selbarSep, "aria-hidden": "true" }),
      categoriaBtn, tipoBtn, perfilBtn, maisBtn);
    // barra de ferramentas (padrão ARIA): uma única parada no Tab; setas, Home e End andam entre os botões
    barra.querySelectorAll("button").forEach((b, i) => b.setAttribute("tabindex", i === 0 ? "0" : "-1"));
    return barra;
  }

  function navegarBarra(e) {
    const botoes = Array.from(e.currentTarget.querySelectorAll(":scope > button"));
    const i = botoes.indexOf(document.activeElement);
    if (i < 0) return;
    const alvo = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: botoes.length - 1 }[e.key];
    if (alvo === undefined) return;
    e.preventDefault();
    const proximo = botoes[(alvo + botoes.length) % botoes.length];
    botoes.forEach((b) => b.setAttribute("tabindex", b === proximo ? "0" : "-1"));
    proximo.focus();
  }

  /* ---------------- Ações da barra superior ---------------- */
  let buscaTimer = null;
  let ultimaBusca = null;        // a lista entra com animação quando o termo pesquisado muda
  /* O campo é criado uma vez só: a barra superior se redesenha (dados recarregados, atualização de outra
     aba, filtros) e antes o campo era trocado no meio da digitação — perdia o foco e as últimas letras. */
  let campoBusca = null;
  function campoPesquisa() {
    if (campoBusca) return campoBusca;
    const aplicar = (v) => { clearTimeout(buscaTimer); store.set({ ui: { busca: v, selecionados: [] } }); };
    campoBusca = h("input", {
      type: "search", class: T.pesquisaCampo, placeholder: "Pesquisar", "aria-label": "Pesquisar transações",
      title: "Nome, categoria, conta, valor ou data — ex.: mercado outubro · >100 · 11/10 (atalho: / ou Ctrl+K)",
      "aria-keyshortcuts": "/ Control+K", autocomplete: "off", spellcheck: "false", enterkeyhint: "search",
      onInput: (e) => { clearTimeout(buscaTimer); const v = e.target.value; buscaTimer = setTimeout(() => aplicar(v), 120); },
      // Enter pesquisa na hora; Esc limpa (e só depois, com o campo vazio, fecha o painel)
      onKeydown: (e) => {
        if (e.key === "Enter") aplicar(e.target.value);
        else if (e.key === "Escape" && e.target.value) { e.preventDefault(); e.target.value = ""; aplicar(""); }
      },
    });
    return campoBusca;
  }
  function acoes(ctx) {
    const st = store.get();
    const busca = campoPesquisa();
    const comFoco = document.activeElement === busca;
    if (!comFoco && busca.value !== (st.ui.busca || "")) busca.value = st.ui.busca || "";
    if (comFoco) {
      const [ini, fim] = [busca.selectionStart, busca.selectionEnd];
      queueMicrotask(() => { if (busca.isConnected) { busca.focus(); try { busca.setSelectionRange(ini, fim); } catch (e) { /* sem seleção */ } } });
    }
    // Filtro ativo = algum filtro diferente do padrão (a pesquisa tem o próprio campo)
    const padrao = FILTROS_VAZIOS();
    const ativos = Object.keys(padrao).some((k) => JSON.stringify(filtros()[k]) !== JSON.stringify(padrao[k]));
    const filtroBtn = h("button", { type: "button", class: [T.pesquisaFiltro, ativos ? T.pesquisaFiltroAtivo : T.pesquisaFiltroNormal], "aria-label": "Filtrar", title: "Filtrar",
      "aria-haspopup": "menu", "aria-expanded": "false" }, icon("filtrar", { size: 16 }));
    filtroBtn.addEventListener("click", () => abrirMenuFiltros(filtroBtn, ctx, "direita"));
    return [
      UI.IconButton("mais", "Nova transação", { onPrimary: true, onClick: () => abrirFormulario(null, ctx) }),
      ZoZo.recursos.boleto() ? UI.IconButton("boleto", "Criar fatura", { onPrimary: true, onClick: () => ZoZo.boleto.open(ctx, { perfilId: filtros().perfis[0] || null }) }) : null,
      UI.IconButton("baixar-circulo", "Exportar transações (CSV)", { onPrimary: true, onClick: (e) => ZoZo.exportarCsv(ctx, e.currentTarget) }),
      // Multicâmbio: trazer transações de outra moeda para a escolhida (a qualquer momento, não só na 1ª vez)
      ZoZo.cambio.disponivelTransferir() ? UI.IconButton("interno", "Trazer transações de outra moeda", { onPrimary: true, onClick: () => ZoZo.cambio.abrirTransferencia(ctx) }) : null,
      h("div", { class: T.pesquisa }, icon("pesquisar", { size: 15, class: "tw:text-zz-muted" }), busca, filtroBtn),
    ];
  }

  /* Checkbox ao lado do título: seleciona todos os lançamentos visíveis */
  let checkTodos = null;
  function prefixo() {
    const box = UI.Checkbox(false, (marcar) => {
      const st = store.get();
      const visiveis = aplicarFiltros((st.data.lancamentos && st.data.lancamentos.lancamentos) || [], st);
      store.set({ ui: { selecionados: marcar ? visiveis.map((l) => l.id) : [] } });
    }, { label: "Selecionar todas as transações", class: "topbar-check" });
    checkTodos = box.querySelector("input");
    return box;
  }

  /* ---------------- Página ---------------- */
  ZoZo.pages.lancamentos = {
    titulo: "Transações",
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
      if (espera) return C.pagina(T.pagina, espera);

      const todos = state.data.lancamentos.lancamentos || [];
      const itens = aplicarFiltros(todos, state);
      const termoAtual = normalizar(state.ui.busca).trim();
      const animarBusca = ultimaBusca !== null && termoAtual !== ultimaBusca;
      const anim = (i) => (animarBusca ? T.busca[Math.min(i, 2)] : null);
      ultimaBusca = termoAtual;
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
        return C.pagina(T.pagina, topo, filtrando
          ? UI.EmptyState("Nenhuma transação encontrada com esses filtros.", { icon: "pesquisar", class: anim(0), action: { label: "Limpar filtros", onClick: () => { store.set({ ui: { filtros: FILTROS_VAZIOS(), busca: "" } }); ctx.refreshTopbar(); } } })
          : UI.EmptyState("Nenhuma transação cadastrada.", { class: anim(0), action: { label: "Nova transação", icon: "mais", onClick: () => abrirFormulario(null, ctx) } }));
      }

      const termosBusca = termoAtual ? ZoZo.busca.consulta(state.ui.busca).termos : [];
      const destacar = termosBusca.length ? (t) => ZoZo.busca.destacar(t, termosBusca) : null;
      const linha = (l, comData) => L.LaunchRow(l, {
        destacar,
        selected: l.id === selId,
        marcado: marcados.has(l.id),
        onMarcar: (v) => alternarMarca(l.id, v),
        mostrarData: comData,
        onClick: () => abrirVisualizacao(l, ctx),
      });

      const blocos = [];
      if (filtros().ordem.startsWith("valor")) {
        blocos.push(h("section", { class: anim(0) },
          h("h2", { class: T.mesTituloSolto }, "Ordenado por valor"),
          h("div", { class: T.lista }, itens.map((l) => linha(l, true)))));
      } else {
        let mesAtual = null, diaAtual = null, secao = null, lista = null;
        // transações de cada mês numa única passada (antes: a lista inteira era filtrada de novo a cada mês)
        const porMes = new Map();
        itens.forEach((x) => { const m = x.data.slice(0, 7); if (!porMes.has(m)) porMes.set(m, []); porMes.get(m).push(x); });
        itens.forEach((l) => {
          const mes = l.data.slice(0, 7);
          if (mes !== mesAtual) {
            mesAtual = mes; diaAtual = null;
            // Total gasto do mês (mesma regra da barra de informações) à direita
            const doMes = porMes.get(mes);
            secao = h("section", { class: [blocos.length && T.mesSeguinte, anim(blocos.length)] },
              h("header", { class: T.mesCab },
                h("h2", { class: T.mesTitulo }, F.mesAno(mes + "-01")),
                h("span", { class: T.mesTotal, title: "Total gasto no mês" }, F.moeda(totais(doMes).gasto))));
            blocos.push(secao);
          }
          if (l.data !== diaAtual) {
            diaAtual = l.data;
            secao.appendChild(h("h3", { class: T.dia }, rotuloDia(l.data)));
            lista = h("div", { class: T.lista });
            secao.appendChild(lista);
          }
          lista.appendChild(linha(l, false));
        });
      }

      return C.pagina(T.pagina, topo, blocos, barraSelecao(state, ctx, itens));
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
