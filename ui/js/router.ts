/* =============================================================
   ZoZo — Navegação SPA (seção 58)
   Troca apenas o conteúdo da área principal; shell e sidebar
   permanecem. Cada página expõe:
     titulo, carregar(ctx, force), deps(state), render(state, ctx),
     topbar?(ctx), selecionar?(sel, ctx)
   TypeScript: tipos em src/globais.d.ts (PaginaZoZo, ZoZoRouter).
   ============================================================= */
(function (ZoZo: ZoZoGlobal) {
  "use strict";
  const { mount } = ZoZo.dom;

  function create(ctx: any, topbar: BarraSuperior, mainEl: HTMLElement): Roteador {
    let page: PaginaZoZo | null = null;
    let assinatura: unknown[] | null = null;
    let entrada = false;
    let entradaEm = 0;     // quando a navegação começou

    function render(state: EstadoZoZo) {
      if (!page || !state.session.authenticated) return;
      const deps = page.deps(state);
      const antes = assinatura;
      if (antes && deps.length === antes.length && deps.every((d, i) => d === antes[i])) return;
      assinatura = deps;
      const scroll = mainEl.scrollTop;
      const ativo = document.activeElement as HTMLElement | null;
      const foco = ativo && mainEl.contains(ativo) ? ativo.dataset.fk : null;
      // Anima ao entrar na página; um redesenho logo em seguida (dados novos) continua a mesma animação
      const desdeEntrada = Date.now() - entradaEm;
      const animar = entrada || desdeEntrada < 800 || !!mainEl.querySelector('[aria-busy="true"]');
      const entradaAgora = entrada;
      entrada = false;
      // redesenho logo após entrar com gráfico já na tela: os gráficos novos continuam a animação em curso
      // (só a desta entrada: ao entrar na página o início anterior é esquecido)
      if (entradaAgora) ZoZo.charts.ultimoInicio = null;
      const tinhaGrafico = !entradaAgora && !!mainEl.querySelector(".line-chart__svg, .donut");
      // gráficos animam ao entrar na página e quando aparecem pela 1ª vez (ex.: dados que chegaram depois);
      // um redesenho com o gráfico já na tela (dados atualizados) não reanima
      ZoZo.charts.permitirAnimacao = animar || !tinhaGrafico;
      ZoZo.charts.continuarDe = animar && tinhaGrafico ? ZoZo.charts.ultimoInicio : null;
      const conteudo = page.render(state, ctx);
      ZoZo.charts.permitirAnimacao = true;
      ZoZo.charts.continuarDe = null;
      if (animar) {
        conteudo.classList.add("page--entrar");
        if (!entradaAgora && desdeEntrada < 800) {
          conteudo.style.animationDelay = -desdeEntrada + "ms";                                   // continua de onde parou
          conteudo.style.setProperty("--entrada-decorrida", -desdeEntrada + "ms");                // e os blocos também
        }
      }
      mount(mainEl, conteudo);
      mainEl.scrollTop = scroll;
      if (foco) { const el = mainEl.querySelector<HTMLElement>('[data-fk="' + CSS.escape(foco) + '"]'); if (el) el.focus(); }
    }

    function refreshTopbar() {
      if (!page) return;
      topbar.setPage(page.titulo, page.topbar ? page.topbar(ctx) : [], page.prefixo ? page.prefixo(ctx) : null);
    }

    function navigate(id: string, opts?: { force?: boolean; select?: unknown }) {
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
      document.getElementById("app")!.dataset.pagina = id;   // ex.: Dashboard não tem painel de informações
      refreshTopbar();
      if (mudou) mainEl.scrollTop = 0;
      render(ZoZo.store.get());
      Promise.resolve(alvo.carregar(ctx, !!o.force)).then(() => {
        if (o.select && page === alvo && alvo.selecionar) alvo.selecionar(o.select, ctx);
      }).catch(() => { /* erro já refletido no estado */ });
    }

    ZoZo.store.subscribe(render);

    return { navigate, refreshTopbar, current: () => page };
  }

  const api: ZoZoRouter = { create };
  ZoZo.router = api;
  ZoZo.pages = ZoZo.pages || {};
})(window.ZoZo);
