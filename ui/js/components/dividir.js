/* =============================================================
   ZoZo — Dividir transação entre perfis
   (ex.: conta rachada paga com um único cartão)
   ZoZo.dividir.abrir(lancamento, ctx, aoTerminar)
   Regras: mesma data do original · soma = valor original (100%) ·
   categoria e perfil em todas as partes · perfis sem repetição ·
   nomes e categorias podem repetir · recorrente: origem → uma série por parte; ocorrência → só aquele mês.
   ============================================================= */
(function (ZoZo) {
  "use strict";
  const { h, mount } = ZoZo.dom;
  const { icon } = ZoZo.icons;
  const UI = ZoZo.ui;
  const F = ZoZo.format;
  const A = ZoZo.messages.ACTIONS;
  const store = ZoZo.store;

  const dataCurta = (iso) => { const d = F.parseData(iso); return d ? d.getDate() + " " + F.mesAbrev(d.getMonth()) + ", " + d.getFullYear() : ""; };
  const pct = (c, total) => (total ? (c / total) * 100 : 0);
  const fmtPct = (v) => (Math.round(v * 100) / 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + "%";

  function abrir(original, ctx, aoTerminar) {
    const st = store.get();
    const todos = (st.data.lancamentos && st.data.lancamentos.lancamentos) || [];
    const cats = ((st.data.categorias && st.data.categorias.categorias) || []);
    const perfis = ((st.data.perfis && st.data.perfis.perfis) || []).filter((p) => !p.arquivado);
    const membros = original.divisao ? todos.filter((l) => l.divisao && l.divisao.id === original.divisao.id) : [original];
    const base = membros.find((l) => l.id === original.id) || original;
    const total = Math.round((original.divisao ? original.divisao.total : original.valor) * 100);   // em centavos
    const data = base.data;

    // Estado: partes e modo (igual | personalizado)
    let partes = membros.map((l) => ({ descricao: l.descricao, data: l.data, categoriaId: l.categoriaId, perfilId: l.perfilId, c: Math.round(l.valor * 100), cP: Math.round(l.valor * 100) }));
    if (partes.length < 2) partes.push(Object.assign({}, partes[0]));          // começa com duas partes (perfil repetido)
    let modo = membros.length > 1 && !partes.every((p) => Math.abs(p.c - partes[0].c) <= 1) ? "personalizado" : "igual";
    const igualar = () => {
      const n = partes.length, b = Math.floor(total / n), r = total - b * n;
      partes.forEach((p, i) => { p.c = b + (i < r ? 1 : 0); });
    };
    if (modo === "igual") igualar();

    const corpo = h("div", { class: "dv" });
    const lista = h("div", { class: "dv__list" });
    const erroEl = h("div", { class: "dv__errors", role: "alert" });
    const restanteEl = h("span", { class: "dv__rest-value money" });
    let alternar;

    const pillCategoria = (id) => { const c = cats.find((x) => x.id === id); return c ? UI.CategoryLabel(c, { pill: true }) : h("span", { class: "dv__missing" }, "Categoria"); };
    const pillPerfil = (id) => { const p = perfis.find((x) => x.id === id) || ((st.data.perfis && st.data.perfis.perfis) || []).find((x) => x.id === id); return p ? UI.Tag(p.nome, p.cor, { class: "tag--upper" }) : h("span", { class: "dv__missing" }, "Perfil"); };

    /* Menus iguais aos do painel do lançamento: pesquisa, lista com altura limitada e "+ Nova…" */
    const norm = (t) => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    function menuCategoria(btn, parte) {
      ZoZo.menu.abrir(btn, { largura: 280, render(el, api) {
        let termo = "";
        const lista = () => ((store.get().data.categorias || {}).categorias || []);
        const busca = h("input", { type: "search", class: ZoZo.estrutura.menuPesquisaCampo, placeholder: "Pesquisar", "aria-label": "Pesquisar categoria" });
        const caixa = h("div", { class: ZoZo.estrutura.menuListaRolagem });
        const escolher = (id) => { api.fechar(); parte.categoriaId = id; desenhar(); };
        const pintar = () => mount(caixa, lista().filter((c) => !termo || norm(c.nome).includes(termo)).map((c) =>
          h("button", { type: "button", class: [ZoZo.estrutura.menuItem, c.id === parte.categoriaId && "is-checked"], onClick: () => escolher(c.id) }, UI.CategoryLabel(c, { pill: true }))));
        busca.addEventListener("input", () => { termo = norm(busca.value.trim()); pintar(); });
        mount(el, h("div", { class: ZoZo.estrutura.menuPesquisa }, icon("pesquisar", { size: 14 }), busca), caixa, h("div", { class: ZoZo.estrutura.menuSeparador }),
          h("button", { type: "button", class: ZoZo.estrutura.menuItem, onClick: () => { api.fechar(); ZoZo.modais.novaCategoria(ctx, { nome: termo ? busca.value.trim() : "", aoCriar: (c) => { cats.push(c); escolher(c.id); } }); } },
            icon("mais", { size: 16, class: ZoZo.estrutura.menuIcone }), h("span", { class: ZoZo.estrutura.menuRotulo }, "Nova categoria")));
        pintar();
        requestAnimationFrame(() => busca.focus());
      } }, { posicao: "direita", largura: 280, label: "Categoria", focar: false });
    }
    function menuPerfil(btn, parte) {
      ZoZo.menu.abrir(btn, { largura: 240, render(el, api) {
        const atuais = () => ((store.get().data.perfis || {}).perfis || []).filter((p) => !p.arquivado);
        mount(el, h("div", { class: ZoZo.estrutura.menuListaRolagem }, atuais().map((p) =>
          h("button", { type: "button", class: [ZoZo.estrutura.menuItem, p.id === parte.perfilId && "is-checked"], onClick: () => { api.fechar(); parte.perfilId = p.id; desenhar(); } },
            UI.Tag(p.nome, p.cor, { class: "tag--upper" })))),
          h("div", { class: ZoZo.estrutura.menuSeparador }),
          h("button", { type: "button", class: ZoZo.estrutura.menuItem, onClick: () => { api.fechar(); ZoZo.modais.novoPerfil(ctx, { aoCriar: (np) => { perfis.push(np); parte.perfilId = np.id; desenhar(); } }); } },
            icon("mais", { size: 16, class: ZoZo.estrutura.menuIcone }), h("span", { class: ZoZo.estrutura.menuRotulo }, "Novo perfil")));
      } }, { posicao: "direita", largura: 240, label: "Perfil" });
    }

    function linha(parte, i) {
      const nome = ZoZo.inline.texto({ valor: parte.descricao, rotulo: "Nome da parte " + (i + 1), max: ZoZo.regras.limiteNome, classe: "dv__name",
        aoSalvar: (v) => { parte.descricao = v; } });
      const dataBtn = h("button", { type: "button", class: "dv__date" }, dataCurta(parte.data));
      dataBtn.addEventListener("click", () => ZoZo.calendario.abrir(dataBtn, parte.data, (v) => { parte.data = v; desenhar(); }, { rotulo: "Data da parte " + (i + 1) }));
      const catBtn = h("button", { type: "button", class: "dv__pill", "aria-haspopup": "menu", "aria-label": "Categoria" }, pillCategoria(parte.categoriaId));
      catBtn.addEventListener("click", () => menuCategoria(catBtn, parte));
      const perfBtn = h("button", { type: "button", class: "dv__pill", "aria-haspopup": "menu", "aria-label": "Perfil" }, pillPerfil(parte.perfilId));
      perfBtn.addEventListener("click", () => menuPerfil(perfBtn, parte));
      const valor = ZoZo.inline.dinheiro({ valor: parte.c / 100, rotulo: "Valor da parte " + (i + 1), classe: "dv__value",
        aoSalvar: (v) => { mudarParaPersonalizado(); parte.pctDef = undefined; parte.c = parte.cP = Math.round(v * 100); desenhar(); } });
      const pctInput = h("input", { type: "text", inputmode: "decimal", class: "inline-input dv__pct", value: fmtPct(pct(parte.c, total)), "aria-label": "Percentual da parte " + (i + 1), "data-sem-mascara": "1" });
      pctInput.addEventListener("focus", () => { pctInput.value = String(Math.round(pct(parte.c, total) * 100) / 100).replace(".", ","); pctInput.select(); });
      pctInput.addEventListener("keydown", (e) => { if (e.key === "Enter") pctInput.blur(); });
      pctInput.addEventListener("blur", () => {
        const v = parseFloat(pctInput.value.replace("%", "").replace(",", "."));
        if (Number.isFinite(v) && v >= 0 && v <= 100 && Math.abs(v - pct(parte.c, total)) > 0.004) {
          mudarParaPersonalizado();
          parte.pctDef = v;
          parte.c = parte.cP = Math.round((total * v) / 100);
          repartirPercentuais();
        }
        desenhar();
      });
      const remover = h("button", { type: "button", class: "icon-btn icon-btn--sm dv__remove", "aria-label": "Remover parte " + (i + 1), disabled: partes.length <= 1,
        onClick: () => { partes.splice(i, 1); if (modo === "igual") igualar(); desenhar(); } }, icon("fechar", { size: 14 }));
      return h("div", { class: "dv__row" }, nome, dataBtn, catBtn, perfBtn, valor, pctInput, remover);
    }

    /** Personalizado usa os valores que o usuário definiu (guardados em cP); partes novas ficam como estão */
    function mudarParaPersonalizado(restaurar) {
      if (modo === "personalizado") return;
      modo = "personalizado";
      // pelo botão: volta aos valores que o usuário tinha definido; editando um valor: parte dos valores atuais
      partes.forEach((p) => { if (restaurar && Number.isFinite(p.cP)) p.c = p.cP; else p.cP = p.c; });
    }

    /** Maiores restos: se todos os percentuais definidos somam 100%, a soma dos centavos fica exata */
    function repartirPercentuais() {
      if (!partes.every((p) => Number.isFinite(p.pctDef))) return;
      const soma = partes.reduce((s, p) => s + p.pctDef, 0);
      if (Math.abs(soma - 100) > 0.001) return;
      const brutos = partes.map((p) => (total * p.pctDef) / 100);
      partes.forEach((p, i) => { p.c = Math.floor(brutos[i]); });
      let falta = total - partes.reduce((s, p) => s + p.c, 0);
      brutos.map((b, i) => [b - Math.floor(b), i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (falta > 0) { partes[i].c += 1; falta -= 1; } });
      partes.forEach((p) => { p.cP = p.c; });
    }

    function desenhar() {
      if (modo === "igual") igualar();
      mount(lista, partes.map(linha),
        UI.Button("Add divisão", { size: "sm", icon: "mais", class: "dv__add", onClick: () => {
          const nova = Object.assign({}, partes[partes.length - 1]);          // repete a última parte (inclusive o perfil)
          partes.push(nova);
          if (modo === "igual") { igualar(); nova.cP = undefined; }
          else nova.c = nova.cP = Math.max(0, total - partes.slice(0, -1).reduce((s, p) => s + p.c, 0));
          desenhar();
        } }));
      const resto = total - partes.reduce((s, p) => s + p.c, 0);
      restanteEl.textContent = (resto < 0 ? "−" : "") + F.moeda(Math.abs(resto) / 100);
      restanteEl.classList.toggle("is-negative", resto < 0);
      if (alternar) alternar.querySelectorAll(".segmented__item").forEach((b) => b.classList.toggle("is-active", b.dataset.v === modo));
      mount(erroEl);
    }

    function validar() {
      const erros = [];
      const soma = partes.reduce((s, p) => s + p.c, 0);
      if (partes.length < 2 && !original.divisao) erros.push("Adicione pelo menos duas partes.");
      if (soma !== total) erros.push("A soma das partes precisa ser 100% (" + F.moeda(total / 100) + "). Agora está em " + fmtPct(pct(soma, total)) + ".");
      if (partes.some((p) => p.c <= 0)) erros.push("Nenhuma parte pode ficar com valor zero.");
      if (partes.some((p) => p.data !== data)) erros.push("Todas as partes precisam ter a data da transação original (" + dataCurta(data) + ").");
      if (partes.some((p) => !p.categoriaId)) erros.push("Escolha uma categoria para todas as partes.");
      if (partes.some((p) => !p.perfilId)) erros.push("Escolha um perfil para todas as partes.");
      else if (new Set(partes.map((p) => p.perfilId)).size !== partes.length) erros.push("Cada parte precisa de um perfil diferente.");
      return erros;
    }

    const card = h("div", { class: "dv__card" },
      h("div", { class: "dv__card-left" },
        h("div", { class: "dv__card-pills" }, pillCategoria(base.categoriaId), pillPerfil(base.perfilId)),
        h("span", { class: "dv__card-name" }, base.descricao)),
      h("div", { class: "dv__card-right" },
        h("span", { class: "dv__card-date" }, dataCurta(data)),
        h("span", { class: "dv__card-value" }, h("span", { class: "money" }, F.moeda(total / 100)))));

    ZoZo.modais.janela({
      titulo: "Dividir transação",
      classe: "modal--dividir",
      passo: (api) => {
        alternar = UI.Segmented([{ value: "igual", label: "Igualmente" }, { value: "personalizado", label: "Personalizado" }], modo,
          (v) => { if (v === "personalizado") mudarParaPersonalizado(true); else modo = "igual"; desenhar(); }, { label: "Forma de divisão", class: "segmented--pilulas dv__toggle" });
        alternar.querySelectorAll(".segmented__item").forEach((b, i) => { b.dataset.v = i === 0 ? "igual" : "personalizado"; });
        const salvar = (btn) => {
          const ativo = document.activeElement; if (ativo && corpo.contains(ativo)) ativo.blur();    // conclui a edição em andamento
          const erros = validar();
          if (erros.length) { mount(erroEl, h("ul", null, erros.map((e) => h("li", null, e)))); return; }
          btn.disabled = true;
          ctx.bridge.request(A.dividirLancamento, { id: base.id, partes: partes.map((p) => ({ descricao: p.descricao, data: p.data, categoriaId: p.categoriaId, perfilId: p.perfilId, valor: p.c / 100 })) })
            .then(() => { api.fechar(); ctx.toast(partes.length > 1 ? "Transação dividida." : "Divisão desfeita."); return ctx.recarregarTudo().then(() => aoTerminar && aoTerminar(base.id)); })
            .catch((e) => { btn.disabled = false; mount(erroEl, h("p", null, e.friendly)); });
        };
        mount(corpo, card, h("div", { class: "dv__connector", "aria-hidden": "true" }), h("div", { class: "dv__grid-line" }),
          alternar, lista, erroEl,
          h("div", { class: "dv__footer" },
            h("div", { class: "dv__rest" }, h("span", { class: "dv__rest-label" }, "Restante para dividir"), restanteEl),
            h("div", { class: "dv__actions" },
              UI.Button("Cancelar", { onClick: () => api.fechar() }),
              UI.Button("Salvar", { variant: "primary", onClick: (e) => salvar(e.currentTarget) }))));
        desenhar();
        return { corpo, botoes: [] };
      },
    });
  }

  ZoZo.dividir = { abrir };
})(window.ZoZo);
