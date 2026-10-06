/* =============================================================
   ZoZo — Painel lateral (seções 5, 7, 8)
   Superior: navegação · Central: resumo de contas · Inferior: Configurações
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
    { id: "perfil", label: "Perfis", icon: "perfil" },
  ];

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
    const refreshBtn = UI.IconButton("atualizar", "Atualizar dados", { onClick: () => ctx.refresh(), class: "sidebar__refresh" });

    const aviso = ZoZo.bridge.isDemo
      ? h("p", { class: "demo-badge", role: "note" }, icon("alerta", { size: 14 }), "Modo de demonstração: nada é salvo no servidor.")
      : null;
    mount(el,
      h("div", { class: "sidebar__header" },
        h("span"),
        refreshBtn),
      navEl, contasEl, aviso, footerEl);

    let assinatura = null;
    function render(state) {
      const contas = state.data.contas && state.data.contas.contas;
      const sig = [state.currentPage, contas, state.ui.gruposFechados, state.loading.contas, state.loading._refresh].map((x) => (typeof x === "object" ? x : String(x)));
      if (assinatura && sig.every((v, i) => v === assinatura[i])) return;
      assinatura = sig;

      refreshBtn.classList.toggle("is-spinning", !!state.loading._refresh);
      mount(navEl, NAV.map((n) => navItem(n, state.currentPage, ctx.navigate)));

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

      mount(footerEl, h("button", { type: "button", class: "nav-item", "aria-haspopup": "dialog", onClick: () => ctx.abrirConfiguracoes() },
        icon("configuracoes", { size: 16 }), h("span", null, "Configurações")));
    }

    return { render };
  }

  ZoZo.sidebar = { create, NAV };
})(window.ZoZo);
