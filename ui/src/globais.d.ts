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

  interface ZoZoGlobal {
    dom: ZoZoDom;
    store: ZoZoStore;
    recursos: ZoZoRecursos;
    log: ZoZoLog;
    format: ZoZoFormat;
    busca: ZoZoBusca;
    /** js/components/estrutura.ts — classes Tailwind do menu lateral, barra superior e painel */
    estrutura: Readonly<Record<string, string>>;
    pix: ZoZoPix;
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
