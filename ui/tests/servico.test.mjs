// Testes do serviço de dados (regras financeiras que rodam no navegador).
//   node --test ui/tests
import test from "node:test";
import assert from "node:assert/strict";
import { carregar } from "./carregar.mjs";

const hoje = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
const ontem = () => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10); };
const saldo = async (t, id) => (await t.req(t.A.getContas)).contas.find((c) => c.id === id).valor;

test("débito sai do saldo da conta, acompanha edição e volta ao excluir", async () => {
  const t = carregar();
  const { conta } = await t.req(t.A.createConta, { conta: { nome: "Itaú", tipo: "corrente", saldo: 1000 } });
  const { lancamento } = await t.req(t.A.createLancamento, { lancamento: { data: hoje(), descricao: "Padaria", valor: 200, tipo: "debito", contaId: conta.id } });
  assert.equal(await saldo(t, conta.id), 800);
  await t.req(t.A.updateLancamento, { id: lancamento.id, lancamento: { data: hoje(), descricao: "Padaria", valor: 300, tipo: "debito", contaId: conta.id } });
  assert.equal(await saldo(t, conta.id), 700);                                   // nunca em dobro
  await t.req(t.A.updateLancamento, { id: lancamento.id, lancamento: { data: hoje(), descricao: "Padaria", valor: 300, tipo: "regular", contaId: conta.id } });
  assert.equal(await saldo(t, conta.id), 1000);                                  // deixou de ser débito
  await t.req(t.A.updateLancamento, { id: lancamento.id, lancamento: { data: hoje(), descricao: "Padaria", valor: 300, tipo: "debito", contaId: conta.id } });
  await t.req(t.A.deleteLancamento, { id: lancamento.id });
  assert.equal(await saldo(t, conta.id), 1000);
});

test("débito não aceita cartão e só sai do saldo na data", async () => {
  const t = carregar();
  const { conta: cartao } = await t.req(t.A.createConta, { conta: { nome: "Nubank", tipo: "cartao", saldo: 0 } });
  await assert.rejects(t.req(t.A.createLancamento, { lancamento: { data: hoje(), descricao: "X", valor: 10, tipo: "debito", contaId: cartao.id } }), (e) => e.code === "DEBIT_ACCOUNT");
  const { conta } = await t.req(t.A.createConta, { conta: { nome: "Caixa", tipo: "poupanca", saldo: 500 } });
  const futuro = new Date(); futuro.setDate(futuro.getDate() + 10);
  await t.req(t.A.createLancamento, { lancamento: { data: futuro.toISOString().slice(0, 10), descricao: "Agendado", valor: 100, tipo: "debito", contaId: conta.id } });
  assert.equal(await saldo(t, conta.id), 500);
  await t.req(t.A.createLancamento, { lancamento: { data: ontem(), descricao: "Ontem", valor: 50, tipo: "debito", contaId: conta.id } });
  assert.equal(await saldo(t, conta.id), 450);
});

test("parcelado pelo valor total: 1ª parcela leva a sobra; a partir da 2ª, todas iguais", async () => {
  const t = carregar();
  const a = await t.req(t.A.createLancamento, { lancamento: { data: hoje(), descricao: "Fone", valor: 141, tipo: "regular" } });
  await t.req(t.A.tornarRecorrente, { id: a.lancamento.id, recorrencia: "parcelada", parcelaAtual: 1, parcelaTotal: 7, valorTotal: 141 });
  let serie = (await t.req(t.A.getLancamentos)).lancamentos.filter((l) => l.serieId === a.lancamento.id || l.id === a.lancamento.id)
    .sort((x, y) => x.parcelaAtual - y.parcelaAtual).map((l) => l.valor);
  assert.deepEqual(serie, [20.16, 20.14, 20.14, 20.14, 20.14, 20.14, 20.14]);
  const b = await t.req(t.A.createLancamento, { lancamento: { data: hoje(), descricao: "Mesa", valor: 141, tipo: "regular" } });
  await t.req(t.A.tornarRecorrente, { id: b.lancamento.id, recorrencia: "parcelada", parcelaAtual: 2, parcelaTotal: 7, valorTotal: 141 });
  serie = (await t.req(t.A.getLancamentos)).lancamentos.filter((l) => l.serieId === b.lancamento.id || l.id === b.lancamento.id).map((l) => l.valor);
  assert.deepEqual(serie, [20.14, 20.14, 20.14, 20.14, 20.14, 20.14]);
  const c = await t.req(t.A.createLancamento, { lancamento: { data: hoje(), descricao: "Exato", valor: 141, tipo: "regular" } });
  await t.req(t.A.tornarRecorrente, { id: c.lancamento.id, recorrencia: "parcelada", parcelaAtual: 1, parcelaTotal: 6, valorTotal: 141 });
  serie = (await t.req(t.A.getLancamentos)).lancamentos.filter((l) => l.serieId === c.lancamento.id || l.id === c.lancamento.id).map((l) => l.valor);
  assert.ok(serie.every((v) => v === 23.5) && serie.length === 6);
});

