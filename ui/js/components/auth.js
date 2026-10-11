/* =============================================================
   ZoZo — Login e Cadastro em etapas (padrão Copilot Money)
   Entrar:    início (e-mail | Google) → e-mail → senha → (2FA: código de 6 dígitos)
   Cadastro:  nome + e-mail → crie sua senha
   Google:    confirma o e-mail e volta para a senha (conta existente) ou para
              "Crie sua senha" (cadastro já preenchido). A senha continua sendo a
              chave da criptografia dos dados.
   Preenchimento automático (Chrome, Edge, Safari, Firefox, Brave, Bitwarden,
   1Password…): formulários reais com name/id/autocomplete padronizados e o
   e-mail presente (oculto) na etapa da senha.
   ============================================================= */
(function (ZoZo) {
  "use strict";
  const { h, s, mount } = ZoZo.dom;
  const { icon } = ZoZo.icons;
  const UI = ZoZo.ui;
  const A = ZoZo.messages.ACTIONS;
  const FR = ZoZo.messages.FRIENDLY;
  const V = () => ZoZo.verificacao;

  const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const ERRO_LOGIN = "Erro ao fazer login na sua conta. Tente novamente.";

  // Etapa atual (sobrevive aos redesenhos após um erro). Login: 0 início · 1 e-mail · 2 senha
  let estado = { modo: null, etapa: 0, email: "", nome: "", google: false };
  let ultimoPasso = null, ultimaEtapa = 0;   // para animar só quando a etapa muda

  function campo(cfg) {
    const input = UI.Input(Object.assign({ class: "auth__input", required: true }, cfg));
    input.setAttribute("aria-label", cfg.rotulo);
    return input;
  }

  function campoSenha(autocomplete) {
    const input = campo({ type: "password", name: "password", id: "password", autocomplete, placeholder: "Insira sua senha", rotulo: "Senha" });
    return { input, wrap: V().ComRevelar(input) };
  }
  /** E-mail presente (oculto) no formulário da senha: é por ele que o navegador sabe de qual conta é a senha */
  const emailOculto = () => h("input", { type: "email", name: "email", id: "email", autocomplete: "username", value: estado.email,
    class: "visually-hidden", tabindex: "-1", "aria-hidden": "true", readonly: true });

  const botao = (texto) => h("button", { type: "submit", class: "btn btn--primary btn--block auth__btn" }, h("span", { class: "btn__label" }, texto));
  const erroAbaixo = (msg) => (msg ? h("p", { class: "auth__error", role: "alert" }, msg) : null);
  const rodape = (pergunta, acao, onClick) => h("p", { class: "auth__switch" },
    h("span", null, pergunta + " "), h("button", { type: "button", class: "auth__link", onClick }, acao));

  /** Logo oficial "G" do Google (cores da marca) */
  function logoGoogle() {
    return s("svg", { class: "auth__g", viewBox: "0 0 48 48", width: "18", height: "18", "aria-hidden": "true" },
      s("path", { fill: "#EA4335", d: "M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" }),
      s("path", { fill: "#4285F4", d: "M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" }),
      s("path", { fill: "#FBBC05", d: "M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" }),
      s("path", { fill: "#34A853", d: "M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" }));
  }

  /** Logo do ZoZo com sombra; se a imagem não carregar, mostra um selo desenhado (nunca "quebrada") */
  function logo() {
    const img = h("img", { class: "auth__icon", src: "assets/img/zozo-logo.svg", alt: "ZoZo", width: "56", height: "56", decoding: "async" });
    img.addEventListener("error", () => img.replaceWith(h("span", { class: "auth__icon auth__icon--selo", role: "img", "aria-label": "ZoZo" }, "Z")));
    return img;
  }

  /** Tela do 2FA no login: mesmo cartão, título "Autentique sua conta" e seis campos */
  function corpo2FA(cfg) {
    const aviso = h("p", { class: "auth2fa__erro", role: "alert" }, cfg.erro || "");
    const campoCod = V().CampoCodigo({
      rotulo: "Código de 6 dígitos do aplicativo 2FA",
      onDigitar: () => campoCod.marcarErro(false),
      onCompleto: (codigo) => {
        campoCod.desabilitar(true);
        Promise.resolve(cfg.onCodigo(codigo)).then((msgErro) => {
          if (!msgErro) return;                       // entrou: a tela é trocada pelo app
          aviso.textContent = msgErro;
          campoCod.desabilitar(false);
          campoCod.marcarErro(true);
          campoCod.limpar();
        });
      },
    });
    requestAnimationFrame(() => campoCod.foco());
    return h("div", { class: "auth__form auth2fa" },
      h("p", { class: "auth2fa__sub" }, "Insira o código de 6 dígitos do seu aplicativo 2FA."),
      campoCod.el, aviso,
      rodape("Não é você?", "Entrar com outra conta", cfg.onCancelar2FA));
  }

  /** Primeira tela: Continuar com e-mail · Continuar com Google · Inscreva-se */
  function corpoInicio(root, cfg, erro) {
    const area = h("div", { class: "auth__opcoes" });
    const aviso = h("p", { class: "auth__error", role: "alert" }, erro || "");
    const google = () => {
      if (!cfg.google) { aviso.textContent = "O login com Google ainda não está disponível. Continue com e-mail."; return; }
      // Mostra o logo do Google, "Continuar com Google" e o carregamento enquanto vai para o Google
      mount(area, h("div", { class: "auth__indo-google", role: "status" },
        logoGoogle(), h("p", { class: "auth__indo-texto" }, "Continuar com Google"), h("span", { class: "spinner", "aria-hidden": "true" })));
      setTimeout(() => location.assign("/api/google/inicio"), 350);
    };
    mount(area,
      h("button", { type: "button", class: "auth__opcao auth__opcao--email", "data-autofocus": "",
        onClick: () => { estado.etapa = 1; render(root, Object.assign({}, cfg, { erro: null })); } }, "Continuar com e-mail"),
      h("button", { type: "button", class: "auth__opcao auth__opcao--google", onClick: google }, logoGoogle(), h("span", null, "Continuar com Google")));
    return h("div", { class: "auth__form auth__inicio" }, area, aviso, rodape("Não tem uma conta?", "Inscreva-se", cfg.onIrCadastro));
  }

  function render(root, cfg) {
    const st = ZoZo.store.get().session;
    const modo = st.status === "register" ? "register" : st.status === "loading" ? "loading" : st.status === "2fa" ? "2fa" : "login";

    if (modo === "loading") {
      mount(root, h("div", { class: "auth" },
        h("div", { class: "auth__center" }, h("div", { class: "auth__loading", role: "status" }, h("span", { class: "spinner", "aria-hidden": "true" }), h("span", null, "Carregando…")))));
      return;
    }
    // Trocar entre Entrar e Cadastro recomeça na primeira etapa
    if (estado.modo !== modo && modo !== "2fa") estado = { modo, etapa: modo === "login" ? 0 : 1, email: cfg.emailInicial || estado.email || "", nome: "", google: false };

    // Erros de senha errada viram a mensagem padrão; os demais (ex.: bloqueio) aparecem como vieram
    const erro = cfg.erro ? (cfg.erro === FR.INVALID_CREDENTIALS ? ERRO_LOGIN : cfg.erro) : null;
    const voltar = (etapa) => () => { estado.etapa = etapa; estado.google = false; render(root, Object.assign({}, cfg, { erro: null })); };
    let titulo, corpo, tituloClasse = "auth__title";

    if (modo === "2fa") {
      titulo = "Autentique sua conta";
      tituloClasse = "auth__title auth2fa__titulo";
      corpo = corpo2FA(cfg);
    } else if (modo === "login" && estado.etapa === 0) {
      titulo = "Entrar no ZoZo";
      corpo = corpoInicio(root, cfg, erro);
    } else if (modo === "login" && estado.etapa === 1) {
      titulo = "Entrar no ZoZo";
      const email = campo({ type: "email", name: "email", id: "email", autocomplete: "username", inputmode: "email", placeholder: "Insira seu e-mail", rotulo: "E-mail", value: estado.email });
      email.dataset.autofocus = "";
      const aviso = h("p", { class: "auth__error", role: "alert" }, erro || "");
      corpo = h("form", { class: "auth__form", method: "post", action: "#", novalidate: true, onSubmit: (e) => {
        e.preventDefault();
        if (!EMAIL_OK.test(email.value.trim())) { aviso.textContent = "Insira um e-mail válido."; email.focus(); return; }
        estado.email = email.value.trim(); estado.etapa = 2;
        render(root, Object.assign({}, cfg, { erro: null }));
      } }, h("div", { class: "auth__fields" }, email), botao("Continuar"), aviso, rodape("Não tem uma conta?", "Inscreva-se", cfg.onIrCadastro));
    } else if (modo === "login") {
      titulo = "Entrar com senha";
      const senha = campoSenha("current-password");
      senha.input.dataset.autofocus = "";
      const enviar = botao("Continuar");
      const captcha = cfg.captchaLogin && cfg.turnstile && !estado.google ? V().Captcha(cfg.turnstile) : null;
      const aviso = erroAbaixo(erro) || h("p", { class: "auth__error", role: "alert" });
      const nota = estado.google ? h("p", { class: "auth__nota" }, "E-mail confirmado pelo Google. Digite sua senha do ZoZo: é ela que protege seus dados com criptografia.") : null;
      corpo = h("form", { class: "auth__form", method: "post", action: "#", novalidate: true, onSubmit: (e) => {
        e.preventDefault();
        if (!senha.input.value) { senha.input.focus(); return; }
        if (captcha && !captcha.token()) { aviso.textContent = FR.CAPTCHA_REQUIRED; return; }
        if (senha.input.type === "text") senha.wrap.querySelector(".input-reveal").click();     // volta a ocultar
        enviar.disabled = true; enviar.classList.add("is-busy");
        cfg.onLogin({ email: estado.email, senha: senha.input.value, turnstile: captcha ? captcha.token() : undefined });
      } }, nota, h("div", { class: "auth__fields" }, emailOculto(), senha.wrap), captcha ? captcha.el : null, enviar, aviso,
        rodape(estado.email, "Usar outro e-mail", voltar(1)));
    } else if (estado.etapa === 1) {
      titulo = "Vamos começar";
      const nome = campo({ name: "name", id: "name", autocomplete: "given-name", placeholder: "Insira seu primeiro nome", rotulo: "Primeiro nome", value: estado.nome });
      nome.dataset.autofocus = "";
      nome.maxLength = 80;
      const email = campo({ type: "email", name: "email", id: "email", autocomplete: "username", inputmode: "email", placeholder: "Insira seu e-mail", rotulo: "E-mail", value: estado.email });
      const aviso = h("p", { class: "auth__error", role: "alert" }, erro || "");
      corpo = h("form", { class: "auth__form", method: "post", action: "#", novalidate: true, onSubmit: (e) => {
        e.preventDefault();
        if (!nome.value.trim()) { aviso.textContent = "Insira seu primeiro nome."; nome.focus(); return; }
        if (!EMAIL_OK.test(email.value.trim())) { aviso.textContent = "Insira um e-mail válido."; email.focus(); return; }
        estado.nome = nome.value.trim(); estado.email = email.value.trim(); estado.etapa = 2;
        render(root, Object.assign({}, cfg, { erro: null }));
      } }, h("div", { class: "auth__fields auth__stack" }, nome, email), botao("Continuar"), aviso, rodape("Já tem uma conta?", "Entrar", cfg.onVoltar));
    } else {
      titulo = "Crie sua senha";
      const senha = campoSenha("new-password");
      senha.input.dataset.autofocus = "";
      senha.input.setAttribute("minlength", "8");
      const enviar = botao("Continuar");
      const captcha = cfg.turnstile && !estado.google ? V().Captcha(cfg.turnstile) : null;   // Google já confirmou a pessoa
      const aviso = h("p", { class: "auth__error", role: "alert" }, erro || "");
      const nota = estado.google ? h("p", { class: "auth__nota" }, "E-mail confirmado pelo Google. Crie a senha do ZoZo: ela é a chave da criptografia dos seus dados e não pode ser recuperada.") : null;
      corpo = h("form", { class: "auth__form", method: "post", action: "#", novalidate: true, onSubmit: (e) => {
        e.preventDefault();
        if (senha.input.value.length < 8) { aviso.textContent = "Use pelo menos 8 caracteres."; senha.input.focus(); return; }
        if (captcha && !captcha.token()) { aviso.textContent = FR.CAPTCHA_REQUIRED; return; }
        if (senha.input.type === "text") senha.wrap.querySelector(".input-reveal").click();
        enviar.disabled = true; enviar.classList.add("is-busy");
        cfg.onCadastro({ nomeUsuario: estado.nome, email: estado.email, senha: senha.input.value, turnstile: captcha ? captcha.token() : undefined });
      } }, nota, h("div", { class: "auth__fields" }, emailOculto(), senha.wrap), captcha ? captcha.el : null, enviar, aviso,
        rodape(estado.email, "Voltar", voltar(1)));
    }

    // Modo demonstração: só um lembrete (as credenciais ficam no arquivo local ui/mock/credenciais.local.js)
    const demo = modo === "login" && estado.etapa <= 1 && ZoZo.bridge.isDemo
      ? h("p", { class: "auth__demo" }, "Modo de demonstração — use a conta de prévia configurada neste computador.") : null;

    // Animação: o cartão surge na 1ª vez; ao trocar de etapa o conteúdo desliza (para a frente ou para trás).
    // Redesenho da mesma etapa (ex.: mensagem de erro) não anima.
    const passo = modo + ":" + estado.etapa;
    const animacao = !ultimoPasso || !root.querySelector(".auth__card") ? "auth__card--entrar"
      : passo === ultimoPasso ? null : (estado.etapa >= ultimaEtapa ? "auth__card--frente" : "auth__card--tras");
    ultimoPasso = passo; ultimaEtapa = estado.etapa;
    mount(root, h("div", { class: "auth" },
      h("div", { class: "auth__center" },
        h("div", { class: ["auth__card", animacao] },
          logo(),
          h("h1", { class: tituloClasse }, titulo),
          st.storageAvailable === false ? h("div", { class: "auth__warning", role: "status" }, icon("nuvem", { size: 16 }), h("span", null, FR.STORAGE_UNAVAILABLE)) : null,
          corpo, demo))));

    requestAnimationFrame(() => { const a = root.querySelector("[data-autofocus]"); if (a) a.focus(); });
  }

  /** Cartão de espera durante o login/cadastro: logo, texto ("Entrando no ZoZo" / "Preparando sua conta...") e carregando */
  function carregando(root, texto) {
    mount(root, h("div", { class: "auth" },
      h("div", { class: "auth__center" },
        h("div", { class: "auth__card auth__card--espera auth__card--frente", role: "status", "aria-live": "polite" },
          logo(),
          h("p", { class: "auth__title auth__espera-texto" }, texto),
          h("span", { class: "spinner auth__espera-spinner", "aria-hidden": "true" })))));
  }

  /** Volta à primeira etapa (ex.: depois de sair da conta) */
  function reiniciar() { estado = { modo: null, etapa: 0, email: "", nome: "", google: false }; }

  /** Depois do Google: pula direto para a senha (conta existente) ou para "Crie sua senha" (cadastro) */
  function prepararGoogle(dados) {
    estado = dados.contaExiste
      ? { modo: "login", etapa: 2, email: dados.email, nome: "", google: true }
      : { modo: "register", etapa: 2, email: dados.email, nome: dados.nome || dados.email.split("@")[0], google: true };
  }

  ZoZo.auth = { render, reiniciar, prepararGoogle, carregando, A };
})(window.ZoZo);
