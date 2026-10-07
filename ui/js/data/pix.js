/* =============================================================
   ZoZo — Pix "copia e cola" / QR code (BR Code do Banco Central)
   ------------------------------------------------------------
   Segue o Manual de Padrões para Iniciação do Pix (BACEN), formato
   EMV® QRCPS-MPM: QR estático com valor e TxID. É o modelo gratuito
   (não depende de contrato com banco/PSP) e lido por qualquer app.
   • Cada boleto gera um TxID aleatório novo (25 caracteres): o código
     nunca se repete, mesmo com o mesmo perfil, período e valor.
   • A chave e o nome ficam no documento CIFRADO do usuário
     (Configurações › Geral › Pix), nunca no código do site.
   ============================================================= */
(function (ZoZo) {
  "use strict";

  /* ---------------- chave Pix ---------------- */
  const soDigitos = (t) => String(t || "").replace(/\D/g, "");
  function cpfValido(c) {
    if (!/^\d{11}$/.test(c) || /^(\d)\1{10}$/.test(c)) return false;
    const dv = (n) => { let s = 0; for (let i = 0; i < n; i++) s += Number(c[i]) * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
    return dv(9) === Number(c[9]) && dv(10) === Number(c[10]);
  }
  function cnpjValido(c) {
    if (!/^\d{14}$/.test(c) || /^(\d)\1{13}$/.test(c)) return false;
    const dv = (n) => { const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]; let s = 0; for (let i = 0; i < n; i++) s += Number(c[i]) * pesos[i]; const r = s % 11; return r < 2 ? 0 : 11 - r; };
    return dv(12) === Number(c[12]) && dv(13) === Number(c[13]);
  }

  /** Normaliza a chave no formato do DICT (CPF/CNPJ só dígitos, celular +55…, e-mail minúsculo, aleatória). null se inválida. */
  function normalizarChave(texto) {
    const t = String(texto || "").trim();
    if (!t) return null;
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t)) return t.toLowerCase();       // aleatória (EVP)
    if (t.includes("@")) return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t) && t.length <= 77 ? t.toLowerCase() : null;
    const d = soDigitos(t);
    if (t.trim().startsWith("+")) return /^\+55\d{10,11}$/.test("+" + d) ? "+" + d : null;                       // celular
    if (cpfValido(d)) return d;
    if (cnpjValido(d)) return d;
    if (/^\d{10,11}$/.test(d) && /^\(?\d{2}\)?\s?9?\d{4}-?\d{4}$/.test(t)) return "+55" + d;                        // celular sem +55
    return null;
  }

  /* ---------------- BR Code ---------------- */
  const campo = (id, valor) => id + String(valor.length).padStart(2, "0") + valor;
  /** Texto em maiúsculas sem acentos e só com caracteres aceitos (nome/cidade do recebedor) */
  const limpo = (t, max) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9 ]/g, " ").replace(/\s+/g, " ").trim().toUpperCase().slice(0, max);

  function crc16(texto) {                         // CRC-16/CCITT-FALSE (polinômio 0x1021, início 0xFFFF)
    let crc = 0xffff;
    for (let i = 0; i < texto.length; i++) {
      crc ^= texto.charCodeAt(i) << 8;
      for (let b = 0; b < 8; b++) crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
    return crc.toString(16).toUpperCase().padStart(4, "0");
  }

  /** TxID imprevisível de 25 caracteres [A-Za-z0-9] (máximo permitido no QR estático) */
  function novoTxid() {
    const abc = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    const r = crypto.getRandomValues(new Uint8Array(25));
    return Array.from(r, (n) => abc[n % 62]).join("");
  }

  /**
   * Código "Pix copia e cola" (também é o conteúdo do QR code).
   * cfg: { chave, nome, cidade, valor, txid }  → string, ou null se dados inválidos.
   */
  function payload(cfg) {
    const chave = normalizarChave(cfg.chave);
    const nome = limpo(cfg.nome, 25), cidade = limpo(cfg.cidade || "BRASIL", 15);
    const valor = Number(cfg.valor);
    const txid = /^[A-Za-z0-9]{1,25}$/.test(cfg.txid || "") ? cfg.txid : novoTxid();
    if (!chave || !nome || !cidade || !(valor > 0) || valor > 9999999999.99) return null;
    const conta = campo("00", "br.gov.bcb.pix") + campo("01", chave);
    const corpo = campo("00", "01") + campo("26", conta) + campo("52", "0000") + campo("53", "986")
      + campo("54", valor.toFixed(2)) + campo("58", "BR") + campo("59", nome) + campo("60", cidade)
      + campo("62", campo("05", txid)) + "6304";
    return corpo + crc16(corpo);
  }

  ZoZo.pix = { payload, normalizarChave, novoTxid, crc16, cpfValido };
})(window.ZoZo);
