// Lixeira temporal do Zo (js/data/servico.ts): desfazer só o que a gravação mudou, com o saldo certo, e nunca
// por cima do que a pessoa mexeu depois.
//   node --test ui/tests
import test from "node:test";
import assert from "node:assert/strict";
import { carregar } from "./carregar.mjs";

const pad = (n) => String(n).padStart(2, "0");
const hoje = () => { const d = new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); };
const codigo = (c) => (e) => { assert.equal(e.code, c); return true; };

async function cenario() {
  const t = carregar();
  const { conta } = await t.req(t.A.createConta, { conta: { nome: "Itaú", tipo: "corrente", saldo: 1000 } });
  const { categoria } = await t.req(t.A.createCategoria, { categoria: { nome: "Mercado", icone: "🛒" } });
  const saldo = async () => (await t.req(t.A.getContas)).contas.find((c) => c.id === conta.id).valor;
  const transacoes = async () => (await t.req(t.A.getLancamentos)).lancamentos;
  /** Uma gravação "do Zo": marco antes, a ação, marco depois */
  const peloZo = async (acao, dados) => {
    const { marco } = await t.req(t.A.abrirMarco);
    const r = await t.req(acao, dados);
    await t.req(t.A.fecharMarco, { marco });
    return { marco, r };
  };
  const debito = (valor, descricao = "Feira") => ({ lancamento: { data: hoje(), descricao, valor, tipo: "debito", contaId: conta.id, categoriaId: categoria.id } });
  return { t, conta, categoria, saldo, transacoes, peloZo, debito };
}

test("lixeira: desfazer a criação tira a transação e devolve o saldo", async () => {
  const { t, saldo, transacoes, peloZo, debito } = await cenario();
  const { marco } = await peloZo(t.A.createLancamento, debito(150));
  assert.equal(await saldo(), 850);
  assert.deepEqual(await t.req(t.A.desfazerMarco, { marco }), { desfeitas: 1, conflitos: 0 });
  assert.equal((await transacoes()).length, 0);
  assert.equal(await saldo(), 1000);
  // uma vez só
  await assert.rejects(t.req(t.A.desfazerMarco, { marco }), codigo("UNDO_UNAVAILABLE"));
});

test("lixeira: desfazer a exclusão devolve a mesma transação e o saldo; desfazer a edição volta o valor", async () => {
  const { t, saldo, transacoes, peloZo, debito } = await cenario();
  const { lancamento } = await t.req(t.A.createLancamento, debito(100));
  assert.equal(await saldo(), 900);
  const exclusao = await peloZo(t.A.deleteLancamento, { id: lancamento.id });
  assert.equal(await saldo(), 1000);
  assert.deepEqual(await t.req(t.A.desfazerMarco, { marco: exclusao.marco }), { desfeitas: 1, conflitos: 0 });
  const [volta] = await transacoes();
  assert.deepEqual([volta.id, volta.valor, volta.descricao], [lancamento.id, 100, "Feira"]);
  assert.equal(await saldo(), 900);                                                         // o débito voltou a valer, uma vez só
  const edicao = await peloZo(t.A.updateLancamento, { id: lancamento.id, lancamento: { data: hoje(), descricao: "Feira", valor: 250, tipo: "debito", contaId: volta.contaId, categoriaId: volta.categoriaId } });
  assert.equal(await saldo(), 750);
  assert.deepEqual(await t.req(t.A.desfazerMarco, { marco: edicao.marco }), { desfeitas: 1, conflitos: 0 });
  assert.equal((await transacoes())[0].valor, 100);
  assert.equal(await saldo(), 900);
});

