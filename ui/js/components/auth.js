/* =============================================================
   ZoZo — Login e Cadastro em etapas (padrão Copilot Money)
   Entrar:    e-mail → Continuar → senha → Continuar
   Cadastro:  nome + e-mail → Continuar → crie sua senha → Continuar
   ============================================================= */
(function (ZoZo) {
  "use strict";
  const { h, mount } = ZoZo.dom;
  const { icon } = ZoZo.icons;
  const UI = ZoZo.ui;
  const A = ZoZo.messages.ACTIONS;
  const FR = ZoZo.messages.FRIENDLY;

  const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const ERRO_LOGIN = "Erro ao fazer login na sua conta. Tente novamente.";

  // Etapa atual (sobrevive aos redesenhos após um erro)
  let estado = { modo: null, etapa: 1, email: "", nome: "" };

  function campo(cfg) {
    const input = UI.Input(Object.assign({ class: "auth__input", required: true }, cfg));
    input.setAttribute("aria-label", cfg.rotulo);
    return input;
  }

  function campoSenha(autocomplete) {
    const input = campo({ type: "password", name: "senha", autocomplete, placeholder: "Insira sua senha", rotulo: "Senha" });
    const btn = h("button", { type: "button", class: "input-reveal", "aria-label": "Mostrar senha", "aria-pressed": "false" }, icon("olho", { size: 16 }));
    btn.addEventListener("click", () => {
      const visivel = input.type === "text";
      input.type = visivel ? "password" : "text";
      btn.setAttribute("aria-pressed", String(!visivel));
      btn.setAttribute("aria-label", visivel ? "Mostrar senha" : "Ocultar senha");
      mount(btn, icon(visivel ? "olho" : "olho-fechado", { size: 16 }));
    });
    return { input, wrap: h("div", { class: "input-with-action" }, input, btn) };
  }

  const botao = (texto) => h("button", { type: "submit", class: "btn btn--primary btn--block auth__btn" }, h("span", { class: "btn__label" }, texto));
  const erroAbaixo = (msg) => (msg ? h("p", { class: "auth__error", role: "alert" }, msg) : null);
  const rodape = (pergunta, acao, onClick) => h("p", { class: "auth__switch" },
    h("span", null, pergunta + " "), h("button", { type: "button", class: "auth__link", onClick }, acao));

  function render(root, cfg) {
    const st = ZoZo.store.get().session;
    const modo = st.status === "register" ? "register" : st.status === "loading" ? "loading" : "login";

    if (modo === "loading") {
      mount(root, h("div", { class: "auth" },
        h("div", { class: "auth__center" }, h("div", { class: "auth__loading", role: "status" }, h("span", { class: "spinner", "aria-hidden": "true" }), h("span", null, "Carregando…")))));
      return;
    }
    // Trocar entre Entrar e Cadastro recomeça na primeira etapa
    if (estado.modo !== modo) estado = { modo, etapa: 1, email: cfg.emailInicial || estado.email || "", nome: "" };

    // Erros de senha errada viram a mensagem padrão; os demais (ex.: bloqueio) aparecem como vieram
    const erro = cfg.erro ? (cfg.erro === FR.INVALID_CREDENTIALS ? ERRO_LOGIN : cfg.erro) : null;
    const voltar = () => { estado.etapa = 1; render(root, Object.assign({}, cfg, { erro: null })); };
    let titulo, corpo;

    if (modo === "login" && estado.etapa === 1) {
      titulo = "Entrar no ZoZo";
      const email = campo({ type: "email", name: "email", autocomplete: "username", placeholder: "Insira seu e-mail", rotulo: "E-mail", value: estado.email });
      email.dataset.autofocus = "";
      // Mostra também avisos vindos de fora (ex.: sessão encerrada por inatividade)
      const aviso = h("p", { class: "auth__error", role: "alert" }, erro || "");
      corpo = h("form", { class: "auth__form", novalidate: true, onSubmit: (e) => {
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
      corpo = h("form", { class: "auth__form", novalidate: true, onSubmit: (e) => {
        e.preventDefault();
        if (!senha.input.value) { senha.input.focus(); return; }
        enviar.disabled = true; enviar.classList.add("is-busy");
        cfg.onLogin({ email: estado.email, senha: senha.input.value });
      } },
        // e-mail escondido ajuda o gerenciador de senhas do navegador
        h("div", { class: "auth__fields" },
          h("input", { type: "email", name: "email", autocomplete: "username", value: estado.email, class: "visually-hidden", tabindex: "-1", "aria-hidden": "true" }),
          senha.wrap), enviar, erroAbaixo(erro), rodape(estado.email, "Usar outro e-mail", voltar));
    } else if (estado.etapa === 1) {
      titulo = "Vamos começar";
      const nome = campo({ name: "nomeUsuario", autocomplete: "given-name", placeholder: "Insira seu primeiro nome", rotulo: "Primeiro nome", value: estado.nome });
      nome.dataset.autofocus = "";
      nome.maxLength = 80;
      const email = campo({ type: "email", name: "email", autocomplete: "username", placeholder: "Insira seu e-mail", rotulo: "E-mail", value: estado.email });
      const aviso = h("p", { class: "auth__error", role: "alert" });
      corpo = h("form", { class: "auth__form", novalidate: true, onSubmit: (e) => {
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
      const enviar = botao("Continuar");
      const aviso = h("p", { class: "auth__error", role: "alert" }, erro || "");
      corpo = h("form", { class: "auth__form", novalidate: true, onSubmit: (e) => {
        e.preventDefault();
        if (senha.input.value.length < 8) { aviso.textContent = "Use pelo menos 8 caracteres."; senha.input.focus(); return; }
        enviar.disabled = true; enviar.classList.add("is-busy");
        cfg.onCadastro({ nomeUsuario: estado.nome, email: estado.email, senha: senha.input.value });
      } },
        h("div", { class: "auth__fields" },
          h("input", { type: "email", name: "email", autocomplete: "username", value: estado.email, class: "visually-hidden", tabindex: "-1", "aria-hidden": "true" }),
          senha.wrap), enviar, aviso, rodape(estado.email, "Voltar", voltar));
    }

    const demo = modo === "login" && estado.etapa === 1 && ZoZo.bridge.isDemo && ZoZo.mock && ZoZo.mock.host
      ? h("p", { class: "auth__demo" }, "Demonstração: ", h("strong", null, ZoZo.mock.host.demo.email), " · ", h("strong", null, ZoZo.mock.host.demo.senha)) : null;

    mount(root, h("div", { class: "auth" },
      h("div", { class: "auth__center" },
        h("div", { class: "auth__card" },
          h("img", { class: "auth__icon", src: "assets/img/zozo-icone.png", alt: "", width: "56", height: "56" }),
          h("h1", { class: "auth__title" }, titulo),
          st.storageAvailable === false ? h("div", { class: "auth__warning", role: "status" }, icon("nuvem", { size: 16 }), h("span", null, FR.STORAGE_UNAVAILABLE)) : null,
          corpo, demo))));

    requestAnimationFrame(() => { const a = root.querySelector("[data-autofocus]"); if (a) a.focus(); });
  }

  /** Volta à primeira etapa (ex.: depois de sair da conta) */
  function reiniciar() { estado = { modo: null, etapa: 1, email: "", nome: "" }; }

  ZoZo.auth = { render, reiniciar, A };
})(window.ZoZo);
