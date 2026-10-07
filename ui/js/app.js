/* =============================================================
   ZoZo — Inicialização
   Sessão → (Login | Cadastro) → Shell → páginas
   ============================================================= */
(function (ZoZo) {
  "use strict";
  const { h, mount } = ZoZo.dom;
  const store = ZoZo.store;
  const bridge = ZoZo.bridge;
  const A = ZoZo.messages.ACTIONS;
  const FR = ZoZo.messages.FRIENDLY;

  const authRoot = document.getElementById("auth-root");
  const shellRoot = document.getElementById("shell");

  /* ---------------- Contexto compartilhado com as páginas ---------------- */
  const inflight = {};
  const ctx = {
    bridge,
    toast: (...a) => ZoZo.feedback.toast(...a),

    /** Carrega uma coleção para state.data[key] (com loading e erro amigável) */
    loadData(key, action, payload, opts) {
      const o = opts || {};
      const st = store.get();
      if (!o.force && st.data[key] && !st.stale[key]) return Promise.resolve(st.data[key]);
      if (inflight[key] && !o.force) return inflight[key];
      store.set((s) => ({ loading: { [key]: true }, errors: { [key]: null } }));
      const p = bridge.request(action, payload).then((data) => {
        const stale = Object.assign({}, store.get().stale); delete stale[key];
        // Mesmo conteúdo: mantém o objeto atual (não redesenha nem interrompe animações)
        const atual = store.get().data[key];
        const igual = atual && JSON.stringify(atual) === JSON.stringify(data);
        store.set({ data: igual ? {} : { [key]: data }, loading: { [key]: false }, stale });
        return igual ? atual : data;
      }).catch((err) => {
        store.set({ loading: { [key]: false }, errors: { [key]: err.friendly || FR.LOAD_FAILED } });
        throw err;
      }).finally(() => { delete inflight[key]; });
      inflight[key] = p;
      return p;
    },

    /** Marca coleções como desatualizadas (recarregam na próxima visita) */
    invalidate(keys) {
      const stale = Object.assign({}, store.get().stale);
      keys.forEach((k) => { stale[k] = true; });
      store.set({ stale });
    },

    navigate: (id, opts) => ctx.router.navigate(id, opts),
    abrirConfiguracoes: (aba) => ZoZo.configuracoes.abrir(ctx, aba),

    /** Após qualquer alteração de dados: tudo fica desatualizado; recarrega a página atual e a sidebar */
    recarregarTudo() {
      ctx.invalidate(["dashboard", "lancamentos", "contas", "investimentos", "categorias", "recorrencias", "perfis", "config"]);
      const page = ctx.router.current();
      return Promise.allSettled([
        ctx.loadData("contas", A.getContas, null, { force: true }),
        page ? page.carregar(ctx, true) : null,
      ]);
    },

    /** Atualizar dados da página (seção 53) */
    refresh() {
      const st = store.get();
      store.set({ loading: { _refresh: true } });
      ctx.invalidate(Object.keys(st.data));
      const page = ctx.router.current();
      Promise.allSettled([
        ctx.loadData("contas", A.getContas, null, { force: true }),
        page ? page.carregar(ctx, true) : null,
      ]).finally(() => store.set({ loading: { _refresh: false } }));
    },
  };

  /* ---------------- Autenticação ---------------- */
  let authErro = null, authEmail = "";
  let turnstile = null;          // chave pública do CAPTCHA (null = servidor sem CAPTCHA)
  let googleAtivo = false;       // "Continuar com Google" configurado no servidor
  let captchaLogin = false;      // o servidor pediu CAPTCHA para a próxima tentativa de login
  let errosCodigo = 0;           // erros seguidos do código 2FA (1º: "não funcionou"; depois: "algo deu errado")

  /** Mensagem do bloqueio com o tempo que falta, quando o servidor informa */
  function textoBloqueio(e) {
    const s = Number(e && e.espera) || 0;
    if (!s) return FR.TOO_MANY_ATTEMPTS;
    if (s >= 3600) { const hs = Math.ceil(s / 3600); return "Muitas tentativas. Por segurança, tente novamente em " + hs + (hs === 1 ? " hora." : " horas."); }
    const m = Math.max(1, Math.ceil(s / 60));
    return "Muitas tentativas. Por segurança, tente novamente em " + m + (m === 1 ? " minuto." : " minutos.");
  }

  function renderAuth() {
    ZoZo.auth.render(authRoot, {
      erro: authErro,
      emailInicial: authEmail,
      turnstile, captchaLogin, google: googleAtivo,
      onIrCadastro: () => { authErro = null; store.set({ session: { status: "register" } }); },
      onVoltar: () => { authErro = null; store.set({ session: { status: "login" } }); },
      onErro: (msg, email) => { authErro = msg; if (email !== undefined) authEmail = email; renderAuth(); },
      onLogin: (cred) => {
        authEmail = cred.email;
        bridge.request(A.login, cred).then((r) => {
          captchaLogin = false;
          salvarCredencial(cred.email, cred.senha);
          if (r && r.doisFatores && !r.authenticated) { authErro = null; errosCodigo = 0; store.set({ session: { status: "2fa" } }); return; }
          entrar(r);
        }).catch((e) => {
          if (e.captcha || e.code === "CAPTCHA_REQUIRED") captchaLogin = true;
          // a falha que inicia um bloqueio já informa o tempo de espera
          authErro = e.code === "TOO_MANY_ATTEMPTS" || e.espera ? textoBloqueio(e)
            : ["STORAGE_UNAVAILABLE", "ACCESS_DENIED", "CAPTCHA_REQUIRED", "SESSION_EXPIRED"].includes(e.code) ? FR[e.code] : FR.INVALID_CREDENTIALS;
          renderAuth();
        });
      },
      /** Código do 2FA no login → Promise<mensagem de erro | null> */
      onCodigo: (codigo) => bridge.request(A.verificar2FA, { codigo }).then((r) => { errosCodigo = 0; entrar(r); return null; }).catch((e) => {
        if (e.code === "SESSION_EXPIRED") { authErro = FR.SESSION_EXPIRED; store.set({ session: { status: "login" } }); renderAuth(); return null; }
        if (e.code === "TOO_MANY_ATTEMPTS" || e.espera) return textoBloqueio(e);
        errosCodigo += 1;
        return errosCodigo === 1 ? FR.CODE_INVALID : FR.CODE_INVALID_AGAIN;
      }),
      onCancelar2FA: () => { ZoZo.auth.reiniciar(); bridge.request(A.logout).catch(() => null); authErro = null; store.set({ session: { status: "login" } }); },
      onCadastro: (dados) => {
        bridge.request(A.registerUser, dados).then((r) => { salvarCredencial(dados.email, dados.senha, dados.nomeUsuario); entrar(r); }).catch((e) => {
          authErro = e.code === "TOO_MANY_ATTEMPTS" ? textoBloqueio(e)
            : ["EMAIL_IN_USE", "WEAK_PASSWORD", "STORAGE_UNAVAILABLE", "PASSWORD_BREACHED", "ACCESS_DENIED", "CAPTCHA_REQUIRED", "REGISTER_FAILED"].includes(e.code) ? FR[e.code] : FR.REGISTER_FAILED;
          renderAuth();
        });
      },
    });
  }

  /** Oferece salvar no gerenciador de senhas do navegador (Chrome/Edge; os demais detectam pelo formulário) */
  function salvarCredencial(email, senha, nome) {
    try {
      if (!window.PasswordCredential || !navigator.credentials || !email || !senha) return;
      navigator.credentials.store(new window.PasswordCredential({ id: email, password: senha, name: nome || email })).catch(() => null);
    } catch (e) { /* navegador sem suporte */ }
  }

  /** Volta do Google (?google=ok|erro|cancelado|indisponivel): prepara a etapa certa e limpa o endereço */
  function retornoGoogle() {
    const r = new URLSearchParams(location.search).get("google");
    if (!r) return Promise.resolve();
    history.replaceState(null, "", location.pathname);
    const textos = { erro: "Não foi possível entrar com o Google. Tente de novo ou continue com e-mail.", cancelado: "Login com Google cancelado.",
      indisponivel: "O login com Google ainda não está disponível. Continue com e-mail." };
    if (r !== "ok") { authErro = textos[r] || textos.erro; return Promise.resolve(); }
    return bridge.request(A.getGoogle).then((d) => {
      if (!d || !d.email) { authErro = textos.erro; return; }
      ZoZo.auth.prepararGoogle(d);
      authEmail = d.email;
      return d.contaExiste ? "login" : "register";
    }).catch(() => { authErro = textos.erro; });
  }

  function entrar(sessao) {
    authErro = null;
    if (ZoZo.servico) ZoZo.servico.reset();
    store.set({ session: { status: "authenticated", authenticated: true, user: sessao.user } });
  }

  ctx.encerrarSessao = function () {
    ZoZo.auth.reiniciar();            // próximo login começa pela etapa do e-mail
    ZoZo.menu.fechar();
    if (ctx.detail) ctx.detail.close({ silencioso: true });
    if (ZoZo.boleto) ZoZo.boleto.close();
    if (ZoZo.servico) ZoZo.servico.reset();
    authErro = null; authEmail = "";
    store.reset();
  };

  ctx.logout = function (mensagem) {
    ZoZo.auth.reiniciar();
    bridge.request(A.logout).catch(() => null).finally(() => {
      ZoZo.menu.fechar();
      if (ctx.detail) ctx.detail.close({ silencioso: true });
      if (ZoZo.boleto) ZoZo.boleto.close();
      if (ZoZo.servico) ZoZo.servico.reset();
      authErro = mensagem || null; authEmail = "";
      store.reset();                 // limpa todo o estado da sessão (dados não são apagados)
    });
  };

  /* ---------------- Shell ---------------- */
  let shellPronto = false;
  function montarShell() {
    if (shellPronto) return;
    shellPronto = true;
    const sidebarEl = h("aside", { class: "sidebar", "aria-label": "Painel lateral" });
    const topbarEl = h("header", { class: "topbar" });
    const mainEl = h("main", { class: "main", id: "main", tabindex: "-1" });
    const detailEl = h("aside", { class: "detail", id: "detail", "aria-label": "Painel de informações" });
    const workspace = h("div", { class: "workspace", "data-conteudo": "nao" },
      h("div", { class: "workspace__main" }, topbarEl, mainEl), detailEl);
    mount(shellRoot, sidebarEl, workspace);

    // Recolher / expandir o menu lateral (o painel de informações continua fixo)
    const recolhido = (() => { try { return localStorage.getItem("zozo.menuRecolhido") === "1"; } catch (e) { return false; } })();
    shellRoot.dataset.menu = recolhido ? "recolhido" : "aberto";
    const toggleMenu = h("button", { type: "button", class: "menu-toggle", "aria-label": recolhido ? "Mostrar menu" : "Recolher menu",
      title: recolhido ? "Mostrar menu" : "Recolher menu", "aria-expanded": String(!recolhido) }, ZoZo.icons.icon("painel", { size: 18 }));
    toggleMenu.addEventListener("click", () => {
      const fechar = shellRoot.dataset.menu !== "recolhido";
      shellRoot.dataset.menu = fechar ? "recolhido" : "aberto";
      toggleMenu.setAttribute("aria-label", fechar ? "Mostrar menu" : "Recolher menu");
      toggleMenu.title = fechar ? "Mostrar menu" : "Recolher menu";
      toggleMenu.setAttribute("aria-expanded", String(!fechar));
      try { localStorage.setItem("zozo.menuRecolhido", fechar ? "1" : "0"); } catch (e) { /* ok */ }
    });
    shellRoot.appendChild(toggleMenu);

    const topbar = ZoZo.topbar.create(topbarEl);
    ctx.detail = ZoZo.detailPanel.create(workspace, detailEl);
    ctx.router = ZoZo.router.create(ctx, topbar, mainEl);
    ctx.refreshTopbar = () => ctx.router.refreshTopbar();
    const sidebar = ZoZo.sidebar.create(sidebarEl, ctx);
    store.subscribe((s) => { if (s.session.authenticated) sidebar.render(s); });
    sidebar.render(store.get());

    // Escape fecha o painel de detalhes
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (document.querySelector(".modal-overlay, .menu, .boleto.is-open")) return;
      if (ctx.detail.isOpen()) { e.preventDefault(); ctx.detail.close(); }
    });
  }

  /* ---------------- Reação ao estado de sessão ---------------- */
  let statusAnterior = null;
  store.subscribe((s) => {
    const status = s.session.status;
    if (status === statusAnterior) return;
    statusAnterior = status;
    document.getElementById("app").dataset.auth = status;
    if (status === "authenticated") {
      mount(authRoot);
      montarShell();
      ctx.loadData("contas", A.getContas).catch(() => null);
      ctx.loadData("config", A.getConfig).catch(() => null);
      ctx.router.navigate("dashboard");
    } else {
      renderAuth();
    }
  });

  // Integridade dos dados (avisos do host)
  window.addEventListener("zozo:dados-alterados", () => {
    if (!store.get().session.authenticated) return;
    ctx.toast(ZoZo.messages.FRIENDLY.DATA_CHANGED, { tone: "error", duration: 9000 });
    ctx.recarregarTudo();
  });
  window.addEventListener("zozo:aviso-dados", (e) => {
    const textos = {
      RESTORED_FROM_BACKUP: "O arquivo de dados estava danificado e foi recuperado do backup mais recente. Confira os últimos lançamentos.",
      OLDER_VERSION: "Os dados recebidos do servidor são mais antigos do que a última versão vista neste navegador. Confira os últimos lançamentos antes de continuar.",
    };
    const texto = textos[e.detail && e.detail.codigo];
    if (texto) ctx.toast(texto, { tone: "error", duration: 12000 });
  });

  // Sessão encerrada no servidor (saiu em outro lugar, senha trocada em outro dispositivo, expirou): volta ao login
  window.addEventListener("zozo:sessao-expirada", (e) => {
    const codigo = e.detail && e.detail.codigo;
    if (store.get().session.authenticated) ctx.logout(FR[codigo] || FR.SESSION_EXPIRED);
  });

  // Sem logout por inatividade: a sessão dura até o navegador ser fechado ou o usuário sair
  // (o servidor ainda encerra sessões sem uso por 7 dias ou com mais de 30 dias).

  // Fechar a aba com gravação em andamento: o navegador pede confirmação
  window.addEventListener("beforeunload", (e) => {
    if (ZoZo.servico && ZoZo.servico.gravando()) { e.preventDefault(); e.returnValue = ""; }
  });

  // "Ativar orçamento" (Configurações › Geral)
  store.subscribe((s) => {
    const app = document.getElementById("app");
    if (app) app.classList.toggle("sem-orcamento", !!(s.data.config && s.data.config.orcamentoAtivo === false));
  });

  ZoZo.ctx = ctx;

  /* ---------------- Boot ---------------- */
  function boot() {
    document.getElementById("app").dataset.auth = "loading";
    renderAuth();
    Promise.all([
      bridge.request(A.getArmazenamento).catch(() => null),
      bridge.request(A.getSession).catch(() => ({ authenticated: false })),
    ]).then(([armazenamento, sessao]) => {
      // Ambiente de prévia sem autorização do Access: avisa já na tela de login
      if (armazenamento && armazenamento.acessoNegado) authErro = FR.ACCESS_DENIED;
      turnstile = (armazenamento && armazenamento.turnstile) || null;
      googleAtivo = !!(armazenamento && armazenamento.google);
      if (sessao && sessao.email) authEmail = sessao.email;       // sessão aberta sem a chave neste navegador: só pede a senha
      store.set({ session: { storageAvailable: !!(armazenamento && armazenamento.available) } });
      if (sessao && sessao.authenticated) { history.replaceState(null, "", location.pathname + (location.search.includes("mock=1") ? "?mock=1" : "")); entrar(sessao); return; }
      return retornoGoogle().then((destino) => store.set({ session: { status: destino === "register" ? "register" : "login" } }));
    });
  }

  boot();
})(window.ZoZo);
