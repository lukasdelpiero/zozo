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
    abrirConfiguracoes: () => ZoZo.configuracoes.abrir(ctx),

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
  function renderAuth() {
    ZoZo.auth.render(authRoot, {
      erro: authErro,
      emailInicial: authEmail,
      onIrCadastro: () => { authErro = null; store.set({ session: { status: "register" } }); },
      onVoltar: () => { authErro = null; store.set({ session: { status: "login" } }); },
      onErro: (msg, email) => { authErro = msg; if (email !== undefined) authEmail = email; renderAuth(); },
      onLogin: (cred) => {
        authEmail = cred.email;
        bridge.request(A.login, cred).then(entrar).catch((e) => {
          if (e.code === "SESSION_EXPIRED") { recarregarParaEntrar(); return; }
          authErro = ["STORAGE_UNAVAILABLE", "TOO_MANY_ATTEMPTS", "EMAIL_MISMATCH"].includes(e.code) ? FR[e.code] : FR.INVALID_CREDENTIALS;
          renderAuth();
        });
      },
      onCadastro: (dados) => {
        bridge.request(A.registerUser, dados).then(entrar).catch((e) => {
          if (e.code === "SESSION_EXPIRED") { recarregarParaEntrar(); return; }
          authErro = ["EMAIL_IN_USE", "WEAK_PASSWORD", "STORAGE_UNAVAILABLE", "PASSWORD_BREACHED", "EMAIL_MISMATCH"].includes(e.code) ? FR[e.code] : FR.REGISTER_FAILED;
          renderAuth();
        });
      },
    });
  }

  /** O login do Cloudflare Access venceu: recarregar leva à tela de login do Access */
  function recarregarParaEntrar() { location.reload(); }

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

  // Sessão do Cloudflare Access vencida (ou senha trocada em outro dispositivo): volta ao login
  window.addEventListener("zozo:sessao-expirada", () => {
    if (store.get().session.authenticated) ctx.logout(FR.SESSION_EXPIRED);
  });

  // Inatividade: depois de 30 minutos sem uso, a chave sai da memória e a senha é pedida de novo
  const INATIVIDADE_MS = 30 * 60 * 1000;
  let ultimoUso = Date.now();
  ["pointerdown", "keydown", "wheel", "touchstart"].forEach((ev) => window.addEventListener(ev, () => { ultimoUso = Date.now(); }, { passive: true, capture: true }));
  setInterval(() => {
    if (!store.get().session.authenticated || Date.now() - ultimoUso < INATIVIDADE_MS) return;
    ultimoUso = Date.now();
    (ZoZo.servico ? ZoZo.servico.aguardarGravacoes() : Promise.resolve())
      .then(() => ctx.logout("Sua sessão foi encerrada por inatividade. Entre novamente."));
  }, 30000);

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
      bridge.request(A.getArmazenamento).then((d) => !!(d && d.available)).catch(() => false),
      bridge.request(A.getSession).catch(() => ({ authenticated: false })),
    ]).then(([disponivel, sessao]) => {
      store.set({ session: { storageAvailable: disponivel } });
      if (sessao && sessao.authenticated) entrar(sessao);
      else store.set({ session: { status: "login" } });
    });
  }

  boot();
})(window.ZoZo);
