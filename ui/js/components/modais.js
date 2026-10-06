/* =============================================================
   ZoZo — Janelas modais de criação
   Nova categoria · Criar novo grupo · Nova conta ·
   Nova recorrência (lançamento → frequência → parcelas) ·
   Confirmar com senha
   ============================================================= */
(function (ZoZo) {
  "use strict";
  const { h, mount } = ZoZo.dom;
  const { icon } = ZoZo.icons;
  const UI = ZoZo.ui;
  const F = ZoZo.format;
  const A = ZoZo.messages.ACTIONS;
  const store = ZoZo.store;


  /**
   * Janela modal com conteúdo trocável (passos).
   * abrir({ titulo, classe, passo(api) → { titulo?, corpo: node, botoes: [{label, primario, perigo, onClick, desabilitado}] } })
   */
  function janela(cfg) {
    const corpoEl = h("div", { class: "zm__body" });
    const rodapeEl = h("div", { class: "modal__footer zm__footer" });
    const area = h("div", { class: "zm" }, corpoEl, rodapeEl);
    const m = ZoZo.feedback.modal({ title: cfg.titulo, class: ["modal--zm", cfg.classe].filter(Boolean).join(" "), body: area, onClose: cfg.onClose });
    const api = {
      fechar: () => m.fechar(true),
      ir(passo) {
        const p = passo(api);
        const tituloEl = area.closest(".modal") && area.closest(".modal").querySelector(".modal__title");
        if (p.titulo && tituloEl) tituloEl.textContent = p.titulo;
        mount(corpoEl, p.corpo);
        mount(rodapeEl, (p.botoes || []).map((b) => {
          const btn = UI.Button(b.label, { variant: b.primario ? "primary" : b.perigo ? "danger" : "secondary", onClick: () => b.onClick(btn), disabled: b.desabilitado });
          if (b.ref) b.ref(btn);
          return btn;
        }));
        requestAnimationFrame(() => { const f = corpoEl.querySelector("[data-autofocus], input:not([type=radio]):not([type=checkbox])"); if (f) f.focus(); });
      },
    };
    api.ir(cfg.passo);
    return api;
  }

  /** Botão de ícone (emoji) que abre o seletor de emojis */
  function seletorIcone(valor, aoMudar) {
    let atual = valor || "📦";
    const btn = h("button", { type: "button", class: "icon-pick", "aria-label": "Escolher ícone", "aria-haspopup": "menu" }, atual);
    btn.addEventListener("click", () => ZoZo.emojiPicker.abrir(btn, { atual, aoEscolher: (e) => { atual = e; btn.textContent = e; aoMudar(e); } }));
    return btn;
  }

  /** Toggle com fundo roxo (cor da barra superior) */
  function Interruptor(rotulo, ligado, aoMudar) {
    const input = h("input", { type: "checkbox", class: "toggle__input", role: "switch" });
    input.checked = !!ligado;
    input.addEventListener("change", () => aoMudar(input.checked));
    return h("label", { class: "toggle toggle--linha" }, h("span", { class: "toggle__label" }, rotulo), input, h("span", { class: "toggle__track", "aria-hidden": "true" }, h("span", { class: "toggle__thumb" })));
  }

  function campoDinheiro(valor, placeholder) {
    const input = UI.Input({ inputmode: "decimal", placeholder: placeholder || "0,00", value: valor ? F.moedaEditavel(valor) : "" });
    return { input, el: h("div", { class: "field__affix" }, h("span", { class: "field__prefix" }, "R$"), input), ler: () => F.parseMoeda(input.value) };
  }

  /* ---------------- Nova categoria ---------------- */
  function novaCategoria(ctx, opts) {
    const o = opts || {};
    const orcamentoAtivo = !(store.get().data.config && store.get().data.config.orcamentoAtivo === false);
    const d = { icone: o.icone || "📦", nome: o.nome || "", cor: ZoZo.regras.corSugerida(), incluir: true };
    janela({
      titulo: "Nova categoria",
      classe: "modal--nova-categoria",
      passo: (api) => {
        const nome = UI.Input({ value: d.nome, placeholder: "Nome da categoria" });
        nome.maxLength = 60; nome.dataset.autofocus = "";
        const orc = campoDinheiro(0);
        const linhaOrc = h("div", { class: "field" }, h("span", { class: "field__label" }, "Orçamento"), orc.el);
        const erro = h("p", { class: "form-error", role: "alert" });
        const cores = h("div");
        const desenharCores = () => mount(cores, UI.ColorPicker(d.cor, (c) => { d.cor = c; desenharCores(); }, { label: "Cor" }));
        desenharCores();
        linhaOrc.hidden = !orcamentoAtivo;
        let criar;
        const enviar = () => {
          d.nome = nome.value.trim();
          if (!d.nome) { erro.textContent = "Informe o nome da categoria."; nome.focus(); return; }
          const reservado = orc.ler();
          criar.disabled = true;
          ctx.bridge.request(A.createCategoria, { categoria: { nome: d.nome, icone: d.icone, cor: d.cor, grupo: o.grupo || null,
            status: d.incluir ? "regular" : "excluida", reservado: Number.isFinite(reservado) && reservado > 0 ? reservado : 0 } })
            .then((r) => { api.fechar(); ctx.toast("Categoria criada."); return ctx.recarregarTudo().then(() => o.aoCriar && o.aoCriar(r.categoria)); })
            .catch((e) => { erro.textContent = e.friendly; criar.disabled = false; });
        };
        nome.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); enviar(); } });
        return {
          corpo: h("div", { class: "zm__form" },
            h("div", { class: "zm__row" }, seletorIcone(d.icone, (e) => { d.icone = e; }), nome),
            cores,
            Interruptor("Incluir no total e orçamento", d.incluir, (v) => { d.incluir = v; linhaOrc.hidden = !v || !orcamentoAtivo; }),
            linhaOrc, erro),
          botoes: [{ label: "Cancelar", onClick: () => api.fechar() }, { label: "Criar", primario: true, onClick: enviar, ref: (b) => { criar = b; } }],
        };
      },
    });
  }

  /* ---------------- Novo perfil ---------------- */
  function novoPerfil(ctx, opts) {
    const o = opts || {};
    const d = { cor: ZoZo.regras.corSugerida() };
    janela({
      titulo: "Novo perfil",
      classe: "modal--novo-perfil",
      passo: (api) => {
        const nome = UI.Input({ placeholder: "Nome do perfil" });
        nome.maxLength = 40; nome.dataset.autofocus = "";
        const erro = h("p", { class: "form-error", role: "alert" });
        const cores = h("div");
        const desenharCores = () => mount(cores, UI.ColorPicker(d.cor, (c) => { d.cor = c; desenharCores(); }, { label: "Cor do perfil" }));
        desenharCores();
        const enviar = (btn) => {
          const v = nome.value.trim();
          if (!v) { erro.textContent = "Informe o nome do perfil."; nome.focus(); return; }
          if (btn) btn.disabled = true;
          ctx.bridge.request(A.createPerfil, { perfil: { nome: v, cor: d.cor, orcamento: 0 } })
            .then((r) => { api.fechar(); ctx.toast("Perfil criado."); return ctx.recarregarTudo().then(() => o.aoCriar && o.aoCriar(r.perfil)); })
            .catch((e) => { erro.textContent = e.friendly; if (btn) btn.disabled = false; });
        };
        nome.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); enviar(null); } });
        return {
          corpo: h("div", { class: "zm__form" }, nome, cores, erro),
          botoes: [{ label: "Cancelar", onClick: () => api.fechar() }, { label: "Criar", primario: true, onClick: enviar }],
        };
      },
    });
  }

  /* ---------------- Criar novo grupo ---------------- */
  function criarGrupo(aoCriar) {
    janela({
      titulo: "Criar novo grupo",
      passo: (api) => {
        const nome = UI.Input({ placeholder: "Ex.: Moradia" });
        nome.maxLength = 60; nome.dataset.autofocus = "";
        const erro = h("p", { class: "form-error", role: "alert" });
        const enviar = () => {
          const v = nome.value.trim();
          if (!v) { erro.textContent = "Informe o nome do grupo."; nome.focus(); return; }
          api.fechar(); aoCriar(v);
        };
        nome.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); enviar(); } });
        return {
          corpo: h("div", { class: "zm__form" }, UI.Field("Nome do grupo", nome), erro),
          botoes: [{ label: "Cancelar", onClick: () => api.fechar() }, { label: "Criar", primario: true, onClick: enviar }],
        };
      },
    });
  }

  /* ---------------- Nova conta ---------------- */
  const TITULOS_CONTA = { cartao: "Cartão de crédito", poupanca: "Conta poupança", corrente: "Conta corrente", investimento: "Investimento", emprestimo: "Empréstimo", outros: "Outros" };

  function novaConta(ctx, tipoInicial) {
    const bancos = ["cartao", "poupanca", "corrente"].includes(tipoInicial || "corrente");
    const d = { tipo: tipoInicial || "corrente", cor: ZoZo.regras.corSugerida(), tipoInvestimento: ZoZo.regras.tiposInvestimento[0] };
    janela({
      titulo: TITULOS_CONTA[d.tipo],
      classe: "modal--nova-conta",
      passo: function passo(api) {
        const campos = {};
        const add = (chave, rotulo, input, dica) => { campos[chave] = input; return UI.Field(rotulo, input.el || input, { hint: dica }); };
        const texto = (ph, max) => { const i = UI.Input({ placeholder: ph }); i.maxLength = max || 60; return i; };
        const diaInput = () => { const i = UI.Input({ type: "number", placeholder: "1 a 31", inputmode: "numeric" }); i.min = "1"; i.max = "31"; return i; };
        const saldo = campoDinheiro(0); campos.saldo = saldo;
        const erro = h("p", { class: "form-error", role: "alert" });
        const cores = h("div");
        const desenharCores = () => mount(cores, UI.ColorPicker(d.cor, (c) => { d.cor = c; desenharCores(); }, { label: "Cor" }));
        desenharCores();

        let linhas;
        if (d.tipo === "cartao") {
          linhas = [
            add("instituicao", "Nome da instituição", texto("Ex.: Nubank")),
            add("nome", "Nome do cartão", texto("Ex.: Ultravioleta")),
            h("div", { class: "form-row form-row--2" }, add("digitos", "4 últimos dígitos", texto("1234", 4)), UI.Field("Saldo (fatura atual)", saldo.el)),
            h("div", { class: "form-row form-row--3" },
              add("limite", "Limite", campoDinheiro(0)),
              add("fechamento", "Fechamento", diaInput()),
              add("vencimento", "Vencimento", diaInput())),
          ];
        } else if (d.tipo === "poupanca" || d.tipo === "corrente") {
          linhas = [
            add("instituicao", "Nome da instituição", texto("Ex.: Itaú")),
            h("div", { class: "form-row form-row--2" }, add("digitos", "4 últimos dígitos", texto("1234", 4)), UI.Field("Saldo", saldo.el)),
          ];
        } else {
          linhas = [
            add("nome", "Nome", texto(d.tipo === "investimento" ? "Ex.: XP Investimentos" : d.tipo === "emprestimo" ? "Ex.: Financiamento do carro" : "Ex.: Carteira")),
            add("instituicao", "Instituição", texto("Opcional")),
            d.tipo === "investimento" ? add("tipoInvestimento", "Tipo de investimento", UI.Select(ZoZo.regras.tiposInvestimento.map((t) => ({ value: t, label: t })), { value: d.tipoInvestimento })) : null,
            UI.Field(d.tipo === "emprestimo" ? "Valor devido" : "Saldo", saldo.el),
          ];
        }
        const enviar = (btn) => {
          const v = (k) => (campos[k] ? (campos[k].ler ? campos[k].ler() : campos[k].value.trim()) : "");
          const inst = v("instituicao");
          const nome = d.tipo === "cartao" ? (v("nome") || inst) : (d.tipo === "poupanca" || d.tipo === "corrente") ? inst : v("nome");
          const dig = v("digitos");
          const s = saldo.ler();
          if (!nome) { erro.textContent = d.tipo === "cartao" ? "Informe a instituição ou o nome do cartão." : (d.tipo === "poupanca" || d.tipo === "corrente") ? "Informe o nome da instituição." : "Informe o nome."; return; }
          if (dig && !/^\d{4}$/.test(dig)) { erro.textContent = "Os 4 últimos dígitos devem ter exatamente 4 números."; return; }
          const dias = ["fechamento", "vencimento"].map(v);
          if (dias.some((x) => x !== "" && !(Number(x) >= 1 && Number(x) <= 31))) { erro.textContent = "Fechamento e vencimento: dias de 1 a 31."; return; }
          btn.disabled = true;
          ctx.bridge.request(A.createConta, { conta: {
            nome, tipo: d.tipo, ultimos4Digitos: dig, saldo: Number.isFinite(s) ? s : 0, cor: d.cor, instituicao: d.tipo === "cartao" || d.tipo === "poupanca" || d.tipo === "corrente" ? inst : inst,
            limite: campos.limite ? campos.limite.ler() : null, fechamento: v("fechamento") || null, vencimento: v("vencimento") || null,
            tipoInvestimento: campos.tipoInvestimento ? campos.tipoInvestimento.value : null,
          } }).then(() => { api.fechar(); ctx.toast("Conta criada."); return ctx.recarregarTudo(); })
            .catch((e) => { erro.textContent = e.friendly; btn.disabled = false; });
        };
        return {
          titulo: TITULOS_CONTA[d.tipo],
          corpo: h("div", { class: "zm__form" },
            bancos ? UI.Segmented([{ value: "cartao", label: "Cartão de crédito" }, { value: "poupanca", label: "Poupança" }, { value: "corrente", label: "Corrente" }],
              d.tipo, (t) => { d.tipo = t; api.ir(passo); }, { label: "Tipo de conta", class: "segmented--pilulas" }) : null,
            linhas, h("div", { class: "field" }, h("span", { class: "field__label" }, "Cor"), cores), erro),
          botoes: [{ label: "Cancelar", onClick: () => api.fechar() }, { label: "Criar", primario: true, onClick: enviar }],
        };
      },
    });
  }

  /* ---------------- Nova recorrência ---------------- */
  const FREQ_OPCOES = [
    ["semanal", "A cada semana"], ["quinzenal", "A cada 2 semanas"], ["mensal", "A cada mês"], ["bimestral", "A cada 2 meses"],
    ["trimestral", "A cada 3 meses"], ["quadrimestral", "A cada 4 meses"], ["semestral", "A cada 6 meses"], ["anual", "A cada ano"], ["parcelada", "Parcelado"],
  ];

  /** Passo "Confirmar frequência" (e, se parcelado, "Parcelas"). aoConfirmar({recorrencia, parcelaAtual, parcelaTotal}) */
  function passoFrequencia(aoConfirmar, voltar) {
    let escolha = "mensal";
    return function passo(api) {
      const lista = h("div", { class: "freq-list", role: "radiogroup", "aria-label": "Frequência" },
        FREQ_OPCOES.map(([v, t]) => {
          const input = h("input", { type: "radio", name: "zz-freq", value: v, class: "freq-list__radio" });
          input.checked = v === escolha;
          input.addEventListener("change", () => { escolha = v; atualizar(); });
          return h("label", { class: ["freq-list__item", v === escolha && "is-active"] }, input, h("span", null, t));
        }));
      let botaoAvancar;
      const atualizar = () => {
        lista.querySelectorAll(".freq-list__item").forEach((el) => el.classList.toggle("is-active", el.querySelector("input").checked));
        if (botaoAvancar) botaoAvancar.querySelector(".btn__label").textContent = escolha === "parcelada" ? "Próximo" : "Criar";
      };
      return {
        titulo: "Confirmar frequência",
        corpo: lista,
        botoes: [
          { label: voltar ? "Voltar" : "Cancelar", onClick: () => (voltar ? voltar(api) : api.fechar()) },
          { label: escolha === "parcelada" ? "Próximo" : "Criar", primario: true, ref: (b) => { botaoAvancar = b; },
            onClick: (btn) => (escolha === "parcelada" ? api.ir(passoParcelas(aoConfirmar, () => api.ir(passo))) : aoConfirmar({ recorrencia: escolha }, api, btn)) },
        ],
      };
    };
  }

  function passoParcelas(aoConfirmar, voltar) {
    return (api) => {
      const ini = UI.Input({ type: "number", inputmode: "numeric", placeholder: "1" });
      const fim = UI.Input({ type: "number", inputmode: "numeric", placeholder: "10" });
      [ini, fim].forEach((i) => { i.min = "1"; i.step = "1"; i.addEventListener("keydown", (e) => { if ([".", ",", "e", "-", "+"].includes(e.key)) e.preventDefault(); }); });
      ini.dataset.autofocus = "";
      const erro = h("p", { class: "form-error", role: "alert" });
      return {
        titulo: "Parcelas",
        corpo: h("div", { class: "zm__form" },
          h("div", { class: "form-row form-row--2" }, UI.Field("Parcela inicial", ini), UI.Field("Parcela final", fim)),
          h("p", { class: "field__hint" }, "Ex.: compra em 10x já na 3ª parcela → inicial 3, final 10. As parcelas seguintes são criadas automaticamente."),
          erro),
        botoes: [
          { label: "Voltar", onClick: () => voltar() },
          { label: "Criar", primario: true, onClick: (btn) => {
            const a = Number(ini.value), b = Number(fim.value);
            if (!(Number.isInteger(a) && Number.isInteger(b) && a >= 1 && b >= 2 && a <= b && b <= 999)) { erro.textContent = "Use números inteiros: inicial a partir de 1 e final maior ou igual à inicial."; return; }
            aoConfirmar({ recorrencia: "parcelada", parcelaAtual: a, parcelaTotal: b }, api, btn);
          } },
        ],
      };
    };
  }

  /** Executa "tornar recorrente" para um lançamento existente */
  function tornarRecorrente(ctx, lancamentoId, aoTerminar) {
    return (dados, api, btn) => {
      if (btn) btn.disabled = true;
      ctx.bridge.request(A.tornarRecorrente, Object.assign({ id: lancamentoId }, dados))
        .then(() => { api.fechar(); ctx.toast("Recorrência criada."); return ctx.recarregarTudo().then(() => aoTerminar && aoTerminar()); })
        .catch((e) => { ctx.toast(e.friendly, { tone: "error" }); if (btn) btn.disabled = false; });
    };
  }

  /** Só a escolha de frequência (ex.: lançamento aberto no painel). aoEscolher(dados) evita gravar (lançamento ainda não criado). */
  function frequencia(ctx, lancamentoId, opts) {
    const o = opts || {};
    janela({
      titulo: "Confirmar frequência",
      classe: "modal--recorrencia",
      passo: passoFrequencia(o.aoEscolher ? (dados, api) => { api.fechar(); o.aoEscolher(dados); } : tornarRecorrente(ctx, lancamentoId, o.aoTerminar)),
    });
  }

  function novaRecorrencia(ctx) {
    ctx.loadData("lancamentos", A.getLancamentos).then((dados) => {
      const candidatos = (dados.lancamentos || []).filter((l) => l.tipo !== "recorrente" || String(l.serieId || "").startsWith("removida:")).slice(0, 300);
      const passoLista = (api) => {
        let termo = "";
        const norm = (t) => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
        const busca = h("input", { type: "search", class: "zm__search-input", placeholder: "Pesquisar", "aria-label": "Pesquisar lançamentos" });
        busca.dataset.autofocus = "";
        const lista = h("div", { class: "zm__list" });
        const desenhar = () => {
          const itens = candidatos.filter((l) => !termo || norm(l.descricao).includes(termo) || norm(l.categoria && l.categoria.nome).includes(termo));
          mount(lista, itens.length ? itens.map((l) => {
            const marca = l.tipo === "interno" ? "T" : l.tipo === "receita" ? "I" : null;
            const verde = l.tipo === "receita" || l.tipo === "estorno" || (l.tipo === "interno" && l.sentido === "entrada");
            return h("button", { type: "button", class: "zm-lanc", onClick: () => api.ir(passoFrequencia(tornarRecorrente(ctx, l.id, () => ctx.navigate("recorrencias")), () => api.ir(passoLista))) },
              h("span", { class: "zm-lanc__data" }, F.dataCurta(l.data)),
              h("span", { class: "zm-lanc__nome" }, marca ? h("span", { class: "kind-badge" }, marca) : null, h("span", null, l.descricao)),
              l.categoria ? h("span", { class: "zm-lanc__cat", style: { "--tag-color": F.cor(l.categoria.cor, "var(--palette-16)") }, title: l.categoria.nome }, l.categoria.icone || "•") : h("span"),
              h("span", { class: ["zm-lanc__valor", "money", verde && "money--income"] }, F.moeda(l.valor)));
          }) : h("p", { class: "menu__empty" }, "Nenhum lançamento encontrado."));
        };
        busca.addEventListener("input", () => { termo = norm(busca.value.trim()); desenhar(); });
        desenhar();
        return {
          titulo: "Nova recorrência",
          corpo: h("div", { class: "zm__pick" }, h("div", { class: "zm__search" }, icon("pesquisar", { size: 15 }), busca), lista),
          botoes: [],
        };
      };
      janela({ titulo: "Nova recorrência", classe: "modal--recorrencia", passo: passoLista });
    }).catch((e) => ctx.toast(e.friendly, { tone: "error" }));
  }

  /* ---------------- Confirmar com senha ---------------- */
  function confirmarComSenha(cfg) {
    return new Promise((resolve) => {
      let resolvido = false;
      const fim = (v) => { if (!resolvido) { resolvido = true; resolve(v); } };
      janela({
        titulo: cfg.titulo,
        onClose: () => fim(null),
        passo: (api) => {
          const senha = UI.Input({ type: "password", autocomplete: "current-password", placeholder: "Sua senha" });
          senha.dataset.autofocus = "";
          const confirmar = () => { if (!senha.value) { senha.focus(); return; } fim(senha.value); api.fechar(); };
          senha.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); confirmar(); } });
          return {
            corpo: h("div", { class: "zm__form" }, h("p", { class: "modal__text" }, cfg.mensagem), UI.Field("Senha", senha)),
            botoes: [{ label: "Cancelar", onClick: () => api.fechar() }, { label: cfg.botao || "Confirmar", perigo: true, onClick: confirmar }],
          };
        },
      });
    });
  }

  ZoZo.modais = { janela, novoPerfil, novaCategoria, criarGrupo, novaConta, novaRecorrencia, frequencia, confirmarComSenha, seletorIcone, Interruptor };
})(window.ZoZo);
