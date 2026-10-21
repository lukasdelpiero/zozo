// Testes do host da versão web (js/bridge/host-web.js): criptografia de ponta a ponta, sessão e respostas da API.
// A API é um servidor falso em memória; a derivação das chaves e o formato do documento são conferidos com uma
// implementação independente (aqui no teste): documentos já gravados precisam continuar abrindo.
// Escritos ANTES da conversão do host para TypeScript.
//   node --test ui/tests
import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto, createHash, randomUUID } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";
import { argon2id } from "hash-wasm";
import { carregarHost } from "./carregar.mjs";

const subtle = webcrypto.subtle;
const enc = new TextEncoder();
const b64 = (u8) => Buffer.from(u8).toString("base64");
const sha256 = (t) => createHash("sha256").update(t).digest("hex");
const novaSenha = () => "Teste-" + randomUUID();                 // senha descartável de cada teste
const codigo = (c) => (e) => { assert.equal(e.code, c); return true; };

test("documento acima do limite expandido não substitui a cópia legível", async () => {
  const srv = servidorFalso();
  const h = await cadastrar(srv, "limite@exemplo.test", novaSenha());
  await h.chamar("saveUserData", { documento: { intacto: true } });
  const anterior = structuredClone(srv.contas.get("limite@exemplo.test").doc);
  const documento = { texto: "a".repeat(40 * 1024 * 1024) };
  await assert.rejects(h.chamar("saveUserData", { documento }), codigo("DOCUMENT_TOO_LARGE"));
  assert.deepEqual(srv.contas.get("limite@exemplo.test").doc, anterior);
  assert.deepEqual((await h.chamar("loadUserData")).documento, { intacto: true });
});

test("documento autenticado que excede o limite expandido é recusado", async () => {
  const srv = servidorFalso(), email = "expandido@exemplo.test", senha = novaSenha();
  const h = await cadastrar(srv, email, senha);
  const c = srv.contas.get(email);
  const ref = await derivarRef(senha, Buffer.from(c.sal, "base64"), c.kdf, c.iteracoes);
  const chave = await subtle.importKey("raw", ref.dados, "AES-GCM", false, ["encrypt"]);
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const zip = gzipSync(JSON.stringify({ texto: "a".repeat(40 * 1024 * 1024) }));
  const ct = await subtle.encrypt({ name: "AES-GCM", iv, additionalData: enc.encode("zozo|v2|" + email + "|1") }, chave, zip);
  c.doc = { versao: 1, conteudo: Buffer.concat([Buffer.from([2]), iv, Buffer.from(ct)]).toString("base64") };
  await assert.rejects(h.chamar("loadUserData"), codigo("LOAD_FAILED"));
});

/* ---------------- implementação de referência (independente do host) ---------------- */
async function derivarRef(senha, sal, kdf, iteracoes) {
  let mestre;
  if (kdf === "argon2id-1") {
    mestre = await argon2id({ password: senha.normalize("NFC"), salt: sal, memorySize: 65536, iterations: 3, parallelism: 1, hashLength: 32, outputType: "binary" });
  } else {
    const base = await subtle.importKey("raw", enc.encode(senha.normalize("NFC")), "PBKDF2", false, ["deriveBits"]);
    mestre = new Uint8Array(await subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: sal, iterations: iteracoes }, base, 256));
  }
  const hk = await subtle.importKey("raw", mestre, "HKDF", false, ["deriveBits"]);
  const bits = async (uso) => new Uint8Array(await subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt: new Uint8Array(32), info: enc.encode("zozo/" + uso + "/v2") }, hk, 256));
  return { dados: await bits("dados"), prova: b64(await bits("prova")) };
}
/** Abre um documento gravado: [2][iv 12][AES-256-GCM(gzip(JSON))], AAD "zozo|v2|email|versão" */
/** Cifra como o host: [2][iv 12][AES-256-GCM(gzip(JSON))], AAD "zozo|v2|email|versão" */
async function cifrarRef(dados, email, versao, objeto) {
  const chave = await subtle.importKey("raw", dados, "AES-GCM", false, ["encrypt"]);
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const ct = await subtle.encrypt({ name: "AES-GCM", iv, additionalData: enc.encode("zozo|v2|" + email + "|" + versao) }, chave, gzipSync(JSON.stringify(objeto)));
  return Buffer.concat([Buffer.from([2]), iv, Buffer.from(ct)]).toString("base64");
}
async function abrirRef(dados, email, versao, conteudo) {
  const tudo = Buffer.from(conteudo, "base64");
  assert.equal(tudo[0], 2, "formato do documento");
  const chave = await subtle.importKey("raw", dados, "AES-GCM", false, ["decrypt"]);
  const claro = await subtle.decrypt({ name: "AES-GCM", iv: tudo.subarray(1, 13), additionalData: enc.encode("zozo|v2|" + email + "|" + versao) }, chave, tudo.subarray(13));
  return JSON.parse(gunzipSync(Buffer.from(claro)).toString("utf8"));
}