test("lançamento recorrente pode ser dividido: cada parte vira uma série com o seu perfil", async () => {
  const t = carregar();
  const p1 = (await t.req(t.A.createPerfil, { perfil: { nome: "Casa" } })).perfil;
  const p2 = (await t.req(t.A.createPerfil, { perfil: { nome: "Mãe" } })).perfil;
  const k = (await t.req(t.A.createCategoria, { categoria: { nome: "Aluguel" } })).categoria;
  const { lancamento } = await t.req(t.A.createLancamento, { lancamento: { data: hoje(), descricao: "Aluguel", valor: 100, tipo: "regular", categoriaId: k.id, perfilId: p1.id } });
  await t.req(t.A.tornarRecorrente, { id: lancamento.id, recorrencia: "mensal" });
  await t.req(t.A.dividirLancamento, { id: lancamento.id, partes: [
    { valor: 60, data: hoje(), categoriaId: k.id, perfilId: p1.id }, { valor: 40, data: hoje(), categoriaId: k.id, perfilId: p2.id }] });
  const rec = await t.req(t.A.getRecorrencias, {});
  assert.deepEqual(rec.recorrencias.map((r) => r.valor).sort(), [40, 60]);
  assert.equal(new Set(rec.recorrencias.map((r) => r.serieId)).size, 2);
});

test("grupo: não atribuído cobre o estouro das categorias e o resto fica no grupo", async () => {
  const t = carregar();
  const a = (await t.req(t.A.createCategoria, { categoria: { nome: "A", grupo: "G", reservado: 2000 } })).categoria;
  const b = (await t.req(t.A.createCategoria, { categoria: { nome: "B", grupo: "G", reservado: 1000 } })).categoria;
  await t.req(t.A.createLancamento, { lancamento: { data: hoje(), descricao: "a", valor: 2500, tipo: "regular", categoriaId: a.id } });
  await t.req(t.A.createLancamento, { lancamento: { data: hoje(), descricao: "b", valor: 2000, tipo: "regular", categoriaId: b.id } });
  // grupo sem valor próprio: orçamento total continua numérico (não NaN/null)
  assert.equal((await t.req(t.A.getCategorias, {})).resumo.reservado, 3000);
  assert.equal((await t.req(t.A.getDashboard, {})).gastoMensal.orcamento, 3000);
  const r = await t.req(t.A.updateGrupo, { nome: "G", naoAtribuido: 4000, modo: "fixo" });
  assert.deepEqual([r.coberto, r.restante], [1500, 2500]);
  const cats = await t.req(t.A.getCategorias, {});
  assert.equal(cats.categorias.find((c) => c.id === a.id).reservado, 2500);
  assert.equal(cats.categorias.find((c) => c.id === b.id).reservado, 2000);
  assert.deepEqual([cats.grupos.G.naoAtribuido, cats.grupos.G.subcategorias, cats.grupos.G.total], [2500, 4500, 7000]);
  assert.equal(cats.resumo.reservado, 7000);
  // salvar de novo não cobre o mesmo estouro duas vezes; gasto novo é coberto pelo que sobrou
  await t.req(t.A.updateGrupo, { nome: "G", naoAtribuido: 4000, modo: "fixo" });
  assert.equal((await t.req(t.A.getCategorias, {})).resumo.reservado, 7000);
  await t.req(t.A.createLancamento, { lancamento: { data: hoje(), descricao: "a2", valor: 300, tipo: "regular", categoriaId: a.id } });
  const c2 = await t.req(t.A.getCategorias, {});
  assert.deepEqual([c2.categorias.find((c) => c.id === a.id).reservado, c2.grupos.G.naoAtribuido, c2.resumo.reservado], [2800, 2200, 7000]);
  // orçamento só deste mês
  await t.req(t.A.updateGrupo, { nome: "G", naoAtribuido: 1000, modo: "mes" });
  const c3 = await t.req(t.A.getCategorias, {});
  assert.deepEqual([c3.grupos.G.porMes, c3.grupos.G.naoAtribuido, c3.grupos.G.naoAtribuidoFixo, c3.resumo.reservado], [true, 0, 4000, 4000]);
  await t.req(t.A.desagruparCategorias, { nome: "G" });
  assert.ok((await t.req(t.A.getCategorias, {})).categorias.every((c) => !c.grupo));
});

