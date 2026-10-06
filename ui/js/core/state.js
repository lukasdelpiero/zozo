/* =============================================================
   ZoZo — Estado central
   Estrutura técnica apenas. Não define regras de negócio.
   ============================================================= */
(function (ZoZo) {
  "use strict";

  function estadoInicial() {
    return {
      session: { status: "loading", authenticated: false, user: null, storageAvailable: null },
      currentPage: "dashboard",
      selectedItem: null,          // { tipo: "lancamento" | "conta" | ..., id }
      detailPanelOpen: false,
      data: {
        dashboard: null,
        lancamentos: null,
        contas: null,
        investimentos: null,
        categorias: null,
        recorrencias: null,
        perfis: null,
      },
      loading: {},                 // { [chave]: true }
      errors: {},                  // { [chave]: "mensagem amigável" }
      stale: {},                   // { [chave]: true } → recarregar na próxima visita
      ui: {
        filtros: null,             // filtros de Lançamentos (ver pages/lancamentos.js)
        selecionados: [],          // ids marcados em Lançamentos
        invExcluidas: [],          // contas fora do gráfico de Investimentos
        busca: "",
        intervaloContas: "AA",
        intervaloPatrimonio: "3M",
        intervaloInvestimentos: "1S",
        gruposFechados: {},        // { [chaveSecao]: true }
      },
    };
  }

  let state = estadoInicial();
  const listeners = new Set();

  function get() { return state; }

  /** set(parcial | fn(state) → parcial). Mescla rasa por chave de 1º nível e 2º nível para objetos. */
  function set(patch) {
    const p = typeof patch === "function" ? patch(state) : patch;
    if (!p) return;
    const next = Object.assign({}, state);
    Object.keys(p).forEach((k) => {
      const v = p[k];
      if (v && typeof v === "object" && !Array.isArray(v) && state[k] && typeof state[k] === "object" && !Array.isArray(state[k])) {
        next[k] = Object.assign({}, state[k], v);
      } else {
        next[k] = v;
      }
    });
    const prev = state;
    state = next;
    listeners.forEach((fn) => { try { fn(state, prev); } catch (e) { ZoZo.log && ZoZo.log.error("listener", e); } });
  }

  function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

  /** Limpa tudo que pertence à sessão (logout) */
  function reset() {
    const prev = state;
    state = estadoInicial();
    state.session = { status: "login", authenticated: false, user: null, storageAvailable: prev.session.storageAvailable };
    listeners.forEach((fn) => fn(state, prev));
  }

  ZoZo.store = { get, set, subscribe, reset };

  /* Log interno — nunca exibido ao usuário e nunca registra dados de formulário */
  ZoZo.log = {
    info: (...a) => { if (window.ZOZO_DEBUG) console.info("[ZoZo]", ...a); },
    error: (...a) => console.error("[ZoZo]", ...a),
  };
})(window.ZoZo);
