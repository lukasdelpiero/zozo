/* =============================================================
   ZoZo — Criação de boleto (seção 49)
   BoletoEditor · BoletoTransactionList · BoletoAdjustments
   BoletoSummary · BoletoPreview · BoletoPrint
   ============================================================= */
(function (ZoZo) {
  "use strict";
  const { h, mount, clear } = ZoZo.dom;
  const { icon } = ZoZo.icons;
  const UI = ZoZo.ui;
  const F = ZoZo.format;
  const A = ZoZo.messages.ACTIONS;
  const R = () => ZoZo.regras.boleto;

  let atual = null; // instância aberta

  /* ---------------- Cálculo (regras configuráveis em js/config/regras.js) ---------------- */
  function sinalDoTipo(tipo) {
    const s = R().sinalPorTipo[tipo];
    return s === undefined ? 1 : s;
  }
  function calcular(st) {
    const lanc = (st.lancamentos || []).reduce((s, l) => s + F.numero(l.valor) * sinalDoTipo(l.tipo), 0);
    const desc = st.descontos.reduce((s, d) => s + Math.abs(F.numero(d.valor)), 0);
    const arr = st.arredondamentos.reduce((s, d) => s + F.numero(d.valor), 0);
    const descAplicado = desc * R().sinalDesconto;
    const arrAplicado = arr * R().sinalArredondamento;
    const r2 = (n) => Math.round(n * 100) / 100;
    return { lancamentos: r2(lanc), descontos: r2(descAplicado), arredondamentos: r2(arrAplicado), total: r2(lanc + descAplicado + arrAplicado) };
  }

  /** Valor com sinal explícito para o resumo e o documento */
  function comSinal(n) {
    const v = F.numero(n);
    return (v < 0 ? "− " : "") + F.moeda(v);
  }

  /* ---------------- BoletoTransactionList ---------------- */
  function BoletoTransactionList(st) {
    if (st.carregando) return UI.Skeleton(4, { short: true });
    if (st.erro) return UI.ErrorState(st.erro, () => atual.carregar());
    if (!st.perfilId) return UI.EmptyState("Selecione um perfil.", { icon: "perfil" });
    if (!st.lancamentos || !st.lancamentos.length) return UI.EmptyState("Nenhum lançamento deste perfil no período.", { icon: "lancamentos" });
    return h("ul", { class: "boleto-list" }, st.lancamentos.map((l) => h("li", { class: "boleto-list__item" },
      h("span", { class: "boleto-list__date" }, F.dataCurta(l.data)),
      h("span", { class: "boleto-list__desc" }, l.descricao),
      h("span", { class: ["boleto-list__value", "money", sinalDoTipo(l.tipo) < 0 && "money--income"] }, comSinal(F.numero(l.valor) * sinalDoTipo(l.tipo))))));
  }

  /* ---------------- BoletoAdjustments (descontos / arredondamentos) ---------------- */
  function BoletoAdjustments(lista, cfg) {
    const wrap = h("div", { class: "adjustments" });
    const desenhar = () => {
      mount(wrap,
        lista.length ? h("div", { class: "adjustments__list" }, lista.map((item, i) => {
          const desc = UI.Input({ value: item.descricao, placeholder: "Nome", class: "adjustments__desc" });
          desc.setAttribute("aria-label", cfg.rotulo + " " + (i + 1) + ": descrição");
          desc.dataset.fk = cfg.chave + ":d:" + item.id;
          const valor = UI.Input({ value: item.valorTexto || "", placeholder: "0,00", inputmode: "decimal", class: "adjustments__value" });
          valor.setAttribute("aria-label", cfg.rotulo + " " + (i + 1) + ": valor");
          desc.addEventListener("input", () => { item.descricao = desc.value; cfg.onChange(); });
          valor.addEventListener("input", () => {
            item.valorTexto = valor.value;
            const n = F.parseMoeda(valor.value);
            item.valor = Number.isFinite(n) ? (cfg.aceitaNegativo ? n : Math.abs(n)) : 0;
            valor.toggleAttribute("aria-invalid", valor.value !== "" && !Number.isFinite(n));
            cfg.onChange();
          });
          return h("div", { class: "adjustments__row" },
            desc,
            h("div", { class: "field__affix field__affix--sm" }, h("span", { class: "field__prefix", "aria-hidden": "true" }, cfg.prefixo), valor),
            UI.IconButton("excluir", "Excluir " + cfg.rotulo.toLowerCase(), { class: "icon-btn--danger", onClick: () => { lista.splice(i, 1); desenhar(); cfg.onChange(); } }));
        })) : null,
        UI.Button(cfg.adicionar, { variant: "text", size: "sm", icon: "mais", onClick: () => {
          const novo = { id: crypto.randomUUID(), descricao: "", valor: 0, valorTexto: "" };
          lista.push(novo); desenhar(); cfg.onChange();
          requestAnimationFrame(() => { const el = wrap.querySelector('[data-fk="' + cfg.chave + ":d:" + novo.id + '"]'); if (el) el.focus(); });
        } }));
    };
    desenhar();
    return wrap;
  }

  /* ---------------- BoletoSummary ---------------- */
  function BoletoSummary(st, opts) {
    const t = calcular(st);
    const o = opts || {};
    return h("div", { class: ["boleto-summary", o.doc && "boleto-summary--doc"] },
      h("div", { class: "boleto-summary__line" }, h("span", null, "Total dos lançamentos"), h("span", { class: "money" }, comSinal(t.lancamentos))),
      h("div", { class: "boleto-summary__line" }, h("span", null, "Descontos"), h("span", { class: "money" }, comSinal(t.descontos))),
      h("div", { class: "boleto-summary__line" }, h("span", null, "Arredondamentos"), h("span", { class: "money" }, comSinal(t.arredondamentos))),
      h("div", { class: "boleto-summary__total" }, h("span", null, "Total a pagar"), h("strong", { class: "money" }, comSinal(t.total))));
  }

  /* ---------------- Pix (QR code no canto inferior direito do documento) ----------------
     Cada desenho gera um código NOVO (TxID aleatório): muda ao trocar perfil, mês, ano,
     valor, ou ao fechar e abrir de novo. O texto do QR fica em st.pixCodigo (botão "copiar"). */
  function BoletoPix(st) {
    st.pixCodigo = null;
    const t = calcular(st);
    if (!st.pix || !(t.total > 0)) return null;
    const codigo = ZoZo.pix.payload({ chave: st.pix.chave, nome: st.pix.nome, cidade: st.pix.cidade, valor: t.total });
    if (!codigo) return null;
    st.pixCodigo = codigo;
    return h("section", { class: "doc__pix", "aria-label": "Pagamento por Pix" },
      h("div", { class: "doc__pix-texto" },
        h("p", { class: "doc__pix-titulo" }, "Pague com Pix"),
        h("p", { class: "doc__pix-sub" }, "No app do banco: Pix › Ler QR code"),
        h("p", { class: "doc__pix-valor" }, F.moeda(t.total))),
      ZoZo.verificacao.QR(codigo, 112));
  }

  /* ---------------- BoletoPreview (documento A4) ---------------- */
  function BoletoPreview(st) {
    const perfil = st.perfil;
    const periodo = F.mesNome(st.mes - 1) + " " + st.ano;
    const ajustes = (titulo, lista, sinal) => {
      const validos = lista.filter((x) => x.descricao.trim() || F.numero(x.valor));
      if (!validos.length) return null;
      return h("section", { class: "doc__block" },
        h("h3", { class: "doc__block-title" }, titulo),
        h("table", { class: "doc__table doc__table--adjust" }, h("tbody", null, validos.map((x) => h("tr", null,
          h("td", null, x.descricao.trim() || titulo.replace(/s$/, "")),
          h("td", { class: "doc__num" }, comSinal(F.numero(x.valor) * sinal)))))));
    };

    return h("article", { class: "doc", "aria-label": "Pré-visualização do boleto" },
      h("header", { class: "doc__head" },
        h("div", { class: "doc__brand" }, h("img", { class: "doc__logo", src: "assets/img/zozo-icone.png", alt: "ZoZo", width: "48", height: "48" })),
        h("div", { class: "doc__title-wrap" }, h("h2", { class: "doc__title" }, "Boleto"), h("p", { class: "doc__period" }, periodo))),
      h("dl", { class: "doc__meta" },
        h("div", null, h("dt", null, "Perfil"), h("dd", null, perfil ? perfil.nome : "—")),
        h("div", null, h("dt", null, "Período"), h("dd", null, periodo))),
      h("section", { class: "doc__block" },
        h("h3", { class: "doc__block-title" }, "Lançamentos"),
        st.lancamentos && st.lancamentos.length
          ? h("table", { class: "doc__table" },
            h("thead", null, h("tr", null, h("th", null, "Data"), h("th", null, "Nome"), h("th", null, "Categoria"), h("th", { class: "doc__num" }, "Valor"))),
            h("tbody", null, st.lancamentos.map((l) => h("tr", null,
              h("td", { class: "doc__date" }, F.dataExtenso(l.data)),
              h("td", null, l.descricao),
              h("td", null, l.categoria ? (l.categoria.icone ? l.categoria.icone + " " : "") + l.categoria.nome : ""),
              h("td", { class: "doc__num" }, comSinal(F.numero(l.valor) * sinalDoTipo(l.tipo)))))))
          : h("p", { class: "doc__empty" }, "Nenhum lançamento no período.")),
      ajustes("Descontos", st.descontos, R().sinalDesconto),
      ajustes("Arredondamentos", st.arredondamentos, R().sinalArredondamento),
      BoletoSummary(st, { doc: true }),
      BoletoPix(st));
  }

  /* ---------------- BoletoPrint ----------------
     Impressão do navegador ("Salvar como PDF"). O documento é montado só com
     nós de texto (sem HTML vindo dos dados) e a página não carrega nada externo,
     então o PDF contém apenas o que aparece na pré-visualização.
     O título da página vira o nome sugerido do arquivo (sem caracteres inválidos). */
  function BoletoPrint(st) {
    const titulo = ("Boleto " + (st.perfil ? st.perfil.nome : "") + " " + F.mesNome(st.mes - 1) + " " + st.ano)
      .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-").replace(/\s+/g, " ").trim().slice(0, 120);
    const tituloAnterior = document.title;
    const fim = () => {
      document.body.classList.remove("is-printing-boleto");
      document.title = tituloAnterior;
      window.removeEventListener("afterprint", fim);
    };
    document.title = titulo;
    document.body.classList.add("is-printing-boleto");
    window.addEventListener("afterprint", fim);
    window.print();
  }

  /* ---------------- BoletoEditor (overlay) ---------------- */
  function open(ctx, opts) {
    if (atual) return;
    const o = opts || {};
    const hoje = new Date();
    const st = {
      perfilId: o.perfilId || "", perfil: null, mes: hoje.getMonth() + 1, ano: hoje.getFullYear(),
      lancamentos: null, carregando: false, erro: null, descontos: [], arredondamentos: [], pix: null, pixCodigo: null,
    };
    const root = document.getElementById("boleto-root");
    const anterior = document.activeElement;
    let token = 0;

    const listaEl = h("div", { class: "boleto-editor__list" });
    const resumoEl = h("div");
    const docEl = h("div", { class: "paper" });
    const contadorEl = h("span", { class: "boleto-editor__count" });

    const avisoPix = h("p", { class: "boleto-editor__pix" });
    const copiarPix = UI.Button("Copiar Pix copia e cola", { size: "sm", variant: "secondary", icon: "copiar", class: "btn--block",
      onClick: () => st.pixCodigo && navigator.clipboard.writeText(st.pixCodigo).then(() => ctx.toast("Código Pix copiado."), () => ctx.toast("Não foi possível copiar.", { tone: "error" })) });
    function atualizarResumo() {
      mount(resumoEl, BoletoSummary(st));
      mount(docEl, BoletoPreview(st));
      copiarPix.hidden = !st.pixCodigo;
      avisoPix.textContent = st.perfilId && st.lancamentos && !st.pix ? "Para incluir o QR code Pix, cadastre sua chave em Configurações › Geral › Pix." : "";
    }
    function atualizarLista() {
      contadorEl.textContent = st.lancamentos ? String(st.lancamentos.length) : "";
      mount(listaEl, BoletoTransactionList(st));
      atualizarResumo();
    }
    function carregar() {
      const meu = ++token;
      if (!st.perfilId) { st.lancamentos = null; st.perfil = null; st.erro = null; atualizarLista(); return; }
      st.carregando = true; st.erro = null; atualizarLista();
      ctx.bridge.request(A.getBoletoData, { perfilId: st.perfilId, mes: st.mes, ano: st.ano }).then((d) => {
        if (meu !== token) return;
        st.carregando = false; st.lancamentos = d.lancamentos || []; st.perfil = d.perfil || st.perfil; st.pix = d.pix || null; atualizarLista();
      }).catch((e) => {
        if (meu !== token) return;
        st.carregando = false; st.erro = e.friendly; st.lancamentos = null; atualizarLista();
      });
    }

    // Campos Perfil e Período
    const perfisData = ZoZo.store.get().data.perfis;
    const perfilSel = UI.Select([], { name: "perfil" });
    const preencherPerfis = (lista) => {
      clear(perfilSel);
      perfilSel.appendChild(h("option", { value: "" }, "Selecione o perfil"));
      lista.forEach((p) => perfilSel.appendChild(h("option", { value: p.id }, p.nome)));
      perfilSel.value = st.perfilId;
      st.perfil = lista.find((p) => p.id === st.perfilId) || null;
    };
    let perfis = (perfisData && perfisData.perfis) || [];
    preencherPerfis(perfis);
    if (!perfisData) ctx.loadData("perfis", A.getPerfis).then((d) => { perfis = d.perfis || []; preencherPerfis(perfis); carregar(); }).catch(() => null);
    perfilSel.addEventListener("change", () => { st.perfilId = perfilSel.value; st.perfil = perfis.find((p) => p.id === st.perfilId) || null; carregar(); });

    const mesSel = UI.Select(F.MESES.map((m, i) => ({ value: String(i + 1), label: m })), { value: String(st.mes), ariaLabel: "Mês" });
    const anos = [];
    for (let a = hoje.getFullYear() - 4; a <= hoje.getFullYear() + 1; a++) anos.push({ value: String(a), label: String(a) });
    const anoSel = UI.Select(anos, { value: String(st.ano), ariaLabel: "Ano" });
    mesSel.addEventListener("change", () => { st.mes = Number(mesSel.value); carregar(); });
    anoSel.addEventListener("change", () => { st.ano = Number(anoSel.value); carregar(); });
    const periodoId = ZoZo.dom.id("periodo");
    mesSel.id = periodoId;

    const imprimir = () => {
      if (!st.perfilId) { ctx.toast("Selecione um perfil para imprimir.", { tone: "error" }); perfilSel.focus(); return; }
      BoletoPrint(st);
    };

    const editor = h("div", { class: "boleto__editor" },
      h("section", { class: "boleto-editor__section" },
        UI.Field("Perfil", perfilSel),
        h("div", { class: "field" }, h("label", { class: "field__label", for: periodoId }, "Período"), h("div", { class: "form-row form-row--period" }, mesSel, anoSel))),
      h("section", { class: "boleto-editor__section" },
        h("h3", { class: "boleto-editor__title" }, "Lançamentos", contadorEl),
        listaEl),
      h("section", { class: "boleto-editor__section" },
        h("h3", { class: "boleto-editor__title" }, "Descontos"),
        BoletoAdjustments(st.descontos, { chave: "desc", rotulo: "Desconto", adicionar: "Adicionar desconto", prefixo: "− R$", aceitaNegativo: false, onChange: atualizarResumo })),
      h("section", { class: "boleto-editor__section" },
        h("h3", { class: "boleto-editor__title" }, "Arredondamentos"),
        BoletoAdjustments(st.arredondamentos, { chave: "arr", rotulo: "Arredondamento", adicionar: "Adicionar arredondamento", prefixo: "R$", aceitaNegativo: R().arredondamentoAceitaNegativo, onChange: atualizarResumo })),
      h("section", { class: "boleto-editor__section boleto-editor__section--summary" },
        resumoEl, avisoPix, copiarPix,
        UI.Button("Imprimir", { variant: "primary", icon: "imprimir", class: "btn--block", onClick: imprimir })));

    const preview = h("div", { class: "boleto__preview" }, h("div", { class: "paper-scaler" }, docEl));

    const el = h("div", { class: "boleto", role: "dialog", "aria-modal": "true", "aria-labelledby": "boleto-titulo" },
      h("header", { class: "boleto__header" },
        h("h1", { class: "topbar__title", id: "boleto-titulo" }, "Criar boleto"),
        h("div", { class: "topbar__actions" },
          UI.IconButton("fechar", "Fechar", { onPrimary: true, onClick: () => close() }))),
      h("div", { class: "boleto__body" }, editor, preview));

    mount(root, el);
    document.body.classList.add("has-boleto");
    requestAnimationFrame(() => { el.classList.add("is-open"); perfilSel.focus(); });

    // Ajuste de escala do papel A4 à área disponível
    const scaler = preview.firstChild;
    const ro = new ResizeObserver(() => {
      // a folha A4 inteira sempre cabe na área (telas pequenas: até 25%)
      const largura = preview.clientWidth - (preview.clientWidth < 600 ? 32 : 64);
      scaler.style.zoom = String(Math.min(1, Math.max(0.25, largura / 794)));
    });
    ro.observe(preview);

    const tecla = (e) => {
      if (e.key === "Escape" && !document.querySelector(".modal-overlay, .menu")) { e.preventDefault(); close(); }
    };
    document.addEventListener("keydown", tecla);

    atual = {
      carregar,
      close() {
        ro.disconnect();
        document.removeEventListener("keydown", tecla);
        document.body.classList.remove("has-boleto", "is-printing-boleto");
        clear(root);
        atual = null;
        if (anterior && anterior.isConnected && anterior.focus) anterior.focus();
      },
    };
    carregar();
  }

  function close() { if (atual) atual.close(); }

  ZoZo.boleto = { open, close, calcular };
})(window.ZoZo);