test("multicâmbio: cada moeda tem seus dados; desativar volta ao Real sem apagar nada", async () => {
  const t = carregar();
  await t.req(t.A.createConta, { conta: { nome: "Itaú", tipo: "corrente", saldo: 100 } });
  const x = await t.req(t.A.createLancamento, { lancamento: { data: hoje(), descricao: "X", valor: 200, tipo: "regular" } });
  await t.req(t.A.updateConfig, { multicambio: true });
  const r = await t.req(t.A.updateConfig, { moeda: "EUR" });
  assert.equal(r.primeiraVez, true);
  assert.equal((await t.req(t.A.getContas)).contas.length, 0);                    // mundo novo
  await t.req(t.A.createConta, { conta: { nome: "N26", tipo: "corrente", saldo: 50 } });
  await t.req(t.A.transferirMoeda, { ids: [x.lancamento.id] });
  assert.deepEqual((await t.req(t.A.getLancamentos)).lancamentos.map((l) => [l.descricao, l.valor]), [["X", 200]]);   // 200 € (sem conversão)
  assert.equal((await t.req(t.A.updateConfig, { moeda: "EUR" })).primeiraVez, false);
  await t.req(t.A.updateConfig, { multicambio: false });
  const brl = await t.req(t.A.getContas);
  assert.deepEqual(brl.contas.map((c) => c.nome), ["Itaú"]);
  assert.equal((await t.req(t.A.getLancamentos)).lancamentos.length, 0);
  await t.req(t.A.updateConfig, { multicambio: true });
  await t.req(t.A.updateConfig, { moeda: "EUR" });
  assert.deepEqual((await t.req(t.A.getContas)).contas.map((c) => c.nome), ["N26"]);   // guardado ao reativar
});

test("multicâmbio: transferir leva a série inteira e troca conta/categoria pelas da moeda (débito sai da conta nova)", async () => {
  const t = carregar();
  const { conta } = await t.req(t.A.createConta, { conta: { nome: "Itaú", tipo: "corrente", saldo: 1000 } });
  const { categoria } = await t.req(t.A.createCategoria, { categoria: { nome: "Casa", reservado: 0 } });
  const deb = (await t.req(t.A.createLancamento, { lancamento: { data: hoje(), descricao: "Padaria", valor: 200, tipo: "debito", contaId: conta.id, categoriaId: categoria.id } })).lancamento;
  const tv = (await t.req(t.A.createLancamento, { lancamento: { data: hoje(), descricao: "TV", valor: 300, tipo: "regular", contaId: conta.id } })).lancamento;
  await t.req(t.A.tornarRecorrente, { id: tv.id, recorrencia: "parcelada", parcelaAtual: 1, parcelaTotal: 3 });
  const parcelas = (await t.req(t.A.getLancamentos)).lancamentos.filter((l) => l.descricao === "TV");
  assert.equal(parcelas.length, 3);
  assert.equal(await saldo(t, conta.id), 800);
  await t.req(t.A.updateConfig, { multicambio: true });
  await t.req(t.A.updateConfig, { moeda: "USD" });
  // pediu só a 2ª parcela: as 3 vão juntas
  const r = await t.req(t.A.transferirMoeda, { ids: [deb.id, parcelas.find((l) => l.parcelaAtual === 2).id] });
  assert.equal(r.transferidos, 4);
  const usd = await t.req(t.A.getContas);
  assert.deepEqual(usd.contas.map((c) => [c.nome, c.valor]), [["Itaú", -200]]);              // cópia começa em 0; o débito sai dela
  const cats = (await t.req(t.A.getCategorias, {})).categorias.map((c) => c.nome);
  assert.ok(cats.includes("Casa"));
  const lista = (await t.req(t.A.getLancamentos)).lancamentos;
  assert.ok(lista.every((l) => l.contaId === usd.contas[0].id));
  await t.req(t.A.updateConfig, { moeda: "BRL" });
  assert.equal(await saldo(t, conta.id), 1000);                                    // a conta em Real recebeu o valor de volta
  assert.equal((await t.req(t.A.getLancamentos)).lancamentos.length, 0);
});

test("multicâmbio: transferir entre moedas só com o recurso liberado", async () => {
  const t = carregar({ recursos: { perfis: false, boleto: false, pix: false, cambio: false } });
  const x = (await t.req(t.A.createLancamento, { lancamento: { data: hoje(), descricao: "X", valor: 10, tipo: "regular" } })).lancamento;
  await t.req(t.A.updateConfig, { multicambio: true });
  await t.req(t.A.updateConfig, { moeda: "EUR" });
  await assert.rejects(t.req(t.A.transferirMoeda, { ids: [x.id] }), (e) => e.code === "FEATURE_UNAVAILABLE");
  assert.equal((await t.req(t.A.getLancamentos)).lancamentos.length, 0);
});