/* ---------------- API falsa (o que o servidor real faz, em memória) ---------------- */
function servidorFalso() {
  const contas = new Map();          // email → { nome, sal, iteracoes, kdf, provaHash, doc, historico[], demo, recursos }
  const pedidos = [];                // tudo o que o navegador mandou (para conferir que nada legível saiu)
  const vazadas = new Map();         // prefixo SHA-1 (5) → lista "SUFIXO:N"
  const s = { contas, pedidos, vazadas, logado: null, envelope: null, parametros: null, resposta: null };
  const json = (status, corpo) => new Response(corpo === undefined ? null : JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });
  const novoEnvelope = () => { s.envelope = b64(webcrypto.getRandomValues(new Uint8Array(32))); return s.envelope; };
  const sessao = (c, email) => ({ email, nome: c.nome, envelope: s.envelope, demo: c.demo === true, recursos: c.recursos || {}, doisFatores: false });
  s.fetch = async (url, init = {}) => {
    const u = new URL(url, "http://zozo.test");
    const metodo = init.method || "GET";
    const corpo = init.body ? JSON.parse(init.body) : undefined;
    const prova = (init.headers || {})["X-ZoZo-Prova"];
    pedidos.push({ metodo, caminho: u.pathname + u.search, corpo: init.body || "", prova: prova || "" });
    if (s.resposta) { const r = s.resposta(metodo, u.pathname); if (r) return r; }
    const caminho = u.pathname.replace(/^\/api/, "");
    const c = s.logado ? contas.get(s.logado) : null;
    const comProva = () => {
      if (!c) return json(401, { erro: "SESSION_EXPIRED" });
      if (!prova || sha256(prova) !== c.provaHash) return json(403, { erro: "WRONG_PASSWORD" });
      return null;
    };
    if (metodo === "GET" && caminho === "/publico") return json(200, { turnstile: null, google: false });
    if (metodo === "GET" && caminho.startsWith("/senha-vazada/")) return json(200, { lista: vazadas.get(caminho.slice(14)) || "" });
    if (metodo === "GET" && caminho === "/conta/parametros") {
      if (s.parametros) return json(200, s.parametros);
      const a = contas.get(u.searchParams.get("email"));
      return json(200, a ? { sal: a.sal, iteracoes: a.iteracoes, kdf: a.kdf } : { sal: b64(new Uint8Array(16).fill(7)), iteracoes: 600000, kdf: "argon2id-1" });
    }
    if (metodo === "POST" && caminho === "/conta") {
      if (contas.has(corpo.email)) return json(409, { erro: "EMAIL_IN_USE" });
      contas.set(corpo.email, { nome: corpo.nome, sal: corpo.sal, iteracoes: corpo.iteracoes, kdf: corpo.kdf, provaHash: sha256(corpo.prova), doc: null, historico: [] });
      s.logado = corpo.email; novoEnvelope();
      return json(200, sessao(contas.get(corpo.email), corpo.email));
    }
    if (metodo === "POST" && caminho === "/sessao") {
      const a = contas.get(corpo.email);
      if (!a || sha256(corpo.prova) !== a.provaHash) return json(401, { erro: "INVALID_CREDENTIALS" });
      s.logado = corpo.email; novoEnvelope();
      return json(200, sessao(a, corpo.email));
    }
    if (metodo === "GET" && caminho === "/sessao") return c ? json(200, sessao(c, s.logado)) : new Response(null, { status: 204 });
    if (metodo === "DELETE" && caminho === "/sessao") { s.logado = null; s.envelope = null; return new Response(null, { status: 204 }); }
    const recusa = comProva();
    if (recusa) return recusa;
    if (metodo === "GET" && caminho === "/documento") return c.doc ? json(200, c.doc) : json(404, { erro: "NOT_FOUND" });
    if (metodo === "GET" && caminho === "/documento/versao") return json(200, { versao: c.doc ? c.doc.versao : 0 });
    if (metodo === "GET" && caminho === "/historico") return json(200, { versoes: c.historico.slice().reverse() });
    if (metodo === "PUT" && caminho === "/documento") {
      if (corpo.versaoAnterior !== (c.doc ? c.doc.versao : 0)) return json(409, { erro: "DATA_CHANGED" });
      if (c.doc) c.historico.push(c.doc);
      c.doc = { versao: corpo.versaoAnterior + 1, conteudo: corpo.conteudo };
      return json(200, { versao: c.doc.versao });
    }
    if (metodo === "PUT" && caminho === "/conta/kdf") {
      if ((c.kdf || "pbkdf2") !== "pbkdf2") return json(409, { erro: "KDF_CURRENT" });
      if (corpo.kdf !== "argon2id-1" || !Array.isArray(corpo.historico)) return json(400, { erro: "INVALID_REQUEST" });
      if (corpo.versaoAnterior !== (c.doc ? c.doc.versao : 0)) return json(409, { erro: "DATA_CHANGED" });
      const existentes = new Set(c.historico.map((x) => x.versao));
      if (corpo.historico.some((x) => !existentes.has(x.versao))) return json(400, { erro: "INVALID_REQUEST" });
      Object.assign(c, { sal: corpo.sal, kdf: "argon2id-1", iteracoes: 600000, provaHash: sha256(corpo.prova),
        doc: { versao: corpo.versaoAnterior + 1, conteudo: corpo.conteudo }, historico: corpo.historico.slice().sort((a, b) => a.versao - b.versao) });
      return json(200, { versao: c.doc.versao });
    }
    if (metodo === "PUT" && caminho === "/conta/senha") {
      if (corpo.versaoAnterior !== (c.doc ? c.doc.versao : 0)) return json(409, { erro: "DATA_CHANGED" });
      Object.assign(c, { sal: corpo.sal, iteracoes: corpo.iteracoes, kdf: corpo.kdf, provaHash: sha256(corpo.prova), doc: { versao: corpo.versaoAnterior + 1, conteudo: corpo.conteudo }, historico: [] });
      return json(200, { alterada: true });
    }
    return json(404, { erro: "NOT_FOUND" });
  };
  return s;
}

