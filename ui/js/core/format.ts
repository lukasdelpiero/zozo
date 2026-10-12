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
   * Campo de valor enquanto a pessoa digita, como numa maquininha: os dígitos entram pelos centavos
   * e vão subindo ("1" → "0,01", "12" → "0,12", "1200" → "12,00", "120000" → "1.200,00").
   * Apagar tira o último dígito. Valor colado ("1.234,56", "1234.5") é lido inteiro, sem deslocar casas.
   * Campo com data-com-simbolo: o símbolo da moeda fica na frente enquanto digita ("R$ 1.234,56").
   */
  const prefixoMoeda = (input: HTMLInputElement): string => (input.dataset.comSimbolo !== undefined ? simbolo() + " " : "");
  /** Texto do campo de valor para editar: "1.234,56" ou, com data-com-simbolo, "R$ 1.234,56" (negativo: "-R$ …") */
  function valorParaEditar(input: HTMLInputElement, v: number): string {
    return (v < 0 ? "-" : "") + prefixoMoeda(input) + moedaEditavel(v);
  }
  function mascararValor(input: HTMLInputElement, _digitado?: string | null, tipo?: string): void {
    const v = input.value;
    const negativo = /^\s*[-−]/.test(v);
    let centavos: number;
    if (tipo === "insertFromPaste" || tipo === "insertFromDrop") {
      const n = parseMoeda(v);
      centavos = Number.isFinite(n) ? Math.round(Math.abs(n) * 100) : 0;
    } else {
      const digitos = v.replace(/\D/g, "").replace(/^0+/, "").slice(0, 15);   // até R$ 9.999.999.999.999,99
      centavos = digitos ? Number(digitos) : 0;
    }
    const novo = !centavos && !/\d/.test(v) ? (negativo ? "-" : "") : (negativo ? "-" : "") + prefixoMoeda(input) + moedaEditavel(centavos / 100);
    if (novo !== v) input.value = novo;
    try { input.setSelectionRange(novo.length, novo.length); } catch (e) { /* campo sem seleção */ }
  }
  /** Ao sair do campo: completa os centavos ("12.000" → "12.000,00"). Texto que não é valor fica como está. */
  /** Cursor no fim do campo (ao clicar para editar: nada fica selecionado) */
  function cursorNoFim(input: HTMLInputElement): void {
    const n = input.value.length;
    try { input.setSelectionRange(n, n); } catch (e) { /* campo sem seleção */ }
  }
  function completarValor(input: HTMLInputElement): void {
    const v = input.value.trim().replace(/US\$|R\$|[$€\s\u00a0]/g, "");
    if (!v || !/^[-−]?[\d.]+(,\d*)?$/.test(v)) return;
    const n = parseMoeda(v);
    if (Number.isFinite(n)) input.value = valorParaEditar(input, n);
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
    definirMoeda, simbolo, mascararValor, completarValor, valorParaEditar, cursorNoFim };
  ZoZo.format = api;
})(window.ZoZo);
