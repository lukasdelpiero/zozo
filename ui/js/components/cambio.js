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
(function (ZoZo) {
  "use strict";
  const { h, s, mount } = ZoZo.dom;
  const UI = ZoZo.ui;
  const F = ZoZo.format;
  const A = ZoZo.messages.ACTIONS;
  const store = ZoZo.store;

  const MOEDAS = [
    { codigo: "BRL", nome: "Real", simbolo: "R$" },
    { codigo: "EUR", nome: "Euro", simbolo: "€" },
    { codigo: "USD", nome: "Dólar", simbolo: "$" },
  ];

  /* Bandeiras desenhadas em SVG (o Windows não mostra emoji de bandeira) */
  const svg = (...filhos) => s("svg", { viewBox: "0 0 20 14", width: "20", height: "14", class: "bandeira", "aria-hidden": "true" }, ...filhos);
  const BANDEIRAS = {
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

  const config = () => store.get().data.config || {};
  const ligado = () => !!config().multicambio;

  /** Aplica o símbolo da moeda e redesenha tudo (os números não mudam) */
  function aplicarMoeda(ctx, codigo) {
    F.definirMoeda(codigo);
    document.documentElement.dataset.moeda = codigo;
    ctx.invalidate(["dashboard", "lancamentos", "contas", "investimentos", "categorias", "recorrencias", "perfis"]);
    ctx.detail.close({ silencioso: true });
    const atual = store.get().currentPage;
    return ctx.loadData("contas", A.getContas, null, { force: true }).catch(() => null).then(() => ctx.navigate(atual || "dashboard", { force: true }));
  }

  /** Troca a moeda. Na 1ª vez numa moeda (≠ Real), oferece levar transações da moeda anterior para ela. */
  function trocar(ctx, codigo) {
    const cfg = config();
    if (!cfg.multicambio || cfg.moeda === codigo) return Promise.resolve();
    const primeiraVez = codigo !== "BRL" && !(cfg.moedasIniciadas || ["BRL"]).includes(codigo);
    // Transferir transações para outra moeda: só contas liberadas (segredo RECURSOS_CAMBIO no servidor)
    // a lista é lida ANTES de trocar (são as transações da moeda atual)
    const anteriores = primeiraVez && ZoZo.recursos.cambio() ? ctx.bridge.request(A.getLancamentos).then((d) => d.lancamentos || []).catch(() => []) : Promise.resolve([]);
    const origem = MOEDAS.find((m) => m.codigo === (cfg.moeda || "BRL"));
    return anteriores.then((lista) => ctx.bridge.request(A.updateConfig, { moeda: codigo }).then(() => {
      return ctx.loadData("config", A.getConfig, null, { force: true }).then(() => aplicarMoeda(ctx, codigo)).then(() => {
        const m = MOEDAS.find((x) => x.codigo === codigo);
        ctx.toast("Moeda: " + m.nome + " (" + m.simbolo + ").");
        if (primeiraVez && lista.length && ZoZo.recursos.cambio()) oferecerTransferencia(ctx, lista.map((l) => Object.assign({ moeda: origem.codigo }, l)), m, { primeiraVez: true });
      });
    })).catch((e) => ctx.toast(e.friendly, { tone: "error" }));
  }

  /** Botão de Transações: trazer, a qualquer momento, transações de outras moedas para a moeda escolhida */
  function abrirTransferencia(ctx) {
    const destino = MOEDAS.find((m) => m.codigo === (config().moeda || "BRL"));
    return ctx.bridge.request(A.getLancamentosOutrasMoedas).then((r) => {
      if (!r.lancamentos.length) { ctx.toast("Não há transações em outras moedas para trazer para " + destino.nome + "."); return; }
      oferecerTransferencia(ctx, r.lancamentos, destino, {});
    }).catch((e) => ctx.toast(e.friendly, { tone: "error" }));
  }
  const disponivelTransferir = () => ligado() && ZoZo.recursos.cambio();

  /** Janela: escolher transações (de qualquer outra moeda) para levar a "destino". O valor não é convertido. */
  function oferecerTransferencia(ctx, todas, destino, opts) {
    const o = opts || {};
    const simbolo = (codigo) => (MOEDAS.find((m) => m.codigo === codigo) || MOEDAS[0]).simbolo;
    const marcadas = new Set();
    // as de hoje para trás primeiro (mais novas no topo); parcelas futuras no fim
    const hoje = F.iso(new Date());
    const lista = todas.slice().sort((a, b) => (a.data > hoje) - (b.data > hoje) || (a.data > hoje ? a.data.localeCompare(b.data) : b.data.localeCompare(a.data)));
    ZoZo.modais.janela({
      titulo: o.primeiraVez ? "Usar transações em " + destino.nome + "?" : "Trazer transações para " + destino.nome,
      classe: "modal--recorrencia modal--cambio",
      passo: function passo(api) {
        let termo = "";
        const norm = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
        const busca = h("input", { type: "search", class: "zm__search-input", placeholder: "Pesquisar", "aria-label": "Pesquisar transações" });
        const itensEl = h("div", { class: "zm__list" });
        let botao = null;
        const contar = () => { if (botao) botao.disabled = !marcadas.size; };          // só "Transferir", sem contador
        const desenhar = () => {
          const itens = lista.filter((l) => !termo || norm(l.descricao).includes(termo)).slice(0, 400);
          mount(itensEl, itens.length ? itens.map((l) => {
            const cb = h("input", { type: "checkbox", class: "cambio__check", "aria-label": "Transferir " + l.descricao });
            cb.checked = marcadas.has(l.id);
            cb.addEventListener("change", () => { if (cb.checked) marcadas.add(l.id); else marcadas.delete(l.id); contar(); });
            return h("label", { class: "zm-lanc cambio__item" }, cb,
              h("span", { class: "zm-lanc__data", title: F.dataExtenso(l.data) }, F.dataCurta(l.data)),
              h("span", { class: "zm-lanc__nome" }, h("span", null, l.descricao)),
              h("span", { class: "zm-lanc__valor money" }, simbolo(l.moeda) + " " + F.moedaEditavel(l.valor)));
          }) : h("p", { class: "menu__empty" }, "Nenhuma transação encontrada."));
        };
        busca.addEventListener("input", () => { termo = norm(busca.value.trim()); desenhar(); });
        desenhar();
        return {
          titulo: o.primeiraVez ? "Usar transações em " + destino.nome + "?" : "Trazer transações para " + destino.nome,
          corpo: h("div", { class: "zm__pick" },
            h("p", { class: "modal__text cambio__aviso" }, "Selecione as transações que deseja transferir para sua conta em " + destino.nome + "."),
            h("div", { class: "zm__search" }, ZoZo.icons.icon("pesquisar", { size: 15 }), busca), itensEl),
          botoes: [
            { label: o.primeiraVez ? "Agora não" : "Cancelar", onClick: () => api.fechar() },
            { label: "Transferir", primario: true, desabilitado: true, ref: (b) => { botao = b; contar(); }, onClick: (btn) => {
              btn.disabled = true;
              ctx.bridge.request(A.transferirMoeda, { ids: Array.from(marcadas) }).then((r) => {
                api.fechar();
                ctx.toast(r.transferidos === 1 ? "1 transação transferida." : r.transferidos + " transações transferidas.");
                return ctx.recarregarTudo();
              }).catch((e) => { btn.disabled = false; ctx.toast(e.friendly, { tone: "error" }); });
            } },
          ],
        };
      },
    });
  }

  /** Grade "Câmbio" do menu lateral (só com o multicâmbio ligado) */
  function Seletor(ctx) {
    if (!ligado()) return null;
    const atual = config().moeda || "BRL";
    return h("div", { class: "cambio", role: "group", "aria-label": "Câmbio" },
      h("span", { class: "cambio__titulo" }, "Câmbio"),
      h("div", { class: "cambio__opcoes" }, MOEDAS.map((m) => h("button", {
        type: "button", class: ["cambio__opcao", m.codigo === atual && "is-active"], "aria-pressed": String(m.codigo === atual),
        title: m.nome + " (" + m.simbolo + ")", "aria-label": m.nome, onClick: () => trocar(ctx, m.codigo),
      }, BANDEIRAS[m.codigo]()))));
  }

  /** Configurações › Geral › Multicâmbio */
  function SecaoConfig(ctx, cfg) {
    return h("div", { class: "cfg-row" },
      h("div", { class: "cfg-row__text" },
        h("span", { class: "cfg-row__title" }, "Ativar multicâmbio"),
        h("span", { class: "cfg-row__sub" }, "Trabalhar com diferentes câmbios (Real, Euro e Dólar)")),
      h("div", { class: "cfg-row__right" }, ZoZo.modais.Interruptor("", !!cfg.multicambio, (v) => ctx.bridge.request(A.updateConfig, { multicambio: v })
        .then(() => ctx.loadData("config", A.getConfig, null, { force: true }))
        .then((c) => { ctx.toast(v ? "Multicâmbio ativado: escolha a moeda no menu lateral." : "Multicâmbio desativado"); return aplicarMoeda(ctx, (c && c.moeda) || "BRL"); })
        .catch((e) => ctx.toast(e.friendly, { tone: "error" })), "Ativar multicâmbio")));
  }

  ZoZo.cambio = { Seletor, SecaoConfig, aplicarMoeda, trocar, abrirTransferencia, disponivelTransferir, MOEDAS };
})(window.ZoZo);
