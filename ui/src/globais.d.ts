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
    h(tag: string, props?: PropsDom, ...filhos: FilhoDom[]): HTMLElement;
    s(tag: string, props?: PropsDom, ...filhos: FilhoDom[]): SVGElement;
    clear<T extends Node | null | undefined>(el: T): T;
    mount<T extends Node>(el: T, ...filhos: FilhoDom[]): T;
    append(pai: Node, filho: FilhoDom): void;
    id(prefixo?: string): string;
  }

  /** js/core/state.ts — estado central (os dados de cada tela ainda são `any`: vêm de módulos em JS) */
  type RecursoConta = "perfis" | "boleto" | "pix" | "cambio";
  interface UsuarioSessao {
    nomeUsuario?: string;
    email?: string;
    doisFatores?: boolean;
    demo?: boolean;
    recursos?: Partial<Record<RecursoConta, boolean>>;
  }
  interface SessaoEstado {
    status: "loading" | "login" | "register" | "2fa" | "authenticated";
    authenticated: boolean;
    user: UsuarioSessao | null;
    storageAvailable: boolean | null;
  }
  interface EstadoUi {
    filtros: Record<string, unknown> | null;
    selecionados: string[];
    invExcluidas: string[];
    busca: string;
    intervaloContas: string;
    intervaloPatrimonio: string;
    intervaloInvestimentos: string;
    gruposFechados: Record<string, boolean>;
    [outro: string]: unknown;
  }
  interface EstadoZoZo {
    session: SessaoEstado;
    currentPage: string;
    selectedItem: { tipo: string; id: string } | null;
    detailPanelOpen: boolean;
    data: Record<string, any>;
    loading: Record<string, boolean>;
    errors: Record<string, string | null>;
    stale: Record<string, boolean>;
    ui: EstadoUi;
  }
  /** set() mescla o 1º e o 2º nível: { ui: { busca: "x" } } muda só ui.busca */
  type ParcialEstado = { [K in keyof EstadoZoZo]?: EstadoZoZo[K] extends Record<string, unknown> ? Partial<EstadoZoZo[K]> : EstadoZoZo[K] };
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
  interface ErroPonte extends Error { code: string; friendly: string; espera?: number; captcha?: boolean }
  interface ZoZoMessages {
    ACTIONS: Readonly<Record<string, string>>;
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
    request(action: string, data?: unknown, opts?: OpcoesPedido): Promise<any>;
    requestHost(action: string, data?: unknown, opts?: OpcoesPedido): Promise<any>;
    mode: ModoPonte;
    isDemo: boolean;
    ACTIONS: Readonly<Record<string, string>>;
  }

  /** js/components/topbar.ts */
  interface BarraSuperior { setPage(titulo: string, acoes?: FilhoDom, prefixo?: FilhoDom): void }
  interface ZoZoTopbar { create(el: HTMLElement): BarraSuperior }

  /** js/components/inline.ts — edição no lugar (salva ao sair do campo; erro → volta ao valor anterior) */
  interface CampoTextoNoLugar { valor?: string; rotulo?: string; placeholder?: string; max?: number; classe?: string; aoSalvar(v: string): unknown }
  interface CampoValorNoLugar { valor?: unknown; rotulo?: string; classe?: string; permitirNegativo?: boolean; permitirZero?: boolean; aoSalvar(v: number): unknown }
  interface ZoZoInline {
    texto(cfg: CampoTextoNoLugar): HTMLInputElement;
    dinheiro(cfg: CampoValorNoLugar): HTMLInputElement;
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
    estadoCarregamento(state: EstadoZoZo, keys: string[], onRetry: () => void, opts?: { skeleton?: HTMLElement }): HTMLElement | null;
    pagina(cls: string, ...children: FilhoDom[]): HTMLElement;
    valorResumo(valor: unknown, subtitulo: string, align: "left" | "right"): HTMLElement;
    cardResumoDonut(cfg: CardResumo): HTMLElement;
    segmentosPorCategoria(itens: any[], campoValor: string): SegmentoRosca[];
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
    carregar(ctx: any, force: boolean): unknown;
    deps(state: EstadoZoZo): unknown[];
    render(state: EstadoZoZo, ctx: any): HTMLElement;
    topbar?(ctx: any): FilhoDom;
    prefixo?(ctx: any): FilhoDom;
    selecionar?(sel: unknown, ctx: any): void;
  }
  interface Roteador {
    navigate(id: string, opts?: { force?: boolean; select?: unknown }): void;
    refreshTopbar(): void;
    current(): PaginaZoZo | null;
  }
  interface ZoZoRouter { create(ctx: any, topbar: BarraSuperior, mainEl: HTMLElement): Roteador }

  /** js/components/feedback.ts — aviso (toast), janela modal e confirmação */
  interface OpcoesAviso { tone?: "default" | "success" | "aviso" | "error"; duration?: number }
  interface OpcoesModal {
    title?: string;
    body?: FilhoDom;
    class?: string;
    alert?: boolean;
    actions?: (fechar: (resultado?: unknown) => void) => FilhoDom;
    onClose?: (resultado: unknown) => void;
  }
  interface JanelaModal { fechar(resultado?: unknown): void }
  interface OpcoesConfirmacao { confirmar?: string; cancelar?: string; variante?: string }
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
    botoes?: Array<{ label: string; onClick?: () => void; primario?: boolean; desabilitado?: boolean; icone?: string }>;
    acoes?: Array<{ icone: string; rotulo: string; perigo?: boolean; onClick?: () => void }>;
    menu?: unknown[];
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
  interface ZoZoDividir { abrir(original: any, ctx: any, aoTerminar?: (id: string) => void): void }

  interface ZoZoGlobal {
    dom: ZoZoDom;
    store: ZoZoStore;
    recursos: ZoZoRecursos;
    log: ZoZoLog;
    format: ZoZoFormat;
    busca: ZoZoBusca;
    /** js/components/estrutura.ts — classes Tailwind do menu lateral, barra superior e painel */
    estrutura: Readonly<Record<string, string>>;
    /** js/components/pecas.ts — classes Tailwind das peças compartilhadas (ui.js e afins) */
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
    // módulos ainda em JavaScript
    [modulo: string]: any;
  }

  /** qrcode-generator (npm), exposto em window.qrcode por src/main.ts para o 2FA */
  type QrCodeFactory = typeof import("qrcode-generator");

  interface Window {
    ZoZo: ZoZoGlobal;
    qrcode: QrCodeFactory;
    ZOZO_DEMO?: { nome?: string; email?: string; senha?: string };
  }
}