/** Cadastra uma conta nova (Argon2id) e devolve o host já com a sessão aberta */
async function cadastrar(srv, email, senha, armazenamento) {
  const h = carregarHost({ fetch: srv.fetch, armazenamento });
  const r = await h.chamar("registerUser", { email, senha, nomeUsuario: "Teste" });
  assert.equal(r.authenticated, true);
  return h;
}

test("cadastro e documento: o servidor só recebe dados cifrados; nunca a senha nem o conteúdo", async () => {
  const srv = servidorFalso();
  const senha = novaSenha();
  const h = await cadastrar(srv, "  Ana@Exemplo.TEST ", senha);
  const conta = srv.contas.get("ana@exemplo.test");
  assert.ok(conta, "e-mail normalizado (minúsculas, sem espaços)");
  assert.equal(conta.kdf, "argon2id-1");
  const documento = { lancamentos: [{ descricao: "Supermercado-Segredo-123", valor: 42.5 }] };
  await h.chamar("saveUserData", { documento });
  assert.equal(conta.doc.versao, 1);
  const lido = await h.chamar("loadUserData");
  assert.deepEqual(lido.documento, documento);
  assert.equal(lido.aviso, null);
  for (const p of srv.pedidos) {
    const tudo = p.caminho + p.corpo + p.prova;
    assert.ok(!tudo.includes(senha), "a senha não sai do navegador (" + p.caminho + ")");
    assert.ok(!tudo.includes("Supermercado-Segredo"), "o conteúdo não sai legível (" + p.caminho + ")");
  }
  // neste navegador, só a chave cifrada com o envelope da sessão (nada legível)
  const guardado = h.armazenamento.get("zozo.sessao");
  assert.deepEqual(Object.keys(JSON.parse(guardado)).sort(), ["c", "e", "iv"]);
  assert.ok(![...h.armazenamento.values()].some((v) => v.includes(senha) || v.includes("Supermercado")));
});

