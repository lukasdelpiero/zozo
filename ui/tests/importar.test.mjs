// Testes da importação de arquivos do banco (js/data/importar.ts + importarLancamentos e sugerirCategorias no serviço).
// O arquivo é lido no navegador; o serviço grava tudo ou nada, nas regras de uma transação nova, sem repetir o que já existe.
//   node --test ui/tests
import test from "node:test";
import assert from "node:assert/strict";
import { carregar } from "./carregar.mjs";

const codigo = (c) => (e) => { assert.equal(e.code, c); return true; };
const simples = (v) => JSON.parse(JSON.stringify(v));          // objetos do contexto isolado (vm) → comparáveis

test("importar: OFX de cartão (com e sem tags de fechamento) e datas e valores do banco", () => {
  const { Z } = carregar();
  const ofx = `OFXHEADER:100
<OFX><CREDITCARDMSGSRSV1><CCSTMTTRNRS><CCSTMTRS><BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261003120000[-3:BRT]<TRNAMT>-89.90<MEMO>UBER *TRIP</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20261005
<TRNAMT>1500.00
<NAME>Pagamento recebido
</STMTTRN>
<STMTTRN><DTPOSTED>2026xx<TRNAMT>-1<MEMO>quebrada</STMTTRN>
</BANKTRANLIST></CCSTMTRS></CCSTMTTRNRS></CREDITCARDMSGSRSV1></OFX>`;
  const r = simples(Z.importar.ler(ofx));
  assert.equal(r.formato, "ofx");
  assert.equal(r.cartao, true);
  assert.deepEqual(r.itens, [{ data: "2026-10-03", descricao: "UBER *TRIP", valor: -89.9 }, { data: "2026-10-05", descricao: "Pagamento recebido", valor: 1500 }]);
  assert.equal(r.ignoradas, 1);
  const v = (t) => Z.importar.valor(t);
  assert.deepEqual([v("1.234,56"), v("1,234.56"), v("R$ -12,50"), v("(12,50)"), v("12.5"), v("1.234"), v("abc"), v("")], [1234.56, 1234.56, -12.5, -12.5, 12.5, 1234, null, null]);
  const d = (t) => Z.importar.data(t);
  assert.deepEqual([d("29/10/2026"), d("29/10/26"), d("2026-10-29"), d("31/02/2026"), d("hoje")], ["2026-10-29", "2026-10-29", "2026-10-29", null, null]);
});

test("importar: CSV com cabeçalho (Nubank), com ponto e vírgula e aspas, e sem cabeçalho", () => {
  const { Z } = carregar();
  const nubank = "date,title,amount\n2026-10-01,Mercado Livre,59.90\n2026-10-02,\"Restaurante, centro\",120.00\n2026-10-03,Pagamento recebido,-500.00\n";
  assert.deepEqual(simples(Z.importar.ler(nubank)).itens.map((x) => [x.descricao, x.valor]), [["Mercado Livre", 59.9], ["Restaurante, centro", 120], ["Pagamento recebido", -500]]);
  const itau = "﻿Data;Lançamento;Valor (R$)\n01/10/2026;PADARIA REAL;-15,90\n02/10/2026;SALARIO;5.000,00\nTotal;;4.984,10\n";
  const r = simples(Z.importar.ler(itau));
  assert.deepEqual(r.itens, [{ data: "2026-10-01", descricao: "PADARIA REAL", valor: -15.9 }, { data: "2026-10-02", descricao: "SALARIO", valor: 5000 }]);
  assert.equal(r.ignoradas, 1);                                                   // a linha de total fica de fora
  const semCabecalho = "05/10/2026;Farmácia São João;-42,00\n06/10/2026;Posto Shell;-200,00\n";
  assert.deepEqual(simples(Z.importar.ler(semCabecalho)).itens.map((x) => x.descricao), ["Farmácia São João", "Posto Shell"]);
  assert.deepEqual(simples(Z.importar.ler("isto não é um extrato")).itens, []);
});

