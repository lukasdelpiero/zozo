/* =============================================================
   ZoZo — HOST SIMULADO (somente desenvolvimento)
   ------------------------------------------------------------
   Faz no navegador o papel do host web (bridge/host-web.js + API):
   sessão, contas de acesso e armazenamento do documento do usuário.
   As regras de dados NÃO estão aqui: ficam em js/data/servico.js,
   o mesmo código usado na versão publicada.

   Atenção: tudo fica no localStorage, SEM criptografia e SEM
   servidor. Serve apenas para testar a interface; a pasta mock é
   removida na publicação (api/montar_interface.py).

   Conta de prévia: definida em mock/credenciais.local.js (arquivo seu,
   fora do git — veja o LEIA-ME). Sem ele, não há conta pronta.
   O 2FA aqui é TOTP de verdade (funciona com o aplicativo autenticador).
   ============================================================= */
(function (ZoZo) {
  "use strict";
  const M = ZoZo.messages;
  const USERS_KEY = "zozo.mock.users";
  const DATA_KEY = "zozo.mock.data.";
  const SESSION_KEY = "zozo.mock.session";
  const CRED = window.ZOZO_DEMO || {};
  const DEMO = { nomeUsuario: String(CRED.nome || "Prévia"), email: String(CRED.email || "").trim().toLowerCase(), senha: String(CRED.senha || "") };
  const temDemo = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(DEMO.email) && DEMO.senha.length >= 8;

  const delay = (ms) => new Promise((r) => setTimeout(r, ms === undefined ? 120 + Math.random() * 180 : ms));

  /* ---------- armazenamento ---------- */
  const ls = {
    get(k, padrao) { try { const v = localStorage.getItem(k); return v === null ? padrao : JSON.parse(v); } catch (e) { return padrao; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* ok */ } },
  };
  let sessao = null;
  function getSessao() {
    if (sessao) return sessao;
    try { sessao = sessionStorage.getItem(SESSION_KEY); } catch (e) { sessao = null; }
    return sessao;
  }
  function setSessao(id) {
    sessao = id;
    try { if (id) sessionStorage.setItem(SESSION_KEY, id); else sessionStorage.removeItem(SESSION_KEY); } catch (e) { /* ok */ }
  }
  const usuarios = () => ls.get(USERS_KEY, []);
  const salvarUsuarios = (u) => ls.set(USERS_KEY, u);

  /* ---------- senha: PBKDF2 + salt ---------- */
  const toHex = (buf) => Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
  function salt() { const a = new Uint8Array(16); crypto.getRandomValues(a); return toHex(a); }
  async function derivar(senha, s) {
    if (window.crypto && crypto.subtle) {
      const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(senha), "PBKDF2", false, ["deriveBits"]);
      const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: new TextEncoder().encode(s), iterations: 120000 }, key, 256);
      return toHex(bits);
    }
    let h = 2166136261; const t = s + ":" + senha;
    for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); }
    return "dev-" + (h >>> 0).toString(16);
  }
  async function conferir(u, senha) { return !!u && !!senha && (await derivar(senha, u.salt)) === u.hash; }

  /** Conta de prévia: criada (ou atualizada, se o arquivo de credenciais mudou) uma vez por carregamento */
  let demoPronta = null;
  function garantirDemo() {
    if (!demoPronta) demoPronta = (async () => {
      if (!temDemo) return;
      const lista = usuarios();
      const u = lista.find((x) => x.id === "u-demo");
      if (u && u.email === DEMO.email && (await conferir(u, DEMO.senha))) return;
      const s = salt();
      const novo = { id: "u-demo", nome: u ? u.nome : DEMO.nomeUsuario, email: DEMO.email, salt: s, hash: await derivar(DEMO.senha, s) };
      salvarUsuarios(lista.filter((x) => x.id !== "u-demo" && x.email !== DEMO.email).concat(novo));
    })();
    return demoPronta;
  }

  /* ---------- 2FA (TOTP RFC 6238 com WebCrypto) ---------- */
  const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  function base32(bytes) { let bits = "", out = ""; bytes.forEach((b) => { bits += b.toString(2).padStart(8, "0"); }); for (let i = 0; i + 5 <= bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5), 2)]; return out; }
  function deBase32(txt) { let bits = ""; for (const c of txt) bits += B32.indexOf(c).toString(2).padStart(5, "0"); const out = []; for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2)); return new Uint8Array(out); }
  async function codigoTotp(chaveB32, passo) {
    const k = await crypto.subtle.importKey("raw", deBase32(chaveB32), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
    const msg = new Uint8Array(8); let p = passo; for (let i = 7; i >= 0; i--) { msg[i] = p & 0xff; p = Math.floor(p / 256); }
    const mac = new Uint8Array(await crypto.subtle.sign("HMAC", k, msg));
    const o = mac[19] & 15;
    const n = ((mac[o] & 0x7f) << 24 | mac[o + 1] << 16 | mac[o + 2] << 8 | mac[o + 3]) % 1000000;
    return String(n).padStart(6, "0");
  }
  async function conferirTotp(chaveB32, codigo) {
    const atual = Math.floor(Date.now() / 30000);
    for (const d of [-1, 0, 1]) if ((await codigoTotp(chaveB32, atual + d)) === String(codigo)) return true;
    return false;
  }
  let pendente2FA = null;   // login: senha certa, falta o código

  /* ---------- tentativas de login (regra simplificada; o bloqueio real é o do servidor) ---------- */
  const falhas = {};
  function bloqueado(email) {
    const f = falhas[email];
    return !!f && f.n >= 5 && Date.now() - f.t < 60000;
  }
  function registrarFalha(email) {
    const f = falhas[email] || { n: 0, t: 0 };
    if (Date.now() - f.t > 60000) f.n = 0;
    f.n += 1; f.t = Date.now(); falhas[email] = f;
  }

  const sessaoPublica = (u) => (u ? { authenticated: true, user: { nomeUsuario: u.nome, email: u.email, doisFatores: !!u.totp } } : { authenticated: false });
  const atual = () => { const id = getSessao(); return id ? usuarios().find((u) => u.id === id) : null; };
  const emailOk = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

  async function route(req) {
    const A = M.ACTIONS;
    const d = req.data || {};
    await garantirDemo();

    switch (req.action) {
      case A.getArmazenamento: return { available: true, turnstile: null };
      case A.getSession: return sessaoPublica(atual());

      case A.registerUser: {
        const email = String(d.email || "").trim().toLowerCase();
        const nome = String(d.nomeUsuario || "").trim();
        if (!nome || !emailOk(email)) throw { code: "REGISTER_FAILED" };
        if (!d.senha || d.senha.length < 8) throw { code: "WEAK_PASSWORD" };
        const lista = usuarios();
        if (lista.some((u) => u.email === email)) throw { code: "EMAIL_IN_USE" };
        const s = salt();
        const u = { id: "u-" + Date.now().toString(36), nome, email, salt: s, hash: await derivar(d.senha, s) };
        lista.push(u); salvarUsuarios(lista); setSessao(u.id);
        return sessaoPublica(u);
      }

      case A.login: {
        const email = String(d.email || "").trim().toLowerCase();
        if (bloqueado(email)) throw { code: "TOO_MANY_ATTEMPTS" };
        const u = usuarios().find((x) => x.email === email);
        if (!(await conferir(u, d.senha))) { registrarFalha(email); throw { code: "INVALID_CREDENTIALS" }; }
        delete falhas[email];
        if (u.totp) { pendente2FA = u.id; return { doisFatores: true }; }
        setSessao(u.id);
        return sessaoPublica(u);
      }

      case A.verificar2FA: {
        const u = usuarios().find((x) => x.id === pendente2FA);
        if (!u) throw { code: "SESSION_EXPIRED" };
        if (!(await conferirTotp(u.totp, d.codigo))) throw { code: "CODE_INVALID" };
        pendente2FA = null; setSessao(u.id);
        return sessaoPublica(u);
      }

      case A.logout: setSessao(null); pendente2FA = null; return { authenticated: false };
    }

    // Daqui em diante: exige sessão
    const u = atual();
    if (!u) throw { code: "NOT_AUTHENTICATED" };

    switch (req.action) {
      case A.loadUserData: {
        let doc = ls.get(DATA_KEY + u.id, null);
        // Dados de exemplo só na primeira vez (depois de "Apagar dados" a conta fica vazia)
        if (!doc && u.id === "u-demo" && !ls.get(DATA_KEY + u.id + ".apagado", false)) { doc = ZoZo.mock.buildDocumento(new Date()); ls.set(DATA_KEY + u.id, doc); }
        return { documento: doc };
      }
      case A.saveUserData:
        if (!ls.set(DATA_KEY + u.id, d.documento)) throw { code: "STORAGE_UNAVAILABLE" };
        return { salvo: true };

      case A.updateUser: {
        if (!(await conferir(u, d.senhaAtual))) throw { code: "WRONG_PASSWORD" };
        const nome = String(d.nomeUsuario || "").trim();
        const email = String(d.email || "").trim().toLowerCase();
        if (!nome || !emailOk(email)) throw { code: "OPERATION_FAILED" };
        const lista = usuarios();
        if (lista.some((x) => x.email === email && x.id !== u.id)) throw { code: "EMAIL_IN_USE" };
        const alvo = lista.find((x) => x.id === u.id);
        alvo.nome = nome; alvo.email = email;
        salvarUsuarios(lista);
        return sessaoPublica(alvo);
      }
      case A.changePassword: {
        if (!(await conferir(u, d.senhaAtual))) throw { code: "WRONG_PASSWORD" };
        if (!d.novaSenha || d.novaSenha.length < 8) throw { code: "WEAK_PASSWORD" };
        const lista = usuarios();
        const alvo = lista.find((x) => x.id === u.id);
        alvo.salt = salt(); alvo.hash = await derivar(d.novaSenha, alvo.salt);
        salvarUsuarios(lista);
        return { alterada: true };
      }
      case A.iniciar2FA: {
        if (u.totp) throw { code: "2FA_ALREADY_ON" };
        const chave = base32(crypto.getRandomValues(new Uint8Array(20)));
        const lista = usuarios(); lista.find((x) => x.id === u.id).totpPendente = chave; salvarUsuarios(lista);
        return { chave, uri: "otpauth://totp/ZoZo:" + encodeURIComponent(u.email) + "?secret=" + chave + "&issuer=ZoZo&algorithm=SHA1&digits=6&period=30" };
      }
      case A.confirmar2FA: {
        if (!u.totpPendente) throw { code: "2FA_NOT_PENDING" };
        if (!(await conferirTotp(u.totpPendente, d.codigo))) throw { code: "CODE_INVALID" };
        const lista = usuarios(); const alvo = lista.find((x) => x.id === u.id);
        alvo.totp = alvo.totpPendente; delete alvo.totpPendente; salvarUsuarios(lista);
        return sessaoPublica(alvo);
      }
      case A.desativar2FA: {
        const lista = usuarios(); const alvo = lista.find((x) => x.id === u.id);
        delete alvo.totp; delete alvo.totpPendente; salvarUsuarios(lista);
        return sessaoPublica(alvo);
      }
      case A.wipeUserData:
        if (!(await conferir(u, d.senha))) throw { code: "WRONG_PASSWORD" };
        ls.del(DATA_KEY + u.id);
        ls.set(DATA_KEY + u.id + ".apagado", true);
        return { apagado: true };
      case A.deleteUser:
        if (!(await conferir(u, d.senha))) throw { code: "WRONG_PASSWORD" };
        ls.del(DATA_KEY + u.id);
        ls.del(DATA_KEY + u.id + ".apagado");
        salvarUsuarios(usuarios().filter((x) => x.id !== u.id));
        setSessao(null);
        return { authenticated: false };
    }
    throw { code: "NOT_IMPLEMENTED" };
  }

  async function handle(req) {
    await delay(req.action === M.ACTIONS.saveUserData ? 40 : undefined);
    try { return M.okResponse(req, await route(req)); }
    catch (e) { return M.errorResponse(req, (e && e.code) || "UNKNOWN_ERROR"); }
  }

  ZoZo.mock = ZoZo.mock || {};
  ZoZo.mock.host = { handle, temDemo };
})(window.ZoZo);
