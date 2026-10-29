// Testes da fatura de perfis (cobrança): o que entra, período pelo fechamento do cartão, ajustes guardados,
// pagamentos recebidos e saldo anterior — e as entradas inválidas que precisam ser recusadas.
//   node --test ui/tests
import test from "node:test";
import assert from "node:assert/strict";
import { carregar } from "./carregar.mjs";

const pad = (n) => String(n).padStart(2, "0");
const isoDe = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
const codigo = (c) => (e) => { assert.equal(e.code, c); return true; };
const lanc = (extra) => ({ lancamento: Object.assign({ data: "2025-03-10", descricao: "Compra", valor: 10 }, extra) });

async function cenario(t, cartaoExtra = {}) {
  const conta = async (nome, tipo, extra) => (await t.req(t.A.createConta, { conta: Object.assign({ nome, tipo, saldo: 0 }, extra) })).conta;
  const cartao = await conta("Visa", "cartao", cartaoExtra);
  const banco = await conta("Itaú", "corrente", { saldo: 1000 });
  const { perfil } = await t.req(t.A.createPerfil, { perfil: { nome: "Mãe" } });
  return { cartao, banco, perfil };
}
const fatura = (t, perfilId, mes, ano) => t.req(t.A.getBoletoData, { perfilId, mes, ano });

test("fatura: pagar o cartão (Pagar fatura, transferência de entrada, Receita à mão e o formato antigo) não abate a cobrança do perfil", async () => {
  const t = carregar();
  const hoje = new Date();
  const mes = hoje.getMonth() + 1, ano = hoje.getFullYear(), dia = isoDe(hoje);
  const { cartao, banco, perfil } = await cenario(t);
  await t.req(t.A.createLancamento, lanc({ data: dia, descricao: "Mercado", valor: 300, contaId: cartao.id, perfilId: perfil.id }));
  await t.req(t.A.createLancamento, lanc({ data: dia, descricao: "Estorno loja", valor: 20, contaId: cartao.id, perfilId: perfil.id, tipo: "estorno" }));
  await t.req(t.A.pagarFatura, { cartaoId: cartao.id, contaId: banco.id, valor: 100, perfilId: perfil.id });
  await t.req(t.A.createLancamento, lanc({ data: dia, descricao: "Transferência para o cartão", valor: 50, contaId: cartao.id, perfilId: perfil.id, tipo: "interno", sentido: "entrada" }));
  // pagamento gravado antes da marca (3.17): reconhecido pelo texto que o "Pagar fatura" gerava
  await t.req(t.A.createLancamento, lanc({ data: dia, descricao: "Pagamento fatura", valor: 70, contaId: cartao.id, perfilId: perfil.id, tipo: "receita",
    notas: "Pagamento da fatura do cartão de crédito Visa." }));
  // pagamento lançado à mão como Receita no cartão, sem marca nem texto: também não é gasto
  await t.req(t.A.createLancamento, lanc({ data: dia, descricao: "Fatura", valor: 7022.87, contaId: cartao.id, perfilId: perfil.id, tipo: "receita" }));
  const f = await fatura(t, perfil.id, mes, ano);
  assert.deepEqual(f.lancamentos.map((l) => l.descricao).sort(), ["Estorno loja", "Mercado"]);
  assert.equal(t.Z.servico.calcularFatura(f).total, 280);                       // 300 − estorno 20
  // editar o pagamento continua fora da cobrança (o par do tipo Fatura nunca aparece na fatura)
  const pag = (await t.req(t.A.getLancamentos)).lancamentos.find((l) => l.tipo === "fatura");
  await t.req(t.A.updateLancamento, { id: pag.id, lancamento: { data: dia, descricao: "Pagamento fatura", valor: 90, tipo: "fatura", contaId: banco.id, perfilId: perfil.id } });
  assert.equal((await fatura(t, perfil.id, mes, ano)).lancamentos.length, 2);
  assert.equal((await t.req(t.A.getBoletoData, { perfilId: "todos", mes, ano })).lancamentos.length, 2);
});

