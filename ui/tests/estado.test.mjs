// Estado central (core/state.ts): o set mescla o 2º nível. O loadData (app.ts) depende disso para limpar "stale".
import test from "node:test";
import assert from "node:assert/strict";
import { carregar } from "./carregar.mjs";

test("stale: apagar a chave de uma cópia não limpa (o set mescla); false explícito limpa", () => {
  // auditoria de UI/UX 03/11 (F01): o loadData fazia delete numa cópia e a coleção ficava desatualizada para sempre
  const { Z } = carregar();
  Z.store.set({ stale: { contas: true, lancamentos: true } });
  const copia = { ...Z.store.get().stale };
  delete copia.contas;
  Z.store.set({ stale: copia });
  assert.equal(Z.store.get().stale.contas, true, "o jeito antigo não limpava");
  Z.store.set({ stale: { contas: false } });                         // o que o loadData faz agora
  assert.equal(!!Z.store.get().stale.contas, false);
  assert.equal(Z.store.get().stale.lancamentos, true, "as outras coleções continuam marcadas");
});
