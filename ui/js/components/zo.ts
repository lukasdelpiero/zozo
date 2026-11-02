/* =============================================================
   ZoZo — Zo, o assistente (botão flutuante + janela de conversa)
   ------------------------------------------------------------
   Botão no canto inferior direito (vidro, com o Z). Ao tocar, abre a janela no mesmo canto e o botão some.
   Na primeira conversa vem o aviso de consentimento: sem ele nada vai para o modelo (o servidor também recusa).
   Cada ida ao Zo leva a conversa recente; as ferramentas rodam aqui (data/zo.ts). Gravação só depois do
   Confirmar no cartão de resumo (montado com os dados reais). Texto sempre como texto (nada de HTML).
   A conversa fica só na memória desta aba: sai ao fechar a aba ou sair da conta.
   Visual pela "Documentação de chatbot" (seção 1): topo com avatar 32×32, menu ⋯ (Expandir janela, Pesquisar na
   conversa, Baixar conversa), balões #f5f5f5 / #efebfc com "Nome • tempo" embaixo e a caixa de mensagem com
   anexo, emojis (o mesmo emoji-mart do ZoZo) e enviar.
   TypeScript: tipos em src/globais.d.ts (ZoZoZo).
   ============================================================= */
(function (ZoZo: ZoZoGlobal) {
  "use strict";
  const { h, s, mount } = ZoZo.dom;
  const { icon } = ZoZo.icons;
  const A = ZoZo.messages.ACTIONS;
  const FR = ZoZo.messages.FRIENDLY;
  const MAX_RODADAS = 6;                          // idas seguidas ao Zo num mesmo pedido (ferramentas encadeadas)
  const MAX_ENVIADAS = 30;                         // mensagens recentes enviadas a cada ida

  const Z = {
    // botão: vidro (translúcido com desfoque), redondo, acima do conteúdo e abaixo das janelas
    fab: "tw:fixed tw:right-6 tw:bottom-6 tw:z-40 tw:grid tw:place-items-center tw:size-14 tw:rounded-full tw:cursor-pointer "
      + "tw:bg-white/55 tw:backdrop-blur-xl tw:[border:1px_solid_rgba(255,255,255,0.7)] "
      + "tw:[box-shadow:0_8px_24px_rgba(22,33,58,0.18),inset_0_1px_0_rgba(255,255,255,0.8)] "
      + "tw:[transition:transform_160ms_var(--easing),box-shadow_160ms] tw:hover:scale-105 tw:motion-reduce:transition-none tw:celular:right-4 tw:celular:bottom-4",
    fabComTeste: "tw:bottom-16! tw:celular:bottom-14!",                // acima do botão "Modo teste" (local e prévia)
    janela: "tw:fixed tw:right-6 tw:bottom-6 tw:z-50 tw:flex tw:flex-col tw:w-[380px] tw:h-[min(640px,calc(100dvh-48px))] tw:rounded-2xl "
      + "tw:bg-white tw:[border:1px_solid_var(--color-border)] tw:[box-shadow:0_16px_48px_rgba(22,33,58,0.22)] tw:overflow-hidden "
      + "tw:celular:inset-x-2 tw:celular:bottom-2 tw:celular:w-auto tw:celular:h-[min(640px,calc(100dvh-16px))]",
    // modo teste (local e prévia): a janela fica acima do botão "Modo teste", que cobria o enviar
    janelaComTeste: "tw:bottom-16! tw:h-[min(640px,calc(100dvh-88px))]! tw:celular:bottom-14! tw:celular:h-[min(640px,calc(100dvh-64px))]!",
    // Expandir janela: até 375 px a tela toda; até 800 px, 20 px de folga em volta; acima, 678 px de largura
    janelaExpandida: "tw:right-5! tw:bottom-5! tw:left-auto! tw:w-[calc(100vw-40px)]! tw:h-[calc(100dvh-40px)]! tw:rounded-3xl! tw:min-[801px]:w-[678px]! "
      + "tw:max-[375px]:inset-0! tw:max-[375px]:w-full! tw:max-[375px]:h-full! tw:max-[375px]:rounded-none!",
    topo: "tw:flex tw:items-center tw:gap-2 tw:px-4 tw:h-16 tw:flex-none tw:[border-bottom:1px_solid_rgba(9,14,21,0.06)]",
    avatar: "tw:grid tw:place-items-center tw:size-8 tw:flex-none tw:rounded-full tw:bg-white tw:[box-shadow:0_1px_4px_rgba(22,33,58,0.16)]",
    nome: "tw:m-0 tw:text-[15px] tw:font-[650] tw:text-[rgb(20,22,26)] tw:leading-tight",
    status: "tw:m-0 tw:text-[13px] tw:text-[rgb(108,111,116)] tw:leading-tight",
    acoesTopo: "tw:ml-auto tw:flex tw:items-center tw:gap-4",
    botaoTopo: "tw:grid tw:place-items-center tw:p-2.5 tw:rounded-[10px] tw:[border:0] tw:bg-transparent tw:text-[rgb(108,111,116)] tw:cursor-pointer "
      + "tw:hover:bg-[rgba(9,14,21,0.1)]",
    // menu ⋯: padding 8 px; itens em pílula, 36 px, 14 px, fundo #ededed ao passar o mouse, 4 px entre eles
    menu: "tw:p-2!",
    menuItem: "tw:flex tw:items-center tw:gap-2 tw:w-full tw:min-h-9 tw:px-3 tw:py-2 tw:rounded-full tw:[border:0] tw:bg-transparent tw:text-left "
      + "tw:text-[14px] tw:font-normal tw:text-[rgb(20,22,26)] tw:cursor-pointer tw:not-first:mt-1 tw:hover:bg-[#ededed] tw:focus-visible:bg-[#ededed]",
    // Pesquisar na conversa: a barra entre o topo e a conversa
    busca: "tw:flex tw:items-center tw:flex-none tw:py-[9px] tw:px-3.5 tw:[border-bottom:1px_solid_rgba(9,14,21,0.06)]",
    buscaCampo: "tw:flex tw:items-center tw:flex-1 tw:min-w-0 tw:max-w-[553px] tw:h-10 tw:ml-2 tw:px-3 tw:rounded-xl tw:bg-[rgba(9,14,21,0.07)] "
      + "tw:[border:1px_solid_rgba(9,14,21,0.06)] tw:text-[14px] tw:font-normal tw:text-[rgba(9,14,21,0.6)] tw:cursor-text",
    buscaInput: "tw:flex-1 tw:min-w-0 tw:h-full tw:ml-2 tw:p-0 tw:[border:0] tw:bg-transparent tw:outline-none tw:text-[14px] tw:font-normal "
      + "tw:text-[rgb(20,22,26)] tw:placeholder:text-[rgb(20,22,26)]",
    buscaContador: "tw:ml-2 tw:min-w-5 tw:text-[14px] tw:font-normal tw:text-[rgba(9,14,21,0.6)] tw:whitespace-nowrap tw:tabular-nums",
    buscaBotoes: "tw:flex tw:items-center tw:ml-2",
    buscaBotao: "tw:grid tw:place-items-center tw:size-8 tw:flex-none tw:rounded-full tw:[border:0] tw:bg-transparent tw:text-[rgba(20,22,26,0.5)] tw:cursor-pointer "
      + "tw:hover:bg-[rgb(238,238,238)] tw:disabled:text-[rgba(20,22,26,0.25)] tw:disabled:cursor-default tw:disabled:hover:bg-transparent",
    achado: "tw:bg-[#fde68a] tw:text-inherit tw:rounded-[3px]",
    achadoAtual: "tw:bg-[#f59e0b] tw:text-inherit tw:rounded-[3px]",
    // pb-8: a caixa de mensagem sobe 20 px por cima da conversa (margin-top -20 px)
    log: "tw:flex-1 tw:min-h-0 tw:overflow-y-auto tw:flex tw:flex-col tw:gap-5 tw:px-4 tw:pt-4 tw:pb-8",
    falaBot: "tw:self-start tw:max-w-[88%] tw:flex tw:flex-col tw:items-start tw:gap-1",
    falaEu: "tw:self-end tw:max-w-[88%] tw:flex tw:flex-col tw:items-end tw:gap-1",
    bot: "tw:m-0 tw:px-4 tw:py-3 tw:rounded-[20px] tw:bg-[#f5f5f5] tw:text-[14px] tw:font-normal tw:leading-normal tw:text-[rgb(20,22,26)] "
      + "tw:whitespace-pre-wrap tw:[overflow-wrap:anywhere] tw:[&>p]:mt-0 tw:[&>p]:mx-0 tw:[&>p]:mb-2.5 tw:[&>p:last-child]:mb-0",
    eu: "tw:m-0 tw:px-4 tw:py-3 tw:rounded-[20px] tw:bg-[#efebfc] tw:text-[14px] tw:font-normal tw:leading-normal tw:text-[rgb(20,22,26)] "
      + "tw:whitespace-pre-wrap tw:[overflow-wrap:anywhere] tw:[&>p]:mt-0 tw:[&>p]:mx-0 tw:[&>p]:mb-2.5 tw:[&>p:last-child]:mb-0",
    quem: "tw:m-0 tw:text-[12px] tw:text-[rgb(108,111,116)]",
    cartao: "tw:self-stretch tw:flex tw:flex-col tw:gap-2 tw:p-3.5 tw:rounded-xl tw:[border:1px_solid_var(--color-border)] tw:bg-zz-surface",
    cartaoTitulo: "tw:m-0 tw:text-[14px] tw:font-[650] tw:text-zz-text",
    linhas: "tw:m-0 tw:grid tw:grid-cols-[auto_minmax(0,1fr)] tw:gap-x-3 tw:gap-y-1 tw:text-[14px]",
    rotulo: "tw:text-zz-secondary",
    valor: "tw:m-0 tw:text-zz-text tw:font-[550] tw:[overflow-wrap:anywhere]",
    botoes: "tw:flex tw:flex-wrap tw:gap-2 tw:pt-1",
    opcao: "tw:inline-flex tw:items-center tw:min-h-8 tw:px-3 tw:rounded-full tw:[border:1px_solid_var(--color-border)] tw:bg-zz-surface "
      + "tw:text-[14px] tw:font-[550] tw:text-zz-primary tw:cursor-pointer tw:hover:bg-zz-primary-softer tw:disabled:opacity-50 tw:disabled:cursor-default",
    nota: "tw:self-center tw:text-[13px] tw:text-zz-secondary",
    digitando: "tw:self-start tw:flex tw:gap-1 tw:px-4 tw:py-3.5 tw:rounded-[20px] tw:bg-[#f5f5f5]",
    ponto: "tw:size-1.5 tw:rounded-full tw:bg-zz-secondary tw:animate-pulse tw:motion-reduce:animate-none",
    // parte de baixo: sobe 20 px por cima da conversa, acima dela (z 3)
    rodape: "tw:relative tw:z-3 tw:flex tw:flex-col tw:gap-2 tw:flex-none tw:-mt-5 tw:px-3 tw:pb-2",
    caixa: "tw:flex tw:flex-col tw:min-h-20 tw:pb-2 tw:rounded-2xl tw:[border:1px_solid_rgb(237,237,237)] tw:bg-white tw:outline-0 "
      + "tw:focus-within:[border-color:rgb(105,72,216)]",
    campo: "tw:block tw:w-full tw:min-h-[21px] tw:max-h-[142px] tw:mt-3 tw:mx-0 tw:mb-0 tw:pt-0 tw:px-4 tw:pb-0.5 tw:resize-none tw:[border:0] tw:bg-transparent "
      + "tw:text-[14px] tw:font-normal tw:leading-[21px] tw:text-[rgb(20,22,26)] tw:placeholder:text-[rgb(20,22,26)] tw:outline-none tw:box-border",
    barra: "tw:flex tw:items-center tw:gap-2 tw:min-h-8 tw:pt-1 tw:pr-2 tw:pb-0 tw:pl-3",
    botaoMini: "tw:grid tw:place-items-center tw:p-1 tw:rounded-md tw:[border:0] tw:bg-transparent tw:text-[rgb(108,111,116)] tw:cursor-pointer "
      + "tw:hover:text-[rgb(108,111,116)] tw:disabled:opacity-50 tw:disabled:cursor-default",
    enviar: "tw:ml-auto tw:grid tw:place-items-center tw:size-8 tw:flex-none tw:rounded-full tw:[border:0] tw:bg-(image:--botao-roxo) tw:text-white tw:cursor-pointer "
      + "tw:disabled:bg-none tw:disabled:bg-[#e6e6e7] tw:disabled:text-[#dadada] tw:disabled:cursor-default",
  };

  /** O Z do ZoZo (roxo, traço arredondado), desenhado aqui: nenhum arquivo externo */
  function logoZ(tamanho: number): SVGElement {
    const id = ZoZo.dom.id("zo-z");
    return s("svg", { width: tamanho, height: tamanho, viewBox: "0 0 1024 1024", "aria-hidden": "true", focusable: "false" },
      s("defs", null, s("linearGradient", { id, x1: 0, y1: 0, x2: 1, y2: 1 }, s("stop", { "stop-color": "#7141DE" }), s("stop", { offset: 1, "stop-color": "#602BD9" }))),
      s("path", { d: "M 320 320 H 704 L 320 704 H 704", fill: "none", stroke: "url(#" + id + ")", "stroke-width": 160, "stroke-linecap": "round", "stroke-linejoin": "round" }));
  }

  // Aviso do Zo com o Cloudflare Workers AI (retenção zero). Mudou o texto? Suba zo.CONSENTIMENTO_VERSAO no servidor.
  const CONSENTIMENTO = "Antes de começar, preciso do seu consentimento. Para ajudar você, o Zo lê e, quando você confirma, altera os seus dados no ZoZo. "
    + "A cada pergunta, a sua mensagem e só os trechos dos dados necessários são enviados ao Workers AI, da Cloudflare, o serviço que roda a inteligência artificial do Zo, para gerar a resposta. "
    + "Antes do envio, o ZoZo esconde CPF, CNPJ, número de cartão, telefone e e-mail. "
    + "A Cloudflare não usa esse conteúdo para treinar inteligência artificial e não guarda os pedidos depois de responder. "
    + "O ZoZo não vende nem usa os seus dados fora desta finalidade, e você pode retirar o consentimento quando quiser no menu do Zo.";
  const SEM_CONSENTIMENTO = "Tudo bem. Sem o seu consentimento eu não consigo continuar. Se mudar de ideia, é só tocar em Rever o aviso.";
  const BOAS_VINDAS = "Oi, eu sou o Zo. Posso criar, consultar e editar transações, contas, categorias, recorrências e perfis, importar o arquivo do seu banco, fazer resumos e tirar dúvidas sobre o ZoZo. Como posso ajudar?";
  const MAX_ARQUIVO = 2 * 1024 * 1024;              // 2 MB: um extrato ou fatura cabe com folga
  const MAX_IMPORTAR = 500;                         // linhas por importação (o serviço confere o mesmo limite)

  let ctx: ContextoApp | null = null;
  let fab: HTMLButtonElement | null = null;
  let janela: HTMLElement | null = null;
  let historico: MensagemZo[] = [];
  let ocupado = false;
  let aceito: boolean | null = null;            // null = ainda não perguntado ao servidor nesta sessão
  let cancelarPendente: (() => void) | null = null;   // cartão de confirmação ou opções esperando a pessoa
  let geracao = 0;                              // nova conversa / saída: respostas atrasadas são descartadas
  // Lixeira temporal: o que o Zo gravou nesta conversa e ainda pode ser desfeito (as cópias ficam no serviço, nesta aba)
  let lixeira: Array<{ marco: string; titulo: string }> = [];
  // Falas mostradas (reabrir a janela, pesquisar e baixar a conversa): só na memória desta aba, como o histórico
  type Fala = { de: "bot" | "eu"; texto: string; quando: number };
  let falas: Fala[] = [];
  let conversaId = novoId();
  let expandida = false;
  /** 16 algarismos aleatórios: o "id" do arquivo baixado (a conversa não é guardada em lugar nenhum) */
  function novoId(): string { return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b % 10).join(""); }
  // LGPD: sem uso por 15 minutos, a conversa e a lixeira somem (a memória de curto prazo não fica guardada)
  const INATIVIDADE_MS = 15 * 60 * 1000;
  let inatividade: ReturnType<typeof setTimeout> | null = null;

  function permitido(): boolean {
    const st = ZoZo.store.get();
    return !!st.session.authenticated && !ZoZo.recursos.demo();
  }

  /* ---------------- montagem ---------------- */
  function montar(c: ContextoApp) {
    ctx = c;
    ZoZo.store.subscribe(sincronizar);
    sincronizar();
  }
  function sincronizar() {
    const pode = permitido();
    if (!pode) { encerrar(); return; }
    if (!fab && !janela) mostrarFab();
  }
  function raiz(): HTMLElement { return document.getElementById("shell") || document.body; }
  function mostrarFab() {
    if (fab) return;
    fab = h("button", { type: "button", class: [Z.fab, ZoZo.testeHost && Z.fabComTeste], "aria-label": "Abrir o Zo, assistente do ZoZo", title: "Zo, assistente",
      onClick: abrir }, logoZ(30)) as HTMLButtonElement;
    raiz().appendChild(fab);
  }
  /** Saiu da conta (ou virou demo): tudo some, inclusive a conversa */
  function encerrar() {
    geracao += 1;
    if (cancelarPendente) cancelarPendente();
    if (fab) { fab.remove(); fab = null; }
    if (janela) { janela.remove(); janela = null; }
    pararRelogio(); buscaEl = null;
    historico = []; falas = []; conversaId = novoId(); aceito = null; ocupado = false;
    esvaziarLixeira();
    if (inatividade) { clearTimeout(inatividade); inatividade = null; }
  }
  function esvaziarLixeira() {
    if (lixeira.length && ctx) ctx.bridge.request(A.descartarMarcos).catch(() => null);
    lixeira = [];
  }
  /** Cada uso do Zo reinicia a contagem de inatividade */
  function tocar() {
    if (inatividade) clearTimeout(inatividade);
    inatividade = setTimeout(expirar, INATIVIDADE_MS);
  }
  function expirar() {
    inatividade = null;
    if (!historico.length && !lixeira.length) return;
    geracao += 1;
    if (cancelarPendente) cancelarPendente();
    historico = []; falas = []; conversaId = novoId(); ocupado = false;
    esvaziarLixeira();
    if (janela) {
      digitando(false);
      mount(logEl);
      nota("A conversa foi apagada depois de 15 minutos sem uso, para proteger os seus dados.");
      if (aceito) bolha(BOAS_VINDAS, "bot");
      atualizarEnvio();
    }
  }

  /* ---------------- janela ---------------- */
  let logEl: HTMLElement, campo: HTMLTextAreaElement, enviarBtn: HTMLButtonElement, anexarBtn: HTMLButtonElement, emojiBtn: HTMLButtonElement, arquivoEl: HTMLInputElement;
  let relogio: ReturnType<typeof setInterval> | null = null;
  function abrir() {
    if (!permitido() || janela) return;
    if (fab) { fab.remove(); fab = null; }
    logEl = h("div", { class: Z.log, role: "log", "aria-live": "polite", "aria-label": "Conversa com o Zo", tabindex: "0" });
    campo = h("textarea", { class: Z.campo, rows: "1", maxlength: "2000", placeholder: "Escreva uma mensagem...", "aria-label": "Mensagem para o Zo" }) as HTMLTextAreaElement;
    enviarBtn = h("button", { type: "button", class: Z.enviar, "aria-label": "Enviar", onClick: enviar }, icon("enviar", { size: 16, stroke: 2.25 })) as HTMLButtonElement;
    // anexar o arquivo do banco (CSV ou OFX): lido aqui, nunca enviado ao Zo
    arquivoEl = h("input", { type: "file", accept: ".csv,.ofx,.txt,text/csv,application/x-ofx", class: "tw:sr-only", tabindex: "-1", "aria-hidden": "true" }) as HTMLInputElement;
    arquivoEl.addEventListener("change", () => { const f = arquivoEl.files && arquivoEl.files[0]; arquivoEl.value = ""; if (f) void importarArquivo(f); });
    anexarBtn = h("button", { type: "button", class: Z.botaoMini, "aria-label": "Anexar arquivo do banco (CSV ou OFX)", title: "Anexar arquivo",
      onClick: () => arquivoEl.click() }, icon("clipe", { size: 16 })) as HTMLButtonElement;
    // o mesmo seletor de emojis do ZoZo (emoji-mart, ui/src/emoji-picker.ts)
    emojiBtn = h("button", { type: "button", class: Z.botaoMini, "aria-label": "Emojis", title: "Emojis", "aria-haspopup": "dialog" }, icon("sorriso", { size: 16 })) as HTMLButtonElement;
    emojiBtn.addEventListener("click", () => ZoZo.emojiPicker.abrir(emojiBtn, { posicao: "acima", aoEscolher: inserirEmoji }));
    campo.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(); } });
    campo.addEventListener("input", () => { campo.style.height = "auto"; campo.style.height = Math.min(campo.scrollHeight, 142) + "px"; atualizarEnvio(); });
    const menuBtn = h("button", { type: "button", class: Z.botaoTopo, "aria-label": "Opções do Zo", "aria-haspopup": "menu" }, icon("opcoes", { size: 16 })) as HTMLButtonElement;
    menuBtn.addEventListener("click", () => ZoZo.menu.abrir(menuBtn, itensMenu, { posicao: "esquerda", label: "Opções do Zo", class: Z.menu }));
    janela = h("section", { class: [Z.janela, expandida && podeExpandir() ? Z.janelaExpandida : ZoZo.testeHost && Z.janelaComTeste], role: "dialog", "aria-modal": "false", "aria-label": "Zo, assistente do ZoZo" },
      h("header", { class: Z.topo },
        h("span", { class: Z.avatar }, logoZ(20)),
        h("div", null, h("p", { class: Z.nome }, "Zo"), h("p", { class: Z.status }, "Assistente virtual")),
        h("div", { class: Z.acoesTopo }, menuBtn,
          h("button", { type: "button", class: Z.botaoTopo, "aria-label": "Fechar o Zo", onClick: fechar }, icon("fechar", { size: 16 })))),
      logEl,
      h("footer", { class: Z.rodape }, h("div", { class: Z.caixa }, campo, h("div", { class: Z.barra }, anexarBtn, emojiBtn, enviarBtn)), arquivoEl));
    janela.addEventListener("keydown", (e) => { if (e.key === "Escape" && !document.querySelector(".menu, .emoji-pop.is-aberto")) { e.preventDefault(); fechar(); } });
    raiz().appendChild(janela);
    relogio = setInterval(atualizarTempos, 1000);
    requestAnimationFrame(() => campo.focus());
    if (historico.length) redesenhar(); else { falas = []; iniciar(); }
  }
  function pararRelogio() { if (relogio) { clearInterval(relogio); relogio = null; } }

  /* ---------------- menu ⋯ ---------------- */
  // Expandir não existe no celular pequeno (até 375 px a janela já ocupa a tela)
  const podeExpandir = () => innerWidth > 375;
  function itensMenu(): ItemMenu[] {
    const item = (rotulo: string, nome: string, acao: () => void): ItemMenu => ({
      render: (api) => h("button", { type: "button", role: "menuitem", class: Z.menuItem, onClick: () => { api.fechar(); acao(); } },
        icon(nome, { size: 16 }), h("span", null, rotulo)),
    });
    const itens: ItemMenu[] = [];
    if (podeExpandir()) itens.push(expandida ? item("Minimizar janela", "recolher", alternarTamanho) : item("Expandir janela", "expandir", alternarTamanho));
    itens.push(item("Pesquisar na conversa", "pesquisar", abrirBusca), item("Baixar conversa", "baixar", baixarConversa),
      item("Nova conversa", "mais", novaConversa), item("Lixeira temporal", "desfazer", mostrarLixeira),
      item("Retirar consentimento", "sair", retirarConsentimento));
    return itens;
  }
  function alternarTamanho() {
    if (!janela) return;
    expandida = !expandida;
    const el = janela;
    Z.janelaExpandida.split(" ").forEach((c) => el.classList.toggle(c, expandida));
    if (ZoZo.testeHost) Z.janelaComTeste.split(" ").forEach((c) => el.classList.toggle(c, !expandida));
    rolar();
  }

  /* ---------------- pesquisar na conversa ---------------- */
  let buscaEl: HTMLElement | null = null, buscaInput: HTMLInputElement, contadorEl: HTMLElement, sobeBtn: HTMLButtonElement, desceBtn: HTMLButtonElement;
  let achados: HTMLElement[] = [], atual = -1;
  function abrirBusca() {
    if (!janela) return;
    if (buscaEl) { buscaInput.focus(); return; }
    buscaInput = h("input", { type: "text", class: Z.buscaInput, placeholder: "Pesquisar", "aria-label": "Pesquisar na conversa", enterkeyhint: "search" }) as HTMLInputElement;
    contadorEl = h("span", { class: Z.buscaContador, "aria-live": "polite" }, "0/0");
    sobeBtn = h("button", { type: "button", class: Z.buscaBotao, "aria-label": "Resultado anterior", onClick: () => pular(-1) }, icon("chevron-up", { size: 18 })) as HTMLButtonElement;
    desceBtn = h("button", { type: "button", class: Z.buscaBotao, "aria-label": "Próximo resultado", onClick: () => pular(1) }, icon("chevron-down", { size: 18 })) as HTMLButtonElement;
    buscaInput.addEventListener("input", buscar);
    // setas (e Enter / Shift + Enter) pulam entre os resultados, dando a volta; Esc fecha só a pesquisa
    buscaInput.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown" || (e.key === "Enter" && !e.shiftKey)) { e.preventDefault(); pular(1); }
      else if (e.key === "ArrowUp" || (e.key === "Enter" && e.shiftKey)) { e.preventDefault(); pular(-1); }
      else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); fecharBusca(); }
    });
    buscaEl = h("div", { class: Z.busca, role: "search" },
      h("label", { class: Z.buscaCampo }, icon("pesquisar", { size: 16 }), buscaInput, contadorEl),
      h("div", { class: Z.buscaBotoes }, sobeBtn, desceBtn,
        h("button", { type: "button", class: Z.buscaBotao, "aria-label": "Fechar a pesquisa", onClick: fecharBusca }, icon("fechar", { size: 18 }))));
    janela.insertBefore(buscaEl, logEl);
    buscar();
    buscaInput.focus();
  }
  function fecharBusca() {
    limparMarcas();
    if (buscaEl) { buscaEl.remove(); buscaEl = null; }
    if (janela) campo.focus();
  }
  function buscar() {
    limparMarcas();
    const termo = buscaInput.value.trim().toLowerCase();
    if (termo) logEl.querySelectorAll<HTMLElement>("[data-busca]").forEach((el) => marcar(el, termo));
    atual = achados.length ? 0 : -1;
    mostrarAtual();
  }
  /** Cada ocorrência vira um <mark> (texto continua texto: só nós de texto são divididos) */
  function marcar(raizEl: HTMLElement, termo: string) {
    const nos: Text[] = [];
    const w = document.createTreeWalker(raizEl, NodeFilter.SHOW_TEXT);
    while (w.nextNode()) nos.push(w.currentNode as Text);
    nos.forEach((no) => {
      const texto = no.data, baixo = texto.toLowerCase();
      let i = baixo.indexOf(termo), ini = 0;
      if (i < 0) return;
      const pedacos: Node[] = [];
      while (i >= 0) {
        if (i > ini) pedacos.push(document.createTextNode(texto.slice(ini, i)));
        const m = h("mark", { class: Z.achado }, texto.slice(i, i + termo.length));
        achados.push(m); pedacos.push(m);
        ini = i + termo.length;
        i = baixo.indexOf(termo, ini);
      }
      if (ini < texto.length) pedacos.push(document.createTextNode(texto.slice(ini)));
      no.replaceWith(...pedacos);
    });
  }
  function limparMarcas() {
    if (logEl) logEl.querySelectorAll("mark").forEach((m) => { const pai = m.parentNode; m.replaceWith(document.createTextNode(m.textContent || "")); if (pai) pai.normalize(); });
    achados = []; atual = -1;
  }
  function mostrarAtual() {
    if (!buscaEl) return;
    achados.forEach((m, i) => { m.className = i === atual ? Z.achadoAtual : Z.achado; });
    contadorEl.textContent = (achados.length ? atual + 1 : 0) + "/" + achados.length;
    sobeBtn.disabled = desceBtn.disabled = achados.length < 2;
    if (atual >= 0) achados[atual].scrollIntoView({ block: "center" });
  }
  /** 1/10 → seta para baixo 2/10, para cima 10/10 (dá a volta) */
  function pular(passo: number) {
    if (!achados.length) return;
    atual = (atual + passo + achados.length) % achados.length;
    mostrarAtual();
  }

  /* ---------------- baixar a conversa (.txt) ---------------- */
  const dois = (n: number) => String(n).padStart(2, "0");
  function baixarConversa() {
    if (!falas.length) { nota("A conversa ainda está vazia."); return; }
    const dia = new Date(falas[0].quando);
    const linhas = falas.map((f) => {
      const q = new Date(f.quando);
      return "[" + dois(q.getDate()) + "/" + dois(q.getMonth() + 1) + "/" + q.getFullYear() + " " + dois(q.getHours()) + ":" + dois(q.getMinutes()) + "] "
        + quem(f.de) + ": " + f.texto;
    });
    const texto = ["Conversa com o Zo, assistente virtual do ZoZo", ""].concat(linhas).join("\r\n") + "\r\n";
    // zozo-d-m-aaaa-id.txt (ex.: zozo-9-10-2026-2154766083288118.txt): o dia em que a conversa começou
    const nome = "zozo-" + dia.getDate() + "-" + (dia.getMonth() + 1) + "-" + dia.getFullYear() + "-" + conversaId + ".txt";
    const url = URL.createObjectURL(new Blob([texto], { type: "text/plain;charset=utf-8" }));
    const a = h("a", { href: url, download: nome, rel: "noopener" });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function inserirEmoji(emoji: string) {
    if (!janela || campo.disabled) return;
    const ini = campo.selectionStart ?? campo.value.length, fim = campo.selectionEnd ?? ini;
    campo.setRangeText(emoji, ini, fim, "end");
    campo.dispatchEvent(new Event("input"));
    campo.focus();
  }
  function fechar() {
    if (!janela) return;
    // cartão de confirmação ou opções abertos: fechar CANCELA (nada é gravado); antes a rodada ficava esperando
    // uma resposta que não tinha mais onde ser dada e a conversa travava
    if (cancelarPendente) cancelarPendente();
    janela.remove(); janela = null;
    pararRelogio(); buscaEl = null; achados = [];
    mostrarFab();
    if (fab) fab.focus();
  }
  function atualizarEnvio() {
    const bloqueado = ocupado || aceito !== true;
    campo.disabled = aceito !== true;
    anexarBtn.disabled = aceito !== true;
    emojiBtn.disabled = aceito !== true;
    enviarBtn.disabled = bloqueado || !campo.value.trim();
  }

  /* ---------------- mensagens na tela ---------------- */
  const rolar = () => requestAnimationFrame(() => { logEl.scrollTop = logEl.scrollHeight; });
  function bolha(texto: string, de: "bot" | "eu") { const f: Fala = { de, texto, quando: Date.now() }; falas.push(f); desenharFala(f); }
  /** Balão (um <p> por parágrafo) e, embaixo, "Nome • tempo" (o tempo é só visual: não é relido a cada segundo) */
  function desenharFala(f: Fala) {
    logEl.appendChild(h("div", { class: f.de === "bot" ? Z.falaBot : Z.falaEu },
      h("div", { class: f.de === "bot" ? Z.bot : Z.eu, "data-busca": "" }, f.texto.split(/\n{2,}/).map((p) => h("p", null, p))),
      h("p", { class: Z.quem }, quem(f.de) + " • ", h("span", { "aria-hidden": "true", "data-quando": String(f.quando) }, tempo(f.quando)))));
    rolar();
  }
  function quem(de: "bot" | "eu"): string {
    if (de === "bot") return "Zo";
    const nome = ((ZoZo.store.get().session.user || {}).nomeUsuario || "").trim().split(/\s+/)[0];
    return nome ? nome.charAt(0).toLocaleUpperCase("pt-BR") + nome.slice(1) : "Você";
  }
  /** "30s", "1m", "1h": segundos de 1 a 60; minutos e horas sempre inteiros (1h59 = 1h) */
  function tempo(quando: number): string {
    const seg = Math.floor((Date.now() - quando) / 1000);
    if (seg <= 60) return Math.max(1, seg) + "s";
    const min = Math.floor(seg / 60);
    return min < 60 ? min + "m" : Math.floor(min / 60) + "h";
  }
  function atualizarTempos() {
    if (logEl) logEl.querySelectorAll<HTMLElement>("[data-quando]").forEach((el) => { el.textContent = tempo(Number(el.dataset.quando)); });
  }
  function nota(texto: string) { logEl.appendChild(h("p", { class: [Z.nota, "tw:m-0"] }, texto)); rolar(); }
  /** Só as falas (para reabrir a janela com a conversa); cartões e notas já resolvidos não voltam */
  function redesenhar() {
    mount(logEl);
    falas.forEach(desenharFala);
    atualizarEnvio();
  }
  let digitandoEl: HTMLElement | null = null;
  function digitando(sim: boolean) {
    if (digitandoEl) { digitandoEl.remove(); digitandoEl = null; }
    if (sim && janela) {
      digitandoEl = h("div", { class: Z.digitando, role: "status", "aria-label": "O Zo está escrevendo" },
        h("span", { class: Z.ponto }), h("span", { class: [Z.ponto, "tw:[animation-delay:150ms]"] }), h("span", { class: [Z.ponto, "tw:[animation-delay:300ms]"] }));
      logEl.appendChild(digitandoEl); rolar();
    }
  }

  /* ---------------- consentimento ---------------- */
  function iniciar() {
    if (!ctx) return;
    const minha = geracao;
    ocupado = true; atualizarEnvio();
    ctx.bridge.request(A.zoConsentimento).then((r) => {
      if (minha !== geracao) return;
      aceito = r.aceito;
      ocupado = false;
      if (aceito) { bolha(BOAS_VINDAS, "bot"); atualizarEnvio(); requestAnimationFrame(() => campo.focus()); }
      else pedirConsentimento();
    }).catch((e: ErroPonte) => { if (minha === geracao) { ocupado = false; nota(e.friendly || FR.ZO_FAILED); atualizarEnvio(); } });
  }
  function pedirConsentimento() {
    if (!ctx) return;
    const c = ctx;
    const politica = h("a", { href: "/politica-privacidade#zo", target: "_blank", rel: "noopener", class: "tw:text-zz-primary tw:font-[550]" }, "Política de privacidade");
    const sim = h("button", { type: "button", class: Z.opcao }, "Concordo") as HTMLButtonElement;
    const nao = h("button", { type: "button", class: Z.opcao }, "Não concordo") as HTMLButtonElement;
    const cartao = h("div", { class: Z.cartao, role: "group", "aria-label": "Aviso de uso dos dados" },
      h("p", { class: Z.cartaoTitulo }, "Uso dos seus dados"),
      h("p", { class: "tw:m-0 tw:text-[14px] tw:leading-normal tw:text-zz-text" }, CONSENTIMENTO, " Saiba mais na ", politica, "."),
      h("div", { class: Z.botoes }, sim, nao));
    logEl.appendChild(cartao); rolar();
    requestAnimationFrame(() => sim.focus());
    const decidir = (ok: boolean) => {
      sim.disabled = true; nao.disabled = true;
      if (!ok) {
        aceito = false;
        bolha(SEM_CONSENTIMENTO, "bot");
        const rever = h("button", { type: "button", class: Z.opcao, onClick: () => { rever.remove(); pedirConsentimento(); } }, "Rever o aviso");
        logEl.appendChild(h("div", { class: Z.botoes }, rever)); rolar();
        atualizarEnvio();
        return;
      }
      c.bridge.request(A.zoConsentimento, { aceito: true }).then((r) => {
        aceito = r.aceito;
        bolha(BOAS_VINDAS, "bot");
        atualizarEnvio(); campo.focus();
      }).catch((e: ErroPonte) => { sim.disabled = false; nao.disabled = false; nota(e.friendly || FR.OPERATION_FAILED); });
    };
    sim.addEventListener("click", () => decidir(true));
    nao.addEventListener("click", () => decidir(false));
  }
  function retirarConsentimento() {
    if (!ctx) return;
    ctx.bridge.request(A.zoConsentimento, { aceito: false }).then(() => {
      geracao += 1;
      if (cancelarPendente) cancelarPendente();
      historico = []; falas = []; conversaId = novoId(); aceito = false; ocupado = false;
      esvaziarLixeira();
      if (janela) { mount(logEl); bolha("Consentimento retirado. A conversa foi apagada desta tela.", "bot"); pedirConsentimento(); atualizarEnvio(); }
    }).catch((e: ErroPonte) => nota(e.friendly || FR.OPERATION_FAILED));
  }
  function novaConversa() {
    geracao += 1;
    if (cancelarPendente) cancelarPendente();
    historico = []; falas = []; conversaId = novoId(); ocupado = false;
    esvaziarLixeira();
    digitando(false);
    mount(logEl);
    if (aceito) bolha(BOAS_VINDAS, "bot"); else iniciar();
    atualizarEnvio();
  }

  /* ---------------- conversa ---------------- */
  function enviar() {
    const texto = campo.value.trim();
    if (!texto || ocupado || aceito !== true) return;
    campo.value = ""; campo.style.height = "auto";
    if (cancelarPendente) cancelarPendente();             // escreveu em vez de responder ao cartão: cancela
    falar(texto);
  }
  function falar(texto: string) {
    tocar();
    historico.push({ papel: "usuario", texto: texto.slice(0, 2000) });
    bolha(texto, "eu");
    void turno();
  }
  /** As mensagens recentes, começando numa fala da pessoa (nunca um resultado sem a chamada) */
  function recentes(): MensagemZo[] {
    let i = Math.max(0, historico.length - MAX_ENVIADAS);
    while (i > 0 && historico[i].papel !== "usuario") i -= 1;
    return historico.slice(i);
  }
  async function turno() {
    if (!ctx) return;
    const c = ctx, minha = geracao;
    const ferramentas = ZoZo.zoFerramentas.criar((acao, dados) => c.bridge.request(acao, dados), {
      perfis: () => ZoZo.recursos.perfis(), fatura: () => ZoZo.recursos.boleto() && ZoZo.recursos.perfis(), cambio: () => ZoZo.recursos.cambio(), tela: tela(c),
      aoGravar: (titulo, marco) => { if (minha !== geracao) return; lixeira.push({ marco, titulo }); botaoDesfazer(marco, titulo); } });
    ocupado = true; atualizarEnvio(); digitando(true);
    let gravou = false;
    try {
      for (let rodada = 0; rodada < MAX_RODADAS; rodada += 1) {
        // o servidor desiste do modelo em 20 s (zo.TEMPO_LIMITE_S) e avisa; aqui a espera é um pouco maior, para o aviso chegar
        const r = await c.bridge.request(A.zoConversar, { mensagens: recentes() }, { timeout: 30000 });
        if (minha !== geracao) return;
        historico.push({ papel: "assistente", texto: r.texto, chamadas: r.chamadas });
        if (r.texto && r.texto.trim()) { digitando(false); bolha(r.texto.trim(), "bot"); }
        if (!r.chamadas.length) break;
        let esperarPessoa = false;
        for (const ch of r.chamadas) {
          const res = await ferramentas.executar(ch.nome, ch.argumentos);
          if (minha !== geracao) return;
          let resultado: string;
          if (res.tipo === "leitura") resultado = res.resultado;
          else if (res.tipo === "opcoes") { digitando(false); mostrarOpcoes(res.pergunta, res.opcoes); resultado = '{"mostrado":true,"aguardando":"escolha da pessoa"}'; esperarPessoa = true; }
          else if (res.tipo === "arquivo") {
            digitando(false);
            const escolher = h("button", { type: "button", class: Z.opcao, onClick: () => arquivoEl.click() }, "Escolher arquivo CSV ou OFX");
            logEl.appendChild(h("div", { class: Z.botoes }, escolher)); rolar();
            resultado = '{"mostrado":true,"aguardando":"a pessoa escolher o arquivo, que é lido e importado no aparelho dela"}';
            esperarPessoa = true;
          }
          else {
            digitando(false);
            const decisao = await confirmar(res.titulo, res.linhas);
            if (minha !== geracao) return;
            if (decisao) { resultado = await res.confirmar(); gravou = gravou || resultado.startsWith('{"ok":true'); }
            else resultado = '{"cancelado":true,"motivo":"a pessoa não confirmou"}';
            digitando(true);
          }
          historico.push({ papel: "ferramenta", id: ch.id, resultado });
        }
        if (esperarPessoa) break;                      // a escolha volta como a próxima mensagem da pessoa
        if (rodada === MAX_RODADAS - 1) nota("O pedido ficou longo demais. Pode me dizer de outro jeito?");
      }
    } catch (e) {
      if (minha !== geracao) return;
      const x = e as Partial<ErroPonte>;
      if (x && x.code === "CONSENT_REQUIRED") { aceito = false; pedirConsentimento(); }
      if (gravou) {
        // o que a pessoa confirmou JÁ foi gravado: a conversa mantém essa parte (repetir o pedido duplicaria) e o Zo
        // fica sabendo pela nota; só a resposta final faltou
        const aviso = "O que você confirmou foi feito. Só não consegui terminar a resposta.";
        nota(aviso + " " + ((x && x.friendly) || FR.ZO_FAILED));
        historico.push({ papel: "assistente", texto: aviso, chamadas: [] });
      } else {
        nota((x && x.friendly) || FR.ZO_FAILED);
        // a ida que falhou não fica na conversa: a próxima recomeça da última fala da pessoa
        while (historico.length && historico[historico.length - 1].papel !== "usuario") historico.pop();
        historico.pop();
      }
    } finally {
      if (minha === geracao) { ocupado = false; digitando(false); if (janela) atualizarEnvio(); }
      if (gravou) c.recarregarTudo();                 // a tela acompanha o que o Zo gravou
    }
  }

  /** Telas que o Zo pode abrir. As ações seguras (senha, 2FA, proteção, apagar, excluir, Pix) ficam nas Configurações */
  function tela(c: ContextoApp): TelaZo {
    return {
      abrirFatura: (o) => ZoZo.boleto.open(c, { perfilId: o.perfilId, cartaoId: o.cartaoId, mes: o.mes, ano: o.ano }),
      filtrar: (filtros, busca) => {
        ZoZo.store.set({ ui: { filtros: Object.assign({ contas: [], categorias: [], statusCategoria: "ambos", perfis: [], periodo: null, recorrencias: [], tipos: [], ordem: "data-desc" }, filtros),
          busca, selecionados: [] } });
        c.navigate("lancamentos", { force: true });
      },
      abrirConfiguracoes: (aba) => ZoZo.configuracoes.abrir(c, aba),
      // o resultado de verdade (antes: um temporizador de 700 ms dizia "pronto" mesmo se a exportação falhasse)
      exportar: () => ZoZo.exportarCsv(c, h("button", { type: "button" }) as HTMLButtonElement).then((ok) => {
        if (!ok) throw new ZoZo.messages.BridgeError("OPERATION_FAILED", FR.OPERATION_FAILED);
      }),
      sair: () => { fechar(); c.logout(); },
      seguranca: () => c.bridge.request(A.getProtecao).then((p) => ({ doisFatores: !!(ZoZo.store.get().session.user || {}).doisFatores, protecaoAvancada: p.avancada })),
      // conta com 2FA já entrou com o segundo fator; sem 2FA, a biometria confirma (o servidor confere a assinatura)
      verificarIdentidade: async () => {
        if ((ZoZo.store.get().session.user || {}).doisFatores) return "ok";
        const lista = await c.bridge.request(A.listarBiometrias).catch(() => ({ chaves: [] }));
        if (!lista.chaves.length) return "sem_metodo";
        return c.bridge.request(A.confirmarBiometria, undefined, { timeout: 180000 }).then(() => "ok" as const, (e: ErroPonte) => {
          if (e.code !== "WEBAUTHN_CANCELLED") c.toast(e.friendly, { tone: "error" });
          return "negado" as const;
        });
      },
    };
  }

  /* ---------------- lixeira temporal ---------------- */
  function botaoDesfazer(marco: string, titulo: string) {
    const b = h("button", { type: "button", class: Z.opcao, "aria-label": "Desfazer " + titulo, onClick: () => desfazer(marco, titulo, b) },
      icon("desfazer", { size: 15 }), "Desfazer") as HTMLButtonElement;
    logEl.appendChild(h("div", { class: Z.botoes }, b)); rolar();
  }
  /** Desfaz uma gravação do Zo. O Zo fica sabendo (a próxima ida leva a nota) */
  function desfazer(marco: string, titulo: string, botao: HTMLButtonElement | null) {
    if (!ctx) return;
    const c = ctx;
    if (ocupado) { nota("Espere o Zo terminar para desfazer."); return; }
    tocar();
    if (botao) botao.disabled = true;
    c.bridge.request(A.desfazerMarco, { marco }).then((r) => {
      lixeira = lixeira.filter((x) => x.marco !== marco);
      const msg = !r.conflitos ? "\u201C" + titulo + "\u201D foi desfeito."
        : r.desfeitas ? "Desfiz parte de \u201C" + titulo + "\u201D. " + (r.conflitos === 1 ? "Um item foi alterado" : r.conflitos + " itens foram alterados") + " depois e ficou como está."
          : "Não desfiz \u201C" + titulo + "\u201D, porque o que ele mudou foi alterado depois e ficou como está.";
      nota(msg);
      historico.push({ papel: "assistente", texto: msg, chamadas: [] });
      if (botao) botao.closest("div")?.remove();
      c.recarregarTudo();
    }).catch((e: ErroPonte) => {
      lixeira = lixeira.filter((x) => x.marco !== marco || e.code !== "UNDO_UNAVAILABLE");
      nota(e.friendly || FR.OPERATION_FAILED);
      if (botao) botao.disabled = e.code === "UNDO_UNAVAILABLE";
    });
  }
  function mostrarLixeira() {
    tocar();
    if (!lixeira.length) { nota("Nada para desfazer nesta conversa."); return; }
    nota("Lixeira temporal desta conversa. Desfazer volta só o que o Zo mudou e que ninguém alterou depois.");
    lixeira.slice().reverse().forEach((x) => {
      const b = h("button", { type: "button", class: Z.opcao, "aria-label": "Desfazer " + x.titulo, onClick: () => desfazer(x.marco, x.titulo, b) },
        icon("desfazer", { size: 15 }), x.titulo) as HTMLButtonElement;
      logEl.appendChild(h("div", { class: Z.botoes }, b));
    });
    rolar();
  }

  /** Cartão de confirmação: o resumo vem das ferramentas (dados reais), não do texto do modelo */
  function confirmar(titulo: string, linhas: Array<[string, string]>): Promise<boolean> {
    return new Promise((resolver) => {
      if (!janela) { resolver(false); return; }
      const ok = h("button", { type: "button", class: Z.opcao }, "Confirmar") as HTMLButtonElement;
      const nao = h("button", { type: "button", class: Z.opcao }, "Cancelar") as HTMLButtonElement;
      const cartao = h("div", { class: Z.cartao, role: "group", "aria-label": titulo },
        h("p", { class: Z.cartaoTitulo }, titulo),
        h("dl", { class: Z.linhas }, linhas.map(([r, v]) => [h("dt", { class: Z.rotulo }, r), h("dd", { class: Z.valor }, v)])),
        h("div", { class: Z.botoes }, ok, nao));
      logEl.appendChild(cartao); rolar();
      requestAnimationFrame(() => ok.focus());
      const fim = (sim: boolean) => { ok.disabled = true; nao.disabled = true; cancelarPendente = null; nota(sim ? "Confirmado" : "Cancelado"); resolver(sim); };
      cancelarPendente = () => fim(false);
      ok.addEventListener("click", () => fim(true));
      nao.addEventListener("click", () => fim(false));
    });
  }
  function mostrarOpcoes(pergunta: string, opcoes: string[]) {
    if (pergunta) bolha(pergunta, "bot");
    if (!opcoes.length) return;
    const botoes = opcoes.map((o) => h("button", { type: "button", class: Z.opcao, onClick: () => {
      botoes.forEach((b) => { b.disabled = true; });
      cancelarPendente = null;
      if (!ocupado) falar(o);
    } }, o) as HTMLButtonElement);
    logEl.appendChild(h("div", { class: Z.botoes, role: "group", "aria-label": pergunta || "Opções" }, botoes)); rolar();
    cancelarPendente = () => { botoes.forEach((b) => { b.disabled = true; }); cancelarPendente = null; };
  }

  /* ---------------- importar arquivo do banco (CSV/OFX) ----------------
     Tudo aqui no aparelho: o arquivo é lido, a pessoa confere linha por linha (conta, perfil, categoria sugerida
     pelo histórico, o que entra) e o serviço grava tudo de uma vez (importarLancamentos), sem repetir o que já existe. */
  async function importarArquivo(arquivo: File) {
    if (!ctx || !janela) return;
    const c = ctx;
    if (arquivo.size > MAX_ARQUIVO) { nota("Esse arquivo é grande demais. Use o CSV ou o OFX de um mês."); return; }
    let lido: ResultadoImportacao;
    try { lido = ZoZo.importar.ler(ZoZo.importar.decodificar(await arquivo.arrayBuffer())); }
    catch (e) { nota("Não consegui ler esse arquivo. Use o CSV ou o OFX que o banco exporta."); return; }
    if (!lido.itens.length) { nota("Não encontrei transações nesse arquivo. Use o CSV ou o OFX que o banco exporta."); return; }
    const itens = lido.itens.slice(0, MAX_IMPORTAR);
    if (lido.itens.length > MAX_IMPORTAR) nota("O arquivo tem " + lido.itens.length + " linhas. Vou mostrar as " + MAX_IMPORTAR + " primeiras.");
    const [contasR, catsR, perfisR, sug] = await Promise.all([
      c.bridge.request(A.getContas), c.bridge.request(A.getCategorias),
      ZoZo.recursos.perfis() ? c.bridge.request(A.getPerfis) : Promise.resolve(null),
      c.bridge.request(A.sugerirCategorias, { descricoes: itens.map((x) => x.descricao) }),
    ]).catch((e: ErroPonte) => { nota(e.friendly || FR.OPERATION_FAILED); return [null, null, null, null] as const; });
    if (!contasR || !catsR || !sug) return;
    const contas = contasR.contas.filter((x) => !x.oculta && ["cartao", "corrente", "poupanca", "outros"].includes(x.tipo));
    if (!contas.length) { nota("Cadastre antes a conta ou o cartão do arquivo."); return; }
    const cats = catsR.categorias.filter((x) => x.status === "regular");
    const perfis = perfisR ? perfisR.perfis.filter((p) => !p.arquivado) : [];
    // cartão: o sinal das compras varia por banco; vale o que mais aparece (a maioria das linhas são compras)
    const positivos = itens.filter((x) => x.valor > 0).length;
    const compraPositiva = positivos >= itens.length - positivos;
    const padrao = contas.find((x) => x.tipo === "cartao" && lido.cartao) || contas.find((x) => (positivos > 0 && x.tipo === "cartao")) || contas[0];

    const contaSel = ZoZo.ui.Select(contas.map((x) => ({ value: x.id, label: x.nome + (x.ultimos4Digitos ? " " + x.ultimos4Digitos : "") })), { value: padrao.id, ariaLabel: "Conta do arquivo" }) as HTMLSelectElement;
    const perfilSel = perfis.length ? ZoZo.ui.Select([{ value: "", label: "Escolha o perfil" }].concat(perfis.map((p) => ({ value: p.id, label: p.nome }))), { ariaLabel: "Perfil das transações" }) as HTMLSelectElement : null;
    const linhasEl = h("ul", { class: "tw:m-0 tw:p-0 tw:list-none tw:max-h-64 tw:overflow-y-auto tw:flex tw:flex-col tw:gap-1.5", "aria-label": "Transações do arquivo" });
    const resumoEl = h("p", { class: "tw:m-0 tw:text-[13px] tw:text-zz-secondary" });
    const importarBtn = h("button", { type: "button", class: Z.opcao }) as HTMLButtonElement;
    const cancelarBtn = h("button", { type: "button", class: Z.opcao }, "Cancelar") as HTMLButtonElement;
    type Linha = { item: LinhaImportada; marcado: HTMLInputElement; categoria: HTMLSelectElement; tipo: string };
    let linhas: Linha[] = [];
    const nomesTipo: Record<string, string> = { regular: "Compra", estorno: "Crédito", debito: "Débito", receita: "Receita" };
    const desenhar = () => {
      const conta = contas.find((x) => x.id === contaSel.value) || padrao;
      linhas = itens.map((item, i) => {
        const tipo = conta.tipo === "cartao" ? ((item.valor > 0) === compraPositiva ? "regular" : "estorno") : (item.valor < 0 ? "debito" : "receita");
        const marcado = h("input", { type: "checkbox", class: "tw:size-4 tw:flex-none tw:accent-zz-primary", "aria-label": "Importar " + item.descricao }) as HTMLInputElement;
        marcado.checked = tipo !== "estorno";                        // crédito no cartão costuma ser o pagamento: fica de fora, a não ser que marque
        marcado.addEventListener("change", contar);
        const s = sug.sugestoes[i];
        const categoria = ZoZo.ui.Select([{ value: "", label: "Sem categoria" }].concat(cats.map((k) => ({ value: k.id, label: k.nome }))),
          { value: s && s.categoriaId ? s.categoriaId : "", ariaLabel: "Categoria de " + item.descricao, class: "tw:max-w-[140px] tw:h-7! tw:text-[13px]!" }) as HTMLSelectElement;
        return { item, marcado, categoria, tipo };
      });
      mount(linhasEl, linhas.map((l) => h("li", { class: "tw:flex tw:items-center tw:gap-2 tw:text-[13px]" },
        l.marcado,
        h("span", { class: "tw:flex-none tw:w-11 tw:text-zz-secondary" }, l.item.data.slice(8, 10) + "/" + l.item.data.slice(5, 7)),
        h("span", { class: "tw:flex-1 tw:min-w-0 tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap", title: l.item.descricao }, l.item.descricao),
        h("span", { class: ["tw:flex-none money", (l.tipo === "estorno" || l.tipo === "receita") && "money--income"], title: nomesTipo[l.tipo] },
          (l.tipo === "estorno" || l.tipo === "receita" ? "− " : "") + ZoZo.format.moeda(Math.abs(l.item.valor))),
        l.categoria)));
      contar();
    };
    function contar() {
      const n = linhas.filter((l) => l.marcado.checked).length;
      importarBtn.textContent = "Importar " + n;
      importarBtn.disabled = !n;
      resumoEl.textContent = itens.length + " linhas no arquivo" + (lido.ignoradas ? ", " + lido.ignoradas + " sem data ou valor ficaram de fora" : "")
        + ". As categorias vêm do seu histórico. Créditos no cartão (como o pagamento da fatura) começam desmarcados.";
    }
    contaSel.addEventListener("change", desenhar);
    const cartao = h("div", { class: Z.cartao, role: "group", "aria-label": "Importar " + arquivo.name },
      h("p", { class: Z.cartaoTitulo }, "Importar " + arquivo.name),
      h("div", { class: "tw:flex tw:flex-wrap tw:gap-2" }, contaSel, perfilSel), resumoEl, linhasEl,
      h("div", { class: Z.botoes }, importarBtn, cancelarBtn));
    logEl.appendChild(cartao); rolar();
    desenhar();
    const travar = () => { [importarBtn, cancelarBtn, contaSel, ...(perfilSel ? [perfilSel] : [])].forEach((x) => { x.disabled = true; }); linhas.forEach((l) => { l.marcado.disabled = true; l.categoria.disabled = true; }); };
    cancelarBtn.addEventListener("click", () => { travar(); nota("Importação cancelada"); });
    importarBtn.addEventListener("click", () => {
      if (perfilSel && !perfilSel.value) { nota("Escolha o perfil das transações."); perfilSel.focus(); return; }
      const escolhidas = linhas.filter((l) => l.marcado.checked).map((l) => ({ data: l.item.data, descricao: l.item.descricao, valor: Math.abs(l.item.valor), tipo: l.tipo, categoriaId: l.categoria.value || null }));
      travar();
      c.bridge.request(A.importarLancamentos, { contaId: contaSel.value, perfilId: perfilSel ? perfilSel.value : null, itens: escolhidas }).then((r) => {
        const conta = contas.find((x) => x.id === contaSel.value);
        nota("Importei " + r.importados + (r.importados === 1 ? " transação" : " transações") + " em " + (conta ? conta.nome : "conta") + "."
          + (r.repetidos ? " " + r.repetidos + " já existiam e ficaram de fora." : ""));
        return c.recarregarTudo();
      }).catch((e: ErroPonte) => { nota(e.friendly || FR.OPERATION_FAILED); importarBtn.disabled = false; cancelarBtn.disabled = false; contaSel.disabled = false; if (perfilSel) perfilSel.disabled = false; linhas.forEach((l) => { l.marcado.disabled = false; l.categoria.disabled = false; }); });
    });
  }

  const api: ZoZoZo = { montar, abrir, fechar };
  ZoZo.zo = api;
})(window.ZoZo);
