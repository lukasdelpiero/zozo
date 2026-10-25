/* =============================================================
   ZoZo — tipos globais (transição para TypeScript)
   ------------------------------------------------------------
   A interface ainda é formada por módulos que se registram em
   window.ZoZo (js/**). Cada módulo convertido para .ts ganha aqui
   o tipo da sua API; os que ainda são .js ficam como `any` até
   serem convertidos (um por vez).
   ============================================================= */
export {};

declare global {
  type CodigoMoeda = "BRL" | "EUR" | "USD";

  /** js/core/dom.ts — filhos aceitos por h()/s()/mount(): nós, textos, números e listas (null/false somem) */
  type FilhoDom = Node | string | number | boolean | null | undefined | FilhoDom[];
  /** Propriedades: atributos, class (texto ou lista), text, dataset, style (objeto), on… (função), ref, value */
  type PropsDom = Record<string, unknown> | null | undefined;
  interface ZoZoDom {
    /** o tipo do elemento segue a tag: h("input") é HTMLInputElement, h("button") é HTMLButtonElement… */
    h<K extends keyof HTMLElementTagNameMap>(tag: K, props?: PropsDom, ...filhos: FilhoDom[]): HTMLElementTagNameMap[K];
    h(tag: string, props?: PropsDom, ...filhos: FilhoDom[]): HTMLElement;
    s(tag: string, props?: PropsDom, ...filhos: FilhoDom[]): SVGElement;
    clear<T extends Node | null | undefined>(el: T): T;
    mount<T extends Node>(el: T, ...filhos: FilhoDom[]): T;
    append(pai: Node, filho: FilhoDom): void;
    id(prefixo?: string): string;
    /** Emoji centrado pelo desenho (cada emoji tem a tinta numa posição diferente da caixa) */
    emoji(texto: unknown, classe?: string): HTMLElement;
    /** "dx dy" (em) que centraliza o desenho de um emoji numa caixa inline-block de line-height 1 ("" = já centrado) */
    ajusteEmoji(texto: string, fontes?: string): string;
  }

  /** js/core/state.ts — estado central (os dados de cada tela ainda são `any`: vêm de módulos em JS) */
  type RecursoConta = "perfis" | "boleto" | "pix" | "cambio";
  interface UsuarioSessao {
    nomeUsuario?: string;
    email?: string;
    doisFatores?: boolean;
    demo?: boolean;
    recursos?: Partial<Record<RecursoConta, boolean>>;
    teste?: boolean;          // ambiente de teste (local ou prévia)
    simulada?: boolean;       // conta simulada sem servidor (modo de teste)
  }
  /** js/bridge/host-web.ts — controles do painel de testes (só no endereço local e na prévia) */
  interface ZoZoTesteHost {
    simulando(): boolean;
    simular(ligar: boolean): void;
    falhar(codigo: string | null): void;
    falhaAtual(): string | null;
    conflitoNaProxima(): void;
    carregarExemplo(): boolean;
    estado(): { endereco: string; simulacao: boolean; falha: string | null; sessao: string };
  }
  interface SessaoEstado {
    status: "loading" | "login" | "register" | "2fa" | "authenticated";
    authenticated: boolean;
    user: UsuarioSessao | null;
    storageAvailable: boolean | null;
  }
  /** Filtros da página Transações (pages/lancamentos.ts) */
  interface FiltrosLancamentos {
    contas: string[]; categorias: string[]; statusCategoria: string; perfis: string[]; periodo: string | null;
    recorrencias: string[]; tipos: string[]; ordem: string;
  }
  interface EstadoUi {
    filtros: Partial<FiltrosLancamentos> | null;
    selecionados: string[];
    invExcluidas: string[];
    busca: string;
    intervaloContas: string;
    intervaloPatrimonio: string;
    intervaloInvestimentos: string;
    gruposFechados: Record<string, boolean>;
    /** grupos de categoria abertos no Dashboard; contas ocultas à mostra (por grupo) em Contas */
    dashGruposAbertos?: Record<string, boolean>;
    mostrarOcultas?: Record<string, boolean>;
    [outro: string]: unknown;
  }
  interface EstadoZoZo {
    session: SessaoEstado;
    currentPage: string;
    selectedItem: { tipo: string; id: string } | null;
    detailPanelOpen: boolean;
    data: DadosNoEstado;
    loading: Record<string, boolean>;
    errors: Record<string, string | null>;
    stale: Record<string, boolean>;
    ui: EstadoUi;
  }
  /** set() mescla o 1º e o 2º nível: { ui: { busca: "x" } } muda só ui.busca */
  type ParcialEstado = { [K in keyof EstadoZoZo]?: EstadoZoZo[K] extends object ? Partial<EstadoZoZo[K]> : EstadoZoZo[K] };
  type OuvinteEstado = (atual: EstadoZoZo, anterior: EstadoZoZo) => void;
  interface ZoZoStore {
    get(): EstadoZoZo;
    set(patch: ParcialEstado | ((s: EstadoZoZo) => ParcialEstado | null | undefined)): void;
    subscribe(fn: OuvinteEstado): () => boolean;
    reset(): void;
  }
  interface ZoZoRecursos {
    perfis(): boolean;
    boleto(): boolean;
    pix(): boolean;
    cambio(): boolean;
    demo(): boolean;
  }
  interface ZoZoLog {
    info(...a: unknown[]): void;
    error(...a: unknown[]): void;
  }

  /** js/core/format.ts */
  interface ZoZoFormat {
    MESES: string[];
    MESES_ABREV: string[];
    numero(v: unknown): number;
    moeda(v: unknown, opts?: { inteiro?: boolean; comSinal?: boolean }): string;
    percentual(v: unknown): string;
    parseData(iso: unknown): Date | null;
    iso(d: Date): string;
    dataExtenso(v: unknown): string;
    dataCurta(v: unknown): string;
    mesAno(v: unknown): string;
    mesAbrev(indice: number): string;
    mesNome(indice: number): string;
    parseMoeda(txt: unknown): number;
    moedaEditavel(v: unknown): string;
    mascararValor(input: HTMLInputElement, digitado?: string | null, tipo?: string): void;
    completarValor(input: HTMLInputElement): void;
    valorParaEditar(input: HTMLInputElement, v: number): string;
    cursorNoFim(input: HTMLInputElement): void;
    cor(v: unknown, padrao?: string | null): string | null;
    diaSemana(d: Date): string;
    rotuloDia(dataIso: string): string;
    definirMoeda(codigo: string): void;
    simbolo(): string;
  }

  /** js/core/busca.ts — busca local (os dados são cifrados: nada vai a um servidor de busca) */
  /** [texto do campo, peso]: o peso multiplica a relevância (ex.: descrição 3, notas 1) */
  type CampoBusca = [texto: unknown, peso: number];
  interface ConsultaBusca {
    termos: string[];                                // palavras normalizadas (sem acento, minúsculas)
    valor: { min?: number; max?: number } | null;   // ">100", "<=50"
    vazia: boolean;
  }
  interface ResultadoBusca<T> {
    itens: T[];                                      // na ordem original da lista
    termos: string[];
    valor: ConsultaBusca["valor"];
    pontos(item: T): number;                         // relevância (maior = melhor)
    destacar(texto: unknown): Array<string | { marca: string }>;
  }
  interface IndiceBusca<T> {
    buscar(texto: string, valorDe?: (item: T) => number): ResultadoBusca<T>;
    tamanho: number;
    vocabulario: number;
  }
  interface ZoZoBusca {
    normalizar(t: unknown): string;
    consulta(texto: unknown): ConsultaBusca;
    indice<T extends object>(itens: readonly T[], campos: (item: T) => CampoBusca[], chave?: string): IndiceBusca<T>;
    destacar(texto: unknown, termos: readonly string[]): Array<string | { marca: string }>;
    distancia(a: string, b: string, max: number): number;
  }

  /** js/data/pix.ts */
  interface DadosPix {
    chave: string;
    nome: string;
    cidade?: string;
    valor: number | string;
    txid?: string;
  }
  interface ZoZoPix {
    payload(cfg: DadosPix): string | null;
    normalizarChave(texto: unknown): string | null;
    novoTxid(): string;
    crc16(texto: string): string;
    cpfValido(c: string): boolean;
    celularValido(digitos: string): boolean;
    nomeValido(nome: unknown): boolean;
  }

  /** js/core/icons.ts — ícones de traço (24×24) */
  interface OpcoesIcone { size?: number; stroke?: number; class?: string }
  interface ZoZoIcons {
    icon(name: string, opts?: OpcoesIcone): SVGElement;
    names: string[];
  }

  /** js/config/regras.ts — pontos de configuração das regras */
  interface ModeloCategoria { nome: string; icone: string; cor: string; grupo?: string | null; reservado?: number; status?: "regular" | "excluida" }
  interface ZoZoRegras {
    limiteNome: number;
    corSugerida(): string;
    orcamentoPerto: number;
    tiposValorVerde: string[];
    boleto: { sinalPorTipo: Record<string, number>; sinalContribuicao: number; sinalDesconto: number; sinalArredondamento: number; arredondamentoAceitaNegativo: boolean };
    categorias: { sinalGastoPorTipo: Record<string, number> };
    totais: { gasto: Record<string, number>; recebido: Record<string, number> };
    recorrencias: { pagoSomenteComLancamento: boolean };
    tiposInvestimento: string[];
    iconesInvestimento: Record<string, string>;
    modelosCategoria: ModeloCategoria[];
    categoriasSugeridas: ModeloCategoria[];
    paleta: string[];
  }
  interface ZoZoSobre { readonly versao: string; readonly autor: string }

  /** js/bridge/messages.ts — contrato de mensagens interface ↔ host */
  interface PedidoPonte { type: "request"; action: string; requestId: string; data: unknown }
  interface RespostaPonte {
    type: "response"; action: string; requestId: string; success: boolean;
    data?: unknown; error?: { code: string; message?: string; espera?: number; captcha?: boolean };
  }
  /** ACTIONS: cada nome de ação é o próprio valor (ACTIONS.getContas === "getContas"), com o tipo literal */
  type AcoesPonte = { readonly [K in NomeAcao]: K };
  interface ErroPonte extends Error { code: string; friendly: string; espera?: number; captcha?: boolean }
  interface ZoZoMessages {
    ACTIONS: AcoesPonte;
    SENSITIVE: ReadonlySet<string>;
    FRIENDLY: Readonly<Record<string, string>>;
    createRequest(action: string, data?: unknown): PedidoPonte;
    okResponse(req: PedidoPonte, data?: unknown): RespostaPonte;
    errorResponse(req: PedidoPonte, code?: string, message?: string): RespostaPonte;
    BridgeError: new (code?: string, friendly?: string) => ErroPonte;
  }

  /** js/bridge/transporte.ts — única saída da interface: tudo vira mensagem JSON (web, mock ou nenhum host) */
  type ModoPonte = "web" | "mock" | "none";
  interface HostPonte { handle(req: PedidoPonte): Promise<RespostaPonte> | RespostaPonte }
  interface OpcoesPedido { timeout?: number }
  interface ZoZoBridge {
    /** Promise com os dados da resposta; rejeita sempre com ErroPonte (texto amigável) */
    request<K extends NomeAcao>(action: K, data?: unknown, opts?: OpcoesPedido): Promise<RespostaDe<K>>;
    requestHost(action: string, data?: unknown, opts?: OpcoesPedido): Promise<any>;
    mode: ModoPonte;
    isDemo: boolean;
    ACTIONS: AcoesPonte;
  }

  /** js/components/topbar.ts */
  interface BarraSuperior { setPage(titulo: string, acoes?: FilhoDom, prefixo?: FilhoDom): void }
  interface ZoZoTopbar { create(el: HTMLElement): BarraSuperior }

  /** js/components/inline.ts — edição no lugar (salva ao sair do campo; erro → volta ao valor anterior) */
  interface CampoTextoNoLugar { valor?: string; rotulo?: string; placeholder?: string; max?: number; classe?: string; aoSalvar(v: string): unknown }
  interface CampoValorNoLugar { valor?: unknown; rotulo?: string; classe?: string; permitirNegativo?: boolean; permitirZero?: boolean; aoSalvar(v: number): unknown }
  interface ZoZoInline {
    texto(cfg: CampoTextoNoLugar): HTMLInputElement;
    dinheiro(cfg: CampoValorNoLugar): HTMLElement;
    dinheiroCampo(cfg: { valor: unknown; rotulo: string; classe?: string; aoEnter?: () => void }): { el: HTMLElement; campo: HTMLInputElement; editar(): void; ler(): number; definir(v: unknown): void };
    vitrine(input: HTMLInputElement, rotulo: string): { el: HTMLElement; editar(): void };
    corDot(cor: unknown, aoMudar: (cor: string) => void): HTMLElement;
  }

  /** js/pages/comum.ts — peças compartilhadas entre páginas */
  interface SegmentoRosca { label: string; cor?: string; valor: number }
  interface CardResumo {
    ariaLabel: string;
    segmentos?: SegmentoRosca[];
    esquerda: { valor: unknown; label: string };
    direita: { valor?: unknown; texto?: string; label: string };
    onClick?: () => void;
    progresso?: number;
    corProgresso?: string;
    tituloProgresso?: string;
  }
  interface ZoZoPagesComum {
    estadoCarregamento(state: EstadoZoZo, keys: ChaveDados[], onRetry: () => void, opts?: { skeleton?: HTMLElement }): HTMLElement | null;
    carregado<K extends ChaveDados>(state: EstadoZoZo, chave: K): DadosEstado[K];
    pagina(cls: string, ...children: FilhoDom[]): HTMLElement;
    valorResumo(valor: unknown, subtitulo: string, align: "left" | "right"): HTMLElement;
    cardResumoDonut(cfg: CardResumo): HTMLElement;
    detalheLinha(rotulo: string, valor: FilhoDom, cls?: string): HTMLElement;
    detalheSecao(titulo: string | null, ...children: FilhoDom[]): HTMLElement;
  }

  /** js/components/calendario.ts */
  interface OpcoesCalendario { posicao?: "esquerda" | "direita" | "acima"; rotulo?: string }
  interface CampoData { valor?: string | null; rotulo?: string; classe?: string; aoMudar(iso: string): void }
  interface ZoZoCalendario {
    abrir(anchor: HTMLElement, valor: string | null | undefined, aoEscolher: (iso: string) => void, opts?: OpcoesCalendario): void;
    Campo(cfg: CampoData): HTMLElement;
  }

  /** js/router.ts — cada página registrada em ZoZo.pages */
  interface PaginaZoZo {
    titulo: string;
    recurso?: keyof ZoZoRecursos;
    carregar(ctx: ContextoApp, force: boolean): unknown;
    deps(state: EstadoZoZo): unknown[];
    render(state: EstadoZoZo, ctx: ContextoApp): HTMLElement;
    topbar?(ctx: ContextoApp): FilhoDom;
    prefixo?(ctx: ContextoApp): FilhoDom;
    selecionar?(sel: { tipo: string; id: string }, ctx: ContextoApp): void;
  }
  interface Roteador {
    navigate(id: string, opts?: { force?: boolean; select?: { tipo: string; id: string } }): void;
    refreshTopbar(): void;
    current(): PaginaZoZo | null;
  }
  interface ZoZoRouter { create(ctx: ContextoApp, topbar: BarraSuperior, mainEl: HTMLElement): Roteador }

  /** js/components/feedback.ts — aviso (toast), janela modal e confirmação */
  /** importante: mostra mesmo uma confirmação (tone "success"), que normalmente não aparece */
  interface OpcoesAviso { tone?: "default" | "success" | "aviso" | "error"; duration?: number; importante?: boolean }
  interface OpcoesModal {
    title?: string;
    body?: FilhoDom;
    class?: string;
    alert?: boolean;
    actions?: (fechar: (resultado?: unknown) => void) => FilhoDom;
    onClose?: (resultado: unknown) => void;
  }
  interface JanelaModal { fechar(resultado?: unknown): void }
  interface OpcoesConfirmacao { confirmar?: string; cancelar?: string; variante?: OpcoesBotao["variant"] }
  interface ZoZoFeedback {
    toast(mensagem: string, opts?: OpcoesAviso): void;
    modal(opts: OpcoesModal): JanelaModal;
    confirmarExclusao(titulo: string, mensagem: string, opts?: OpcoesConfirmacao): Promise<boolean>;
  }

  /** js/components/detail-panel.ts — painel de informações à direita */
  interface ApiPainel { close(opts?: { silencioso?: boolean }): void; setTitle(t: string): void }
  interface ConfigPainel {
    title?: string;
    tituloNode?: FilhoDom;
    voltar?: () => void;
    /** rotuloCurto: texto no celular (≤ 640 px), quando os botões não cabem ao lado do "⋯"; o nome completo continua para leitores de tela */
    botoes?: Array<{ label: string; rotuloCurto?: string; onClick?: (e: MouseEvent) => void; primario?: boolean; desabilitado?: boolean; icone?: string }>;
    acoes?: Array<{ icone: string; rotulo: string; perigo?: boolean; onClick?: () => void }>;
    menu?: Array<ItemMenu | null | false>;     // itens nulos (condicionais) são ignorados
    selected?: { tipo: string; id: string } | null;
    render(body: HTMLElement, api: ApiPainel): void;
    onClose?: () => void;
    focus?: boolean;
  }
  interface PainelInformacoes {
    open(cfg: ConfigPainel): ApiPainel;
    close(opts?: { silencioso?: boolean }): void;
    isOpen(): boolean;
  }
  interface ZoZoDetailPanel { create(workspaceEl: HTMLElement, panelEl: HTMLElement): PainelInformacoes }

  /** js/components/dividir.ts — dividir uma transação entre perfis */
  interface ZoZoDividir { abrir(original: LancamentoTela, ctx: ContextoApp, aoTerminar?: (id: string) => void): void }

  /** js/components/menu.ts — menu suspenso com submenus */
  interface ApiMenu { fechar(): void; atualizar(): void; voltar(): void }
  interface ConteudoMenu { render(el: HTMLElement, api: ApiMenu): void; largura?: number }
  interface ItemMenu {
    label?: string; icone?: string; descricao?: string; valor?: string;
    onClick?(api: ApiMenu): void;
    perigo?: boolean; check?: boolean; desabilitado?: boolean; manterAberto?: boolean;
    submenu?: ItensMenu; larguraSub?: number; checkEsquerda?: boolean;
    separador?: boolean; secao?: string;
    render?(api: ApiMenu): Node;
  }
  type ItensMenu = ItemMenu[] | ConteudoMenu | (() => ItemMenu[] | ConteudoMenu);
  interface OpcoesMenu {
    posicao?: "direita" | "esquerda" | "acima"; largura?: number; larguraSub?: number; label?: string;
    class?: string; checkEsquerda?: boolean; focar?: boolean;
    papel?: "menu" | "dialog";      // calendário e outros painéis que não são lista de opções: "dialog"
  }
  interface ConfigListaMarcavel {
    itens: Array<{ value: string; label: string; cor?: string | null; icone?: string }>;
    marcados(): string[];
    alternar(value: string): void;
    topo?(redesenhar: () => void): Node;
    vazio?: string;
    largura?: number;
  }
  interface ZoZoMenu {
    abrir(anchor: HTMLElement, itens: ItensMenu, opts?: OpcoesMenu): void;
    fechar(devolverFoco?: boolean): void;
    listaMarcavel(cfg: ConfigListaMarcavel): ConteudoMenu;
    /** Menu de perfis (o mesmo do painel da transação, da divisão e da fatura) */
    perfis(anchor: HTMLElement, ctx: ContextoApp, o: OpcoesMenuPerfil): void;
    /** Menu de contas (o mesmo do painel da transação e da fatura) */
    contas(anchor: HTMLElement, o: OpcoesMenuConta): void;
  }
  interface OpcoesMenuPerfil { perfis: Perfil[]; atual?: string | null; aoEscolher(p: Perfil): void; aoCriar?(p: Perfil): void; posicao?: "direita" | "esquerda" | "acima" }
  interface OpcoesMenuConta { contas: ContaTela[]; atual?: string | null; aoEscolher(c: ContaTela): void; vazio?: string; rodape?: ItemMenu[]; posicao?: "direita" | "esquerda" | "acima" }

  /** js/components/sidebar.ts — menu lateral */
  interface ItemNavegacao { id: string; label: string; icon: string; recurso?: keyof ZoZoRecursos }
  interface ZoZoSidebar {
    create(el: HTMLElement, ctx: ContextoApp): { render(state: EstadoZoZo): void };
    NAV: ItemNavegacao[];
    visivel(n: ItemNavegacao): boolean;
  }

  /** js/components/forms.ts — formulário de cadastro no painel */
  interface CampoForm {
    nome: string; rotulo: string;
    tipo?: "texto" | "email" | "senha" | "dinheiro" | "digitos4" | "selecao" | "cor" | "emoji" | "lista";
    obrigatorio?: boolean; opcoes?: any[]; dica?: string; max?: number; placeholder?: string; autocomplete?: string;
    mostrarSe?(valores: Record<string, unknown>): boolean;
  }
  interface ConfigForm {
    titulo: string;
    selected?: { tipo: string; id: string } | null;
    voltar?: (() => void) | null;
    campos: CampoForm[];
    valores?: Record<string, unknown>;
    validar?(valores: Record<string, unknown>): string | null;
    salvar(valores: Record<string, unknown>): unknown;
    textoSalvar?: string;
    excluir?: { rotulo?: string; titulo: string; mensagem: string; acao(): Promise<unknown> } | null;
    aviso?: string; avisoPerigo?: boolean;
    aoCancelar?: () => void;
    manterAberto?: boolean;
  }
  interface ZoZoForms { abrir(ctx: ContextoApp, cfg: ConfigForm): ApiPainel }

  /** js/components/verificacao.ts — CAPTCHA, código de 6 dígitos, QR e senha */
  interface Turnstile {
    render(el: HTMLElement, opts: Record<string, unknown>): string;
    reset(id: string): void;
  }
  interface CaptchaWidget { el: HTMLElement; token(): string; reset(): void }
  interface ConfigCodigo { rotulo?: string; classe?: string; classeCaixa?: string; onCompleto?(codigo: string): void; onDigitar?(): void }
  interface CampoCodigo6 {
    el: HTMLElement; valor(): string; limpar(): void; foco(): void;
    desabilitar(v: boolean): void; marcarErro(v: boolean): void;
  }
  interface ZoZoVerificacao {
    Captcha(sitekey: string): CaptchaWidget;
    CampoCodigo(cfg?: ConfigCodigo): CampoCodigo6;
    QR(texto: string, px?: number, rotulo?: string, margem?: number): SVGElement;
    protegerSenha(input: HTMLInputElement): HTMLInputElement;
    ComRevelar(input: HTMLInputElement, classe?: string): HTMLElement;
  }

  /** js/components/ui.ts — peças do design system */
  interface OpcoesBotao {
    variant?: "primary" | "secondary" | "danger" | "danger-ghost" | "text"; size?: "sm"; type?: "button" | "submit";
    class?: string | null; onClick?: (e: MouseEvent) => void; disabled?: boolean; pressed?: boolean; title?: string; icon?: string;
  }
  interface OpcoesBotaoIcone {
    class?: string | null; onPrimary?: boolean; active?: boolean; onClick?: (e: MouseEvent) => void; disabled?: boolean;
    pressed?: boolean; expanded?: boolean; size?: number;
  }
  interface OpcoesEntrada {
    class?: string; type?: string; name?: string; id?: string; value?: string | number | null; placeholder?: string; autocomplete?: string;
    inputmode?: string; maxlength?: string; "aria-label"?: string; required?: boolean; disabled?: boolean; invalid?: boolean;
    onInput?: (e: Event) => void; onChange?: (e: Event) => void; onKeydown?: (e: KeyboardEvent) => void;
  }
  type OpcaoLista = { value: string; label: string } | { group: string; options: Array<{ value: string; label: string }> };
  interface OpcoesLista { class?: string; name?: string; disabled?: boolean; onChange?: (e: Event) => void; ariaLabel?: string; value?: string | null }
  interface CategoriaRotulo { nome: string; icone?: string | null; cor?: string | null }
  interface ItemSegmentado { value: string; label: string; icon?: string }
  interface OpcoesSecao { key?: string; title?: FilhoDom; class?: string; classeCabecalho?: string; classeLead?: string; adorno?: FilhoDom; aside?: FilhoDom }
  interface ZoZoUI {
    confirmarNoBotao(btn: HTMLElement, texto: string): void;
    Button(label: FilhoDom, opts?: OpcoesBotao): HTMLButtonElement;
    IconButton(iconName: string, label: string, opts?: OpcoesBotaoIcone): HTMLButtonElement;
    Field(label: FilhoDom, control: HTMLElement, opts?: { class?: string; prefix?: string; hint?: FilhoDom }): HTMLElement;
    Input(opts?: OpcoesEntrada): HTMLInputElement;
    Select(options: OpcaoLista[], opts?: OpcoesLista): HTMLSelectElement;
    Textarea(opts?: { class?: string; name?: string; rows?: number; placeholder?: string; ariaLabel?: string; value?: string }): HTMLTextAreaElement;
    Toggle(label: string, opts?: { checked?: boolean; onChange?: (ligado: boolean) => void }): HTMLElement;
    Tag(nome: string | null | undefined, cor: unknown, opts?: { class?: string; placeholder?: string; onClick?: (e: MouseEvent) => void; title?: string }): HTMLElement | null;
    CategoryLabel(cat: CategoriaRotulo | null | undefined, opts?: { pill?: boolean; class?: string; vazio?: string }): HTMLElement | null;
    PercentageChange(valor: unknown, opts?: { plain?: boolean; class?: string; title?: string; contexto?: string; passivo?: boolean }): HTMLElement;
    Dinheiro(valor: unknown, opts?: { class?: string | false | null }): HTMLElement;
    ProgressBar(ratio: unknown, opts?: { tone?: "ok" | "over" | "allocation"; grande?: boolean; class?: string; label?: string }): HTMLElement;
    FilterTabs(valor: string, onChange: (v: string, teclado?: boolean) => void, opts?: { itens?: string[]; label?: string }): HTMLElement;
    /** pontos com { data, … } (os demais campos variam: valor, ativos, passivos…) */
    recortarSerie<T extends { data: string }>(serie: T[] | null | undefined, intervalo: string): T[];
    Segmented(itens: ItemSegmentado[], valor: string, onChange: (v: string, teclado?: boolean) => void, opts?: { class?: string; label?: string }): HTMLElement;
    Card(opts: { class?: string; label?: string; title?: string; link?: { label: string; onClick: () => void } } | null, ...children: FilhoDom[]): HTMLElement;
    Section(opts: OpcoesSecao | null, ...children: FilhoDom[]): HTMLElement;
    Skeleton(linhas?: number, opts?: { class?: string; short?: boolean }): HTMLElement;
    EmptyState(mensagem: FilhoDom, opts?: { class?: string; icon?: string; action?: { label: string; onClick: () => void; icon?: string } }): HTMLElement;
    ErrorState(mensagem: FilhoDom, onRetry?: (() => void) | null): HTMLElement;
    ColorPicker(valor: string | null | undefined, onChange: (cor: string) => void, opts?: { colunas?: number; cheio?: boolean; altura?: number; label?: string }): HTMLElement;
    AccountIcon(conta: { cor?: string | null; tipo?: string }): HTMLElement;
    INTERVALOS: string[];
    refocus(key: string): void;
    Checkbox(checked: boolean, onChange: (marcado: boolean) => void, opts?: { label?: string; class?: string; texto?: string }): HTMLElement;
    alternarArvore(chave: string, aplicar: () => void): void;
    corpoArvore(chave: string, el: HTMLElement): HTMLElement;
    alternarGrupo(chave: string): void;
    CAMPO_PAINEL: string;
  }
  /** js/components/pecas.ts — classes montadas por função (variante do botão) */
  interface ZoZoPecasFn { botao(variante?: string, pequeno?: boolean, cheio?: boolean): string; botaoIcone(tom?: string, pequeno?: boolean): string }

  /** js/components/list.ts — linhas das listas (itens do documento ainda como any) */
  interface ZoZoList {
    ListaPainel(itens: LancamentoTela[], opts?: { onClick?: (l: LancamentoTela) => void }): HTMLElement;
    LaunchRow(l: LancamentoTela, opts?: Record<string, unknown>): HTMLElement;
    AccountRow(c: ContaTela, opts?: Record<string, unknown>): HTMLElement;
    CategoryRow(cat: CategoriaTela, opts?: Record<string, unknown>): HTMLElement;
    CategoryGroupRow(grupo: BlocoGrupoCategorias, opts?: Record<string, unknown>): HTMLElement;
    RecurrenceRow(r: ItemRecorrencia, opts?: Record<string, unknown>): HTMLElement;
    AllocationRow(a: AlocacaoInvestimento): HTMLElement;
    SidebarAccountGroup(titulo: string, contas: ContaTela[], opts?: { onSelect?: (conta: ContaTela) => void }): HTMLElement;
    nomeComDigitos(nome: string, digitos?: string | null, cls?: string): HTMLElement;
    SUBTITULO_CONTA: Record<string, string>;
  }

  /** js/components/charts.ts — gráficos (linha, rosca, barras) */
  interface PontoGrafico { data: string; valor: number; vazio?: boolean }
  interface SerieGrafico { name?: string; color?: string; colorBySlope?: boolean; points: PontoGrafico[]; area?: boolean; tracejado?: boolean; pontos?: boolean }
  interface OpcoesGraficoLinha {
    height?: number; ariaLabel?: string; animar?: boolean; semEixo?: boolean; independentScale?: boolean;
    formatValue?: (v: number) => string; rotuloX?: (p: PontoGrafico) => string; rotuloTooltip?: (p: PontoGrafico) => string;
    /** passar o mouse "filtra": data em cima do ponto, o resto esmaecido e quem chama atualiza o topo
        (pontos = o ponto de cada série no lugar do mouse; null = saiu do gráfico) */
    aoPassar?: (pontos: Array<PontoGrafico | null> | null) => void;
  }
  interface OpcoesRosca { size?: number; thickness?: number; ariaLabel?: string; onClick?: () => void; progresso?: number; corProgresso?: string; tituloProgresso?: string }
  interface BarraGrafico { valor: unknown; rotulo?: string; rotuloMes?: string; rotuloAno?: string; titulo?: string; destaque?: boolean }
  interface OpcoesGraficoBarras { height?: number; ariaLabel?: string; limite?: number; nomeValor?: string }
  interface ZoZoCharts {
    renderLineChart(container: HTMLElement, series: SerieGrafico[], options?: OpcoesGraficoLinha): { destroy(): void };
    renderDonutChart(container: HTMLElement, segments: SegmentoRosca[] | null | undefined, options?: OpcoesRosca): SVGElement;
    renderBarChart(container: HTMLElement, barras: BarraGrafico[], options?: OpcoesGraficoBarras): { destroy(): void };
    /** o roteador liga/desliga a animação de entrada e informa de onde continuar */
    permitirAnimacao: boolean;
    continuarDe: number | null;
    ultimoInicio: number | null;
  }

  /** js/components/modais.ts — janela de passos (criar conta, categoria, recorrência…) */
  interface BotaoJanela { label: string; primario?: boolean; perigo?: boolean; desabilitado?: boolean; onClick: (btn: HTMLButtonElement) => void; ref?: (btn: HTMLButtonElement) => void }
  interface ApiJanela { fechar(): void; ir(passo: PassoJanela): void }
  type PassoJanela = (api: ApiJanela) => { titulo?: string; corpo: FilhoDom; rodapeEsquerda?: FilhoDom; botoes?: BotaoJanela[] };
  interface ConfigJanela { titulo: string; classe?: string; passo: PassoJanela; onClose?: (resultado: unknown) => void }

  interface ZoZoModais {
    janela(cfg: ConfigJanela): ApiJanela;
    seletorIcone(valor: string | null | undefined, aoMudar: (emoji: string) => void): HTMLElement;
    Interruptor(rotulo: string, ligado: boolean, aoMudar: (ligado: boolean) => void, nomeAcessivel?: string): HTMLElement;
    /** Pagar a fatura do cartão (débito na conta escolhida + receita no cartão) */
    pagarFatura(ctx: ContextoApp, cartao: ContaTela, aoPagar?: () => void): void;
    receberFatura(ctx: ContextoApp, cfg: { perfil: { id: string; nome: string }; mes: number; ano: number; aPagar: number; aoReceber?: () => void }): void;
    novaCategoria(ctx: ContextoApp, opts?: OpcoesNovaCategoria): void;
    novoPerfil(ctx: ContextoApp, opts?: OpcoesNovoPerfil): void;
    criarGrupo(aoCriar: (nome: string) => void): void;
    novaConta(ctx: ContextoApp, tipoInicial?: string, opts?: OpcoesNovaConta): void;
    novaRecorrencia(ctx: ContextoApp): void;
    /** frequência de uma transação (lancamentoId) ou só a escolha (aoEscolher, transação ainda não criada) */
    frequencia(ctx: ContextoApp, lancamentoId: Id | null, opts?: OpcoesFrequencia): void;
    /** a senha digitada, ou null se a janela fechou sem confirmar */
    confirmarComSenha(cfg: ConfigConfirmarSenha): Promise<string | null>;
  }
  interface OpcoesNovaCategoria { icone?: string; nome?: string; grupo?: string | null; aoCriar?: (c: Categoria) => void }
  interface OpcoesNovoPerfil { aoCriar?: (p: Perfil) => void }
  interface OpcoesNovaConta { aoCriar?: (c: ContaTela) => void }
  /** Frequência escolhida (parcelada: parcela atual, total e o valor da compra) */
  interface DadosFrequencia { recorrencia: string; parcelaAtual?: number; parcelaTotal?: number; valorTotal?: number }
  interface OpcoesFrequencia { valor?: number; aoEscolher?: (dados: DadosFrequencia) => void; aoTerminar?: () => void }
  interface ConfigConfirmarSenha { titulo: string; mensagem: string; botao?: string }
  /** js/components/cambio.ts — multicâmbio (Real, Euro, Dólar: só o símbolo muda, nunca os números) */
  interface ZoZoCambio {
    MOEDAS: Array<{ codigo: CodigoMoeda; nome: string; simbolo: string }>;
    aplicarMoeda(ctx: ContextoApp, codigo: string): Promise<unknown>;
    trocar(ctx: ContextoApp, codigo: CodigoMoeda): Promise<unknown>;
    disponivelTransferir(): boolean;
    abrirTransferencia(ctx: ContextoApp): void;
    Seletor(ctx: ContextoApp): HTMLElement | null;
    SecaoConfig(ctx: ContextoApp, cfg: Partial<RespostaConfig>): HTMLElement;
  }

  /** js/app.ts — contexto compartilhado com páginas e componentes (ctx) */
  interface ContextoApp {
    bridge: ZoZoBridge;
    toast(mensagem: string, opts?: OpcoesAviso): void;
    /** Lê pelo estado (store.data[key]) ou pela ação que preenche a chave; o tipo vem de DadosEstado */
    loadData<K extends ChaveDados>(key: K, action: LeituraDaChave[K], payload?: unknown, opts?: { force?: boolean }): Promise<DadosEstado[K]>;
    invalidate(keys: string[]): void;
    navigate(id: string, opts?: { force?: boolean; select?: { tipo: string; id: string } }): void;
    abrirConfiguracoes(aba?: string): void;
    recarregarTudo(): Promise<unknown>;
    router: Roteador;
    detail: PainelInformacoes;
    refreshTopbar(): void;
    encerrarSessao(): void;
    logout(msg?: string): void;
    /** só dentro da janela de Configurações */
    redesenharConfig?: () => void;
  }

  /* ---------- Módulos das páginas (o que cada um expõe em window.ZoZo) ---------- */
  /** js/data/servico.js (ainda em JavaScript): regras financeiras sobre o documento decifrado */
  interface ZoZoServico {
    handle(action: string, data?: unknown): Promise<any>;
    atende(action: string): boolean;
    reset(): void;
    FREQUENCIAS: Readonly<Record<string, { dias?: number; meses?: number; rotulo: string; texto: string }>>;
    aguardarGravacoes(): Promise<unknown>;
    gravando(): boolean;
    recarregarDoServidor(): boolean;
    /** Total da fatura de um perfil (regras.boleto, em centavos): o mesmo cálculo do serviço, para a tela enquanto edita */
    calcularFatura(f: { lancamentos?: Array<{ valor: unknown; tipo: string }>; contribuicoes?: Array<{ valor: unknown }>; descontos?: Array<{ valor: unknown }>;
      arredondamentos?: Array<{ valor: unknown }>; saldoAnterior?: unknown; recebido?: unknown }): ResumoFatura;
  }
  interface ResumoFatura { lancamentos: number; contribuicoes: number; descontos: number; arredondamentos: number; total: number; saldoAnterior: number; recebido: number; aPagar: number }
  /** js/components/auth.ts */
  /** Tela de entrada (components/auth.ts): mensagens, CAPTCHA, Google e o que fazer em cada etapa (app.ts) */
  interface ConfigEntrada {
    erro?: string | null; aviso?: string | null; emailInicial?: string;
    turnstile?: string | null; captchaLogin?: boolean; google?: boolean;
    /** 2FA: rótulo do "voltar" (sem ele: "Entrar com outra conta") */
    voltar?: string;
    onIrCadastro(): void; onVoltar(): void; onEsqueci?(email: string): void;
    onLogin(cred: { email: string; senha: string; turnstile?: string }): void;
    onCadastro(dados: { nomeUsuario: string; email: string; senha: string; turnstile?: string }): void;
    /** código do 2FA → mensagem de erro (ou null: entrou) */
    onCodigo(codigo: string): Promise<string | null>;
    onCancelar2FA(): void;
  }
  interface ZoZoAuth {
    render(root: HTMLElement, cfg: ConfigEntrada): void;
    reiniciar(): void;
    prepararGoogle(dados: { email: string; nome?: string; contaExiste: boolean }): void;
    carregando(root: HTMLElement, texto: string): void;
    prepararLogin(email: string): void;
    irPara(modo: "login" | "register", etapa: number, email: string): void;
    aguardandoEmail(root: HTMLElement, email: string, cfg: { onReenviar: () => Promise<unknown>; recuperacao?: boolean; onVoltar?: () => void }): void;
    pedirRecuperacao(root: HTMLElement, cfg: { email: string; onEnviar: (email: string) => Promise<unknown>; onVoltar: () => void }): void;
    codigoRecuperacao(root: HTMLElement, cfg: { onCodigo: (codigo: string) => Promise<string | null>; onVoltar: () => void }): void;
    novaSenha(root: HTMLElement, cfg: { email: string; manter: boolean; erro?: string | null; onSalvar: (senha: string) => void; onVoltar: () => void }): void;
    linkInvalido(root: HTMLElement, cfg: { onVoltar: () => void }): void;
    A: Readonly<Record<string, string>>;
  }
  /** js/data/demo.ts — documento fictício da conta de demonstração */
  interface ZoZoDemo { documento(hoje: Date, completo?: boolean): any }
  /** js/pages/boleto.ts — criação de fatura */
  interface ZoZoBoleto {
    /** receber: abre já a janela "Registrar pagamento recebido" (painel de testes) */
    open(ctx: ContextoApp, opts?: { perfilId?: string | null; receber?: boolean }): void;
    close(): void;
  }
  interface ZoZoCategoriasShared {
    abrirFormCategoria(ctx: ContextoApp, cat: CategoriaPainel | null, preset?: Partial<Categoria> | null, voltar?: () => void): void;
    abrirDetalhe(cat: CategoriaPainel, ctx: ContextoApp, opts?: OpcoesPainelCategoria): void;
    estruturar(categorias: CategoriaTela[], grupos: Record<string, GrupoTela> | null | undefined): BlocoCategorias[];
    abrirGrupo(nome: string, ctx: ContextoApp, opts?: OpcoesPainelGrupo): void;
  }
  /** Painel da categoria: a do mês (CategoriaTela) ou uma recém-criada, ainda sem gasto e orçamento do mês */
  type CategoriaPainel = Categoria & Partial<Pick<CategoriaTela, "usada" | "gasto" | "reservadoFixo" | "orcamentoPorMes">>;
  interface OpcoesPainelCategoria { editandoOrcamento?: boolean; voltar?: () => void }
  interface OpcoesPainelGrupo { editando?: boolean; voltar?: () => void }
  /** Card Ativos × Passivos: compacto/embutido no Dashboard, com o período em ui[chaveIntervalo] */
  interface OpcoesCardContas {
    intervalo?: string; embedded?: boolean; compact?: boolean; filtros?: boolean; alturaGrafico?: number;
    chaveIntervalo?: string; rotuloFiltro?: string;
  }
  interface OpcoesPainelConta { editandoCiclo?: boolean; voltar?: () => void }
  interface ZoZoContasShared {
    ContasChartCard(contas: RespostaContas, ui: EstadoUi, opts?: OpcoesCardContas): HTMLElement;
    abrirDetalheConta(conta: ContaTela, ctx: ContextoApp, opts?: OpcoesPainelConta): void;
  }
  /** Painel da transação: preset = campos já preenchidos numa nova; recemCriada = entrada animada; voltar = seta "voltar" */
  interface OpcoesPainelLancamento { preset?: Partial<Lancamento>; recemCriada?: boolean; voltar?: () => void }
  interface ZoZoLancamentoPainel { abrir(l: { id: Id } | null, ctx: ContextoApp, opts?: OpcoesPainelLancamento): Promise<void> }
  interface ZoZoLancamentosShared {
    abrirFormulario(l: LancamentoTela | null, ctx: ContextoApp, preset?: Partial<Lancamento>): Promise<void>;
    abrirVisualizacao(l: LancamentoTela, ctx: ContextoApp, opts?: OpcoesPainelLancamento): Promise<void>;
    setFiltros(patch: Partial<FiltrosLancamentos>, ctx?: ContextoApp): void;
    FILTROS_VAZIOS(): FiltrosLancamentos;
  }
  interface ZoZoPerfilShared {
    abrirFormPerfil(ctx: ContextoApp, p: PerfilPainel | null, voltar?: () => void): void;
    AvatarPerfil(p: Pick<Perfil, "nome" | "cor">): HTMLElement;
    abrirDetalhe(p: PerfilPainel, ctx: ContextoApp, opts?: { voltar?: () => void }): void;
  }
  /** Painel do perfil: o da lista (com gasto e quantidade) ou um recém-criado */
  type PerfilPainel = Perfil & Partial<Pick<PerfilTela, "gasto" | "quantidade">>;
  interface ZoZoRecorrenciasShared { abrirDetalhe(r: ItemRecorrencia, ctx: ContextoApp, opts?: { voltar?: () => void }): unknown }
  /** src/emoji-picker.ts */
  interface ZoZoEmojiPicker {
    abrir(anchor: HTMLElement, opts?: { atual?: string; aoEscolher?: (emoji: string) => void; posicao?: string }): void;
    carregar(): Promise<void>;
    fechar(): void;
  }

  interface ZoZoGlobal {
    dom: ZoZoDom;
    store: ZoZoStore;
    recursos: ZoZoRecursos;
    log: ZoZoLog;
    format: ZoZoFormat;
    busca: ZoZoBusca;
    /** js/components/estrutura.ts — classes Tailwind do menu lateral, barra superior e painel */
    estrutura: Readonly<Record<string, string>>;
    /** js/components/pecas.ts — classes Tailwind das peças compartilhadas (ui.ts e afins) */
    pecas: Readonly<Record<string, string>>;
    pix: ZoZoPix;
    icons: ZoZoIcons;
    regras: ZoZoRegras;
    sobre: ZoZoSobre;
    messages: ZoZoMessages;
    bridge: ZoZoBridge;
    topbar: ZoZoTopbar;
    inline: ZoZoInline;
    pagesComum: ZoZoPagesComum;
    calendario: ZoZoCalendario;
    router: ZoZoRouter;
    pages: Record<string, PaginaZoZo>;
    feedback: ZoZoFeedback;
    detailPanel: ZoZoDetailPanel;
    dividir: ZoZoDividir;
    menu: ZoZoMenu;
    sidebar: ZoZoSidebar;
    forms: ZoZoForms;
    verificacao: ZoZoVerificacao;
    ui: ZoZoUI;
    pecasFn: ZoZoPecasFn;
    list: ZoZoList;
    charts: ZoZoCharts;
    modais: ZoZoModais;
    cambio: ZoZoCambio;
    /** js/bridge/host-web.ts — criptografia de ponta a ponta + API (só na versão web) */
    webHost?: HostPonte;
    testeHost?: ZoZoTesteHost;
    /** js/core/simbolos.ts — "R$" e "%" menores e no alto do número */
    simbolos?: { realcar(raiz: Node): void };
    /** js/components/teste.ts — painel de testes (só existe com testeHost) */
    teste?: { iniciar(ctx: ContextoApp, app: { tela(nome: string): void; entradaMudou(): void; sessaoExpirada(): void; entrarSimulado(): Promise<unknown> }): void };
    servico: ZoZoServico;
    auth: ZoZoAuth;
    demo: ZoZoDemo;
    boleto: ZoZoBoleto;
    categoriasShared: ZoZoCategoriasShared;
    contasShared: ZoZoContasShared;
    lancamentoPainel: ZoZoLancamentoPainel;
    lancamentosShared: ZoZoLancamentosShared;
    perfilShared: ZoZoPerfilShared;
    recorrenciasShared: ZoZoRecorrenciasShared;
    usuario: { Avatar(foto: string | null | undefined, nome: string | undefined, tamanho?: number): HTMLElement };
    exportarCsv(ctx: ContextoApp, botao: HTMLButtonElement): void;
    configuracoes: { abrir(ctx: ContextoApp, aba?: string): void; desativar2FA(ctx: ContextoApp): void };
    emojiPicker: ZoZoEmojiPicker;
    /** contexto da interface (app.ts), para depuração e para os módulos que não o recebem por parâmetro */
    ctx: ContextoApp;
    /** só no servidor de desenvolvimento com ?mock=1 (ui/mock, fora do build) */
    mock?: { host?: HostPonte; [k: string]: unknown };
  }

  /** qrcode-generator (npm), carregado sob demanda por components/verificacao.ts (QR do 2FA e do Pix) */
  type QrCodeFactory = typeof import("qrcode-generator");

  interface Window {
    ZoZo: ZoZoGlobal;
    turnstile?: Turnstile;
    ZOZO_DEMO?: { nome?: string; email?: string; senha?: string };
  }
}
