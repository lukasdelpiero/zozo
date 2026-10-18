/* =============================================================
   ZoZo — Painel lateral (seções 5, 7, 8)
   Topo: logo (esquerda) e o botão de recolher/mostrar o menu (direita, criado em app.ts)
   Superior: navegação · Central: resumo de contas · Inferior: foto + nome (esquerda) e Configurações (ícone, direita)
   Visual em Tailwind (components/estrutura.ts). TypeScript: tipos em src/globais.d.ts (ZoZoSidebar).
   ============================================================= */
(function (ZoZo: ZoZoGlobal) {
  "use strict";
  const { h, mount } = ZoZo.dom;
  const { icon } = ZoZo.icons;
  const UI = ZoZo.ui;

  const NAV: ItemNavegacao[] = [
    { id: "dashboard", label: "Dashboard", icon: "dashboard" },
    { id: "lancamentos", label: "Transações", icon: "lancamentos" },
    { id: "contas", label: "Contas", icon: "contas" },
    { id: "investimentos", label: "Investimentos", icon: "investimentos" },
    { id: "categorias", label: "Categorias", icon: "categorias" },
    { id: "recorrencias", label: "Recorrências", icon: "recorrencias" },
    { id: "perfil", label: "Perfis", icon: "perfil", recurso: "perfis" },   // só contas com o recurso de Perfis
  ];
  const visivel = (n: ItemNavegacao) => !n.recurso || ZoZo.recursos[n.recurso]();

  // Ordem e títulos dos grupos da região central (seção 7)
  const GRUPOS = [
    { titulo: "Cartão de crédito", tipos: ["cartao"] },
    { titulo: "Conta bancária", tipos: ["corrente", "poupanca"] },
    { titulo: "Investimento", tipos: ["investimento"] },
    { titulo: "Empréstimo", tipos: ["emprestimo"] },
    { titulo: "Outros", tipos: ["outros"] },
  ];

  const E = ZoZo.estrutura;
  function navItem(item: ItemNavegacao, atual: string, onNavigate: (id: string) => void) {
    const ativo = item.id === atual;
    return h("button", {
      type: "button", class: [E.navItem, ativo ? E.navItemAtivo : E.navItemNormal], "aria-current": ativo ? "page" : undefined,
      onClick: () => onNavigate(item.id),
    }, icon(item.icon, { size: 16, class: ativo ? E.navIconeAtivo : E.navIcone }), h("span", { class: E.navRotulo }, item.label));
  }

  function create(el: HTMLElement, ctx: ContextoApp): { render(state: EstadoZoZo): void } {
    const navEl = h("nav", { class: E.nav, "aria-label": "Navegação principal" });
    const contasEl = h("div", { class: E.contas, "aria-label": "Resumo das contas", role: "region", tabindex: "-1" });
    const footerEl = h("div", { class: E.rodape });
    const avisoEl = h("div");
    const cambioEl = h("div", { class: E.cambio });

    mount(el,
      h("div", { class: E.menuTopo },
        h("img", { class: E.logo, src: "assets/img/zozo-logo.svg", alt: "ZoZo", width: "28", height: "28", decoding: "async" })),
      navEl, contasEl, avisoEl, cambioEl, footerEl);

    let assinatura: unknown[] | null = null;
    function render(state: EstadoZoZo) {
      const contas = state.data.contas && state.data.contas.contas;
      const usuario: UsuarioSessao = state.session.user || {};
      const foto = state.data.config && state.data.config.foto;
      const cfg = state.data.config || {};
      const sig = [state.currentPage, contas, state.ui.gruposFechados, state.loading.contas, usuario, foto, String(!!cfg.multicambio), String(cfg.moeda)].map((x) => (typeof x === "object" ? x : String(x)));
      const antes = assinatura;
      if (antes && sig.every((v, i) => v === antes[i])) return;
      assinatura = sig;

      mount(navEl, NAV.filter(visivel).map((n) => navItem(n, state.currentPage, ctx.navigate)));
      mount(cambioEl, ZoZo.cambio.Seletor(ctx));            // Câmbio (só com o multicâmbio ligado)
      // Demonstração (modo local ou conta demo): nada é gravado
      mount(avisoEl, ZoZo.bridge.isDemo || ZoZo.recursos.demo()
        ? h("p", { class: E.demo, role: "note" }, icon("alerta", { size: 14, class: E.demoIcone }),
          ZoZo.bridge.isDemo ? "Modo de demonstração: nada é salvo no servidor." : "Conta de demonstração: dados fictícios, nada é salvo.")
        : null);

      if (!contas) {
        mount(contasEl, state.errors.contas ? h("p", { class: E.nota }, state.errors.contas) : UI.Skeleton(5, { class: "skeleton--sidebar" }));
      } else {
        const grupos = GRUPOS.map((g) => ({ titulo: g.titulo, contas: contas.filter((c: any) => !c.oculta && g.tipos.includes(c.tipo)) })).filter((g) => g.contas.length);
        mount(contasEl, grupos.length
          ? grupos.map((g) => ZoZo.list.SidebarAccountGroup(g.titulo, g.contas, {
            onSelect: (c: any) => ctx.navigate(c.tipo === "investimento" ? "investimentos" : "contas", { select: { tipo: "conta", id: c.id } }),
          }))
          : h("p", { class: E.nota }, "Nenhuma conta cadastrada."));
      }

      const avatar = ZoZo.usuario.Avatar(foto, usuario.nomeUsuario || "", 28);
      avatar.classList.add("tw:flex-none", "tw:bg-[rgba(255,255,255,0.92)]", "tw:text-zz-primary");   // foto/inicial clara sobre o roxo
      mount(footerEl,
        h("button", { type: "button", class: E.usuario, title: "Minha conta", "aria-haspopup": "dialog", onClick: () => ctx.abrirConfiguracoes("conta") },
          avatar, h("span", { class: E.usuarioNome }, usuario.nomeUsuario || "")),
        h("button", { type: "button", class: E.config, title: "Configurações", "aria-label": "Configurações", "aria-haspopup": "dialog",
          onClick: () => ctx.abrirConfiguracoes() }, icon("configuracoes", { size: 18 })));
    }

    return { render };
  }

  const api: ZoZoSidebar = { create, NAV, visivel };
  ZoZo.sidebar = api;
})(window.ZoZo);