test("categoria com transação não sai do orçamento; sem transação, sai", async () => {
  const t = carregar();
  const usada = (await t.req(t.A.createCategoria, { categoria: { nome: "Usada", reservado: 100 } })).categoria;
  const livre = (await t.req(t.A.createCategoria, { categoria: { nome: "Livre", reservado: 100 } })).categoria;
  await t.req(t.A.createLancamento, { lancamento: { data: hoje(), descricao: "x", valor: 5, tipo: "regular", categoriaId: usada.id } });
  const cats = (await t.req(t.A.getCategorias, {})).categorias;
  assert.deepEqual([cats.find((c) => c.id === usada.id).usada, cats.find((c) => c.id === livre.id).usada], [true, false]);
  await assert.rejects(t.req(t.A.updateCategoria, { id: usada.id, status: "excluida" }), (e) => e.code === "CATEGORY_IN_USE");
  await assert.rejects(t.req(t.A.updateCategoria, { id: usada.id, categoria: { nome: "Usada", status: "excluida" } }), (e) => e.code === "CATEGORY_IN_USE");
  await t.req(t.A.updateCategoria, { id: livre.id, status: "excluida" });
  assert.equal((await t.req(t.A.getCategorias, {})).categorias.find((c) => c.id === livre.id).status, "excluida");
});

test("multicâmbio: transferência leva série e divisão de forma transitiva (auditoria F01)", async () => {
  const t = carregar();
  const p1 = (await t.req(t.A.createPerfil, { perfil: { nome: "Casa" } })).perfil;
  const p2 = (await t.req(t.A.createPerfil, { perfil: { nome: "Mãe" } })).perfil;
  const k = (await t.req(t.A.createCategoria, { categoria: { nome: "TV" } })).categoria;
  const { lancamento } = await t.req(t.A.createLancamento, { lancamento: { data: hoje(), descricao: "TV", valor: 100, tipo: "regular", categoriaId: k.id, perfilId: p1.id } });
  await t.req(t.A.tornarRecorrente, { id: lancamento.id, recorrencia: "parcelada", parcelaAtual: 1, parcelaTotal: 3 });
  await t.req(t.A.dividirLancamento, { id: lancamento.id, partes: [
    { valor: 60, data: hoje(), categoriaId: k.id, perfilId: p1.id }, { valor: 40, data: hoje(), categoriaId: k.id, perfilId: p2.id }] });
  const antes = (await t.req(t.A.getLancamentos)).lancamentos.filter((l) => l.descricao === "TV");
  assert.equal(antes.length, 6);                                           // 2 séries × 3 parcelas
  await t.req(t.A.updateConfig, { multicambio: true });
  await t.req(t.A.updateConfig, { moeda: "EUR" });
  // escolhe só a origem de UMA das séries: as duas séries inteiras (ligadas pela divisão) vão juntas
  const r = await t.req(t.A.transferirMoeda, { ids: [lancamento.id] });
  assert.equal(r.transferidos, 6);
  assert.equal((await t.req(t.A.getLancamentos)).lancamentos.filter((l) => l.descricao === "TV").length, 6);
  await t.req(t.A.updateConfig, { moeda: "BRL" });
  assert.equal((await t.req(t.A.getLancamentos)).lancamentos.filter((l) => l.descricao === "TV").length, 0);
});

test("valor ilegível no documento não vira zero gravado: abre só para leitura (auditoria F02)", async () => {
  const documento = { versao: 1, perfis: [], contas: [], categorias: [], grupos: {}, config: {}, meta: {},
    lancamentos: [{ id: "l1", data: hoje(), descricao: "A", valor: "abc", tipo: "regular" },
      { id: "l2", data: hoje(), descricao: "B", valor: "123.45", tipo: "regular" }] };
  const t = carregar({ documento });
  const lista = (await t.req(t.A.getLancamentos)).lancamentos;
  assert.equal(lista.find((l) => l.id === "l2").valor, 123.45);            // conversão conhecida, determinística
  await assert.rejects(t.req(t.A.createPerfil, { perfil: { nome: "X" } }), (e) => e.code === "DOCUMENT_INVALID_LOCKED");
  assert.equal(t.salvos.length, 0);                                        // nada foi gravado
  assert.equal(t.documento().lancamentos[0].valor, "abc");                 // o original continua intacto
  assert.ok(t.eventos.some((e) => e.detail && e.detail.codigo === "DOCUMENT_INVALID_LOCKED"));
});

test("ID repetido no documento bloqueia gravação (referências ficariam ambíguas)", async () => {
  const documento = { versao: 1, perfis: [], contas: [], categorias: [], grupos: {}, config: {}, meta: {},
    lancamentos: [{ id: "l1", data: hoje(), descricao: "A", valor: 1, tipo: "regular" }, { id: "l1", data: hoje(), descricao: "B", valor: 2, tipo: "regular" }] };
  const t = carregar({ documento });
  await assert.rejects(t.req(t.A.createPerfil, { perfil: { nome: "X" } }), (e) => e.code === "DOCUMENT_INVALID_LOCKED");
  assert.equal(t.salvos.length, 0);
});

