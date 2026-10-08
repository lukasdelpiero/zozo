/* =============================================================
   ZoZo — Navegação SPA (seção 58)
   Troca apenas o conteúdo da área principal; shell e sidebar
   permanecem. Cada página expõe:
     titulo, carregar(ctx, force), deps(state), render(state, ctx),
     topbar?(ctx), selecionar?(sel, ctx)
   ============================================================= */
(function (ZoZo) {
  "use strict";
  const { mount } = ZoZo.dom;

  function create(ctx, topbar, mainEl) {
    let page = null;
    let assinatura = null;
    let entrada = false;
    let entradaEm = 0;     // quando a navegação começou

    function render(state) {
      if (!page || !state.session.authenticated) return;
      const deps = page.deps(state);
      if (assinatura && deps.length === assinatura.length && deps.every((d, i) => d === assinatura[i])) return;
      assinatura = deps;
      const scroll = mainEl.scrollTop;
      const foco = document.activeElement && mainEl.contains(document.activeElement) ? document.activeElement.dataset.fk : null;
      // Anima ao entrar na página; um redesenho logo em seguida (dados novos) continua a mesma animação
      const desdeEntrada = Date.now() - entradaEm;
      const animar = entrada || desdeEntrada < 800 || !!mainEl.querySelector('[aria-busy="true"]');
      const entradaAgora = entrada;
      entrada = false;
      ZoZo.charts.permitirAnimacao = animar;          // gráficos só animam ao entrar na página
      const conteudo = page.render(state, ctx);
      ZoZo.charts.permitirAnimacao = true;
      if (animar && conteudo.classList) {
        conteudo.classList.add("page--entrar");
        if (!entradaAgora && desdeEntrada < 800) conteudo.style.animationDelay = -desdeEntrada + "ms";   // continua de onde parou
      }
      mount(mainEl, conteudo);
      mainEl.scrollTop = scroll;
      if (foco) { const el = mainEl.querySelector('[data-fk="' + CSS.escape(foco) + '"]'); if (el) el.focus(); }
    }

    function refreshTopbar() {
      if (!page) return;
      topbar.setPage(page.titulo, page.topbar ? page.topbar(ctx) : [], page.prefixo ? page.prefixo(ctx) : null);
    }

    function navigate(id, opts) {
      const o = opts || {};
      const alvo = ZoZo.pages[id];
      if (!alvo) return;
      // Página de um recurso que a conta não tem (ex.: Perfis): vai para o Dashboard
      if (alvo.recurso && !ZoZo.recursos[alvo.recurso]()) { if (id !== "dashboard") navigate("dashboard"); return; }
      ZoZo.menu.fechar();
      ctx.detail.close({ silencioso: true });
      const mudou = !page || page !== alvo;
      page = alvo;
      assinatura = null;
      entrada = true;
      entradaEm = Date.now();
      ZoZo.store.set({ currentPage: id });
      document.getElementById("app").dataset.pagina = id;   // ex.: Dashboard não tem painel de informações
      refreshTopbar();
      if (mudou) mainEl.scrollTop = 0;
      render(ZoZo.store.get());
      Promise.resolve(page.carregar(ctx, !!o.force)).then(() => {
        if (o.select && page === alvo && page.selecionar) page.selecionar(o.select, ctx);
      }).catch(() => { /* erro já refletido no estado */ });
    }

    ZoZo.store.subscribe(render);

    return { navigate, refreshTopbar, current: () => page };
  }

  ZoZo.router = { create };
  ZoZo.pages = ZoZo.pages || {};
})(window.ZoZo);
