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
   ============================================================= */
(function (ZoZo) {
  "use strict";
  const M = ZoZo.messages;
  const USERS_KEY = "zozo.mock.users";
  const DATA_KEY = "zozo.mock.data.";
  const SESSION_KEY = "zozo.mock.session";
  const DEMO = { nomeUsuario: "Ana", email: "demo@zozo.app", senha: "zozo1234" };

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

  async function garantirDemo() {
    const lista = usuarios();
    if (lista.some((u) => u.email === DEMO.email)) return;
    const s = salt();
    lista.push({ id: "u-demo", nome: DEMO.nomeUsuario, email: DEMO.email, salt: s, hash: await derivar(DEMO.senha, s) });
    salvarUsuarios(lista);
  }

  /* ---------- tentativas de login (mesma regra do host) ---------- */
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

  const sessaoPublica = (u) => (u ? { authenticated: true, user: { nomeUsuario: u.nome, email: u.email } } : { authenticated: false });
  const atual = () => { const id = getSessao(); return id ? usuarios().find((u) => u.id === id) : null; };
  const emailOk = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

  async function route(req) {
    const A = M.ACTIONS;
    const d = req.data || {};
    await garantirDemo();

    switch (req.action) {
      case A.getArmazenamento: return { available: true };
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
        setSessao(u.id);
        return sessaoPublica(u);
      }

      case A.logout: setSessao(null); return { authenticated: false };
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
  ZoZo.mock.host = { handle, demo: { email: DEMO.email, senha: DEMO.senha } };
})(window.ZoZo);
