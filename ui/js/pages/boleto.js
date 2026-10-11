/* =============================================================
   ZoZo — Criação de fatura (antigo "boleto", seção 49)
   Editor · lista de transações · contribuições, descontos e
   arredondamentos · resumo · pré-visualização A4 · impressão
   (os nomes internos ZoZo.boleto / getBoletoData continuam)
   ============================================================= */
(function (ZoZo) {
  "use strict";
  const { h, mount, clear } = ZoZo.dom;
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
  const r2 = (n) => Math.round(n * 100) / 100;
  function calcular(st) {
    // Soma em CENTAVOS inteiros: cada linha é arredondada antes de somar (o total confere com as linhas exibidas)
    const c = (v) => Math.round(F.numero(v) * 100);
    const lanc = (st.lancamentos || []).reduce((s, l) => s + c(l.valor) * sinalDoTipo(l.tipo), 0);
    const contrib = (st.contribuicoes || []).reduce((s, d) => s + Math.abs(c(d.valor)), 0) * R().sinalContribuicao;
    const desc = st.descontos.reduce((s, d) => s + Math.abs(c(d.valor)), 0) * R().sinalDesconto;
    const arr = st.arredondamentos.reduce((s, d) => s + c(d.valor), 0) * R().sinalArredondamento;
    return { lancamentos: lanc / 100, contribuicoes: contrib / 100, descontos: desc / 100, arredondamentos: arr / 100, total: (lanc + contrib + desc + arr) / 100 };
  }

  /** Valor com sinal explícito para o resumo e o documento */
  function comSinal(n) {
    const v = F.numero(n);
    return (v < 0 ? "− " : "") + F.moeda(v);
  }

  /* ---------------- Formatos da fatura ---------------- */
  const maiusculas = (t) => String(t || "").toLocaleUpperCase("pt-BR");
  /** 13 OUT */
  const diaMes = (iso) => maiusculas(F.dataCurta(iso));
  /** 13 OUT 2026 */
  function diaMesAno(iso) {
    const d = F.parseData(iso);
    return d ? maiusculas(F.dataCurta(iso) + " " + d.getFullYear()) : "";
  }
  const parcela = (l) => (l.parcelaTotal ? l.parcelaAtual + "/" + l.parcelaTotal : "");

  /** Os dados na tela correspondem exatamente ao perfil e ao período escolhidos? (pode imprimir/copiar Pix) */
  const invalido = (st) => [st.contribuicoes, st.descontos, st.arredondamentos].some((l) => (l || []).some((x) => x.invalido));
  const pronto = (st) => !!(st.perfilId && st.lancamentos && !st.carregando && !st.erro && st.carregadoPara === chaveFiltro(st) && !invalido(st));
  const chaveFiltro = (st) => st.perfilId + "|" + st.ano + "-" + st.mes;

  /* ---------------- Lista de transações (editor) ---------------- */
  function ListaTransacoes(st) {
    if (st.carregando) return UI.Skeleton(4, { short: true });
    if (st.erro) return UI.ErrorState(st.erro, () => atual.carregar());
    if (!st.perfilId) return UI.EmptyState("Selecione um perfil.", { icon: "perfil" });
    if (!st.lancamentos || !st.lancamentos.length) return UI.EmptyState("Nenhuma transação de cartão de crédito ou empréstimo deste perfil no período.", { icon: "lancamentos" });
    return h("ul", { class: "boleto-list" }, st.lancamentos.map((l) => h("li", { class: "boleto-list__item" },
      h("span", { class: "boleto-list__date" }, diaMes(l.data)),
      h("span", { class: "boleto-list__desc" },
        l.ultimos4Digitos ? h("span", { class: "boleto-list__digits" }, l.ultimos4Digitos) : null,
        h("span", { class: "boleto-list__name" }, l.descricao)),
      h("span", { class: "boleto-list__parcel" }, parcela(l)),
      h("span", { class: ["boleto-list__value", "money", sinalDoTipo(l.tipo) < 0 && "money--income"] }, comSinal(F.numero(l.valor) * sinalDoTipo(l.tipo))))));
  }

  /* ---------------- Contribuições / descontos / arredondamentos ---------------- */
  function Ajustes(lista, cfg) {
    const wrap = h("div", { class: "adjustments" });
    const desenhar = () => {
      mount(wrap,
        lista.length ? h("div", { class: "adjustments__list" }, lista.map((item, i) => {
          const desc = UI.Input({ value: item.descricao, placeholder: "Nome", class: "adjustments__desc", maxlength: String(ZoZo.regras.limiteNome) });
          desc.setAttribute("aria-label", cfg.rotulo + " " + (i + 1) + ": nome");
          desc.dataset.fk = cfg.chave + ":d:" + item.id;
          const valor = UI.Input({ value: item.valorTexto || "", placeholder: "0,00", inputmode: "decimal", class: "adjustments__value" });
          valor.setAttribute("aria-label", cfg.rotulo + " " + (i + 1) + ": valor");
          desc.addEventListener("input", () => { item.descricao = desc.value; cfg.onChange(); });
          valor.addEventListener("input", () => {
            item.valorTexto = valor.value;
            const n = F.parseMoeda(valor.value);
            const ok = Number.isFinite(n) && Math.abs(n) < 1e12;
            // em centavos: o que aparece em cada linha é exatamente o que entra no total
            item.valor = ok ? r2(cfg.aceitaNegativo ? n : Math.abs(n)) : 0;
            item.invalido = valor.value.trim() !== "" && !ok;            // valor inválido bloqueia imprimir e o Pix
            if (item.invalido) valor.setAttribute("aria-invalid", "true"); else valor.removeAttribute("aria-invalid");
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

  /* ---------------- Resumo (editor e documento) ---------------- */
  function Resumo(st, opts) {
    const t = calcular(st);
    const o = opts || {};
    const linha = (rotulo, valor) => h("div", { class: "boleto-summary__line" }, h("span", null, rotulo), h("span", { class: "money" }, comSinal(valor)));
    return h("div", { class: ["boleto-summary", o.doc && "boleto-summary--doc"] },
      linha("Total das transações", t.lancamentos),
      linha("Contribuições", t.contribuicoes),
      linha("Descontos", t.descontos),
      linha("Arredondamentos", t.arredondamentos),
      h("div", { class: "boleto-summary__total" }, h("span", null, "Total a pagar"), h("strong", { class: "money" }, comSinal(t.total))));
  }

  /* ---------------- Pix (QR code no canto inferior esquerdo, ao lado do resumo) ----------------
     Cada desenho gera um código NOVO (TxID aleatório): muda ao trocar perfil, mês, ano,
     valor, ou ao fechar e abrir de novo. O texto do QR fica em st.pixCodigo (botão "copiar").
     Só existe com os dados prontos: nunca há Pix de um total antigo com um perfil/período novo. */
  function FaturaPix(st) {
    st.pixCodigo = null;
    const t = calcular(st);
    if (!pronto(st) || !st.pix || !(t.total > 0)) return null;
    const codigo = ZoZo.pix.payload({ chave: st.pix.chave, nome: st.pix.nome, cidade: st.pix.cidade, valor: t.total });
    if (!codigo) return null;
    st.pixCodigo = codigo;
    return h("section", { class: "doc__pix", "aria-label": "Pagamento por Pix" },
      ZoZo.verificacao.QR(codigo, 112, "Código QR do Pix para pagar " + F.moeda(t.total)),
      h("p", { class: "doc__pix-texto" }, "Leia o QR no celular e pague por Pix"));
  }

  /* ---------------- Pré-visualização (documento A4) ---------------- */
  function Documento(st) {
    const ok = pronto(st);
    // valor(x): como o item entra no total (contribuição/desconto sempre pelo valor absoluto)
    const ajustes = (titulo, lista, valor) => {
      const validos = lista.filter((x) => x.descricao.trim() || F.numero(x.valor));
      if (!validos.length) return null;
      return h("section", { class: "doc__block" },
        h("h3", { class: "doc__block-title" }, titulo),
        h("table", { class: "doc__table doc__table--adjust" }, h("tbody", null, validos.map((x) => h("tr", null,
          h("td", null, x.descricao.trim() || titulo.replace(/ões$/, "ão").replace(/s$/, "")),
          h("td", { class: "doc__num" }, comSinal(valor(x))))))));
    };
    const transacoes = ok && st.lancamentos.length
      ? h("table", { class: "doc__table doc__table--transacoes" },
        h("tbody", null, st.lancamentos.map((l) => h("tr", null,
          h("td", { class: "doc__date" }, diaMes(l.data)),
          h("td", { class: "doc__desc" },
            l.ultimos4Digitos ? h("span", { class: "doc__digits" }, l.ultimos4Digitos) : null,
            h("span", { class: "doc__name" }, l.descricao)),
          h("td", { class: "doc__parcel" }, parcela(l)),
          h("td", { class: "doc__num" }, comSinal(F.numero(l.valor) * sinalDoTipo(l.tipo)))))))
      : h("p", { class: "doc__empty" }, !st.perfilId ? "Selecione um perfil." : ok ? "Nenhuma transação no período." : "Carregando as transações…");

    return h("article", { class: "doc", "aria-label": "Pré-visualização da fatura", "aria-busy": ok ? "false" : "true" },
      h("header", { class: "doc__head" },
        h("div", { class: "doc__brand" }, h("img", { class: "doc__logo", src: "assets/img/zozo-fatura.svg", alt: "ZoZo", width: "44", height: "44", decoding: "sync" })),
        h("div", { class: "doc__title-wrap" },
          h("p", { class: "doc__perfil" }, maiusculas(st.perfil ? st.perfil.nome : "—")),
          h("p", { class: "doc__fatura" }, h("span", { class: "doc__fatura-rotulo" }, "FATURA"), " ", h("span", { class: "doc__fatura-data" }, diaMesAno(st.dataFatura))))),
      h("section", { class: "doc__block" }, h("h3", { class: "doc__block-title" }, "Transações"), transacoes),
      ajustes("Contribuições", st.contribuicoes, (x) => Math.abs(F.numero(x.valor)) * R().sinalContribuicao),
      ajustes("Descontos", st.descontos, (x) => Math.abs(F.numero(x.valor)) * R().sinalDesconto),
      ajustes("Arredondamentos", st.arredondamentos, (x) => F.numero(x.valor) * R().sinalArredondamento),
      h("div", { class: "doc__rodape" }, FaturaPix(st), Resumo(st, { doc: true })));
  }

  /* ---------------- Impressão ----------------
     Impressão do navegador ("Salvar como PDF"). O documento é montado só com
     nós de texto (sem HTML vindo dos dados) e a página não carrega nada externo,
     então o PDF contém apenas o que aparece na pré-visualização. Enquanto os dados
     não correspondem ao perfil/período escolhidos, o documento não é impresso
     (nem pelo Ctrl+P: veja print.css, .doc[aria-busy="true"]).
     O título da página vira o nome sugerido do arquivo (sem caracteres inválidos). */
  function imprimirDocumento(st) {
    const titulo = ("Fatura " + (st.perfil ? st.perfil.nome : "") + " " + F.mesNome(st.mes - 1) + " " + st.ano)
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

  /* ---------------- Editor (janela em tela cheia) ---------------- */
  function open(ctx, opts) {
    if (atual) return;
    // Fatura: só contas com o recurso (o serviço de dados também recusa os dados da fatura)
    if (!ZoZo.recursos.boleto() || !ZoZo.recursos.perfis()) { ctx.toast(ZoZo.messages.FRIENDLY.FEATURE_UNAVAILABLE, { tone: "error" }); return; }
    const o = opts || {};
    const hoje = new Date();
    const st = {
      perfilId: o.perfilId || "", perfil: null, mes: hoje.getMonth() + 1, ano: hoje.getFullYear(), dataFatura: F.iso(hoje),
      lancamentos: null, carregadoPara: null, carregando: false, erro: null,
      contribuicoes: [], descontos: [], arredondamentos: [], pix: null, pixCodigo: null,
    };
    const root = document.getElementById("boleto-root");
    const shell = document.getElementById("shell");
    const anterior = document.activeElement;
    let token = 0;

    const listaEl = h("div", { class: "boleto-editor__list" });
    const resumoEl = h("div");
    const docEl = h("div", { class: "paper" });
    const contadorEl = h("span", { class: "boleto-editor__count" });

    const avisoPix = h("p", { class: "boleto-editor__pix" });
    const copiarPix = UI.Button("Copiar Pix copia e cola", { size: "sm", variant: "secondary", icon: "copiar", class: "btn--block",
      onClick: (e) => { const b = e.currentTarget; if (pronto(st) && st.pixCodigo) navigator.clipboard.writeText(st.pixCodigo).then(() => UI.confirmarNoBotao(b, "Código Pix copiado"), () => ctx.toast("Não foi possível copiar.", { tone: "error" })); } });
    const imprimirBtn = UI.Button("Imprimir", { variant: "primary", icon: "imprimir", class: "btn--block", onClick: () => imprimir() });

    function atualizarResumo() {
      mount(resumoEl, Resumo(st));
      mount(docEl, Documento(st));
      copiarPix.hidden = !st.pixCodigo;
      imprimirBtn.disabled = !pronto(st);
      avisoPix.textContent = invalido(st) ? "Corrija o valor marcado em vermelho para imprimir a fatura."
        : pronto(st) && !st.pix ? "Para incluir o QR code Pix, cadastre sua chave em Configurações › Geral › Pix." : "";
    }
    function atualizarLista() {
      contadorEl.textContent = st.lancamentos && !st.carregando ? String(st.lancamentos.length) : "";
      mount(listaEl, ListaTransacoes(st));
      atualizarResumo();
    }
    function carregar() {
      const meu = ++token;
      // Trocou perfil ou período: a fatura anterior sai na hora (nada de dados antigos com filtros novos)
      st.lancamentos = null; st.carregadoPara = null; st.pixCodigo = null;
      if (!st.perfilId) { st.perfil = null; st.erro = null; st.carregando = false; atualizarLista(); return; }
      const chave = chaveFiltro(st);
      st.carregando = true; st.erro = null; atualizarLista();
      ctx.bridge.request(A.getBoletoData, { perfilId: st.perfilId, mes: st.mes, ano: st.ano }).then((d) => {
        if (meu !== token || chave !== chaveFiltro(st)) return;
        st.carregando = false; st.lancamentos = d.lancamentos || []; st.perfil = d.perfil || st.perfil; st.pix = d.pix || null;
        st.carregadoPara = chave;
        atualizarLista();
      }).catch((e) => {
        if (meu !== token) return;
        st.carregando = false; st.erro = e.friendly; st.lancamentos = null; atualizarLista();
      });
    }

    // Campos Perfil, Período e Data da fatura
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
    const dataInput = ZoZo.calendario.Campo({ valor: st.dataFatura, rotulo: "Data da fatura",
      aoMudar: (v) => { if (F.parseData(v)) { st.dataFatura = v; atualizarResumo(); } } });

    function imprimir() {
      if (!st.perfilId) { ctx.toast("Selecione um perfil para imprimir.", { tone: "error" }); perfilSel.focus(); return; }
      if (invalido(st)) { ctx.toast("Há um valor inválido nos ajustes da fatura.", { tone: "error" }); return; }
      if (!pronto(st)) { ctx.toast("Espere as transações carregarem para imprimir.", { tone: "error" }); return; }
      imprimirDocumento(st);
    }

    const secaoAjuste = (titulo, lista, cfg) => h("section", { class: "boleto-editor__section" },
      h("h3", { class: "boleto-editor__title" }, titulo), Ajustes(lista, Object.assign({ onChange: atualizarResumo }, cfg)));

    const editor = h("div", { class: "boleto__editor" },
      h("section", { class: "boleto-editor__section" },
        UI.Field("Perfil", perfilSel),
        h("div", { class: "field" }, h("label", { class: "field__label", for: periodoId }, "Período"), h("div", { class: "form-row form-row--period" }, mesSel, anoSel)),
        UI.Field("Data da fatura", dataInput)),
      h("section", { class: "boleto-editor__section" },
        h("h3", { class: "boleto-editor__title" }, "Transações", contadorEl),
        listaEl),
      secaoAjuste("Contribuições", st.contribuicoes, { chave: "contrib", rotulo: "Contribuição", adicionar: "Adicionar contribuição", prefixo: F.simbolo(), aceitaNegativo: false }),
      secaoAjuste("Descontos", st.descontos, { chave: "desc", rotulo: "Desconto", adicionar: "Adicionar desconto", prefixo: "− " + F.simbolo(), aceitaNegativo: false }),
      secaoAjuste("Arredondamentos", st.arredondamentos, { chave: "arr", rotulo: "Arredondamento", adicionar: "Adicionar arredondamento", prefixo: F.simbolo(), aceitaNegativo: R().arredondamentoAceitaNegativo }),
      h("section", { class: "boleto-editor__section boleto-editor__section--summary" }, resumoEl, avisoPix, copiarPix, imprimirBtn));

    const preview = h("div", { class: "boleto__preview" }, h("div", { class: "paper-scaler" }, docEl));

    const el = h("div", { class: "boleto", role: "dialog", "aria-modal": "true", "aria-labelledby": "boleto-titulo" },
      h("header", { class: "boleto__header" },
        h("h1", { class: "topbar__title", id: "boleto-titulo" }, "Criar fatura"),
        h("div", { class: "topbar__actions" },
          UI.IconButton("fechar", "Fechar", { onPrimary: true, onClick: () => close() }))),
      h("div", { class: "boleto__body" }, editor, preview));

    mount(root, el);
    document.body.classList.add("has-boleto");
    if (shell) shell.inert = true;               // o fundo não recebe foco nem cliques enquanto a fatura está aberta
    void el.offsetWidth;                         // garante o estado inicial antes da transição de entrada
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
      if (e.key === "Escape" && !document.querySelector(".modal-overlay, .menu, .emoji-pop.is-aberto")) { e.preventDefault(); close(); }
    };
    document.addEventListener("keydown", tecla);

    atual = {
      carregar,
      close() {
        ro.disconnect();
        document.removeEventListener("keydown", tecla);
        document.body.classList.remove("has-boleto", "is-printing-boleto");
        if (shell) shell.inert = false;
        // saída suave: a fatura some e desce um pouco; só esta folha é removida (outra pode ter sido aberta)
        el.classList.remove("is-open");
        el.inert = true;
        setTimeout(() => el.remove(), 280);
        atual = null;
        if (anterior && anterior.isConnected && anterior.focus) anterior.focus();
      },
    };
    carregar();
  }

  function close() { if (atual) atual.close(); }

  ZoZo.boleto = { open, close, calcular };
})(window.ZoZo);
