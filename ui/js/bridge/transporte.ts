/* =============================================================
   ZoZo — Transporte da ponte (interface → host)
   ------------------------------------------------------------
   Única porta de saída da interface: tudo vira mensagem JSON.

   Modos:
   • web   → versão publicada (bridge/host-web.ts + API Python no Cloudflare)
   • mock  → modo demonstração (pasta mock: só existe no desenvolvimento;
             usado ao abrir o index.html direto do disco ou com ?mock=1)
   • none  → sem host: toda requisição falha com mensagem amigável
   TypeScript: tipos em src/globais.d.ts (ZoZoBridge).
   ============================================================= */
(function (ZoZo: ZoZoGlobal) {
  "use strict";
  const M = ZoZo.messages;
  const TIMEOUT_MS = 60000;

  const doDisco = location.protocol === "file:";
  const pedeMock = /[?&]mock=1\b/.test(location.search);
  const mock: HostPonte | undefined = ZoZo.mock && ZoZo.mock.host;
  const webHost: HostPonte | undefined = ZoZo.webHost;
  const mode: ModoPonte = mock && (pedeMock || doDisco || !webHost) ? "mock" : webHost && !doDisco ? "web" : "none";
  const alvo: HostPonte | null = mode === "web" ? webHost || null : mode === "mock" ? mock || null : null;

  function toFriendlyError(action: string, error: RespostaPonte["error"] | null | undefined): ErroPonte {
    const code = (error && error.code) || "UNKNOWN_ERROR";
    // Detalhes seguros que a interface usa: segundos de espera do bloqueio e se a próxima tentativa pede CAPTCHA
    const extra = { espera: error && Number(error.espera) > 0 ? Number(error.espera) : 0, captcha: !!(error && error.captcha) };
    if (M.FRIENDLY[code]) return Object.assign(new M.BridgeError(code, M.FRIENDLY[code]), extra);
    // Mensagens técnicas vindas do host nunca são exibidas.
    if (error) ZoZo.log.info("Erro do host", action, code);
    const isRead = /^get/.test(action) || action === M.ACTIONS.loadUserData;
    // O código (nome interno, nunca detalhe técnico) ajuda a identificar o problema quando o usuário relata
    const base = isRead ? M.FRIENDLY.LOAD_FAILED : M.FRIENDLY.OPERATION_FAILED;
    const texto = /^[A-Z0-9_]{3,40}$/.test(code) && code !== "UNKNOWN_ERROR" ? base.replace(/\.$/, "") + " (código " + code + ")." : base;
    return Object.assign(new M.BridgeError(code, texto), extra);
  }

  /**
   * request(action, data) → Promise<data>
   * Rejeita sempre com BridgeError contendo apenas texto amigável.
   */
  function request<K extends NomeAcao>(action: K, data?: unknown, opts?: OpcoesPedido): Promise<RespostaDe<K>> {
    // Ações de dados são atendidas pelo serviço de dados (que grava via host)
    if (ZoZo.servico && ZoZo.servico.atende(action)) {
      ZoZo.log.info("→ serviço", action);
      return ZoZo.servico.handle(action, data) as Promise<RespostaDe<K>>;
    }
    return requestHost(action as keyof RespostasHost, data, opts) as Promise<RespostaDe<K>>;
  }

  /** Envia diretamente ao host (sessão e armazenamento do documento cifrado) */
  function requestHost<K extends keyof RespostasHost>(action: K, data?: unknown, opts?: OpcoesPedido): Promise<RespostasHost[K]> {
    const req = M.createRequest(action, data);
    // Log sem payload para ações sensíveis (senha nunca aparece em log)
    ZoZo.log.info("→", action, req.requestId, M.SENSITIVE.has(action) ? "[dados protegidos]" : "");
    if (!alvo) return Promise.reject(toFriendlyError(action, { code: "STORAGE_UNAVAILABLE" }));
    const host = alvo;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new M.BridgeError("TIMEOUT", M.FRIENDLY.TIMEOUT)), (opts && opts.timeout) || TIMEOUT_MS);
      Promise.resolve()
        .then(() => host.handle(structuredClone(req)))
        .then((msg: RespostaPonte | null | undefined) => {
          clearTimeout(timer);
          // o host é o host-web.ts, conferido contra RespostasHost (ui/src/dados.d.ts)
          if (msg && msg.success) resolve((msg.data === undefined ? null : msg.data) as RespostasHost[K]);
          else reject(toFriendlyError(action, msg && msg.error));
        }, () => { clearTimeout(timer); reject(toFriendlyError(action, null)); });
    });
  }

  const api: ZoZoBridge = { request, requestHost, mode, isDemo: mode === "mock", ACTIONS: M.ACTIONS };
  ZoZo.bridge = api;
})(window.ZoZo);
