/* =============================================================
   ZoZo — Pix "copia e cola" / QR code (BR Code do Banco Central)
   ------------------------------------------------------------
   Segue o Manual de Padrões para Iniciação do Pix (BACEN), formato
   EMV® QRCPS-MPM: QR estático com valor e TxID. É o modelo gratuito
   (não depende de contrato com banco/PSP) e lido por qualquer app.
   • Cada fatura gera um TxID aleatório novo (25 caracteres de 62
     símbolos): a chance de repetir é desprezível (não há registro
     central que garanta unicidade).
   • Só caracteres ASCII entram no código (a chave é validada pelo
     formato do DICT): tamanho dos campos e CRC ficam corretos.
   • A chave e o nome ficam no documento CIFRADO do usuário
     (Configurações › Geral › Pix), nunca no código do site.
   TypeScript: tipos da API em src/globais.d.ts (ZoZoPix).
   ============================================================= */
(function (ZoZo: ZoZoGlobal) {
  "use strict";

  /* ---------------- chave Pix (formatos do DICT/BACEN) ---------------- */
  // CPF: só pontuação de formatação é removida ("12a3" não vira "123"). CNPJ: sem suporte por enquanto.
  const semFormatacao = (t: unknown): string => String(t || "").replace(/[\s.\-/]/g, "");
  function cpfValido(c: string): boolean {
    if (!/^\d{11}$/.test(c) || /^(\d)\1{10}$/.test(c)) return false;
    const dv = (n: number) => { let s = 0; for (let i = 0; i < n; i++) s += Number(c[i]) * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
    return dv(9) === Number(c[9]) && dv(10) === Number(c[10]);
  }
  /** CNPJ numérico ou alfanumérico (só para RECUSAR: chave CNPJ ainda não é aceita) */
  function cnpjValido(c: string): boolean {
    if (!/^[0-9A-Z]{12}\d{2}$/.test(c) || /^(\d)\1{13}$/.test(c)) return false;
    const v = (ch: string) => ch.charCodeAt(0) - 48;
    const dv = (n: number) => { const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]; let s = 0; for (let i = 0; i < n; i++) s += v(c[i]) * pesos[i]; const r = s % 11; return r < 2 ? 0 : 11 - r; };
    return dv(12) === Number(c[12]) && dv(13) === Number(c[13]);
  }
  // E-mail no formato aceito pelo DICT: só ASCII, até 77 caracteres
  const EMAIL_DICT = /^[a-z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

  /** Normaliza a chave no formato do DICT (CPF só dígitos, celular +55…, e-mail minúsculo, aleatória). CNPJ → null. null se inválida. */
  function normalizarChave(texto: unknown): string | null {
    const t = String(texto || "").trim();
    if (!t) return null;
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t)) return t.toLowerCase();       // aleatória (EVP)
    if (t.includes("@")) { const e = t.toLowerCase(); return e.length <= 77 && EMAIL_DICT.test(e) ? e : null; }
    if (t.startsWith("+")) {                                                                                          // celular +55
      const tel = t.replace(/[\s()\-]/g, "");
      return /^\+55\d{10,11}$/.test(tel) ? tel : null;
    }
    const d = semFormatacao(t).toUpperCase();
    if (/^\d{11}$/.test(d) && cpfValido(d)) return d;
    if (cnpjValido(d)) return null;                                                                                     // CNPJ: sem suporte por enquanto
    if (/^\(?\d{2}\)?\s?9?\d{4}-?\d{4}$/.test(t)) return "+55" + t.replace(/\D/g, "");                                   // celular sem +55
    return null;
  }

  /* ---------------- BR Code ---------------- */
  const campo = (id: string, valor: string): string => id + String(valor.length).padStart(2, "0") + valor;
  /** Texto em maiúsculas sem acentos e só com caracteres aceitos (nome/cidade do recebedor) */
  const limpo = (t: unknown, max: number): string => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9 ]/g, " ").replace(/\s+/g, " ").trim().toUpperCase().slice(0, max);

  function crc16(texto: string): string {                         // CRC-16/CCITT-FALSE (polinômio 0x1021, início 0xFFFF)
    let crc = 0xffff;
    for (let i = 0; i < texto.length; i++) {
      crc ^= texto.charCodeAt(i) << 8;
      for (let b = 0; b < 8; b++) crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
    return crc.toString(16).toUpperCase().padStart(4, "0");
  }

  /** TxID imprevisível de 25 caracteres [A-Za-z0-9] (máximo permitido no QR estático) */
  function novoTxid(): string {
    const abc = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    const r = crypto.getRandomValues(new Uint8Array(25));
    return Array.from(r, (n) => abc[n % 62]).join("");
  }

  /**
   * Código "Pix copia e cola" (também é o conteúdo do QR code).
   * cfg: { chave, nome, cidade, valor, txid }  → string, ou null se dados inválidos.
   */
  function payload(cfg: DadosPix): string | null {
    const chave = normalizarChave(cfg.chave);
    const nome = limpo(cfg.nome, 25), cidade = limpo(cfg.cidade || "BRASIL", 15);
    const centavos = Math.round(Number(cfg.valor) * 100);          // valor sempre em centavos inteiros
    const txid = cfg.txid && /^[A-Za-z0-9]{1,25}$/.test(cfg.txid) ? cfg.txid : novoTxid();
    if (!chave || !nome || !cidade || !Number.isSafeInteger(centavos) || centavos < 1 || centavos > 999999999999) return null;
    const valor = centavos / 100;
    const conta = campo("00", "br.gov.bcb.pix") + campo("01", chave);
    const corpo = campo("00", "01") + campo("26", conta) + campo("52", "0000") + campo("53", "986")
      + campo("54", valor.toFixed(2)) + campo("58", "BR") + campo("59", nome) + campo("60", cidade)
      + campo("62", campo("05", txid)) + "6304";
    if (/[^\x20-\x7E]/.test(corpo)) return null;                      // nunca gera código com caractere fora do ASCII
    return corpo + crc16(corpo);
  }

  const api: ZoZoPix = { payload, normalizarChave, novoTxid, crc16, cpfValido };
  ZoZo.pix = api;
})(window.ZoZo);
