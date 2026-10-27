/* =============================================================
   ZoZo — Barra superior (seção 4.2)
   Título da página + ações contextuais (à direita). Visual em Tailwind (components/estrutura.ts).
   ============================================================= */
(function (ZoZo: ZoZoGlobal) {
  "use strict";
  const { h, mount } = ZoZo.dom;

  function create(el: HTMLElement): BarraSuperior {
    const E = ZoZo.estrutura;                 // classes Tailwind (components/estrutura.ts)
    const prefixoEl = h("span", { class: E.barraPrefixo });
    const titleEl = h("h1", { class: E.barraTitulo });
    const actionsEl = h("div", { class: E.barraAcoes });
    mount(el, h("div", { class: E.barraInicio }, prefixoEl, titleEl), actionsEl);
    return {
      setPage(titulo: string, acoes?: FilhoDom, prefixo?: FilhoDom) {
        titleEl.textContent = titulo;
        mount(prefixoEl, prefixo || null);
        mount(actionsEl, acoes || []);
      },
    };
  }

  const api: ZoZoTopbar = { create };
  ZoZo.topbar = api;
})(window.ZoZo);
