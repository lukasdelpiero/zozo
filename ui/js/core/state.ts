/* =============================================================
   ZoZo — Estado central
   Estrutura técnica apenas. Não define regras de negócio.
   TypeScript: tipos em src/globais.d.ts (EstadoZoZo, ZoZoStore).
   ============================================================= */
(function (ZoZo: ZoZoGlobal) {
  "use strict";

  function estadoInicial(): EstadoZoZo {
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
        filtros: null,             // filtros de Lançamentos (ver pages/lancamentos.ts)
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
  const listeners = new Set<OuvinteEstado>();

  /** Avisa os ouvintes; um ouvinte com erro não impede os outros (nem o set/reset de terminar) */
  function avisar(prev: EstadoZoZo): void {
    listeners.forEach((fn) => { try { fn(state, prev); } catch (e) { ZoZo.log.error("listener", e); } });
  }

  function get(): EstadoZoZo { return state; }

  const ehObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

  /** set(parcial | fn(state) → parcial). Mescla rasa por chave de 1º nível e 2º nível para objetos. */
  function set(patch: ParcialEstado | ((s: EstadoZoZo) => ParcialEstado | null | undefined)): void {
    const p = typeof patch === "function" ? patch(state) : patch;
    if (!p) return;
    const atual = state as unknown as Record<string, unknown>;
    const next: Record<string, unknown> = Object.assign({}, atual);
    Object.keys(p).forEach((k) => {
      const v = (p as Record<string, unknown>)[k];
      next[k] = ehObjeto(v) && ehObjeto(atual[k]) ? Object.assign({}, atual[k], v) : v;
    });
    const prev = state;
    state = next as unknown as EstadoZoZo;
    avisar(prev);
  }

  function subscribe(fn: OuvinteEstado): () => boolean { listeners.add(fn); return () => listeners.delete(fn); }

  /** Limpa tudo que pertence à sessão (logout) */
  function reset(): void {
    const prev = state;
    state = estadoInicial();
    state.session = { status: "login", authenticated: false, user: null, storageAvailable: prev.session.storageAvailable };
    avisar(prev);
  }

  const store: ZoZoStore = { get, set, subscribe, reset };
  ZoZo.store = store;

  /**
   * Recursos da conta, informados pelo SERVIDOR no login (nunca decididos aqui):
   *   perfis / boleto / pix — Perfis, boletos e Pix (conta de demonstração e e-mails liberados no servidor)
   *   demo                  — conta de demonstração pública: dados gerados no navegador, nada é gravado
   * Esconder na interface é conforto; quem garante é o servidor (a conta demo é somente leitura lá).
   */
  const usuario = (): UsuarioSessao => state.session.user || {};
  const recurso = (nome: RecursoConta): boolean => !!(usuario().recursos && usuario().recursos![nome] === true);
  const recursos: ZoZoRecursos = {
    perfis: () => recurso("perfis"),
    boleto: () => recurso("boleto"),
    pix: () => recurso("pix"),
    cambio: () => recurso("cambio"),          // levar transações de uma moeda para outra (multicâmbio)
    demo: () => usuario().demo === true,
  };
  ZoZo.recursos = recursos;

  /* Log interno — nunca exibido ao usuário e nunca registra dados de formulário */
  ZoZo.log = {
    info: (...a: unknown[]) => { if ((window as unknown as { ZOZO_DEBUG?: boolean }).ZOZO_DEBUG) console.info("[ZoZo]", ...a); },
    error: (...a: unknown[]) => console.error("[ZoZo]", ...a),
  };
})(window.ZoZo);
