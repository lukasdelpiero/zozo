/* =============================================================
   ZoZo — Host da versão web (conversa com a API Python no Cloudflare)
   ------------------------------------------------------------
   Criptografia de ponta a ponta: os dados são cifrados AQUI, no
   navegador. O servidor (API + banco SQL) só guarda blocos cifrados
   e nunca vê a senha nem os lançamentos.
     • senha → PBKDF2-SHA256 (600.000 iterações, sal de 16 bytes)
       → HKDF → duas chaves independentes:
         - chave dos dados: AES-256-GCM (cifra e autentica)
         - prova da senha: enviada à API no login e em cada acesso
           aos dados; o servidor guarda só o SHA-256 dela.
     • documento: JSON → gzip → AES-256-GCM, com e-mail e número da
       versão como dados autenticados (AAD): um bloco de outra conta
       ou de outra versão é recusado.
     • sessão: cookie HttpOnly do servidor (o JavaScript não o lê).
       Para não pedir a senha a cada recarga, a chave dos dados fica
       neste navegador CIFRADA com o "envelope" da sessão, que só o
       servidor entrega — e só enquanto o cookie existir. Fechou o
       navegador ou saiu: o cookie some, o envelope some no servidor
       e o que ficou guardado vira lixo ilegível (é apagado).
     • versão vista por último fica neste navegador: o servidor não
       consegue "voltar no tempo" sem que o usuário seja avisado.
   ============================================================= */
