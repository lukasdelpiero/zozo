/* =============================================================
   ZoZo — Painel de informações (seções 4.4 e 44)
   Sempre visível à direita. Sem conteúdo, mostra
   "Selecione para ver detalhes". O cabeçalho (título, ações e
   fechar) pertence ao próprio painel, o que permite que ele vire
   uma gaveta sobreposta em telas estreitas (tela dividida).
   Visual em Tailwind (components/estrutura.ts). TypeScript: tipos em src/globais.d.ts (ZoZoDetailPanel).
   ============================================================= */
(function (ZoZo: ZoZoGlobal) {
  "use strict";
  const { h, mount } = ZoZo.dom;
  const { icon } = ZoZo.icons;
  const UI = ZoZo.ui;

  function create(workspaceEl: HTMLElement, panelEl: HTMLElement): PainelInformacoes {
    const E = ZoZo.estrutura;
    const voltarEl = h("span", { class: E.painelVoltar });
    const tituloEl = h("h2", { class: E.painelTitulo, id: "detail-title" });
    const acoesEl = h("div", { class: E.painelAcoes });
    const header = h("header", { class: E.painelTopo }, h("div", { class: E.painelInicio }, voltarEl, tituloEl), acoesEl);
    const corpo = h("div", { class: E.painelConteudo });
    mount(panelEl, header, corpo);

    let atual: { onClose?: () => void } | null = null;
    let chaveAtual: string | null = null;   // item exibido (para não repetir a animação ao reabrir o mesmo)

    /* Ciclo de foco (auditoria de UI/UX 03/11, F04). Quem abriu o painel (a linha, o botão) recebe o foco de volta ao
       fechar: pelo próprio elemento ou, se a lista foi redesenhada, pelo data-fk/data-id dele. No celular (≤ 600 px) o
       painel cobre a tela inteira: o foco entra nele e a área coberta (barra e página) fica inert enquanto ele estiver
       aberto (Tab não chega a controles escondidos). Na gaveta parcial (≤ 1180 px) e no desktop a lista continua
       clicável ao lado, então nada fica inert. */
    const comoGaveta = window.matchMedia("(max-width: 600px)");
    let acionador: { el: HTMLElement; fk?: string; id?: string } | null = null;
    tituloEl.tabIndex = -1;                  // foco inicial da gaveta quando o conteúdo não pede outro (anuncia o título)
    function isolar() {
      const sim = !!atual && comoGaveta.matches;
      Array.from(workspaceEl.children).forEach((x) => { if (x !== panelEl) (x as HTMLElement).inert = sim; });
    }
    comoGaveta.addEventListener("change", isolar);
    function devolverFoco() {
      const a = acionador;
      acionador = null;
      if (!a) return;
      requestAnimationFrame(() => {          // depois do redesenho que o fechamento provoca
        const sel = (attr: string, v?: string) => (v ? workspaceEl.querySelector<HTMLElement>(`[${attr}="${CSS.escape(v)}"]`) : null);
        const alvo = a.el.isConnected ? a.el : sel("data-fk", a.fk) || sel("data-id", a.id);
        if (alvo && !panelEl.contains(document.activeElement)) alvo.focus();
      });
    }

    function vazio() {
      chaveAtual = null;
      tituloEl.textContent = "";
      tituloEl.hidden = true;            // sem item aberto: nenhum título vazio para o leitor de tela
      mount(voltarEl);
      mount(acoesEl);
      mount(corpo, h("div", { class: E.painelVazio },
        icon("lancamentos", { size: 26, class: E.painelVazioIcone }),
        h("p", null, "Selecione para ver detalhes")));
      workspaceEl.dataset.conteudo = "nao";
    }

    /** Limpa o conteúdo (o painel continua aberto, com o texto de orientação) */
    function close(opts?: { silencioso?: boolean }) {
      const anterior = atual;
      // o foco estava no painel (ou já caiu no body): volta para quem abriu
      const ativo = document.activeElement;
      const tinhaFoco = !!anterior && (panelEl.contains(ativo) || ativo === document.body || !ativo);
      atual = null;
      isolar();
      vazio();
      ZoZo.store.set({ detailPanelOpen: false, selectedItem: null });
      if (anterior && anterior.onClose && !(opts && opts.silencioso)) anterior.onClose();
      if (tinhaFoco) devolverFoco(); else acionador = null;
    }

    /**
     * open({ title, render(body, api), menu:[itens do ZoZo.menu], botoes:[{label, onClick}], selected, onClose })
     *   menu   → botão "⋯" que abre o menu suspenso (com submenus)
     *   botoes → botões de texto ao lado do "⋯" (ex.: "Editar orçamento")
     */
    function open(cfg: ConfigPainel): ApiPainel {
      const quem = document.activeElement;
      if (quem instanceof HTMLElement && quem !== document.body && !panelEl.contains(quem)) {
        acionador = { el: quem, fk: quem.dataset.fk, id: quem.dataset.id };
      }
      atual = { onClose: cfg.onClose };
      isolar();
      workspaceEl.dataset.conteudo = "sim";
      tituloEl.hidden = false;
      // Título: texto ou elemento (ex.: seletor do tipo de lançamento)
      if (cfg.tituloNode) mount(tituloEl, cfg.tituloNode); else tituloEl.textContent = cfg.title || "";
      // Seta "voltar": retorna ao conteúdo anterior sem trocar de página
      mount(voltarEl, cfg.voltar ? [UI.IconButton("seta-voltar", "Voltar", { onClick: cfg.voltar }), h("span", { class: E.divisorVoltar, "aria-hidden": "true" })] : null);
      // celular: rótulo curto; ≤ 360 px, com ícone, só o ícone (em 320 px o título e o botão se sobrepunham).
      // O nome acessível e o title continuam com o texto inteiro.
      const botoes: HTMLElement[] = (cfg.botoes || []).map((b) => h("button", { type: "button", class: b.primario ? E.botaoTextoPrimario : E.botaoTexto, onClick: b.onClick, disabled: b.desabilitado,
        "aria-label": b.rotuloCurto ? b.label : undefined, title: b.rotuloCurto && b.icone ? b.label : undefined },
        b.icone ? icon(b.icone, { size: 14, stroke: 2.25 }) : null,
        b.rotuloCurto ? [h("span", { class: "tw:celular:hidden" }, b.label),
          h("span", { class: b.icone ? "tw:hidden tw:celular:min-[361px]:inline" : "tw:hidden tw:celular:inline", "aria-hidden": "true" }, b.rotuloCurto)] : b.label));
      (cfg.acoes || []).forEach((a) => botoes.push(UI.IconButton(a.icone, a.rotulo, { class: a.perigo ? "icon-btn--danger" : null, onClick: a.onClick })));
      const itensMenu = (cfg.menu || []).filter((x): x is ItemMenu => !!x);
      if (itensMenu && itensMenu.length) {
        const btn = UI.IconButton("opcoes", "Mais opções", { expanded: false });
        btn.setAttribute("aria-haspopup", "menu");
        btn.addEventListener("click", () => ZoZo.menu.abrir(btn, itensMenu, { posicao: "direita", label: "Opções", checkEsquerda: true }));
        botoes.push(btn);
      }
      if (botoes.length) botoes.push(h("span", { class: E.divisor, "aria-hidden": "true" }));
      botoes.push(UI.IconButton("fechar", "Fechar painel", { onClick: () => close() }));
      mount(acoesEl, botoes);

      const rolagemAnterior = corpo.querySelector<HTMLElement>(".detail__body")?.scrollTop || 0;
      const chave = cfg.selected ? cfg.selected.tipo + ":" + cfg.selected.id : null;
      const mesmo = chave && chave === chaveAtual;
      chaveAtual = chave;
      // reabrir o mesmo item (salvar no lugar) não repete a animação de entrada
      const body = h("div", { class: mesmo ? E.painelCorpoEstatico : E.painelCorpo, role: "region", "aria-labelledby": "detail-title" });
      mount(corpo, body);
      const api: ApiPainel = { close, setTitle: (t: string) => { tituloEl.textContent = t; } };
      cfg.render(body, api);
      if (mesmo) body.scrollTop = rolagemAnterior;   // salvar no lugar não leva o painel de volta ao topo
      ZoZo.store.set({ detailPanelOpen: true, selectedItem: cfg.selected || null });
      requestAnimationFrame(() => {
        if (cfg.focus === false) return;
        const alvo = body.querySelector<HTMLElement>("[data-autofocus]");
        if (alvo) alvo.focus();
        // painel em tela cheia: o foco entra nele (senão ficaria na linha coberta, agora inert)
        else if (comoGaveta.matches && atual && !panelEl.contains(document.activeElement)) tituloEl.focus({ preventScroll: true });
      });
      return api;
    }

    vazio();
    return { open, close, isOpen: () => workspaceEl.dataset.conteudo === "sim" };
  }

  const api: ZoZoDetailPanel = { create };
  ZoZo.detailPanel = api;
})(window.ZoZo);
