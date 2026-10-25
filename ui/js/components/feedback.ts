/* =============================================================
   ZoZo — Toast · Modal · Confirmação de exclusão (seção 57)
   TypeScript: tipos em src/globais.d.ts (ZoZoFeedback).
   ============================================================= */
(function (ZoZo: ZoZoGlobal) {
  "use strict";
  const { h } = ZoZo.dom;
  const { icon } = ZoZo.icons;
  const { Button } = ZoZo.ui;

  /* ---------- Toast ---------- */
  function toast(mensagem: string, opts?: OpcoesAviso): void {
    const o = opts || {};
    const root = document.getElementById("toast-root");
    if (!root) return;
    const tone = o.tone || "default"; // default | success | aviso | error
    // Confirmações de ação ("Transação criada.", "Salvo"…) não aparecem: a própria tela já mostra o resultado.
    // Só erros e avisos que explicam por que algo NÃO aconteceu.
    // Exceção (importante): confirmação que a tela não mostra sozinha, como "Conta ativada com sucesso".
    const ok = tone === "success" && !!o.importante;
    if (tone !== "error" && tone !== "aviso" && !ok) return;
    const P = ZoZo.pecas;
    // por tom: erro vermelho, aviso laranja, sucesso verde (fundo claro e texto/ícone na cor do tom)
    const el = h("div", { class: tone === "error" ? P.avisoErro : ok ? P.avisoSucesso : P.aviso, role: tone === "error" ? "alert" : "status" },
      icon(ok ? "check" : "alerta", { size: 16, class: P.avisoIcone }),
      h("span", { class: P.avisoTexto }, mensagem));
    root.appendChild(el);
    requestAnimationFrame(() => el.classList.add("is-visible"));
    setTimeout(() => {
      el.classList.remove("is-visible");
      setTimeout(() => el.remove(), 250);
    }, o.duration || 3200);
  }

  /* ---------- Modal ----------
     Enquanto houver janela aberta, o resto da tela fica "inert" (sem foco, cliques nem leitor de tela),
     como na fatura. Janelas empilhadas: o estado anterior volta quando a última fecha. */
  let abertas = 0, inertAntes: boolean[] | null = null;
  const camadas: HTMLElement[] = [];
  // último elemento focado em cada janela: ao fechar a de cima, a de baixo recebe o foco de volta
  const ultimoFoco = new WeakMap<HTMLElement, HTMLElement>();
  const isolarJanelas = () => camadas.forEach((el, i) => { el.inert = i !== camadas.length - 1; });
  const FUNDO = ["auth-root", "shell", "boleto-root"];
  function isolarFundo(abrir: boolean) {
    if (abrir && abertas++ === 0) {
      inertAntes = FUNDO.map((id) => { const el = document.getElementById(id); return el ? el.inert : false; });
      FUNDO.forEach((id) => { const el = document.getElementById(id); if (el) el.inert = true; });
    } else if (!abrir && abertas > 0 && --abertas === 0 && inertAntes) {
      const antes = inertAntes;
      FUNDO.forEach((id, i) => { const el = document.getElementById(id); if (el) el.inert = antes[i]; });
      inertAntes = null;
    }
  }
  function modal(opts: OpcoesModal): JanelaModal {
    const o = opts || {};
    const root = document.getElementById("modal-root") || document.body;
    const anterior = document.activeElement as HTMLElement | null;
    const tituloId = ZoZo.dom.id("modal-titulo");
    let fechado = false;

    const fechar = (resultado?: unknown) => {
      if (fechado) return;
      fechado = true;
      camadas.splice(camadas.indexOf(overlay), 1);
      overlay.inert = true;
      isolarJanelas();
      isolarFundo(false);
      overlay.classList.remove("is-visible");
      document.removeEventListener("keydown", tecla, true);
      setTimeout(() => overlay.remove(), 180);
      // devolve o foco a quem abriu; se ele sumiu (ex.: item de menu) ou ficou atrás de outra janela,
      // volta para onde estava na janela que ficou por cima
      const topo = camadas[camadas.length - 1];
      if (anterior && anterior.isConnected && anterior.focus && (!topo || topo.contains(anterior))) anterior.focus();
      else if (topo) { const f = ultimoFoco.get(topo); (f && f.isConnected ? f : topo.querySelector<HTMLElement>("[role=dialog], [role=alertdialog]"))?.focus(); }
      if (o.onClose) o.onClose(resultado);
    };

    // Visual em Tailwind (components/estrutura.ts). O tipo vem das classes modal--x (que ficam como ganchos)
    const E = ZoZo.estrutura;
    const tem = (c: string) => String(o.class || "").split(/\s+/).includes(c);
    const tipo = tem("modal--confirm") ? "Confirmacao" : tem("modal--settings") ? "Config" : tem("modal--dividir") ? "Dividir" : tem("modal--zm") ? "Janela" : "";
    // ex.: modalTopoConfirmacao, senão modalTopo; a divisão é uma janela de criação (corpo igual ao das janelas)
    const parte = (nome: string) => E[nome + tipo] || (tipo === "Dividir" && E[nome + "Janela"]) || E[nome];
    // título centralizado em CAIXA ALTA (o da divisão), também em janelas comuns que pedirem (modal--titulo-central)
    const tituloCentral = tem("modal--titulo-central");
    const dialog = h("div", { class: [E["modal" + (tipo || "Padrao")], o.class], role: o.alert ? "alertdialog" : "dialog", tabindex: "-1", "aria-modal": "true", "aria-labelledby": tituloId },
      h("div", { class: tituloCentral ? E.modalTopoDividir : parte("modalTopo") },     // div: <header> aqui viraria um 2º "banner"
        h("h2", { class: tituloCentral ? E.modalTituloDividir : parte("modalTitulo"), id: tituloId }, o.title || ""),
        h("button", { type: "button", class: ZoZo.pecasFn.botaoIcone(), "aria-label": "Fechar", onClick: () => fechar(false) }, icon("fechar"))),
      h("div", { class: parte("modalCorpo") }, o.body || null),
      o.actions ? h("footer", { class: tipo === "Confirmacao" ? E.modalRodapeConfirmacao : E.modalRodape }, o.actions(fechar)) : null);

    const overlay: HTMLElement = h("div", { class: E.modalFundo, onMousedown: (e: MouseEvent) => { if (e.target === overlay) fechar(false); } }, dialog);

    const tecla = (e: KeyboardEvent) => {
      // Só a janela do topo responde (janelas empilhadas)
      if (camadas.at(-1) !== overlay) return;
      // Com um menu suspenso aberto, o Esc fecha só o menu (não a janela e o que estava sendo editado)
      // Camada por cima aberta (menu ou seletor de emoji): o Esc fecha só ela, não a janela de trás
      if ((e.key === "Escape" || e.key === "Tab") && document.querySelector(".menu, .emoji-pop.is-aberto")) return;
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); fechar(false); }
      if (e.key === "Tab") {
        // só o que dá para focar de verdade (visível e habilitado)
        const foc = Array.from(dialog.querySelectorAll<HTMLElement>("button, input, select, textarea, a[href], area[href], [contenteditable='true'], [tabindex]:not([tabindex='-1'])"))
          .filter((x) => !(x as HTMLButtonElement).disabled && !x.hidden && x.getClientRects().length > 0 && x.getAttribute("tabindex") !== "-1");
        if (!foc.length) { e.preventDefault(); dialog.focus(); return; }
        const first = foc[0], last = foc[foc.length - 1];
        if (!dialog.contains(document.activeElement) || document.activeElement === dialog) { e.preventDefault(); (e.shiftKey ? last : first).focus(); }
        else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", tecla, true);
    overlay.addEventListener("focusin", (e) => { ultimoFoco.set(overlay, e.target as HTMLElement); });
    root.appendChild(overlay);
    camadas.push(overlay);
    isolarJanelas();
    isolarFundo(true);
    requestAnimationFrame(() => {
      if (fechado || camadas.at(-1) !== overlay) return;
      overlay.classList.add("is-visible");
      const alvo = dialog.querySelector<HTMLElement>("[data-autofocus]:not(:disabled)") || dialog.querySelector<HTMLElement>("footer button:not(:disabled)") || dialog.querySelector<HTMLElement>("button:not(:disabled)") || dialog;
      alvo.focus();
    });
    return { fechar };
  }

  /** Confirmação (exclusão por padrão) → Promise<boolean>. opts: { confirmar, cancelar, variante } */
  function confirmarExclusao(titulo: string, mensagem: string, opts?: OpcoesConfirmacao): Promise<boolean> {
    const o = opts || {};
    return new Promise<boolean>((resolve) => {
      modal({
        title: titulo,
        alert: true,
        class: "modal--confirm",
        body: h("p", { class: ZoZo.estrutura.modalTextoConfirmacao }, mensagem),
        onClose: (r) => resolve(!!r),
        actions: (fechar: (r?: unknown) => void) => [
          Button(o.cancelar || "Cancelar", { variant: "secondary", onClick: () => fechar(false) }),
          Button(o.confirmar || "Excluir", { variant: o.variante || "danger", onClick: () => fechar(true) }),
        ],
      });
    });
  }

  const api: ZoZoFeedback = { toast, modal, confirmarExclusao };
  ZoZo.feedback = api;
})(window.ZoZo);