test("multicâmbio: lista transações das outras moedas e traz de volta para o Real", async () => {
  const t = carregar();
  const a = (await t.req(t.A.createLancamento, { lancamento: { data: hoje(), descricao: "A", valor: 10, tipo: "regular" } })).lancamento;
  await t.req(t.A.updateConfig, { multicambio: true });
  await t.req(t.A.updateConfig, { moeda: "USD" });
  const outras = await t.req(t.A.getLancamentosOutrasMoedas);
  assert.deepEqual(outras.lancamentos.map((l) => [l.id, l.moeda]), [[a.id, "BRL"]]);
  await t.req(t.A.transferirMoeda, { ids: [a.id] });
  assert.equal((await t.req(t.A.getLancamentosOutrasMoedas)).lancamentos.length, 0);
  await t.req(t.A.updateConfig, { moeda: "BRL" });
  assert.equal((await t.req(t.A.getLancamentosOutrasMoedas)).lancamentos[0].moeda, "USD");
  await t.req(t.A.transferirMoeda, { ids: [a.id] });                         // de volta ao Real
  assert.deepEqual((await t.req(t.A.getLancamentos)).lancamentos.map((l) => l.descricao), ["A"]);
});

test("divisão de uma ocorrência recorrente já lançada: só aquele mês, partes na mesma série", async () => {
  const t = carregar();
  const p1 = (await t.req(t.A.createPerfil, { perfil: { nome: "Casa" } })).perfil;
  const p2 = (await t.req(t.A.createPerfil, { perfil: { nome: "Mãe" } })).perfil;
  const k = (await t.req(t.A.createCategoria, { categoria: { nome: "TV" } })).categoria;
  const o = (await t.req(t.A.createLancamento, { lancamento: { data: hoje(), descricao: "TV", valor: 90, tipo: "regular", categoriaId: k.id, perfilId: p1.id } })).lancamento;
  await t.req(t.A.tornarRecorrente, { id: o.id, recorrencia: "parcelada", parcelaAtual: 1, parcelaTotal: 3 });
  const membro = (await t.req(t.A.getLancamentos)).lancamentos.find((l) => l.descricao === "TV" && l.parcelaAtual === 2);
  await t.req(t.A.dividirLancamento, { id: membro.id, partes: [
    { valor: 60, data: membro.data, categoriaId: k.id, perfilId: p1.id }, { valor: 30, data: membro.data, categoriaId: k.id, perfilId: p2.id }] });
  const tvs = (await t.req(t.A.getLancamentos)).lancamentos.filter((l) => l.descricao === "TV");
  assert.equal(tvs.length, 4);                                                   // 1ª, 2ª (em duas partes) e 3ª
  const partes = tvs.filter((l) => l.parcelaAtual === 2);
  assert.deepEqual(partes.map((l) => l.valor).sort((a, b) => a - b), [30, 60]);
  assert.ok(partes.every((l) => l.serieId === o.id && l.tipo === "recorrente"));
  assert.equal(tvs.find((l) => l.parcelaAtual === 3).valor, 90);                // o mês seguinte não muda
});

test("ação em lote: tipo Débito só para transações em conta (não cartão)", async () => {
  const t = carregar();
  const conta = (await t.req(t.A.createConta, { conta: { nome: "Itaú", tipo: "corrente", saldo: 100 } })).conta;
  const cartao = (await t.req(t.A.createConta, { conta: { nome: "Nubank", tipo: "cartao", saldo: 0 } })).conta;
  const a = (await t.req(t.A.createLancamento, { lancamento: { data: hoje(), descricao: "a", valor: 10, tipo: "regular", contaId: conta.id } })).lancamento;
  const b = (await t.req(t.A.createLancamento, { lancamento: { data: hoje(), descricao: "b", valor: 10, tipo: "regular", contaId: cartao.id } })).lancamento;
  await assert.rejects(t.req(t.A.updateLancamentosEmLote, { ids: [a.id, b.id], tipo: "debito" }), (e) => e.code === "DEBIT_ACCOUNT");
  await t.req(t.A.updateLancamentosEmLote, { ids: [a.id], tipo: "debito" });
  assert.equal((await t.req(t.A.getContas)).contas.find((c) => c.id === conta.id).valor, 90);
});

