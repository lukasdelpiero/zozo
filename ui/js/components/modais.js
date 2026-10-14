/* =============================================================
   ZoZo — Janelas modais de criação
   Nova categoria · Criar novo grupo · Nova conta ·
   Nova recorrência (transação → frequência → parcelas) ·
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
   * abrir({ titulo, classe, passo(api) → { titulo?, corpo: node, rodapeEsquerda?: node, botoes: [{label, primario, perigo, onClick, desabilitado}] } })
   */
  function janela(cfg) {
    const E = ZoZo.estrutura;                 // visual em Tailwind (components/estrutura.ts)
    const corpoEl = h("div");
    const rodapeEl = h("div", { class: E.janelaRodape });
    const area = h("div", null, corpoEl, rodapeEl);
    const m = ZoZo.feedback.modal({ title: cfg.titulo, class: ["modal--zm", cfg.classe].filter(Boolean).join(" "), body: area, onClose: cfg.onClose });
    const api = {
      fechar: () => m.fechar(true),
      ir(passo) {
        const p = passo(api);
        const tituloEl = area.closest(".modal") && area.closest(".modal").querySelector("h2");
        if (p.titulo && tituloEl) tituloEl.textContent = p.titulo;
        mount(corpoEl, p.corpo);
        mount(rodapeEl, p.rodapeEsquerda ? h("div", { class: E.janelaRodapeEsquerda }, p.rodapeEsquerda) : null, (p.botoes || []).map((b) => {
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
    const btn = h("button", { type: "button", class: ZoZo.pecas.iconeEscolha, "aria-label": "Escolher ícone", "aria-haspopup": "dialog" }, atual);
    btn.addEventListener("click", () => ZoZo.emojiPicker.abrir(btn, { atual, aoEscolher: (e) => { atual = e; btn.textContent = e; aoMudar(e); } }));
    return btn;
  }

  /** Toggle com fundo roxo (cor da barra superior) */
  function Interruptor(rotulo, ligado, aoMudar, nomeAcessivel) {
    const input = h("input", { type: "checkbox", class: ZoZo.pecas.interruptorEntrada, role: "switch", "aria-label": rotulo ? undefined : nomeAcessivel });
    input.checked = !!ligado;
    input.addEventListener("change", () => aoMudar(input.checked));
    return h("label", { class: ZoZo.pecas.interruptorLinha }, h("span", { class: ZoZo.pecas.interruptorRotuloLinha }, rotulo), input, h("span", { class: ZoZo.pecas.interruptorTrilho, "aria-hidden": "true" }, h("span", { class: ZoZo.pecas.interruptorBolinha })));
  }

  function campoDinheiro(valor, placeholder) {
    const input = UI.Input({ inputmode: "decimal", placeholder: placeholder || "0,00", value: valor ? F.moedaEditavel(valor) : "" });
    return { input, el: h("div", { class: ZoZo.pecas.afixo }, h("span", { class: ZoZo.pecas.prefixo }, F.simbolo()), input), ler: () => F.parseMoeda(input.value) };
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
        const nome = UI.Input({ value: d.nome, placeholder: "Nome da categoria", class: ZoZo.estrutura.janelaNome });
        nome.maxLength = ZoZo.regras.limiteNome; nome.dataset.autofocus = "";
        const orc = campoDinheiro(0);
        const linhaOrc = h("div", { class: ZoZo.pecas.campo }, h("span", { class: ZoZo.pecas.campoRotulo }, "Orçamento"), orc.el);
        const erro = h("p", { class: ZoZo.pecas.erroForm, role: "alert" });
        const cores = h("div");
        const desenharCores = () => mount(cores, UI.ColorPicker(d.cor, (c) => { d.cor = c; desenharCores(); }, { label: "Cor", cheio: true, altura: 36 }));
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
          corpo: h("div", { class: ZoZo.estrutura.janelaForm },
            h("div", { class: ZoZo.estrutura.janelaLinha }, seletorIcone(d.icone, (e) => { d.icone = e; }), nome),
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
        const nome = UI.Input({ placeholder: "Nome do perfil", class: ZoZo.estrutura.janelaNome });
        nome.maxLength = ZoZo.regras.limiteNome; nome.dataset.autofocus = "";
        const erro = h("p", { class: ZoZo.pecas.erroForm, role: "alert" });
        const cores = h("div");
        const desenharCores = () => mount(cores, UI.ColorPicker(d.cor, (c) => { d.cor = c; desenharCores(); }, { label: "Cor do perfil", cheio: true, altura: 36 }));
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
          corpo: h("div", { class: ZoZo.estrutura.janelaForm }, nome, cores, erro),
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
        const erro = h("p", { class: ZoZo.pecas.erroForm, role: "alert" });
        const enviar = () => {
          const v = nome.value.trim();
          if (!v) { erro.textContent = "Informe o nome do grupo."; nome.focus(); return; }
          api.fechar(); aoCriar(v);
        };
        nome.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); enviar(); } });
        return {
          corpo: h("div", { class: ZoZo.estrutura.janelaForm }, UI.Field("Nome do grupo", nome), erro),
          botoes: [{ label: "Cancelar", onClick: () => api.fechar() }, { label: "Criar", primario: true, onClick: enviar }],
        };
      },
    });
  }

  /* ---------------- Nova conta ---------------- */
  const TITULOS_CONTA = { cartao: "Cartão de crédito", poupanca: "Conta poupança", corrente: "Conta corrente", investimento: "Investimento", emprestimo: "Empréstimo", outros: "Outros" };

  /** Nova conta. Cartão de crédito tem janela própria (sem troca de tipo); poupança e corrente dividem a
      mesma janela, alternando entre as duas. opts.aoCriar(conta): ex.: já escolher a conta numa transação */
  function novaConta(ctx, tipoInicial, opts) {
    const o = opts || {};
    const bancos = ["poupanca", "corrente"].includes(tipoInicial || "corrente");
    const d = { tipo: tipoInicial || "corrente", cor: ZoZo.regras.corSugerida(), tipoInvestimento: ZoZo.regras.tiposInvestimento[0] };
    janela({
      titulo: TITULOS_CONTA[d.tipo],
      classe: "modal--nova-conta",
      passo: function passo(api) {
        const campos = {};
        const add = (chave, rotulo, input, dica) => { campos[chave] = input; return UI.Field(rotulo, input.el || input, { hint: dica }); };
        const texto = (ph, max) => { const i = UI.Input({ placeholder: ph }); i.maxLength = max || ZoZo.regras.limiteNome; return i; };   // a instituição pode virar o nome da conta
        const diaInput = () => { const i = UI.Input({ type: "number", placeholder: "1 a 31", inputmode: "numeric" }); i.min = "1"; i.max = "31"; return i; };
        const saldo = campoDinheiro(0); campos.saldo = saldo;
        const erro = h("p", { class: ZoZo.pecas.erroForm, role: "alert" });
        const cores = h("div");
        const desenharCores = () => mount(cores, UI.ColorPicker(d.cor, (c) => { d.cor = c; desenharCores(); }, { label: "Cor", cheio: true, altura: 36 }));
        desenharCores();

        let linhas, lerEmprestimo = null;
        if (d.tipo === "emprestimo") {
          // Nome · Instituição · Valor contratado · 1º vencimento · Parcelas | Valor da parcela · Valor devido (+ juros)
          const contratado = campoDinheiro(0); campos.contratado = contratado;
          let vencimento = null;
          const vencCampo = ZoZo.calendario.Campo({ valor: null, rotulo: "1º vencimento", aoMudar: (iso) => { vencimento = iso; } });
          const parcelas = UI.Input({ type: "number", inputmode: "numeric", placeholder: "Ex.: 48" });
          Object.assign(parcelas, { min: "1", max: "600", step: "1" });
          contratado.input.setAttribute("aria-label", "Valor contratado");
          parcelas.addEventListener("keydown", (e) => { if ([",", ".", "-", "+", "e", "E"].includes(e.key)) e.preventDefault(); });   // só inteiros
          const valorParcela = UI.Input({ inputmode: "decimal", placeholder: "0,00" });
          const valorDevido = UI.Input({ inputmode: "decimal", placeholder: "0,00" });
          const resumo = h("p", { class: ZoZo.pecas.campoDica, "aria-live": "polite" });
          const num = (i) => { const n = F.parseMoeda(i.value); return Number.isFinite(n) && n >= 0 ? n : 0; };
          const qtd = () => (/^\d+$/.test(parcelas.value.trim()) ? Number(parcelas.value) : 0);
          // um valor puxa o outro: parcela × parcelas = devido (o último editado manda)
          let manda = "parcela";
          const recalcular = () => {
            const n = qtd();
            if (n >= 1) {
              if (manda === "parcela" && valorParcela.value.trim()) valorDevido.value = F.moedaEditavel(Math.round(num(valorParcela) * n * 100) / 100);
              else if (manda === "devido" && valorDevido.value.trim()) valorParcela.value = F.moedaEditavel(Math.round((num(valorDevido) / n) * 100) / 100);
            }
            const devido = num(valorDevido), juros = Math.max(0, Math.round((devido - num(contratado.input)) * 100) / 100);
            resumo.textContent = "Valor devido de " + F.moeda(devido) + " (inclui " + F.moeda(juros) + " de juros da operação).";
          };
          valorParcela.addEventListener("input", () => { manda = "parcela"; recalcular(); });
          valorDevido.addEventListener("input", () => { manda = "devido"; recalcular(); });
          [parcelas, contratado.input].forEach((i) => i.addEventListener("input", recalcular));
          recalcular();
          lerEmprestimo = () => {
            const n = parcelas.value.trim();
            if (!/^\d+$/.test(n) || Number(n) < 1 || Number(n) > 600) { parcelas.setAttribute("aria-invalid", "true"); parcelas.focus(); return "Parcelas: um número inteiro de 1 a 600."; }
            parcelas.removeAttribute("aria-invalid");
            return { saldo: num(valorDevido), emprestimo: { valorContratado: num(contratado.input), primeiroVencimento: vencimento, parcelas: Number(n), valorParcela: num(valorParcela) } };
          };
          linhas = [
            add("nome", "Nome", texto("Ex.: Financiamento do carro")),
            add("instituicao", "Instituição (opcional)", texto("Ex.: Banco do Brasil")),
            h("div", { class: ZoZo.pecas.linhaForm2 }, UI.Field("Valor contratado", contratado.el), UI.Field("1º vencimento", vencCampo)),
            UI.Field("Parcelas", parcelas),
            h("div", { class: "tw:h-px tw:bg-zz-border tw:my-1", role: "separator" }),
            h("div", { class: ZoZo.pecas.linhaForm2 }, UI.Field("Valor da parcela", valorParcela), UI.Field("Valor devido", valorDevido)),
            resumo,
          ];
        } else if (d.tipo === "cartao") {
          linhas = [
            add("instituicao", "Nome da instituição", texto("Ex.: Nubank")),
            add("nome", "Nome do cartão", texto("Ex.: Ultravioleta")),
            h("div", { class: ZoZo.pecas.linhaForm2 }, add("digitos", "4 últimos dígitos", texto("1234", 4)), UI.Field("Saldo (fatura atual)", saldo.el)),
            h("div", { class: ZoZo.pecas.linhaForm3 },
              add("limite", "Limite", campoDinheiro(0)),
              add("fechamento", "Fechamento", diaInput()),
              add("vencimento", "Vencimento", diaInput())),
          ];
        } else if (d.tipo === "poupanca" || d.tipo === "corrente") {
          linhas = [
            add("instituicao", "Nome da instituição", texto("Ex.: Itaú")),
            h("div", { class: ZoZo.pecas.linhaForm2 }, add("digitos", "4 últimos dígitos", texto("1234", 4)), UI.Field("Saldo", saldo.el)),
          ];
        } else {
          linhas = [
            add("nome", "Nome", texto(d.tipo === "investimento" ? "Ex.: XP Investimentos" : "Ex.: Carteira")),
            add("instituicao", "Instituição", texto("Opcional")),
            d.tipo === "investimento" ? add("tipoInvestimento", "Tipo de investimento", UI.Select(ZoZo.regras.tiposInvestimento.map((t) => ({ value: t, label: t })), { value: d.tipoInvestimento })) : null,
            UI.Field("Saldo", saldo.el),
          ];
        }
        const enviar = (btn) => {
          const v = (k) => (campos[k] ? (campos[k].ler ? campos[k].ler() : campos[k].value.trim()) : "");
          const inst = v("instituicao");
          const nome = d.tipo === "cartao" ? (v("nome") || inst) : (d.tipo === "poupanca" || d.tipo === "corrente") ? inst : v("nome");
          const dig = v("digitos");
          const emp = lerEmprestimo ? lerEmprestimo() : null;
          if (typeof emp === "string") { erro.textContent = emp; return; }
          const s = emp ? emp.saldo : saldo.ler();
          if (!nome) { erro.textContent = d.tipo === "cartao" ? "Informe a instituição ou o nome do cartão." : (d.tipo === "poupanca" || d.tipo === "corrente") ? "Informe o nome da instituição." : "Informe o nome."; return; }
          if (dig && !/^\d{4}$/.test(dig)) { erro.textContent = "Os 4 últimos dígitos devem ter exatamente 4 números."; return; }
          const dias = ["fechamento", "vencimento"].map(v);
          if (dias.some((x) => x !== "" && !(Number(x) >= 1 && Number(x) <= 31))) { erro.textContent = "Fechamento e vencimento: dias de 1 a 31."; return; }
          btn.disabled = true;
          ctx.bridge.request(A.createConta, { conta: {
            nome, tipo: d.tipo, ultimos4Digitos: dig, saldo: Number.isFinite(s) ? s : 0, cor: d.cor, instituicao: inst,
            limite: campos.limite ? campos.limite.ler() : null, fechamento: v("fechamento") || null, vencimento: v("vencimento") || null,
            tipoInvestimento: campos.tipoInvestimento ? campos.tipoInvestimento.value : null,
            emprestimo: emp ? emp.emprestimo : null,
          } }).then((r) => { api.fechar(); ctx.toast("Conta criada."); return ctx.recarregarTudo().then(() => { if (o.aoCriar && r && r.conta) o.aoCriar(r.conta); }); })
            .catch((e) => { erro.textContent = e.friendly; btn.disabled = false; });
        };
        return {
          titulo: TITULOS_CONTA[d.tipo],
          corpo: h("div", { class: ZoZo.estrutura.janelaForm },
            bancos ? UI.Segmented([{ value: "poupanca", label: "Poupança" }, { value: "corrente", label: "Corrente" }],
              d.tipo, (t) => { d.tipo = t; api.ir(passo); }, { label: "Tipo de conta", class: "segmented--pilulas" }) : null,
            linhas, h("div", { class: ZoZo.pecas.campo }, h("span", { class: ZoZo.pecas.campoRotulo }, "Cor"), cores), erro),
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
  function passoFrequencia(aoConfirmar, voltar, valorInicial) {
    let escolha = "mensal";
    return function passo(api) {
      const lista = h("div", { class: ZoZo.pecas.freqLista, role: "radiogroup", "aria-label": "Frequência" },
        FREQ_OPCOES.map(([v, t]) => {
          const input = h("input", { type: "radio", name: "zz-freq", value: v, class: ZoZo.pecas.freqRadio });
          input.checked = v === escolha;
          input.addEventListener("change", () => { escolha = v; atualizar(); });
          return h("label", { class: [ZoZo.pecas.freqItem, v === escolha && "is-active"] }, input, h("span", null, t));
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
            onClick: (btn) => (escolha === "parcelada" ? api.ir(passoParcelas(aoConfirmar, () => api.ir(passo), valorInicial)) : aoConfirmar({ recorrencia: escolha }, api, btn)) },
        ],
      };
    };
  }

  /** Mesma divisão do serviço de dados: a 1ª parcela leva a sobra dos centavos; da 2ª em diante, todas iguais */
  function previaParcelas(total, atual, qtd) {
    const c = Math.round(total * 100), base = Math.floor(c / qtd);
    if (!(base > 0)) return null;
    const primeira = atual === 1 ? c - base * (qtd - 1) : base;
    const restantes = qtd - atual + 1;
    if (primeira === base) return restantes + " × " + F.moeda(base / 100) + (atual > 1 ? " (da " + atual + "ª à " + qtd + "ª)" : "");
    return "1ª parcela " + F.moeda(primeira / 100) + " + " + (qtd - 1) + " × " + F.moeda(base / 100);
  }

  function passoParcelas(aoConfirmar, voltar, valorInicial) {
    return (api) => {
      // Valor total = o valor da transação (não se edita aqui: muda-se no próprio painel)
      const total = UI.Input({ inputmode: "decimal", placeholder: "0,00", value: valorInicial > 0 ? F.moedaEditavel(valorInicial) : "" });
      total.readOnly = true;
      total.tabIndex = -1;
      total.classList.add(...ZoZo.pecas.entradaLeitura.split(" "));   // só leitura: é o valor da transação
      const ini = UI.Input({ type: "number", inputmode: "numeric", placeholder: "1" });
      const fim = UI.Input({ type: "number", inputmode: "numeric", placeholder: "10" });
      [ini, fim].forEach((i) => { i.min = "1"; i.step = "1"; i.addEventListener("keydown", (e) => { if ([".", ",", "e", "-", "+"].includes(e.key)) e.preventDefault(); }); });
      ini.dataset.autofocus = "";
      const previa = h("p", { class: [ZoZo.pecas.campoDica, ZoZo.pecas.parcelasPrevia], "aria-live": "polite" });
      const erro = h("p", { class: ZoZo.pecas.erroForm, role: "alert" });
      const ler = () => ({ v: F.parseMoeda(total.value), a: Number(ini.value), b: Number(fim.value) });
      const atualizar = () => {
        const { v, a, b } = ler();
        previa.textContent = v > 0 && Number.isInteger(a) && Number.isInteger(b) && a >= 1 && b >= 2 && a <= b && b <= 999 ? (previaParcelas(v, a, b) || "") : "";
      };
      [ini, fim].forEach((i) => i.addEventListener("input", atualizar));
      return {
        titulo: "Parcelas",
        corpo: h("div", { class: ZoZo.estrutura.janelaForm },
          UI.Field("Valor total da compra", h("div", { class: ZoZo.pecas.afixo }, h("span", { class: ZoZo.pecas.prefixo }, F.simbolo()), total)),
          h("div", { class: ZoZo.pecas.linhaForm2 }, UI.Field("Parcela atual", ini), UI.Field("Total de parcelas", fim)),
          previa,
          erro),
        botoes: [
          { label: "Voltar", onClick: () => voltar() },
          { label: "Criar", primario: true, onClick: (btn) => {
            const { v, a, b } = ler();
            if (!(v > 0 && v < 1e12)) { erro.textContent = "Informe o valor da transação antes de parcelar."; return; }
            if (!(Number.isInteger(a) && Number.isInteger(b) && a >= 1 && b >= 2 && a <= b && b <= 999)) { erro.textContent = "Use números inteiros: parcela atual a partir de 1 e total maior ou igual à atual."; return; }
            if (!previaParcelas(v, a, b)) { erro.textContent = "O valor é pequeno demais para esse número de parcelas."; return; }
            aoConfirmar({ recorrencia: "parcelada", parcelaAtual: a, parcelaTotal: b, valorTotal: v }, api, btn);
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
      passo: passoFrequencia(o.aoEscolher ? (dados, api) => { api.fechar(); o.aoEscolher(dados); } : tornarRecorrente(ctx, lancamentoId, o.aoTerminar), null, o.valor),
    });
  }

  function novaRecorrencia(ctx) {
    ctx.loadData("lancamentos", A.getLancamentos).then((dados) => {
      const candidatos = (dados.lancamentos || []).filter((l) => l.tipo !== "recorrente" || String(l.serieId || "").startsWith("removida:")).slice(0, 300);
      const passoLista = (api) => {
        let termo = "";
        const norm = (t) => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
        const busca = h("input", { type: "search", class: ZoZo.estrutura.janelaPesquisaCampo, placeholder: "Pesquisar", "aria-label": "Pesquisar transações" });
        busca.dataset.autofocus = "";
        const lista = h("div", { class: ZoZo.estrutura.janelaLista });
        const desenhar = () => {
          const itens = candidatos.filter((l) => !termo || norm(l.descricao).includes(termo) || norm(l.categoria && l.categoria.nome).includes(termo));
          mount(lista, itens.length ? itens.map((l) => {
            const marca = l.tipo === "interno" ? "T" : l.tipo === "receita" ? "I" : null;
            const verde = l.tipo === "receita" || l.tipo === "estorno" || (l.tipo === "interno" && l.sentido === "entrada");
            return h("button", { type: "button", class: ZoZo.estrutura.janelaLanc, onClick: () => api.ir(passoFrequencia(tornarRecorrente(ctx, l.id, () => ctx.navigate("recorrencias")), () => api.ir(passoLista), l.valor)) },
              h("span", { class: ZoZo.estrutura.janelaLancData }, F.dataCurta(l.data)),
              h("span", { class: ZoZo.estrutura.janelaLancNome }, marca ? h("span", { class: ZoZo.pecas.letra }, marca) : null, h("span", null, l.descricao)),
              l.categoria ? h("span", { class: ZoZo.estrutura.janelaLancCat, style: { "--tag-color": F.cor(l.categoria.cor, "var(--palette-16)") }, title: l.categoria.nome }, l.categoria.icone || "•") : h("span"),
              h("span", { class: [ZoZo.estrutura.janelaLancValor, verde && "money--income"] }, F.moeda(l.valor)));
          }) : h("p", { class: ZoZo.estrutura.menuVazio }, "Nenhuma transação encontrada."));
        };
        busca.addEventListener("input", () => { termo = norm(busca.value.trim()); desenhar(); });
        desenhar();
        return {
          titulo: "Nova recorrência",
          corpo: h("div", { class: ZoZo.estrutura.janelaEscolha }, h("div", { class: ZoZo.estrutura.janelaPesquisa }, icon("pesquisar", { size: 15 }), busca), lista),
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
          const senha = UI.Input({ type: "password", name: "password", autocomplete: "current-password", placeholder: "Sua senha" });
          senha.dataset.autofocus = "";
          const campoSenha = ZoZo.verificacao.ComRevelar(senha);              // oculta, com "mostrar" e sem copiar
          const confirmar = () => { if (!senha.value) { senha.focus(); return; } fim(senha.value); api.fechar(); };
          senha.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); confirmar(); } });
          return {
            corpo: h("div", { class: ZoZo.estrutura.janelaForm }, h("p", { class: ZoZo.estrutura.modalTexto }, cfg.mensagem), UI.Field("Senha", campoSenha)),
            botoes: [{ label: "Cancelar", onClick: () => api.fechar() }, { label: cfg.botao || "Confirmar", perigo: true, onClick: confirmar }],
          };
        },
      });
    });
  }

  ZoZo.modais = { janela, novoPerfil, novaCategoria, criarGrupo, novaConta, novaRecorrencia, frequencia, confirmarComSenha, seletorIcone, Interruptor };
})(window.ZoZo);
