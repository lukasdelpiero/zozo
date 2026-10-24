/* =============================================================
   ZoZo — Edição no lugar (painéis)
   texto() · dinheiro(): clique, edite e saia do campo para salvar
   corDot(): bolinha que abre a paleta 4×4
   TypeScript: tipos em src/globais.d.ts (ZoZoInline).
   ============================================================= */
(function (ZoZo: ZoZoGlobal) {
  "use strict";
  const { h } = ZoZo.dom;
  const F = ZoZo.format;

  /** Campo de texto que salva ao sair (Enter também). aoSalvar(v) → Promise; em erro, volta ao valor anterior */
  function texto(cfg: CampoTextoNoLugar): HTMLInputElement {
    let atual = cfg.valor || "";
    const input = h("input", { type: "text", class: [ZoZo.pecas.noLugar, cfg.classe], value: atual, placeholder: cfg.placeholder || "", maxlength: String(cfg.max || 80), "aria-label": cfg.rotulo || "Editar" }) as HTMLInputElement;
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); input.blur(); } if (e.key === "Escape") { input.value = atual; input.blur(); } });
    input.addEventListener("blur", () => {
      const v = input.value.trim();
      if (!v) { input.value = atual; return; }
      if (v === atual) return;
      const antes = atual; atual = v;
      Promise.resolve(cfg.aoSalvar(v)).catch((e: ErroPonte | undefined) => { atual = antes; input.value = antes; ZoZo.feedback.toast((e && e.friendly) || ZoZo.messages.FRIENDLY.OPERATION_FAILED, { tone: "error" }); });
    });
    return input;
  }

  /** Valor em reais que salva ao sair */
  function dinheiro(cfg: CampoValorNoLugar): HTMLInputElement {
    let atual = F.numero(cfg.valor);
    // editando, o símbolo da moeda continua na frente do valor (data-com-simbolo: ver format.mascararValor)
    const input = h("input", { type: "text", inputmode: "decimal", class: [ZoZo.pecas.noLugar, ZoZo.pecas.noLugarValor, "money", cfg.classe], value: F.moeda(atual),
      "data-com-simbolo": "", "aria-label": cfg.rotulo || "Valor" }) as HTMLInputElement;
    // ao clicar para editar o cursor vai para o fim (nada selecionado; Backspace apaga o último dígito)
    input.addEventListener("focus", () => { input.value = F.valorParaEditar(input, atual); F.cursorNoFim(input); });
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); input.blur(); } if (e.key === "Escape") { input.value = F.valorParaEditar(input, atual); input.blur(); } });
    input.addEventListener("blur", () => {
      const v = F.parseMoeda(input.value);
      const valido = Number.isFinite(v) && (cfg.permitirNegativo || v >= 0) && (cfg.permitirZero !== false || v > 0) && Math.abs(v) < 1e12;
      if (valido && Math.round(v * 100) !== Math.round(atual * 100)) {
        const antes = atual; atual = Math.round(v * 100) / 100;
        Promise.resolve(cfg.aoSalvar(atual)).catch((e: ErroPonte | undefined) => { atual = antes; input.value = F.moeda(antes); ZoZo.feedback.toast((e && e.friendly) || ZoZo.messages.FRIENDLY.OPERATION_FAILED, { tone: "error" }); });
      }
      input.value = F.moeda(atual);
    });
    return input;
  }

  /**
   * Valor que se edita como o da transação (exibido como texto; clicou, apaga e digita), mas que só é
   * gravado quando a tela pede (ex.: "Salvar orçamento"): ler() devolve o número e definir() troca o valor.
   */
  function dinheiroCampo(cfg: { valor: unknown; rotulo: string; classe?: string; aoEnter?: () => void }): { el: HTMLInputElement; ler(): number; definir(v: unknown): void } {
    let atual = F.numero(cfg.valor);
    const input = h("input", { type: "text", inputmode: "decimal", class: [ZoZo.pecas.noLugar, ZoZo.pecas.noLugarValor, "money", cfg.classe], value: F.moeda(atual),
      "data-com-simbolo": "", "aria-label": cfg.rotulo }) as HTMLInputElement;
    input.addEventListener("focus", () => { input.value = F.valorParaEditar(input, atual); F.cursorNoFim(input); });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); input.blur(); if (cfg.aoEnter) cfg.aoEnter(); }
      if (e.key === "Escape") { input.value = F.valorParaEditar(input, atual); input.blur(); }
    });
    input.addEventListener("blur", () => {
      const v = F.parseMoeda(input.value);
      if (Number.isFinite(v) && v >= 0 && v < 1e12) { atual = Math.round(v * 100) / 100; input.removeAttribute("aria-invalid"); }
      input.value = F.moeda(atual);
    });
    return {
      el: input,
      ler: () => (document.activeElement === input ? F.parseMoeda(input.value) : atual),
      definir(v: unknown) { atual = F.numero(v); input.value = F.moeda(atual); },
    };
  }

  /** Bolinha de cor que abre a paleta 4×4 */
  function corDot(cor: unknown, aoMudar: (cor: string) => void): HTMLElement {
    let atual = F.cor(cor, "#6078a9") || "#6078a9";
    const btn = h("button", { type: "button", class: ZoZo.pecas.pontoCor, style: { "--dot": atual }, "aria-label": "Alterar cor", "aria-haspopup": "menu" });
    btn.addEventListener("click", () => ZoZo.menu.abrir(btn, { largura: 184, render(el: HTMLElement, api: { fechar(): void }) {
      ZoZo.dom.mount(el, h("div", { class: ZoZo.pecas.pontoCorMenu }, ZoZo.ui.ColorPicker(atual, (c: string) => {
        atual = c; btn.style.setProperty("--dot", c); api.fechar(); aoMudar(c);
      }, { colunas: 4, label: "Cor", cheio: true, altura: 40 })));
    } }, { posicao: "esquerda", largura: 184, label: "Cores" }));
    return btn;
  }

  const api: ZoZoInline = { texto, dinheiro, dinheiroCampo, corDot };
  ZoZo.inline = api;
})(window.ZoZo);