test("cartão: fechamento e vencimento juntos, para todos os meses ou só um mês", async () => {
  const t = carregar();
  const c = (await t.req(t.A.createConta, { conta: { nome: "Nubank", tipo: "cartao", saldo: 0, fechamento: 3, vencimento: 10 } })).conta;
  for (const ruim of [{ fechamento: 5 }, { vencimento: 12 }, { fechamento: 0, vencimento: 12 }, { fechamento: "5a", vencimento: 12 }, { fechamento: 5, vencimento: 32 }]) {
    await assert.rejects(t.req(t.A.updateCicloCartao, Object.assign({ id: c.id, modo: "fixo" }, ruim)), (e) => e.code === "CARD_CYCLE_INVALID");
  }
  const mes = hoje().slice(0, 7);
  await t.req(t.A.updateCicloCartao, { id: c.id, fechamento: 25, vencimento: 5, modo: "mes", mes });
  let conta = (await t.req(t.A.getContas)).contas.find((x) => x.id === c.id);
  assert.deepEqual([conta.cicloAtual.fechamento, conta.cicloAtual.vencimento, conta.cicloAtual.soEsteMes, conta.fechamento], [25, 5, true, 3]);
  await t.req(t.A.updateCicloCartao, { id: c.id, fechamento: 7, vencimento: 15, modo: "fixo" });   // todos os meses: tira a exceção
  conta = (await t.req(t.A.getContas)).contas.find((x) => x.id === c.id);
  assert.deepEqual([conta.cicloAtual.fechamento, conta.cicloAtual.vencimento, conta.cicloAtual.soEsteMes], [7, 15, false]);
  const corrente = (await t.req(t.A.createConta, { conta: { nome: "Itaú", tipo: "corrente", saldo: 0 } })).conta;
  await assert.rejects(t.req(t.A.updateCicloCartao, { id: corrente.id, fechamento: 1, vencimento: 2, modo: "fixo" }), (e) => e.code === "OPERATION_FAILED");
});

test("multicâmbio: Enviar transações da moeda escolhida para outra (destino explícito)", async () => {
  const t = carregar();
  const a = (await t.req(t.A.createLancamento, { lancamento: { data: hoje(), descricao: "A", valor: 10, tipo: "regular" } })).lancamento;
  await t.req(t.A.updateConfig, { multicambio: true });
  await t.req(t.A.transferirMoeda, { ids: [a.id], destino: "EUR" });              // está em Real e envia para Euro
  assert.equal((await t.req(t.A.getLancamentos)).lancamentos.length, 0);
  await assert.rejects(t.req(t.A.transferirMoeda, { ids: [a.id], destino: "XYZ" }), (e) => e.code === "OPERATION_FAILED");
  await t.req(t.A.updateConfig, { moeda: "EUR" });
  assert.deepEqual((await t.req(t.A.getLancamentos)).lancamentos.map((l) => l.descricao), ["A"]);
});

test("Pix: só CPF válido, celular com DDD do Brasil começando por 9, e-mail; nome só com letras", async () => {
  const t = carregar();
  const P = t.Z.pix;
  assert.equal(P.normalizarChave("529.982.247-25"), "52998224725");
  assert.equal(P.normalizarChave("529.982.247-24"), null);                        // dígito verificador errado
  assert.equal(P.normalizarChave("+55 (11) 98765-4321"), "+5511987654321");
  assert.equal(P.normalizarChave("+55 (11) 88765-4321"), null);                   // sem o 9
  assert.equal(P.normalizarChave("+55 (20) 98765-4321"), null);                   // DDD 20 não existe
  assert.equal(P.normalizarChave("11987654321"), null);                           // número solto não é chave
  assert.equal(P.normalizarChave("12.345.678/0001-95"), null);                    // CNPJ: sem suporte
  assert.equal(P.normalizarChave("Nome@Exemplo.com"), "nome@exemplo.com");
  assert.ok(P.nomeValido("João da Silva"));
  for (const ruim of ["João2", "Ana!", " ", "", "a  b"]) assert.ok(!P.nomeValido(ruim), ruim);
  await assert.rejects(t.req(t.A.updateConfig, { pix: { chave: "52998224725", nome: "Loja 1", cidade: "SP" } }), (e) => e.code === "PIX_INVALID");
  await t.req(t.A.updateConfig, { pix: { chave: "52998224725", nome: "Joana", cidade: "SP" } });
});

