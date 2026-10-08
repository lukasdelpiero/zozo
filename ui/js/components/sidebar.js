/* =============================================================
   ZoZo — Painel lateral (seções 5, 7, 8)
   Topo: logo (esquerda) e o botão de recolher/mostrar o menu (direita, criado em app.js)
   Superior: navegação · Central: resumo de contas · Inferior: foto + nome (esquerda) e Configurações (ícone, direita)
   ============================================================= */
(function (ZoZo) {
  "use strict";
  const { h, mount } = ZoZo.dom;
  const { icon } = ZoZo.icons;
  const UI = ZoZo.ui;

  const NAV = [
    { id: "dashboard", label: "Dashboard", icon: "dashboard" },
    { id: "lancamentos", label: "Lançamentos", icon: "lancamentos" },
    { id: "contas", label: "Contas", icon: "contas" },
    { id: "investimentos", label: "Investimentos", icon: "investimentos" },
    { id: "categorias", label: "Categorias", icon: "categorias" },
    { id: "recorrencias", label: "Recorrências", icon: "recorrencias" },
    { id: "perfil", label: "Perfis", icon: "perfil", recurso: "perfis" },   // só contas com o recurso de Perfis
  ];
  const visivel = (n) => !n.recurso || ZoZo.recursos[n.recurso]();

  // Ordem e títulos dos grupos da região central (seção 7)
  const GRUPOS = [
    { titulo: "Cartão de crédito", tipos: ["cartao"] },
    { titulo: "Conta bancária", tipos: ["corrente", "poupanca"] },
    { titulo: "Investimento", tipos: ["investimento"] },
    { titulo: "Empréstimo", tipos: ["emprestimo"] },
    { titulo: "Outros", tipos: ["outros"] },
  ];

  function navItem(item, atual, onNavigate) {
    const ativo = item.id === atual;
    return h("button", {
      type: "button", class: ["nav-item", ativo && "is-active"], "aria-current": ativo ? "page" : undefined,
      onClick: () => onNavigate(item.id),
    }, icon(item.icon, { size: 16 }), h("span", null, item.label));
  }

  function create(el, ctx) {
    const navEl = h("nav", { class: "sidebar__nav", "aria-label": "Navegação principal" });
    const contasEl = h("div", { class: "sidebar__accounts", "aria-label": "Resumo das contas", role: "region", tabindex: "-1" });
    const footerEl = h("div", { class: "sidebar__footer" });
    const avisoEl = h("div", { class: "sidebar__aviso" });

    mount(el,
      h("div", { class: "sidebar__header" },
        h("img", { class: "sidebar__logo", src: "assets/img/zozo-logo.svg", alt: "ZoZo", width: "28", height: "28", decoding: "async" })),
      navEl, contasEl, avisoEl, footerEl);

    let assinatura = null;
    function render(state) {
      const contas = state.data.contas && state.data.contas.contas;
      const usuario = state.session.user || {};
      const foto = state.data.config && state.data.config.foto;
      const sig = [state.currentPage, contas, state.ui.gruposFechados, state.loading.contas, usuario, foto].map((x) => (typeof x === "object" ? x : String(x)));
      if (assinatura && sig.every((v, i) => v === assinatura[i])) return;
      assinatura = sig;

      mount(navEl, NAV.filter(visivel).map((n) => navItem(n, state.currentPage, ctx.navigate)));
      // Demonstração (modo local ou conta demo): nada é gravado
      mount(avisoEl, ZoZo.bridge.isDemo || ZoZo.recursos.demo()
        ? h("p", { class: "demo-badge", role: "note" }, icon("alerta", { size: 14 }),
          ZoZo.bridge.isDemo ? "Modo de demonstração: nada é salvo no servidor." : "Conta de demonstração: dados fictícios, nada é salvo.")
        : null);

      if (!contas) {
        mount(contasEl, state.errors.contas ? h("p", { class: "sidebar__note" }, state.errors.contas) : UI.Skeleton(5, { class: "skeleton--sidebar" }));
      } else {
        const grupos = GRUPOS.map((g) => ({ titulo: g.titulo, contas: contas.filter((c) => !c.oculta && g.tipos.includes(c.tipo)) })).filter((g) => g.contas.length);
        mount(contasEl, grupos.length
          ? grupos.map((g) => ZoZo.list.SidebarAccountGroup(g.titulo, g.contas, {
            onSelect: (c) => ctx.navigate(c.tipo === "investimento" ? "investimentos" : "contas", { select: { tipo: "conta", id: c.id } }),
          }))
          : h("p", { class: "sidebar__note" }, "Nenhuma conta cadastrada."));
      }

      mount(footerEl,
        h("button", { type: "button", class: "sidebar__user", title: "Minha conta", "aria-haspopup": "dialog", onClick: () => ctx.abrirConfiguracoes("conta") },
          ZoZo.usuario.Avatar(foto, usuario.nomeUsuario, 28), h("span", { class: "sidebar__user-name" }, usuario.nomeUsuario || "")),
        h("button", { type: "button", class: "sidebar__config", title: "Configurações", "aria-label": "Configurações", "aria-haspopup": "dialog",
          onClick: () => ctx.abrirConfiguracoes() }, icon("configuracoes", { size: 18 })));
    }

    return { render };
  }

  ZoZo.sidebar = { create, NAV, visivel };
})(window.ZoZo);
