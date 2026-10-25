/* =============================================================
   ZoZo — Janelas modais de criação
   Nova categoria · Criar novo grupo · Nova conta ·
   Nova recorrência (transação → frequência → parcelas) ·
   Confirmar com senha
   ============================================================= */
(function (ZoZo: ZoZoGlobal) {
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
  function janela(cfg: ConfigJanela): ApiJanela {
    const E = ZoZo.estrutura;                 // visual em Tailwind (components/estrutura.ts)
    const corpoEl = h("div");
    const rodapeEl = h("div", { class: E.janelaRodape });
    const area = h("div", null, corpoEl, rodapeEl);
    const m = ZoZo.feedback.modal({ title: cfg.titulo, class: ["modal--zm", cfg.classe].filter(Boolean).join(" "), body: area, onClose: cfg.onClose });
    const api: ApiJanela = {
      fechar: () => m.fechar(true),
      ir(passo) {
        const p = passo(api);
        const caixa = area.closest(".modal");
        const tituloEl = caixa && caixa.querySelector("h2");
        if (p.titulo && tituloEl) tituloEl.textContent = p.titulo;
        mount(corpoEl, p.corpo);
        mount(rodapeEl, p.rodapeEsquerda ? h("div", { class: E.janelaRodapeEsquerda }, p.rodapeEsquerda) : null, (p.botoes || []).map((b) => {
          const btn = UI.Button(b.label, { variant: b.primario ? "primary" : b.perigo ? "danger" : "secondary", onClick: () => b.onClick(btn), disabled: b.desabilitado });
          if (b.ref) b.ref(btn);
          return btn;
        }));
        requestAnimationFrame(() => { const f = corpoEl.querySelector<HTMLElement>("[data-autofocus], input:not([type=radio]):not([type=checkbox])"); if (f) f.focus(); });
      },
    };
    api.ir(cfg.passo);
    return api;
  }

  /** Botão de ícone (emoji) que abre o seletor de emojis */
  function seletorIcone(valor: string | null | undefined, aoMudar: (emoji: string) => void): HTMLElement {
    let atual = valor || "📦";
    const btn = h("button", { type: "button", class: ZoZo.pecas.iconeEscolha, "aria-label": "Escolher ícone", "aria-haspopup": "dialog" }, ZoZo.dom.emoji(atual));
    btn.addEventListener("click", () => ZoZo.emojiPicker.abrir(btn, { atual, aoEscolher: (e: string) => { atual = e; mount(btn, ZoZo.dom.emoji(e)); aoMudar(e); } }));
    return btn;
  }

  /** Toggle com fundo roxo (cor da barra superior) */
  function Interruptor(rotulo: string, ligado: boolean, aoMudar: (ligado: boolean) => void, nomeAcessivel?: string): HTMLElement {
    const input = h("input", { type: "checkbox", class: ZoZo.pecas.interruptorEntrada, role: "switch", "aria-label": rotulo ? undefined : nomeAcessivel }) as HTMLInputElement;
    input.checked = !!ligado;
    input.addEventListener("change", () => aoMudar(input.checked));
    return h("label", { class: ZoZo.pecas.interruptorLinha }, h("span", { class: ZoZo.pecas.interruptorRotuloLinha }, rotulo), input, h("span", { class: ZoZo.pecas.interruptorTrilho, "aria-hidden": "true" }, h("span", { class: ZoZo.pecas.interruptorBolinha })));
  }

  function campoDinheiro(valor: unknown, placeholder?: string): { input: HTMLInputElement; el: HTMLElement; ler: () => number } {
    const input = UI.Input({ inputmode: "decimal", placeholder: placeholder || "0,00", value: valor ? F.moedaEditavel(valor) : "" });
    return { input, el: h("div", { class: ZoZo.pecas.afixo }, h("span", { class: ZoZo.pecas.prefixo }, F.simbolo()), input), ler: () => F.parseMoeda(input.value) };
  }

  /* ---------------- Nova categoria ---------------- */
  function novaCategoria(ctx: ContextoApp, opts: any) {
    const o = opts || {};
    const config = store.get().data.config;
    const orcamentoAtivo = !(config && config.orcamentoAtivo === false);
    const d = { icone: o.icone || "📦", nome: o.nome || "", cor: ZoZo.regras.corSugerida(), incluir: true };
    janela({
      titulo: "Nova categoria",
      classe: "modal--nova-categoria",
      passo: (api: any) => {
        const nome = UI.Input({ value: d.nome, placeholder: "Nome da categoria", class: ZoZo.estrutura.janelaNome });
        nome.maxLength = ZoZo.regras.limiteNome; nome.dataset.autofocus = "";
        const orc = campoDinheiro(0);
        const linhaOrc = h("div", { class: ZoZo.pecas.campo }, h("span", { class: ZoZo.pecas.campoRotulo }, "Orçamento"), orc.el);
        const erro = h("p", { class: ZoZo.pecas.erroForm, role: "alert" });
        const cores = h("div");
        const desenharCores = () => mount(cores, UI.ColorPicker(d.cor, (c) => { d.cor = c; desenharCores(); }, { label: "Cor", cheio: true, altura: 36 }));
        desenharCores();
        linhaOrc.hidden = !orcamentoAtivo;
        let criar: HTMLButtonElement | undefined;
        const enviar = () => {
          d.nome = nome.value.trim();
          if (!d.nome) { erro.textContent = "Informe o nome da categoria."; nome.focus(); return; }
          const reservado = orc.ler();
          if (criar) criar.disabled = true;
          ctx.bridge.request(A.createCategoria, { categoria: { nome: d.nome, icone: d.icone, cor: d.cor, grupo: o.grupo || null,
            status: d.incluir ? "regular" : "excluida", reservado: Number.isFinite(reservado) && reservado > 0 ? reservado : 0 } })
            .then((r: any) => { api.fechar(); ctx.toast("Categoria criada."); return ctx.recarregarTudo().then(() => o.aoCriar && o.aoCriar(r.categoria)); })
            .catch((e: any) => { erro.textContent = e.friendly; if (criar) criar.disabled = false; });
        };
        nome.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); enviar(); } });
        return {
          corpo: h("div", { class: ZoZo.estrutura.janelaForm },
            h("div", { class: ZoZo.estrutura.janelaLinha }, seletorIcone(d.icone, (e: any) => { d.icone = e; }), nome),
            cores,
            Interruptor("Incluir no total e orçamento", d.incluir, (v) => { d.incluir = v; linhaOrc.hidden = !v || !orcamentoAtivo; }),
            linhaOrc, erro),
          botoes: [{ label: "Cancelar", onClick: () => api.fechar() }, { label: "Criar", primario: true, onClick: enviar, ref: (b: any) => { criar = b; } }],
        };
      },
    });
  }

  /* ---------------- Novo perfil ---------------- */
  function novoPerfil(ctx: ContextoApp, opts: any) {
    const o = opts || {};
    const d = { cor: ZoZo.regras.corSugerida() };
    janela({
      titulo: "Novo perfil",
      classe: "modal--novo-perfil",
      passo: (api: any) => {
        const nome = UI.Input({ placeholder: "Nome do perfil", class: ZoZo.estrutura.janelaNome });
        nome.maxLength = ZoZo.regras.limiteNome; nome.dataset.autofocus = "";
        const erro = h("p", { class: ZoZo.pecas.erroForm, role: "alert" });
        const cores = h("div");
        const desenharCores = () => mount(cores, UI.ColorPicker(d.cor, (c) => { d.cor = c; desenharCores(); }, { label: "Cor do perfil", cheio: true, altura: 36 }));
        desenharCores();
        const enviar = (btn: any) => {
          const v = nome.value.trim();
          if (!v) { erro.textContent = "Informe o nome do perfil."; nome.focus(); return; }
          if (btn) btn.disabled = true;
          ctx.bridge.request(A.createPerfil, { perfil: { nome: v, cor: d.cor, orcamento: 0 } })
            .then((r: any) => { api.fechar(); ctx.toast("Perfil criado."); return ctx.recarregarTudo().then(() => o.aoCriar && o.aoCriar(r.perfil)); })
            .catch((e: any) => { erro.textContent = e.friendly; if (btn) btn.disabled = false; });
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
  function criarGrupo(aoCriar: any) {
    janela({
      titulo: "Criar novo grupo",
      passo: (api: any) => {
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
  const TITULOS_CONTA: Record<string, string> = { cartao: "Cartão de crédito", poupanca: "Conta poupança", corrente: "Conta corrente", investimento: "Investimento", emprestimo: "Empréstimo", outros: "Outros" };

  /** Nova conta. Cartão de crédito tem janela própria (sem troca de tipo); poupança e corrente dividem a
      mesma janela, alternando entre as duas. opts.aoCriar(conta): ex.: já escolher a conta numa transação */
  function novaConta(ctx: ContextoApp, tipoInicial: any, opts: any) {
    const o = opts || {};
    const bancos = ["poupanca", "corrente"].includes(tipoInicial || "corrente");
    const d = { tipo: tipoInicial || "corrente", cor: ZoZo.regras.corSugerida(), tipoInvestimento: ZoZo.regras.tiposInvestimento[0] };
    janela({
      titulo: TITULOS_CONTA[d.tipo],
      classe: "modal--nova-conta",
      passo: function passo(api: any) {
        const campos: Record<string, any> = {};
        const add = (chave: string, rotulo: string, input: any, dica?: string) => { campos[chave] = input; return UI.Field(rotulo, input.el || input, { hint: dica }); };
        const texto = (ph: string, max?: number) => { const i = UI.Input({ placeholder: ph }); i.maxLength = max || ZoZo.regras.limiteNome; return i; };   // a instituição pode virar o nome da conta
        const diaInput = () => { const i = UI.Input({ type: "number", placeholder: "1 a 31", inputmode: "numeric" }); i.min = "1"; i.max = "31"; return i; };
        const saldo = campoDinheiro(0); campos.saldo = saldo;
        const erro = h("p", { class: ZoZo.pecas.erroForm, role: "alert" });
        const cores = h("div");
        const desenharCores = () => mount(cores, UI.ColorPicker(d.cor, (c) => { d.cor = c; desenharCores(); }, { label: "Cor", cheio: true, altura: 36 }));
        desenharCores();

        let linhas: FilhoDom[];
        let lerEmprestimo: (() => string | { saldo: number; emprestimo: Record<string, unknown> }) | null = null;
        if (d.tipo === "emprestimo") {
          // Nome · Instituição · Valor contratado · 1º vencimento · Parcelas | Valor da parcela · Valor devido (+ juros)
          const contratado = campoDinheiro(0); campos.contratado = contratado;
          let vencimento: string | null = null;
          const vencCampo = ZoZo.calendario.Campo({ valor: null, rotulo: "1º vencimento", aoMudar: (iso) => { vencimento = iso; } });
          const parcelas = UI.Input({ type: "number", inputmode: "numeric", placeholder: "Ex.: 48" });
          Object.assign(parcelas, { min: "1", max: "600", step: "1" });
          contratado.input.setAttribute("aria-label", "Valor contratado");
          parcelas.addEventListener("keydown", (e) => { if ([",", ".", "-", "+", "e", "E"].includes(e.key)) e.preventDefault(); });   // só inteiros
          const valorParcela = UI.Input({ inputmode: "decimal", placeholder: "0,00" });
          const valorDevido = UI.Input({ inputmode: "decimal", placeholder: "0,00" });
          const resumo = h("p", { class: ZoZo.pecas.campoDica, "aria-live": "polite" });
          const num = (i: any) => { const n = F.parseMoeda(i.value); return Number.isFinite(n) && n >= 0 ? n : 0; };
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
        const enviar = (btn: any) => {
          const v = (k: any) => (campos[k] ? (campos[k].ler ? campos[k].ler() : campos[k].value.trim()) : "");
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
          } }).then((r: any) => { api.fechar(); ctx.toast("Conta criada."); return ctx.recarregarTudo().then(() => { if (o.aoCriar && r && r.conta) o.aoCriar(r.conta); }); })
            .catch((e: any) => { erro.textContent = e.friendly; btn.disabled = false; });
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

  /* ---------------- Pagar fatura do cartão (botão no painel do cartão) ----------------
     Nome e 4 dígitos só para conferir; o valor começa com a fatura inteira (pode pagar uma parte); perfil e conta a
     debitar (corrente, poupança ou outros, com saldo). O serviço cria o Débito na conta e a Receita no cartão juntos
     e confere tudo de novo (js/data/servico.ts → pagarFatura). */
  const CONTAS_PAGAMENTO = ["corrente", "poupanca", "outros"];
  function pagarFatura(ctx: ContextoApp, cartao: any, aoPagar?: () => void) {
    const comPerfis = ZoZo.recursos.perfis();
    Promise.all([ctx.loadData("contas", A.getContas), comPerfis ? ctx.loadData("perfis", A.getPerfis) : null]).then(([dc, dp]: any[]) => {
      const fatura = Math.max(0, F.numero(cartao.valor));
      const contas = ((dc && dc.contas) || []).filter((c: any) => CONTAS_PAGAMENTO.includes(c.tipo) && !c.oculta);
      const perfis = ((dp && dp.perfis) || []).filter((p: any) => !p.arquivado);
      const centavos = (v: number) => Math.round(v * 100);
      const P = ZoZo.pecas;
      const FR = ZoZo.messages.FRIENDLY;
      let perfil: any = null, conta: any = null;
      janela({
        titulo: "Pagar fatura",
        classe: "modal--nova-conta modal--titulo-central",
        passo: (api) => {
          const leitura = (valor: string) => { const i = UI.Input({ value: valor, class: "input--leitura" }); i.readOnly = true; return i; };
          const valor = campoDinheiro(fatura);
          const erro = h("p", { class: P.erroForm, role: "alert" });
          // Restante a pagar: fatura − valor digitado (vermelho se passar da fatura)
          const restanteEl = h("span", { class: P.restanteValor, "aria-live": "polite" });
          const atualizarRestante = () => {
            const v = valor.ler();
            const resto = centavos(fatura) - (Number.isFinite(v) ? centavos(v) : 0);
            restanteEl.textContent = (resto < 0 ? "−" : "") + F.moeda(Math.abs(resto) / 100);
            restanteEl.classList.toggle("is-negative", resto < 0);
          };
          valor.input.addEventListener("input", atualizarRestante);
          atualizarRestante();

          // Perfil e conta: botões com cara de campo que abrem os MESMOS menus dos painéis (ZoZo.menu.perfis / contas)
          const campoMenu = () => h("button", { type: "button", class: [P.entrada, P.campoMenu], "aria-haspopup": "menu" });
          const seta = () => ZoZo.icons.icon("chevron-down", { size: 14, stroke: 2.25 });
          const perfilBtn = comPerfis ? campoMenu() : null;
          const desenharPerfil = () => {
            if (!perfilBtn) return;
            mount(perfilBtn, perfil ? UI.Tag(perfil.nome, perfil.cor, { class: "tag--upper" }) : h("span", { class: P.campoMenuVazio }, "Selecione o perfil"), seta());
            // nome acessível = o que está escrito + o campo (WCAG 2.5.3)
            perfilBtn.setAttribute("aria-label", perfilBtn.textContent!.trim() + ", perfil");
          };
          if (perfilBtn) perfilBtn.addEventListener("click", () => ZoZo.menu.perfis(perfilBtn, ctx, {
            perfis, atual: perfil && perfil.id,
            aoEscolher: (p: any) => { perfil = p; desenharPerfil(); },
            aoCriar: (np: any) => { perfis.push(np); perfil = np; desenharPerfil(); },
          }));
          const contaBtn = campoMenu();
          const saldoConta = h("span");
          const desenharConta = () => {
            mount(contaBtn, conta
              ? h("span", { class: P.lpContaLinha }, h("span", { class: P.lpContaPonto, style: { background: F.cor(conta.cor, "var(--palette-16)") } }),
                h("span", { class: "tw:truncate" }, conta.nome + (conta.ultimos4Digitos ? " " + conta.ultimos4Digitos : "")))
              : h("span", { class: P.campoMenuVazio }, contas.length ? "Selecione a conta" : "Nenhuma conta disponível"), seta());
            saldoConta.textContent = conta ? "Saldo: " + F.moeda(conta.valor) : "Corrente, poupança ou outros";
            contaBtn.setAttribute("aria-label", contaBtn.textContent!.trim() + ", conta a debitar");
          };
          contaBtn.addEventListener("click", () => ZoZo.menu.contas(contaBtn, {
            contas, atual: conta && conta.id, vazio: "Nenhuma conta corrente, poupança ou outros",
            aoEscolher: (c: any) => { conta = c; desenharConta(); },
            rodape: [{ icone: "mais", label: "Nova conta", onClick: () => novaConta(ctx, "corrente", { aoCriar: (nc: any) => {
              ctx.loadData("contas", A.getContas, null, { force: true }).then((r: any) => {
                const criada = ((r && r.contas) || []).find((x: any) => x.id === nc.id);
                if (criada && CONTAS_PAGAMENTO.includes(criada.tipo)) { contas.push(criada); conta = criada; desenharConta(); }
              }).catch(() => null);
            } }) }],
          }));
          desenharPerfil(); desenharConta();

          const enviar = (btn: HTMLButtonElement) => {
            const v = valor.ler();
            // conferência na tela (mensagem na hora); o serviço confere de novo
            const problema = !(Number.isFinite(v) && centavos(v) > 0) ? FR.PAYMENT_INVALID
              : centavos(v) > centavos(fatura) ? FR.PAYMENT_ABOVE_INVOICE
              : perfilBtn && perfis.length && !perfil ? FR.PROFILE_REQUIRED
              : !conta ? FR.PAYMENT_ACCOUNT
              : centavos(v) > centavos(F.numero(conta.valor)) ? FR.INSUFFICIENT_FUNDS : "";
            if (problema) { erro.textContent = problema; return; }
            erro.textContent = "";
            btn.disabled = true;
            ctx.bridge.request(A.pagarFatura, { cartaoId: cartao.id, contaId: conta.id, valor: v, perfilId: perfil ? perfil.id : null })
              .then(() => { api.fechar(); ctx.toast("Pagamento realizado com sucesso."); return ctx.recarregarTudo().then(() => { if (aoPagar) aoPagar(); }); })
              .catch((e: ErroPonte) => { erro.textContent = e.friendly; btn.disabled = false; });
          };
          const semFatura = !(fatura > 0);
          return {
            corpo: h("div", { class: ZoZo.estrutura.janelaForm },
              semFatura ? h("p", { class: ZoZo.estrutura.modalTexto }, FR.NO_INVOICE) : null,
              UI.Field("Nome", leitura(cartao.nome)),
              h("div", { class: P.linhaForm2 }, UI.Field("4 últimos dígitos", leitura(cartao.ultimos4Digitos || "—")), UI.Field("Saldo (fatura atual)", valor.el)),
              h("div", { class: perfilBtn ? P.linhaForm2 : undefined },
                perfilBtn ? UI.Field("Perfil", perfilBtn) : null,
                UI.Field("Conta a debitar", contaBtn, { hint: saldoConta })),
              erro),
            rodapeEsquerda: h("div", { class: P.restante }, h("span", null, "Restante a pagar"), restanteEl),
            botoes: [
              { label: "Cancelar", onClick: () => api.fechar() },
              { label: "Pagar", primario: true, desabilitado: semFatura, onClick: enviar },
            ],
          };
        },
      });
    }).catch((e: ErroPonte) => ctx.toast(e.friendly, { tone: "error" }));
  }

  /* ---------------- Pagamento recebido da fatura de um perfil (janela da fatura) ----------------
     O perfil pagou o que devia: a Receita entra na conta onde o dinheiro caiu (corrente, poupança ou outros), com o
     perfil e a categoria "Reembolso", e abate da fatura do mês. O valor começa com o que falta pagar (pode ser uma
     parte ou a mais). O serviço confere tudo de novo (js/data/servico.ts → receberFatura). */
  function receberFatura(ctx: ContextoApp, cfg: { perfil: { id: string; nome: string }; mes: number; ano: number; aPagar: number; aoReceber?: () => void }) {
    ctx.loadData("contas", A.getContas).then((dc: any) => {
      const contas = ((dc && dc.contas) || []).filter((c: any) => CONTAS_PAGAMENTO.includes(c.tipo) && !c.oculta);
      const P = ZoZo.pecas;
      const FR = ZoZo.messages.FRIENDLY;
      let conta: any = contas.length === 1 ? contas[0] : null;
      let data = F.iso(new Date());
      janela({
        titulo: "Registrar pagamento recebido",
        classe: "modal--nova-conta modal--titulo-central",
        passo: (api) => {
          const valor = campoDinheiro(cfg.aPagar > 0 ? cfg.aPagar : "");
          const erro = h("p", { class: P.erroForm, role: "alert" });
          const seta = () => ZoZo.icons.icon("chevron-down", { size: 14, stroke: 2.25 });
          const contaBtn = h("button", { type: "button", class: [P.entrada, P.campoMenu], "aria-haspopup": "menu" });
          const desenharConta = () => {
            mount(contaBtn, conta
              ? h("span", { class: P.lpContaLinha }, h("span", { class: P.lpContaPonto, style: { background: F.cor(conta.cor, "var(--palette-16)") } }),
                h("span", { class: "tw:truncate" }, conta.nome + (conta.ultimos4Digitos ? " " + conta.ultimos4Digitos : "")))
              : h("span", { class: P.campoMenuVazio }, contas.length ? "Selecione a conta" : "Nenhuma conta disponível"), seta());
            contaBtn.setAttribute("aria-label", contaBtn.textContent!.trim() + ", conta onde o dinheiro entrou");
          };
          contaBtn.addEventListener("click", () => ZoZo.menu.contas(contaBtn, {
            contas, atual: conta && conta.id, vazio: "Nenhuma conta corrente, poupança ou outros",
            aoEscolher: (c: any) => { conta = c; desenharConta(); },
          }));
          desenharConta();
          const dataCampo = ZoZo.calendario.Campo({ valor: data, rotulo: "data do pagamento", aoMudar: (v) => { if (F.parseData(v)) data = v; } });

          const enviar = (btn: HTMLButtonElement) => {
            const v = valor.ler();
            const problema = !(Number.isFinite(v) && Math.round(v * 100) > 0) ? FR.PAYMENT_INVALID : !conta ? FR.RECEIPT_ACCOUNT : "";
            if (problema) { erro.textContent = problema; return; }
            erro.textContent = "";
            btn.disabled = true;
            ctx.bridge.request(A.receberFatura, { perfilId: cfg.perfil.id, mes: cfg.mes, ano: cfg.ano, contaId: conta.id, valor: v, data })
              .then(() => { api.fechar(); ctx.toast("Pagamento registrado."); return ctx.recarregarTudo().then(() => { if (cfg.aoReceber) cfg.aoReceber(); }); })
              .catch((e: ErroPonte) => { erro.textContent = e.friendly; btn.disabled = false; });
          };
          return {
            corpo: h("div", { class: ZoZo.estrutura.janelaForm },
              h("p", { class: ZoZo.estrutura.modalTexto }, "Entra como receita no perfil " + cfg.perfil.nome + " e abate da fatura de "
                + F.mesNome(cfg.mes - 1).toLowerCase() + " de " + cfg.ano + "."),
              h("div", { class: P.linhaForm2 }, UI.Field("Valor recebido", valor.el), UI.Field("Data", dataCampo)),
              UI.Field("Conta onde o dinheiro entrou", contaBtn, { hint: "Corrente, poupança ou outros" }),
              erro),
            botoes: [
              { label: "Cancelar", onClick: () => api.fechar() },
              { label: "Registrar", primario: true, onClick: enviar },
            ],
          };
        },
      });
    }).catch((e: ErroPonte) => ctx.toast(e.friendly, { tone: "error" }));
  }

  /* ---------------- Nova recorrência ---------------- */
  const FREQ_OPCOES = [
    ["semanal", "A cada semana"], ["quinzenal", "A cada 2 semanas"], ["mensal", "A cada mês"], ["bimestral", "A cada 2 meses"],
    ["trimestral", "A cada 3 meses"], ["quadrimestral", "A cada 4 meses"], ["semestral", "A cada 6 meses"], ["anual", "A cada ano"], ["parcelada", "Parcelado"],
  ];

  /** Passo "Confirmar frequência" (e, se parcelado, "Parcelas"). aoConfirmar({recorrencia, parcelaAtual, parcelaTotal}) */
  function passoFrequencia(aoConfirmar: any, voltar: any, valorInicial: any) {
    let escolha = "mensal";
    return function passo(api: any) {
      const lista = h("div", { class: ZoZo.pecas.freqLista, role: "radiogroup", "aria-label": "Frequência" },
        FREQ_OPCOES.map(([v, t]) => {
          const input = h("input", { type: "radio", name: "zz-freq", value: v, class: ZoZo.pecas.freqRadio }) as HTMLInputElement;
          input.checked = v === escolha;
          input.addEventListener("change", () => { escolha = v; atualizar(); });
          return h("label", { class: [ZoZo.pecas.freqItem, v === escolha && "is-active"] }, input, h("span", null, t));
        }));
      let botaoAvancar: HTMLButtonElement | undefined;
      const atualizar = () => {
        lista.querySelectorAll(".freq-list__item").forEach((el) => el.classList.toggle("is-active", !!el.querySelector("input")?.checked));
        const rotulo = botaoAvancar && botaoAvancar.querySelector(".btn__label");
        if (rotulo) rotulo.textContent = escolha === "parcelada" ? "Próximo" : "Criar";
      };
      return {
        titulo: "Confirmar frequência",
        corpo: lista,
        botoes: [
          { label: voltar ? "Voltar" : "Cancelar", onClick: () => (voltar ? voltar(api) : api.fechar()) },
          { label: escolha === "parcelada" ? "Próximo" : "Criar", primario: true, ref: (b: any) => { botaoAvancar = b; },
            onClick: (btn: any) => (escolha === "parcelada" ? api.ir(passoParcelas(aoConfirmar, () => api.ir(passo), valorInicial)) : aoConfirmar({ recorrencia: escolha }, api, btn)) },
        ],
      };
    };
  }

  /** Mesma divisão do serviço de dados: a 1ª parcela leva a sobra dos centavos; da 2ª em diante, todas iguais */
  function previaParcelas(total: any, atual: any, qtd: any) {
    const c = Math.round(total * 100), base = Math.floor(c / qtd);
    if (!(base > 0)) return null;
    const primeira = atual === 1 ? c - base * (qtd - 1) : base;
    const restantes = qtd - atual + 1;
    if (primeira === base) return restantes + " × " + F.moeda(base / 100) + (atual > 1 ? " (da " + atual + "ª à " + qtd + "ª)" : "");
    return "1ª parcela " + F.moeda(primeira / 100) + " + " + (qtd - 1) + " × " + F.moeda(base / 100);
  }

  function passoParcelas(aoConfirmar: any, voltar: any, valorInicial: any) {
    return (api: any) => {
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
          { label: "Criar", primario: true, onClick: (btn: any) => {
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
  function tornarRecorrente(ctx: ContextoApp, lancamentoId: any, aoTerminar: any) {
    return (dados: any, api: any, btn: any) => {
      if (btn) btn.disabled = true;
      ctx.bridge.request(A.tornarRecorrente, Object.assign({ id: lancamentoId }, dados))
        .then(() => { api.fechar(); ctx.toast("Recorrência criada."); return ctx.recarregarTudo().then(() => aoTerminar && aoTerminar()); })
        .catch((e: any) => { ctx.toast(e.friendly, { tone: "error" }); if (btn) btn.disabled = false; });
    };
  }

  /** Só a escolha de frequência (ex.: lançamento aberto no painel). aoEscolher(dados) evita gravar (lançamento ainda não criado). */
  function frequencia(ctx: ContextoApp, lancamentoId: any, opts: any) {
    const o = opts || {};
    janela({
      titulo: "Confirmar frequência",
      classe: "modal--recorrencia",
      passo: passoFrequencia(o.aoEscolher ? (dados: any, api: any) => { api.fechar(); o.aoEscolher(dados); } : tornarRecorrente(ctx, lancamentoId, o.aoTerminar), null, o.valor),
    });
  }

  function novaRecorrencia(ctx: ContextoApp) {
    ctx.loadData("lancamentos", A.getLancamentos).then((dados: any) => {
      const candidatos = (dados.lancamentos || []).filter((l: any) => l.tipo !== "recorrente" || String(l.serieId || "").startsWith("removida:")).slice(0, 300);
      const passoLista = (api: any) => {
        let termo = "";
        const norm = (t: any) => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
        const busca = h("input", { type: "search", class: ZoZo.estrutura.janelaPesquisaCampo, placeholder: "Pesquisar", "aria-label": "Pesquisar transações" }) as HTMLInputElement;
        busca.dataset.autofocus = "";
        const lista = h("div", { class: ZoZo.estrutura.janelaLista });
        const desenhar = () => {
          const itens = candidatos.filter((l: any) => !termo || norm(l.descricao).includes(termo) || norm(l.categoria && l.categoria.nome).includes(termo));
          mount(lista, itens.length ? itens.map((l: any) => {
            const marca = l.tipo === "interno" ? "T" : l.tipo === "receita" ? "I" : null;
            const verde = l.tipo === "receita" || l.tipo === "estorno" || (l.tipo === "interno" && l.sentido === "entrada");
            return h("button", { type: "button", class: ZoZo.estrutura.janelaLanc, onClick: () => api.ir(passoFrequencia(tornarRecorrente(ctx, l.id, () => ctx.navigate("recorrencias")), () => api.ir(passoLista), l.valor)) },
              h("span", { class: ZoZo.estrutura.janelaLancData }, F.dataCurta(l.data)),
              h("span", { class: ZoZo.estrutura.janelaLancNome }, marca ? h("span", { class: ZoZo.pecas.letra }, marca) : null, h("span", null, l.descricao)),
              l.categoria ? h("span", { class: ZoZo.estrutura.janelaLancCat, style: { "--tag-color": F.cor(l.categoria.cor, "var(--palette-16)") }, title: l.categoria.nome }, ZoZo.dom.emoji(l.categoria.icone)) : h("span"),
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
    }).catch((e: any) => ctx.toast(e.friendly, { tone: "error" }));
  }

  /* ---------------- Confirmar com senha ---------------- */
  function confirmarComSenha(cfg: any) {
    return new Promise((resolve) => {
      let resolvido = false;
      const fim = (v: any) => { if (!resolvido) { resolvido = true; resolve(v); } };
      janela({
        titulo: cfg.titulo,
        onClose: () => fim(null),
        passo: (api: any) => {
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

  ZoZo.modais = { janela, novoPerfil, novaCategoria, criarGrupo, novaConta, novaRecorrencia, frequencia, confirmarComSenha, seletorIcone, Interruptor, pagarFatura, receberFatura };
})(window.ZoZo);
