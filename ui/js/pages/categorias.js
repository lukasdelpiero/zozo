/* =============================================================
   ZoZo — Categorias (seções 34–40)
   ============================================================= */
(function (ZoZo) {
  "use strict";
  const { h, mount } = ZoZo.dom;
  const UI = ZoZo.ui;
  const L = ZoZo.list;
  const C = ZoZo.pagesComum;
  const F = ZoZo.format;
  const A = ZoZo.messages.ACTIONS;

  function mesAbrevDe(mesIso) {
    const d = F.parseData((mesIso || "") + "-01") || new Date();
    return F.mesAbrev(d.getMonth());
  }

  /** Mantém a ordem original: grupos (na 1ª aparição) e categorias soltas */
  function estruturar(categorias) {
    const blocos = [];
    const grupos = new Map();
    categorias.forEach((c) => {
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
      g.gasto = g.itens.reduce((s, c) => s + F.numero(c.gasto), 0);
      g.reservado = g.itens.reduce((s, c) => s + F.numero(c.reservado), 0);
      g.quantidade = g.itens.length;
    });
    return blocos;
  }

  function linhas(categorias, excluida, state, ctx) {
    const sel = state.selectedItem && state.selectedItem.tipo === "categoria" ? state.selectedItem.id : null;
    const fechados = state.ui.gruposFechados;
    const out = [];
    estruturar(categorias).forEach((b) => {
      const linha = (c, filho) => L.CategoryRow(c, { excluida, filho, selected: c.id === sel, onClick: () => abrirDetalhe(c, ctx) });
      if (b.tipo === "categoria") { out.push(linha(b.cat, false)); return; }
      const key = "cat:grp:" + (excluida ? "x:" : "r:") + b.nome;
      const fechado = !!fechados[key];
      out.push(L.CategoryGroupRow(b, { excluida, fechado, onToggle: () => UI.alternarGrupo(key) }));
      if (!fechado) out.push(UI.corpoArvore(key, h("div", { class: "arvore-grupo" }, b.itens.map((c) => linha(c, true)))));
    });
    return out;
  }

  function abrirFormCategoria(ctx, cat, preset) {
    const novo = !cat;
    const todas = (ZoZo.store.get().data.categorias && ZoZo.store.get().data.categorias.categorias) || [];
    const grupos = Array.from(new Set(todas.map((c) => c.grupo).filter(Boolean)));
    ZoZo.forms.abrir(ctx, {
      titulo: novo ? "Nova categoria" : "Editar categoria",
      selected: cat ? { tipo: "categoria", id: cat.id } : null,
      valores: cat ? { nome: cat.nome, icone: cat.icone, grupo: cat.grupo || "", status: cat.status, reservado: cat.reservado, cor: cat.cor }
        : Object.assign({ status: "regular", icone: "", cor: ZoZo.regras.corSugerida() }, preset || {}),
      campos: [
        { nome: "nome", rotulo: "Nome", obrigatorio: true, placeholder: "Ex.: Mercado", max: ZoZo.regras.limiteNome },
        { nome: "icone", rotulo: "Ícone", tipo: "emoji" },
        { nome: "grupo", rotulo: "Grupo", tipo: "lista", opcoes: grupos, placeholder: "Ex.: Alimentação", dica: "Opcional. Categorias do mesmo grupo aparecem juntas e somadas.", max: 60 },
        { nome: "status", rotulo: "Tipo de categoria", tipo: "selecao", opcoes: [
          { value: "regular", label: "Regular (entra no orçamento)" },
          { value: "excluida", label: "Excluída (não entra no orçamento)" },
        ] },
        { nome: "reservado", rotulo: "Valor reservado por mês", tipo: "dinheiro", mostrarSe: (x) => x.status === "regular" },
        { nome: "cor", rotulo: "Cor", tipo: "cor" },
      ],
      validar: (d) => (d.reservado !== null && Number.isFinite(d.reservado) && d.reservado < 0 ? "O valor reservado não pode ser negativo." : null),
      salvar: (d) => {
        if (!Number.isFinite(d.reservado)) d.reservado = 0;
        const req = novo ? ctx.bridge.request(A.createCategoria, { categoria: d }) : ctx.bridge.request(A.updateCategoria, { id: cat.id, categoria: d });
        return req.then(() => { ctx.toast(novo ? "Categoria criada." : "Categoria salva."); return ctx.recarregarTudo(); });
      },
    });
  }

  /** Gráfico de barras dos últimos 12 meses (uma categoria ou todas as regulares) */
  function graficoMeses(ctx, categoriaId, alvo) {
    ctx.bridge.request(A.getCategoriaSerie, { categoriaId: categoriaId || null }).then((r) => {
      ZoZo.charts.renderBarChart(alvo, r.meses.map((m, i) => {
        const dt = F.parseData(m.mes + "-01");
        return { rotuloMes: F.mesAbrev(dt.getMonth()), rotuloAno: dt.getMonth() === 0 || i === 0 || i === r.meses.length - 1 ? String(dt.getFullYear()) : "",
          titulo: F.mesNome(dt.getMonth()) + " " + dt.getFullYear(), valor: m.gasto, destaque: i === r.meses.length - 1 };
      }), { limite: r.reservado, nomeValor: "Gasto", ariaLabel: "Gasto nos últimos 12 meses" });
    }).catch(() => mount(alvo, h("p", { class: "muted" }, ZoZo.messages.FRIENDLY.LOAD_FAILED)));
  }

  function resumoGasto(gasto, reservado) {
    const dif = F.numero(gasto) - F.numero(reservado);
    if (!(F.numero(reservado) > 0)) return null;
    return h("span", { class: ["detail-hero__hint", dif > 0 && "detail-hero__hint--over"] }, F.moeda(Math.abs(dif)) + (dif > 0 ? " acima" : " disponíveis"));
  }

  const orcamentoAtivo = () => !(ZoZo.store.get().data.config && ZoZo.store.get().data.config.orcamentoAtivo === false);

  function abrirDetalhe(cat, ctx, opts) {
    const mes = ZoZo.store.get().data.categorias.mes;
    const excluir = () => ZoZo.feedback.confirmarExclusao("Excluir categoria?",
      "A categoria “" + cat.nome + "” e o histórico de orçamentos dela serão apagados. Essa ação não pode ser desfeita. Os lançamentos dessa categoria serão movidos para “Outros”.")
      .then((ok) => ok && ctx.bridge.request(A.deleteCategoria, { id: cat.id }).then(() => { ctx.detail.close({ silencioso: true }); ctx.toast("Categoria excluída."); return ctx.recarregarTudo(); })
        .catch((e) => ctx.toast(e.friendly, { tone: "error" })));

    // Alterações rápidas pelo menu (grupo, tipo) e reabertura do painel atualizado
    const alterar = (dados, msg) => ctx.bridge.request(A.updateCategoria, Object.assign({ id: cat.id }, dados)).then(() => {
      ctx.toast(msg);
      return ctx.recarregarTudo().then(() => {
        const atual = ((ZoZo.store.get().data.categorias || {}).categorias || []).find((c) => c.id === cat.id);
        if (atual) abrirDetalhe(atual, ctx, opts);
      });
    }).catch((e) => ctx.toast(e.friendly, { tone: "error" }));

    const grupos = () => Array.from(new Set(((ZoZo.store.get().data.categorias || {}).categorias || []).map((c) => c.grupo).filter(Boolean))).sort((a, b) => a.localeCompare(b, "pt-BR"));
    const criarGrupo = {
      largura: 260,
      render(el, api) {
        const input = UI.Input({ placeholder: "Ex.: Moradia", name: "nomeGrupo" });
        input.maxLength = 60;
        const confirmar = () => { const nome = input.value.trim(); if (!nome) { input.setAttribute("aria-invalid", "true"); input.focus(); return; } api.fechar(); alterar({ grupo: nome }, "Grupo criado."); };
        input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); confirmar(); } });
        mount(el, h("div", { class: "menu__form" },
          h("p", { class: "menu__form-title" }, "Criar novo grupo"),
          UI.Field("Nome do grupo", input),
          h("div", { class: "menu__form-actions" },
            UI.Button("Cancelar", { size: "sm", onClick: () => api.voltar() }),
            UI.Button("Criar", { size: "sm", variant: "primary", onClick: confirmar }))));
        requestAnimationFrame(() => input.focus());
      },
    };

    /* ---------- Editar orçamento (modo de edição no próprio painel) ---------- */
    const editando = !!(opts && opts.editandoOrcamento);
    const mesAtualIso = mes || F.iso(new Date()).slice(0, 7);
    let modo = cat.orcamentoPorMes ? "mes" : "fixo";
    const valorOrc = UI.Input({ inputmode: "decimal", value: F.moedaEditavel(cat.reservado || 0), class: "orc-input", "aria-label": "Valor do orçamento" });
    const rotuloMes = h("span", { class: "detail-hero__label" });
    const modoBtn = h("button", { type: "button", class: "orc-mode", "aria-haspopup": "menu" });
    const pintarModo = () => {
      ZoZo.dom.mount(modoBtn, h("span", null, modo === "fixo" ? "Orçamento mensal fixo" : "Orçamentos por mês"), ZoZo.icons.icon("chevron-down", { size: 13, stroke: 2.25 }));
      const dt = F.parseData(mesAtualIso + "-01");
      rotuloMes.textContent = modo === "mes" ? "Orçamento para " + F.mesNome(dt.getMonth()) + " " + dt.getFullYear() : "";
      valorOrc.value = F.moedaEditavel(modo === "fixo" ? (cat.reservadoFixo || 0) : (cat.reservado || 0));
    };
    modoBtn.addEventListener("click", () => ZoZo.menu.abrir(modoBtn, [
      { label: "Mesmo orçamento para todos os meses", check: modo === "fixo", onClick: () => { modo = "fixo"; pintarModo(); } },
      { label: "Diferentes orçamentos por mês", check: modo === "mes", onClick: () => { modo = "mes"; pintarModo(); } },
    ], { posicao: "direita", checkEsquerda: true, largura: 290, label: "Tipo de orçamento" }));
    pintarModo();
    valorOrc.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); salvarOrcamento(); } });
    const areaOrcamento = h("div", { class: "detail-hero__figure orc-area" }, modoBtn, rotuloMes,
      h("div", { class: "field__affix" }, h("span", { class: "field__prefix" }, "R$"), valorOrc));
    if (editando) requestAnimationFrame(() => { valorOrc.focus(); valorOrc.select(); });
    function salvarOrcamento() {
      const v = F.parseMoeda(valorOrc.value);
      if (!(v >= 0)) { valorOrc.setAttribute("aria-invalid", "true"); valorOrc.focus(); return; }
      const dados = modo === "fixo" ? { reservado: v, modoOrcamento: "fixo" } : { orcamentoMes: { mes: mesAtualIso, valor: v } };
      ctx.bridge.request(A.updateCategoria, Object.assign({ id: cat.id }, dados)).then(() => {
        ctx.toast("Orçamento salvo.");
        return ctx.recarregarTudo().then(() => {
          const atual = ((ZoZo.store.get().data.categorias || {}).categorias || []).find((c) => c.id === cat.id);
          if (atual) abrirDetalhe(atual, ctx, Object.assign({}, opts, { editandoOrcamento: false }));
        });
      }).catch((e) => ctx.toast(e.friendly, { tone: "error" }));
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
        { label: "Grupo de categorias", checkEsquerda: true, submenu: () => grupos().map((g) => ({ label: g, check: cat.grupo === g, onClick: () => alterar({ grupo: g }, "Grupo alterado.") }))
          .concat([{ label: "Sem grupo", check: !cat.grupo, onClick: () => alterar({ grupo: "" }, "Categoria sem grupo.") }, { separador: true },
            { icone: "mais", label: "Criar novo grupo", onClick: () => ZoZo.modais.criarGrupo((nome) => alterar({ grupo: nome }, "Grupo criado.")) }]) },
        { label: "Tipo de categoria", checkEsquerda: true, submenu: () => [
          { label: "Regular", check: cat.status === "regular", onClick: () => alterar({ status: "regular" }, "Categoria regular.") },
          { label: "Excluída", check: cat.status === "excluida", onClick: () => alterar({ status: "excluida" }, "Categoria excluída do orçamento.") },
        ] },
        { label: "Editar categoria", onClick: () => abrirFormCategoria(ctx, cat) },
        { separador: true },
        { label: "Excluir categoria", perigo: true, onClick: excluir },
      ],
      render(body) {
        const listaEl = h("div", { class: "detail-list" }, UI.Skeleton(3, { short: true }));
        const grafico = h("div", { class: "detail-chart" });
        const acima = F.numero(cat.gasto) > F.numero(cat.reservado);
        mount(body,
          h("div", { class: "detail-hero" },
            // Cor (bolinha), ícone e nome editáveis no lugar
            h("div", { class: "hero-edit" },
              h("div", { class: "hero-edit__row" },
                ZoZo.inline.corDot(cat.cor, (c) => alterar({ cor: c }, "Cor alterada.")),
                ZoZo.modais.seletorIcone(cat.icone, (e) => alterar({ icone: e }, "Ícone alterado."))),
              ZoZo.inline.texto({ valor: cat.nome, rotulo: "Nome da categoria", max: ZoZo.regras.limiteNome, aoSalvar: (v) => alterar({ nome: v }, "Nome alterado.") }),
              cat.grupo ? h("span", { class: "detail-hero__sub" }, cat.grupo) : null),
            editando ? areaOrcamento : h("div", { class: "detail-hero__figure" },
              h("span", { class: "detail-hero__label" }, "Gasto em " + mesAbrevDe(mes)),
              h("span", { class: "detail-hero__value money" }, F.moeda(cat.gasto)),
              cat.status === "excluida" || !orcamentoAtivo() ? null : resumoGasto(cat.gasto, cat.reservado))),
          grafico,
          cat.status === "excluida" ? null : C.detalheSecao(null,
            C.detalheLinha("Orçamento mensal", F.moeda(cat.reservado)),
            UI.ProgressBar(F.numero(cat.reservado) > 0 ? F.numero(cat.gasto) / F.numero(cat.reservado) : (F.numero(cat.gasto) > 0 ? 1 : 0), {
              tone: acima ? "over" : "ok", class: "progress--lg", label: acima ? "Gasto acima do orçamento" : "Gasto dentro do orçamento",
            })),
          C.detalheSecao("Lançamentos do mês", listaEl));
        graficoMeses(ctx, cat.id, grafico);
        ctx.loadData("lancamentos", A.getLancamentos).then((d) => {
          const itens = d.lancamentos.filter((l) => l.categoriaId === cat.id && (!mes || l.data.startsWith(mes)));
          mount(listaEl, itens.length
            ? L.ListaPainel(itens, { onClick: (l) => ctx.navigate("lancamentos", { select: { tipo: "lancamento", id: l.id } }) })
            : UI.EmptyState("Nenhum lançamento nesta categoria no mês."));
        }).catch((e) => mount(listaEl, UI.ErrorState(e.friendly)));
      },
    });
  }

  /** Painel "Todas as categorias regulares" (ao clicar no gráfico) */
  function abrirTodas(ctx) {
    const d = ZoZo.store.get().data.categorias;
    const regulares = (d.categorias || []).filter((c) => c.status === "regular");
    ctx.detail.open({
      title: "Categorias regulares",
      selected: { tipo: "categoria", id: "*" },
      render(body) {
        const grafico = h("div", { class: "detail-chart" });
        const tags = regulares.slice().sort((a, b) => b.gasto - a.gasto);
        mount(body,
          h("div", { class: "detail-hero" },
            h("div", { class: "detail-hero__lead detail-hero__lead--stack" },
              h("div", { class: "tag-row" }, tags.slice(0, 2).map((c) => UI.CategoryLabel(c, { pill: true })),
                tags.length > 2 ? h("span", { class: "tag-more" }, "+" + (tags.length - 2)) : null),
              h("span", { class: "detail-hero__name" }, "Todas as categorias regulares")),
            h("div", { class: "detail-hero__figure" },
              h("span", { class: "detail-hero__label" }, "Gasto em " + mesAbrevDe(d.mes)),
              h("span", { class: "detail-hero__value money" }, F.moeda(d.resumo.gasto)),
              resumoGasto(d.resumo.gasto, d.resumo.reservado))),
          grafico,
          C.detalheSecao(null,
            h("div", { class: "cat-table", role: "table", "aria-label": "Categorias regulares" },
              h("div", { class: "cat-table__row cat-table__row--head", role: "row" },
                h("span", { role: "columnheader" }, "Categoria"), h("span", { role: "columnheader" }, "Gasto"),
                h("span", { role: "columnheader" }, "Orçamento"), h("span", { role: "columnheader" }, "Restante")),
              regulares.map((c) => {
                const resto = F.numero(c.reservado) - F.numero(c.gasto);
                return h("button", { type: "button", class: "cat-table__row", role: "row", onClick: () => abrirDetalhe(c, ctx) },
                  h("span", { class: "cat-table__name", role: "cell" }, h("span", { class: "category-row__dot", style: { background: F.cor(c.cor, "var(--palette-16)") } }), h("span", null, (c.icone || "") + " " + c.nome)),
                  h("span", { class: "money", role: "cell" }, F.moeda(c.gasto)),
                  h("span", { class: "money", role: "cell" }, F.moeda(c.reservado)),
                  h("span", { class: ["money", resto < 0 && "money--negative"], role: "cell" }, (resto < 0 ? "−" : "") + F.moeda(resto)));
              }))));
        graficoMeses(ctx, null, grafico);
      },
    });
  }

  /** "+": pesquisa em modelos prontos + "Nova categoria" (como no Copilot) */
  function botaoNovaCategoria(ctx) {
    const btn = UI.IconButton("mais", "Nova categoria", { onPrimary: true, expanded: false });
    btn.setAttribute("aria-haspopup", "menu");
    btn.addEventListener("click", () => ZoZo.menu.abrir(btn, { largura: 270, render(el, api) {
      const existentes = new Set((((ZoZo.store.get().data.categorias || {}).categorias) || []).map((c) => c.nome.toLowerCase()));
      const modelos = (ZoZo.regras.modelosCategoria || ZoZo.regras.categoriasSugeridas || []).filter((m) => !existentes.has(m.nome.toLowerCase()));
      const norm = (t) => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      let termo = "";
      const busca = h("input", { type: "search", class: "menu__search-input", placeholder: "Pesquisar", "aria-label": "Pesquisar modelos" });
      const lista = h("div", { class: "menu__list menu__list--scroll" });
      const desenhar = () => {
        const itens = modelos.filter((m) => !termo || norm(m.nome).includes(termo));
        mount(lista, h("div", { class: "menu__section" }, "Modelos de categoria"),
          itens.length ? itens.map((m) => h("button", { type: "button", class: "menu__item", onClick: () => {
            api.fechar();
            ctx.bridge.request(A.createCategoria, { categoria: Object.assign({ reservado: 0, status: "regular", grupo: null }, m) }).then((r) => {
              ctx.toast("Categoria criada.");
              return ctx.recarregarTudo().then(() => abrirDetalhe(Object.assign({ gasto: 0 }, r.categoria), ctx));
            }).catch((e) => ctx.toast(e.friendly, { tone: "error" }));
          } }, h("span", { class: "menu__emoji" }, m.icone), h("span", { class: "menu__label" }, m.nome)))
            : h("p", { class: "menu__empty" }, termo ? "Nenhum modelo encontrado." : "Todos os modelos já foram criados."));
      };
      busca.addEventListener("input", () => { termo = norm(busca.value.trim()); desenhar(); });
      mount(el, h("div", { class: "menu__search" }, ZoZo.icons.icon("pesquisar", { size: 14 }), busca), lista,
        h("div", { class: "menu__sep" }),
        h("button", { type: "button", class: "menu__item", onClick: () => { api.fechar(); ZoZo.modais.novaCategoria(ctx, { nome: termo ? busca.value.trim() : "", aoCriar: (c) => abrirDetalhe(Object.assign({ gasto: 0 }, c), ctx) }); } },
          ZoZo.icons.icon("mais", { size: 16, class: "menu__icon" }), h("span", { class: "menu__label" }, "Nova categoria")));
      desenhar();
      requestAnimationFrame(() => busca.focus());
    } }, { posicao: "direita", largura: 270, label: "Nova categoria", focar: false }));
    return btn;
  }

  ZoZo.categoriasShared = { abrirFormCategoria: (...a) => abrirFormCategoria(...a), abrirDetalhe: (...a) => abrirDetalhe(...a), estruturar: (c) => estruturar(c) };

  ZoZo.pages.categorias = {
    titulo: "Categorias",
    topbar: (ctx) => [botaoNovaCategoria(ctx)],
    carregar: (ctx, force) => ctx.loadData("categorias", A.getCategorias, null, { force }),
    deps: (s) => [s.data.categorias, s.errors.categorias, s.ui.gruposFechados, s.selectedItem],
    render(state, ctx) {
      const espera = C.estadoCarregamento(state, ["categorias"], () => this.carregar(ctx, true), {
        skeleton: h("div", null, h("div", { class: "card skeleton-card skeleton-card--short" }), UI.Skeleton(8)),
      });
      if (espera) return C.pagina("page--categorias", espera);
      const d = state.data.categorias;
      const todas = d.categorias || [];
      const regulares = todas.filter((c) => c.status === "regular");
      const excluidas = todas.filter((c) => c.status === "excluida");

      if (!todas.length) {
        return C.pagina("page--categorias", h("div", { class: "empty empty--onboarding" },
          ZoZo.icons.icon("categorias", { size: 22, class: "empty__icon" }),
          h("p", { class: "empty__text" }, "Nenhuma categoria cadastrada."),
          h("p", { class: "empty__hint" }, "Crie as suas ou comece com uma lista sugerida que você pode editar depois."),
          h("div", { class: "detail-actions" },
            UI.Button("Criar categorias sugeridas", { variant: "primary", icon: "categorias", onClick: (e) => {
              e.currentTarget.disabled = true;
              ctx.bridge.request(A.createCategoriasSugeridas).then(() => { ctx.toast("Categorias criadas."); return ctx.recarregarTudo(); })
                .catch((err) => ctx.toast(err.friendly, { tone: "error" }));
            } }),
            UI.Button("Nova categoria", { icon: "mais", onClick: () => ZoZo.modais.novaCategoria(ctx, {}) }))));
      }

      return C.pagina("page--categorias",
        C.cardResumoDonut({
          ariaLabel: "Distribuição dos gastos por categoria",
          esquerda: { valor: d.resumo ? d.resumo.gasto : 0, label: "gasto em " + mesAbrevDe(d.mes) },
          direita: { valor: d.resumo ? d.resumo.reservado : 0, label: "orçamento total" },
          segmentos: regulares.map((c) => ({ label: c.nome, cor: c.cor, valor: c.gasto })),
          onClick: () => abrirTodas(ctx),
        }),
        UI.Section({ key: "cat:regulares", title: "Categorias regulares", class: "section--cat-cols",
          aside: [h("span", { class: "cat-col cat-col--gasto" }, "Gasto"), h("span", { class: "cat-col cat-col--sp" }), h("span", { class: "cat-col cat-col--res" }, "Reservado")] },
          regulares.length ? h("div", { class: "list" }, linhas(regulares, false, state, ctx)) : UI.EmptyState("Nenhuma categoria regular.", { icon: "categorias" })),
        UI.Section({ key: "cat:excluidas", title: "Categorias excluídas" },
          excluidas.length ? h("div", { class: "list" }, linhas(excluidas, true, state, ctx)) : UI.EmptyState("Nenhuma categoria excluída.", { icon: "categorias" })));
    },
  };
})(window.ZoZo);
