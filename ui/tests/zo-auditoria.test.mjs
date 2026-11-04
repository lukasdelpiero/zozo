// Regressões da auditoria do Zo (docs/AUDITORIA_ZO.md, 03/11/2026): cada probe que falhava (P01–P10) e os controles
// novos (lote tudo ou nada, confirmação de uso único, proposta vencida, argumentos fora do esquema, conversa vigente).
//   node --test ui/tests
import test from "node:test";
import assert from "node:assert/strict";
import { carregar } from "./carregar.mjs";

const args = (o) => JSON.stringify(o);
const DIA = "2026-11-03";

async function cenario(opcoes = {}) {
  const t = carregar({ recursos: { perfis: false, boleto: false, pix: false, cambio: false } });
  const { conta: banco } = await t.req(t.A.createConta, { conta: { nome: "Sintética", tipo: "corrente", saldo: 1000 } });
  const { conta: cartao } = await t.req(t.A.createConta, { conta: { nome: "Cartão", tipo: "cartao", saldo: 0, fechamento: 3, vencimento: 10 } });
  const { categoria: k } = await t.req(t.A.createCategoria, { categoria: { nome: "Teste" } });
  const zo = t.Z.zoFerramentas.criar((a, d) => t.req(a, d), Object.assign({ perfis: () => false }, opcoes));
  const base = { descricao: "Teste", valor: 10, tipo: "debito", conta_id: banco.id, categoria_id: k.id, data: DIA };
  const lancs = async () => (await t.req(t.A.getLancamentos)).lancamentos;
  return { t, zo, banco, cartao, k, base, lancs };
}
const falha = (t) => new t.Z.messages.BridgeError("OPERATION_FAILED", "falha simulada");

test("ZO-01: receita (e estorno, transferência) não vira recorrência nem parcela; nada é gravado", async () => {
  const { t, zo, base, lancs } = await cenario();
  for (const tipo of ["receita", "estorno", "transferencia_entrada"]) {
    for (const extra of [{ recorrencia: "mensal" }, { parcelas: 3 }]) {
      const r = await zo.executar("criar_transacao", args({ ...base, tipo, valor: 100, ...extra }));
      assert.equal(r.tipo, "leitura", tipo);
      assert.equal(JSON.parse(r.resultado).erro, "dados_invalidos");
    }
  }
  assert.equal((await lancs()).length, 0);
  // e o serviço recusa direto (a tela "Nova recorrência" também passava por aqui)
  const { lancamento } = await t.req(t.A.createLancamento, { lancamento: { data: DIA, descricao: "Salário", valor: 100, tipo: "receita", contaId: base.conta_id } });
  await assert.rejects(t.req(t.A.tornarRecorrente, { id: lancamento.id, recorrencia: "mensal" }), (e) => e.code === "RECURRENCE_TYPE");
  const resumo = JSON.parse((await zo.executar("resumo_do_mes", args({ mes: "2026-11" }))).resultado);
  assert.deepEqual([resumo.gasto, resumo.recebido], [0, 100]);
  // despesa e débito continuam repetindo
  const ok = await zo.executar("criar_transacao", args({ ...base, recorrencia: "mensal" }));
  assert.equal(JSON.parse(await ok.confirmar()).ok, true);
});

test("ZO-02: criar + parcelar é tudo ou nada (falha numa etapa não deixa a transação pela metade)", async () => {
  const pre = await cenario();
  const { t, base, lancs } = pre;
  const zo = t.Z.zoFerramentas.criar((a, d) => t.req(a, d), {
    perfis: () => false,
    lote: (passo) => t.Z.servico.lote((x) => passo((a, d) => { if (a === t.A.tornarRecorrente) throw falha(t); return x(a, d); })),
  });
  const r = await zo.executar("criar_transacao", args({ ...base, descricao: "Parcial", parcelas: 3 }));
  const res = JSON.parse(await r.confirmar());
  assert.equal(res.erro, "OPERATION_FAILED");
  assert.deepEqual((await lancs()).filter((l) => l.descricao === "Parcial"), []);
});

test("ZO-02: editar conta com vários campos não grava só a primeira parte", async () => {
  const { t, cartao } = await cenario();
  const zo = t.Z.zoFerramentas.criar((a, d) => t.req(a, d), {
    perfis: () => false,
    lote: (passo) => t.Z.servico.lote((x) => passo((a, d) => { if (a === t.A.updateCicloCartao) throw falha(t); return x(a, d); })),
  });
  const r = await zo.executar("editar_conta", args({ id: cartao.id, nome: "Novo nome", fechamento: 5, vencimento: 12 }));
  assert.equal(JSON.parse(await r.confirmar()).erro, "OPERATION_FAILED");
  const agora = (await t.req(t.A.getContas)).contas.find((c) => c.id === cartao.id);
  assert.equal(agora.nome, "Cartão");
});

