// Carrega os módulos da interface (scripts globais em window.ZoZo) num contexto isolado do Node,
// com o "host" simulado em memória: permite testar o serviço de dados sem navegador.
import { readFileSync } from "node:fs";
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