test("derivações fixas: Argon2id e PBKDF2 → HKDF (zozo/prova/v2, zozo/dados/v2) e formato do documento", async () => {
  const srv = servidorFalso();
  // conta nova (Argon2id): a prova enviada e o documento conferem com a referência
  const senha = novaSenha();
  const h = await cadastrar(srv, "nova@exemplo.test", senha);
  const nova = srv.contas.get("nova@exemplo.test");
  const ref = await derivarRef(senha, Buffer.from(nova.sal, "base64"), "argon2id-1");
  assert.equal(sha256(ref.prova), nova.provaHash);
  assert.equal(Buffer.from(nova.sal, "base64").length, 16);
  await h.chamar("saveUserData", { documento: { ok: "argon" } });
  assert.deepEqual(await abrirRef(ref.dados, "nova@exemplo.test", 1, nova.doc.conteudo), { ok: "argon" });

  // conta antiga (PBKDF2-SHA256, 600.000 iterações): a senha entra (prova PBKDF2 → HKDF), o documento gravado com a chave
  // antiga abre, e a conta passa para Argon2id (o documento novo abre com a derivação Argon2id do sal novo)
  const senhaAntiga = novaSenha();
  const sal = new Uint8Array(16).map((_, i) => i * 7);
  const refAntiga = await derivarRef(senhaAntiga, sal, "pbkdf2", 600000);
  srv.contas.set("antiga@exemplo.test", { nome: "Antiga", sal: b64(sal), iteracoes: 600000, kdf: "pbkdf2", provaHash: sha256(refAntiga.prova),
    doc: { versao: 1, conteudo: await cifrarRef(refAntiga.dados, "antiga@exemplo.test", 1, { ok: "pbkdf2" }) }, historico: [] });
  const h2 = carregarHost({ fetch: srv.fetch });
  await h2.chamar("login", { email: "antiga@exemplo.test", senha: senhaAntiga });
  const antiga = srv.contas.get("antiga@exemplo.test");
  assert.equal(antiga.kdf, "argon2id-1");
  const refMigrada = await derivarRef(senhaAntiga, Buffer.from(antiga.sal, "base64"), "argon2id-1");
  assert.equal(sha256(refMigrada.prova), antiga.provaHash);
  assert.deepEqual(await abrirRef(refMigrada.dados, "antiga@exemplo.test", 2, antiga.doc.conteudo), { ok: "pbkdf2" });
});

/* ---------------- conta antiga (PBKDF2) → Argon2id no login ---------------- */
async function contaAntiga(srv, email, senha, { versoes = 3, estragada = null } = {}) {
  const sal = webcrypto.getRandomValues(new Uint8Array(16));
  const ref = await derivarRef(senha, sal, "pbkdf2", 600000);
  const historico = [];
  for (let v = 1; v < versoes; v++) {
    let conteudo = await cifrarRef(ref.dados, email, v, { versao: v, texto: "Supermercado-Segredo-" + v });
    if (v === estragada) { const b = Buffer.from(conteudo, "base64"); b[b.length - 3] ^= 1; conteudo = b.toString("base64"); }
    historico.push({ versao: v, conteudo });
  }
  const doc = { versao: versoes, conteudo: await cifrarRef(ref.dados, email, versoes, { versao: versoes, texto: "Supermercado-Segredo-atual" }) };
  srv.contas.set(email, { nome: "Antiga", sal: b64(sal), iteracoes: 600000, kdf: "pbkdf2", provaHash: sha256(ref.prova), doc, historico });
  return ref;
}

test("conta antiga: o login migra para Argon2id; documento e histórico continuam abrindo; nada sai legível", async () => {
  const srv = servidorFalso(), email = "legado@exemplo.test", senha = novaSenha();
  const antiga = await contaAntiga(srv, email, senha, { versoes: 4, estragada: 1 });
  const h = carregarHost({ fetch: srv.fetch });
  await h.chamar("login", { email, senha });
  const c = srv.contas.get(email);
  assert.equal(c.kdf, "argon2id-1");
  assert.equal(Buffer.from(c.sal, "base64").length, 16);
  const nova = await derivarRef(senha, Buffer.from(c.sal, "base64"), "argon2id-1");
  assert.equal(sha256(nova.prova), c.provaHash);
  assert.notEqual(sha256(antiga.prova), c.provaHash);                                // a prova antiga não vale mais
  // documento atual (versão nova) e histórico recifrados com a chave Argon2id; a cópia estragada ficou de fora
  assert.deepEqual(await abrirRef(nova.dados, email, 5, c.doc.conteudo), { versao: 4, texto: "Supermercado-Segredo-atual" });
  assert.deepEqual(c.historico.map((x) => x.versao), [2, 3]);
  for (const v of c.historico) assert.deepEqual(await abrirRef(nova.dados, email, v.versao, v.conteudo), { versao: v.versao, texto: "Supermercado-Segredo-" + v.versao });
  // a sessão segue com a chave nova: lê e grava sem pedir a senha de novo
  assert.deepEqual((await h.chamar("loadUserData")).documento, { versao: 4, texto: "Supermercado-Segredo-atual" });
  await h.chamar("saveUserData", { documento: { depois: true } });
  assert.deepEqual(await abrirRef(nova.dados, email, 6, c.doc.conteudo), { depois: true });
  // recarga: a chave guardada neste navegador é a nova
  const recarga = carregarHost({ fetch: srv.fetch, armazenamento: h.armazenamento });
  assert.equal((await recarga.chamar("getSession")).authenticated, true);
  assert.deepEqual((await recarga.chamar("loadUserData")).documento, { depois: true });
  for (const p of srv.pedidos) {
    const tudo = p.caminho + p.corpo + p.prova;
    assert.ok(!tudo.includes(senha) && !tudo.includes("Supermercado-Segredo"), "nada legível sai do navegador (" + p.caminho + ")");
  }
  // o próximo login já é Argon2id: não migra de novo
  const outra = carregarHost({ fetch: srv.fetch });
  const antes = srv.pedidos.length;
  await outra.chamar("login", { email, senha });
  assert.ok(!srv.pedidos.slice(antes).some((p) => p.caminho === "/api/conta/kdf"));
});

