/* =============================================================
   ZoZo — Edição no lugar (painéis)
   texto() · dinheiro(): clique, edite e saia do campo para salvar
   corDot(): bolinha que abre a paleta 4×4
   ============================================================= */
(function (ZoZo) {
  "use strict";
  const { h } = ZoZo.dom;
  const F = ZoZo.format;

  /** Campo de texto que salva ao sair (Enter também). aoSalvar(v) → Promise; em erro, volta ao valor anterior */
  function texto(cfg) {
    let atual = cfg.valor || "";
    const input = h("input", { type: "text", class: [ZoZo.pecas.noLugar, cfg.classe], value: atual, placeholder: cfg.placeholder || "", maxlength: String(cfg.max || 80), "aria-label": cfg.rotulo || "Editar" });
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); input.blur(); } if (e.key === "Escape") { input.value = atual; input.blur(); } });
    input.addEventListener("blur", () => {
      const v = input.value.trim();
      if (!v) { input.value = atual; return; }
      if (v === atual) return;
      const antes = atual; atual = v;
      Promise.resolve(cfg.aoSalvar(v)).catch((e) => { atual = antes; input.value = antes; ZoZo.feedback.toast((e && e.friendly) || ZoZo.messages.FRIENDLY.OPERATION_FAILED, { tone: "error" }); });
    });
    return input;
  }

  /** Valor em reais que salva ao sair */
  function dinheiro(cfg) {
    let atual = F.numero(cfg.valor);
    // editando, o símbolo da moeda continua na frente do valor (data-com-simbolo: ver format.mascararValor)
    const input = h("input", { type: "text", inputmode: "decimal", class: [ZoZo.pecas.noLugar, ZoZo.pecas.noLugarValor, "money", cfg.classe], value: F.moeda(atual),
      "data-com-simbolo": "", "aria-label": cfg.rotulo || "Valor" });
    // ao clicar para editar o cursor vai para o fim (nada selecionado; Backspace apaga o último dígito)
    input.addEventListener("focus", () => { input.value = F.valorParaEditar(input, atual); F.cursorNoFim(input); });
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); input.blur(); } if (e.key === "Escape") { input.value = F.valorParaEditar(input, atual); input.blur(); } });
    input.addEventListener("blur", () => {
      const v = F.parseMoeda(input.value);
      const valido = Number.isFinite(v) && (cfg.permitirNegativo || v >= 0) && (cfg.permitirZero !== false || v > 0) && Math.abs(v) < 1e12;
      if (valido && Math.round(v * 100) !== Math.round(atual * 100)) {
        const antes = atual; atual = Math.round(v * 100) / 100;
        Promise.resolve(cfg.aoSalvar(atual)).catch((e) => { atual = antes; input.value = F.moeda(antes); ZoZo.feedback.toast((e && e.friendly) || ZoZo.messages.FRIENDLY.OPERATION_FAILED, { tone: "error" }); });
      }
      input.value = F.moeda(atual);
    });
    return input;
  }

  /** Bolinha de cor que abre a paleta 4×4 */
  function corDot(cor, aoMudar) {
    let atual = F.cor(cor, "#6078a9");
    const btn = h("button", { type: "button", class: ZoZo.pecas.pontoCor, style: { "--dot": atual }, "aria-label": "Alterar cor", "aria-haspopup": "menu" });
    btn.addEventListener("click", () => ZoZo.menu.abrir(btn, { largura: 184, render(el, api) {
      ZoZo.dom.mount(el, h("div", { class: ZoZo.pecas.pontoCorMenu }, ZoZo.ui.ColorPicker(atual, (c) => {
        atual = c; btn.style.setProperty("--dot", c); api.fechar(); aoMudar(c);
      }, { colunas: 4, label: "Cor", cheio: true, altura: 40 })));
    } }, { posicao: "esquerda", largura: 184, label: "Cores" }));
    return btn;
  }

  ZoZo.inline = { texto, dinheiro, corDot };
})(window.ZoZo);
