/* =============================================================
   ZoZo — Barra superior (seção 4.2)
   Título da página + ações contextuais (à direita).
   ============================================================= */
(function (ZoZo) {
  "use strict";
  const { h, mount } = ZoZo.dom;

  function create(el) {
    const prefixoEl = h("span", { class: "topbar__prefix" });
    const titleEl = h("h1", { class: "topbar__title" });
    const actionsEl = h("div", { class: "topbar__actions" });
    mount(el, h("div", { class: "topbar__lead" }, prefixoEl, titleEl), actionsEl);
    return {
      setPage(titulo, acoes, prefixo) {
        titleEl.textContent = titulo;
        mount(prefixoEl, prefixo || null);
        mount(actionsEl, acoes || []);
      },
    };
  }

  ZoZo.topbar = { create };
})(window.ZoZo);