test("conta antiga: se a migração falhar, o login entra assim mesmo e tenta de novo no próximo", async () => {
  const srv = servidorFalso(), email = "legado2@exemplo.test", senha = novaSenha();
  await contaAntiga(srv, email, senha);
  srv.resposta = (metodo, caminho) => (caminho === "/api/conta/kdf" ? new Response(JSON.stringify({ erro: "X" }), { status: 500, headers: { "content-type": "application/json" } }) : null);
  const h = carregarHost({ fetch: srv.fetch });
  assert.equal((await h.chamar("login", { email, senha })).authenticated, true);
  assert.equal(srv.contas.get(email).kdf, "pbkdf2");                                  // nada mudou no servidor
  assert.deepEqual((await h.chamar("loadUserData")).documento, { versao: 3, texto: "Supermercado-Segredo-atual" });
  srv.resposta = null;
  await h.chamar("logout");
  await carregarHost({ fetch: srv.fetch }).chamar("login", { email, senha });
  assert.equal(srv.contas.get(email).kdf, "argon2id-1");                              // migrou no login seguinte
});

test("conta antiga com conflito (outro dispositivo gravou): não migra nem sobrescreve", async () => {
  const srv = servidorFalso(), email = "legado3@exemplo.test", senha = novaSenha();
  await contaAntiga(srv, email, senha);
  const c = srv.contas.get(email);
  // entre a leitura e a migração, outro dispositivo grava (o servidor responde 409)
  srv.resposta = (metodo, caminho) => {
    if (caminho === "/api/conta/kdf") c.doc = { versao: c.doc.versao + 1, conteudo: c.doc.conteudo };
    return null;
  };
  const h = carregarHost({ fetch: srv.fetch });
  assert.equal((await h.chamar("login", { email, senha })).authenticated, true);
  assert.equal(c.kdf, "pbkdf2");
  assert.equal(c.doc.versao, 4);
});

test("login: senha errada é recusada sem abrir sessão; a certa abre e lê o documento", async () => {
  const srv = servidorFalso();
  const senha = novaSenha();
  const h = await cadastrar(srv, "bia@exemplo.test", senha);
  await h.chamar("saveUserData", { documento: { n: 1 } });
  await h.chamar("logout");
  assert.equal(h.armazenamento.has("zozo.sessao"), false);
  const outro = carregarHost({ fetch: srv.fetch });
  await assert.rejects(outro.chamar("login", { email: "bia@exemplo.test", senha: senha + "x" }), codigo("INVALID_CREDENTIALS"));
  await assert.rejects(outro.chamar("loadUserData"), codigo("SESSION_EXPIRED"));
  await outro.chamar("login", { email: "BIA@exemplo.test", senha: senha.normalize("NFD") });       // mesma senha em outra forma Unicode
  assert.deepEqual((await outro.chamar("loadUserData")).documento, { n: 1 });
});

