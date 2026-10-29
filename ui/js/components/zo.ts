/* =============================================================
   ZoZo — Zo, o assistente (botão flutuante + janela de conversa)
   ------------------------------------------------------------
   Botão no canto inferior direito (vidro, com o Z). Ao tocar, abre a janela no mesmo canto e o botão some.
   Na primeira conversa vem o aviso de consentimento: sem ele nada vai para o Gemini (o servidor também recusa).
   Cada ida ao Zo leva a conversa recente; as ferramentas rodam aqui (data/zo.ts). Gravação só depois do
   Confirmar no cartão de resumo (montado com os dados reais). Texto sempre como texto (nada de HTML).
   A conversa fica só na memória desta aba: sai ao fechar a aba ou sair da conta.
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
      + "tw:bg-zz-surface tw:[border:1px_solid_var(--color-border)] tw:[box-shadow:0_16px_48px_rgba(22,33,58,0.22)] tw:overflow-hidden "
      + "tw:celular:inset-x-2 tw:celular:bottom-2 tw:celular:w-auto tw:celular:h-[min(640px,calc(100dvh-16px))]",
    topo: "tw:flex tw:items-center tw:gap-3 tw:px-4 tw:h-16 tw:flex-none tw:border-b tw:border-b-zz-border",
    avatar: "tw:relative tw:grid tw:place-items-center tw:size-10 tw:flex-none tw:rounded-full tw:bg-white tw:[box-shadow:0_1px_4px_rgba(22,33,58,0.16)]",
    online: "tw:absolute tw:right-0 tw:bottom-0 tw:size-2.5 tw:rounded-full tw:bg-(--color-positive) tw:[border:2px_solid_white]",
    nome: "tw:m-0 tw:text-[16px] tw:font-[650] tw:text-zz-text tw:leading-tight",
    status: "tw:m-0 tw:text-[13px] tw:text-zz-secondary",
    acoesTopo: "tw:ml-auto tw:flex tw:items-center tw:gap-1",
    log: "tw:flex-1 tw:min-h-0 tw:overflow-y-auto tw:flex tw:flex-col tw:gap-3 tw:p-4",
    bot: "tw:self-start tw:max-w-[88%] tw:px-3.5 tw:py-2.5 tw:rounded-2xl tw:rounded-tl-md tw:bg-(--color-background) tw:text-[15px] tw:leading-normal tw:text-zz-text tw:whitespace-pre-wrap tw:[overflow-wrap:anywhere]",
    eu: "tw:self-end tw:max-w-[88%] tw:px-3.5 tw:py-2.5 tw:rounded-2xl tw:rounded-tr-md tw:bg-zz-primary-soft tw:text-[15px] tw:leading-normal tw:text-zz-text tw:whitespace-pre-wrap tw:[overflow-wrap:anywhere]",
    cartao: "tw:self-stretch tw:flex tw:flex-col tw:gap-2 tw:p-3.5 tw:rounded-xl tw:[border:1px_solid_var(--color-border)] tw:bg-zz-surface",
    cartaoTitulo: "tw:m-0 tw:text-[14px] tw:font-[650] tw:text-zz-text",
    linhas: "tw:m-0 tw:grid tw:grid-cols-[auto_minmax(0,1fr)] tw:gap-x-3 tw:gap-y-1 tw:text-[14px]",
    rotulo: "tw:text-zz-secondary",
    valor: "tw:m-0 tw:text-zz-text tw:font-[550] tw:[overflow-wrap:anywhere]",
    botoes: "tw:flex tw:flex-wrap tw:gap-2 tw:pt-1",
    opcao: "tw:inline-flex tw:items-center tw:min-h-8 tw:px-3 tw:rounded-full tw:[border:1px_solid_var(--color-border)] tw:bg-zz-surface "
      + "tw:text-[14px] tw:font-[550] tw:text-zz-primary tw:cursor-pointer tw:hover:bg-zz-primary-softer tw:disabled:opacity-50 tw:disabled:cursor-default",
    nota: "tw:self-center tw:text-[13px] tw:text-zz-secondary",
    digitando: "tw:self-start tw:flex tw:gap-1 tw:px-3.5 tw:py-3 tw:rounded-2xl tw:bg-(--color-background)",
    ponto: "tw:size-1.5 tw:rounded-full tw:bg-zz-secondary tw:animate-pulse tw:motion-reduce:animate-none",
    rodape: "tw:flex-none tw:p-3 tw:border-t tw:border-t-zz-border",
    caixa: "tw:flex tw:items-end tw:gap-2 tw:rounded-xl tw:[border:1px_solid_var(--color-border)] tw:px-3 tw:py-2 tw:focus-within:border-zz-primary",
    campo: "tw:flex-1 tw:min-w-0 tw:max-h-28 tw:resize-none tw:[border:0] tw:bg-transparent tw:text-[15px] tw:leading-normal tw:text-zz-text tw:outline-none tw:p-0",
    enviar: "tw:grid tw:place-items-center tw:size-9 tw:flex-none tw:rounded-full tw:[border:0] tw:bg-(image:--botao-roxo) tw:text-white tw:cursor-pointer "
      + "tw:disabled:bg-none tw:disabled:bg-zz-border tw:disabled:cursor-default",
  };

  /** O Z do ZoZo (roxo, traço arredondado), desenhado aqui: nenhum arquivo externo */
  function logoZ(tamanho: number): SVGElement {
    const id = ZoZo.dom.id("zo-z");
    return s("svg", { width: tamanho, height: tamanho, viewBox: "0 0 1024 1024", "aria-hidden": "true", focusable: "false" },
      s("defs", null, s("linearGradient", { id, x1: 0, y1: 0, x2: 1, y2: 1 }, s("stop", { "stop-color": "#7141DE" }), s("stop", { offset: 1, "stop-color": "#602BD9" }))),
      s("path", { d: "M 320 320 H 704 L 320 704 H 704", fill: "none", stroke: "url(#" + id + ")", "stroke-width": 160, "stroke-linecap": "round", "stroke-linejoin": "round" }));
  }

  // Aviso do plano gratuito do Gemini (fase de testes). Mudou o texto? Suba zo.CONSENTIMENTO_VERSAO no servidor.
  const CONSENTIMENTO = "Antes de começar, preciso do seu consentimento. O Zo está em fase de testes. Para ajudar você, ele lê e, quando você confirma, altera os seus dados no ZoZo. "
    + "A cada pergunta, a sua mensagem e só os trechos dos dados necessários são enviados ao Gemini, a inteligência artificial do Google, para gerar a resposta. "
    + "Nesta fase de testes, o Google pode usar esse conteúdo para treinar e melhorar os produtos dele, e pessoas da equipe do Google podem ler. "
    + "Por isso, não escreva no chat nada que você não queira compartilhar. "
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
    historico = []; aceito = null; ocupado = false;
  }

  /* ---------------- janela ---------------- */
  let logEl: HTMLElement, campo: HTMLTextAreaElement, enviarBtn: HTMLButtonElement, anexarBtn: HTMLButtonElement, arquivoEl: HTMLInputElement;
  function abrir() {
    if (!permitido() || janela) return;
    if (fab) { fab.remove(); fab = null; }
    logEl = h("div", { class: Z.log, role: "log", "aria-live": "polite", "aria-label": "Conversa com o Zo", tabindex: "0" });
    campo = h("textarea", { class: Z.campo, rows: "1", maxlength: "2000", placeholder: "Mensagem", "aria-label": "Mensagem para o Zo" }) as HTMLTextAreaElement;
    enviarBtn = h("button", { type: "button", class: Z.enviar, "aria-label": "Enviar", onClick: enviar }, icon("enviar", { size: 18, stroke: 2.25 })) as HTMLButtonElement;
    // anexar o arquivo do banco (CSV ou OFX): lido aqui, nunca enviado ao Zo
    arquivoEl = h("input", { type: "file", accept: ".csv,.ofx,.txt,text/csv,application/x-ofx", class: "tw:sr-only", tabindex: "-1", "aria-hidden": "true" }) as HTMLInputElement;
    arquivoEl.addEventListener("change", () => { const f = arquivoEl.files && arquivoEl.files[0]; arquivoEl.value = ""; if (f) void importarArquivo(f); });
    anexarBtn = h("button", { type: "button", class: ZoZo.pecasFn.botaoIcone("", true), "aria-label": "Importar arquivo do banco (CSV ou OFX)",
      title: "Importar arquivo do banco", onClick: () => arquivoEl.click() }, icon("clipe", { size: 18 })) as HTMLButtonElement;
    campo.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(); } });
    campo.addEventListener("input", () => { campo.style.height = "auto"; campo.style.height = Math.min(campo.scrollHeight, 112) + "px"; atualizarEnvio(); });
    const menuBtn = h("button", { type: "button", class: ZoZo.pecasFn.botaoIcone("", true), "aria-label": "Opções do Zo", "aria-haspopup": "menu" }, icon("opcoes", { size: 18 })) as HTMLButtonElement;
    menuBtn.addEventListener("click", () => ZoZo.menu.abrir(menuBtn, [
      { label: "Nova conversa", onClick: novaConversa },
      { label: "Retirar consentimento", onClick: retirarConsentimento },
    ], { posicao: "esquerda", label: "Opções do Zo" }));
    janela = h("section", { class: Z.janela, role: "dialog", "aria-modal": "false", "aria-label": "Zo, assistente do ZoZo" },
      h("header", { class: Z.topo },
        h("span", { class: Z.avatar }, logoZ(24), h("span", { class: Z.online, "aria-hidden": "true" })),
        h("div", null, h("p", { class: Z.nome }, "Zo"), h("p", { class: Z.status }, "Assistente do ZoZo")),
        h("div", { class: Z.acoesTopo }, menuBtn,
          h("button", { type: "button", class: ZoZo.pecasFn.botaoIcone("", true), "aria-label": "Fechar o Zo", onClick: fechar }, icon("fechar", { size: 18 })))),
      logEl,
      h("footer", { class: Z.rodape }, h("div", { class: Z.caixa }, anexarBtn, campo, enviarBtn), arquivoEl));
    janela.addEventListener("keydown", (e) => { if (e.key === "Escape" && !document.querySelector(".menu")) { e.preventDefault(); fechar(); } });
    raiz().appendChild(janela);
    requestAnimationFrame(() => campo.focus());
    if (historico.length) redesenhar(); else iniciar();
  }
  function fechar() {
    if (!janela) return;
    janela.remove(); janela = null;
    mostrarFab();
    if (fab) fab.focus();
  }
  function atualizarEnvio() {
    const bloqueado = ocupado || aceito !== true;
    campo.disabled = aceito !== true;
    anexarBtn.disabled = aceito !== true;
    enviarBtn.disabled = bloqueado || !campo.value.trim();
  }

  /* ---------------- mensagens na tela ---------------- */
  const rolar = () => requestAnimationFrame(() => { logEl.scrollTop = logEl.scrollHeight; });
  function bolha(texto: string, de: "bot" | "eu") { logEl.appendChild(h("p", { class: [de === "bot" ? Z.bot : Z.eu, "tw:m-0"] }, texto)); rolar(); }
  function nota(texto: string) { logEl.appendChild(h("p", { class: [Z.nota, "tw:m-0"] }, texto)); rolar(); }
  /** Só as falas (para reabrir a janela com a conversa); cartões já resolvidos não voltam */
  function redesenhar() {
    mount(logEl);
    historico.forEach((m) => {
      if (m.papel === "usuario") bolha(m.texto, "eu");
      else if (m.papel === "assistente" && m.texto) bolha(m.texto, "bot");
    });
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
      historico = []; aceito = false; ocupado = false;
      if (janela) { mount(logEl); bolha("Consentimento retirado. A conversa foi apagada desta tela.", "bot"); pedirConsentimento(); atualizarEnvio(); }
    }).catch((e: ErroPonte) => nota(e.friendly || FR.OPERATION_FAILED));
  }
  function novaConversa() {
    geracao += 1;
    if (cancelarPendente) cancelarPendente();
    historico = []; ocupado = false;
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
      perfis: () => ZoZo.recursos.perfis(), fatura: () => ZoZo.recursos.boleto() && ZoZo.recursos.perfis(), cambio: () => ZoZo.recursos.cambio(), tela: tela(c) });
    ocupado = true; atualizarEnvio(); digitando(true);
    let gravou = false;
    try {
      for (let rodada = 0; rodada < MAX_RODADAS; rodada += 1) {
        const r = await c.bridge.request(A.zoConversar, { mensagens: recentes() }, { timeout: 60000 });
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
      nota((x && x.friendly) || FR.ZO_FAILED);
      if (x && x.code === "CONSENT_REQUIRED") { aceito = false; pedirConsentimento(); }
      // a ida que falhou não fica na conversa: a próxima recomeça da última fala da pessoa
      while (historico.length && historico[historico.length - 1].papel !== "usuario") historico.pop();
      historico.pop();
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
      exportar: () => new Promise<void>((resolver) => { ZoZo.exportarCsv(c, h("button", { type: "button" }) as HTMLButtonElement); setTimeout(resolver, 700); }),
      sair: () => { fechar(); c.logout(); },
      seguranca: () => c.bridge.request(A.getProtecao).then((p) => ({ doisFatores: !!(ZoZo.store.get().session.user || {}).doisFatores, protecaoAvancada: p.avancada })),
    };
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