test("fatura: ciclo do dia seguinte ao fechamento anterior até o dia do fechamento; sem fechamento, o mês", async () => {
  const t = carregar();
  // o exemplo: fecha dia 5 e vence dia 12. Compra no dia 4 (ou 5) de outubro cai na fatura de outubro; no dia 6, na de novembro
  const { cartao, perfil } = await cenario(t, { fechamento: 5, vencimento: 12 });
  const { conta: semCiclo } = await t.req(t.A.createConta, { conta: { nome: "Master", tipo: "cartao", saldo: 0 } });
  const compra = (data, descricao, contaId = cartao.id) => t.req(t.A.createLancamento, lanc({ data, descricao, contaId, perfilId: perfil.id }));
  await compra("2025-09-05", "No fechamento de setembro");
  await compra("2025-09-06", "Dia seguinte ao fechamento de setembro");
  await compra("2025-10-04", "Dia 4 de outubro");
  await compra("2025-10-05", "No fechamento de outubro");
  await compra("2025-10-06", "Dia 6 de outubro");
  await compra("2025-10-02", "Cartão sem fechamento", semCiclo.id);
  await compra("2025-09-30", "Sem fechamento, outro mês", semCiclo.id);
  const f = await fatura(t, perfil.id, 10, 2025);
  assert.deepEqual(f.lancamentos.map((l) => l.descricao), ["Dia seguinte ao fechamento de setembro", "Cartão sem fechamento", "Dia 4 de outubro", "No fechamento de outubro"]);
  const p = f.periodos.find((x) => x.contaId === cartao.id);
  assert.equal(p.inicio, "2025-09-06");
  assert.equal(p.fim, "2025-10-05");
  assert.deepEqual((await fatura(t, perfil.id, 11, 2025)).lancamentos.map((l) => l.descricao), ["Dia 6 de outubro"]);
  assert.deepEqual((await fatura(t, perfil.id, 9, 2025)).lancamentos.map((l) => l.descricao), ["No fechamento de setembro", "Sem fechamento, outro mês"]);
});

test("fatura: perfil Todos e escolha do cartão (Todos ou um); com Todos ou um cartão é só consulta", async () => {
  const t = carregar();
  const { cartao, banco, perfil } = await cenario(t);
  const { conta: master } = await t.req(t.A.createConta, { conta: { nome: "Master", tipo: "cartao", saldo: 0 } });
  const { perfil: bia } = await t.req(t.A.createPerfil, { perfil: { nome: "Bia" } });
  const compra = (descricao, contaId, perfilId) => t.req(t.A.createLancamento, lanc({ data: "2025-03-10", descricao, contaId, perfilId }));
  await compra("Visa Mãe", cartao.id, perfil.id);
  await compra("Master Mãe", master.id, perfil.id);
  await compra("Visa Bia", cartao.id, bia.id);
  await compra("Visa sem perfil", cartao.id, null);
  await compra("Na conta", banco.id, perfil.id);
  await t.req(t.A.salvarFatura, { perfilId: perfil.id, mes: 3, ano: 2025, descontos: [{ descricao: "Desconto", valor: 1 }] });
  const nomes = (f) => f.lancamentos.map((l) => l.descricao).sort();
  // um perfil, todos os cartões: os dois cartões dele, com os ajustes guardados
  const umTodos = await t.req(t.A.getBoletoData, { perfilId: perfil.id, cartaoId: "todos", mes: 3, ano: 2025 });
  assert.deepEqual(nomes(umTodos), ["Master Mãe", "Visa Mãe"]);
  assert.equal(umTodos.consulta, false);
  assert.equal(umTodos.ajustes.descontos.length, 1);
  assert.deepEqual(umTodos.periodos.map((p) => p.nome).sort(), ["Master", "Visa"]);
  // um perfil, um cartão: só o do cartão, sem ajustes (consulta)
  const umVisa = await t.req(t.A.getBoletoData, { perfilId: perfil.id, cartaoId: cartao.id, mes: 3, ano: 2025 });
  assert.deepEqual(nomes(umVisa), ["Visa Mãe"]);
  assert.equal(umVisa.consulta, true);
  assert.deepEqual([umVisa.ajustes.descontos, umVisa.recebimentos, umVisa.saldoAnterior, umVisa.pix], [[], [], 0, null]);
  // todos os perfis: inclusive as compras sem perfil; com um cartão, só as dele
  const todos = await t.req(t.A.getBoletoData, { perfilId: "todos", mes: 3, ano: 2025 });
  assert.deepEqual(nomes(todos), ["Master Mãe", "Visa Bia", "Visa Mãe", "Visa sem perfil"]);
  assert.deepEqual([todos.todos, todos.perfil, todos.consulta], [true, null, true]);
  assert.deepEqual(nomes(await t.req(t.A.getBoletoData, { perfilId: "todos", cartaoId: master.id, mes: 3, ano: 2025 })), ["Master Mãe"]);
  // cartão que não existe ou que não é cartão: recusado
  for (const cartaoId of ["c-inexistente", banco.id]) {
    await assert.rejects(t.req(t.A.getBoletoData, { perfilId: "todos", cartaoId, mes: 3, ano: 2025 }), codigo("OPERATION_FAILED"), cartaoId);
  }
});

