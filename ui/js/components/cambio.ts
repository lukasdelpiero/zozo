/* =============================================================
   ZoZo — Multicâmbio (Real, Euro, Dólar)
   ------------------------------------------------------------
   Ligado em Configurações › Geral › Multicâmbio. Cada moeda é um
   "mundo" separado (transações, contas, cartões, categorias, perfis,
   recorrências, orçamentos e faturas) dentro do MESMO documento
   cifrado — js/data/servico.js filtra pela moeda escolhida. Nada é
   convertido e nada é apagado ao trocar ou desativar.
   • Seletor no menu lateral (acima da foto e da engrenagem)
   • 1ª vez numa moeda: oferece levar transações para ela (sem conversão)
   ============================================================= */
(function (ZoZo: ZoZoGlobal) {
  "use strict";
  const { h, s, mount } = ZoZo.dom;
  const UI = ZoZo.ui;
  const F = ZoZo.format;
  const A = ZoZo.messages.ACTIONS;
  const store = ZoZo.store;

  type InfoMoeda = { codigo: CodigoMoeda; nome: string; simbolo: string };
  /** Transação na janela de transferência (da moeda atual ou de outra) */
  type ItemTransferencia = { id: Id; data: string; descricao: string; valor: number; moeda?: Moeda };
  const MOEDAS: InfoMoeda[] = [
    { codigo: "BRL", nome: "Real", simbolo: "R$" },
    { codigo: "EUR", nome: "Euro", simbolo: "€" },
    { codigo: "USD", nome: "Dólar", simbolo: "$" },
  ];

  /* Classes (Tailwind) */
  const T = {
    // seletor do menu lateral: três bandeiras lado a lado; com o menu só de ícones (≤ 900 px), uma embaixo da outra e sem o título
    seletor: "tw:grid tw:gap-1.5",
    seletorTitulo: "tw:text-[15px] tw:font-[620] tw:tracking-normal tw:normal-case tw:text-(--sidebar-fg-muted) tw:pl-1 tw:estreito:hidden",
    opcoes: "tw:grid tw:grid-cols-[repeat(3,minmax(0,1fr))] tw:gap-1 tw:estreito:grid-cols-[1fr]",
    opcao: "tw:h-8 tw:grid tw:place-items-center tw:[border:0] tw:rounded-lg tw:bg-transparent tw:cursor-pointer "
      + "tw:[&:not([aria-pressed=true]):hover]:bg-(--sidebar-hover) tw:aria-pressed:bg-[rgba(255,255,255,0.18)] "
      + "tw:focus-visible:outline-2 tw:focus-visible:outline-white tw:focus-visible:-outline-offset-2",
    bandeira: "tw:block tw:rounded-[2px] tw:[box-shadow:0_0_0_1px_rgba(0,0,0,.12)]",
    // janelas de transferência
    aviso: "tw:mt-0 tw:mx-0 tw:mb-3",
    avisoLaranja: "tw:flex tw:items-start tw:gap-2 tw:mt-0 tw:mx-0 tw:mb-3 tw:py-2 tw:px-3 tw:rounded-lg tw:bg-(--color-alerta-soft) tw:text-(--color-alerta) "
      + "tw:text-[13px] tw:font-[550] tw:leading-[1.4] tw:[&_.icon]:flex-none tw:[&_.icon]:mt-px",
    modo: "tw:flex tw:justify-center tw:mb-3",
    moeda: "tw:inline-flex tw:items-center tw:gap-1.5",
    marcar: "tw:size-4 tw:[accent-color:var(--color-primary)]",
  };

  /* Bandeiras desenhadas em SVG (o Windows não mostra emoji de bandeira) */
  /** Moeda pelo código (desconhecido: Real) */
  const moedaDe = (codigo: unknown): InfoMoeda => MOEDAS.find((m) => m.codigo === codigo) || MOEDAS[0];
  const svg = (...filhos: FilhoDom[]) => s("svg", { viewBox: "0 0 20 14", width: "20", height: "14", class: T.bandeira, "aria-hidden": "true" }, ...filhos);
  const BANDEIRAS: Record<string, () => SVGElement> = {
    BRL: () => svg(s("rect", { width: "20", height: "14", rx: "2", fill: "#009c3b" }),
      s("polygon", { points: "10,1.6 18.4,7 10,12.4 1.6,7", fill: "#ffdf00" }),
      s("circle", { cx: "10", cy: "7", r: "3.1", fill: "#002776" })),
    EUR: () => svg(s("rect", { width: "20", height: "14", rx: "2", fill: "#003399" }),
      ...Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * 2 * Math.PI;
        return s("circle", { cx: (10 + 4.2 * Math.sin(a)).toFixed(2), cy: (7 - 4.2 * Math.cos(a)).toFixed(2), r: "0.75", fill: "#ffcc00" });
      })),
    USD: () => svg(s("rect", { width: "20", height: "14", rx: "2", fill: "#fff" }),
      ...[0, 2, 4, 6, 8, 10, 12].map((y) => s("rect", { y: String(y), width: "20", height: "1.08", fill: "#b22234" })),
      s("rect", { width: "8.6", height: "7.56", fill: "#3c3b6e" }),
      ...[[2, 2], [4.3, 2], [6.6, 2], [3.1, 3.9], [5.4, 3.9], [2, 5.7], [4.3, 5.7], [6.6, 5.7]].map(([x, y]) => s("circle", { cx: String(x), cy: String(y), r: "0.55", fill: "#fff" }))),
  };

  const config = (): Partial<RespostaConfig> => store.get().data.config || {};
  const ligado = () => !!config().multicambio;

  /** Aplica o símbolo da moeda e redesenha tudo (os números não mudam) */
  function aplicarMoeda(ctx: ContextoApp, codigo: string): Promise<unknown> {
    F.definirMoeda(codigo);
    document.documentElement.dataset.moeda = codigo;
    ctx.invalidate(["dashboard", "lancamentos", "contas", "investimentos", "categorias", "recorrencias", "perfis"]);
    ctx.detail.close({ silencioso: true });
    const atual = store.get().currentPage;
    return ctx.loadData("contas", A.getContas, null, { force: true }).catch(() => null).then(() => ctx.navigate(atual || "dashboard", { force: true }));
  }

  /** Troca a moeda. Na 1ª vez numa moeda (≠ Real), oferece levar transações da moeda anterior para ela. */
  function trocar(ctx: ContextoApp, codigo: CodigoMoeda): Promise<unknown> {
    const cfg = config();
    if (!cfg.multicambio || cfg.moeda === codigo) return Promise.resolve();
    const primeiraVez = codigo !== "BRL" && !(cfg.moedasIniciadas || ["BRL"]).includes(codigo);
    // Transferir transações para outra moeda: só contas liberadas (segredo RECURSOS_CAMBIO no servidor)
    // a lista é lida ANTES de trocar (são as transações da moeda atual)
    const anteriores = primeiraVez && ZoZo.recursos.cambio() ? ctx.bridge.request(A.getLancamentos).then((d): ItemTransferencia[] => d.lancamentos || []).catch((): ItemTransferencia[] => []) : Promise.resolve<ItemTransferencia[]>([]);
    const origem = moedaDe(cfg.moeda || "BRL");
    return anteriores.then((lista) => {
      // A tela troca assim que a escolha é aplicada na memória; a gravação no servidor segue em paralelo
      // (se falhar, avisa e volta para a moeda anterior)
      const gravacao = ctx.bridge.request(A.updateConfig, { moeda: codigo });
      gravacao.catch((e: ErroPonte) => {
        ctx.toast(e.friendly, { tone: "error" });
        ctx.loadData("config", A.getConfig, null, { force: true }).then((c) => aplicarMoeda(ctx, (c && c.moeda) || origem.codigo)).catch(() => null);
      });
      return ctx.loadData("config", A.getConfig, null, { force: true }).then(() => aplicarMoeda(ctx, codigo)).then(() => {
        const m = moedaDe(codigo);
        ctx.toast("Moeda: " + m.nome + " (" + m.simbolo + ").");
        if (primeiraVez && lista.length && ZoZo.recursos.cambio()) oferecerTransferencia(ctx, lista.map((l) => Object.assign({ moeda: origem.codigo }, l)), m, { primeiraVez: true });
      });
    }).catch((e: ErroPonte) => ctx.toast(e.friendly, { tone: "error" }));
  }

  /**
   * Botão de Transações: transferir entre moedas a qualquer momento.
   *  • Importar: traz transações da outra moeda para a escolhida no menu.
   *  • Enviar: manda transações da moeda escolhida para a outra.
   * A "outra" moeda fica no botão do canto inferior esquerdo (menu com as duas opções).
   */
  function abrirTransferencia(ctx: ContextoApp) {
    const atual = moedaDe(config().moeda || "BRL");
    const outras = MOEDAS.filter((m) => m.codigo !== atual.codigo);
    let modo = "importar", outra = outras[0];
    let lista: ItemTransferencia[] | null = null, termo = "", carga = 0;
    const marcadas = new Set<string>();
    const norm = (t: unknown) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    ZoZo.modais.janela({
      titulo: "Transferir entre moedas",
      classe: "modal--recorrencia modal--cambio",
      passo: function passo(api: ApiJanela) {
        const descricao = h("p", { class: [ZoZo.estrutura.modalTexto, T.aviso] });
        const busca = h("input", { type: "search", class: ZoZo.estrutura.janelaPesquisaCampo, placeholder: "Pesquisar", "aria-label": "Pesquisar transações" }) as HTMLInputElement;
        const itensEl = h("div", { class: ZoZo.estrutura.janelaListaSemRolagemLateral });
        const alternar = h("div", { class: T.modo });
        const moedaBtn = h("button", { type: "button", class: [ZoZo.pecasFn.botao("secondary", true), T.moeda], "aria-haspopup": "menu" });
        let botao: HTMLButtonElement | null = null;
        const contar = () => { if (botao) botao.disabled = !marcadas.size; };
        const origem = () => (modo === "importar" ? outra : atual);
        const destino = () => (modo === "importar" ? atual : outra);

        function desenharTopo() {
          mount(alternar, UI.Segmented([{ value: "enviar", label: "Enviar" }, { value: "importar", label: "Importar" }], modo,
            (v) => { if (v === modo) return; modo = v; recarregar(); }, { label: "Enviar ou importar", class: "segmented--pilulas" }));
          descricao.textContent = modo === "importar"
            ? "Selecione as transações em " + outra.nome + " que deseja importar para " + atual.nome + "."
            : "Selecione as transações em " + atual.nome + " que deseja enviar para " + outra.nome + ".";
          mount(moedaBtn, h("span", { class: "btn__label" }, outra.nome), ZoZo.icons.icon("chevron-down", { size: 13, stroke: 2.25 }));
        }
        function desenharLista() {
          if (!lista) { mount(itensEl, UI.Skeleton(4, { short: true })); return; }
          const itens = lista.filter((l) => !termo || norm(l.descricao).includes(termo)).slice(0, 400);
          mount(itensEl, itens.length ? itens.map((l) => {
            const cb = h("input", { type: "checkbox", class: T.marcar, "aria-label": "Transferir " + l.descricao }) as HTMLInputElement;
            cb.checked = marcadas.has(l.id);
            cb.addEventListener("change", () => { if (cb.checked) marcadas.add(l.id); else marcadas.delete(l.id); contar(); });
            return h("label", { class: ZoZo.estrutura.janelaLancMarcavel }, cb,
              h("span", { class: ZoZo.estrutura.janelaLancData, title: F.dataExtenso(l.data) }, F.dataCurta(l.data)),
              h("span", { class: ZoZo.estrutura.janelaLancNome }, h("span", null, l.descricao)),
              h("span", { class: ZoZo.estrutura.janelaLancValor }, origem().simbolo + " " + F.moedaEditavel(l.valor)));
          }) : h("p", { class: ZoZo.estrutura.menuVazio }, "Nenhuma transação em " + origem().nome + "."));
        }
        function recarregar() {
          lista = null; marcadas.clear(); contar(); desenharTopo(); desenharLista();
          const minha = ++carga;
          const pedido: Promise<ItemTransferencia[]> = modo === "importar"
            ? ctx.bridge.request(A.getLancamentosOutrasMoedas).then((r) => r.lancamentos.filter((l) => l.moeda === outra.codigo))
            : ctx.bridge.request(A.getLancamentos).then((r) => (r.lancamentos || []).slice().sort((a, b) => b.data.localeCompare(a.data)));
          pedido.then((ls) => { if (minha === carga) { lista = ls; desenharLista(); } })
            .catch((e: ErroPonte) => { if (minha === carga) mount(itensEl, UI.ErrorState(e.friendly)); });
        }
        moedaBtn.addEventListener("click", () => ZoZo.menu.abrir(moedaBtn, outras.map((m) => ({
          label: m.nome + " (" + m.simbolo + ")", check: m.codigo === outra.codigo,
          onClick: () => { if (m.codigo !== outra.codigo) { outra = m; recarregar(); } },
        })), { posicao: "acima", checkEsquerda: true, label: "Outra moeda", largura: 200 }));
        busca.addEventListener("input", () => { termo = norm(busca.value.trim()); desenharLista(); });
        recarregar();

        return {
          titulo: "Transferir entre moedas",
          corpo: h("div", { class: ZoZo.estrutura.janelaEscolha },
            descricao,
            h("p", { class: T.avisoLaranja, role: "note" }, ZoZo.icons.icon("alerta", { size: 14 }), "O valor numérico não será convertido, apenas a moeda será alterada."),
            alternar,
            h("div", { class: ZoZo.estrutura.janelaPesquisa }, ZoZo.icons.icon("pesquisar", { size: 15 }), busca), itensEl),
          rodapeEsquerda: moedaBtn,
          botoes: [
            { label: "Cancelar", onClick: () => api.fechar() },
            { label: "Transferir", primario: true, desabilitado: true, ref: (b) => { botao = b; contar(); }, onClick: (btn) => {
              btn.disabled = true;
              ctx.bridge.request(A.transferirMoeda, { ids: Array.from(marcadas), destino: destino().codigo }).then(() => {
                api.fechar();
                return ctx.recarregarTudo();
              }).catch((e: ErroPonte) => { btn.disabled = false; ctx.toast(e.friendly, { tone: "error" }); });
            } },
          ],
        };
      },
    });
  }
  const disponivelTransferir = () => ligado() && ZoZo.recursos.cambio();

  /** Janela: escolher transações (de qualquer outra moeda) para levar a "destino". O valor não é convertido. */
  function oferecerTransferencia(ctx: ContextoApp, todas: ItemTransferencia[], destino: InfoMoeda, opts?: { primeiraVez?: boolean }) {
    const o = opts || {};
    const simbolo = (codigo: unknown) => moedaDe(codigo).simbolo;
    const marcadas = new Set<string>();
    // as de hoje para trás primeiro (mais novas no topo); parcelas futuras no fim
    const hoje = F.iso(new Date());
    const lista = todas.slice().sort((a, b) => Number(a.data > hoje) - Number(b.data > hoje) || (a.data > hoje ? a.data.localeCompare(b.data) : b.data.localeCompare(a.data)));
    ZoZo.modais.janela({
      titulo: o.primeiraVez ? "Usar transações em " + destino.nome + "?" : "Trazer transações para " + destino.nome,
      classe: "modal--recorrencia modal--cambio",
      passo: function passo(api: ApiJanela) {
        let termo = "";
        const norm = (t: unknown) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
        const busca = h("input", { type: "search", class: ZoZo.estrutura.janelaPesquisaCampo, placeholder: "Pesquisar", "aria-label": "Pesquisar transações" }) as HTMLInputElement;
        const itensEl = h("div", { class: ZoZo.estrutura.janelaListaSemRolagemLateral });
        let botao: HTMLButtonElement | null = null;
        const contar = () => { if (botao) botao.disabled = !marcadas.size; };          // só "Transferir", sem contador
        const desenhar = () => {
          const itens = lista.filter((l) => !termo || norm(l.descricao).includes(termo)).slice(0, 400);
          mount(itensEl, itens.length ? itens.map((l) => {
            const cb = h("input", { type: "checkbox", class: T.marcar, "aria-label": "Transferir " + l.descricao }) as HTMLInputElement;
            cb.checked = marcadas.has(l.id);
            cb.addEventListener("change", () => { if (cb.checked) marcadas.add(l.id); else marcadas.delete(l.id); contar(); });
            return h("label", { class: ZoZo.estrutura.janelaLancMarcavel }, cb,
              h("span", { class: ZoZo.estrutura.janelaLancData, title: F.dataExtenso(l.data) }, F.dataCurta(l.data)),
              h("span", { class: ZoZo.estrutura.janelaLancNome }, h("span", null, l.descricao)),
              h("span", { class: ZoZo.estrutura.janelaLancValor }, simbolo(l.moeda) + " " + F.moedaEditavel(l.valor)));
          }) : h("p", { class: ZoZo.estrutura.menuVazio }, "Nenhuma transação encontrada."));
        };
        busca.addEventListener("input", () => { termo = norm(busca.value.trim()); desenhar(); });
        desenhar();
        return {
          titulo: o.primeiraVez ? "Usar transações em " + destino.nome + "?" : "Trazer transações para " + destino.nome,
          corpo: h("div", { class: ZoZo.estrutura.janelaEscolha },
            h("p", { class: [ZoZo.estrutura.modalTexto, T.aviso] }, "Selecione as transações que deseja transferir para sua conta em " + destino.nome + "."),
            h("div", { class: ZoZo.estrutura.janelaPesquisa }, ZoZo.icons.icon("pesquisar", { size: 15 }), busca), itensEl),
          botoes: [
            { label: o.primeiraVez ? "Agora não" : "Cancelar", onClick: () => api.fechar() },
            { label: "Transferir", primario: true, desabilitado: true, ref: (b) => { botao = b; contar(); }, onClick: (btn) => {
              btn.disabled = true;
              ctx.bridge.request(A.transferirMoeda, { ids: Array.from(marcadas) }).then((r: { transferidos: number }) => {
                api.fechar();
                ctx.toast(r.transferidos === 1 ? "1 transação transferida." : r.transferidos + " transações transferidas.");
                return ctx.recarregarTudo();
              }).catch((e: ErroPonte) => { btn.disabled = false; ctx.toast(e.friendly, { tone: "error" }); });
            } },
          ],
        };
      },
    });
  }

  /** Grade "Câmbio" do menu lateral (só com o multicâmbio ligado) */
  function Seletor(ctx: ContextoApp) {
    if (!ligado()) return null;
    const atual = config().moeda || "BRL";
    return h("div", { class: T.seletor, role: "group", "aria-label": "Câmbio" },
      h("span", { class: T.seletorTitulo }, "Câmbio"),
      h("div", { class: T.opcoes }, MOEDAS.map((m) => h("button", {
        type: "button", class: T.opcao, "aria-pressed": String(m.codigo === atual),
        title: m.nome + " (" + m.simbolo + ")", "aria-label": m.nome, onClick: () => trocar(ctx, m.codigo),
      }, BANDEIRAS[m.codigo]()))));
  }

  /** Configurações › Geral › Multicâmbio */
  function SecaoConfig(ctx: ContextoApp, cfg: Partial<RespostaConfig>) {
    const P = ZoZo.pecas;
    return h("div", { class: P.cfgLinha },
      h("div", { class: P.cfgTexto },
        h("span", { class: P.cfgTitulo }, "Ativar multicâmbio"),
        h("span", { class: P.cfgSub }, "Trabalhar com diferentes câmbios (Real, Euro e Dólar)")),
      h("div", { class: [P.cfgDireita, P.ctxInterruptorAjustado] }, ZoZo.modais.Interruptor("", !!cfg.multicambio, (v) => ctx.bridge.request(A.updateConfig, { multicambio: v })
        .then(() => ctx.loadData("config", A.getConfig, null, { force: true }))
        .then((c) => { ctx.toast(v ? "Multicâmbio ativado: escolha a moeda no menu lateral." : "Multicâmbio desativado"); return aplicarMoeda(ctx, (c && c.moeda) || "BRL"); })
        .catch((e: ErroPonte) => ctx.toast(e.friendly, { tone: "error" })), "Ativar multicâmbio")));
  }

  ZoZo.cambio = { Seletor, SecaoConfig, aplicarMoeda, trocar, abrirTransferencia, disponivelTransferir, MOEDAS };
})(window.ZoZo);
