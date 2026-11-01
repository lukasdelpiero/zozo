// Edição no lugar (js/components/inline.ts): a resposta de uma gravação ANTIGA nunca desfaz a edição mais nova.
//   node --test ui/tests
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";

const fonte = stripTypeScriptTypes(readFileSync(new URL("../js/components/inline.ts", import.meta.url), "utf8"));

/** Um campo de texto de mentira (o que inline.texto usa: value, eventos, foco) e o mínimo do ZoZo */
function montar() {
  const toasts = [];
  const doc = { activeElement: null };
  const h = () => {
    const ouvintes = {};
    return {
      value: "", addEventListener: (tipo, fn) => { (ouvintes[tipo] = ouvintes[tipo] || []).push(fn); },
      disparar: (tipo, e) => (ouvintes[tipo] || []).forEach((fn) => fn(e || { key: "", preventDefault() {} })),
    };
  };
  const ctx = { document: doc, ZoZo: { dom: { h }, format: {}, pecas: {}, messages: { FRIENDLY: { OPERATION_FAILED: "falhou" } }, feedback: { toast: (m) => toasts.push(m) } } };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fonte.replace(/^export \{\};?\s*$/m, ""), ctx);
  return { inline: ctx.ZoZo.inline, doc, toasts };
}
/** Promessa controlada: a gravação termina quando o teste manda */
function pendente() { let ok, falha; const p = new Promise((a, b) => { ok = a; falha = b; }); return { p, ok, falha }; }
const editar = (t, input, v) => { t.doc.activeElement = input; input.value = v; t.doc.activeElement = null; input.disparar("blur"); };
const esperar = () => new Promise((r) => setTimeout(r, 0));

test("edição no lugar: 1ª falha e 2ª dá certo, o campo fica com a 2ª", async () => {
  const t = montar(), chamadas = [];
  const input = t.inline.texto({ valor: "Original", aoSalvar: () => { const g = pendente(); chamadas.push(g); return g.p; } });
  editar(t, input, "Primeira");
  editar(t, input, "Segunda");
  chamadas[0].falha({ friendly: "sem rede" });
  chamadas[1].ok();
  await esperar();
  assert.equal(input.value, "Segunda");
  assert.deepEqual(t.toasts, ["sem rede"]);                               // a falha continua avisada
});

test("edição no lugar: 1ª dá certo e 2ª falha, volta para a 1ª (a última confirmada)", async () => {
  const t = montar(), chamadas = [];
  const input = t.inline.texto({ valor: "Original", aoSalvar: () => { const g = pendente(); chamadas.push(g); return g.p; } });
  editar(t, input, "Primeira");
  editar(t, input, "Segunda");
  chamadas[0].ok();
  await esperar();
  chamadas[1].falha(undefined);
  await esperar();
  assert.equal(input.value, "Primeira");
});

test("edição no lugar: a falha que chega durante uma edição não apaga o que está sendo digitado", async () => {
  const t = montar(), chamadas = [];
  const input = t.inline.texto({ valor: "Original", aoSalvar: () => { const g = pendente(); chamadas.push(g); return g.p; } });
  editar(t, input, "Primeira");
  t.doc.activeElement = input;                                           // a pessoa voltou a editar
  input.value = "Digitando";
  chamadas[0].falha(undefined);
  await esperar();
  assert.equal(input.value, "Digitando");
  t.doc.activeElement = null;
  input.disparar("blur");                                                // saiu: grava o que digitou
  assert.equal(chamadas.length, 2);
});
