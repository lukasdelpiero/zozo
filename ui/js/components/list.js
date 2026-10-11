/* =============================================================
   ZoZo — Linhas de lista
   LaunchRow · AccountRow · CategoryRow · CategoryGroupRow
   RecurrenceRow · AllocationRow · SidebarAccountGroup
   ============================================================= */
(function (ZoZo) {
  "use strict";
  const { h } = ZoZo.dom;
  const { icon } = ZoZo.icons;
  const F = ZoZo.format;
  const UI = ZoZo.ui;

  const SUBTITULO_CONTA = { corrente: "Corrente", poupanca: "Poupança", investimento: "Investimento", emprestimo: "Empréstimo" };

  function rowBase(cls, opts, ...children) {
    const o = opts || {};
    const tag = o.onClick ? "button" : "div";
    return h(tag, {
      type: o.onClick ? "button" : undefined,
      class: ["row", cls, o.selected && "is-selected", o.onClick && "row--interactive", o.class],
      onClick: o.onClick,
      "aria-current": o.selected ? "true" : undefined,
      "data-id": o.id,
    }, ...children);
  }

  /** Nome + 4 últimos dígitos (mais claro) */
  function nomeComDigitos(nome, digitos, cls) {
    return h("span", { class: ["name-digits", cls] },
      h("span", { class: "name-digits__name" }, nome || ""),
      digitos ? h("span", { class: "name-digits__digits" }, digitos) : null);
  }

  /* ---------- Lançamento (seção 15) ----------
     [☐] [R|P] Descrição  conta 1234 ........ [CATEGORIA] [PERFIL]  R$ 0,00 */
  function LaunchRow(l, opts) {
    const o = opts || {};
    const verde = ZoZo.regras.tiposValorVerde.includes(l.tipo) || (l.tipo === "interno" && l.sentido === "entrada");
    const marca = l.tipo === "recorrente" ? (l.recorrencia === "parcelada" ? "P" : "R") : l.tipo === "interno" ? "T" : l.tipo === "receita" ? "I" : l.tipo === "debito" ? "D" : null;
    const marcaTitulo = { P: "Parcelado", R: "Recorrente", T: "Transferência", I: "Receita", D: "Débito" }[marca] || "";
    const compacto = (o.class || "").includes("compact");
    const resumo = !!o.resumo;
    const comPerfil = ZoZo.recursos.perfis();          // pílula de perfil só para contas com o recurso
    return rowBase(["launch-row", o.marcado && "is-checked", !comPerfil && "launch-row--sem-perfil"].filter(Boolean).join(" "), Object.assign({ id: l.id }, o),
      compacto || resumo ? null : (o.onMarcar ? UI.Checkbox(o.marcado, o.onMarcar, { label: "Selecionar " + l.descricao, class: "launch-row__check" }) : h("span")),
      h("span", { class: "launch-row__desc" },
        // data primeiro (largura fixa) para os nomes alinharem com ou sem a letra T/R/I/P
        o.mostrarData || compacto || resumo ? h("span", { class: "launch-row__date" }, F.dataCurta(l.data)) : null,
        // letra (R/P/T/I/D) só quando existe: a Regular começa logo ao lado da caixa de seleção
        marca && !compacto && !resumo ? h("span", { class: "kind-badge", title: marcaTitulo, "aria-label": marcaTitulo }, marca) : null,
        h("span", { class: "launch-row__title" }, l.descricao),
        l.parcelaTotal ? h("span", { class: "launch-row__parcel", title: "Parcela " + l.parcelaAtual + " de " + l.parcelaTotal }, l.parcelaAtual + "/" + l.parcelaTotal) : null,
        // conta e 4 dígitos juntos ("Itaú 4821"): o nome encurta com "…" se faltar espaço
        (l.nomeConta || l.ultimos4Digitos) && !compacto && !resumo ? h("span", { class: "launch-row__conta" },
          l.nomeConta ? h("span", { class: "launch-row__account" }, l.nomeConta) : null,
          l.ultimos4Digitos ? h("span", { class: "launch-row__digits" }, l.ultimos4Digitos) : null) : null),
      compacto ? null : h("span", { class: "launch-row__category" }, UI.CategoryLabel(l.categoria, { pill: true })),
      compacto || !comPerfil ? null : h("span", { class: "launch-row__profile" }, UI.Tag(l.perfil && l.perfil.nome, l.perfil && l.perfil.cor, { class: "tag--upper" })),
      h("span", { class: ["launch-row__value", "money", verde && "money--income"] }, F.moeda(l.valor)));
  }

  /* ---------- Conta (seções 19–22, 24) ---------- */
  function AccountRow(c, opts) {
    const o = opts || {};
    const sub = c.oculta ? "Ocultado" : o.subtitulo !== undefined ? o.subtitulo : SUBTITULO_CONTA[c.tipo];
    return rowBase(["account-row", c.oculta && "account-row--oculta"].filter(Boolean).join(" "), Object.assign({ id: c.id }, o),
      UI.AccountIcon(c),
      h("span", { class: "account-row__info" },
        h("span", { class: "account-row__line" },
          c.oculta ? h("span", { class: "account-row__eye", title: "Conta oculta", "aria-label": "Conta oculta" }, icon("olho-fechado", { size: 13 })) : null,
          nomeComDigitos(c.nome, c.ultimos4Digitos)),
        sub ? h("span", { class: "account-row__sub" }, sub) : null),
      h("span", { class: "account-row__pct" }, UI.PercentageChange(c.variacaoPercentual, { contexto: "em relação ao mês anterior" })),
      h("span", { class: "account-row__value money" }, F.moeda(c.valor)));
  }

  /* ---------- Categoria (seções 35–39) ---------- */
  function barraCategoria(gasto, reservado) {
    const acima = F.numero(gasto) > F.numero(reservado);
    const ratio = F.numero(reservado) > 0 ? F.numero(gasto) / F.numero(reservado) : (F.numero(gasto) > 0 ? 1 : 0);
    return UI.ProgressBar(ratio, { tone: acima ? "over" : "ok", label: acima ? "Gasto acima do reservado" : "Gasto dentro do reservado" });
  }

  function CategoryRow(cat, opts) {
    const o = opts || {};
    return rowBase(["category-row", o.excluida && "category-row--excluded", o.filho && "category-row--child"].filter(Boolean).join(" "), Object.assign({ id: cat.id }, o),
      h("span", { class: "category-row__lead" },
        o.pill ? null : h("span", { class: "category-row__dot", style: { background: F.cor(cat.cor, "var(--palette-16)") }, "aria-hidden": "true" }),
        UI.CategoryLabel(cat, { pill: !!o.pill })),
      h("span", { class: "category-row__spent money" }, F.moeda(cat.gasto)),
      o.excluida ? null : h("span", { class: "category-row__bar" }, barraCategoria(cat.gasto, cat.reservado)),
      o.excluida ? null : h("span", { class: "category-row__reserved money" }, F.moeda(cat.reservado)));
  }

  function CategoryGroupRow(grupo, opts) {
    const o = opts || {};
    // A linha do grupo abre o painel do grupo (orçamento "não atribuído", desagrupar); a seta só abre/fecha
    const abrir = (e) => { if (o.onClick && !e.target.closest(".category-row__caret")) o.onClick(); };
    return h("div", { class: ["row", "category-row", "category-row--group", o.excluida && "category-row--excluded", o.onClick && "row--interactive", o.selected && "is-selected"],
      role: o.onClick ? "button" : undefined, tabindex: o.onClick ? "0" : undefined, "aria-current": o.selected ? "true" : undefined,
      "aria-label": o.onClick ? "Grupo " + grupo.nome : undefined,
      onClick: abrir, onKeydown: (e) => { if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) { e.preventDefault(); abrir(e); } } },
      h("span", { class: "category-row__lead" },
        h("button", { type: "button", class: "category-row__caret", "aria-expanded": String(!o.fechado), "aria-label": (o.fechado ? "Mostrar" : "Ocultar") + " categorias de " + grupo.nome,
          onClick: (e) => { e.stopPropagation(); o.onToggle(); } },
          icon(o.fechado ? "chevron-right" : "chevron-down", { size: 14, stroke: 2.25 })),
        h("span", { class: "category-row__count" }, String(grupo.quantidade)),
        h("span", { class: "category-row__group-name" }, grupo.nome)),
      h("span", { class: "category-row__spent money" }, F.moeda(grupo.gasto)),
      o.excluida ? null : h("span", { class: "category-row__bar" }, barraCategoria(grupo.gasto, grupo.reservado)),
      o.excluida ? null : h("span", { class: "category-row__reserved money" }, F.moeda(grupo.reservado)));
  }

  /* ---------- Recorrência (seção 42) ---------- */
  function RecurrenceRow(r, opts) {
    return rowBase("recurrence-row", Object.assign({ id: r.id }, opts),
      h("span", { class: "recurrence-row__date" }, (opts || {}).semData ? h("span", { class: "recurrence-row__icon", "aria-hidden": "true" }, (r.categoria && r.categoria.icone) || "•")
        : F.dataCurta(r.data) + (r.data.slice(0, 4) !== String(new Date().getFullYear()) ? " " + r.data.slice(2, 4) : "")),
      h("span", { class: "recurrence-row__desc" },
        h("span", { class: "recurrence-row__title" }, r.descricao),
        h("span", { class: "recurrence-row__type" }, r.tipoRecorrencia)),
      h("span", { class: "recurrence-row__category" }, UI.CategoryLabel(r.categoria, { pill: true })),
      h("span", { class: "recurrence-row__value money" },
        F.moeda(r.valor),
        r.pago ? h("span", { class: "recurrence-row__paid", title: "Pago", "aria-label": "Pago",
          style: { "--tag-color": F.cor(r.categoria && r.categoria.cor, "var(--color-progress-ok)") } }, icon("check", { size: 13, stroke: 2.5 }))
          : h("span", { class: "recurrence-row__paid recurrence-row__paid--vazio", "aria-hidden": "true" })));
  }

  /* ---------- Alocação (seção 25) ---------- */
  function AllocationRow(a) {
    return h("div", { class: "row allocation-row" },
      h("span", { class: "allocation-row__lead" }, h("span", null, a.tipoInvestimento)),
      h("span", { class: "allocation-row__bar" }, UI.ProgressBar(F.numero(a.percentual) / 100, { tone: "allocation", label: a.tipoInvestimento })),
      h("span", { class: "allocation-row__pct" }, F.percentual(a.percentual)));
  }

  /* ---------- Sidebar: grupo de contas (seção 7) ---------- */
  function SidebarAccountGroup(titulo, contas, opts) {
    const o = opts || {};
    const key = "sidebar:" + titulo;
    const fechado = !!ZoZo.store.get().ui.gruposFechados[key];
    const toggle = () => UI.alternarGrupo(key);
    return h("div", { class: ["side-group", fechado && "is-collapsed"] },
      h("button", { type: "button", class: "side-group__header", "aria-expanded": String(!fechado), onClick: toggle },
        icon("chevron-down", { size: 12, class: "side-group__caret", stroke: 2.5 }),
        h("span", null, titulo)),
      fechado ? null : UI.corpoArvore(key, h("ul", { class: "side-group__list" },
        contas.map((c) => h("li", null, h("button", { type: "button", class: "side-account", onClick: () => o.onSelect && o.onSelect(c) },
          h("span", { class: "side-account__dot", style: { background: F.cor(c.cor, "var(--palette-16)") }, "aria-hidden": "true" }),
          h("span", { class: "side-account__name" }, c.nome),
          h("span", { class: "side-account__value" }, F.moeda(c.valor, { inteiro: true, comSinal: true }))))))));
  }

  /* ---------- Lista de lançamentos nos painéis (formato do Copilot) ----------
     Mês (total) → dia → [☐] [T|R|I|P] Nome ........ [ícone da categoria] valor */
  function ListaPainel(itens, opts) {
    const o = opts || {};
    const T = ZoZo.regras.totais;
    const marcados = new Set(ZoZo.store.get().ui.selecionados || []);
    const ordenados = itens.slice().sort((a, b) => b.data.localeCompare(a.data));
    const blocos = [];
    let mesAtual = null, diaAtual = null, secao = null, lista = null;
    ordenados.forEach((l) => {
      const mes = l.data.slice(0, 7);
      if (mes !== mesAtual) {
        mesAtual = mes; diaAtual = null;
        const doMes = ordenados.filter((x) => x.data.startsWith(mes));
        const gasto = doMes.reduce((s, x) => s + (T.gasto[x.tipo] || 0) * x.valor, 0);
        const recebido = doMes.reduce((s, x) => s + (T.recebido[x.tipo] || 0) * x.valor, 0);
        secao = h("section", { class: "pl-month" }, h("header", { class: "pl-month__head" },
          h("h4", { class: "pl-month__title" }, F.mesAno(mes + "-01")),
          h("span", { class: "pl-month__total" },
            recebido > 0 ? h("span", { class: "money money--income" }, F.moeda(recebido)) : null,
            recebido > 0 && gasto > 0 ? h("span", { class: "money pl-month__paren" }, "(" + F.moeda(gasto) + ")") : null,
            !(recebido > 0) ? h("span", { class: "money" }, F.moeda(gasto)) : null)));
        blocos.push(secao);
      }
      if (l.data !== diaAtual) {
        diaAtual = l.data;
        secao.appendChild(h("h5", { class: "pl-day" }, F.rotuloDia(l.data)));
        lista = h("div", { class: "pl-list" });
        secao.appendChild(lista);
      }
      const marca = l.tipo === "recorrente" ? (l.recorrencia === "parcelada" ? "P" : "R") : l.tipo === "interno" ? "T" : l.tipo === "receita" ? "I" : l.tipo === "debito" ? "D" : null;
      const verde = ZoZo.regras.tiposValorVerde.includes(l.tipo) || (l.tipo === "interno" && l.sentido === "entrada");
      const marcado = marcados.has(l.id);
      lista.appendChild(h("div", { class: ["pl-row", marcado && "is-checked"], role: "button", tabindex: "0", "data-id": l.id,
        onClick: () => o.onClick && o.onClick(l),
        onKeydown: (e) => { if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) { e.preventDefault(); if (o.onClick) o.onClick(l); } } },
        UI.Checkbox(marcado, (v) => {
          const atual = new Set(ZoZo.store.get().ui.selecionados || []);
          if (v) atual.add(l.id); else atual.delete(l.id);
          ZoZo.store.set({ ui: { selecionados: Array.from(atual) } });
        }, { label: "Selecionar " + l.descricao, class: "pl-row__check" }),
        h("span", { class: "pl-row__name" },
          marca ? h("span", { class: "kind-badge", title: { P: "Parcelado", R: "Recorrente", T: "Transferência", I: "Receita", D: "Débito" }[marca] }, marca) : null,
          h("span", { class: "pl-row__title" }, l.descricao),
          l.parcelaTotal ? h("span", { class: "launch-row__parcel" }, l.parcelaAtual + "/" + l.parcelaTotal) : null),
        l.categoria ? h("span", { class: "pl-row__cat", title: l.categoria.nome, style: { "--tag-color": F.cor(l.categoria.cor, "var(--palette-16)") } }, l.categoria.icone || "•") : h("span"),
        h("span", { class: ["pl-row__value", "money", verde && "money--income"] }, F.moeda(l.valor))));
    });
    return h("div", { class: "pl" }, blocos);
  }

  ZoZo.list = {
    ListaPainel, LaunchRow, AccountRow, CategoryRow, CategoryGroupRow, RecurrenceRow, AllocationRow, SidebarAccountGroup, nomeComDigitos, SUBTITULO_CONTA };
})(window.ZoZo);
