/* =============================================================
   ZoZo — Formulário de cadastro no painel de detalhes
   ------------------------------------------------------------
   ZoZo.forms.abrir(ctx, {
     titulo, selected,
     campos: [{ nome, rotulo, tipo, obrigatorio, opcoes, mostrarSe(valores), dica, max }],
       tipos: texto | email | senha | dinheiro | digitos4 | selecao | cor | emoji | lista (datalist)
     valores: {...},
     validar(valores) → "mensagem" | null,
     salvar(valores) → Promise,  textoSalvar,
     excluir: { rotulo, titulo, mensagem, acao() → Promise } | null,
     aviso: "texto exibido acima do formulário" (opcional)
   })
   ============================================================= */
(function (ZoZo) {
  "use strict";
  const { h, mount, id: uid } = ZoZo.dom;
  const { icon } = ZoZo.icons;
  const UI = ZoZo.ui;
  const F = ZoZo.format;


  function controle(campo, valor, aoMudar) {
    const t = campo.tipo || "texto";
    if (t === "selecao") {
      const sel = UI.Select(campo.opcoes, { name: campo.nome, value: valor === undefined || valor === null ? "" : String(valor) });
      sel.addEventListener("change", aoMudar);
      return { el: sel, ler: () => sel.value, foco: sel };
    }
    if (t === "cor") {
      let atual = F.cor(valor, ZoZo.regras.paleta[9]);
      const wrap = h("div", { class: "color-field" });
      const desenhar = () => mount(wrap, UI.ColorPicker(atual, (c) => { atual = c; desenhar(); aoMudar(); }, { label: campo.rotulo }));
      desenhar();
      return { el: wrap, ler: () => atual, foco: null, semLabelFor: true };
    }
    if (t === "emoji") {
      let atual = valor || "📦";
      const btn = h("button", { type: "button", class: ZoZo.pecas.iconeEscolha, "aria-label": "Escolher ícone", "aria-haspopup": "dialog" }, atual);
      btn.addEventListener("click", () => ZoZo.emojiPicker.abrir(btn, { atual, aoEscolher: (e) => { atual = e; btn.textContent = e; aoMudar(); } }));
      return { el: h("div", { class: "emoji-field" }, btn), ler: () => atual, foco: btn, input: btn };
    }
    if (t === "dinheiro") {
      const input = UI.Input({ name: campo.nome, inputmode: "decimal", placeholder: "0,00", value: valor === undefined || valor === null || valor === "" ? "" : F.moedaEditavel(valor) });
      if (F.numero(valor) < 0) input.value = "-" + input.value;
      input.addEventListener("input", aoMudar);
      return { el: input, ler: () => F.parseMoeda(input.value), foco: input, input, prefixo: F.simbolo() };
    }
    const input = UI.Input({
      name: campo.nome, value: valor || "",
      type: t === "email" ? "email" : t === "senha" ? "password" : "text",
      autocomplete: t === "senha" ? (campo.autocomplete || "current-password") : t === "email" ? "email" : "off",
      inputmode: t === "digitos4" ? "numeric" : undefined,
      placeholder: campo.placeholder,
    });
    if (t === "digitos4") { input.maxLength = 4; input.pattern = "\\d{4}"; }
    else input.maxLength = campo.max || 120;
    if (t === "lista" && campo.opcoes && campo.opcoes.length) {
      const listId = uid("lista");
      input.setAttribute("list", listId);
      const dl = h("datalist", { id: listId }, campo.opcoes.map((o) => h("option", { value: o })));
      input.addEventListener("input", aoMudar);
      return { el: h("div", null, input, dl), ler: () => input.value.trim(), foco: input, input };
    }
    input.addEventListener("input", aoMudar);
    return { el: input, ler: () => (t === "senha" ? input.value : input.value.trim()), foco: input, input };
  }

  /** cfg.voltar: aberto a partir de outro painel → seta e "Cancelar" voltam para ele, e salvar também
      (com os dados já atualizados) em vez de fechar o painel */
  function abrir(ctx, cfg) {
    return ctx.detail.open({
      title: cfg.titulo,
      selected: cfg.selected || null,
      voltar: cfg.voltar || null,
      render(body, api) {
        const valores = Object.assign({}, cfg.valores || {});
        const itens = [];
        let atualizar = () => {};

        cfg.campos.forEach((campo, i) => {
          const c = controle(campo, valores[campo.nome], () => { valores[campo.nome] = c.ler(); atualizar(); });
          const controlId = uid("f");
          if (c.foco) c.foco.id = controlId;
          if (i === 0 && c.foco) c.foco.dataset.autofocus = "";
          const conteudo = c.prefixo
            ? h("div", { class: ZoZo.pecas.afixo }, h("span", { class: ZoZo.pecas.prefixo, "aria-hidden": "true" }, c.prefixo), c.el)
            : c.el;
          const wrap = h("div", { class: ZoZo.pecas.campo },
            c.semLabelFor ? h("span", { class: ZoZo.pecas.campoRotulo }, campo.rotulo) : h("label", { class: ZoZo.pecas.campoRotulo, for: controlId }, campo.rotulo),
            conteudo,
            campo.dica ? h("p", { class: ZoZo.pecas.campoDica }, campo.dica) : null);
          itens.push({ campo, c, wrap });
          valores[campo.nome] = c.ler();
        });

        atualizar = () => itens.forEach(({ campo, wrap }) => { wrap.hidden = campo.mostrarSe ? !campo.mostrarSe(valores) : false; });
        atualizar();

        const erroEl = h("div", { class: ZoZo.pecas.erroForm, role: "alert" });
        const salvar = h("button", { type: "submit", class: ZoZo.pecas.botaoPrimario }, icon("check", { size: 16 }), h("span", { class: ZoZo.pecas.rotuloBotao }, cfg.textoSalvar || "Salvar"));

        const form = h("form", { class: "entity-form", novalidate: true },
          cfg.aviso ? h("p", { class: ["form-notice", cfg.avisoPerigo && "form-notice--danger"] }, icon("alerta", { size: 16 }), h("span", null, cfg.aviso)) : null,
          h("div", { class: ZoZo.pecas.painelGrade }, itens.map((x) => x.wrap)),
          erroEl,
          h("footer", { class: ZoZo.pecas.painelRodape },
            cfg.excluir ? UI.Button(cfg.excluir.rotulo || "Excluir", { variant: "danger-ghost", icon: "excluir", onClick: excluir }) : h("span"),
            h("div", { class: ZoZo.pecas.painelRodapeFim }, UI.Button("Cancelar", { onClick: () => (cfg.voltar ? cfg.voltar() : cfg.aoCancelar ? cfg.aoCancelar() : api.close()) }), salvar)));

        function excluir() {
          ZoZo.feedback.confirmarExclusao(cfg.excluir.titulo, cfg.excluir.mensagem).then((ok) => {
            if (!ok) return;
            cfg.excluir.acao().then(() => api.close({ silencioso: true })).catch((e) => ctx.toast(e.friendly || ZoZo.messages.FRIENDLY.OPERATION_FAILED, { tone: "error" }));
          });
        }

        form.addEventListener("submit", (e) => {
          e.preventDefault();
          itens.forEach(({ c }) => c.input && c.input.removeAttribute("aria-invalid"));
          const faltando = itens.filter(({ campo, c, wrap }) => {
            if (wrap.hidden || !campo.obrigatorio) return false;
            const v = c.ler();
            return v === "" || v === null || (typeof v === "number" && !Number.isFinite(v));
          });
          if (faltando.length) {
            faltando.forEach(({ c }) => c.input && c.input.setAttribute("aria-invalid", "true"));
            erroEl.textContent = "Preencha os campos obrigatórios: " + faltando.map((x) => x.campo.rotulo).join(", ") + ".";
            if (faltando[0].c.foco) faltando[0].c.foco.focus();
            return;
          }
          const dados = {};
          itens.forEach(({ campo, c, wrap }) => { dados[campo.nome] = wrap.hidden ? null : c.ler(); });
          const msg = cfg.validar ? cfg.validar(dados) : null;
          if (msg) { erroEl.textContent = msg; return; }
          erroEl.textContent = "";
          salvar.disabled = true; salvar.classList.add("is-busy");
          Promise.resolve(cfg.salvar(dados)).then(() => {
            if (cfg.voltar) cfg.voltar();
            else if (!cfg.manterAberto) api.close({ silencioso: true });
          }).catch((err) => {
            erroEl.textContent = (err && err.friendly) || ZoZo.messages.FRIENDLY.OPERATION_FAILED;
          }).finally(() => { if (salvar.isConnected) { salvar.disabled = false; salvar.classList.remove("is-busy"); } });
        });

        mount(body, form);
      },
    });
  }

  ZoZo.forms = { abrir };
})(window.ZoZo);
