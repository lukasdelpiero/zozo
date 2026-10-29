/* =============================================================
   ZoZo — Host da versão web (conversa com a API Python no Cloudflare)
   ------------------------------------------------------------
   Criptografia de ponta a ponta: os dados são cifrados AQUI, no
   navegador. O servidor (API + banco SQL) só guarda blocos cifrados
   e nunca vê a senha nem os lançamentos. Exceção escolhida pelo produto:
   a custódia da chave para "Esqueci minha senha" (ver guardarCustodia);
   nome e e-mail da conta são legíveis no servidor.
     • senha → Argon2id (64 MiB, 3 passagens; contas novas, senhas trocadas
       e contas antigas a partir do primeiro login na 3.12) ou PBKDF2-SHA256
       (600.000 iterações; contas antigas que ainda não entraram),
       sal de 16 bytes → HKDF → duas chaves independentes:
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
     • conta de demonstração (o servidor informa "demo"): os dados são
       gerados aqui (js/data/demo.ts), ficam só na memória e nada é
       enviado — a API também recusa gravações dessa conta.
   Testes: ui/tests/host-web.test.mjs (API falsa + derivação conferida
   com uma implementação independente). Tipos dos pedidos: src/globais.d.ts.
   ============================================================= */
(function (ZoZo: ZoZoGlobal) {
  "use strict";
  const API = "/api";
  const ITERACOES = 600000;
  const ITERACOES_MAX = 10000000;
  // Argon2id (contas novas e senhas trocadas): 64 MiB, 3 passagens, 1 linha — RFC 9106 (2ª recomendação).
  // Contas antigas continuam em PBKDF2 até trocarem a senha. Mudar estes números exige um "argon2id-2".
  const KDF_PBKDF2 = "pbkdf2", KDF_ARGON2 = "argon2id-1";
  const ARGON2 = { memorySize: 65536, iterations: 3, parallelism: 1, hashLength: 32 };
  const FORMATO = 2;                       // primeiro byte do documento cifrado
  const LIMITE_CONTEUDO = 1900000;         // mesmo limite da API (D1: ~2 MB por linha)
  const LIMITE_EXPANDIDO = 40 * 1024 * 1024; // documento descomprimido: no máximo 40 MB
  const CHAVE_LOCAL = "zozo.sessao";       // chave dos dados, cifrada com o envelope da sessão
  const enc = new TextEncoder(), dec = new TextDecoder();

  type Bytes = Uint8Array<ArrayBuffer>;
  /** Dados que a interface manda numa ação (não confiáveis: cada campo é conferido) */
  type Dados = Record<string, unknown>;
  /** Resposta JSON da API (também conferida campo a campo onde importa) */
  type RespostaApi = Record<string, any>;
  type ErroHost = Error & { code: string; espera?: number; captcha?: boolean; incerto?: boolean };
  /** A gravação pode ter acontecido: a conexão caiu depois de o pedido sair (ver api) */
  const incerto = (e: unknown) => !!e && (e as ErroHost).incerto === true;
  type Kdf = typeof KDF_PBKDF2 | typeof KDF_ARGON2;
  /** Chaves de uma senha: a dos dados (e os bytes dela, para guardar cifrada) e a prova */
  type Chaves = { chave: CryptoKey; bits: Bytes; prova: string };
  type RecursosConta = { perfis: boolean; boleto: boolean; pix: boolean; cambio: boolean };
  type Sessao = {
    email: string; nome: string; chave: CryptoKey; prova: string; envelope: string; versao: number;
    doisFatores: boolean; demo: boolean; recursos: RecursosConta;
    simulada?: boolean;                        // modo de teste: conta sem servidor (só nesta aba)
  };

  let sessao: Sessao | null = null;
  /** Chaves novas (Argon2id) de uma conta antiga, preparadas depois que o servidor aceitou a senha */
  type MigracaoKdf = { sal: Bytes; chaves: Chaves };
  let pendente: { email: string; k: Chaves; migracao: MigracaoKdf | null } | null = null;  // senha certa, falta o código do 2FA
  /** "Esqueci minha senha": link aberto; dados já abertos com a cópia da chave (só na memória desta aba) */
  type Recuperacao = { token: string; passe: string; email: string; versao: number; manter: boolean; documento: unknown;
    historico: Array<{ versao: number; claro: unknown; quando: string | null }> };
  let recuperacao: Recuperacao | null = null;

  /* ---------------- modo de teste: SÓ no endereço local e na prévia ----------------
     Decidido pelo endereço da página: em produção (usezozo.com.br) nada disto liga. Nunca toca dados de verdade:
     a conta simulada vive só na memória desta aba (sem servidor) e a conta demo continua sem gravar no servidor.
     Aqui a demo tem todos os recursos e as ações de conta (nome, senha, 2FA, apagar…) são simuladas. */
  const HOSTS_PREVIA = ["zozo-previa.zozo-finance-app.workers.dev"];
  const hostAtual = typeof location !== "undefined" ? location.hostname : "";
  const TESTE = hostAtual === "127.0.0.1" || hostAtual === "localhost" || hostAtual === "[::1]" || hostAtual.endsWith(".localhost") || HOSTS_PREVIA.includes(hostAtual);
  const TUDO: RecursosConta = { perfis: true, boleto: true, pix: true, cambio: true };
  const CHAVE_SIMULAR = "zozo.teste.simular";
  const teste = { simular: false, falha: null as string | null, conflito: false, protecao: false, emailSimulado: "", docSimulado: null as unknown, zoAceito: false };
  try { teste.simular = TESTE && sessionStorage.getItem(CHAVE_SIMULAR) === "1"; } catch (e) { /* sem sessionStorage */ }
  /** Ações de conta simuladas: conta sem servidor, ou a demo no ambiente de teste */
  const simulada = (s: Sessao) => !!s.simulada || (TESTE && s.demo);
  const base32 = (b: Uint8Array) => {
    const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"; let bits = 0, v = 0, out = "";
    for (const x of b) { v = (v << 8) | x; bits += 8; while (bits >= 5) { out += A[(v >>> (bits - 5)) & 31]; bits -= 5; } }
    return bits > 0 ? out + A[(v << (5 - bits)) & 31] : out;
  };
  async function sessaoSimulada(email: string, nome: string, documento: unknown) {
    teste.emailSimulado = email;
    teste.docSimulado = documento;
    const chave = await crypto.subtle.importKey("raw", aleatorio(32), { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
    sessao = { email, nome, chave, prova: "", envelope: "", versao: 0, doisFatores: false, demo: false, simulada: true, recursos: TUDO };
    return sessaoData();
  }

  /* ---------------- utilitários ---------------- */
  function b64(bytes: Uint8Array): string {
    let s = "";
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000) as unknown as number[]);
    return btoa(s);
  }
  function deB64(texto: string): Bytes {
    const bin = atob(texto);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  const hex = (buf: ArrayBuffer) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
  const aleatorio = (n: number): Bytes => crypto.getRandomValues(new Uint8Array(n));
  const erro = (code: string, extra?: { espera?: number; captcha?: boolean }): ErroHost => Object.assign(new Error(code), { code }, extra || {});
  const normalizarEmail = (e: unknown) => String(e || "").trim().toLowerCase();
  const normalizarSenha = (s: unknown) => String(s || "").normalize("NFC");
  const limparNome = (n: unknown) => String(n || "").replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g, "").trim().slice(0, 80);
  function validarSenha(s: unknown): asserts s is string { if (typeof s !== "string" || s.length < 8 || s.length > 256) throw erro("WEAK_PASSWORD"); }
  const codigoDe = (e: unknown) => (e && typeof e === "object" && "code" in e ? String((e as ErroHost).code) : "");

  /** Encerra a sessão na interface */
  function sessaoExpirada(codigo?: string, manterChave?: boolean): ErroHost {
    const c = codigo || "SESSION_EXPIRED";
    sessao = null; pendente = null;
    if (!manterChave) esquecerChaveLocal();      // senha trocada em outra aba: a chave guardada já é a nova
    window.dispatchEvent(new CustomEvent("zozo:sessao-expirada", { detail: { codigo: c } }));
    return erro(c);
  }

  /* ---------------- API ---------------- */
  /** Pedido à API. GET com 404 devolve null; os outros erros viram códigos conhecidos. */
  async function api(metodo: string, caminho: string, corpo?: unknown, prova?: string): Promise<RespostaApi | null> {
    if (TESTE && teste.falha) throw teste.falha === "SESSION_EXPIRED" ? sessaoExpirada() : erro(teste.falha);   // painel de testes
    const headers: Record<string, string> = {};
    if (corpo !== undefined) headers["Content-Type"] = "application/json";
    if (prova) headers["X-ZoZo-Prova"] = prova;
    let r: Response;
    try {
      r = await fetch(API + caminho, {
        method: metodo, credentials: "same-origin", cache: "no-store",
        redirect: "manual",                       // a API nunca redireciona: um redirecionamento vem de algo na frente dela
        headers, body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
      });
    } catch (e) {
      // GET: nada mudou. Gravação: o pedido pode ter chegado e sido gravado antes de a conexão cair (incerto)
      throw Object.assign(erro("STORAGE_UNAVAILABLE"), { incerto: metodo !== "GET" });
    }
    if (r.type === "opaqueredirect") throw erro("CF_CHALLENGE");          // redirecionamento de uma proteção na frente da API
    // Proteção do Cloudflare (ex.: modo "Under Attack") pedindo verificação: o pedido nem chegou ao ZoZo
    if (r.headers.get("cf-mitigated") === "challenge" || (r.status === 403 && !/json/i.test(r.headers.get("content-type") || ""))) {
      window.dispatchEvent(new CustomEvent("zozo:protecao-cloudflare"));
      throw erro("CF_CHALLENGE");
    }
    let dados: RespostaApi | null = null;
    if (r.status !== 204) { try { dados = await r.json(); } catch (e) { dados = null; } }
    if (r.ok) return dados || {};
    const codigo = dados && typeof dados.erro === "string" ? dados.erro : "";
    const extra = { espera: dados ? dados.espera : undefined, captcha: dados ? dados.captcha : undefined };
    if (r.status === 401) {
      if (codigo === "INVALID_CREDENTIALS" || codigo === "CODE_INVALID" || codigo === "CODE_REQUIRED") throw erro(codigo, extra);
      throw sessaoExpirada("SESSION_EXPIRED");
    }
    if (r.status === 404 && metodo === "GET") return null;
    if (r.status === 409) throw erro(["EMAIL_IN_USE", "2FA_ALREADY_ON", "2FA_NOT_PENDING"].includes(codigo) ? codigo : "DATA_CHANGED");
    if (r.status === 403 && ["WRONG_PASSWORD", "REGISTER_FAILED", "DEMO_READ_ONLY", "EMAIL_NOT_CONFIRMED", "CONSENT_REQUIRED"].includes(codigo)) throw erro(codigo);
    if (r.status === 400 && codigo === "TOKEN_INVALID") throw erro(codigo);
    if (r.status === 403) throw erro("ACCESS_DENIED");                   // pedido recusado pela checagem de origem
    if (r.status === 428) throw erro("CAPTCHA_REQUIRED");
    if (r.status === 429) throw erro(["ZO_LIMIT", "ZO_PAUSED", "ZO_BUSY"].includes(codigo) ? codigo : "TOO_MANY_ATTEMPTS", extra);
    if (r.status === 413) throw erro("DOCUMENT_TOO_LARGE");
    if (codigo === "ZO_UNAVAILABLE" || codigo === "ZO_FAILED") throw erro(codigo);          // Zo desligado ou Gemini fora
    throw erro("STORAGE_UNAVAILABLE");
  }
  const parametros = (email: string) => api("GET", "/conta/parametros?email=" + encodeURIComponent(normalizarEmail(email)));

  /* ---------------- chaves ----------------
     senha → (PBKDF2 ou Argon2id) → 32 bytes "mestre" → HKDF → chave dos dados + prova da senha.
     A etapa HKDF e o formato dos documentos não mudam: só a função que estica a senha. */
  async function mestreArgon2(senha: unknown, sal: Bytes): Promise<Bytes> {
    // WebAssembly sob demanda (CSP: 'wasm-unsafe-eval'); só baixa ao entrar/cadastrar/trocar a senha
    const { argon2id } = await import("hash-wasm");
    const bytes = await argon2id(Object.assign({ password: normalizarSenha(senha), salt: sal, outputType: "binary" as const }, ARGON2));
    return new Uint8Array(bytes);
  }
  async function derivar(senha: unknown, sal: Bytes, iteracoes: number, kdf: Kdf): Promise<Chaves> {
    let mestre: Bytes;
    if (kdf === KDF_ARGON2) mestre = await mestreArgon2(senha, sal);
    else {
      const base = await crypto.subtle.importKey("raw", enc.encode(normalizarSenha(senha)), "PBKDF2", false, ["deriveBits"]);
      mestre = new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: sal, iterations: iteracoes }, base, 256));
    }
    const hk = await crypto.subtle.importKey("raw", mestre, "HKDF", false, ["deriveKey", "deriveBits"]);
    mestre.fill(0);
    const param = (uso: string): HkdfParams => ({ name: "HKDF", hash: "SHA-256", salt: new Uint8Array(32), info: enc.encode("zozo/" + uso + "/v2") });
    // Mesmos bytes que deriveKey(AES-GCM 256) produzia: documentos já gravados continuam abrindo
    const bits = new Uint8Array(await crypto.subtle.deriveBits(param("dados"), hk, 256));
    const chave = await crypto.subtle.importKey("raw", bits, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
    const prova = new Uint8Array(await crypto.subtle.deriveBits(param("prova"), hk, 256));
    const provaB64 = b64(prova);
    prova.fill(0);
    return { chave, bits, prova: provaB64 };
  }

  /** Deriva as chaves de uma conta. Recusa parâmetros fracos ou desconhecidos vindos do servidor (proteção contra rebaixamento). */
  async function derivarConta(senha: unknown, par: RespostaApi | null): Promise<Chaves> {
    if (!par) throw erro("STORAGE_UNAVAILABLE");
    const it = par.iteracoes;
    const kdf = par.kdf === undefined ? KDF_PBKDF2 : par.kdf;           // servidor de versão anterior: PBKDF2
    let sal: Bytes;
    try { sal = deB64(String(par.sal || "")); } catch (e) { sal = new Uint8Array(0); }
    if (kdf !== KDF_PBKDF2 && kdf !== KDF_ARGON2) throw erro("STORAGE_UNAVAILABLE");
    if (kdf === KDF_PBKDF2 && (!Number.isInteger(it) || it < ITERACOES || it > ITERACOES_MAX)) throw erro("STORAGE_UNAVAILABLE");
    if (sal.length < 16 || sal.length > 64) throw erro("STORAGE_UNAVAILABLE");
    if (!senha) throw erro("WRONG_PASSWORD");
    return derivar(senha, sal, it, kdf);
  }

  /** Código do 2FA vindo da tela (só 6 dígitos ou nada; o servidor confere) */
  const codigo2FA = (d: unknown): string | undefined => {
    const c = d && typeof d === "object" ? (d as { codigo?: unknown }).codigo : undefined;
    return typeof c === "string" && c ? c : undefined;
  };

  /* ---------------- chave dos dados guardada (cifrada com o envelope da sessão) ---------------- */
  const aadLocal = (email: string) => enc.encode("zozo|sessao|" + email);
  async function chaveEnvelope(envelope: string, usos: KeyUsage[]): Promise<CryptoKey> {
    return crypto.subtle.importKey("raw", deB64(envelope), { name: "AES-GCM" }, false, usos);
  }
  async function guardarChaveLocal(email: string, envelope: string, bits: Bytes, prova: string): Promise<void> {
    try {
      const env = await chaveEnvelope(envelope, ["encrypt"]);
      const iv = aleatorio(12);
      const claro = enc.encode(JSON.stringify({ d: b64(bits), p: prova }));
      const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aadLocal(email) }, env, claro));
      claro.fill(0);
      localStorage.setItem(CHAVE_LOCAL, JSON.stringify({ e: email, iv: b64(iv), c: b64(ct) }));
    } catch (e) { /* sem armazenamento: a senha será pedida ao recarregar */ }
  }
  async function recuperarChaveLocal(email: string, envelope: string): Promise<{ chave: CryptoKey; prova: string } | null> {
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
  function esquecerChaveLocal(): void { try { localStorage.removeItem(CHAVE_LOCAL); } catch (e) { /* ok */ } }

  /** Recursos que o servidor liberou para a conta (só valores booleanos conhecidos) */
  const lerRecursos = (r: unknown): RecursosConta => {
    const x = (r && typeof r === "object" ? r : {}) as Record<string, unknown>;
    return { perfis: x.perfis === true, boleto: x.boleto === true, pix: x.pix === true, cambio: x.cambio === true };
  };
  const novaSessao = (r: RespostaApi, k: { chave: CryptoKey; prova: string }): Sessao => ({
    email: r.email, nome: r.nome, chave: k.chave, prova: k.prova, envelope: r.envelope, versao: 0,
    doisFatores: !!r.doisFatores, demo: r.demo === true, recursos: lerRecursos(r.recursos) });

  /* ---------------- recuperação de senha: cópia da chave dos dados (custódia) ----------------
     O servidor entrega uma chave de custódia (HMAC do SEGREDO, não fica guardada); o navegador tranca a chave
     dos dados com ela e guarda só a cópia trancada. Esqueceu a senha: o link do e-mail devolve a chave de
     custódia e a cópia. Proteção avançada: não há cópia (o servidor responde "avancada"). */
  const aadCustodia = (email: string, nonce: string) => enc.encode("zozo|custodia|v1|" + email + "|" + nonce);
  /**
   * Guarda a cópia da chave. true = guardada (ou já estava, ou proteção avançada: nada a guardar); false = falhou
   * (sem cópia, "Esqueci minha senha" não recupera os dados até o próximo login ou o reparo em Configurações › Conta).
   */
  async function guardarCustodia(s: Sessao | null, bits: Bytes): Promise<boolean> {
    if (!s || s.demo) return true;
    try {
      const r = await api("POST", "/custodia/chave", undefined, s.prova);
      if (r && (r.atual === true || r.avancada === true)) return true;              // já guardada ou proteção avançada
      if (!r || typeof r.nonce !== "string" || typeof r.r !== "string") return false;
      const chave = await crypto.subtle.importKey("raw", deB64(r.r), { name: "AES-GCM" }, false, ["encrypt"]);
      const iv = aleatorio(12);
      const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aadCustodia(s.email, r.nonce) }, chave, bits));
      const tudo = new Uint8Array(12 + ct.length);
      tudo.set(iv); tudo.set(ct, 12);
      await api("PUT", "/custodia", { nonce: r.nonce, chave: b64(tudo) }, s.prova);
      return true;
    } catch (e) { return false; }                   // o login segue; a tela de Configurações mostra a pendência
  }
  /** Abre a cópia da chave dos dados com a chave de custódia que veio com o link do e-mail */
  async function abrirCustodia(email: string, c: RespostaApi): Promise<CryptoKey> {
    const tranca = await crypto.subtle.importKey("raw", deB64(String(c.r || "")), { name: "AES-GCM" }, false, ["decrypt"]);
    const tudo = deB64(String(c.chave || ""));
    if (tudo.length !== 60) throw erro("LOAD_FAILED");
    const bits = new Uint8Array(await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: tudo.subarray(0, 12), additionalData: aadCustodia(email, String(c.nonce || "")) }, tranca, tudo.subarray(12)));
    const chave = await crypto.subtle.importKey("raw", bits, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
    bits.fill(0);
    return chave;
  }

  /** Sessão aberta. adiarCustodia: conta antiga — a cópia da chave é guardada depois da migração (com a chave nova) */
  async function concluir(r: RespostaApi | null, k: Chaves, adiarCustodia = false) {
    if (!r) throw erro("STORAGE_UNAVAILABLE");
    await guardarChaveLocal(r.email, r.envelope, k.bits, k.prova);
    sessao = novaSessao(r, k);
    if (!adiarCustodia) { await guardarCustodia(sessao, k.bits); k.bits.fill(0); }
    return sessaoData();
  }

  /* ---------------- documento ---------------- */
  async function transformar(bytes: Bytes, fluxo: CompressionStream | DecompressionStream, limite?: number): Promise<Bytes> {
    const s = new Blob([bytes]).stream().pipeThrough(fluxo);
    if (limite === undefined) return new Uint8Array(await new Response(s).arrayBuffer());
    const leitor = s.getReader();
    const partes: Uint8Array[] = [];
    let tamanho = 0;
    try {
      while (true) {
        const { done, value } = await leitor.read();
        if (done) break;
        tamanho += value.byteLength;
        if (tamanho > limite) {
          await leitor.cancel();
          throw erro("LOAD_FAILED");
        }
        partes.push(value);
      }
    } finally { leitor.releaseLock(); }
    const resultado = new Uint8Array(tamanho);
    let posicao = 0;
    for (const parte of partes) { resultado.set(parte, posicao); posicao += parte.byteLength; }
    return resultado;
  }
  const aad = (email: string, versao: number) => enc.encode("zozo|v2|" + email + "|" + versao);

  async function cifrar(chave: CryptoKey, email: string, versao: number, objeto: unknown): Promise<string> {
    const json = enc.encode(JSON.stringify(objeto === undefined ? null : objeto));
    // Não grave um documento que este mesmo cliente recusaria abrir depois.
    if (json.byteLength > LIMITE_EXPANDIDO) throw erro("DOCUMENT_TOO_LARGE");
    const claro = await transformar(json, new CompressionStream("gzip"));
    const iv = aleatorio(12);
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad(email, versao) }, chave, claro));
    const tudo = new Uint8Array(13 + ct.length);
    tudo[0] = FORMATO; tudo.set(iv, 1); tudo.set(ct, 13);
    const texto = b64(tudo);
    if (texto.length > LIMITE_CONTEUDO) throw erro("DOCUMENT_TOO_LARGE");
    return texto;
  }

  async function decifrar(chave: CryptoKey, email: string, versao: number, texto: string): Promise<unknown> {
    if (typeof texto !== "string" || texto.length > LIMITE_CONTEUDO) throw erro("LOAD_FAILED");
    const tudo = deB64(texto);
    if (tudo.length < 30 || tudo[0] !== FORMATO) throw erro("LOAD_FAILED");
    const claro = await crypto.subtle.decrypt({ name: "AES-GCM", iv: tudo.subarray(1, 13), additionalData: aad(email, versao) }, chave, tudo.subarray(13));
    const expandido = await transformar(new Uint8Array(claro), new DecompressionStream("gzip"), LIMITE_EXPANDIDO);
    return JSON.parse(dec.decode(expandido));
  }

  /** Histórico (mais recente primeiro): primeira versão que decifra corretamente */
  async function recuperarDoHistorico(s: Sessao): Promise<unknown> {
    let h: RespostaApi | null;
    try { h = await comProvaDaSessao(() => api("GET", "/historico", undefined, s.prova)); }
    catch (e) { throw codigoDe(e) === "SESSION_EXPIRED" ? e : erro("DOCUMENT_UNAVAILABLE"); }
    for (const v of (h && Array.isArray(h.versoes) ? h.versoes : [])) {
      try { return await decifrar(s.chave, s.email, v.versao, v.conteudo); } catch (e) { /* tenta a anterior */ }
    }
    return undefined;
  }

  /* ---------------- conta antiga (PBKDF2) → Argon2id, com a mesma senha ----------------
     Logo depois de um login que deu certo (com 2FA, depois do código) e antes de o app ler os dados:
     o documento E o histórico são recifrados com a chave nova e vão juntos, numa transação, para
     PUT /conta/kdf (o servidor só aceita PBKDF2 → Argon2id, com a prova atual). As derivações e o
     formato não mudam (HKDF zozo/dados/v2 e zozo/prova/v2, AAD, AES-GCM): muda só o "mestre".
     Qualquer falha (conflito, rede) só adia: a conta continua em PBKDF2 e tenta no próximo login. */
  const LIMITE_PEDIDO = 2000000;           // abaixo do limite de corpo da API (2,1 MB)
  async function prepararArgon2(senha: unknown): Promise<MigracaoKdf> {
    const sal = aleatorio(16);
    return { sal, chaves: await derivar(senha, sal, ITERACOES, KDF_ARGON2) };
  }
  async function migrarParaArgon2(m: MigracaoKdf | null, bitsAntigos: Bytes): Promise<void> {
    if (!m) return;
    const s = sessao;
    let migrou = false;
    try {
      if (!s || s.demo) return;
      const doc = await api("GET", "/documento", undefined, s.prova);
      // A leitura normal precisa detectar ausência/rollback antes de qualquer escrita automática.
      if (!doc || !Number.isSafeInteger(doc.versao) || doc.versao < 1 || doc.versao < await versaoConhecida(s.email)) return;
      const va: number = doc.versao;
      const documento = await decifrar(s.chave, s.email, doc.versao, doc.conteudo);
      const conteudo = await cifrar(m.chaves.chave, s.email, va + 1, documento);
      // Migração automática nunca descarta backups: se qualquer cópia não abrir, adia a migração inteira,
      // mantendo a chave e todos os documentos anteriores.
      const h = await api("GET", "/historico", undefined, s.prova);
      if (!h || !Array.isArray(h.versoes)) return;
      const recifradas: Array<{ versao: number; conteudo: string }> = [];
      let tamanho = conteudo.length + 1000;
      for (const v of h.versoes) {
        let claro: unknown;
        try { claro = await decifrar(s.chave, s.email, v.versao, v.conteudo); } catch (e) { return; }
        const c = await cifrar(m.chaves.chave, s.email, v.versao, claro);
        tamanho += c.length + 40;
        recifradas.push({ versao: v.versao, conteudo: c });
      }
      // Cabe num pedido: vai tudo junto. Não cabe: em etapas — cada cópia num pedido (guardada à parte no servidor,
      // sem uso até o fechamento) e o fechamento troca documento, chave e histórico numa transação só.
      let historico = recifradas;
      if (tamanho > LIMITE_PEDIDO) {
        for (const r of recifradas) await api("PUT", "/conta/kdf/historico", { sal: b64(m.sal), versao: r.versao, conteudo: r.conteudo }, s.prova);
        historico = [];
      }
      try {
        await api("PUT", "/conta/kdf", { sal: b64(m.sal), kdf: KDF_ARGON2, prova: m.chaves.prova, conteudo, versaoAnterior: va, historico }, s.prova);
      } catch (e) {
        // Uma falha de transporte não prova rollback. Confere o sal e autentica o documento
        // com a chave nova antes de continuar; jamais repete a escrita às cegas.
        const par = await parametros(s.email).catch(() => null);
        if (par && par.kdf === KDF_PBKDF2) throw e;
        if (!par || par.kdf !== KDF_ARGON2 || par.sal !== b64(m.sal)) throw sessaoExpirada();
        try {
          const salvo = await api("GET", "/documento", undefined, m.chaves.prova);
          if (!salvo || salvo.versao !== va + 1) throw erro("LOAD_FAILED");
          await decifrar(m.chaves.chave, s.email, salvo.versao, salvo.conteudo);
        } catch (_) { throw sessaoExpirada(); }
      }
      if (sessao !== s) return;
      Object.assign(s, { chave: m.chaves.chave, prova: m.chaves.prova, versao: va + 1 });
      migrou = true;
      await guardarChaveLocal(s.email, s.envelope, m.chaves.bits, m.chaves.prova);
      await lembrarVersao(s.email, va + 1);
    } catch (e) {
      if (!sessao) throw e;
      /* fica para o próximo login (a sessão e a chave atuais continuam valendo) */
    } finally {
      // cópia da chave para a recuperação: da chave nova se migrou, senão da atual
      if (sessao === s) await guardarCustodia(s, migrou ? m.chaves.bits : bitsAntigos);
      m.chaves.bits.fill(0);
      bitsAntigos.fill(0);
    }
  }

  /* ---------------- última versão vista neste navegador ---------------- */
  const chaveVersao = async (email: string) => "zozo.versao." + hex(await crypto.subtle.digest("SHA-256", enc.encode(email))).slice(0, 24);
  async function versaoConhecida(email: string): Promise<number> {
    try { return Number(localStorage.getItem(await chaveVersao(email))) || 0; } catch (e) { return 0; }
  }
  async function lembrarVersao(email: string, v: number): Promise<void> {
    try { if (v > (await versaoConhecida(email))) localStorage.setItem(await chaveVersao(email), String(v)); } catch (e) { /* opcional */ }
  }
  async function esquecerVersao(email: string): Promise<void> {
    try { localStorage.removeItem(await chaveVersao(email)); } catch (e) { /* opcional */ }
  }

  /* ---------------- senha vazada (Have I Been Pwned, k-anonimato) ---------------- */
  async function senhaVazada(senha: string): Promise<boolean> {
    try {
      const hash = hex(await crypto.subtle.digest("SHA-1", enc.encode(normalizarSenha(senha)))).toUpperCase();
      const espera = new Promise<null>((ok) => setTimeout(() => ok(null), 5000));
      const r = await Promise.race([api("GET", "/senha-vazada/" + hash.slice(0, 5)), espera]);   // só 5 caracteres saem
      if (!r || typeof r.lista !== "string") return false;
      const sufixo = hash.slice(5);
      return r.lista.split("\n").some((l: string) => { const [s, n] = l.trim().split(":"); return s === sufixo && Number(n) > 0; });
    } catch (e) { return false; }          // sem conexão com o serviço: não bloqueia
  }

  /* ---------------- ações ---------------- */
  // No ambiente de teste a demo (e a conta simulada) aparece como conta completa: todos os recursos e opções
  const usuario = () => (sessao ? { nomeUsuario: sessao.nome, email: sessao.email, doisFatores: sessao.doisFatores,
    demo: sessao.demo && !TESTE, recursos: Object.assign({}, TESTE && (sessao.demo || sessao.simulada) ? TUDO : sessao.recursos),
    teste: TESTE, simulada: !!sessao.simulada } : null);
  const sessaoData = () => ({ authenticated: !!sessao, user: usuario() });
  function exigirSessao(): Sessao { if (!sessao) throw erro("SESSION_EXPIRED"); return sessao; }
  /** Conta real (a demo não troca senha, nome, 2FA, nem apaga ou exclui; o servidor também recusa); no ambiente de teste também a demo e a simulada (quem chama simula a ação) */
  function exigirConta(): Sessao { const s = exigirSessao(); if (s.demo && !TESTE) throw erro("DEMO_READ_ONLY"); return s; }
  /** Prova recusada durante a sessão = senha trocada em outro dispositivo: a sessão acabou */
  async function comProvaDaSessao<T>(fn: () => Promise<T>): Promise<T> {
    try { return await fn(); } catch (e) {
      if (codigoDe(e) === "WRONG_PASSWORD") throw sessaoExpirada("SESSION_EXPIRED", true);
      throw e;
    }
  }

  // as ações de sessão e conta devolvem exatamente RespostasHost[ação] (ui/src/dados.d.ts): o compilador confere
  type AcoesHost = { [K in keyof RespostasHost]: (d: Dados) => Promise<RespostasHost[K]> } & Record<string, (d: Dados) => Promise<unknown>>;
  const ACOES: AcoesHost = {
    async getArmazenamento() {
      try { const p = (await api("GET", "/publico")) || {}; return { available: true, turnstile: p.turnstile || null, google: !!p.google }; }
      catch (e) { return { available: false, desafio: codigoDe(e) === "CF_CHALLENGE" }; }
    },

    /** Depois do "Continuar com Google": e-mail confirmado, nome e se a conta já existe (ou null) */
    async getGoogle() {
      const r = await api("GET", "/google/identidade");
      return r && typeof r.email === "string" ? { email: r.email, nome: typeof r.nome === "string" ? r.nome : "", contaExiste: r.contaExiste === true } : null;
    },

    /** Sessão aberta (cookie) + chave guardada neste navegador → entra sem pedir a senha */
    async getSession() {
      if (sessao) return sessaoData();
      let r: RespostaApi | null;
      try { r = await api("GET", "/sessao"); } catch (e) { r = null; }
      if (!r || !r.email) { esquecerChaveLocal(); return { authenticated: false }; }    // 204: ninguém logado
      const k = await recuperarChaveLocal(r.email, r.envelope);
      if (!k) {                                     // chave não está aqui: encerra a sessão e pede a senha
        await api("DELETE", "/sessao").catch(() => null);
        return { authenticated: false, email: r.email };
      }
      sessao = novaSessao(r, k);
      return sessaoData();
    },

    async login(d) {
      sessao = null; pendente = null;
      const email = normalizarEmail(d.email);
      if (TESTE && teste.simular) {                // simulação: sem servidor; a mesma conta simulada desta aba ou dados de exemplo
        if (!d.senha) throw erro("WRONG_PASSWORD");
        const exemplo = ZoZo.demo ? ZoZo.demo.documento(new Date(), true) : null;     // todos os tipos, para conferir cada tela
        return sessaoSimulada(email, email.split("@")[0], email === teste.emailSimulado ? teste.docSimulado : exemplo);
      }
      const par = await parametros(email);
      const k = await derivarConta(d.senha, par);
      // confirmacao: token do link do e-mail (#confirmar=…) — a conta pendente é ativada junto com a senha
      const confirmacao = /^[A-Za-z0-9_-]{20,100}$/.test(String(d.confirmacao || "")) ? d.confirmacao : undefined;
      const r = await api("POST", "/sessao", { email, prova: k.prova, turnstile: d.turnstile || undefined, confirmacao });
      // senha aceita numa conta antiga: as chaves Argon2id são preparadas agora (a senha não fica guardada para o 2FA)
      const legado = !!par && (par.kdf === undefined || par.kdf === KDF_PBKDF2) && !(r && r.demo === true);
      const migracao = legado ? await prepararArgon2(d.senha).catch(() => null) : null;   // falhou ao preparar: entra assim mesmo
      if (r && r.doisFatores && !r.envelope) { pendente = { email, k, migracao }; return { authenticated: false, doisFatores: true }; }
      const dados = await concluir(r, k, !!migracao);
      await migrarParaArgon2(migracao, k.bits);
      return dados;
    },

    /** Segunda etapa do login: código do aplicativo autenticador */
    async verificar2FA(d) {
      if (!pendente) throw sessaoExpirada();
      const r = await api("POST", "/sessao/2fa", { codigo: String(d.codigo || "") });
      const { k, migracao } = pendente;
      pendente = null;
      const dados = await concluir(r, k, !!migracao);
      await migrarParaArgon2(migracao, k.bits);
      return dados;
    },

    async registerUser(d) {
      sessao = null; pendente = null;
      validarSenha(d.senha);
      const nome = limparNome(d.nomeUsuario);
      if (!nome) throw erro("REGISTER_FAILED");
      const email = normalizarEmail(d.email);
      if (TESTE && teste.simular) return sessaoSimulada(email, nome, null);      // simulação: conta nova e vazia, sem servidor
      if (await senhaVazada(d.senha)) throw erro("PASSWORD_BREACHED");
      const sal = aleatorio(16);
      const k = await derivar(d.senha, sal, ITERACOES, KDF_ARGON2);
      const r = await api("POST", "/conta", { email, nome, sal: b64(sal), iteracoes: ITERACOES, kdf: KDF_ARGON2, prova: k.prova, turnstile: d.turnstile || undefined });
      // E-mail ligado: a conta só entra depois do link de confirmação (nada fica guardado aqui até lá)
      if (r && r.confirmar && !r.envelope) { k.bits.fill(0); return { authenticated: false, confirmarEmail: true, email }; }
      return concluir(r, k);
    },

    async reenviarConfirmacao(d) {
      await api("POST", "/email/reenviar", { email: normalizarEmail(d && d.email) });
      return { enviado: true };
    },

    /** Link do e-mail (#confirmar=…): o servidor só diz se ainda vale e de qual e-mail é — não ativa nada */
    async conferirLink(d) {
      const token = String((d && d.token) || "");
      if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) throw erro("TOKEN_INVALID");
      const r = await api("POST", "/email/link", { token });
      return { email: normalizarEmail(r && r.email), ativa: !!(r && r.ativa) };
    },

    async logout() {
      sessao = null; pendente = null;
      esquecerChaveLocal();
      await api("DELETE", "/sessao").catch(() => null);
      return sessaoData();
    },

    /** Outro dispositivo/aba gravou depois da última leitura? Só o número da versão (o documento não vem) */
    async verificarAtualizacao() {
      const s = exigirSessao();
      if (s.demo || s.simulada) return { mudou: false };
      const r = await comProvaDaSessao(() => api("GET", "/documento/versao", undefined, s.prova));
      const versao = Number(r && r.versao) || 0;
      return { mudou: versao > s.versao, versao };
    },

    async loadUserData() {
      const s = exigirSessao();
      if (s.simulada) return { documento: teste.docSimulado === null ? null : structuredClone(teste.docSimulado), aviso: null };
      // Demonstração: dados fictícios, sorteados a cada acesso (nada vem do servidor)
      if (s.demo) return { documento: ZoZo.demo.documento(new Date()), aviso: null };
      const d = await comProvaDaSessao(() => api("GET", "/documento", undefined, s.prova));
      if (sessao !== s) throw erro("SESSION_EXPIRED");
      if (!d) {
        s.versao = 0;
        // Sem documento no servidor. Primeira vez: conta vazia. Mas se este navegador já viu dados desta conta,
        // o documento sumiu: tenta o histórico (backup) e, sem ele, abre vazia COM aviso (nunca em silêncio)
        if ((await versaoConhecida(s.email)) > 0) {
          // Histórico fora do ar: não dá para saber se há backup → erro (nada é gravado), sem apagar o marcador
          const doHistorico = await recuperarDoHistorico(s);
          if (sessao !== s) throw erro("SESSION_EXPIRED");
          if (doHistorico !== undefined) {
            await esquecerVersao(s.email);         // recuperado: a contagem recomeça a partir da cópia restaurada
            return { documento: doHistorico, aviso: "RESTORED_FROM_BACKUP" };
          }
          // Sem backup legível: abre vazia e SÓ PARA LEITURA (o marcador fica). Para recomeçar de propósito:
          // Configurações › Conta › Apagar todos os dados (wipeUserData zera o marcador).
          return { documento: null, aviso: "DOCUMENT_MISSING", somenteLeitura: true };
        }
        return { documento: null, aviso: null };
      }
      let documento: unknown, aviso: string | null = null;
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
      if (TESTE && teste.conflito) { teste.conflito = false; throw erro("DATA_CHANGED"); }    // painel de testes
      if (s.simulada) { teste.docSimulado = structuredClone(d.documento); return { salvo: true }; }
      if (s.demo) return { salvo: true };      // demonstração: as alterações ficam só na memória desta aba
      const va = s.versao;
      const conteudo = await cifrar(s.chave, s.email, va + 1, d.documento);
      // o servidor recusa (409) se outro dispositivo gravou depois da nossa leitura
      let r: RespostaApi | null;
      try { r = await comProvaDaSessao(() => api("PUT", "/documento", { versaoAnterior: va, conteudo }, s.prova)); }
      catch (e) { throw incerto(e) ? erro("SAVE_UNCONFIRMED") : e; }   // sem resposta: o serviço relê do servidor
      if (!r || typeof r.versao !== "number") throw erro("SAVE_UNCONFIRMED");                    // resposta ilegível
      if (r.versao !== va + 1) throw erro("DATA_CHANGED");
      s.versao = va + 1;
      await lembrarVersao(s.email, s.versao);
      return { salvo: true };
    },

    async changePassword(d) {
      const s = exigirConta();
      validarSenha(d.novaSenha);
      const codigo = codigo2FA(d);
      if (simulada(s)) { if (s.doisFatores && !/^\d{6}$/.test(codigo || "")) throw erro(codigo ? "CODE_INVALID" : "CODE_REQUIRED"); return { alterada: true }; }
      const atual = await derivarConta(d.senhaAtual, await parametros(s.email));
      atual.bits.fill(0);
      const doc = await api("GET", "/documento", undefined, atual.prova);     // senha errada → WRONG_PASSWORD
      if (await senhaVazada(d.novaSenha)) throw erro("PASSWORD_BREACHED");
      let documento: unknown = null;
      if (doc) { try { documento = await decifrar(atual.chave, s.email, doc.versao, doc.conteudo); } catch (e) { throw erro("LOAD_FAILED"); } }
      const va: number = doc ? doc.versao : 0;
      const sal = aleatorio(16);
      const nova = await derivar(d.novaSenha, sal, ITERACOES, KDF_ARGON2);           // senha nova já em Argon2id
      const conteudo = await cifrar(nova.chave, s.email, va + 1, documento);
      // troca atômica no servidor: novo sal + nova prova + documento recifrado (e os outros dispositivos saem)
      try {
        await api("PUT", "/conta/senha", { sal: b64(sal), iteracoes: ITERACOES, kdf: KDF_ARGON2, prova: nova.prova, conteudo, versaoAnterior: va, codigo }, atual.prova);
      } catch (e) { nova.bits.fill(0); throw incerto(e) ? erro("PASSWORD_UNCONFIRMED") : e; }   // trocou ou não: a tela orienta
      let recuperacaoPendente = false;
      if (sessao === s) {
        Object.assign(s, { chave: nova.chave, prova: nova.prova, versao: va + 1 });
        await guardarChaveLocal(s.email, s.envelope, nova.bits, nova.prova);
        recuperacaoPendente = !(await guardarCustodia(s, nova.bits));   // a cópia antiga (recuperação) foi apagada pelo servidor
      }
      nova.bits.fill(0);
      await lembrarVersao(s.email, va + 1);
      return recuperacaoPendente ? { alterada: true, recuperacaoPendente } : { alterada: true };
    },

    async updateUser(d) {
      const s = exigirConta();
      const nome = limparNome(d.nomeUsuario);
      if (!nome) throw erro("OPERATION_FAILED");
      if (simulada(s)) { s.nome = nome; return sessaoData(); }
      const k = await derivarConta(d.senhaAtual, await parametros(s.email));
      k.bits.fill(0);
      await api("PUT", "/conta/nome", { nome }, k.prova);                     // senha errada → WRONG_PASSWORD
      s.nome = nome;
      return sessaoData();
    },

    async wipeUserData(d) {
      const s = exigirConta();
      if (simulada(s)) { teste.docSimulado = null; return { apagado: true }; }
      const k = await derivarConta(d.senha, await parametros(s.email));
      k.bits.fill(0);
      const doc = await api("GET", "/documento", undefined, k.prova);         // confere a senha e a versão atual
      const va: number = doc ? doc.versao : 0;
      const conteudo = await cifrar(k.chave, s.email, va + 1, null);
      await api("POST", "/documento/apagar", { versaoAnterior: va, conteudo }, k.prova);
      if (sessao === s) s.versao = va + 1;
      await esquecerVersao(s.email);              // recomeço deliberado: vale também depois de "documento sumido"
      await lembrarVersao(s.email, va + 1);
      return { apagado: true };
    },

    /** Excluir a conta: a frase EXCLUIR CONTA (no lugar da senha) e, com 2FA, o código atual; usa a prova da sessão */
    async deleteUser(d) {
      const s = exigirConta();
      const confirmacao = String((d && d.confirmacao) || ""), codigo = codigo2FA(d);
      if (confirmacao !== "EXCLUIR CONTA") throw erro("CONFIRMATION_REQUIRED");
      if (simulada(s)) {
        if (s.doisFatores && !/^\d{6}$/.test(codigo || "")) throw erro(codigo ? "CODE_INVALID" : "CODE_REQUIRED");
        sessao = null; teste.emailSimulado = ""; teste.docSimulado = null; return { excluido: true };
      }
      await comProvaDaSessao(() => api("DELETE", "/conta", { confirmacao, codigo }, s.prova));
      await esquecerVersao(s.email);
      esquecerChaveLocal();
      sessao = null;
      return { excluido: true };
    },

    /* ---- "Esqueci minha senha" ---- */
    async pedirRecuperacao(d) {
      await api("POST", "/recuperacao/pedir", { email: normalizarEmail(d && d.email) });
      return { enviado: true };
    },

    /**
     * Link do e-mail (+ código do 2FA): abre os dados com a cópia da chave e guarda tudo só na memória.
     * O servidor entrega um passe só para esta aba (etapas e conclusão exigem o link E o passe).
     * manter = os dados voltam com a senha nova. Documento atual ilegível: a cópia legível mais recente do
     * histórico volta no lugar (restaurada, com a data). Sem nada legível, motivo diz por quê (proteção avançada,
     * cópia da chave ainda não guardada, cópia que não abre ou dados ilegíveis) e a conta só pode recomeçar vazia
     * depois de a pessoa confirmar. Falha de rede ou do servidor não chega aqui: vira erro e nada é oferecido.
     */
    async abrirRecuperacao(d) {
      recuperacao = null;
      const token = String((d && d.token) || "");
      if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) throw erro("TOKEN_INVALID");
      const codigo = d && d.codigo !== undefined ? String(d.codigo || "") : undefined;
      const r = await api("POST", "/recuperacao/abrir", { token, codigo });
      if (!r || typeof r.email !== "string" || typeof r.passe !== "string") throw erro("TOKEN_INVALID");
      const email = r.email, versao = Number.isSafeInteger(r.versao) && r.versao >= 0 ? r.versao : 0;
      const rec: Recuperacao = { token, passe: r.passe, email, versao, manter: false, documento: null, historico: [] };
      let motivo: MotivoRecuperacao | null = null, restaurada: { versao: number; quando: string | null } | null = null, descartadas = 0;
      let chave: CryptoKey | null = null;
      if (!r.custodia) motivo = r.avancada === true ? "avancada" : "sem_copia";
      else { try { chave = await abrirCustodia(email, r.custodia); } catch (e) { motivo = "copia_invalida"; } }
      if (chave) {
        // cada versão por si: uma cópia estragada não esconde as outras
        for (const v of (Array.isArray(r.historico) ? r.historico : [])) {
          try { rec.historico.push({ versao: v.versao, claro: await decifrar(chave, email, v.versao, v.conteudo), quando: typeof v.criado_em === "string" ? v.criado_em : null }); }
          catch (e) { descartadas += 1; }          // cópia que já não abria: fica de fora (a tela conta quantas)
        }
        let atual = !r.documento;                   // sem documento e sem histórico: conta sem dados, nada a perder
        if (r.documento) {
          try { rec.documento = await decifrar(chave, email, r.documento.versao, r.documento.conteudo); atual = true; }
          catch (e) { atual = false; }
        }
        if ((!atual || !r.documento) && rec.historico.length) {
          // o documento atual não abre (ou sumiu): volta a cópia legível mais recente do histórico
          const h0 = rec.historico[0];
          rec.documento = h0.claro;
          restaurada = { versao: h0.versao, quando: h0.quando };
          rec.manter = true;
        } else if (atual) rec.manter = true;
        else motivo = "dados_ilegiveis";
      }
      recuperacao = rec;
      return { email, manter: rec.manter, motivo, restaurada, descartadas };
    },

    /** Senha nova: recifra os dados (ou recomeça vazia, se confirmado) e conclui numa transação no servidor */
    async concluirRecuperacao(d) {
      const rec = recuperacao;
      if (!rec) throw erro("TOKEN_INVALID");
      if (!rec.manter && d.recomecar !== true) throw erro("OPERATION_FAILED");
      validarSenha(d.senha);
      if (await senhaVazada(d.senha)) throw erro("PASSWORD_BREACHED");
      const sal = aleatorio(16);
      const nova = await derivar(d.senha, sal, ITERACOES, KDF_ARGON2);
      try {
        const conteudo = await cifrar(nova.chave, rec.email, rec.versao + 1, rec.manter ? rec.documento : null);
        let historico: Array<{ versao: number; conteudo: string }> = [];
        let tamanho = conteudo.length + 1000;
        if (rec.manter) {
          for (const v of rec.historico) {
            const c = await cifrar(nova.chave, rec.email, v.versao, v.claro);
            tamanho += c.length + 40;
            historico.push({ versao: v.versao, conteudo: c });
          }
          if (tamanho > LIMITE_PEDIDO) {           // não cabe num pedido: uma cópia por pedido, como na migração
            for (const h of historico) await api("PUT", "/recuperacao/historico", { token: rec.token, passe: rec.passe, sal: b64(sal), versao: h.versao, conteudo: h.conteudo });
            historico = [];
          }
        }
        try {
          await api("PUT", "/recuperacao/concluir", { token: rec.token, passe: rec.passe, modo: rec.manter ? "manter" : "recomecar", sal: b64(sal),
            kdf: KDF_ARGON2, prova: nova.prova, conteudo, versaoAnterior: rec.versao, historico });
        } catch (e) { throw incerto(e) ? erro("RECOVERY_UNCONFIRMED") : e; }   // pode ter concluído: a tela orienta
      } finally { nova.bits.fill(0); }
      recuperacao = null;
      esquecerChaveLocal();                       // a chave guardada era da senha antiga
      return { email: rec.email, recomecou: !rec.manter };
    },

    /* ---- Proteção avançada (sem cópia da chave: esqueceu a senha, a conta recomeça vazia) ---- */
    async getProtecao() {
      const s = exigirConta();
      if (simulada(s)) return { avancada: teste.protecao, recuperacao: !teste.protecao };
      const r = await comProvaDaSessao(() => api("GET", "/custodia", undefined, s.prova));
      return { avancada: !!(r && r.avancada === true), recuperacao: !!(r && r.ativa === true) };
    },
    /** Recuperação pendente (a cópia da chave não foi guardada): guarda agora, com a senha atual */
    async repararRecuperacao(d) {
      const s = exigirConta();
      if (simulada(s)) { if (!d.senha) throw erro("WRONG_PASSWORD"); return ACOES.getProtecao({}); }
      const k = await derivarConta(d.senha, await parametros(s.email));
      try {
        await api("GET", "/custodia", undefined, k.prova);                          // senha errada → WRONG_PASSWORD
        if (!(await guardarCustodia(Object.assign({}, s, { prova: k.prova }), k.bits))) throw erro("STORAGE_UNAVAILABLE");
      } finally { k.bits.fill(0); }
      return ACOES.getProtecao({});
    },
    async setProtecao(d) {
      const s = exigirConta();
      const codigo = d.avancada === true ? undefined : codigo2FA(d);          // desligar, com 2FA: código atual
      if (simulada(s)) {
        if (!d.senha) throw erro("WRONG_PASSWORD");
        if (d.avancada !== true && s.doisFatores && !/^\d{6}$/.test(codigo || "")) throw erro(codigo ? "CODE_INVALID" : "CODE_REQUIRED");
        teste.protecao = d.avancada === true; return ACOES.getProtecao({});
      }
      const k = await derivarConta(d.senha, await parametros(s.email));
      try {
        await api("PUT", "/conta/protecao", { avancada: d.avancada === true, codigo }, k.prova);   // senha errada → WRONG_PASSWORD
        if (d.avancada !== true) await guardarCustodia(Object.assign({}, s, { prova: k.prova }), k.bits);
      } finally { k.bits.fill(0); }
      return ACOES.getProtecao({});
    },

    /* ---- Zo, o assistente: consentimento e conversa (a API leva ao Gemini; as ferramentas rodam aqui, no navegador) ---- */
    async zoConsentimento(d) {
      const s = exigirConta();
      const aceito = d && typeof d.aceito === "boolean" ? d.aceito : undefined;
      if (simulada(s)) { if (aceito !== undefined) teste.zoAceito = aceito; return { aceito: teste.zoAceito }; }
      const r = await comProvaDaSessao(() => (aceito === undefined
        ? api("GET", "/zo/consentimento", undefined, s.prova)
        : api("PUT", "/zo/consentimento", { aceito }, s.prova)));
      return { aceito: !!(r && r.aceito === true) };
    },
    async zoConversar(d) {
      const s = exigirConta();
      if (simulada(s)) return { texto: "Modo teste. O Zo de verdade responde com a API local ou na prévia.", chamadas: [] };
      const r = await comProvaDaSessao(() => api("POST", "/zo", { mensagens: d && Array.isArray(d.mensagens) ? d.mensagens : [] }, s.prova));
      const chamadas = r && Array.isArray(r.chamadas) ? r.chamadas.filter((c: RespostaApi) => c && typeof c.id === "string" && typeof c.nome === "string" && typeof c.argumentos === "string")
        .map((c: RespostaApi) => ({ id: c.id as string, nome: c.nome as string, argumentos: c.argumentos as string })) : [];
      return { texto: r && typeof r.texto === "string" ? r.texto : null, chamadas };
    },

    /* ---- 2FA (a senha já foi provada no login: usa a prova da sessão) ---- */
    async iniciar2FA() {
      const s = exigirConta();
      if (simulada(s)) { const c = base32(aleatorio(20)); return { chave: c, uri: "otpauth://totp/ZoZo:" + encodeURIComponent(s.email) + "?secret=" + c + "&issuer=ZoZo%20(teste)" }; }
      const r = await comProvaDaSessao(() => api("POST", "/2fa/iniciar", undefined, s.prova));
      if (!r || typeof r.chave !== "string" || typeof r.uri !== "string") throw erro("OPERATION_FAILED");
      return { chave: r.chave, uri: r.uri };
    },
    async confirmar2FA(d) {
      const s = exigirConta();
      if (simulada(s)) { if (!/^\d{6}$/.test(String(d.codigo || ""))) throw erro("CODE_INVALID"); s.doisFatores = true; return sessaoData(); }
      await comProvaDaSessao(() => api("POST", "/2fa/confirmar", { codigo: String(d.codigo || "") }, s.prova));
      s.doisFatores = true;
      return sessaoData();
    },
    async desativar2FA(d) {
      const s = exigirConta();
      if (simulada(s)) { if (!/^\d{6}$/.test(String((d && d.codigo) || ""))) throw erro("CODE_INVALID"); s.doisFatores = false; return sessaoData(); }
      await comProvaDaSessao(() => api("POST", "/2fa/desativar", { codigo: String((d && d.codigo) || "") }, s.prova));
      s.doisFatores = false;
      return sessaoData();
    },
  };

  async function handle(req: PedidoPonte): Promise<RespostaPonte> {
    const base = { type: "response" as const, action: req.action, requestId: req.requestId };
    // só as ações da tabela (Object.hasOwn: nada de constructor, toString… herdados)
    const f = Object.hasOwn(ACOES, req.action) ? ACOES[req.action] : null;
    if (!f) return Object.assign(base, { success: false, error: { code: "NOT_IMPLEMENTED" } });
    try {
      const dados = (req.data && typeof req.data === "object" ? req.data : {}) as Dados;
      return Object.assign(base, { success: true, data: await f(dados) });
    } catch (e) {
      const x = (e && typeof e === "object" ? e : {}) as Partial<ErroHost>;
      return Object.assign(base, { success: false, error: { code: x.code || "OPERATION_FAILED", espera: x.espera, captcha: x.captcha } });
    }
  }

  const host: HostPonte = { handle };
  ZoZo.webHost = host;

  // Controles do painel de testes: só existem no endereço local e na prévia
  if (TESTE) ZoZo.testeHost = Object.freeze({
    simulando: () => teste.simular,
    simular(ligar: boolean) {
      teste.simular = !!ligar;
      try { if (ligar) sessionStorage.setItem(CHAVE_SIMULAR, "1"); else sessionStorage.removeItem(CHAVE_SIMULAR); } catch (e) { /* ok */ }
    },
    falhar(codigo: string | null) { teste.falha = codigo; },
    falhaAtual: () => teste.falha,
    conflitoNaProxima() { teste.conflito = true; },
    /** Dados de exemplo na conta simulada (a demo já sorteia os dela a cada leitura) */
    carregarExemplo() {
      if (!sessao || !sessao.simulada || !ZoZo.demo) return false;
      teste.docSimulado = ZoZo.demo.documento(new Date(), true);
      return true;
    },
    estado: () => ({ endereco: hostAtual, simulacao: teste.simular, falha: teste.falha,
      sessao: !sessao ? "nenhuma" : sessao.simulada ? "simulada (sem servidor)" : sessao.demo ? "demonstração" : "conta real (prévia)" }),
  });
})(window.ZoZo);
