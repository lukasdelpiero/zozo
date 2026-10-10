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
  }

  interface ZoZoGlobal {
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