async function cenario() {
  const t = carregar();
  const { conta: cartao } = await t.req(t.A.createConta, { conta: { nome: "Nubank", tipo: "cartao", saldo: 0 } });
  const { conta: banco } = await t.req(t.A.createConta, { conta: { nome: "Itaú", tipo: "corrente", saldo: 1000 } });
  const { categoria: transporte } = await t.req(t.A.createCategoria, { categoria: { nome: "Transporte" } });
  const { categoria: mercado } = await t.req(t.A.createCategoria, { categoria: { nome: "Mercado" } });
  return { t, cartao, banco, transporte, mercado };
}

test("importar: grava tudo ou nada, nas regras de uma transação nova, sem repetir o que já existe", async () => {
  const { t, cartao, banco, transporte } = await cenario();
  const item = (extra) => Object.assign({ data: "2026-10-03", descricao: "UBER *TRIP", valor: 89.9, tipo: "regular", categoriaId: transporte.id }, extra);
  assert.deepEqual(simples(await t.req(t.A.importarLancamentos, { contaId: cartao.id, itens: [item(), item({ descricao: "Café" }), item({ descricao: "Café" })] })), { importados: 3, repetidos: 0 });
  // o mesmo arquivo de novo (mais uma linha nova): só a nova entra; repetidas na mesma quantidade
  assert.deepEqual(simples(await t.req(t.A.importarLancamentos, { contaId: cartao.id, itens: [item(), item({ descricao: "Café" }), item({ descricao: "Café" }), item({ descricao: "Cinema" })] })),
    { importados: 1, repetidos: 3 });
  assert.equal((await t.req(t.A.getContas)).contas.find((c) => c.id === cartao.id).valor, 359.6);   // o saldo acompanha
  const contar = async () => (await t.req(t.A.getLancamentos)).lancamentos.length;
  const antes = await contar();
  const ruins = [
    [{ contaId: cartao.id, itens: [item(), item({ valor: 0 })] }, "OPERATION_FAILED"],              // uma linha ruim recusa tudo
    [{ contaId: cartao.id, itens: [item({ tipo: "debito" })] }, "IMPORT_INVALID"],                  // débito não é de cartão
    [{ contaId: banco.id, itens: [item({ tipo: "regular" })] }, "IMPORT_INVALID"],                  // conta: só débito e receita
    [{ contaId: cartao.id, itens: [item({ tipo: "fatura" })] }, "IMPORT_INVALID"],
    [{ contaId: cartao.id, itens: [item({ data: "2026-02-30" })] }, "OPERATION_FAILED"],
    [{ contaId: "c-inexistente", itens: [item()] }, "IMPORT_ACCOUNT"],
    [{ contaId: cartao.id, itens: [] }, "IMPORT_INVALID"],
    [{ contaId: cartao.id, itens: Array.from({ length: 501 }, (_, i) => item({ descricao: "X" + i })) }, "IMPORT_INVALID"],
  ];
  for (const [pedido, cod] of ruins) await assert.rejects(t.req(t.A.importarLancamentos, pedido), codigo(cod), cod);
  assert.equal(await contar(), antes);
  assert.deepEqual(simples(await t.req(t.A.importarLancamentos, { contaId: banco.id, itens: [item({ tipo: "debito", categoriaId: null }), item({ tipo: "receita", descricao: "Salário", valor: 5000 })] })),
    { importados: 2, repetidos: 0 });
  assert.equal((await t.req(t.A.getContas)).contas.find((c) => c.id === banco.id).valor, 5910.1);
});

test("sugerir categorias pelo histórico: mesma descrição, palavras em comum; nada parecido = sem sugestão", async () => {
  const { t, cartao, transporte, mercado } = await cenario();
  const lanc = (descricao, categoriaId) => t.req(t.A.createLancamento, { lancamento: { data: "2026-10-01", descricao, valor: 10, tipo: "regular", contaId: cartao.id, categoriaId } });
  await lanc("Uber Trip", transporte.id); await lanc("UBER *TRIP 2/3", transporte.id); await lanc("Supermercado Dia", mercado.id);
  const r = simples(await t.req(t.A.sugerirCategorias, { descricoes: ["UBER *TRIP", "supermercado DIA", "Compra parcelada 1/2", "Livraria"] }));
  assert.deepEqual(r.sugestoes.map((s) => s.nome), ["Transporte", "Mercado", null, null]);
});