test("parâmetros fracos ou desconhecidos vindos do servidor são recusados antes de qualquer envio (rebaixamento)", async () => {
  const srv = servidorFalso();
  const h = carregarHost({ fetch: srv.fetch });
  const sal = b64(new Uint8Array(16).fill(1));
  for (const p of [{ sal, iteracoes: 1000, kdf: "pbkdf2" }, { sal, iteracoes: 600000.5, kdf: "pbkdf2" }, { sal, iteracoes: 20000000, kdf: "pbkdf2" },
    { sal, iteracoes: 600000, kdf: "md5" }, { sal: b64(new Uint8Array(8)), iteracoes: 600000, kdf: "argon2id-1" }, { sal: "!!!", iteracoes: 600000, kdf: "pbkdf2" },
    { sal: b64(new Uint8Array(65)), iteracoes: 600000, kdf: "pbkdf2" }, { sal, iteracoes: 1000 }]) {
    srv.parametros = p;
    await assert.rejects(h.chamar("login", { email: "x@exemplo.test", senha: novaSenha() }), codigo("STORAGE_UNAVAILABLE"), JSON.stringify(p));
  }
  assert.ok(!srv.pedidos.some((p) => p.metodo === "POST"), "nenhuma prova foi enviada");
});

test("documento adulterado: abre a cópia válida mais recente do histórico; sem nenhuma, LOAD_FAILED", async () => {
  const srv = servidorFalso();
  const h = await cadastrar(srv, "ana@exemplo.test", novaSenha());
  await h.chamar("saveUserData", { documento: { v: 1 } });
  await h.chamar("saveUserData", { documento: { v: 2 } });
  const c = srv.contas.get("ana@exemplo.test");
  const bytes = Buffer.from(c.doc.conteudo, "base64");
  bytes[bytes.length - 5] ^= 1;                                                 // um bit trocado no texto cifrado
  c.doc.conteudo = bytes.toString("base64");
  const r = await h.chamar("loadUserData");
  assert.deepEqual(r.documento, { v: 1 });
  assert.equal(r.aviso, "RESTORED_FROM_BACKUP");
  c.historico = [];
  await assert.rejects(h.chamar("loadUserData"), codigo("LOAD_FAILED"));
});

test("AAD: documento de outra versão ou de outra conta não abre", async () => {
  const srv = servidorFalso();
  const ha = await cadastrar(srv, "ana@exemplo.test", novaSenha());
  await ha.chamar("saveUserData", { documento: { dono: "ana" } });
  const a = srv.contas.get("ana@exemplo.test");
  const v1 = a.doc.conteudo;
  // o servidor tenta passar o conteúdo da versão 1 como versão 2
  a.doc = { versao: 2, conteudo: v1 };
  a.historico = [];
  await assert.rejects(ha.chamar("loadUserData"), codigo("LOAD_FAILED"));
  // outra conta recebe o documento da Ana (mesma versão): não abre
  const hb = await cadastrar(srv, "bia@exemplo.test", novaSenha());
  srv.contas.get("bia@exemplo.test").doc = { versao: 1, conteudo: v1 };
  await assert.rejects(hb.chamar("loadUserData"), codigo("LOAD_FAILED"));
});

test("servidor devolve uma versão mais antiga do que a já vista neste navegador: aviso OLDER_VERSION", async () => {
  const srv = servidorFalso();
  const h = await cadastrar(srv, "ana@exemplo.test", novaSenha());
  await h.chamar("saveUserData", { documento: { v: 1 } });
  const c = srv.contas.get("ana@exemplo.test");
  const primeira = c.doc;
  await h.chamar("saveUserData", { documento: { v: 2 } });
  c.doc = primeira;                                                              // "voltou no tempo"
  const r = await h.chamar("loadUserData");
  assert.deepEqual(r.documento, { v: 1 });
  assert.equal(r.aviso, "OLDER_VERSION");
});

test("documento sumido depois de já ter sido visto: sem backup, abre vazio e só para leitura", async () => {
  const srv = servidorFalso();
  const h = await cadastrar(srv, "ana@exemplo.test", novaSenha());
  await h.chamar("saveUserData", { documento: { v: 1 } });
  await h.chamar("loadUserData");
  const c = srv.contas.get("ana@exemplo.test");
  c.doc = null; c.historico = [];
  assert.deepEqual(await h.chamar("loadUserData"), { documento: null, aviso: "DOCUMENT_MISSING", somenteLeitura: true });
});

test("outro dispositivo gravou depois da leitura: DATA_CHANGED (nada é sobrescrito)", async () => {
  const srv = servidorFalso();
  const h = await cadastrar(srv, "ana@exemplo.test", novaSenha());
  await h.chamar("saveUserData", { documento: { v: 1 } });
  const c = srv.contas.get("ana@exemplo.test");
  c.doc = { versao: 2, conteudo: c.doc.conteudo };                              // gravação de outro dispositivo
  assert.deepEqual(await h.chamar("verificarAtualizacao"), { mudou: true, versao: 2 });
  await assert.rejects(h.chamar("saveUserData", { documento: { v: "meu" } }), codigo("DATA_CHANGED"));
  assert.equal(c.doc.versao, 2);
});