test("estrutura inválida no documento não é descartada ao gravar (auditoria A01)", async () => {
  const base = { versao: 1, perfis: [], contas: [], categorias: [], grupos: {}, config: {}, meta: {}, lancamentos: [] };
  const casos = {
    colecaoObjeto: Object.assign({}, base, { lancamentos: { l1: { id: "l1", valor: 125, data: "2026-10-11", tipo: "regular", descricao: "x" } } }),
    itemNulo: Object.assign({}, base, { lancamentos: [null, { id: "l1", valor: 1, data: "2026-10-11", tipo: "regular", descricao: "x" }] }),
    historicoTexto: Object.assign({}, base, { contas: [{ id: "c1", nome: "Itaú", tipo: "corrente", historico: [{ data: "2026-10-11", saldo: "abc" }] }] }),
    historicoNaoLista: Object.assign({}, base, { contas: [{ id: "c1", nome: "Itaú", tipo: "corrente", historico: { a: 1 } }] }),
    dataInvalida: Object.assign({}, base, { lancamentos: [{ id: "l1", valor: 1, data: 20261011, tipo: "regular", descricao: "x" }] }),
  };
  for (const [nome, documento] of Object.entries(casos)) {
    const t = carregar({ documento: JSON.parse(JSON.stringify(documento)) });
    await assert.rejects(t.req(t.A.createPerfil, { perfil: { nome: "X" } }), (e) => e.code === "DOCUMENT_INVALID_LOCKED", nome);
    assert.equal(t.salvos.length, 0, nome);
    assert.deepEqual(t.documento(), documento, nome);                       // original intacto
  }
  // migração conhecida: saldo em texto numérico vira número, sem bloquear
  const ok = carregar({ documento: Object.assign({}, base, { contas: [{ id: "c1", nome: "Itaú", tipo: "corrente", historico: [{ data: "2026-10-11", saldo: "125.00" }] }] }) });
  await ok.req(ok.A.createPerfil, { perfil: { nome: "X" } });
  assert.equal(ok.salvos[0].contas[0].historico[0].saldo, 125);
});

test("compra no cartão aumenta a fatura; estorno e pagamento diminuem", async () => {
  const t = carregar();
  const { conta: cartao } = await t.req(t.A.createConta, { conta: { nome: "Nubank", tipo: "cartao", saldo: 0 } });
  const { lancamento } = await t.req(t.A.createLancamento, { lancamento: { data: hoje(), descricao: "Mercado", valor: 250, tipo: "regular", contaId: cartao.id } });
  assert.equal(await saldo(t, cartao.id), 250);
  await t.req(t.A.createLancamento, { lancamento: { data: hoje(), descricao: "Devolução", valor: 50, tipo: "estorno", contaId: cartao.id } });
  assert.equal(await saldo(t, cartao.id), 200);
  await t.req(t.A.createLancamento, { lancamento: { data: hoje(), descricao: "Pagamento", valor: 200, tipo: "interno", sentido: "entrada", contaId: cartao.id } });
  assert.equal(await saldo(t, cartao.id), 0);
  await t.req(t.A.updateLancamento, { id: lancamento.id, lancamento: { data: hoje(), descricao: "Mercado", valor: 300, tipo: "regular", contaId: cartao.id } });
  assert.equal(await saldo(t, cartao.id), 50);                                    // editou: só a diferença
  await t.req(t.A.deleteLancamento, { id: lancamento.id });
  assert.equal(await saldo(t, cartao.id), -250);                                  // excluiu: devolve
});

test("receita e transferências mudam o saldo da conta; regular não", async () => {
  const t = carregar();
  const { conta } = await t.req(t.A.createConta, { conta: { nome: "Itaú", tipo: "corrente", saldo: 1000 } });
  await t.req(t.A.createLancamento, { lancamento: { data: hoje(), descricao: "Salário", valor: 3000, tipo: "receita", contaId: conta.id } });
  assert.equal(await saldo(t, conta.id), 4000);
  await t.req(t.A.createLancamento, { lancamento: { data: hoje(), descricao: "Para a poupança", valor: 500, tipo: "interno", sentido: "saida", contaId: conta.id } });
  assert.equal(await saldo(t, conta.id), 3500);
  await t.req(t.A.createLancamento, { lancamento: { data: hoje(), descricao: "Mercado", valor: 80, tipo: "regular", contaId: conta.id } });
  assert.equal(await saldo(t, conta.id), 3500);
  const futuro = new Date(); futuro.setDate(futuro.getDate() + 5);
  await t.req(t.A.createLancamento, { lancamento: { data: futuro.toISOString().slice(0, 10), descricao: "Bônus", valor: 100, tipo: "receita", contaId: conta.id } });
  assert.equal(await saldo(t, conta.id), 3500);                                   // data futura: só no dia
});