test("ZO-02: o lote do serviço desfaz tudo se uma etapa falha (uma gravação só)", async () => {
  const { t, banco, lancs } = await cenario();
  await assert.rejects(t.Z.servico.lote((x) => {
    x(t.A.createLancamento, { lancamento: { data: DIA, descricao: "A", valor: 1, tipo: "debito", contaId: banco.id } });
    x(t.A.updateConta, { id: banco.id, nome: "Mudou" });
    throw falha(t);
  }));
  assert.equal((await lancs()).length, 0);
  assert.equal((await t.req(t.A.getContas)).contas.find((c) => c.id === banco.id).nome, "Sintética");
});

test("ZO-03: cartão preparado antes de outra edição não sobrescreve a edição (proposta vencida)", async () => {
  const { t, zo, base, lancs } = await cenario();
  const c = await zo.executar("criar_transacao", args(base));
  await c.confirmar();
  const l = (await lancs()).find((x) => x.descricao === "Teste");
  const velho = await zo.executar("editar_transacao", args({ id: l.id, valor: 20 }));
  await t.req(t.A.updateLancamento, { id: l.id, lancamento: { ...l, descricao: "Posterior" } });
  const r = JSON.parse(await velho.confirmar());
  assert.equal(r.erro, "STALE_PROPOSAL");
  const agora = (await lancs()).find((x) => x.id === l.id);
  assert.deepEqual([agora.descricao, agora.valor], ["Posterior", 10]);
  // sem edição no meio, a mesma operação grava
  const novo = await zo.executar("editar_transacao", args({ id: l.id, valor: 20 }));
  assert.equal(JSON.parse(await novo.confirmar()).ok, true);
  assert.equal((await lancs()).find((x) => x.id === l.id).valor, 20);
});

test("ZO-04: a mesma confirmação chamada duas vezes grava uma vez só", async () => {
  const { zo, base, lancs } = await cenario();
  const r = await zo.executar("criar_transacao", args(base));
  const [a, b] = await Promise.all([r.confirmar(), r.confirmar()]);
  assert.equal(a, b);
  assert.equal(await r.confirmar(), a);
  assert.equal((await lancs()).length, 1);
});

test("ZO-05: data impossível, parcelas fora da faixa e parcela + recorrência são recusadas (sem trocar por padrão)", async () => {
  const { zo, base, lancs } = await cenario();
  const casos = [
    [{ ...base, data: "2026-02-30" }, ["data"]],
    [{ ...base, parcelas: 1000 }, ["parcelas"]],
    [{ ...base, recorrencia: "todo_dia" }, ["recorrencia"]],
    [{ ...base, parcelas: 3, recorrencia: "mensal" }, ["parcelas", "recorrencia"]],
    [{ ...base, valor: "10" }, ["valor"]],
    [{ ...base, tipo: "salario" }, ["tipo"]],
  ];
  for (const [a, campos] of casos) {
    const r = await zo.executar("criar_transacao", args(a));
    assert.equal(r.tipo, "leitura", JSON.stringify(a));
    const x = JSON.parse(r.resultado);
    assert.equal(x.erro, "dados_invalidos");
    assert.deepEqual(x.campos, campos);
  }
  // mês torto numa leitura também não vira "mês atual"
  assert.deepEqual(JSON.parse((await zo.executar("resumo_do_mes", args({ mes: "2026-13" }))).resultado).campos, ["mes"]);
  assert.equal((await lancs()).length, 0);
});

test("ZO-05/10: chamada marcada pelo servidor como fora do esquema não executa", async () => {
  const { zo, base, lancs } = await cenario();
  const r = await zo.executar("criar_transacao", args(base), ["tipo: valor fora da lista", "extra: campo desconhecido"]);
  assert.equal(r.tipo, "leitura");
  assert.deepEqual(JSON.parse(r.resultado).campos, ["tipo: valor fora da lista", "extra: campo desconhecido"]);
  assert.equal((await lancs()).length, 0);
});

test("ZO-06: saldo negativo aparece com o sinal no cartão", async () => {
  const { zo, t } = await cenario();
  const r = await zo.executar("criar_conta", args({ nome: "Negativa", tipo: "corrente", saldo: -500 }));
  assert.equal(Object.fromEntries(r.linhas).Saldo, "-R$ 500,00");
  await r.confirmar();
  assert.equal((await t.req(t.A.getContas)).contas.find((c) => c.nome === "Negativa").valor, -500);
});