test("fatura: ajustes ficam guardados por perfil e mês; valores inválidos são recusados sem gravar", async () => {
  const t = carregar();
  const { perfil } = await cenario(t);
  const pedido = (extra) => Object.assign({ perfilId: perfil.id, mes: 3, ano: 2025 }, extra);
  await t.req(t.A.salvarFatura, pedido({ contribuicoes: [{ descricao: "Gás", valor: 30 }], descontos: [{ descricao: "Amizade", valor: -5 }],
    arredondamentos: [{ descricao: "", valor: -0.4 }, { descricao: "", valor: 0 }] }));
  const f = await fatura(t, perfil.id, 3, 2025);
  assert.deepEqual(f.ajustes.contribuicoes, [{ descricao: "Gás", valor: 30 }]);
  assert.deepEqual(f.ajustes.descontos, [{ descricao: "Amizade", valor: 5 }]);        // desconto sempre pelo valor absoluto
  assert.deepEqual(f.ajustes.arredondamentos, [{ descricao: "", valor: -0.4 }]);      // linha vazia não é guardada
  assert.deepEqual((await fatura(t, perfil.id, 4, 2025)).ajustes.contribuicoes, []); // outro mês: nada
  const gravados = t.salvos.length;
  const ruins = [{ contribuicoes: [{ descricao: "X", valor: "10abc" }] }, { descontos: [{ valor: Infinity }] }, { contribuicoes: [{ valor: 1e13 }] },
    { contribuicoes: "não é lista" }, { contribuicoes: Array.from({ length: 31 }, () => ({ descricao: "a", valor: 1 })) }, { mes: 13 }, { perfilId: "p-x" }];
  for (const r of ruins) await assert.rejects(t.req(t.A.salvarFatura, pedido(r)), codigo("OPERATION_FAILED"), JSON.stringify(r).slice(0, 60));
  assert.equal(t.salvos.length, gravados);
  // tudo vazio apaga o registro; excluir o perfil leva os ajustes dele
  await t.req(t.A.salvarFatura, pedido({ contribuicoes: [{ descricao: "Gás", valor: 30 }] }));
  await t.req(t.A.deletePerfil, { id: perfil.id });
  assert.deepEqual(t.documento().faturas, {});
});

test("fatura: pagamento recebido entra como receita na conta, no perfil, e abate da fatura do mês", async () => {
  const t = carregar();
  const { cartao, banco, perfil } = await cenario(t);
  await t.req(t.A.createLancamento, lanc({ data: "2025-03-10", valor: 250, contaId: cartao.id, perfilId: perfil.id }));
  const { lancamento } = await t.req(t.A.receberFatura, { perfilId: perfil.id, mes: 3, ano: 2025, contaId: banco.id, valor: 100, data: "2025-04-02" });
  assert.equal(lancamento.tipo, "receita");
  assert.equal(lancamento.contaId, banco.id);
  assert.equal(lancamento.perfilId, perfil.id);
  assert.equal(lancamento.categoria.nome, "Reembolso");
  assert.equal(lancamento.faturaPerfil, "2025-03");
  assert.equal(lancamento.data, "2025-04-02");
  const f = await fatura(t, perfil.id, 3, 2025);
  assert.deepEqual(f.recebimentos.map((l) => l.valor), [100]);
  const r = t.Z.servico.calcularFatura(Object.assign({}, f, { recebido: 100 }));
  assert.equal(r.total, 250);
  assert.equal(r.aPagar, 150);
  // a receita aparece na conta (o saldo de abril depende da data de hoje; o lançamento existe com o valor certo)
  assert.ok((await t.req(t.A.getLancamentos)).lancamentos.some((l) => l.id === lancamento.id && l.valor === 100));
  // segundo pagamento reaproveita a categoria Reembolso
  await t.req(t.A.receberFatura, { perfilId: perfil.id, mes: 3, ano: 2025, contaId: banco.id, valor: 150 });
  assert.equal((await t.req(t.A.getCategorias)).categorias.filter((c) => c.nome === "Reembolso").length, 1);
});

