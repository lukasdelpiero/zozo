// Testes do roteador (js/router.ts): redesenho só das linhas que mudam e foco devolvido depois do redesenho.
//   node --test ui/tests
// O roteador roda num contexto isolado com um DOM mínimo simulado (sem navegador nem biblioteca de DOM).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";

const fonte = stripTypeScriptTypes(readFileSync(new URL("../js/router.ts", import.meta.url), "utf8"));

/** Elemento simulado: só o que o roteador usa */
function elemento(dataset = {}) {
  return { dataset, isConnected: true, focado: 0, focus() { this.focado += 1; doc.activeElement = this; } };
}
let doc;

function montar(pagina) {
  const ouvintes = [];
  let estado = { session: { authenticated: true }, dados: 1, sel: null };
  doc = { activeElement: null, getElementById: () => ({ dataset: {} }) };
  const encontraveis = new Map();          // seletor → elemento (o que existe na página depois do redesenho)
  const mainEl = {
    scrollTop: 0, filhos: [],
    contains: (el) => !!el && el.dentroDoMain === true,
    querySelector: (sel) => encontraveis.get(sel) || null,
  };
  const ZoZo = {
    dom: { mount: (el, filho) => { el.filhos = [filho]; } },
    store: { subscribe: (fn) => { ouvintes.push(fn); }, set: () => {}, get: () => estado },
    charts: {}, menu: { fechar: () => {} }, recursos: {},
    pages: { p: pagina },
  };
  const ctx = { ZoZo, document: doc, CSS: { escape: (s) => s }, Date, Promise };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fonte, ctx, { filename: "router.ts" });
  const app = { detail: { close: () => {} } };
  const roteador = ZoZo.router.create(app, { setPage: () => {} }, mainEl);
  roteador.navigate("p");
  const mudar = (novo) => { estado = { ...estado, ...novo }; ouvintes.forEach((fn) => fn(estado)); };
  return { mudar, encontraveis, mainEl };
}

function pagina({ trocaNoLugar = true } = {}) {
  const conta = { render: 0, linhas: 0 };
  const p = {
    titulo: "P",
    carregar: () => Promise.resolve(),
    deps: (s) => [s.dados],
    depsLinhas: (s) => [s.sel],
    atualizarLinhas: () => { conta.linhas += 1; return trocaNoLugar; },
    render: () => { conta.render += 1; return { classList: { add() {} }, style: { setProperty() {} } }; },
  };
  return { p, conta };
}

test("mudou só a seleção: as linhas são trocadas no lugar, sem redesenhar a página", () => {
  const { p, conta } = pagina();
  const { mudar } = montar(p);
  const inicial = conta.render;
  mudar({ sel: "a" });
  mudar({ sel: "b" });
  assert.equal(conta.render, inicial);
  assert.equal(conta.linhas, 2);
});

test("a página não consegue trocar no lugar: redesenha inteira", () => {
  const { p, conta } = pagina({ trocaNoLugar: false });
  const { mudar } = montar(p);
  const inicial = conta.render;
  mudar({ sel: "a" });
  assert.equal(conta.render, inicial + 1);
});

test("os dados mudaram: redesenha a página (não só as linhas)", () => {
  const { p, conta } = pagina();
  const { mudar } = montar(p);
  const inicial = conta.render;
  mudar({ dados: 2, sel: "a" });
  assert.equal(conta.render, inicial + 1);
  assert.equal(conta.linhas, 0);
});

test("estado igual: nada é redesenhado", () => {
  const { p, conta } = pagina();
  const { mudar } = montar(p);
  const inicial = conta.render;
  mudar({});
  assert.equal(conta.render, inicial);
  assert.equal(conta.linhas, 0);
});

test("foco numa linha da lista (data-id) volta à mesma linha depois do redesenho", () => {
  const { p } = pagina();
  const { mudar, encontraveis } = montar(p);
  const antiga = elemento({ id: "l1" });
  antiga.tagName = "BUTTON"; antiga.dentroDoMain = true;
  doc.activeElement = antiga;
  const nova = elemento({ id: "l1" });
  encontraveis.set('button[data-id="l1"]', nova);
  mudar({ dados: 3 });                     // redesenho inteiro: o botão antigo sai da página
  assert.equal(nova.focado, 1);
});

test("foco com data-fk continua valendo (abas, segmentos)", () => {
  const { p } = pagina();
  const { mudar, encontraveis } = montar(p);
  const antiga = elemento({ fk: "seg:mes" });
  antiga.tagName = "BUTTON"; antiga.dentroDoMain = true;
  doc.activeElement = antiga;
  const nova = elemento({ fk: "seg:mes" });
  encontraveis.set('[data-fk="seg:mes"]', nova);
  mudar({ dados: 4 });
  assert.equal(nova.focado, 1);
});

test("troca no lugar: se a linha focada saiu da página, o foco vai para a nova", () => {
  const { p } = pagina();
  const { mudar, encontraveis } = montar(p);
  const antiga = elemento({ id: "l2" });
  antiga.tagName = "BUTTON"; antiga.dentroDoMain = true;
  doc.activeElement = antiga;
  const nova = elemento({ id: "l2" });
  encontraveis.set('button[data-id="l2"]', nova);
  p.atualizarLinhas = () => { antiga.isConnected = false; return true; };
  mudar({ sel: "l2" });
  assert.equal(nova.focado, 1);
});