test("ZO-07: receita com os mesmos dados de um débito não some na importação; FITID evita duplicar", async () => {
  const { t, banco } = await cenario();
  const it = { data: DIA, descricao: "Mesmo nome", valor: 25, tipo: "debito" };
  assert.deepEqual(await t.req(t.A.importarLancamentos, { contaId: banco.id, itens: [it] }), { importados: 1, repetidos: 0 });
  assert.deepEqual(await t.req(t.A.importarLancamentos, { contaId: banco.id, itens: [{ ...it, tipo: "receita" }] }), { importados: 1, repetidos: 0 });
  // a reimportação exata continua sem duplicar
  assert.deepEqual(await t.req(t.A.importarLancamentos, { contaId: banco.id, itens: [it] }), { importados: 0, repetidos: 1 });
  // com o identificador do banco: duas compras iguais no mesmo dia entram; o mesmo extrato de novo não
  const a = { ...it, descricao: "Café", origemId: "FIT-1" }, b = { ...it, descricao: "Café", origemId: "FIT-2" };
  assert.deepEqual(await t.req(t.A.importarLancamentos, { contaId: banco.id, itens: [a, b] }), { importados: 2, repetidos: 0 });
  assert.deepEqual(await t.req(t.A.importarLancamentos, { contaId: banco.id, itens: [a, b] }), { importados: 0, repetidos: 2 });
});

test("ZO-07: o OFX leva o FITID de cada transação", () => {
  const { Z } = carregar();
  const ofx = "<OFX><BANKMSGSRSV1><STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261103<TRNAMT>-25.00<FITID>abc123<MEMO>Café</STMTTRN></BANKMSGSRSV1></OFX>";
  assert.equal(Z.importar.ler(ofx).itens[0].origemId, "abc123");
});

test("ZO-08: valores malformados ou ambíguos são recusados; os formatos de verdade continuam", () => {
  const { Z } = carregar();
  for (const ruim of ["12.34.56", "1,2,3", "1,234", "1.2.3,4", "12,345", "1..5", "1,23.4"]) assert.equal(Z.importar.valor(ruim), null, ruim);
  const bons = { "1.234,56": 1234.56, "1,234.56": 1234.56, "1234.56": 1234.56, "-45,90": -45.9, "R$ 1.234": 1234, "(10,00)": -10, "0,5": 0.5,
    "1.234.567,89": 1234567.89, "1,234,567.89": 1234567.89, "350": 350, "10.5-": -10.5 };
  for (const [txt, v] of Object.entries(bons)) assert.equal(Z.importar.valor(txt), v, txt);
});

test("ZO-12: as leituras dizem a moeda dos valores", async () => {
  const { zo, base } = await cenario();
  await (await zo.executar("criar_transacao", args(base))).confirmar();
  for (const nome of ["listar_contas", "listar_categorias", "listar_recorrencias", "buscar_transacoes", "resumo_do_mes"]) {
    assert.equal(JSON.parse((await zo.executar(nome, "{}")).resultado).moeda, "BRL", nome);
  }
});

test("ZO-11: resultado grande demais continua JSON válido e avisa que foi cortado", async () => {
  const { t, zo } = await cenario();
  for (let i = 0; i < 260; i += 1) await t.req(t.A.createCategoria, { categoria: { nome: "Categoria com nome comprido número " + i } });
  const r = (await zo.executar("listar_categorias", "{}")).resultado;
  assert.ok(r.length <= 18000);
  const x = JSON.parse(r);
  assert.equal(x.cortado, true);
  assert.ok(x.dados.categorias.length > 0 && x.dados.categorias.length < 262);
});

test("ZO-15: conversa que deixou de valer não grava (nova conversa, sair, consentimento retirado)", async () => {
  let vale = true;
  const { zo, base, lancs } = await cenario({ vigente: () => vale });
  const r = await zo.executar("criar_transacao", args(base));
  vale = false;
  assert.equal(JSON.parse(await r.confirmar()).cancelado, true);
  assert.equal((await lancs()).length, 0);
});

test("ZO-15: a biometria demorou e a conversa acabou: a exclusão não acontece", async () => {
  let vale = true;
  const tela = { verificarIdentidade: async () => { vale = false; return "ok"; } };
  const { zo, base, lancs } = await cenario({ vigente: () => vale, tela });
  vale = true;
  await (await zo.executar("criar_transacao", args(base))).confirmar();
  const l = (await lancs())[0];
  const r = await zo.executar("excluir_transacao", args({ id: l.id }));
  assert.equal(JSON.parse(await r.confirmar()).cancelado, true);
  assert.equal((await lancs()).length, 1);
});
