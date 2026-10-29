/* =============================================================
   ZoZo — Importar transações de um arquivo do banco (CSV ou OFX)
   ------------------------------------------------------------
   Lido AQUI, no navegador: o arquivo nunca sai do aparelho (nem para o servidor, nem para o Zo).
   Devolve as linhas com data, descrição e valor COM SINAL, como vieram; quem decide o tipo (compra,
   estorno, débito, receita) é a tela de conferência, e quem grava é o serviço (importarLancamentos).
     • OFX: blocos <STMTTRN> (DTPOSTED, TRNAMT, MEMO/NAME), com ou sem as tags de fechamento;
     • CSV: separador ; , ou tab; com cabeçalho (data, descrição/título/histórico, valor/amount) ou sem
       (as colunas são reconhecidas pelo conteúdo); datas 29/10/2026, 29/10/26, 2026-10-29; valores
       "1.234,56", "1,234.56", "R$ -12,50", "(12,50)".
   TypeScript: tipos em src/globais.d.ts (ZoZoImportar).
   ============================================================= */
(function (ZoZo: ZoZoGlobal) {
  "use strict";
  const MAX_LINHAS = 2000;

  const pad = (n: number) => String(n).padStart(2, "0");
  /** Data do banco → "AAAA-MM-DD" (null se não for uma data válida) */
  function data(bruto: string): string | null {
    const t = bruto.trim();
    let a: number, m: number, d: number;
    let x = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
    if (x) { a = +x[1]; m = +x[2]; d = +x[3]; }
    else if ((x = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(t))) { d = +x[1]; m = +x[2]; a = +x[3]; if (a < 100) a += 2000; }
    else if ((x = /^(\d{4})(\d{2})(\d{2})/.exec(t))) { a = +x[1]; m = +x[2]; d = +x[3]; }          // OFX: 20261029120000[-3:BRT]
    else return null;
    const dt = new Date(a, m - 1, d);
    if (dt.getFullYear() !== a || dt.getMonth() !== m - 1 || dt.getDate() !== d || a < 2000 || a > 2100) return null;
    return a + "-" + pad(m) + "-" + pad(d);
  }
  /** Valor do banco → número com sinal (null se não for um valor) */
  function valor(bruto: string): number | null {
    let t = bruto.trim().replace(/\s/g, "").replace(/^R\$|^\$|R\$$/i, "").replace(/R\$/i, "");
    let neg = false;
    if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1); }
    if (t.endsWith("-")) { neg = !neg; t = t.slice(0, -1); }
    if (t.startsWith("-")) { neg = !neg; t = t.slice(1); } else if (t.startsWith("+")) t = t.slice(1);
    if (!/^[\d.,]+$/.test(t) || !/\d/.test(t)) return null;
    const ponto = t.lastIndexOf("."), virgula = t.lastIndexOf(",");
    if (ponto >= 0 && virgula >= 0) t = ponto > virgula ? t.replace(/,/g, "") : t.replace(/\./g, "").replace(",", ".");
    else if (virgula >= 0) t = (t.match(/,/g) || []).length > 1 ? t.replace(/,/g, "") : t.replace(",", ".");
    else if (ponto >= 0 && (t.match(/\./g) || []).length === 1 && t.length - ponto - 1 === 3 && t.length > 4) t = t.replace(".", "");  // 1.234 = mil
    else if ((t.match(/\./g) || []).length > 1) t = t.replace(/\./g, "");
    const n = Number(t);
    if (!Number.isFinite(n) || Math.abs(n) > 1e12) return null;
    return Math.round((neg ? -n : n) * 100) / 100;
  }
  const limpar = (t: string) => t.replace(/\s+/g, " ").trim().slice(0, 50);

  /* ---------------- OFX ---------------- */
  function lerOfx(texto: string): ResultadoImportacao {
    const itens: LinhaImportada[] = [], avisos: string[] = [];
    const campo = (bloco: string, tag: string) => { const m = new RegExp("<" + tag + ">([^<\\r\\n]*)", "i").exec(bloco); return m ? m[1].trim() : ""; };
    const blocos = texto.split(/<STMTTRN>/i).slice(1);
    blocos.slice(0, MAX_LINHAS).forEach((b) => {
      const bloco = b.split(/<\/STMTTRN>/i)[0];
      const d = data(campo(bloco, "DTPOSTED")), v = valor(campo(bloco, "TRNAMT"));
      const descricao = limpar(campo(bloco, "MEMO") || campo(bloco, "NAME"));
      if (!d || v === null || !v || !descricao) { avisos.push("linha"); return; }
      itens.push({ data: d, descricao, valor: v });
    });
    if (blocos.length > MAX_LINHAS) avisos.push("limite");
    return { formato: "ofx", cartao: /<CCSTMTRS>|CREDITCARDMSGSRS/i.test(texto), itens, ignoradas: avisos.filter((a) => a === "linha").length };
  }

  /* ---------------- CSV ---------------- */
  function linhasCsv(texto: string, sep: string): string[][] {
    const linhas: string[][] = [];
    let campo = "", linha: string[] = [], aspas = false;
    for (let i = 0; i < texto.length && linhas.length <= MAX_LINHAS; i += 1) {
      const c = texto[i];
      if (aspas) {
        if (c === '"' && texto[i + 1] === '"') { campo += '"'; i += 1; } else if (c === '"') aspas = false; else campo += c;
      } else if (c === '"') aspas = true;
      else if (c === sep) { linha.push(campo); campo = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && texto[i + 1] === "\n") i += 1;
        linha.push(campo); campo = "";
        if (linha.some((x) => x.trim())) linhas.push(linha);
        linha = [];
      } else campo += c;
    }
    linha.push(campo);
    if (linha.some((x) => x.trim())) linhas.push(linha);
    return linhas;
  }
  const norm = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  const NOMES = {
    data: ["data", "date", "dt", "data lancamento", "data do lancamento", "data da compra", "data compra", "data movimento"],
    descricao: ["descricao", "title", "titulo", "historico", "estabelecimento", "lancamento", "memo", "nome", "description", "detalhe", "detalhes"],
    valor: ["valor", "amount", "valor (r$)", "valor r$", "valor em r$", "quantia", "valor real", "valor (brl)"],
  };
  function lerCsv(texto: string): ResultadoImportacao {
    const primeira = texto.split(/\r?\n/).find((l) => l.trim()) || "";
    const sep = [";", "\t", ","].sort((a, b) => primeira.split(b).length - primeira.split(a).length)[0];
    const linhas = linhasCsv(texto, sep);
    if (!linhas.length) return { formato: "csv", cartao: false, itens: [], ignoradas: 0 };
    const cab = linhas[0].map(norm);
    const achar = (nomes: string[]) => cab.findIndex((c) => nomes.includes(c));
    let col = { data: achar(NOMES.data), descricao: achar(NOMES.descricao), valor: achar(NOMES.valor) };
    let corpo = linhas.slice(1);
    if (col.data < 0 || col.valor < 0) {
      // sem cabeçalho conhecido: as colunas são reconhecidas pelo conteúdo das primeiras linhas
      const amostra = linhas.slice(0, 20), n = Math.max(...amostra.map((l) => l.length));
      const taxa = (i: number, f: (s: string) => unknown) => amostra.filter((l) => l[i] !== undefined && f(l[i]) !== null).length;
      const idx = Array.from({ length: n }, (_, i) => i);
      const cData = idx.sort((a, b) => taxa(b, data) - taxa(a, data))[0];
      const cValor = idx.filter((i) => i !== cData).sort((a, b) => taxa(b, valor) - taxa(a, valor))[0];
      const cDesc = idx.filter((i) => i !== cData && i !== cValor).sort((a, b) => amostra.reduce((s, l) => s + (l[b] || "").length, 0) - amostra.reduce((s, l) => s + (l[a] || "").length, 0))[0];
      col = { data: cData, descricao: cDesc === undefined ? -1 : cDesc, valor: cValor };
      corpo = data(linhas[0][cData] || "") ? linhas : linhas.slice(1);       // a 1ª linha é dado, não cabeçalho
    }
    const itens: LinhaImportada[] = [];
    let ignoradas = 0;
    corpo.slice(0, MAX_LINHAS).forEach((l) => {
      const d = data(l[col.data] || ""), v = valor(l[col.valor] || ""), descricao = limpar(col.descricao >= 0 ? l[col.descricao] || "" : "");
      if (!d || v === null || !v || !descricao) { ignoradas += 1; return; }
      itens.push({ data: d, descricao, valor: v });
    });
    return { formato: "csv", cartao: false, itens, ignoradas };
  }

  /** Texto do arquivo → linhas. Arquivo que não é CSV nem OFX: nenhuma linha. */
  function ler(texto: string): ResultadoImportacao {
    const t = texto.replace(/^﻿/, "");
    return /<OFX>|OFXHEADER|<STMTTRN>/i.test(t) ? lerOfx(t) : lerCsv(t);
  }
  /** Bytes → texto: UTF-8; se tiver caractere inválido, Windows-1252 (o padrão de muitos bancos) */
  function decodificar(bytes: ArrayBuffer): string {
    const utf8 = new TextDecoder("utf-8").decode(bytes);
    return utf8.includes("�") ? new TextDecoder("windows-1252").decode(bytes) : utf8;
  }

  const api: ZoZoImportar = { ler, decodificar, data, valor };
  ZoZo.importar = api;
})(window.ZoZo);
