/* =============================================================
   ZoZo — Verificação: CAPTCHA (Turnstile), código de 6 dígitos e QR code
   ------------------------------------------------------------
   • Captcha(sitekey): widget do Cloudflare Turnstile. O script só é
     carregado quando o CAPTCHA é exigido (4ª tentativa de login em diante
     e cadastro). A validação de verdade acontece no servidor.
   • CampoCodigo(cfg): seis caixas de um dígito (avança sozinho, aceita
     colar o código inteiro, Backspace volta) → cfg.onCompleto(codigo).
   • QR(texto, px): QR code em SVG montado com ZoZo.dom (sem innerHTML),
     usando a biblioteca local js/vendor/qrcode-generator.js.
   ============================================================= */
(function (ZoZo) {
  "use strict";
  const { h, s, mount } = ZoZo.dom;
  const TURNSTILE_JS = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

  /* ---------------- CAPTCHA ---------------- */
  let carregando = null;
  function carregarTurnstile() {
    if (window.turnstile) return Promise.resolve(window.turnstile);
    if (!carregando) {
      carregando = new Promise((ok, falha) => {
        const sc = document.createElement("script");
        sc.src = TURNSTILE_JS; sc.async = true;
        sc.onload = () => (window.turnstile ? ok(window.turnstile) : falha(new Error("turnstile")));
        sc.onerror = () => { carregando = null; sc.remove(); falha(new Error("turnstile")); };
        document.head.appendChild(sc);
      });
    }
    return carregando;
  }

  function Captcha(sitekey) {
    const el = h("div", { class: "captcha", "aria-live": "polite" });
    let token = "", id = null;
    carregarTurnstile().then((ts) => {
      requestAnimationFrame(() => {                    // espera o elemento estar na página
        id = ts.render(el, {
          sitekey, language: "pt-br", appearance: "always", "refresh-expired": "auto",
          callback: (t) => { token = t; },
          "expired-callback": () => { token = ""; },
          "error-callback": () => { token = ""; },
        });
      });
    }).catch(() => mount(el, h("p", { class: "auth__error", role: "alert" }, "Não foi possível carregar a verificação anti-robô. Recarregue a página.")));
    return {
      el,
      token: () => token,
      reset() { token = ""; if (id !== null && window.turnstile) { try { window.turnstile.reset(id); } catch (e) { /* ok */ } } },
    };
  }

  /* ---------------- Código de 6 dígitos ---------------- */
  function CampoCodigo(cfg) {
    const c = cfg || {};
    const caixas = Array.from({ length: 6 }, (_, i) => h("input", {
      type: "text", inputmode: "numeric", pattern: "[0-9]*", maxlength: "1", class: ["codigo6__caixa", c.classeCaixa],
      autocomplete: i === 0 ? "one-time-code" : "off", "aria-label": "Dígito " + (i + 1) + " de 6",
    }));
    const el = h("div", { class: "codigo6", role: "group", "aria-label": c.rotulo || "Código de 6 dígitos" }, caixas);
    const valor = () => caixas.map((x) => x.value).join("");
    const conferir = () => { const v = valor(); if (/^\d{6}$/.test(v) && c.onCompleto) c.onCompleto(v); };
    function preencher(inicio, texto) {
      const d = String(texto || "").replace(/\D/g, "").slice(0, 6 - inicio);
      d.split("").forEach((ch, k) => { caixas[inicio + k].value = ch; });
      caixas[Math.min(inicio + d.length, 5)].focus();
      conferir();
    }
    caixas.forEach((cx, i) => {
      cx.addEventListener("input", () => {
        const d = cx.value.replace(/\D/g, "");
        if (d.length > 1) { cx.value = ""; preencher(i, d); return; }      // autocompletar do celular
        cx.value = d;
        if (d && i < 5) caixas[i + 1].focus();
        if (c.onDigitar) c.onDigitar();
        conferir();
      });
      cx.addEventListener("keydown", (e) => {
        if (e.key === "Backspace" && !cx.value && i > 0) { e.preventDefault(); caixas[i - 1].value = ""; caixas[i - 1].focus(); }
        else if (e.key === "ArrowLeft" && i > 0) { e.preventDefault(); caixas[i - 1].focus(); }
        else if (e.key === "ArrowRight" && i < 5) { e.preventDefault(); caixas[i + 1].focus(); }
      });
      cx.addEventListener("paste", (e) => { e.preventDefault(); preencher(i, (e.clipboardData && e.clipboardData.getData("text")) || ""); });
      cx.addEventListener("focus", () => cx.select());
    });
    return {
      el, valor,
      limpar() { caixas.forEach((x) => { x.value = ""; }); caixas[0].focus(); },
      foco() { caixas[0].focus(); },
      desabilitar(v) { caixas.forEach((x) => { x.disabled = !!v; }); el.classList.toggle("is-ocupado", !!v); },
      marcarErro(v) { el.classList.toggle("is-erro", !!v); },
    };
  }

  /* ---------------- QR code ---------------- */
  /** QR em SVG com a margem recomendada (4 módulos brancos). rotulo: o que o código é (leitor de tela) */
  function QR(texto, px, rotulo) {
    const q = window.qrcode(0, "M");
    q.addData(texto);
    q.make();
    const n = q.getModuleCount(), borda = 4, total = n + borda * 2;
    let d = "";
    for (let r = 0; r < n; r++) {
      for (let col = 0; col < n; col++) if (q.isDark(r, col)) d += "M" + (col + borda) + " " + (r + borda) + "h1v1h-1z";
    }
    return s("svg", { class: "qr", viewBox: "0 0 " + total + " " + total, width: String(px || 176), height: String(px || 176),
      role: "img", "aria-label": rotulo || "Código QR para o aplicativo autenticador", "shape-rendering": "crispEdges" },
      s("rect", { width: String(total), height: String(total), fill: "#ffffff" }),
      s("path", { d, fill: "#0f2742" }));
  }

  /* ---------------- Senha: oculta por padrão, com "mostrar", e sem copiar ----------------
     Copiar/recortar/arrastar ficam bloqueados (inclusive com a senha visível), para a senha
     não parar na área de transferência. Colar continua permitido (gerenciadores de senha). */
  function protegerSenha(input) {
    ["copy", "cut", "dragstart"].forEach((ev) => input.addEventListener(ev, (e) => e.preventDefault()));
    input.setAttribute("autocapitalize", "off");
    input.setAttribute("autocorrect", "off");
    input.spellcheck = false;
    return input;
  }

  /** Envolve um <input type="password"> com o botão de mostrar/ocultar */
  function ComRevelar(input, classe) {
    protegerSenha(input);
    const btn = h("button", { type: "button", class: "input-reveal", "aria-label": "Mostrar senha", "aria-pressed": "false", title: "Mostrar senha" },
      ZoZo.icons.icon("olho", { size: 16 }));
    btn.addEventListener("click", () => {
      const visivel = input.type === "text";
      input.type = visivel ? "password" : "text";
      btn.setAttribute("aria-pressed", String(!visivel));
      btn.setAttribute("aria-label", visivel ? "Mostrar senha" : "Ocultar senha");
      btn.title = visivel ? "Mostrar senha" : "Ocultar senha";
      mount(btn, ZoZo.icons.icon(visivel ? "olho" : "olho-fechado", { size: 16 }));
      input.focus();
    });
    return h("div", { class: ["input-with-action", classe] }, input, btn);
  }

  ZoZo.verificacao = { Captcha, CampoCodigo, QR, protegerSenha, ComRevelar };
})(window.ZoZo);
