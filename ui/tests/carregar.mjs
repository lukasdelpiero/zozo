// Carrega os módulos da interface (scripts globais em window.ZoZo) num contexto isolado do Node,
// com o "host" simulado em memória: permite testar o serviço de dados sem navegador.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";
import { webcrypto } from "node:crypto";

const RAIZ = new URL("../js/", import.meta.url);
const MODULOS = ["core/format.ts", "core/busca.ts", "core/state.ts", "config/regras.ts", "bridge/messages.ts", "data/pix.ts", "data/servico.js"];
// Módulos já em TypeScript: só os tipos são removidos (o código que roda é o mesmo do navegador)
const codigo = (m) => { const t = readFileSync(new URL(m, RAIZ), "utf8"); return m.endsWith(".ts") ? stripTypeScriptTypes(t) : t; };

export function carregar({ recursos = { perfis: true, boleto: true, pix: true, cambio: true }, demo = false, documento = null } = {}) {
  const eventos = [];
  const salvos = [];
  const ctx = {
    console, crypto: webcrypto, structuredClone, Intl, setTimeout, clearTimeout, queueMicrotask,
    CustomEvent: class { constructor(tipo, o) { this.type = tipo; this.detail = o && o.detail; } },
    dispatchEvent: (e) => { eventos.push(e); return true; },
  };
  ctx.window = ctx;
  ctx.ZoZo = {};
  vm.createContext(ctx);
  for (const m of MODULOS) vm.runInContext(codigo(m), ctx, { filename: m });
  const Z = ctx.ZoZo;
  Z.store.set({ session: { user: { recursos, demo } } });
  let atual = documento;
  Z.bridge = {
    requestHost: async (acao, dados) => {
      if (acao === "loadUserData") return { documento: atual ? JSON.parse(JSON.stringify(atual)) : null };
      if (acao === "saveUserData") { atual = JSON.parse(JSON.stringify(dados.documento)); salvos.push(atual); return { salvo: true }; }
      throw new Error("ação inesperada " + acao);
    },
  };
  const A = Z.messages.ACTIONS;
  const req = (acao, dados) => Z.servico.handle(acao, dados);
  return { Z, A, req, eventos, salvos, documento: () => atual };
}

/**
 * Carrega o host da versão web (bridge/host-web) com fetch e localStorage simulados.
 * O argon2 (hash-wasm) é importado de verdade: as chaves derivadas são as mesmas do navegador.
 */
export function carregarHost({ fetch, armazenamento = new Map() } = {}) {
  const eventos = [];
  const localStorage = {
    getItem: (k) => (armazenamento.has(k) ? armazenamento.get(k) : null),
    setItem: (k, v) => { armazenamento.set(k, String(v)); },
    removeItem: (k) => { armazenamento.delete(k); },
  };
  const ctx = {
    console, crypto: webcrypto, TextEncoder, TextDecoder, btoa, atob, Blob, Response, Headers, CompressionStream, DecompressionStream,
    setTimeout, clearTimeout, fetch, localStorage,
    CustomEvent: class { constructor(tipo, o) { this.type = tipo; this.detail = o && o.detail; } },
    dispatchEvent: (e) => { eventos.push(e); return true; },
  };
  ctx.window = ctx;
  ctx.ZoZo = {};
  vm.createContext(ctx);
  const m = "bridge/host-web.js";
  vm.runInContext(codigo(m), ctx, { filename: fileURLToPath(new URL(m, RAIZ)), importModuleDynamically: vm.constants.USE_MAIN_CONTEXT_DEFAULT_LOADER });
  const host = ctx.ZoZo.webHost;
  /** Chama uma ação; erro do host vira exceção com o código */
  const chamar = async (action, data) => {
    const r = await host.handle({ action, requestId: "t", data });
    if (!r.success) throw Object.assign(new Error(r.error.code), { code: r.error.code });
    return structuredClone(r.data);                // objetos do contexto isolado viram objetos comuns (comparação)
  };
  return { host, chamar, eventos, armazenamento };
}
