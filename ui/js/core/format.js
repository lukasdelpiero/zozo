/* =============================================================
   ZoZo — Formatação (pt-BR)
   Apenas apresentação. Nenhuma regra financeira aqui.
   ============================================================= */
(function (ZoZo) {
  "use strict";

  const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  const MESES_ABREV = MESES.map((m) => m.slice(0, 3));

  const moedaFmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const moedaInteiraFmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const pctFmt = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  function numero(v) {
    const n = typeof v === "number" ? v : parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  }

  /** R$ 1.124,00 (sempre valor absoluto; o sinal é comunicado por cor/contexto) */
  function moeda(v, opts) {
    const o = opts || {};
    const n = numero(v);
    const fmt = o.inteiro ? moedaInteiraFmt : moedaFmt;
    const txt = fmt.format(o.comSinal ? n : Math.abs(n)).replace(/\u00a0/g, " ");
    return txt;
  }

  /** 0,91% */
  function percentual(v) {
    return pctFmt.format(Math.abs(numero(v))) + "%";
  }

  /** "2026-10-02" → Date local (sem fuso) */
  function parseData(iso) {
    if (iso instanceof Date) return iso;
    if (!iso || typeof iso !== "string") return null;
    const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }

  function iso(d) {
    const p = (n) => String(n).padStart(2, "0");
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  }

  const dd = (d) => String(d.getDate()).padStart(2, "0");

  /** 02 Outubro 2026 */
  function dataExtenso(v) {
    const d = parseData(v);
    if (!d) return "";
    return dd(d) + " " + MESES[d.getMonth()] + " " + d.getFullYear();
  }

  /** 02 Out */
  function dataCurta(v) {
    const d = parseData(v);
    if (!d) return "";
    return dd(d) + " " + MESES_ABREV[d.getMonth()];
  }

  /** Outubro 2026 */
  function mesAno(v) {
    const d = parseData(v);
    if (!d) return "";
    return MESES[d.getMonth()] + " " + d.getFullYear();
  }

  function mesAbrev(indice) { return MESES_ABREV[indice] || ""; }
  function mesNome(indice) { return MESES[indice] || ""; }

  /**
   * Converte texto digitado em número: "1.234,56" · "1234,56" · "1234.56" · "1.234" (milhar) · "-12,5".
   * O texto inteiro precisa ser um valor: "123abc" e "1,2,3" são recusados (NaN), nunca lidos pela metade.
   */
  function parseMoeda(txt) {
    if (typeof txt === "number") return Number.isFinite(txt) ? txt : NaN;
    if (!txt) return NaN;
    let t = String(txt).trim().replace(/[R$\s\u00a0]/g, "").replace(/\u2212/g, "-");
    if (/^[+-]?\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) t = t.replace(/\./g, "").replace(",", ".");   // 1.234,56 · 1.234
    else if (/^[+-]?\d+,\d+$/.test(t)) t = t.replace(",", ".");                                       // 1234,56
    else if (!/^[+-]?(\d+(\.\d+)?|\.\d+)$/.test(t)) return NaN;                                       // 1234.56 · 12
    const n = Number(t);
    return Number.isFinite(n) ? n : NaN;
  }

  /** Valor para edição em campo: 1234.5 → "1234,50" */
  function moedaEditavel(v) {
    const n = numero(v);
    return Math.abs(n).toFixed(2).replace(".", ",");
  }

  /**
   * Cor vinda dos dados do usuário: aceita somente #RGB, #RRGGBB ou #RRGGBBAA.
   * Qualquer outro texto é descartado para não ser interpretado como CSS.
   */
  function cor(v, padrao) {
    return typeof v === "string" && /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(v.trim()) ? v.trim() : (padrao === undefined ? null : padrao);
  }

  /** Dias da semana (forma curta) */
  const DIAS_SEMANA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
  const diaSemana = (d) => DIAS_SEMANA[d.getDay()];

  /** Título do dia nas listas de lançamentos: Hoje · Ontem · "Domingo, 4 Outubro" */
  function rotuloDia(dataIso) {
    const agora = new Date();
    const ontem = new Date(agora); ontem.setDate(agora.getDate() - 1);
    if (dataIso === iso(agora)) return "Hoje";
    if (dataIso === iso(ontem)) return "Ontem";
    const d = parseData(dataIso);
    return d ? diaSemana(d) + ", " + d.getDate() + " " + MESES[d.getMonth()] : "";
  }

  ZoZo.format = {
    diaSemana, rotuloDia, cor, moeda, percentual, parseData, iso, dataExtenso, dataCurta, mesAno, mesAbrev, mesNome, parseMoeda, moedaEditavel, numero, MESES, MESES_ABREV };
})(window.ZoZo);