test("lixeira: o que a pessoa mexeu depois fica como está (conflito) e o resto não é tocado", async () => {
  const { t, conta, categoria, saldo, transacoes, peloZo, debito } = await cenario();
  const { r } = await peloZo(t.A.createLancamento, debito(50));
  const zo = await peloZo(t.A.updateLancamento, { id: r.lancamento.id, lancamento: { data: hoje(), descricao: "Feira", valor: 60, tipo: "debito", contaId: conta.id, categoriaId: categoria.id } });
  // a pessoa edita a mesma transação depois do Zo e cria outra
  await t.req(t.A.updateLancamento, { id: r.lancamento.id, lancamento: { data: hoje(), descricao: "Feira do sábado", valor: 70, tipo: "debito", contaId: conta.id, categoriaId: categoria.id } });
  await t.req(t.A.createLancamento, debito(5, "Café"));
  assert.deepEqual(await t.req(t.A.desfazerMarco, { marco: zo.marco }), { desfeitas: 0, conflitos: 1 });
  const lista = await transacoes();
  assert.deepEqual(lista.map((l) => [l.descricao, l.valor]).sort(), [["Café", 5], ["Feira do sábado", 70]]);
  assert.equal(await saldo(), 925);
});

test("lixeira: categoria criada pelo Zo e usada depois não sai; sem uso, sai", async () => {
  const { t, conta, transacoes, peloZo } = await cenario();
  const usada = await peloZo(t.A.createCategoria, { categoria: { nome: "Farmácia", icone: "💊" } });
  await t.req(t.A.createLancamento, { lancamento: { data: hoje(), descricao: "Remédio", valor: 30, tipo: "debito", contaId: conta.id, categoriaId: usada.r.categoria.id } });
  assert.deepEqual(await t.req(t.A.desfazerMarco, { marco: usada.marco }), { desfeitas: 0, conflitos: 1 });
  assert.ok((await t.req(t.A.getCategorias)).categorias.some((c) => c.nome === "Farmácia"));
  assert.equal((await transacoes()).length, 1);
  const livre = await peloZo(t.A.createCategoria, { categoria: { nome: "Pets", icone: "🐶" } });
  assert.deepEqual(await t.req(t.A.desfazerMarco, { marco: livre.marco }), { desfeitas: 1, conflitos: 0 });
  assert.ok(!(await t.req(t.A.getCategorias)).categorias.some((c) => c.nome === "Pets"));
});

test("lixeira: marco desconhecido, sem o depois ou descartado não desfaz nada", async () => {
  const { t, transacoes, peloZo, debito } = await cenario();
  await assert.rejects(t.req(t.A.desfazerMarco, { marco: "m-inexistente" }), codigo("UNDO_UNAVAILABLE"));
  await assert.rejects(t.req(t.A.desfazerMarco, {}), codigo("UNDO_UNAVAILABLE"));
  const { marco: aberto } = await t.req(t.A.abrirMarco);                                   // gravação que não terminou
  await t.req(t.A.createLancamento, debito(10));
  await assert.rejects(t.req(t.A.desfazerMarco, { marco: aberto }), codigo("UNDO_UNAVAILABLE"));
  await t.req(t.A.fecharMarco, { marco: aberto });
  await assert.rejects(t.req(t.A.fecharMarco, { marco: aberto }), codigo("OPERATION_FAILED")); // fechar duas vezes não troca o "depois"
  const { marco } = await peloZo(t.A.createLancamento, debito(20));
  await t.req(t.A.descartarMarcos);                                                          // fim da conversa (LGPD)
  await assert.rejects(t.req(t.A.desfazerMarco, { marco }), codigo("UNDO_UNAVAILABLE"));
  await assert.rejects(t.req(t.A.desfazerMarco, { marco: aberto }), codigo("UNDO_UNAVAILABLE"));
  assert.equal((await transacoes()).length, 2);
  // sair da conta também esvazia a lixeira
  const outro = await peloZo(t.A.createLancamento, debito(30));
  t.Z.servico.reset();
  await assert.rejects(t.req(t.A.desfazerMarco, { marco: outro.marco }), codigo("UNDO_UNAVAILABLE"));
});