test("recarregar a página: a chave guardada só abre com o envelope desta sessão", async () => {
  const srv = servidorFalso();
  const armazenamento = new Map();
  const h = await cadastrar(srv, "ana@exemplo.test", novaSenha(), armazenamento);
  await h.chamar("saveUserData", { documento: { v: 1 } });
  // recarga: novo host, mesmo navegador e mesma sessão → entra sem a senha
  const recarga = carregarHost({ fetch: srv.fetch, armazenamento });
  assert.equal((await recarga.chamar("getSession")).authenticated, true);
  assert.deepEqual((await recarga.chamar("loadUserData")).documento, { v: 1 });
  // envelope de outra sessão (ex.: entrou de novo em outro lugar): a chave guardada vira lixo e é apagada
  srv.envelope = b64(webcrypto.getRandomValues(new Uint8Array(32)));
  const outra = carregarHost({ fetch: srv.fetch, armazenamento });
  const r = await outra.chamar("getSession");
  assert.equal(r.authenticated, false);
  assert.equal(armazenamento.has("zozo.sessao"), false);
  assert.ok(srv.pedidos.some((p) => p.metodo === "DELETE" && p.caminho === "/api/sessao"), "a sessão é encerrada no servidor");
});

test("prova recusada no meio da sessão (senha trocada em outro dispositivo): sessão encerrada com aviso", async () => {
  const srv = servidorFalso();
  const h = await cadastrar(srv, "ana@exemplo.test", novaSenha());
  srv.contas.get("ana@exemplo.test").provaHash = sha256("outra");
  await assert.rejects(h.chamar("loadUserData"), codigo("SESSION_EXPIRED"));
  const ev = h.eventos.find((e) => e.type === "zozo:sessao-expirada");
  assert.equal(ev && ev.detail.codigo, "SESSION_EXPIRED");
  await assert.rejects(h.chamar("saveUserData", { documento: {} }), codigo("SESSION_EXPIRED"));
});

test("trocar a senha: documento recifrado; a senha antiga deixa de entrar", async () => {
  const srv = servidorFalso();
  const antiga = novaSenha(), nova = novaSenha();
  const h = await cadastrar(srv, "ana@exemplo.test", antiga);
  await h.chamar("saveUserData", { documento: { v: "antes da troca" } });
  await assert.rejects(h.chamar("changePassword", { senhaAtual: antiga, novaSenha: "curta" }), codigo("WEAK_PASSWORD"));
  await h.chamar("changePassword", { senhaAtual: antiga, novaSenha: nova });
  assert.deepEqual((await h.chamar("loadUserData")).documento, { v: "antes da troca" });
  const outro = carregarHost({ fetch: srv.fetch });
  await assert.rejects(outro.chamar("login", { email: "ana@exemplo.test", senha: antiga }), codigo("INVALID_CREDENTIALS"));
  await outro.chamar("login", { email: "ana@exemplo.test", senha: nova });
  assert.deepEqual((await outro.chamar("loadUserData")).documento, { v: "antes da troca" });
});

test("cadastro: senha curta, longa ou vazada é recusada sem criar a conta; só 5 caracteres do hash saem", async () => {
  const srv = servidorFalso();
  const h = carregarHost({ fetch: srv.fetch });
  for (const senha of ["1234567", "x".repeat(257), 12345678, null]) {
    await assert.rejects(h.chamar("registerUser", { email: "ana@exemplo.test", senha, nomeUsuario: "Ana" }), codigo("WEAK_PASSWORD"));
  }
  assert.equal(srv.pedidos.length, 0);
  const vazada = novaSenha();
  const sha1 = createHash("sha1").update(vazada).digest("hex").toUpperCase();
  srv.vazadas.set(sha1.slice(0, 5), "0000000000000000000000000000000000A:1\n" + sha1.slice(5) + ":42");
  await assert.rejects(h.chamar("registerUser", { email: "ana@exemplo.test", senha: vazada, nomeUsuario: "Ana" }), codigo("PASSWORD_BREACHED"));
  const consulta = srv.pedidos.find((p) => p.caminho.startsWith("/api/senha-vazada/"));
  assert.match(consulta.caminho, /^\/api\/senha-vazada\/[0-9A-F]{5}$/);
  assert.ok(!srv.pedidos.some((p) => p.caminho === "/api/conta"));
  await assert.rejects(h.chamar("registerUser", { email: "ana@exemplo.test", senha: novaSenha(), nomeUsuario: "\u0000‮  " }), codigo("REGISTER_FAILED"));
});

