/* =============================================================
   ZoZo — Formatação (pt-BR)
   Apenas apresentação. Nenhuma regra financeira aqui.
   TypeScript: tipos da API em src/globais.d.ts (ZoZoFormat).
   ============================================================= */
(function (ZoZo: ZoZoGlobal) {
  "use strict";

  const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  const MESES_ABREV = MESES.map((m) => m.slice(0, 3));

  // Valores sempre no padrão brasileiro (1.234,56); o símbolo acompanha a moeda escolhida (multicâmbio)
  const decimalFmt = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const inteiroFmt = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const SIMBOLOS: Record<CodigoMoeda, string> = { BRL: "R$", EUR: "€", USD: "$" };
  const ehMoeda = (c: string): c is CodigoMoeda => Object.prototype.hasOwnProperty.call(SIMBOLOS, c);
  let moedaAtiva: CodigoMoeda = "BRL";
  /** Troca a moeda exibida (R$, € ou $) — só o símbolo: os números nunca são convertidos */
  function definirMoeda(codigo: string): void { moedaAtiva = ehMoeda(codigo) ? codigo : "BRL"; }
  const simbolo = () => SIMBOLOS[moedaAtiva];
  const pctFmt = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  function numero(v: unknown): number {
    const n = typeof v === "number" ? v : parseFloat(String(v));
    return Number.isFinite(n) ? n : 0;
  }

  /** R$ 1.124,00 (sempre valor absoluto; o sinal é comunicado por cor/contexto) */
  function moeda(v: unknown, opts?: { inteiro?: boolean; comSinal?: boolean }): string {
    const o = opts || {};
    const n = numero(v);
    const fmt = o.inteiro ? inteiroFmt : decimalFmt;
    const negativo = o.comSinal && n < 0 && fmt.format(Math.abs(n)) !== fmt.format(0);
    return (negativo ? "-" : "") + simbolo() + " " + fmt.format(Math.abs(n)).replace(/\u00a0/g, " ");
  }

  /** 0,91% */
  function percentual(v: unknown): string {
    return pctFmt.format(Math.abs(numero(v))) + "%";
  }

  /** "2026-10-02" → Date local (sem fuso) */
  function parseData(iso: unknown): Date | null {
    if (iso instanceof Date) return iso;
    if (!iso || typeof iso !== "string") return null;
    const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }

  function iso(d: Date): string {
    const p = (n: number) => String(n).padStart(2, "0");
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  }

  const dd = (d: Date) => String(d.getDate()).padStart(2, "0");

  /** 02 Outubro 2026 */
  function dataExtenso(v: unknown): string {
    const d = parseData(v);
    if (!d) return "";
    return dd(d) + " " + MESES[d.getMonth()] + " " + d.getFullYear();
  }

  /** 02 Out */
  function dataCurta(v: unknown): string {
    const d = parseData(v);
    if (!d) return "";
    return dd(d) + " " + MESES_ABREV[d.getMonth()];
  }

  /** Outubro 2026 */
  function mesAno(v: unknown): string {
    const d = parseData(v);
    if (!d) return "";
    return MESES[d.getMonth()] + " " + d.getFullYear();
  }

  function mesAbrev(indice: number): string { return MESES_ABREV[indice] || ""; }
  function mesNome(indice: number): string { return MESES[indice] || ""; }

  /**
   * Converte texto digitado em número: "1.234,56" · "1234,56" · "1234.56" · "1.234" (milhar) · "-12,5".
   * O texto inteiro precisa ser um valor: "123abc" e "1,2,3" são recusados (NaN), nunca lidos pela metade.
   */
  function parseMoeda(txt: unknown): number {
    if (typeof txt === "number") return Number.isFinite(txt) ? txt : NaN;
    if (!txt) return NaN;
    let t = String(txt).trim().replace(/US\$|R\$|[$€\s\u00a0]/g, "").replace(/\u2212/g, "-");
    if (/^[+-]?\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) t = t.replace(/\./g, "").replace(",", ".");   // 1.234,56 · 1.234
    else if (/^[+-]?\d+,\d+$/.test(t)) t = t.replace(",", ".");                                       // 1234,56
    else if (!/^[+-]?(\d+(\.\d+)?|\.\d+)$/.test(t)) return NaN;                                       // 1234.56 · 12
    const n = Number(t);
    return Number.isFinite(n) ? n : NaN;
  }

  /** Valor para edição em campo: 1234.5 → "1234,50" */
  function moedaEditavel(v: unknown): string {
    return decimalFmt.format(Math.abs(numero(v))).replace(/\u00a0/g, " ");      // 12000 → "12.000,00"
  }

  /**
   * Campo de valor enquanto a pessoa digita: milhar com ponto e decimais com vírgula ("12000" → "12.000",
   * ao sair do campo "12.000,00"). Um "." digitado vira a vírgula dos centavos. O cursor fica no lugar.
   */
  function mascararValor(input: HTMLInputElement, digitado?: string | null): void {
    const v = input.value;
    const negativo = /^\s*[-−]/.test(v);
    let cursor = input.selectionStart == null ? v.length : input.selectionStart;
    let bruto = v;
    if (digitado === "." && !v.slice(0, cursor - 1).includes(",") && !v.slice(cursor).includes(",")) {
      bruto = v.slice(0, cursor - 1) + "," + v.slice(cursor);
    }
    // conta dígitos e a vírgula antes do cursor, para devolvê-lo ao mesmo ponto
    let antes = 0, viuVirgula = false;
    for (let i = 0; i < cursor && i < bruto.length; i++) {
      if (/\d/.test(bruto[i])) antes += 1;
      else if (bruto[i] === "," && !viuVirgula) { antes += 1; viuVirgula = true; }
    }
    let int = "", dec: string | null = null;
    for (const ch of bruto) {
      if (/\d/.test(ch)) { if (dec === null) int += ch; else if (dec.length < 2) dec += ch; }
      else if (ch === "," && dec === null) dec = "";
    }
    int = int.replace(/^0+(?=\d)/, "");
    if (!int && dec !== null) int = "0";
    const comPontos = int.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    const novo = (negativo ? "-" : "") + comPontos + (dec !== null ? "," + dec : "");
    if (novo === v) return;
    input.value = novo;
    let pos = negativo ? 1 : 0, vistos = 0;
    while (pos < novo.length && vistos < antes) { if (/[\d,]/.test(novo[pos])) vistos += 1; pos += 1; }
    try { input.setSelectionRange(pos, pos); } catch (e) { /* campo sem seleção */ }
  }
  /** Ao sair do campo: completa os centavos ("12.000" → "12.000,00"). Texto que não é valor fica como está. */
  function completarValor(input: HTMLInputElement): void {
    const v = input.value.trim();
    if (!v || !/^[-−]?[\d.]+(,\d*)?$/.test(v)) return;
    const n = parseMoeda(v);
    if (Number.isFinite(n)) input.value = (n < 0 ? "-" : "") + moedaEditavel(n);
  }

  /**
   * Cor vinda dos dados do usuário: aceita somente #RGB, #RRGGBB ou #RRGGBBAA.
   * Qualquer outro texto é descartado para não ser interpretado como CSS.
   */
  function cor(v: unknown, padrao?: string | null): string | null {
    return typeof v === "string" && /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(v.trim()) ? v.trim() : (padrao === undefined ? null : padrao);
  }

  /** Dias da semana (forma curta) */
  const DIAS_SEMANA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
  const diaSemana = (d: Date): string => DIAS_SEMANA[d.getDay()];

  /** Título do dia nas listas de lançamentos: Hoje · Ontem · "Domingo, 4 Outubro" */
  function rotuloDia(dataIso: string): string {
    const agora = new Date();
    const ontem = new Date(agora); ontem.setDate(agora.getDate() - 1);
    if (dataIso === iso(agora)) return "Hoje";
    if (dataIso === iso(ontem)) return "Ontem";
    const d = parseData(dataIso);
    return d ? diaSemana(d) + ", " + d.getDate() + " " + MESES[d.getMonth()] : "";
  }

  const api: ZoZoFormat = {
    diaSemana, rotuloDia, cor, moeda, percentual, parseData, iso, dataExtenso, dataCurta, mesAno, mesAbrev, mesNome, parseMoeda, moedaEditavel, numero, MESES, MESES_ABREV,
    definirMoeda, simbolo, mascararValor, completarValor };
  ZoZo.format = api;
})(window.ZoZo);
