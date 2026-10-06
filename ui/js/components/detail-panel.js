/* =============================================================
   ZoZo — Painel de informações (seções 4.4 e 44)
   Sempre visível à direita. Sem conteúdo, mostra
   "Selecione para ver detalhes". O cabeçalho (título, ações e
   fechar) pertence ao próprio painel, o que permite que ele vire
   uma gaveta sobreposta em telas estreitas (tela dividida).
   ============================================================= */
(function (ZoZo) {
  "use strict";
  const { h, mount } = ZoZo.dom;
  const { icon } = ZoZo.icons;
  const UI = ZoZo.ui;

  function create(workspaceEl, panelEl) {
    const voltarEl = h("span", { class: "detail__back" });
    const tituloEl = h("h2", { class: "detail__title", id: "detail-title" });
    const acoesEl = h("div", { class: "detail__actions" });
    const header = h("header", { class: "detail__header" }, h("div", { class: "detail__lead" }, voltarEl, tituloEl), acoesEl);
    const corpo = h("div", { class: "detail__content" });
    mount(panelEl, header, corpo);

    let atual = null;
    let chaveAtual = null;   // item exibido (para não repetir a animação ao reabrir o mesmo)

    function vazio() {
      chaveAtual = null;
      tituloEl.textContent = "";
      mount(voltarEl);
      mount(acoesEl);
      mount(corpo, h("div", { class: "detail__placeholder" },
        icon("lancamentos", { size: 26 }),
        h("p", null, "Selecione para ver detalhes")));
      workspaceEl.dataset.conteudo = "nao";
    }

    /** Limpa o conteúdo (o painel continua aberto, com o texto de orientação) */
    function close(opts) {
      const anterior = atual;
      atual = null;
      vazio();
      ZoZo.store.set({ detailPanelOpen: false, selectedItem: null });
      if (anterior && anterior.onClose && !(opts && opts.silencioso)) anterior.onClose();
    }

    /**
     * open({ title, render(body, api), menu:[itens do ZoZo.menu], botoes:[{label, onClick}], selected, onClose })
     *   menu   → botão "⋯" que abre o menu suspenso (com submenus)
     *   botoes → botões de texto ao lado do "⋯" (ex.: "Editar orçamento")
     */
    function open(cfg) {
      atual = { onClose: cfg.onClose };
      workspaceEl.dataset.conteudo = "sim";
      // Título: texto ou elemento (ex.: seletor do tipo de lançamento)
      if (cfg.tituloNode) mount(tituloEl, cfg.tituloNode); else tituloEl.textContent = cfg.title || "";
      // Seta "voltar": retorna ao conteúdo anterior sem trocar de página
      mount(voltarEl, cfg.voltar ? [UI.IconButton("seta-voltar", "Voltar", { onClick: cfg.voltar }), h("span", { class: "detail__divider", "aria-hidden": "true" })] : null);
      const botoes = (cfg.botoes || []).map((b) => h("button", { type: "button", class: ["detail__textbtn", b.primario && "detail__textbtn--primary"], onClick: b.onClick, disabled: b.desabilitado },
        b.icone ? icon(b.icone, { size: 14, stroke: 2.25 }) : null, b.label));
      (cfg.acoes || []).forEach((a) => botoes.push(UI.IconButton(a.icone, a.rotulo, { class: a.perigo ? "icon-btn--danger" : null, onClick: a.onClick })));
      if (cfg.menu && cfg.menu.length) {
        const btn = UI.IconButton("opcoes", "Mais opções", { expanded: false });
        btn.setAttribute("aria-haspopup", "menu");
        btn.addEventListener("click", () => ZoZo.menu.abrir(btn, cfg.menu, { posicao: "direita", label: "Opções", checkEsquerda: true }));
        botoes.push(btn);
      }
      if (botoes.length) botoes.push(h("span", { class: "detail__divider", "aria-hidden": "true" }));
      botoes.push(UI.IconButton("fechar", "Fechar painel", { onClick: () => close() }));
      mount(acoesEl, botoes);

      const rolagemAnterior = (corpo.querySelector(".detail__body") || {}).scrollTop || 0;
      const chave = cfg.selected ? cfg.selected.tipo + ":" + cfg.selected.id : null;
      const mesmo = chave && chave === chaveAtual;
      chaveAtual = chave;
      const body = h("div", { class: ["detail__body", mesmo && "detail__body--estatico"], role: "region", "aria-labelledby": "detail-title" });
      mount(corpo, body);
      const api = { close, setTitle: (t) => { tituloEl.textContent = t; } };
      cfg.render(body, api);
      if (mesmo) body.scrollTop = rolagemAnterior;   // salvar no lugar não leva o painel de volta ao topo
      ZoZo.store.set({ detailPanelOpen: true, selectedItem: cfg.selected || null });
      requestAnimationFrame(() => {
        const alvo = body.querySelector("[data-autofocus]");
        if (alvo && cfg.focus !== false) alvo.focus();
      });
      return api;
    }

    vazio();
    return { open, close, isOpen: () => workspaceEl.dataset.conteudo === "sim" };
  }

  ZoZo.detailPanel = { create };
})(window.ZoZo);