test("cadastro: nome sem caracteres de controle nem de direção do texto", async () => {
  const srv = servidorFalso();
  const h = carregarHost({ fetch: srv.fetch });
  await h.chamar("registerUser", { email: "ana@exemplo.test", senha: novaSenha(), nomeUsuario: " ‮Ana\u0007 Maria​ " });
  assert.equal(srv.contas.get("ana@exemplo.test").nome, "Ana Maria");
});

test("recursos da conta: só o valor booleano true libera", async () => {
  const srv = servidorFalso();
  const senha = novaSenha();
  await cadastrar(srv, "ana@exemplo.test", senha);
  srv.contas.get("ana@exemplo.test").recursos = { perfis: "true", boleto: 1, pix: true, cambio: { sim: true } };
  const h = carregarHost({ fetch: srv.fetch });
  const r = await h.chamar("login", { email: "ana@exemplo.test", senha });
  assert.deepEqual(r.user.recursos, { perfis: false, boleto: false, pix: true, cambio: false });
});

test("conta de demonstração: nada é gravado no servidor e ações de conta são recusadas", async () => {
  const srv = servidorFalso();
  const senha = novaSenha();
  await cadastrar(srv, "demo@exemplo.test", senha);
  srv.contas.get("demo@exemplo.test").demo = true;
  const h = carregarHost({ fetch: srv.fetch });
  await h.chamar("login", { email: "demo@exemplo.test", senha });
  const antes = srv.pedidos.length;
  assert.deepEqual(await h.chamar("saveUserData", { documento: { x: 1 } }), { salvo: true });
  assert.deepEqual(await h.chamar("verificarAtualizacao"), { mudou: false });
  assert.equal(srv.pedidos.length, antes);
  for (const acao of ["changePassword", "updateUser", "wipeUserData", "deleteUser", "iniciar2FA"]) {
    await assert.rejects(h.chamar(acao, { senha, senhaAtual: senha, novaSenha: novaSenha(), nomeUsuario: "X" }), codigo("DEMO_READ_ONLY"), acao);
  }
});

test("ação desconhecida ou herdada de Object: NOT_IMPLEMENTED", async () => {
  const h = carregarHost({ fetch: servidorFalso().fetch });
  for (const action of ["naoExiste", "constructor", "toString", "__proto__", "hasOwnProperty", "valueOf"]) {
    const r = await h.host.handle({ action, requestId: "x" });
    assert.equal(r.success, false, action);
    assert.equal(r.error.code, "NOT_IMPLEMENTED", action);
    assert.equal(r.requestId, "x");
  }
});

test("proteção na frente da API (redirecionamento ou 403 sem JSON): CF_CHALLENGE, com aviso para a tela", async () => {
  const srv = servidorFalso();
  const h = carregarHost({ fetch: srv.fetch });
  srv.resposta = () => ({ type: "opaqueredirect", status: 0, ok: false, headers: new Headers() });
  assert.deepEqual(await h.chamar("getArmazenamento"), { available: false, desafio: true });
  srv.resposta = () => new Response("<html>desafio</html>", { status: 403, headers: { "content-type": "text/html" } });
  await assert.rejects(h.chamar("login", { email: "a@exemplo.test", senha: novaSenha() }), codigo("CF_CHALLENGE"));
  assert.ok(h.eventos.some((e) => e.type === "zozo:protecao-cloudflare"));
  srv.resposta = () => new Response(JSON.stringify({ erro: "X", espera: 30 }), { status: 429, headers: { "content-type": "application/json" } });
  const r = await h.host.handle({ action: "login", requestId: "t", data: { email: "a@exemplo.test", senha: novaSenha() } });
  assert.equal(r.error.code, "TOO_MANY_ATTEMPTS");
  assert.equal(r.error.espera, 30);
  srv.resposta = () => { throw new TypeError("sem rede"); };
  await assert.rejects(h.chamar("login", { email: "a@exemplo.test", senha: novaSenha() }), codigo("STORAGE_UNAVAILABLE"));
});

test("pedidos à API: mesma origem, sem cache e sem seguir redirecionamentos", async () => {
  const opcoes = [];
  const srv = servidorFalso();
  const h = carregarHost({ fetch: (url, init) => { opcoes.push(init); return srv.fetch(url, init); } });
  await h.chamar("getArmazenamento");
  assert.ok(opcoes.length > 0);
  for (const o of opcoes) {
    assert.equal(o.credentials, "same-origin");
    assert.equal(o.cache, "no-store");
    assert.equal(o.redirect, "manual");
  }
});
