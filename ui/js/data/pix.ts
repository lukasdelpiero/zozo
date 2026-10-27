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
  // CPF: só pontuação de formatação é removida ("12a3" não vira "123"). CNPJ e chave aleatória: sem suporte por enquanto.
  const semFormatacao = (t: unknown): string => String(t || "").replace(/[\s.\-/]/g, "");
  function cpfValido(c: string): boolean {
    if (!/^\d{11}$/.test(c) || /^(\d)\1{10}$/.test(c)) return false;
    const dv = (n: number) => { let s = 0; for (let i = 0; i < n; i++) s += Number(c[i]) * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
    return dv(9) === Number(c[9]) && dv(10) === Number(c[10]);
  }
  // E-mail no formato aceito pelo DICT: só ASCII, até 77 caracteres
  const EMAIL_DICT = /^[a-z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

  /** DDDs válidos no Brasil (Anatel) */
  const DDDS = new Set([11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35, 37, 38, 41, 42, 43, 44, 45, 46,
    47, 48, 49, 51, 53, 54, 55, 61, 62, 63, 64, 65, 66, 67, 68, 69, 71, 73, 74, 75, 77, 79, 81, 82, 83, 84, 85, 86, 87, 88, 89,
    91, 92, 93, 94, 95, 96, 97, 98, 99]);
  /** Celular brasileiro: 11 dígitos = DDD do Brasil + 9 + 8 dígitos */
  function celularValido(d: string): boolean {
    return /^\d{11}$/.test(d) && DDDS.has(Number(d.slice(0, 2))) && d[2] === "9";
  }
  /** Nome do recebedor: só letras (com acento) e espaços simples entre as palavras */
  function nomeValido(t: unknown): boolean {
    const s = String(t || "").trim();
    return s.length > 0 && s.length <= 25 && /^\p{L}+( \p{L}+)*$/u.test(s);
  }

  /**
   * Chave aceita: CPF (11 dígitos com dígitos verificadores corretos), celular (+55 + DDD do Brasil + 9…)
   * ou e-mail. CNPJ e chave aleatória: sem suporte por enquanto. Devolve no formato do DICT, ou null.
   */
  function normalizarChave(texto: unknown): string | null {
    const t = String(texto || "").trim();
    if (!t) return null;
    if (t.includes("@")) { const e = t.toLowerCase(); return e.length <= 77 && EMAIL_DICT.test(e) ? e : null; }
    if (t.startsWith("+")) {                                                                                          // celular +55
      const tel = t.replace(/[\s()\-]/g, "");
      return /^\+55\d{11}$/.test(tel) && celularValido(tel.slice(3)) ? tel : null;
    }
    const d = semFormatacao(t);
    if (/^\d{11}$/.test(d) && cpfValido(d)) return d;
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

  const api: ZoZoPix = { payload, normalizarChave, novoTxid, crc16, cpfValido, celularValido, nomeValido };
  ZoZo.pix = api;
})(window.ZoZo);