(function (ZoZo) {
  "use strict";
  const API = "/api";
  const ITERACOES = 600000;
  const ITERACOES_MAX = 10000000;
  const FORMATO = 2;                       // primeiro byte do documento cifrado
  const LIMITE_CONTEUDO = 1900000;         // mesmo limite da API (D1: ~2 MB por linha)
  const CHAVE_LOCAL = "zozo.sessao";       // chave dos dados, cifrada com o envelope da sessão
  const enc = new TextEncoder(), dec = new TextDecoder();

  let sessao = null;    // { email, nome, chave, prova, envelope, versao, doisFatores }
  let pendente = null;  // senha certa, falta o código do 2FA: { email, k }

  /* ---------------- utilitários ---------------- */
  function b64(bytes) {
    let s = "";
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function deB64(texto) {
    const bin = atob(texto);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  const hex = (buf) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
  const aleatorio = (n) => crypto.getRandomValues(new Uint8Array(n));
  const erro = (code, extra) => Object.assign(new Error(code), { code }, extra || {});
  const normalizarEmail = (e) => String(e || "").trim().toLowerCase();
  const normalizarSenha = (s) => String(s || "").normalize("NFC");
  const limparNome = (n) => String(n || "").replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g, "").trim().slice(0, 80);
  function validarSenha(s) { if (typeof s !== "string" || s.length < 8 || s.length > 256) throw erro("WEAK_PASSWORD"); }

  /** Encerra a sessão na interface. ACCESS_DENIED: o Cloudflare Access (ambiente de prévia) recusou. */
  function sessaoExpirada(codigo, manterChave) {
    const c = codigo || "SESSION_EXPIRED";
    sessao = null; pendente = null;
    if (!manterChave) esquecerChaveLocal();      // senha trocada em outra aba: a chave guardada já é a nova
    window.dispatchEvent(new CustomEvent("zozo:sessao-expirada", { detail: { codigo: c } }));
    return erro(c);
  }

  /* ---------------- API ---------------- */
  async function api(metodo, caminho, corpo, prova) {
    const headers = {};
    if (corpo !== undefined) headers["Content-Type"] = "application/json";
    if (prova) headers["X-ZoZo-Prova"] = prova;
    let r;
    try {
      r = await fetch(API + caminho, {
        method: metodo, credentials: "same-origin", cache: "no-store",
        redirect: "manual",                       // Access vencido (prévia) redireciona para o login dele
        headers, body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
      });
    } catch (e) { throw erro("STORAGE_UNAVAILABLE"); }
    if (r.type === "opaqueredirect") throw sessaoExpirada("ACCESS_DENIED");
    let dados = null;
    if (r.status !== 204) { try { dados = await r.json(); } catch (e) { dados = null; } }
    if (r.ok) return dados || {};
    const codigo = dados && dados.erro;
    const extra = { espera: dados && dados.espera, captcha: dados && dados.captcha };
    if (r.status === 401) {
      if (codigo === "INVALID_CREDENTIALS" || codigo === "CODE_INVALID") throw erro(codigo, extra);
      throw sessaoExpirada(codigo === "ACCESS_DENIED" ? "ACCESS_DENIED" : "SESSION_EXPIRED");
    }
    if (r.status === 404 && metodo === "GET") return null;
    if (r.status === 409) throw erro(["EMAIL_IN_USE", "2FA_ALREADY_ON", "2FA_NOT_PENDING"].includes(codigo) ? codigo : "DATA_CHANGED");
    if (r.status === 403 && (codigo === "WRONG_PASSWORD" || codigo === "REGISTER_FAILED")) throw erro(codigo);
    if (r.status === 403) throw erro("ACCESS_DENIED");                   // pedido recusado pela checagem de origem
    if (r.status === 428) throw erro("CAPTCHA_REQUIRED");
    if (r.status === 429) throw erro("TOO_MANY_ATTEMPTS", extra);
    if (r.status === 413) throw erro("DOCUMENT_TOO_LARGE");
    throw erro("STORAGE_UNAVAILABLE");
  }
  const parametros = (email) => api("GET", "/conta/parametros?email=" + encodeURIComponent(normalizarEmail(email)));

  /* ---------------- chaves ---------------- */
  async function derivar(senha, sal, iteracoes) {
    const base = await crypto.subtle.importKey("raw", enc.encode(normalizarSenha(senha)), "PBKDF2", false, ["deriveBits"]);
    const mestre = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: sal, iterations: iteracoes }, base, 256);
    const hk = await crypto.subtle.importKey("raw", mestre, "HKDF", false, ["deriveKey", "deriveBits"]);
    new Uint8Array(mestre).fill(0);
    const param = (uso) => ({ name: "HKDF", hash: "SHA-256", salt: new Uint8Array(32), info: enc.encode("zozo/" + uso + "/v2") });
    // Mesmos bytes que deriveKey(AES-GCM 256) produzia: documentos já gravados continuam abrindo
    const bits = new Uint8Array(await crypto.subtle.deriveBits(param("dados"), hk, 256));
    const chave = await crypto.subtle.importKey("raw", bits, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
    const prova = new Uint8Array(await crypto.subtle.deriveBits(param("prova"), hk, 256));
    const provaB64 = b64(prova);
    prova.fill(0);
    return { chave, bits, prova: provaB64 };
  }

  /** Deriva as chaves de uma conta. Recusa parâmetros fracos vindos do servidor (proteção contra rebaixamento). */
  async function derivarConta(senha, par) {
    if (!par) throw erro("STORAGE_UNAVAILABLE");
    const it = par.iteracoes;
    let sal;
    try { sal = deB64(String(par.sal || "")); } catch (e) { sal = new Uint8Array(0); }
    if (!Number.isInteger(it) || it < ITERACOES || it > ITERACOES_MAX || sal.length < 16 || sal.length > 64) throw erro("STORAGE_UNAVAILABLE");
    if (!senha) throw erro("WRONG_PASSWORD");
    return derivar(senha, sal, it);
  }

  /* ---------------- chave dos dados guardada (cifrada com o envelope da sessão) ---------------- */
  const aadLocal = (email) => enc.encode("zozo|sessao|" + email);
  async function chaveEnvelope(envelope, usos) {
    return crypto.subtle.importKey("raw", deB64(envelope), { name: "AES-GCM" }, false, usos);
  }
  async function guardarChaveLocal(email, envelope, bits, prova) {
    try {
      const env = await chaveEnvelope(envelope, ["encrypt"]);
      const iv = aleatorio(12);
      const claro = enc.encode(JSON.stringify({ d: b64(bits), p: prova }));
      const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aadLocal(email) }, env, claro));
      claro.fill(0);
      localStorage.setItem(CHAVE_LOCAL, JSON.stringify({ e: email, iv: b64(iv), c: b64(ct) }));
    } catch (e) { /* sem armazenamento: a senha será pedida ao recarregar */ }
  }
  async function recuperarChaveLocal(email, envelope) {
    try {
      const g = JSON.parse(localStorage.getItem(CHAVE_LOCAL) || "null");
      if (!g || g.e !== email) return null;
      const env = await chaveEnvelope(envelope, ["decrypt"]);
      const claro = await crypto.subtle.decrypt({ name: "AES-GCM", iv: deB64(g.iv), additionalData: aadLocal(email) }, env, deB64(g.c));
      const o = JSON.parse(dec.decode(claro));
      const bits = deB64(o.d);
      const chave = await crypto.subtle.importKey("raw", bits, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
      bits.fill(0);
      return { chave, prova: o.p };
    } catch (e) { esquecerChaveLocal(); return null; }      // envelope de outra sessão / adulterado
  }
  function esquecerChaveLocal() { try { localStorage.removeItem(CHAVE_LOCAL); } catch (e) { /* ok */ } }

  async function concluir(r, k) {
    await guardarChaveLocal(r.email, r.envelope, k.bits, k.prova);
    k.bits.fill(0);
    sessao = { email: r.email, nome: r.nome, chave: k.chave, prova: k.prova, envelope: r.envelope, versao: 0, doisFatores: !!r.doisFatores };
    return sessaoData();
  }

  /* ---------------- documento ---------------- */
  async function transformar(bytes, fluxo) {
    const s = new Blob([bytes]).stream().pipeThrough(fluxo);
    return new Uint8Array(await new Response(s).arrayBuffer());
  }
  const aad = (email, versao) => enc.encode("zozo|v2|" + email + "|" + versao);

  async function cifrar(chave, email, versao, objeto) {
    const claro = await transformar(enc.encode(JSON.stringify(objeto === undefined ? null : objeto)), new CompressionStream("gzip"));
    const iv = aleatorio(12);
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad(email, versao) }, chave, claro));
    const tudo = new Uint8Array(13 + ct.length);
    tudo[0] = FORMATO; tudo.set(iv, 1); tudo.set(ct, 13);
    const texto = b64(tudo);
    if (texto.length > LIMITE_CONTEUDO) throw erro("DOCUMENT_TOO_LARGE");
    return texto;
  }

  async function decifrar(chave, email, versao, texto) {
    const tudo = deB64(texto);
    if (tudo.length < 30 || tudo[0] !== FORMATO) throw erro("LOAD_FAILED");
    const claro = await crypto.subtle.decrypt({ name: "AES-GCM", iv: tudo.subarray(1, 13), additionalData: aad(email, versao) }, chave, tudo.subarray(13));
    return JSON.parse(dec.decode(await transformar(new Uint8Array(claro), new DecompressionStream("gzip"))));
  }

  /** Histórico (mais recente primeiro): primeira versão que decifra corretamente */
  async function recuperarDoHistorico(s) {
    const h = await comProvaDaSessao(() => api("GET", "/historico", undefined, s.prova));
    for (const v of (h && Array.isArray(h.versoes) ? h.versoes : [])) {
      try { return await decifrar(s.chave, s.email, v.versao, v.conteudo); } catch (e) { /* tenta a anterior */ }
    }
    return undefined;
  }

  /* ---------------- última versão vista neste navegador ---------------- */
  const chaveVersao = async (email) => "zozo.versao." + hex(await crypto.subtle.digest("SHA-256", enc.encode(email))).slice(0, 24);
  async function versaoConhecida(email) {
    try { return Number(localStorage.getItem(await chaveVersao(email))) || 0; } catch (e) { return 0; }
  }
  async function lembrarVersao(email, v) {
    try { if (v > (await versaoConhecida(email))) localStorage.setItem(await chaveVersao(email), String(v)); } catch (e) { /* opcional */ }
  }
  async function esquecerVersao(email) {
    try { localStorage.removeItem(await chaveVersao(email)); } catch (e) { /* opcional */ }
  }

  /* ---------------- senha vazada (Have I Been Pwned, k-anonimato) ---------------- */
  async function senhaVazada(senha) {
    try {
      const hash = hex(await crypto.subtle.digest("SHA-1", enc.encode(normalizarSenha(senha)))).toUpperCase();
      const espera = new Promise((ok) => setTimeout(() => ok(null), 5000));
      const r = await Promise.race([api("GET", "/senha-vazada/" + hash.slice(0, 5)), espera]);   // só 5 caracteres saem
      if (!r || typeof r.lista !== "string") return false;
      const sufixo = hash.slice(5);
      return r.lista.split("\n").some((l) => { const [s, n] = l.trim().split(":"); return s === sufixo && Number(n) > 0; });
    } catch (e) { return false; }          // sem conexão com o serviço: não bloqueia
  }

  /* ---------------- ações ---------------- */
  const usuario = () => (sessao ? { nomeUsuario: sessao.nome, email: sessao.email, doisFatores: sessao.doisFatores } : null);
  const sessaoData = () => ({ authenticated: !!sessao, user: usuario() });
  function exigirSessao() { if (!sessao) throw erro("SESSION_EXPIRED"); return sessao; }
  /** Prova recusada durante a sessão = senha trocada em outro dispositivo: a sessão acabou */
  async function comProvaDaSessao(fn) {
    try { return await fn(); } catch (e) {
      if (e.code === "WRONG_PASSWORD") throw sessaoExpirada("SESSION_EXPIRED", true);
      throw e;
    }
  }

  const ACOES = {
    async getArmazenamento() {
      try { const p = await api("GET", "/publico"); return { available: true, turnstile: p.turnstile || null, google: !!p.google }; }
      catch (e) { return { available: e.code === "ACCESS_DENIED", acessoNegado: e.code === "ACCESS_DENIED" }; }
    },

    /** Depois do "Continuar com Google": e-mail confirmado, nome e se a conta já existe (ou null) */
    async getGoogle() { return api("GET", "/google/identidade"); },

    /** Sessão aberta (cookie) + chave guardada neste navegador → entra sem pedir a senha */
    async getSession() {
      if (sessao) return sessaoData();
      let r;
      try { r = await api("GET", "/sessao"); } catch (e) { r = null; }
      if (!r || !r.email) { esquecerChaveLocal(); return { authenticated: false }; }    // 204: ninguém logado
      const k = await recuperarChaveLocal(r.email, r.envelope);
      if (!k) {                                     // chave não está aqui: encerra a sessão e pede a senha
        await api("DELETE", "/sessao").catch(() => null);
        return { authenticated: false, email: r.email };
      }
      sessao = { email: r.email, nome: r.nome, chave: k.chave, prova: k.prova, envelope: r.envelope, versao: 0, doisFatores: !!r.doisFatores };
      return sessaoData();
    },

    async login(d) {
      sessao = null; pendente = null;
      const email = normalizarEmail(d.email);
      const k = await derivarConta(d.senha, await parametros(email));
      const r = await api("POST", "/sessao", { email, prova: k.prova, turnstile: d.turnstile || undefined });
      if (r.doisFatores && !r.envelope) { pendente = { email, k }; return { doisFatores: true }; }
      return concluir(r, k);
    },

    /** Segunda etapa do login: código do aplicativo autenticador */
    async verificar2FA(d) {
      if (!pendente) throw sessaoExpirada();
      const r = await api("POST", "/sessao/2fa", { codigo: String(d.codigo || "") });
      const k = pendente.k;
      pendente = null;
      return concluir(r, k);
    },

    async registerUser(d) {
      sessao = null; pendente = null;
      validarSenha(d.senha);
      const nome = limparNome(d.nomeUsuario);
      if (!nome) throw erro("REGISTER_FAILED");
      const email = normalizarEmail(d.email);
      if (await senhaVazada(d.senha)) throw erro("PASSWORD_BREACHED");
      const sal = aleatorio(16);
      const k = await derivar(d.senha, sal, ITERACOES);
      const r = await api("POST", "/conta", { email, nome, sal: b64(sal), iteracoes: ITERACOES, prova: k.prova, turnstile: d.turnstile || undefined });
      return concluir(r, k);
    },

    async logout() {
      sessao = null; pendente = null;
      esquecerChaveLocal();
      await api("DELETE", "/sessao").catch(() => null);
      return sessaoData();
    },

    async loadUserData() {
      const s = exigirSessao();
      const d = await comProvaDaSessao(() => api("GET", "/documento", undefined, s.prova));
      if (sessao !== s) throw erro("SESSION_EXPIRED");
      if (!d) { s.versao = 0; return { documento: null, aviso: null }; }
      let documento, aviso = null;
      try { documento = await decifrar(s.chave, s.email, d.versao, d.conteudo); }
      catch (e) {
        // Documento danificado ou adulterado: abre a cópia válida mais recente do histórico
        documento = await recuperarDoHistorico(s);
        if (documento === undefined) throw erro("LOAD_FAILED");
        aviso = "RESTORED_FROM_BACKUP";
      }
      if (sessao !== s) throw erro("SESSION_EXPIRED");
      if (!aviso && d.versao < (await versaoConhecida(s.email))) aviso = "OLDER_VERSION";
      s.versao = d.versao;                      // a próxima gravação substitui exatamente esta versão
      await lembrarVersao(s.email, d.versao);
      return { documento, aviso };
    },

    async saveUserData(d) {
      const s = exigirSessao();
      const va = s.versao;
      const conteudo = await cifrar(s.chave, s.email, va + 1, d.documento);
      // o servidor recusa (409) se outro dispositivo gravou depois da nossa leitura
      const r = await comProvaDaSessao(() => api("PUT", "/documento", { versaoAnterior: va, conteudo }, s.prova));
      if (!r || r.versao !== va + 1) throw erro("DATA_CHANGED");
      s.versao = va + 1;
      await lembrarVersao(s.email, s.versao);
      return { salvo: true };
    },

    async changePassword(d) {
      const s = exigirSessao();
      validarSenha(d.novaSenha);
      const atual = await derivarConta(d.senhaAtual, await parametros(s.email));
      atual.bits.fill(0);
      const doc = await api("GET", "/documento", undefined, atual.prova);     // senha errada → WRONG_PASSWORD
      if (await senhaVazada(d.novaSenha)) throw erro("PASSWORD_BREACHED");
      let documento = null;
      if (doc) { try { documento = await decifrar(atual.chave, s.email, doc.versao, doc.conteudo); } catch (e) { throw erro("LOAD_FAILED"); } }
      const va = doc ? doc.versao : 0;
      const sal = aleatorio(16);
      const nova = await derivar(d.novaSenha, sal, ITERACOES);
      const conteudo = await cifrar(nova.chave, s.email, va + 1, documento);
      // troca atômica no servidor: novo sal + nova prova + documento recifrado (e os outros dispositivos saem)
      await api("PUT", "/conta/senha", { sal: b64(sal), iteracoes: ITERACOES, prova: nova.prova, conteudo, versaoAnterior: va }, atual.prova);
      if (sessao === s) {
        Object.assign(s, { chave: nova.chave, prova: nova.prova, versao: va + 1 });
        await guardarChaveLocal(s.email, s.envelope, nova.bits, nova.prova);
      }
      nova.bits.fill(0);
      await lembrarVersao(s.email, va + 1);
      return { alterada: true };
    },

    async updateUser(d) {
      const s = exigirSessao();
      const nome = limparNome(d.nomeUsuario);
      if (!nome) throw erro("OPERATION_FAILED");
      const k = await derivarConta(d.senhaAtual, await parametros(s.email));
      k.bits.fill(0);
      await api("PUT", "/conta/nome", { nome }, k.prova);                     // senha errada → WRONG_PASSWORD
      s.nome = nome;
      return sessaoData();
    },

    async wipeUserData(d) {
      const s = exigirSessao();
      const k = await derivarConta(d.senha, await parametros(s.email));
      k.bits.fill(0);
      const doc = await api("GET", "/documento", undefined, k.prova);         // confere a senha e a versão atual
      const va = doc ? doc.versao : 0;
      const conteudo = await cifrar(k.chave, s.email, va + 1, null);
      await api("POST", "/documento/apagar", { versaoAnterior: va, conteudo }, k.prova);
      if (sessao === s) s.versao = va + 1;
      await lembrarVersao(s.email, va + 1);
      return { apagado: true };
    },

    async deleteUser(d) {
      const s = exigirSessao();
      const k = await derivarConta(d.senha, await parametros(s.email));
      k.bits.fill(0);
      await api("DELETE", "/conta", undefined, k.prova);
      await esquecerVersao(s.email);
      esquecerChaveLocal();
      sessao = null;
      return { excluido: true };
    },

    /* ---- 2FA (a senha já foi provada no login: usa a prova da sessão) ---- */
    async iniciar2FA() {
      const s = exigirSessao();
      return comProvaDaSessao(() => api("POST", "/2fa/iniciar", undefined, s.prova));
    },
    async confirmar2FA(d) {
      const s = exigirSessao();
      await comProvaDaSessao(() => api("POST", "/2fa/confirmar", { codigo: String(d.codigo || "") }, s.prova));
      s.doisFatores = true;
      return sessaoData();
    },
    async desativar2FA() {
      const s = exigirSessao();
      await comProvaDaSessao(() => api("POST", "/2fa/desativar", undefined, s.prova));
      s.doisFatores = false;
      return sessaoData();
    },
  };

  async function handle(req) {
    const base = { type: "response", action: req.action, requestId: req.requestId };
    const f = Object.prototype.hasOwnProperty.call(ACOES, req.action) ? ACOES[req.action] : null;
    if (!f) return Object.assign(base, { success: false, error: { code: "NOT_IMPLEMENTED" } });
    try { return Object.assign(base, { success: true, data: await f(req.data || {}) }); }
    catch (e) { return Object.assign(base, { success: false, error: { code: (e && e.code) || "OPERATION_FAILED", espera: e && e.espera, captcha: e && e.captcha } }); }
  }

  ZoZo.webHost = { handle };
})(window.ZoZo = window.ZoZo || {});