test("dados antigos: as transações que já existiam não mudam o saldo informado", async () => {
  const documento = { versao: 1, perfis: [], categorias: [], grupos: {}, config: {}, meta: {},
    contas: [{ id: "c1", nome: "Itaú", tipo: "corrente", cor: "#000", historico: [{ data: "2026-01-01", saldo: 1000 }] },
      { id: "c2", nome: "Nubank", tipo: "cartao", cor: "#000", historico: [{ data: "2026-01-01", saldo: 700 }] }],
    lancamentos: [
      { id: "l1", data: "2026-02-01", descricao: "Salário", valor: 3000, tipo: "receita", contaId: "c1" },
      { id: "l2", data: "2026-02-02", descricao: "Compra", valor: 400, tipo: "regular", contaId: "c2" },
      { id: "l3", data: "2026-02-03", descricao: "Padaria", valor: 10, tipo: "debito", contaId: "c1", debitado: { contaId: "c1", valor: 10 } }] };
  const t = carregar({ documento });
  assert.equal(await saldo(t, "c1"), 1000);
  assert.equal(await saldo(t, "c2"), 700);
  await t.req(t.A.createLancamento, { lancamento: { data: hoje(), descricao: "Nova compra", valor: 100, tipo: "regular", contaId: "c2" } });
  assert.equal(await saldo(t, "c2"), 800);                                        // a partir daqui, acompanha
  assert.equal(await saldo(t, "c1"), 1000);
  const salvo = t.documento();
  assert.equal(salvo.meta.saldoPorTransacao, 1);
  assert.equal(salvo.lancamentos.some((l) => l.debitado), false);                 // formato antigo convertido
});

test("leitura logo depois de uma alteração já a enxerga (sem esperar a gravação no servidor)", async () => {
  const t = carregar();
  await t.req(t.A.getConfig);
  const gravacao = t.req(t.A.createConta, { conta: { nome: "Itaú", tipo: "corrente", saldo: 10 } });
  const lidas = await t.req(t.A.getContas);                                       // não esperou a gravação
  assert.equal(lidas.contas.some((c) => c.nome === "Itaú"), true);
  await gravacao;
});

test("4 últimos dígitos: só 4 algarismos ou vazio", async () => {
  const t = carregar();
  const { conta } = await t.req(t.A.createConta, { conta: { nome: "Nubank", tipo: "cartao", saldo: 0, ultimos4Digitos: "1111" } });
  await t.req(t.A.updateConta, { id: conta.id, ultimos4Digitos: "9876" });
  assert.equal((await t.req(t.A.getContas)).contas[0].ultimos4Digitos, "9876");
  for (const ruim of ["12", "abcd", "12345", "12 4"]) {
    await assert.rejects(t.req(t.A.updateConta, { id: conta.id, ultimos4Digitos: ruim }), (e) => e.code === "DIGITS_INVALID", ruim);
  }
  await t.req(t.A.updateConta, { id: conta.id, ultimos4Digitos: "" });
  assert.equal((await t.req(t.A.getContas)).contas[0].ultimos4Digitos, "");
});

test("empréstimo: guarda o contrato e o saldo é o valor devido; parcelas e valores fora da regra são recusados", async () => {
  const t = carregar();
  const emprestimo = { valorContratado: 10000, primeiroVencimento: "2026-11-10", parcelas: 24, valorParcela: 520.5 };
  const { conta } = await t.req(t.A.createConta, { conta: { nome: "Financiamento", tipo: "emprestimo", saldo: 12492, emprestimo } });
  assert.deepEqual(conta.emprestimo, emprestimo);
  assert.equal(await saldo(t, conta.id), 12492);
  const ruim = (e) => t.req(t.A.createConta, { conta: { nome: "X", tipo: "emprestimo", saldo: 0, emprestimo: Object.assign({}, emprestimo, e) } });
  for (const e of [{ parcelas: 0 }, { parcelas: -3 }, { parcelas: "1.5" }, { parcelas: 601 }, { valorParcela: -1 }, { valorContratado: "10abc" }, { primeiroVencimento: "2026-02-31" }, { primeiroVencimento: "amanhã" }]) {
    await assert.rejects(ruim(e), (x) => x.code === "LOAN_INVALID", JSON.stringify(e));
  }
  // outros tipos de conta não guardam dados de empréstimo
  const { conta: corrente } = await t.req(t.A.createConta, { conta: { nome: "Itaú", tipo: "corrente", saldo: 0, emprestimo } });
  assert.equal(corrente.emprestimo, null);
});

test("empréstimo: editar a conta sem os dados do contrato não apaga o contrato", async () => {
  const t = carregar();
  const emprestimo = { valorContratado: 5000, primeiroVencimento: null, parcelas: 10, valorParcela: 550 };
  const { conta } = await t.req(t.A.createConta, { conta: { nome: "Carro", tipo: "emprestimo", saldo: 5500, emprestimo } });
  await t.req(t.A.updateConta, { id: conta.id, conta: { nome: "Carro novo", tipo: "emprestimo", saldo: 5000 } });
  const depois = (await t.req(t.A.getContas)).contas.find((c) => c.id === conta.id);
  assert.equal(depois.nome, "Carro novo");
  assert.deepEqual(depois.emprestimo, emprestimo);
  await t.req(t.A.updateConta, { id: conta.id, conta: { nome: "Carro novo", tipo: "corrente", saldo: 0 } });
  assert.equal((await t.req(t.A.getContas)).contas.find((c) => c.id === conta.id).emprestimo, null);
});
