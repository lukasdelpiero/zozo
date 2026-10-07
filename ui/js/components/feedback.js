/* =============================================================
   ZoZo — Toast · Modal · Confirmação de exclusão (seção 57)
   ============================================================= */
(function (ZoZo) {
  "use strict";
  const { h } = ZoZo.dom;
  const { icon } = ZoZo.icons;
  const { Button } = ZoZo.ui;

  /* ---------- Toast ---------- */
  function toast(mensagem, opts) {
    const o = opts || {};
    const root = document.getElementById("toast-root");
    if (!root) return;
    const tone = o.tone || "default"; // default | success | error
    const el = h("div", { class: ["toast", "toast--" + tone], role: tone === "error" ? "alert" : "status" },
      icon(tone === "error" ? "alerta" : "check", { size: 16, class: "toast__icon" }),
      h("span", { class: "toast__text" }, mensagem));
    root.appendChild(el);
    requestAnimationFrame(() => el.classList.add("is-visible"));
    setTimeout(() => {
      el.classList.remove("is-visible");
      setTimeout(() => el.remove(), 250);
    }, o.duration || 3200);
  }

  /* ---------- Modal ---------- */
  function modal(opts) {
    const o = opts || {};
    const root = document.getElementById("modal-root");
    const anterior = document.activeElement;
    const tituloId = ZoZo.dom.id("modal-titulo");
    let fechado = false;

    const fechar = (resultado) => {
      if (fechado) return;
      fechado = true;
      overlay.classList.remove("is-visible");
      document.removeEventListener("keydown", tecla, true);
      setTimeout(() => overlay.remove(), 180);
      if (anterior && anterior.focus) anterior.focus();
      if (o.onClose) o.onClose(resultado);
    };

    const dialog = h("div", { class: ["modal", o.class], role: o.alert ? "alertdialog" : "dialog", "aria-modal": "true", "aria-labelledby": tituloId },
      h("header", { class: "modal__header" },
        h("h2", { class: "modal__title", id: tituloId }, o.title || ""),
        h("button", { type: "button", class: "icon-btn", "aria-label": "Fechar", onClick: () => fechar(false) }, icon("fechar"))),
      h("div", { class: "modal__body" }, o.body || null),
      o.actions ? h("footer", { class: "modal__footer" }, o.actions(fechar)) : null);

    const overlay = h("div", { class: "modal-overlay", onMousedown: (e) => { if (e.target === overlay) fechar(false); } }, dialog);

    const tecla = (e) => {
      // Só a janela do topo responde (janelas empilhadas)
      if (overlay.parentNode && overlay !== overlay.parentNode.lastElementChild) return;
      // Com um menu suspenso aberto, o Esc fecha só o menu (não a janela e o que estava sendo editado)
      if (e.key === "Escape" && document.querySelector(".menu")) return;
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); fechar(false); }
      if (e.key === "Tab") {
        const foc = dialog.querySelectorAll("button, input, select, textarea, [tabindex]:not([tabindex='-1'])");
        if (!foc.length) return;
        const first = foc[0], last = foc[foc.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", tecla, true);
    root.appendChild(overlay);
    requestAnimationFrame(() => {
      overlay.classList.add("is-visible");
      const alvo = dialog.querySelector("[data-autofocus]") || dialog.querySelector(".modal__footer button");
      if (alvo) alvo.focus();
    });
    return { fechar };
  }

  /** Confirmação (exclusão por padrão) → Promise<boolean>. opts: { confirmar, cancelar, variante } */
  function confirmarExclusao(titulo, mensagem, opts) {
    const o = opts || {};
    return new Promise((resolve) => {
      modal({
        title: titulo,
        alert: true,
        class: "modal--confirm",
        body: h("p", { class: "modal__text" }, mensagem),
        onClose: (r) => resolve(!!r),
        actions: (fechar) => [
          Button(o.cancelar || "Cancelar", { variant: "secondary", onClick: () => fechar(false) }),
          Button(o.confirmar || "Excluir", { variant: o.variante || "danger", onClick: () => fechar(true) }),
        ],
      });
    });
  }

  ZoZo.feedback = { toast, modal, confirmarExclusao };
})(window.ZoZo);
