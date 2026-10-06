/* =============================================================
   ZoZo — Transporte da ponte (interface → host)
   ------------------------------------------------------------
   Única porta de saída da interface: tudo vira mensagem JSON.

   Modos:
   • web   → versão publicada (bridge/host-web.js + API Python no Cloudflare)
   • mock  → modo demonstração (pasta mock: só existe no desenvolvimento;
             usado ao abrir o index.html direto do disco ou com ?mock=1)
   • none  → sem host: toda requisição falha com mensagem amigável
   ============================================================= */
(function (ZoZo) {
  "use strict";
  const M = ZoZo.messages;
  const TIMEOUT_MS = 60000;

  const doDisco = location.protocol === "file:";
  const pedeMock = /[?&]mock=1\b/.test(location.search);
  const mock = ZoZo.mock && ZoZo.mock.host;
  const mode = mock && (pedeMock || doDisco || !ZoZo.webHost) ? "mock" : ZoZo.webHost && !doDisco ? "web" : "none";
  const alvo = mode === "web" ? ZoZo.webHost : mode === "mock" ? mock : null;

  function toFriendlyError(action, error) {
    const code = (error && error.code) || "UNKNOWN_ERROR";
    if (M.FRIENDLY[code]) return new M.BridgeError(code, M.FRIENDLY[code]);
    // Mensagens técnicas vindas do host nunca são exibidas.
    if (error) ZoZo.log.info("Erro do host", action, code);
    const isRead = /^get/.test(action) || action === M.ACTIONS.loadUserData;
    return new M.BridgeError(code, isRead ? M.FRIENDLY.LOAD_FAILED : M.FRIENDLY.OPERATION_FAILED);
  }

  /**
   * request(action, data) → Promise<data>
   * Rejeita sempre com BridgeError contendo apenas texto amigável.
   */
  function request(action, data, opts) {
    // Ações de dados são atendidas pelo serviço de dados (que grava via host)
    if (ZoZo.servico && ZoZo.servico.atende(action)) {
      ZoZo.log.info("→ serviço", action);
      return ZoZo.servico.handle(action, data);
    }
    return requestHost(action, data, opts);
  }

  /** Envia diretamente ao host (sessão e armazenamento do documento cifrado) */
  function requestHost(action, data, opts) {
    const req = M.createRequest(action, data);
    // Log sem payload para ações sensíveis (senha nunca aparece em log)
    ZoZo.log.info("→", action, req.requestId, M.SENSITIVE.has(action) ? "[dados protegidos]" : "");
    if (!alvo) return Promise.reject(toFriendlyError(action, { code: "STORAGE_UNAVAILABLE" }));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new M.BridgeError("TIMEOUT", M.FRIENDLY.TIMEOUT)), (opts && opts.timeout) || TIMEOUT_MS);
      Promise.resolve()
        .then(() => alvo.handle(structuredClone(req)))
        .then((msg) => {
          clearTimeout(timer);
          if (msg && msg.success) resolve(msg.data === undefined ? null : msg.data);
          else reject(toFriendlyError(action, msg && msg.error));
        }, () => { clearTimeout(timer); reject(toFriendlyError(action, null)); });
    });
  }

  ZoZo.bridge = { request, requestHost, mode, isDemo: mode === "mock", ACTIONS: M.ACTIONS };
})(window.ZoZo);
