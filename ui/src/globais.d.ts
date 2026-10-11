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
    cor(v: unknown, padrao?: string | null): string | null;
    diaSemana(d: Date): string;
    rotuloDia(dataIso: string): string;
    definirMoeda(codigo: string): void;
    simbolo(): string;
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
    format: ZoZoFormat;
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
