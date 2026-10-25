/* =============================================================
   ZoZo — Inicialização
   Sessão → (Login | Cadastro) → Shell → páginas
   ============================================================= */
(function (ZoZo: ZoZoGlobal) {
  "use strict";
  const { h, mount } = ZoZo.dom;
  const store = ZoZo.store;
  const bridge = ZoZo.bridge;
  const A = ZoZo.messages.ACTIONS;
  const FR = ZoZo.messages.FRIENDLY;

  const authRoot = document.getElementById("auth-root") as HTMLElement;     // existem sempre no index.html
  const shellRoot = document.getElementById("shell") as HTMLElement;
  const raizApp = () => document.getElementById("app") as HTMLElement;

  /* ---------------- Contexto compartilhado com as páginas ---------------- */
  const inflight: Partial<Record<ChaveDados, Promise<unknown>>> = {};
  let geracao = 0;          // muda a cada entrada/saída: resposta de uma sessão anterior é descartada
  const ordem: Record<string, number> = {};         // número da carga mais recente de cada coleção (respostas fora de ordem são ignoradas)
  // router, detail, refreshTopbar, encerrarSessao e logout entram logo abaixo, ao montar a interface
  const ctx = {
    bridge,
    toast: (mensagem: string, opts?: OpcoesAviso) => ZoZo.feedback.toast(mensagem, opts),

    /** Carrega uma coleção para state.data[key] (com loading e erro amigável) */
    loadData<K extends ChaveDados>(key: K, action: LeituraDaChave[K], payload?: unknown, opts?: { force?: boolean }): Promise<DadosEstado[K]> {
      type Dado = DadosEstado[K];
      const o = opts || {};
      const st = store.get();
      const guardado = st.data[key] as Dado | null | undefined;
      if (!o.force && guardado && !st.stale[key]) return Promise.resolve(guardado);
      const emCurso = inflight[key] as Promise<Dado> | undefined;
      if (emCurso && !o.force) return emCurso;
      const minha = geracao;
      const pedido = (ordem[key] = (ordem[key] || 0) + 1);
      store.set(() => ({ loading: { [key]: true }, errors: { [key]: null } }));
      const p = (bridge.request(action, payload) as Promise<Dado>).then((data): Dado => {
        if (minha !== geracao) throw new ZoZo.messages.BridgeError("SESSION_EXPIRED", FR.SESSION_EXPIRED);   // outra sessão
        if (pedido !== ordem[key]) return store.get().data[key] as Dado;                                       // chegou uma mais nova
        const stale = Object.assign({}, store.get().stale); delete stale[key];
        // Mesmo conteúdo: mantém o objeto atual (não redesenha nem interrompe animações)
        const atual = store.get().data[key] as Dado | null | undefined;
        const igual = !!atual && JSON.stringify(atual) === JSON.stringify(data);
        store.set({ data: igual ? {} : ({ [key]: data } as DadosNoEstado), loading: { [key]: false }, stale });
        return igual && atual ? atual : data;
      }).catch((err) => {
        if (minha !== geracao) throw err;
        // Falha de um pedido ANTIGO (já existe um mais novo): não mexe no estado nem avisa — quem chamou recebe o erro
        if (pedido !== ordem[key]) throw err;
        // Com dados anteriores na tela, a falha não pode passar despercebida
        if (store.get().data[key] && err.code !== "SESSION_EXPIRED") ctx.toast("Não foi possível atualizar: mostrando os dados carregados antes. " + (err.friendly || ""), { tone: "error", duration: 7000 });
        store.set({ loading: { [key]: false }, errors: { [key]: err.friendly || FR.LOAD_FAILED } });
        throw err;
      }).finally(() => { if (inflight[key] === p) delete inflight[key]; });
      inflight[key] = p;
      return p;
    },

    /** Marca coleções como desatualizadas (recarregam na próxima visita) */
    invalidate(keys: string[]) {
      const stale = Object.assign({}, store.get().stale);
      keys.forEach((k) => { stale[k] = true; });
      store.set({ stale });
    },

    navigate: (id: string, opts?: { force?: boolean; select?: { tipo: string; id: string } }) => ctx.router.navigate(id, opts),
    abrirConfiguracoes: (aba?: string) => ZoZo.configuracoes.abrir(ctx, aba),

    /** Após qualquer alteração de dados: tudo fica desatualizado; recarrega a página atual e a sidebar */
    recarregarTudo() {
      ctx.invalidate(["dashboard", "lancamentos", "contas", "investimentos", "categorias", "recorrencias", "perfis", "config"]);
      const page = ctx.router.current();
      return Promise.allSettled([
        ctx.loadData("contas", A.getContas, null, { force: true }),
        page ? page.carregar(ctx, true) : null,
      ]);
    },
  } as ContextoApp;

  /* ---------------- Autenticação ---------------- */
  let authErro: string | null = null, authEmail = "";
  let authAviso: string | null = null;           // aviso na tela de entrada (ex.: "entre para confirmar o e-mail")
  let authConfirmacao: string | null = null;     // token do link do e-mail: vai junto no próximo login (link + senha ativam a conta)
  let esperandoEmail: string | null = null;      // e-mail da tela "Verifique seu e-mail" aberta agora
  // Link aberto em outra aba deste navegador: a aba que espera vira o login sozinha (o token só circula entre abas do ZoZo)
  const canalAuth = typeof BroadcastChannel === "function" ? new BroadcastChannel("zozo-auth") : null;
  const TOKEN_LINK = /^[A-Za-z0-9_-]{20,100}$/;
  let turnstile: string | null = null;          // chave pública do CAPTCHA (null = servidor sem CAPTCHA)
  let googleAtivo = false;       // "Continuar com Google" configurado no servidor
  let captchaLogin = false;      // o servidor pediu CAPTCHA para a próxima tentativa de login
  let errosCodigo = 0;           // erros seguidos do código 2FA (1º: "não funcionou"; depois: "algo deu errado")

  /** Mensagem do bloqueio com o tempo que falta, quando o servidor informa */
  function textoBloqueio(e: Partial<ErroPonte>) {
    const s = Number(e && e.espera) || 0;
    if (!s) return FR.TOO_MANY_ATTEMPTS;
    if (s >= 3600) { const hs = Math.ceil(s / 3600); return "Muitas tentativas. Por segurança, tente novamente em " + hs + (hs === 1 ? " hora." : " horas."); }
    const m = Math.max(1, Math.ceil(s / 60));
    return "Muitas tentativas. Por segurança, tente novamente em " + m + (m === 1 ? " minuto." : " minutos.");
  }

  const simulando = () => !!(ZoZo.testeHost && ZoZo.testeHost.simulando());

  function renderAuth() {
    esperandoEmail = null;
    ZoZo.auth.render(authRoot, {
      erro: authErro,
      aviso: authAviso,
      emailInicial: authEmail,
      // modo teste "sem servidor": nada de CAPTCHA (o cadastro e o login não saem do navegador)
      turnstile: simulando() ? null : turnstile, captchaLogin: captchaLogin && !simulando(), google: googleAtivo,
      onIrCadastro: () => { authErro = null; authAviso = null; store.set({ session: { status: "register" } }); },
      onEsqueci: (email: string) => mostrarPedirRecuperacao(email),
      onVoltar: () => { authErro = null; authAviso = null; store.set({ session: { status: "login" } }); },
      onLogin: (cred) => {
        authEmail = cred.email;
        ZoZo.auth.carregando(authRoot, "Entrando no ZoZo");
        const ativando = !!authConfirmacao;
        bridge.request(A.login, authConfirmacao ? Object.assign({}, cred, { confirmacao: authConfirmacao }) : cred).then((r) => {
          captchaLogin = false; authConfirmacao = null; authAviso = null;
          salvarCredencial(cred.email, cred.senha);
          if (r && r.doisFatores && !r.authenticated) { authErro = null; errosCodigo = 0; store.set({ session: { status: "2fa" } }); return; }
          entrar(r);
          if (ativando) ctx.toast("Conta ativada com sucesso.", { tone: "success", importante: true, duration: 6000 });
        }).catch((e) => {
          if (e.code === "EMAIL_NOT_CONFIRMED") { aguardarConfirmacao(cred.email); return; }
          if (e.code === "TOKEN_INVALID") { authConfirmacao = null; authAviso = null; mostrarLinkInvalido(); return; }
          if (e.captcha || e.code === "CAPTCHA_REQUIRED") captchaLogin = true;
          // a falha que inicia um bloqueio já informa o tempo de espera
          authErro = e.code === "TOO_MANY_ATTEMPTS" || e.espera ? textoBloqueio(e)
            : ["STORAGE_UNAVAILABLE", "ACCESS_DENIED", "CAPTCHA_REQUIRED", "SESSION_EXPIRED", "CF_CHALLENGE"].includes(e.code) ? FR[e.code] : FR.INVALID_CREDENTIALS;
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
        ZoZo.auth.carregando(authRoot, "Preparando sua conta...");
        bridge.request(A.registerUser, dados).then((r) => {
          salvarCredencial(dados.email, dados.senha, dados.nomeUsuario);
          if (r && r.confirmarEmail) { authEmail = r.email || dados.email; aguardarConfirmacao(authEmail); return; }    // e-mail ligado: falta o link
          entrar(r);
        }).catch((e) => {
          authErro = e.code === "TOO_MANY_ATTEMPTS" ? textoBloqueio(e)
            : ["EMAIL_IN_USE", "WEAK_PASSWORD", "STORAGE_UNAVAILABLE", "PASSWORD_BREACHED", "ACCESS_DENIED", "CAPTCHA_REQUIRED", "REGISTER_FAILED", "CF_CHALLENGE"].includes(e.code) ? FR[e.code] : FR.REGISTER_FAILED;
          renderAuth();
        });
      },
    });
  }

  /** Tela "Verifique seu e-mail" (depois do cadastro ou ao tentar entrar sem confirmar) */
  function aguardarConfirmacao(email: string) {
    ZoZo.auth.aguardandoEmail(authRoot, email, { onReenviar: () => bridge.request(A.reenviarConfirmacao, { email }) });
    esperandoEmail = String(email || "").trim().toLowerCase();
  }

  /* ---------------- "Esqueci minha senha" ---------------- */
  const voltarEntrada = () => { authErro = null; authAviso = null; ZoZo.auth.reiniciar(); store.set({ session: { status: "login" } }); renderAuth(); };

  function mostrarPedirRecuperacao(email: string) {
    esperandoEmail = null;
    const pedir = (em: string) => bridge.request(A.pedirRecuperacao, { email: em });
    ZoZo.auth.pedirRecuperacao(authRoot, { email, onVoltar: voltarEntrada, onEnviar: (em) => pedir(em).then(() => {
      ZoZo.auth.aguardandoEmail(authRoot, em, { recuperacao: true, onReenviar: () => pedir(em), onVoltar: voltarEntrada });
    }) });
  }

  /** Senha nova (o host já abriu os dados com a cópia da chave, ou vai recomeçar vazia) */
  function mostrarNovaSenha(r: { email: string; manter: boolean }, erroTela?: string) {
    ZoZo.auth.novaSenha(authRoot, { email: r.email, manter: r.manter, erro: erroTela || null, onVoltar: voltarEntrada, onSalvar: (senha) => {
      ZoZo.auth.carregando(authRoot, "Redefinindo sua senha...");
      bridge.request(A.concluirRecuperacao, { senha, recomecar: !r.manter }, { timeout: 120000 }).then((x) => {
        authEmail = x.email; authErro = null; authAviso = null;
        ZoZo.auth.prepararLogin(x.email);
        store.set({ session: { status: "login" } });
        renderAuth();
        ctx.toast(x.recomecou ? "Senha redefinida. A conta recomeçou vazia: entre com a senha nova." : "Senha redefinida. Entre com a senha nova.",
          { tone: "success", importante: true, duration: 8000 });
      }).catch((e: ErroPonte) => {
        if (e.code === "TOKEN_INVALID") { mostrarLinkInvalido(); return; }
        mostrarNovaSenha(r, ["PASSWORD_BREACHED", "WEAK_PASSWORD"].includes(e.code) ? FR[e.code] : (e.friendly || FR.OPERATION_FAILED));
      });
    } });
  }

  /**
   * Link do e-mail (#recuperar=…): limpa o endereço e abre a recuperação (o código do 2FA, se a conta tiver).
   * Resolve true quando já mostrou uma tela (senha nova, código ou link inválido).
   */
  function retornoRecuperacao(): Promise<boolean> {
    const m = location.hash.match(/^#recuperar=(.*)$/);
    if (!m) return Promise.resolve(false);
    history.replaceState(null, "", location.pathname + location.search);
    const token = m[1];
    store.set({ session: { status: "login" } });
    if (!TOKEN_LINK.test(token)) { mostrarLinkInvalido(); return Promise.resolve(true); }
    ZoZo.auth.carregando(authRoot, "Abrindo sua conta...");
    return bridge.request(A.abrirRecuperacao, { token }, { timeout: 60000 }).then((r) => { mostrarNovaSenha(r); return true; }).catch((e: ErroPonte) => {
      if (e.code === "CODE_REQUIRED") {
        ZoZo.auth.codigoRecuperacao(authRoot, { onVoltar: voltarEntrada, onCodigo: (codigo) =>
          bridge.request(A.abrirRecuperacao, { token, codigo }, { timeout: 60000 }).then((r) => { mostrarNovaSenha(r); return null; }).catch((x: ErroPonte) => {
            if (x.code === "TOKEN_INVALID") { mostrarLinkInvalido(); return null; }
            return x.code === "TOO_MANY_ATTEMPTS" || x.espera ? textoBloqueio(x) : FR.CODE_INVALID;
          }) });
        return true;
      }
      if (e.code === "TOKEN_INVALID") { mostrarLinkInvalido(); return true; }
      authErro = e.code === "TOO_MANY_ATTEMPTS" ? textoBloqueio(e) : (e.friendly || FR.OPERATION_FAILED);
      renderAuth();
      return true;
    });
  }

  /* ---------------- modo teste (só local e prévia): telas de entrada sob demanda ---------------- */
  function telaTeste(nome: string) {
    const mostrar = () => {
      const em = authEmail || "teste@exemplo.test";
      const senhaSimulada = () => { ctx.toast("Modo teste: tela de demonstração, nada foi enviado.", { tone: "aviso" }); voltarEntrada(); };
      const telas: Record<string, () => void> = {
        verificar: () => aguardarConfirmacao(em),
        verificarRecuperacao: () => ZoZo.auth.aguardandoEmail(authRoot, em, { recuperacao: true, onReenviar: () => Promise.resolve(), onVoltar: voltarEntrada }),
        linkInvalido: () => mostrarLinkInvalido(),
        redefinir: () => mostrarPedirRecuperacao(em),
        codigo: () => ZoZo.auth.codigoRecuperacao(authRoot, { onVoltar: voltarEntrada, onCodigo: () => Promise.resolve(FR.CODE_INVALID) }),
        novaSenha: () => ZoZo.auth.novaSenha(authRoot, { email: em, manter: true, onVoltar: voltarEntrada, onSalvar: senhaSimulada }),
        novaSenhaRecomecar: () => ZoZo.auth.novaSenha(authRoot, { email: em, manter: false, onVoltar: voltarEntrada, onSalvar: senhaSimulada }),
        carregando: () => { ZoZo.auth.carregando(authRoot, "Entrando no ZoZo"); setTimeout(() => { if (!store.get().session.authenticated) voltarEntrada(); }, 4000); },
      };
      // etapas do próprio formulário de entrada (login, cadastro e o código do 2FA)
      const etapas: Record<string, [string, "login" | "register", number]> = {
        entrarInicio: ["login", "login", 0], entrarEmail: ["login", "login", 1], entrarSenha: ["login", "login", 2],
        cadastroNome: ["register", "register", 1], cadastroSenha: ["register", "register", 2], doisFatores: ["2fa", "login", 2],
      };
      const etapa = etapas[nome];
      if (etapa) {
        authErro = null; authAviso = null; authEmail = em;
        ZoZo.auth.irPara(etapa[1], etapa[2], em);
        store.set({ session: { status: etapa[0] as SessaoEstado["status"] } });
        renderAuth();
        return;
      }
      store.set({ session: { status: "login" } });
      (telas[nome] || voltarEntrada)();
    };
    if (!store.get().session.authenticated) { mostrar(); return; }
    ctx.logout();
    const parar = store.subscribe((st) => { if (!st.session.authenticated) { parar(); setTimeout(mostrar, 0); } });
  }

  /** Link vencido, já usado ou adulterado */
  function mostrarLinkInvalido() {
    esperandoEmail = null;
    ZoZo.auth.linkInvalido(authRoot, { onVoltar: () => { authErro = null; authAviso = null; ZoZo.auth.reiniciar(); renderAuth(); } });
  }

  const AVISO_LINK = "E-mail confirmado! Entre com sua senha para concluir a ativação da conta.";

  // A aba que mostra "Verifique seu e-mail" recebe o link aberto em outra aba e vai para o login (já na senha)
  if (canalAuth) canalAuth.onmessage = (ev: MessageEvent) => {
    const d = ev.data;
    if (!d || d.tipo !== "link" || !esperandoEmail || d.email !== esperandoEmail || !TOKEN_LINK.test(String(d.token))) return;
    if (store.get().session.authenticated) return;
    authConfirmacao = d.token; authEmail = d.email; authErro = null; authAviso = null;
    ZoZo.auth.prepararLogin(d.email);
    store.set({ session: { status: "login" } });
    renderAuth();
    ctx.toast(AVISO_LINK, { tone: "success", importante: true, duration: 8000 });
  };

  /**
   * Link do e-mail (#confirmar=…): limpa o endereço (o token não fica no histórico) e pergunta ao servidor
   * se o link ainda vale — sem usá-lo. Valendo, o token fica só na memória e vai junto no login: a conta é
   * ativada com o link E a senha (o link sozinho não basta). Resolve "invalido" para a tela de link inválido.
   */
  function retornoConfirmacao(): Promise<"invalido" | null> {
    const m = location.hash.match(/^#confirmar=(.*)$/);
    if (!m) return Promise.resolve(null);
    history.replaceState(null, "", location.pathname + location.search);
    const token = m[1];
    if (!TOKEN_LINK.test(token)) return Promise.resolve("invalido");
    return bridge.request(A.conferirLink, { token }).then((r) => {
      authEmail = r.email; ZoZo.auth.prepararLogin(r.email);
      if (r.ativa) {
        ctx.toast("Sua conta já está ativa. Entre com sua senha.", { tone: "aviso", duration: 7000 });
        return null;
      }
      authConfirmacao = token;
      ctx.toast(AVISO_LINK, { tone: "success", importante: true, duration: 8000 });
      if (canalAuth) canalAuth.postMessage({ tipo: "link", token, email: r.email });
      return null;
    }).catch((e) => {
      if (e && e.code === "TOKEN_INVALID") return "invalido" as const;
      // não deu para conferir (rede, limite): o link ainda pode valer — vai junto no login, como antes
      authConfirmacao = token;
      authAviso = "Entre com seu e-mail e senha para ativar a conta.";
      return null;
    });
  }

  /** Oferece salvar no gerenciador de senhas do navegador (Chrome/Edge; os demais detectam pelo formulário) */
  function salvarCredencial(email: string, senha: string, nome?: string) {
    try {
      // Chrome/Edge (não está em todos os navegadores nem nos tipos do TypeScript)
      const Credencial = (window as unknown as { PasswordCredential?: new (d: { id: string; password: string; name: string }) => Credential }).PasswordCredential;      // Chrome/Edge: oferece salvar no gerenciador de senhas
      if (!Credencial || !navigator.credentials || !email || !senha) return;
      navigator.credentials.store(new Credencial({ id: email, password: senha, name: nome || email })).catch(() => null);
    } catch (e) { /* navegador sem suporte */ }
  }

  /** Volta do Google (?google=ok|erro|cancelado|indisponivel): prepara a etapa certa e limpa o endereço */
  function retornoGoogle() {
    const r = new URLSearchParams(location.search).get("google");
    if (!r) return Promise.resolve();
    history.replaceState(null, "", location.pathname);
    const textos: Record<string, string> = { erro: "Não foi possível entrar com o Google. Tente de novo ou continue com e-mail.", cancelado: "Login com Google cancelado.",
      indisponivel: "O login com Google ainda não está disponível. Continue com e-mail." };
    if (r !== "ok") { authErro = textos[r] || textos.erro; return Promise.resolve(); }
    return bridge.request(A.getGoogle).then((d) => {
      if (!d || !d.email) { authErro = textos.erro; return; }
      ZoZo.auth.prepararGoogle(d);
      authEmail = d.email;
      return d.contaExiste ? "login" : "register";
    }).catch(() => { authErro = textos.erro; });
  }

  function entrar(sessao: RespostaSessao) {
    geracao += 1;
    authErro = null; authAviso = null; esperandoEmail = null;
    if (ZoZo.servico) ZoZo.servico.reset();
    store.set({ session: { status: "authenticated", authenticated: true, user: sessao.user || null } });
  }

  ctx.encerrarSessao = function () {
    geracao += 1;
    ZoZo.auth.reiniciar();            // próximo login começa pela etapa do e-mail
    ZoZo.menu.fechar();
    if (ctx.detail) ctx.detail.close({ silencioso: true });
    if (ZoZo.boleto) ZoZo.boleto.close();
    if (ZoZo.servico) ZoZo.servico.reset();
    authErro = null; authEmail = "";
    store.reset();
  };

  ctx.logout = function (mensagem?: string) {
    geracao += 1;
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
    const E = ZoZo.estrutura;                 // classes Tailwind (components/estrutura.ts)
    const sidebarEl = h("aside", { class: E.menuLateral, "aria-label": "Painel lateral" });
    const topbarEl = h("header", { class: E.barra });
    const mainEl = h("main", { class: E.principal, id: "main", tabindex: "-1" });
    const detailEl = h("aside", { class: E.painel, id: "detail", "aria-label": "Painel de informações" });
    const workspace = h("div", { class: E.trabalho, "data-conteudo": "nao" },
      h("div", { class: E.trabalhoPrincipal }, topbarEl, mainEl), detailEl);
    mount(shellRoot, sidebarEl, workspace);

    // Recolher / expandir o menu lateral (o painel de informações continua fixo).
    // Celular: o menu começa oculto e abre como gaveta (entra da esquerda e sai para a esquerda).
    const celular = window.matchMedia("(max-width: 600px)");
    const recolhido = (() => { try { return localStorage.getItem("zozo.menuRecolhido") === "1"; } catch (e) { return false; } })();
    shellRoot.dataset.menu = recolhido ? "recolhido" : "aberto";
    const toggleMenu = h("button", { type: "button", class: E.alternar }, ZoZo.icons.icon("painel", { size: 18 }));
    const fundoGaveta = h("div", { class: E.fundoGaveta, "aria-hidden": "true" });
    const rotularToggle = () => {
      const aberto = celular.matches ? shellRoot.dataset.gaveta === "aberta" : shellRoot.dataset.menu !== "recolhido";
      const texto = aberto ? (celular.matches ? "Fechar menu" : "Recolher menu") : "Mostrar menu";
      toggleMenu.setAttribute("aria-label", texto);
      toggleMenu.title = texto;
      toggleMenu.setAttribute("aria-expanded", String(aberto));
    };
    const gaveta = (abrir: boolean) => { shellRoot.dataset.gaveta = abrir ? "aberta" : ""; rotularToggle(); };
    toggleMenu.addEventListener("click", () => {
      if (celular.matches) { gaveta(shellRoot.dataset.gaveta !== "aberta"); return; }
      const fechar = shellRoot.dataset.menu !== "recolhido";
      shellRoot.dataset.menu = fechar ? "recolhido" : "aberto";
      rotularToggle();
      try { localStorage.setItem("zozo.menuRecolhido", fechar ? "1" : "0"); } catch (e) { /* ok */ }
    });
    fundoGaveta.addEventListener("click", () => gaveta(false));
    // Escolheu um item do menu (página, conta, perfil, configurações): a gaveta fecha
    sidebarEl.addEventListener("click", (e) => {
      const alvo = e.target as Element;
      if (celular.matches && alvo.closest("button") && !alvo.closest(".side-group__header")) gaveta(false);
    });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && shellRoot.dataset.gaveta === "aberta") { e.preventDefault(); gaveta(false); } });
    celular.addEventListener("change", () => gaveta(false));
    rotularToggle();
    shellRoot.appendChild(fundoGaveta);
    shellRoot.appendChild(toggleMenu);

    const topbar = ZoZo.topbar.create(topbarEl);
    ctx.detail = ZoZo.detailPanel.create(workspace, detailEl);
    ctx.router = ZoZo.router.create(ctx, topbar, mainEl);
    ctx.refreshTopbar = () => ctx.router.refreshTopbar();
    const sidebar = ZoZo.sidebar.create(sidebarEl, ctx);
    store.subscribe((s) => { if (s.session.authenticated) sidebar.render(s); });
    sidebar.render(store.get());

    // "/" ou Ctrl+K (⌘K): pesquisar transações, de qualquer página
    document.addEventListener("keydown", (e) => {
      const alvo = e.target as HTMLElement | null;
      const digitando = alvo && (alvo.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(alvo.tagName));
      const atalho = (e.key === "/" && !digitando && !e.ctrlKey && !e.metaKey && !e.altKey)
        || ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "k");
      if (!atalho || e.defaultPrevented || document.querySelector(".modal-overlay")) return;
      e.preventDefault();
      if (raizApp().dataset.pagina !== "lancamentos") ctx.router.navigate("lancamentos");
      setTimeout(() => { const c = document.querySelector<HTMLInputElement>(".topbar-search__input"); if (c) { c.focus(); c.select(); } });   // depois de a página montar
    });

    // Escape fecha o painel de detalhes
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (document.querySelector(".modal-overlay, .menu, .boleto.is-open")) return;
      if (ctx.detail.isOpen()) { e.preventDefault(); ctx.detail.close(); }
    });
  }

  /* ---------------- Reação ao estado de sessão ---------------- */
  let statusAnterior: string | null = null;
  store.subscribe((s) => {
    const status = s.session.status;
    if (status === statusAnterior) return;
    statusAnterior = status;
    raizApp().dataset.auth = status;
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
  // gravação recusada depois de a tela já mostrar a alteração: redesenha com o que está gravado
  window.addEventListener("zozo:dados-revertidos", () => { if (store.get().session.authenticated) ctx.recarregarTudo(); });
  window.addEventListener("zozo:dados-alterados", (e) => {
    if (!store.get().session.authenticated) return;
    const detalhe = (e as CustomEvent).detail;
    ctx.toast(FR[(detalhe && detalhe.codigo) || "DATA_CHANGED"] || FR.DATA_CHANGED, { tone: "error", duration: 9000 });
    ctx.recarregarTudo();
  });
  window.addEventListener("zozo:aviso-dados", (e) => {
    const textos = {
      RESTORED_FROM_BACKUP: "O arquivo de dados estava danificado e foi recuperado do backup mais recente. Confira as últimas transações.",
      OLDER_VERSION: "Os dados recebidos do servidor são mais antigos do que a última versão vista neste navegador. Confira as últimas transações antes de continuar.",
      DOCUMENT_MISSING: "Os dados desta conta não foram encontrados no servidor nem no backup. A conta abriu vazia e SÓ PARA LEITURA: peça a restauração do banco ou, para recomeçar do zero, use Configurações › Conta › Apagar todos os dados.",
      AUTOSAVE_FAILED: "As parcelas automáticas não foram salvas (sem conexão com o servidor). Elas serão criadas de novo na próxima vez.",
      DOCUMENT_INVALID_LOCKED: ZoZo.messages.FRIENDLY.DOCUMENT_INVALID_LOCKED,
    };
    const detalhe = (e as CustomEvent).detail;
    const texto = (textos as Record<string, string>)[detalhe && detalhe.codigo];
    if (texto) ctx.toast(texto, { tone: "error", duration: 12000 });
  });

  /* Atualização em tempo real entre dispositivos e abas: ao voltar para a aba e a cada minuto com ela
     visível, confere só o NÚMERO da versão no servidor; se outro lugar gravou, baixa e redesenha
     (nada de F5). Nunca no meio de uma gravação desta aba. */
  let conferindo = false;
  let ultimaConferencia = 0;
  const INTERVALO_MINIMO = 10000;     // foco/visibilidade podem disparar em rajada (trocar de janela várias vezes): 1 pedido a cada 10 s, no máximo
  function conferirAtualizacao() {
    if (conferindo || document.hidden || !store.get().session.authenticated || !ZoZo.servico || ZoZo.servico.gravando()) return;
    if (Date.now() - ultimaConferencia < INTERVALO_MINIMO) return;
    ultimaConferencia = Date.now();
    conferindo = true;
    bridge.request(A.verificarAtualizacao)
      .then((r) => { if (r && r.mudou && ZoZo.servico.recarregarDoServidor()) return ctx.recarregarTudo(); })
      .catch(() => null)
      .finally(() => { conferindo = false; });
  }
  document.addEventListener("visibilitychange", () => { if (!document.hidden) conferirAtualizacao(); });
  window.addEventListener("focus", conferirAtualizacao);
  setInterval(conferirAtualizacao, 60000);

  // Sessão encerrada no servidor (saiu em outro lugar, senha trocada em outro dispositivo, expirou): volta ao login
  window.addEventListener("zozo:sessao-expirada", (e) => {
    const detalhe = (e as CustomEvent).detail;
    const codigo = detalhe && detalhe.codigo;
    if (store.get().session.authenticated) ctx.logout(FR[codigo] || FR.SESSION_EXPIRED);
  });

  // Proteção do Cloudflare na frente da API (ex.: modo "Under Attack" com a verificação vencida):
  // os pedidos não chegam ao ZoZo até a página ser recarregada (o navegador refaz a verificação)
  let avisoProtecao = false;
  window.addEventListener("zozo:protecao-cloudflare", () => {
    if (avisoProtecao || !store.get().session.authenticated) return;
    avisoProtecao = true;
    ZoZo.feedback.confirmarExclusao("Verificação de segurança", FR.CF_CHALLENGE + " O que não foi salvo precisará ser refeito.",
      { confirmar: "Recarregar página", cancelar: "Agora não", variante: "primary" })
      .then((ok) => { avisoProtecao = false; if (ok) location.reload(); });
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

  // Multicâmbio: a moeda gravada na conta vale ao entrar (símbolo R$, € ou $ e só os dados dela)
  let moedaAplicada = "BRL";
  store.subscribe((s) => {
    const m = s.session.authenticated ? ((s.data.config && s.data.config.moeda) || "BRL") : "BRL";
    if (m === moedaAplicada) return;
    moedaAplicada = m;
    if (s.session.authenticated && ctx.router) ZoZo.cambio.aplicarMoeda(ctx, m);
    else ZoZo.format.definirMoeda(m);
  });

  // Campos de valor: os dígitos entram pelos centavos, como numa maquininha (1200 → 12,00; 120000 → 1.200,00)
  const campoValor = (t: EventTarget | null): t is HTMLInputElement => t instanceof HTMLInputElement && t.inputMode === "decimal" && !t.dataset.semMascara && !t.readOnly;
  document.addEventListener("input", (e) => { if (campoValor(e.target)) ZoZo.format.mascararValor(e.target, (e as InputEvent).data, (e as InputEvent).inputType); }, true);
  document.addEventListener("focusout", (e) => { if (campoValor(e.target)) ZoZo.format.completarValor(e.target); }, true);

  ZoZo.ctx = ctx;

  /* ---------------- Boot ---------------- */
  function boot() {
    raizApp().dataset.auth = "loading";
    renderAuth();
    Promise.all([
      bridge.request(A.getArmazenamento).catch(() => null),
      bridge.request(A.getSession).catch((): RespostaSessao => ({ authenticated: false })),
    ]).then(([armazenamento, sessao]) => {
      // A proteção do Cloudflare barrou a API logo na abertura: recarrega uma vez (o navegador refaz a verificação)
      if (armazenamento && armazenamento.desafio) {
        let recarregou = 0;
        try { recarregou = Number(sessionStorage.getItem("zozo.recarga-protecao")) || 0; } catch (e) { /* ok */ }
        if (Date.now() - recarregou > 60000) {
          try { sessionStorage.setItem("zozo.recarga-protecao", String(Date.now())); } catch (e) { /* ok */ }
          location.reload();
          return;
        }
        authErro = FR.CF_CHALLENGE;
      }
      turnstile = (armazenamento && armazenamento.turnstile) || null;
      googleAtivo = !!(armazenamento && armazenamento.google);
      if (sessao && sessao.email) authEmail = sessao.email;       // sessão aberta sem a chave neste navegador: só pede a senha
      store.set({ session: { storageAvailable: !!(armazenamento && armazenamento.available) } });
      if (sessao && sessao.authenticated) {
        const linkConfirmacao = /^#confirmar=/.test(location.hash), linkRecuperacao = /^#recuperar=/.test(location.hash);
        history.replaceState(null, "", location.pathname + (location.search.includes("mock=1") ? "?mock=1" : ""));
        entrar(sessao);
        // link de confirmação aberto com outra conta já conectada: o token não é usado nesta sessão
        if (linkConfirmacao) ctx.toast("Você já está conectado. Para ativar a conta nova, saia desta conta e abra o link do e-mail de novo.", { tone: "aviso", duration: 10000 });
        if (linkRecuperacao) ctx.toast("Você já está conectado. Para trocar a senha, use Configurações › Conta (ou saia e abra o link do e-mail de novo).", { tone: "aviso", duration: 10000 });
        return;
      }
      if (/^#recuperar=/.test(location.hash)) return retornoRecuperacao().then(() => undefined);
      return retornoConfirmacao().then((link) => {
        if (link === "invalido") { store.set({ session: { status: "login" } }); mostrarLinkInvalido(); return; }
        return retornoGoogle().then((destino) => store.set({ session: { status: destino === "register" ? "register" : "login" } }));
      });
    });
  }

  // painel de testes: só no endereço local e na prévia, num pacote à parte (o site publicado não o baixa)
  if (ZoZo.testeHost) import("./components/teste").then(() => ZoZo.teste && ZoZo.teste.iniciar(ctx, {
    tela: telaTeste,
    entradaMudou: () => { if (!store.get().session.authenticated) renderAuth(); },
    sessaoExpirada: () => ctx.logout(FR.SESSION_EXPIRED),
    // conta simulada com dados de exemplo (sem servidor): o painel precisa de dados para abrir painéis e janelas
    entrarSimulado: () => {
      if (ZoZo.testeHost) ZoZo.testeHost.simular(true);
      return bridge.request(A.login, { email: "exemplo@exemplo.test", senha: "simulada" }).then((r) => entrar(r));
    },
  })).catch(() => null);

  boot();
})(window.ZoZo);