test("fatura: pagamento recebido com conta, valor, data, perfil ou mês inválidos é recusado sem gravar", async () => {
  const t = carregar();
  const { cartao, banco, perfil } = await cenario(t);
  const { perfil: arquivado } = await t.req(t.A.createPerfil, { perfil: { nome: "Tia" } });
  await t.req(t.A.arquivarPerfil, { id: arquivado.id, arquivar: true });
  const pedido = (extra) => Object.assign({ perfilId: perfil.id, mes: 3, ano: 2025, contaId: banco.id, valor: 10 }, extra);
  const gravados = t.salvos.length;
  const casos = [
    [{ contaId: cartao.id }, "RECEIPT_ACCOUNT"], [{ contaId: "c-x" }, "RECEIPT_ACCOUNT"],
    [{ valor: 0 }, "PAYMENT_INVALID"], [{ valor: -5 }, "PAYMENT_INVALID"], [{ valor: "10abc" }, "PAYMENT_INVALID"], [{ valor: 1e13 }, "PAYMENT_INVALID"],
    [{ data: "2025-02-30" }, "OPERATION_FAILED"], [{ mes: 0 }, "OPERATION_FAILED"], [{ ano: "2025x" }, "OPERATION_FAILED"],
    [{ perfilId: "p-x" }, "PROFILE_REQUIRED"], [{ perfilId: arquivado.id }, "PROFILE_ARCHIVED"],
  ];
  for (const [extra, cod] of casos) await assert.rejects(t.req(t.A.receberFatura, pedido(extra)), codigo(cod), JSON.stringify(extra));
  assert.equal(t.salvos.length, gravados);
  const sem = carregar({ recursos: { perfis: true, boleto: false, pix: false, cambio: false } });
  await assert.rejects(sem.req(sem.A.receberFatura, pedido({})), codigo("FEATURE_UNAVAILABLE"));
  await assert.rejects(sem.req(sem.A.salvarFatura, { perfilId: "p", mes: 3, ano: 2025 }), codigo("FEATURE_UNAVAILABLE"));
});

test("fatura: saldo anterior a partir da 1ª fatura com pagamento registrado (em aberto soma, pago a mais vira crédito)", async () => {
  const t = carregar();
  const { cartao, banco, perfil } = await cenario(t);
  const compra = (data, valor) => t.req(t.A.createLancamento, lanc({ data, valor, contaId: cartao.id, perfilId: perfil.id }));
  const receber = (mes, valor) => t.req(t.A.receberFatura, { perfilId: perfil.id, mes, ano: 2025, contaId: banco.id, valor, data: "2025-06-01" });
  await compra("2025-02-10", 70);                       // antes do controle: não volta a ser cobrado
  await compra("2025-03-10", 100);
  await t.req(t.A.salvarFatura, { perfilId: perfil.id, mes: 3, ano: 2025, contribuicoes: [{ descricao: "Gás", valor: 20 }] });
  await receber(3, 60);                                  // março: 120 − 60 = 60 em aberto
  await compra("2025-04-10", 50);                        // abril sem pagamento
  assert.equal((await fatura(t, perfil.id, 3, 2025)).saldoAnterior, 0);
  assert.equal((await fatura(t, perfil.id, 4, 2025)).saldoAnterior, 60);
  assert.equal((await fatura(t, perfil.id, 5, 2025)).saldoAnterior, 110);
  await receber(5, 200);                                 // maio sem compras: paga 200 → 90 de crédito em junho
  assert.equal((await fatura(t, perfil.id, 6, 2025)).saldoAnterior, -90);
});
