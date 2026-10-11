/* =============================================================
   ZoZo — Contrato de mensagens (JSON) entre a interface e o host
   ------------------------------------------------------------
   Requisição:  { type:"request",  action, requestId, data }
   Resposta:    { type:"response", action, requestId, success, data | error:{code,message} }
   ============================================================= */
(function (ZoZo) {
  "use strict";

  const ACTIONS = Object.freeze({
    // Sessão / armazenamento
    getSession: "getSession",
    registerUser: "registerUser",
    login: "login",
    verificar2FA: "verificar2FA",
    logout: "logout",
    getArmazenamento: "getArmazenamento",
    getGoogle: "getGoogle",

    // Dados
    getDashboard: "getDashboard",
    getLancamentos: "getLancamentos",
    createLancamento: "createLancamento",
    updateLancamento: "updateLancamento",
    deleteLancamento: "deleteLancamento",
    getContas: "getContas",
    getInvestimentos: "getInvestimentos",
    getCategorias: "getCategorias",
    getRecorrencias: "getRecorrencias",
    getPerfis: "getPerfis",

    // Usuário (Configurações)
    updateUser: "updateUser",
    changePassword: "changePassword",
    wipeUserData: "wipeUserData",
    deleteUser: "deleteUser",
    iniciar2FA: "iniciar2FA",
    confirmar2FA: "confirmar2FA",
    desativar2FA: "desativar2FA",

    // Documento do usuário (cifrado no navegador e guardado no banco SQL do Cloudflare)
    loadUserData: "loadUserData",
    saveUserData: "saveUserData",

    // Cadastros
    createConta: "createConta",
    updateConta: "updateConta",
    updateCicloCartao: "updateCicloCartao",
    deleteConta: "deleteConta",
    createCategoria: "createCategoria",
    updateCategoria: "updateCategoria",
    deleteCategoria: "deleteCategoria",
    createCategoriasSugeridas: "createCategoriasSugeridas",
    createPerfil: "createPerfil",
    updatePerfil: "updatePerfil",
    deletePerfil: "deletePerfil",

    // Lotes, gráficos dos painéis, perfil arquivado e configurações
    updateLancamentosEmLote: "updateLancamentosEmLote",
    deleteLancamentos: "deleteLancamentos",
    getContaHistorico: "getContaHistorico",
    getCategoriaSerie: "getCategoriaSerie",
    getSerieRecorrencia: "getSerieRecorrencia",
    arquivarPerfil: "arquivarPerfil",
    getConfig: "getConfig",
    updateConfig: "updateConfig",

    // Recorrências
    pagarRecorrencia: "pagarRecorrencia",
    encerrarRecorrencia: "encerrarRecorrencia",
    excluirRecorrencia: "excluirRecorrencia",
    tornarRecorrente: "tornarRecorrente",
    vincularRecorrencia: "vincularRecorrencia",
    desvincularRecorrencia: "desvincularRecorrencia",
    dividirLancamento: "dividirLancamento",

    // Fatura (antigo boleto; o PDF é gerado pela impressão do navegador)
    getBoletoData: "getBoletoData",

    // Grupos de categorias e multicâmbio
    updateGrupo: "updateGrupo",
    desagruparCategorias: "desagruparCategorias",
    transferirMoeda: "transferirMoeda",
    getLancamentosOutrasMoedas: "getLancamentosOutrasMoedas",
  });

  /** Ações cujo payload nunca pode aparecer em log */
  const SENSITIVE = new Set([ACTIONS.login, ACTIONS.verificar2FA, ACTIONS.confirmar2FA, ACTIONS.registerUser, ACTIONS.updateUser, ACTIONS.changePassword, ACTIONS.wipeUserData, ACTIONS.deleteUser, ACTIONS.saveUserData]);

  /** Mensagens amigáveis exibidas ao usuário (seções 4.1.8 e 56) */
  const FRIENDLY = Object.freeze({
    LOAD_FAILED: "Não foi possível carregar os dados.",
    SESSION_EXPIRED: "Sua sessão terminou. Entre novamente.",
    ACCESS_DENIED: "O servidor recusou o pedido. Abra o ZoZo pelo endereço oficial (usezozo.com.br) e tente de novo.",
    NOT_IMPLEMENTED: "Essa ação não está disponível nesta versão.",
    PASSWORD_BREACHED: "Essa senha já apareceu em vazamentos de dados na internet. Escolha outra senha.",
    SPLIT_INVALID: "A divisão não é válida. Confira valores, data, categorias e perfis.",
    CATEGORY_IN_USE: "Esta categoria já tem transações: ela não pode sair do orçamento.",
    DATA_CHANGED: "Seus dados foram alterados em outro dispositivo. A tela foi atualizada; refaça a última alteração.",
    OPERATION_FAILED: "Não foi possível concluir a operação.",
    INVALID_CREDENTIALS: "E-mail ou senha incorretos.",
    REGISTER_FAILED: "Não foi possível criar a conta com esse e-mail.",
    EMAIL_IN_USE: "Já existe uma conta com esse email.",
    STORAGE_UNAVAILABLE: "Não foi possível falar com o servidor do ZoZo. Verifique sua conexão e tente novamente.",
    DOCUMENT_TOO_LARGE: "Seus dados passaram do limite de armazenamento. Remova a foto do perfil ou transações antigas.",
    TIMEOUT: "Não foi possível concluir a operação.",
    PROFILE_ARCHIVED: "Esse perfil está arquivado. Desarquive para usá-lo em novas transações.",
    NAME_IN_USE: "Já existe um item com esse nome.",
    PIX_INVALID: "Confira a chave Pix (CPF válido, celular com DDD do Brasil começando por 9 ou e-mail), o nome (só letras) e a cidade.",
    WRONG_PASSWORD: "Senha incorreta.",
    WEAK_PASSWORD: "Use uma senha com pelo menos 8 caracteres.",
    TOO_MANY_ATTEMPTS: "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
    CAPTCHA_REQUIRED: "Confirme que você não é um robô para continuar.",
    CODE_INVALID: "Esse código não funcionou. Tente o código mais recente do seu aplicativo 2FA.",
    CODE_INVALID_AGAIN: "Algo deu errado. Por favor, tente novamente ou entre em contato com o suporte se o problema persistir.",
    "2FA_ALREADY_ON": "A autenticação de dois fatores já está ativada.",
    "2FA_NOT_PENDING": "Gere um novo código QR e tente novamente.",
    DEMO_READ_ONLY: "Isso não está disponível na conta de demonstração. Crie a sua conta para usar o ZoZo completo.",
    DEMO_LIMIT: "Na demonstração dá para criar só 1 item de cada tipo. Crie a sua conta para usar sem limites.",
    FEATURE_UNAVAILABLE: "Esse recurso não está disponível para a sua conta.",
    DOCUMENT_UNAVAILABLE: "Seus dados não foram encontrados agora e o backup não respondeu. Nada foi alterado: tente de novo em instantes.",
    DOCUMENT_INVALID_LOCKED: "Encontramos um valor ilegível nos seus dados. Para não alterar nada por engano, o ZoZo abriu só para leitura e não grava nenhuma mudança. Seus dados originais continuam guardados.",
    DOCUMENT_MISSING_LOCKED: "Seus dados não foram encontrados no servidor; por segurança, nada é salvo até você decidir. Para recomeçar do zero: Configurações › Conta › Apagar todos os dados.",
    DOCUMENT_NEWER: "Seus dados foram gravados por uma versão mais nova do ZoZo. Recarregue a página (Ctrl+F5) para continuar.",
    SAVE_UNCONFIRMED: "Não deu para confirmar se a última alteração foi salva. Os dados foram recarregados do servidor: confira e, se faltar, refaça.",
    CARD_CYCLE_INVALID: "Informe o fechamento e o vencimento juntos (dias de 1 a 31).",
    DEBIT_ACCOUNT: "Débito precisa de uma conta (corrente, poupança…). Cartão de crédito não pode.",
    CF_CHALLENGE: "A proteção do Cloudflare pediu uma nova verificação e bloqueou o pedido. Recarregue a página e tente de novo.",
  });

  let seq = 0;
  function newRequestId() {
    seq += 1;
    return Date.now().toString(36) + "-" + seq;
  }

  function createRequest(action, data) {
    return { type: "request", action, requestId: newRequestId(), data: data === undefined ? null : data };
  }

  function okResponse(req, data) {
    return { type: "response", action: req.action, requestId: req.requestId, success: true, data: data === undefined ? null : data };
  }

  function errorResponse(req, code, message) {
    return { type: "response", action: req.action, requestId: req.requestId, success: false, error: { code: code || "UNKNOWN_ERROR", message: message || FRIENDLY.OPERATION_FAILED } };
  }

  /** Erro amigável usado pela interface */
  class BridgeError extends Error {
    constructor(code, friendly) {
      super(friendly || FRIENDLY.OPERATION_FAILED);
      this.code = code || "UNKNOWN_ERROR";
      this.friendly = friendly || FRIENDLY.OPERATION_FAILED;
    }
  }

  ZoZo.messages = { ACTIONS, SENSITIVE, FRIENDLY, createRequest, okResponse, errorResponse, BridgeError };
})(window.ZoZo);
