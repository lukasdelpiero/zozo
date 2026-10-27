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

   Visual: Tailwind CSS (prefixo tw:, tabela C abaixo). As classes auth__* que
   sobraram são só GANCHOS (JS e testes) — não há CSS para elas. Geometria fixa:
   mesma caixa, logo, título, primeiro campo e botão no mesmo lugar em todas as
   etapas (no celular e em janelas baixas a caixa acompanha o conteúdo).
   ============================================================= */
(function (ZoZo: ZoZoGlobal) {
  "use strict";
  const { h, s, mount } = ZoZo.dom;
  const { icon } = ZoZo.icons;
  const UI = ZoZo.ui;
  const A = ZoZo.messages.ACTIONS;
  const FR = ZoZo.messages.FRIENDLY;
  const V = () => ZoZo.verificacao;

  const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const ERRO_LOGIN = "Erro ao fazer login na sua conta. Tente novamente.";

  /* ---------- classes (sempre escritas por inteiro: o Tailwind só gera o que encontra no texto) ---------- */
  const TITULO = "tw:flex-none tw:mb-7 tw:text-center tw:text-[28px] tw:leading-[34px] tw:font-[550] tw:tracking-[-0.01em] tw:text-[#1b2a4a] "
    + "tw:celular:text-[24px] tw:celular:leading-[1.25]";
  const OPCAO = "tw:inline-flex tw:items-center tw:justify-center tw:gap-2.5 tw:w-full tw:h-[46px] tw:px-4 tw:py-0 tw:rounded-[10px] "
    + "tw:text-[15px] tw:font-[620] tw:cursor-pointer tw:[transition:filter_120ms_ease,box-shadow_120ms_ease,translate_60ms_ease] "
    + "tw:active:translate-y-px tw:focus-visible:outline-2 tw:focus-visible:outline-zz-primary tw:focus-visible:outline-offset-2 "
    + "tw:disabled:cursor-default tw:disabled:translate-y-0 tw:disabled:[filter:saturate(0.4)_opacity(0.7)]";
  const TEXTO = "tw:m-0 tw:text-center tw:leading-[1.5] tw:wrap-anywhere";
  const C = {
    raiz: "auth tw:fixed tw:inset-0 tw:grid tw:grid-rows-[1fr_auto] tw:overflow-auto tw:bg-[#f8f9fb]",
    // termos e política embaixo da tela, fora do cartão (o cartão fica no mesmo lugar em todas as etapas)
    legal: "tw:flex tw:items-center tw:justify-center tw:gap-2 tw:mb-4 tw:text-[13px] tw:font-[450] tw:text-zz-secondary",
    politica: "tw:text-zz-secondary tw:no-underline tw:underline-offset-2 tw:hover:text-zz-text tw:hover:underline "
      + "tw:rounded tw:focus-visible:outline-2 tw:focus-visible:outline-zz-primary tw:focus-visible:outline-offset-2",
    centro: "auth__center tw:grid tw:place-items-center tw:p-6 tw:celular:p-4",
    cartao: "auth__card tw:relative tw:flex tw:flex-col tw:items-center tw:justify-start tw:w-[min(580px,100%)] tw:h-[575px] tw:min-h-0 "
      + "tw:overflow-hidden tw:pt-[88px] tw:px-[90px] tw:pb-10 tw:bg-zz-surface tw:border tw:border-[#e6e8ec] tw:rounded-2xl "
      + "tw:celular:h-auto tw:celular:pt-12 tw:celular:px-6 tw:celular:pb-8 tw:tela-baixa:h-auto tw:tela-baixa:pt-12 tw:tela-baixa:pb-8",
    logo: "auth__icon tw:flex-none tw:size-14 tw:mb-[18px] tw:rounded-[10px] tw:shadow-[0_6px_16px_rgba(15,39,66,0.12),0_1px_3px_rgba(15,39,66,0.10)]",
    selo: "tw:grid tw:place-items-center tw:bg-[#6948D8] tw:bg-(image:--botao-roxo) tw:text-white tw:text-[28px] tw:font-bold",
    titulo: TITULO + " tw:h-[34px] tw:whitespace-nowrap tw:celular:h-auto tw:celular:whitespace-normal",
    tituloEspera: TITULO + " tw:whitespace-normal",
    form: "auth__form tw:flex tw:flex-col tw:gap-3.5 tw:w-[min(400px,100%)]",
    form2fa: "auth__form tw:flex tw:flex-col tw:gap-[18px] tw:w-[min(400px,100%)]",
    campos: "tw:flex tw:flex-col tw:gap-2.5 tw:min-h-[98px]",
    input: "tw:h-11 tw:rounded-xl tw:border-[#e3e6eb] tw:bg-[#f4f6f8] tw:text-[16px] tw:font-[450] "
      + "tw:placeholder:text-[16px] tw:placeholder:font-[450] tw:focus:bg-zz-surface tw:focus:border-zz-primary",
    botao: ZoZo.pecas.botaoPrimarioCheio + " tw:h-11 tw:mt-1.5 tw:rounded-xl tw:text-[15px] tw:font-[650]",
    erro: "tw:m-0 tw:min-h-0 tw:text-center tw:text-[13px] tw:font-[450] tw:text-zz-text tw:empty:hidden",
    rodape: "tw:flex tw:flex-wrap tw:items-center tw:justify-center tw:gap-1 tw:mt-1.5 tw:text-[15px] tw:font-[450] tw:text-zz-secondary",
    link: "tw:p-0 tw:[border:0] tw:bg-transparent tw:font-bold tw:text-zz-text tw:cursor-pointer tw:hover:underline tw:hover:underline-offset-2",
    opcoes: "tw:flex tw:flex-col tw:justify-center tw:gap-3 tw:min-h-[104px]",
    opcaoEmail: OPCAO + " tw:[border:0_none_transparent] tw:text-white tw:bg-[#6948D8] tw:bg-(image:--botao-roxo) "
      + "tw:shadow-[0_1px_2px_rgba(15,39,66,0.18),inset_0_1px_0_rgba(255,255,255,0.18)] "
      + "tw:hover:bg-(image:--botao-roxo-hover) tw:active:bg-[linear-gradient(180deg,#6948D8_0%,#5A3BC4_100%)]",
    opcaoGoogle: OPCAO + " tw:text-[#1f1f1f] tw:border tw:border-[#dadce0] tw:bg-transparent tw:bg-[linear-gradient(180deg,#ffffff_0%,#f1f3f4_100%)] "
      + "tw:shadow-[0_1px_2px_rgba(15,39,66,0.08)] tw:hover:shadow-[0_2px_6px_rgba(15,39,66,0.12)]",
    indoGoogle: "tw:flex tw:flex-col tw:items-center tw:gap-2.5",
    indoTexto: "tw:m-0 tw:text-[15px] tw:font-[550] tw:text-zz-text",
    nota: "tw:m-0 tw:mb-1 tw:text-center tw:text-[13px] tw:text-zz-secondary",
    carregando: "tw:flex tw:items-center tw:gap-3 tw:text-zz-secondary",
    sub2fa: "tw:m-0 tw:text-center tw:text-[15px] tw:font-[450] tw:text-zz-text",
    erro2fa: "tw:m-0 tw:text-center tw:text-[15px] tw:font-[450] tw:text-zz-text tw:empty:hidden",
    caixa2fa: "tw:w-[min(52px,calc((100%-40px)/6))] tw:h-[52px]",
    // aviso de servidor indisponível: centralizado no rodapé do cartão (no celular, logo abaixo do título)
    alerta: "tw:absolute tw:left-1/2 tw:bottom-[18px] tw:-translate-x-1/2 tw:w-[min(400px,calc(100%-48px))] tw:m-0 tw:flex tw:items-center "
      + "tw:justify-center tw:gap-2 tw:p-3 tw:rounded-lg tw:text-left tw:text-[13px] tw:leading-[1.4] tw:bg-zz-warning-soft tw:text-zz-warning-text "
      + "tw:celular:static tw:celular:translate-x-0 tw:celular:w-full tw:celular:mt-4",
    ok: "tw:flex tw:items-center tw:justify-center tw:gap-2 tw:m-0 tw:mb-3.5 tw:text-center tw:text-[13px] tw:font-[520] tw:text-zz-positive",
    texto: TEXTO + " tw:text-[15px] tw:text-zz-text",
    spinnerEspera: ZoZo.pecas.girando + " tw:size-[30px]! tw:border-[3px]!",
    girandoBotao: "tw:size-[18px] tw:rounded-[50%] tw:border-2 tw:border-white/35 tw:border-t-white tw:animate-zz-gira tw:motion-reduce:animate-none",
    // "Esqueci minha senha": discreto, embaixo do campo (dentro da área dos campos: o botão não muda de lugar)
    esqueci: "tw:self-end tw:p-0 tw:[border:0] tw:bg-transparent tw:text-[14px] tw:font-[550] tw:text-zz-secondary tw:cursor-pointer "
      + "tw:hover:text-zz-text tw:hover:underline tw:hover:underline-offset-2",
    atencao: "tw:m-0 tw:p-3 tw:rounded-lg tw:text-center tw:text-[13px] tw:leading-[1.4] tw:bg-zz-warning-soft tw:text-zz-warning-text",
  };
  // Animações do cartão: [logo, título (2º filho), 3º filho, 4º em diante]
  const ANIM: Record<string, { cartao: string; filhos: string[] }> = {
    entrar: { cartao: "tw:animate-zz-auth-cartao tw:motion-reduce:animate-none", filhos: ["tw:animate-zz-auth-logo tw:motion-reduce:animate-none", "", "", ""] },
    frente: { cartao: "", filhos: ["", "tw:animate-zz-auth-frente tw:motion-reduce:animate-none",
      "tw:animate-zz-auth-frente-40 tw:motion-reduce:animate-none", "tw:animate-zz-auth-frente-70 tw:motion-reduce:animate-none"] },
    tras: { cartao: "", filhos: ["", "tw:animate-zz-auth-tras tw:motion-reduce:animate-none",
      "tw:animate-zz-auth-tras-40 tw:motion-reduce:animate-none", "tw:animate-zz-auth-tras-70 tw:motion-reduce:animate-none"] },
  };
  /** Cartão com os filhos animados conforme a posição (o 1º é sempre o logo) */
  function cartao(animacao: string | null, filhos: Array<HTMLElement | null>) {
    const a = animacao ? ANIM[animacao] : null;
    const lista = filhos.filter((el): el is HTMLElement => !!el);
    if (a) lista.forEach((el, i) => { const c = a.filhos[Math.min(i, 3)]; if (c) el.classList.add(...c.split(" ")); });
    return h("main", { class: C.raiz }, h("div", { class: C.centro }, h("div", { class: [C.cartao, a && a.cartao] }, lista)),
      h("nav", { class: C.legal, "aria-label": "Sobre, termos e privacidade" },
        h("a", { class: C.politica, href: "/sobre", target: "_blank", rel: "noopener" }, "Sobre o ZoZo"),
        h("span", { "aria-hidden": "true" }, "·"),
        h("a", { class: C.politica, href: "/termos-uso", target: "_blank", rel: "noopener" }, "Termos de uso"),
        h("span", { "aria-hidden": "true" }, "·"),
        h("a", { class: C.politica, href: "/politica-privacidade", target: "_blank", rel: "noopener" }, "Política de privacidade")));
  }

  // Etapa atual (sobrevive aos redesenhos após um erro). Login: 0 início · 1 e-mail · 2 senha
  type Estado = { modo: string | null; etapa: number; email: string; nome: string; google: boolean };
  let estado: Estado = { modo: null, etapa: 0, email: "", nome: "", google: false };
  let ultimoPasso: string | null = null, ultimaEtapa = 0;   // para animar só quando a etapa muda

  /** Campo do formulário de entrada: atributos do input + rótulo acessível */
  function campo(cfg: Record<string, unknown> & { rotulo: string }) {
    const input = UI.Input(Object.assign({ class: C.input, required: true }, cfg));
    input.setAttribute("aria-label", cfg.rotulo);
    return input;
  }

  function campoSenha(autocomplete: string) {
    const input = campo({ type: "password", name: "password", id: "password", autocomplete, placeholder: "Insira sua senha", rotulo: "Senha" });
    return { input, wrap: V().ComRevelar(input) };
  }
  /** E-mail presente (oculto) no formulário da senha: é por ele que o navegador sabe de qual conta é a senha */
  const emailOculto = () => h("input", { type: "email", name: "email", id: "email", autocomplete: "username", value: estado.email,
    class: "tw:sr-only", tabindex: "-1", "aria-hidden": "true", readonly: true });

  const botao = (texto: string) => h("button", { type: "submit", class: C.botao }, h("span", { class: "btn__label" }, texto)) as HTMLButtonElement;
  const aviso = (msg: string | null | undefined) => h("p", { class: C.erro, role: "alert" }, msg || "");
  const rodape = (pergunta: string | null, acao: string, onClick: () => void) => h("p", { class: C.rodape },
    pergunta ? h("span", null, pergunta + " ") : null, h("button", { type: "button", class: C.link, onClick }, acao));

  /** Logo oficial "G" do Google (cores da marca) */
  function logoGoogle(classe?: string) {
    return s("svg", { class: classe || "tw:flex-none", viewBox: "0 0 48 48", width: "18", height: "18", "aria-hidden": "true" },
      s("path", { fill: "#EA4335", d: "M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" }),
      s("path", { fill: "#4285F4", d: "M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" }),
      s("path", { fill: "#FBBC05", d: "M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" }),
      s("path", { fill: "#34A853", d: "M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" }));
  }

  /** Logo do ZoZo com sombra; se a imagem não carregar, mostra um selo desenhado (nunca "quebrada") */
  function logo() {
    const img = h("img", { class: C.logo, src: "assets/img/zozo-logo.svg", alt: "ZoZo", width: "56", height: "56", decoding: "async" });
    img.addEventListener("error", () => img.replaceWith(h("span", { class: [C.logo, C.selo], role: "img", "aria-label": "ZoZo" }, "Z")));
    return img;
  }

  /** Tela do 2FA no login: mesmo cartão, título "Autentique sua conta" e seis campos */
  function corpo2FA(cfg: Pick<ConfigEntrada, "erro" | "voltar" | "onCodigo" | "onCancelar2FA">) {
    const erro = h("p", { class: C.erro2fa, role: "alert" }, cfg.erro || "");
    const campoCod = V().CampoCodigo({
      rotulo: "Código de 6 dígitos do aplicativo 2FA",
      classeCaixa: C.caixa2fa,
      onDigitar: () => campoCod.marcarErro(false),
      onCompleto: (codigo) => {
        campoCod.desabilitar(true);
        Promise.resolve(cfg.onCodigo(codigo)).then((msgErro) => {
          if (!msgErro) return;                       // entrou: a tela é trocada pelo app
          erro.textContent = msgErro;
          campoCod.desabilitar(false);
          campoCod.marcarErro(true);
          campoCod.limpar();
        });
      },
    });
    requestAnimationFrame(() => campoCod.foco());
    return h("div", { class: C.form2fa },
      h("p", { class: C.sub2fa }, "Insira o código de 6 dígitos do seu aplicativo 2FA."),
      campoCod.el, erro,
      cfg.voltar ? rodape(null, cfg.voltar, cfg.onCancelar2FA) : rodape("Não é você?", "Entrar com outra conta", cfg.onCancelar2FA));
  }

  /** Primeira tela: Continuar com e-mail · Continuar com Google · Inscreva-se */
  function corpoInicio(root: HTMLElement, cfg: ConfigEntrada, erro: string | null) {
    const area = h("div", { class: C.opcoes });
    const msg = aviso(erro);
    const google = () => {
      if (!cfg.google) { msg.textContent = "O login com Google ainda não está disponível. Continue com e-mail."; return; }
      // Mostra o logo do Google, "Continuar com Google" e o carregamento enquanto vai para o Google
      mount(area, h("div", { class: C.indoGoogle, role: "status" },
        logoGoogle("tw:flex-none tw:size-7"), h("p", { class: C.indoTexto }, "Continuar com Google"), h("span", { class: ZoZo.pecas.girando, "aria-hidden": "true" })));
      setTimeout(() => location.assign("/api/google/inicio"), 350);
    };
    mount(area,
      // sem foco automático: quem chega digitando o endereço (teclado) via o anel de foco em volta do botão
      h("button", { type: "button", class: C.opcaoEmail,
        onClick: () => { estado.etapa = 1; render(root, Object.assign({}, cfg, { erro: null })); } }, "Continuar com e-mail"),
      h("button", { type: "button", class: C.opcaoGoogle, onClick: google }, logoGoogle(), h("span", null, "Continuar com Google")));
    return h("div", { class: C.form }, area, msg, rodape("Não tem uma conta?", "Inscreva-se", cfg.onIrCadastro));
  }

  function render(root: HTMLElement, cfg: ConfigEntrada) {
    const st = ZoZo.store.get().session;
    const modo = st.status === "register" ? "register" : st.status === "loading" ? "loading" : st.status === "2fa" ? "2fa" : "login";

    if (modo === "loading") {
      mount(root, h("main", { class: C.raiz },
        h("div", { class: C.centro }, h("div", { class: C.carregando, role: "status" }, h("span", { class: ZoZo.pecas.girando, "aria-hidden": "true" }), h("span", null, "Carregando…")))));
      return;
    }
    // Trocar entre Entrar e Cadastro recomeça na primeira etapa
    if (estado.modo !== modo && modo !== "2fa") estado = { modo, etapa: modo === "login" ? 0 : 1, email: cfg.emailInicial || estado.email || "", nome: "", google: false };

    // Erros de senha errada viram a mensagem padrão; os demais (ex.: bloqueio) aparecem como vieram
    const erro = cfg.erro ? (cfg.erro === FR.INVALID_CREDENTIALS ? ERRO_LOGIN : cfg.erro) : null;
    const voltar = (etapa: number) => () => { estado.etapa = etapa; estado.google = false; render(root, Object.assign({}, cfg, { erro: null })); };
    let titulo, corpo;

    if (modo === "2fa") {
      titulo = "Autentique sua conta";
      corpo = corpo2FA(cfg);
    } else if (modo === "login" && estado.etapa === 0) {
      titulo = "Entrar no ZoZo";
      corpo = corpoInicio(root, cfg, erro);
    } else if (modo === "login" && estado.etapa === 1) {
      titulo = "Entrar no ZoZo";
      const email = campo({ type: "email", name: "email", id: "email", autocomplete: "username", inputmode: "email", placeholder: "Insira seu e-mail", rotulo: "E-mail", value: estado.email });
      email.dataset.autofocus = "";
      const msg = aviso(erro);
      corpo = h("form", { class: C.form, method: "post", action: "#", novalidate: true, onSubmit: (e: SubmitEvent) => {
        e.preventDefault();
        if (!EMAIL_OK.test(email.value.trim())) { msg.textContent = "Insira um e-mail válido."; email.focus(); return; }
        estado.email = email.value.trim(); estado.etapa = 2;
        render(root, Object.assign({}, cfg, { erro: null }));
      } }, h("div", { class: C.campos }, email), botao("Continuar"), msg, rodape("Não tem uma conta?", "Inscreva-se", cfg.onIrCadastro));
    } else if (modo === "login") {
      titulo = "Entrar com senha";
      const senha = campoSenha("current-password");
      senha.input.dataset.autofocus = "";
      const enviar = botao("Continuar");
      const captcha = cfg.captchaLogin && cfg.turnstile && !estado.google ? V().Captcha(cfg.turnstile) : null;
      const msg = aviso(erro);
      const nota = estado.google ? h("p", { class: C.nota }, "E-mail confirmado pelo Google. Digite sua senha do ZoZo: é ela que protege seus dados com criptografia.") : null;
      corpo = h("form", { class: C.form, method: "post", action: "#", novalidate: true, onSubmit: (e: SubmitEvent) => {
        e.preventDefault();
        if (!senha.input.value) { senha.input.focus(); return; }
        if (captcha && !captcha.token()) { msg.textContent = FR.CAPTCHA_REQUIRED; return; }
        if (senha.input.type === "text") senha.wrap.querySelector<HTMLElement>(".input-reveal")?.click();     // volta a ocultar
        enviar.disabled = true; enviar.classList.add("is-busy");
        cfg.onLogin({ email: estado.email, senha: senha.input.value, turnstile: captcha ? captcha.token() : undefined });
      } }, nota, h("div", { class: C.campos }, emailOculto(), senha.wrap,
        cfg.onEsqueci ? h("button", { type: "button", class: C.esqueci, onClick: () => { if (cfg.onEsqueci) cfg.onEsqueci(estado.email); } }, "Esqueci minha senha") : null),
      captcha ? captcha.el : null, enviar, msg,
        rodape(estado.email, "Usar outro e-mail", voltar(1)));
    } else if (estado.etapa === 1) {
      titulo = "Vamos começar";
      const nome = campo({ name: "name", id: "name", autocomplete: "given-name", placeholder: "Insira seu primeiro nome", rotulo: "Primeiro nome", value: estado.nome });
      nome.dataset.autofocus = "";
      nome.maxLength = 80;
      const email = campo({ type: "email", name: "email", id: "email", autocomplete: "username", inputmode: "email", placeholder: "Insira seu e-mail", rotulo: "E-mail", value: estado.email });
      const msg = aviso(erro);
      corpo = h("form", { class: C.form, method: "post", action: "#", novalidate: true, onSubmit: (e: SubmitEvent) => {
        e.preventDefault();
        if (!nome.value.trim()) { msg.textContent = "Insira seu primeiro nome."; nome.focus(); return; }
        if (!EMAIL_OK.test(email.value.trim())) { msg.textContent = "Insira um e-mail válido."; email.focus(); return; }
        estado.nome = nome.value.trim(); estado.email = email.value.trim(); estado.etapa = 2;
        render(root, Object.assign({}, cfg, { erro: null }));
      } }, h("div", { class: C.campos }, nome, email), botao("Continuar"), msg, rodape("Já tem uma conta?", "Entrar", cfg.onVoltar));
    } else {
      titulo = "Crie sua senha";
      const senha = campoSenha("new-password");
      senha.input.dataset.autofocus = "";
      senha.input.setAttribute("minlength", "8");
      const enviar = botao("Continuar");
      const captcha = cfg.turnstile && !estado.google ? V().Captcha(cfg.turnstile) : null;   // Google já confirmou a pessoa
      const msg = aviso(erro);
      const nota = estado.google ? h("p", { class: C.nota }, "E-mail confirmado pelo Google. Crie a senha do ZoZo: ela é a chave da criptografia dos seus dados e não pode ser recuperada.") : null;
      corpo = h("form", { class: C.form, method: "post", action: "#", novalidate: true, onSubmit: (e: SubmitEvent) => {
        e.preventDefault();
        if (senha.input.value.length < 8) { msg.textContent = "Use pelo menos 8 caracteres."; senha.input.focus(); return; }
        if (captcha && !captcha.token()) { msg.textContent = FR.CAPTCHA_REQUIRED; return; }
        if (senha.input.type === "text") senha.wrap.querySelector<HTMLElement>(".input-reveal")?.click();
        enviar.disabled = true; enviar.classList.add("is-busy");
        cfg.onCadastro({ nomeUsuario: estado.nome, email: estado.email, senha: senha.input.value, turnstile: captcha ? captcha.token() : undefined });
      } }, nota, h("div", { class: C.campos }, emailOculto(), senha.wrap), captcha ? captcha.el : null, enviar, msg,
        rodape(estado.email, "Voltar", voltar(1)));
    }


    // Animação: o cartão surge na 1ª vez; ao trocar de etapa o conteúdo desliza (para a frente ou para trás).
    // Redesenho da mesma etapa (ex.: mensagem de erro) não anima.
    const passo = modo + ":" + estado.etapa;
    const animacao = !ultimoPasso || !root.querySelector(".auth__card") ? "entrar"
      : passo === ultimoPasso ? null : (estado.etapa >= ultimaEtapa ? "frente" : "tras");
    ultimoPasso = passo; ultimaEtapa = estado.etapa;
    mount(root, cartao(animacao, [
      logo(),
      h("h1", { class: C.titulo }, titulo),
      st.storageAvailable === false ? h("div", { class: C.alerta, role: "status" }, icon("nuvem", { size: 16, class: "tw:flex-none tw:m-0" }), h("span", null, FR.STORAGE_UNAVAILABLE)) : null,
      // aviso positivo (ex.: "Quase lá!") — os erros ficam no próprio formulário
      cfg.aviso ? h("p", { class: C.ok, role: "status" }, icon("check", { size: 15, class: "tw:flex-none" }), h("span", null, cfg.aviso)) : null,
      corpo,
    ]));

    requestAnimationFrame(() => { const a = root.querySelector<HTMLElement>("[data-autofocus]"); if (a) a.focus(); });
  }

  /** Cartão de espera durante o login/cadastro: logo, texto ("Entrando no ZoZo" / "Preparando sua conta...") e carregando */
  function carregando(root: HTMLElement, texto: string) {
    // o carregando gira por conta própria: só o texto desliza
    const frase = h("p", { class: [C.tituloEspera, ANIM.frente.filhos[1]] }, texto);
    mount(root, h("main", { class: C.raiz },
      h("div", { class: C.centro },
        h("div", { class: [C.cartao, "auth__card--espera"], role: "status", "aria-live": "polite" },
          logo(), frase, h("span", { class: C.spinnerEspera, "aria-hidden": "true" })))));
  }

  /** Volta à primeira etapa (ex.: depois de sair da conta) */
  function reiniciar() { estado = { modo: null, etapa: 0, email: "", nome: "", google: false }; }

  /** Modo teste: abre uma etapa qualquer do login/cadastro (0 início · 1 e-mail ou nome · 2 senha) */
  function irPara(modo: "login" | "register", etapa: number, email: string) { estado = { modo, etapa, email, nome: "Teste", google: false }; }

  /** Link do e-mail conferido: o login abre direto na senha da conta do link */
  function prepararLogin(email: string) { estado = { modo: "login", etapa: 2, email, nome: "", google: false }; }

  /** Depois do Google: pula direto para a senha (conta existente) ou para "Crie sua senha" (cadastro) */
  function prepararGoogle(dados: { email: string; nome?: string; contaExiste: boolean }) {
    estado = dados.contaExiste
      ? { modo: "login", etapa: 2, email: dados.email, nome: "", google: true }
      : { modo: "register", etapa: 2, email: dados.email, nome: dados.nome || dados.email.split("@")[0], google: true };
  }

  /**
   * Cadastro feito, falta confirmar o e-mail (ou tentou entrar sem confirmar). "Reenviar link": carregando
   * enquanto envia, depois 60 s de espera. Quando o link é aberto neste navegador, a tela vira o login (app.ts).
   */
  function aguardandoEmail(root: HTMLElement, email: string, cfg: { onReenviar: () => Promise<unknown>; recuperacao?: boolean; onVoltar?: () => void }) {
    const titulo = h("h1", { class: C.titulo, tabindex: "-1" }, "Verifique seu e-mail");
    // Mesmo botão de ação das outras etapas (botao: 44 px, logo abaixo da área de campos)
    const reenviar = botao("Reenviar link");
    reenviar.type = "button";
    const falha = aviso(null);
    let espera = 0;
    const contar = () => {
      if (!reenviar.isConnected) return;              // saiu da tela: para de contar
      reenviar.disabled = espera > 0;
      reenviar.classList.remove("is-busy");
      reenviar.removeAttribute("aria-busy");
      reenviar.replaceChildren(h("span", { class: "btn__label" }, espera > 0 ? "Reenviar link (" + espera + " s)" : "Reenviar link"));
      if (espera > 0) { espera -= 1; setTimeout(contar, 1000); }
    };
    reenviar.addEventListener("click", () => {
      if (reenviar.disabled) return;
      reenviar.disabled = true; reenviar.classList.add("is-busy");
      reenviar.setAttribute("aria-busy", "true");
      reenviar.replaceChildren(h("span", { class: C.girandoBotao, "aria-hidden": "true" }), h("span", { class: "tw:sr-only" }, "Enviando…"));
      falha.textContent = "";
      Promise.resolve(cfg.onReenviar())
        .catch((e: Partial<ErroPonte>) => { falha.textContent = (e && e.friendly) || "Não foi possível reenviar agora. Tente de novo em instantes."; })
        .finally(() => { espera = 60; contar(); });
    });
    mount(root, cartao("frente", [
      logo(),
      titulo,
      h("div", { class: C.form },
        // o texto ocupa a área dos campos: o botão fica na mesma altura do "Continuar" das outras etapas
        h("div", { class: C.campos }, cfg.recuperacao
          // não revela se o e-mail tem conta
          ? h("p", { class: C.texto, role: "status" }, "Se houver uma conta com ", h("strong", { class: "tw:font-[620]" }, email),
            ", enviamos um link para criar uma senha nova. Ele vale por 1 hora.")
          : h("p", { class: C.texto, role: "status" }, "Enviamos um link de confirmação para ", h("strong", { class: "tw:font-[620]" }, email))),
        reenviar, falha,
        cfg.onVoltar ? rodape(null, "Voltar para tela de entrada", cfg.onVoltar) : null),
    ]));
    requestAnimationFrame(() => titulo.focus());      // leitor de tela anuncia a troca de tela
  }

  /** "Esqueci minha senha": e-mail da conta → link por e-mail */
  function pedirRecuperacao(root: HTMLElement, cfg: { email: string; onEnviar: (email: string) => Promise<unknown>; onVoltar: () => void }) {
    const email = campo({ type: "email", name: "email", id: "email", autocomplete: "username", inputmode: "email", placeholder: "Insira seu e-mail", rotulo: "E-mail", value: cfg.email || "" });
    const enviar = botao("Enviar link");
    const msg = aviso(null);
    const form = h("form", { class: C.form, method: "post", action: "#", novalidate: true, onSubmit: (e: SubmitEvent) => {
      e.preventDefault();
      if (!EMAIL_OK.test(email.value.trim())) { msg.textContent = "Insira um e-mail válido."; email.focus(); return; }
      enviar.disabled = true; enviar.classList.add("is-busy"); msg.textContent = "";
      Promise.resolve(cfg.onEnviar(email.value.trim())).catch((er: Partial<ErroPonte>) => {
        msg.textContent = (er && er.friendly) || "Não foi possível enviar agora. Tente de novo em instantes.";
        enviar.disabled = false; enviar.classList.remove("is-busy");
      });
    } },
      h("div", { class: C.campos }, h("p", { class: C.texto }, "Informe o e-mail da sua conta. Enviaremos um link para criar uma senha nova."), email),
      enviar, msg, rodape(null, "Voltar para tela de entrada", cfg.onVoltar));
    mount(root, cartao("frente", [logo(), h("h1", { class: C.titulo }, "Redefinir senha"), form]));
    requestAnimationFrame(() => email.focus());
  }

  /** Conta com 2FA: o código do aplicativo antes de criar a senha nova */
  function codigoRecuperacao(root: HTMLElement, cfg: { onCodigo: (codigo: string) => Promise<string | null>; onVoltar: () => void }) {
    mount(root, cartao("frente", [logo(), h("h1", { class: C.titulo }, "Autentique sua conta"),
      corpo2FA({ onCodigo: cfg.onCodigo, onCancelar2FA: cfg.onVoltar, voltar: "Voltar para tela de entrada" })]));
  }

  /**
   * Senha nova depois do link. manter = os dados voltam com a senha nova; senão (proteção avançada ou sem
   * cópia da chave) a tela avisa que a conta recomeça vazia e o botão diz isso.
   */
  function novaSenha(root: HTMLElement, cfg: { email: string; manter: boolean; erro?: string | null; onSalvar: (senha: string) => void; onVoltar: () => void }) {
    estado.email = cfg.email;                          // e-mail oculto do formulário (gerenciador de senhas)
    const senha = campoSenha("new-password");
    senha.input.setAttribute("minlength", "8");
    const enviar = botao(cfg.manter ? "Salvar senha nova" : "Recomeçar com senha nova");
    const msg = aviso(cfg.erro || null);
    const form = h("form", { class: C.form, method: "post", action: "#", novalidate: true, onSubmit: (e: SubmitEvent) => {
      e.preventDefault();
      if (senha.input.value.length < 8) { msg.textContent = "Use pelo menos 8 caracteres."; senha.input.focus(); return; }
      if (senha.input.type === "text") senha.wrap.querySelector<HTMLElement>(".input-reveal")?.click();
      enviar.disabled = true; enviar.classList.add("is-busy");
      cfg.onSalvar(senha.input.value);
    } },
      cfg.manter ? null : h("p", { class: C.atencao, role: "alert" },
        "Os dados desta conta não podem ser recuperados sem a senha antiga (proteção avançada). Ao continuar, a conta recomeça vazia."),
      h("div", { class: C.campos }, emailOculto(), senha.wrap),
      enviar, msg, rodape(null, "Voltar para tela de entrada", cfg.onVoltar));
    mount(root, cartao("frente", [logo(), h("h1", { class: C.titulo }, "Crie uma nova senha"), form]));
    requestAnimationFrame(() => senha.input.focus());
  }

  /** Link do e-mail vencido, já usado ou adulterado: só o aviso e, no pé do cartão, a volta para a entrada */
  function linkInvalido(root: HTMLElement, cfg: { onVoltar: () => void }) {
    const voltar = rodape(null, "Voltar para tela de entrada", cfg.onVoltar);
    mount(root, cartao("entrar", [
      logo(),
      h("h1", { class: "tw:sr-only" }, "Link inválido"),
      h("div", { class: C.form }, h("p", { class: C.texto, role: "alert" }, "O link que clicou expirou ou é inválido.")),
      h("div", { class: "tw:mt-auto tw:flex tw:justify-center tw:w-full" }, voltar),
    ]));
    requestAnimationFrame(() => { const b = voltar.querySelector("button"); if (b) b.focus(); });
  }

  ZoZo.auth = { render, reiniciar, prepararGoogle, prepararLogin, irPara, carregando, aguardandoEmail, linkInvalido, pedirRecuperacao, codigoRecuperacao, novaSenha, A };
})(window.ZoZo);
