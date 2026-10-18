// Testes do serviço de dados (js/data/servico.js) — ações que ainda não tinham teste: entrada inválida,
// fatura, perfis, exclusões, recorrências, lote, gravação que falha e documento que não pode ser regravado.
// Escritos ANTES da conversão do serviço para TypeScript: o comportamento precisa continuar igual.
//   node --test ui/tests
import test from "node:test";
import assert from "node:assert/strict";
import { carregar } from "./carregar.mjs";

const pad = (n) => String(n).padStart(2, "0");
const isoDe = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
const hoje = () => isoDe(new Date());
const mesAtual = () => hoje().slice(0, 7);
/** Dia 1 do mês anterior (a série mensal tem ocorrência no mês atual) */
const inicioMesAnterior = () => { const d = new Date(); return isoDe(new Date(d.getFullYear(), d.getMonth() - 1, 1)); };
const codigo = (c) => (e) => { assert.equal(e.code, c); return true; };
const lanc = (extra) => ({ lancamento: Object.assign({ data: "2025-03-10", descricao: "Compra", valor: 10 }, extra) });

test("ações desconhecidas e nomes herdados de Object são recusados sem gravar nada", async () => {
  const t = carregar();
  await t.req(t.A.getContas);                                                    // a 1ª leitura pode gravar a migração
  const gravados = t.salvos.length;
  for (const acao of ["naoExiste", "constructor", "toString", "valueOf", "hasOwnProperty", "__proto__", "__defineGetter__", ""]) {
    await assert.rejects(t.req(acao, {}), codigo("OPERATION_FAILED"), acao);
  }
  assert.equal(t.salvos.length, gravados);
  assert.equal(t.Z.servico.atende("constructor"), false);
  assert.equal(t.Z.servico.atende(t.A.getContas), true);
});

test("transação: valor zero, negativo, acima do limite ou texto numérico incompleto e data inexistente são recusados", async () => {
  const t = carregar();
  await t.req(t.A.getContas);
  const gravados = t.salvos.length;
  const ruins = [{ valor: 0 }, { valor: -5 }, { valor: 0.001 }, { valor: 1e13 }, { valor: "10abc" }, { valor: "1,50" }, { valor: NaN }, { valor: Infinity },
    { data: "2025-02-30" }, { data: "2025-13-01" }, { data: "10/03/2025" }, { data: "" }, { descricao: "" }, { descricao: "   " }];
  for (const r of ruins) await assert.rejects(t.req(t.A.createLancamento, lanc(r)), codigo("OPERATION_FAILED"), JSON.stringify(r));
  assert.equal(t.salvos.length, gravados);
  // texto numérico completo é aceito; o valor fica em centavos
  const { lancamento } = await t.req(t.A.createLancamento, lanc({ valor: "12.345" }));
  assert.equal(lancamento.valor, 12.35);
});

test("transação: conta, categoria e perfil inexistentes viram vazio; nome sem caracteres de controle e no limite", async () => {
  const t = carregar();
  const nomeLongo = "A".repeat(80);
  const { lancamento } = await t.req(t.A.createLancamento, lanc({ descricao: "\u0000Pão\u0007 " + nomeLongo, contaId: "c-de-outra-conta", categoriaId: "k-x", perfilId: "p-x", tipo: "inventado" }));
  assert.equal(lancamento.contaId, null);
  assert.equal(lancamento.categoriaId, null);
  assert.equal(lancamento.perfilId, null);
  assert.equal(lancamento.tipo, "regular");                                      // tipo desconhecido vira o padrão
  assert.ok(lancamento.descricao.startsWith("Pão "));
  assert.equal(lancamento.descricao.length, 50);                                 // regras.limiteNome
  assert.ok(!/[\u0000-\u001f]/.test(lancamento.descricao));
});

test("IDs gerados são imprevisíveis, com o prefixo do tipo e sem repetição", async () => {
  const t = carregar();
  const ids = new Set();
  for (let i = 0; i < 20; i++) {
    const { lancamento } = await t.req(t.A.createLancamento, lanc({ descricao: "L" + i }));
    assert.match(lancamento.id, /^l[0-9a-f]{20}$/);
    ids.add(lancamento.id);
  }
  assert.equal(ids.size, 20);
  const { conta } = await t.req(t.A.createConta, { conta: { nome: "C", tipo: "corrente", saldo: 0 } });
  assert.match(conta.id, /^c[0-9a-f]{20}$/);
});

test("fatura: só cartão de crédito e empréstimo do perfil, no mês pedido, em ordem de data", async () => {
  const t = carregar();
  const { perfil: ana } = await t.req(t.A.createPerfil, { perfil: { nome: "Ana" } });
  const { perfil: bia } = await t.req(t.A.createPerfil, { perfil: { nome: "Bia" } });
  const conta = async (nome, tipo) => (await t.req(t.A.createConta, { conta: { nome, tipo, saldo: 0 } })).conta.id;
  const cartao = await conta("Visa", "cartao"), emprestimo = await conta("Crédito", "emprestimo"), corrente = await conta("Itaú", "corrente");
  await t.req(t.A.createLancamento, lanc({ data: "2025-03-20", descricao: "Cartão", contaId: cartao, perfilId: ana.id }));
  await t.req(t.A.createLancamento, lanc({ data: "2025-03-02", descricao: "Empréstimo", contaId: emprestimo, perfilId: ana.id, tipo: "interno", sentido: "saida" }));
  await t.req(t.A.createLancamento, lanc({ data: "2025-03-05", descricao: "Na conta corrente", contaId: corrente, perfilId: ana.id }));
  await t.req(t.A.createLancamento, lanc({ data: "2025-03-06", descricao: "De outro perfil", contaId: cartao, perfilId: bia.id }));
  await t.req(t.A.createLancamento, lanc({ data: "2025-04-01", descricao: "Outro mês", contaId: cartao, perfilId: ana.id }));
  await t.req(t.A.createLancamento, lanc({ data: "2025-03-07", descricao: "Sem perfil", contaId: cartao }));
  const f = await t.req(t.A.getBoletoData, { perfilId: ana.id, mes: 3, ano: 2025 });
  assert.deepEqual(f.lancamentos.map((l) => l.descricao), ["Empréstimo", "Cartão"]);
  assert.equal(f.perfil.nome, "Ana");
  assert.equal(f.lancamentos[1].ultimos4Digitos, "");
  // período fora da regra
  for (const p of [{ mes: 0, ano: 2025 }, { mes: 13, ano: 2025 }, { mes: 3, ano: 1999 }, { mes: "3x", ano: 2025 }]) {
    await assert.rejects(t.req(t.A.getBoletoData, Object.assign({ perfilId: ana.id }, p)), codigo("OPERATION_FAILED"), JSON.stringify(p));
  }
  // perfil inexistente: fatura vazia (nada de outro perfil vaza)
  const vazia = await t.req(t.A.getBoletoData, { perfilId: "p-inexistente", mes: 3, ano: 2025 });
  assert.equal(vazia.perfil, null);
  assert.deepEqual(vazia.lancamentos, []);
});

test("fatura e Pix só com os recursos liberados", async () => {
  const sem = carregar({ recursos: { perfis: true, boleto: false, pix: false, cambio: false } });
  await assert.rejects(sem.req(sem.A.getBoletoData, { perfilId: "p", mes: 3, ano: 2025 }), codigo("FEATURE_UNAVAILABLE"));
  await assert.rejects(sem.req(sem.A.updateConfig, { pix: { chave: "ana@exemplo.test", nome: "Ana", cidade: "Recife" } }), codigo("FEATURE_UNAVAILABLE"));
  const semPerfis = carregar({ recursos: { perfis: false, boleto: true, pix: true, cambio: false } });
  await assert.rejects(semPerfis.req(semPerfis.A.getBoletoData, { perfilId: "p", mes: 3, ano: 2025 }), codigo("FEATURE_UNAVAILABLE"));
  // Pix gravado, mas o recurso foi retirado: a fatura e a configuração não o mostram
  const t = carregar();
  await t.req(t.A.updateConfig, { pix: { chave: "ana@exemplo.test", nome: "Ana", cidade: "Recife" } });
  const doc = t.documento();
  const depois = carregar({ recursos: { perfis: true, boleto: true, pix: false, cambio: false }, documento: doc });
  assert.equal((await depois.req(depois.A.getConfig)).pix, null);
  assert.equal((await depois.req(depois.A.getBoletoData, { perfilId: "p", mes: 3, ano: 2025 })).pix, null);
});

test("perfis: nome repetido é recusado (sem diferenciar maiúsculas); excluir tira o perfil das transações", async () => {
  const t = carregar();
  const { perfil: ana } = await t.req(t.A.createPerfil, { perfil: { nome: "Ana" } });
  const { perfil: bia } = await t.req(t.A.createPerfil, { perfil: { nome: "Bia" } });
  await assert.rejects(t.req(t.A.createPerfil, { perfil: { nome: "ana" } }), codigo("NAME_IN_USE"));
  await assert.rejects(t.req(t.A.updatePerfil, { id: bia.id, nome: "ANA" }), codigo("NAME_IN_USE"));
  await assert.rejects(t.req(t.A.updatePerfil, { id: bia.id, nome: "  " }), codigo("OPERATION_FAILED"));
  const { lancamento } = await t.req(t.A.createLancamento, lanc({ perfilId: ana.id }));
  await t.req(t.A.deletePerfil, { id: ana.id });
  const l = (await t.req(t.A.getLancamentos)).lancamentos.find((x) => x.id === lancamento.id);
  assert.equal(l.perfilId, null);
  await assert.rejects(t.req(t.A.deletePerfil, { id: ana.id }), codigo("OPERATION_FAILED"));
});

test("perfil arquivado: fica nas transações antigas, mas não entra em novas", async () => {
  const t = carregar();
  const { perfil } = await t.req(t.A.createPerfil, { perfil: { nome: "Ana" } });
  const { lancamento } = await t.req(t.A.createLancamento, lanc({ perfilId: perfil.id }));
  await t.req(t.A.arquivarPerfil, { id: perfil.id, arquivar: true });
  await assert.rejects(t.req(t.A.createLancamento, lanc({ perfilId: perfil.id })), codigo("PROFILE_ARCHIVED"));
  await assert.rejects(t.req(t.A.updateLancamentosEmLote, { ids: [lancamento.id], perfilId: perfil.id }), codigo("PROFILE_ARCHIVED"));
  // a transação que já era do perfil pode ser editada sem perder o perfil
  const { lancamento: editado } = await t.req(t.A.updateLancamento, { id: lancamento.id, lancamento: { data: "2025-03-10", descricao: "Compra editada", valor: 12, perfilId: perfil.id } });
  assert.equal(editado.perfilId, perfil.id);
});

test("sem o recurso Perfis: não cria perfil e a edição mantém o perfil já gravado", async () => {
  const t = carregar();
  const { perfil } = await t.req(t.A.createPerfil, { perfil: { nome: "Ana" } });
  const { lancamento } = await t.req(t.A.createLancamento, lanc({ perfilId: perfil.id }));
  const s = carregar({ recursos: { perfis: false, boleto: false, pix: false, cambio: false }, documento: t.documento() });
  await assert.rejects(s.req(s.A.createPerfil, { perfil: { nome: "Bia" } }), codigo("FEATURE_UNAVAILABLE"));
  await assert.rejects(s.req(s.A.dividirLancamento, { id: lancamento.id, partes: [] }), codigo("FEATURE_UNAVAILABLE"));
  assert.deepEqual((await s.req(s.A.getPerfis)).perfis, []);
  const { lancamento: editado } = await s.req(s.A.updateLancamento, { id: lancamento.id, lancamento: { data: "2025-03-10", descricao: "Outra", valor: 10, perfilId: null } });
  assert.equal(editado.perfil, null);                                            // não aparece na tela…
  assert.equal(s.documento().lancamentos.find((l) => l.id === lancamento.id).perfilId, perfil.id);   // …mas continua gravado
});

test("excluir conta deixa as transações sem conta; excluir categoria em uso leva as transações para Outros", async () => {
  const t = carregar();
  const { conta } = await t.req(t.A.createConta, { conta: { nome: "Itaú", tipo: "corrente", saldo: 100 } });
  const { categoria } = await t.req(t.A.createCategoria, { categoria: { nome: "Mercado" } });
  const { lancamento } = await t.req(t.A.createLancamento, lanc({ contaId: conta.id, categoriaId: categoria.id }));
  await t.req(t.A.deleteConta, { id: conta.id });
  await t.req(t.A.deleteCategoria, { id: categoria.id });
  const l = (await t.req(t.A.getLancamentos)).lancamentos.find((x) => x.id === lancamento.id);
  assert.ok(l, "a transação continua existindo");
  assert.equal(l.contaId, null);
  assert.equal(l.categoria.nome, "Outros");
  const outros = (await t.req(t.A.getCategorias)).categorias.filter((c) => c.nome === "Outros");
  assert.equal(outros.length, 1);
  // sem transações: a categoria simplesmente sai (Outros não é criada de novo)
  const { categoria: vazia } = await t.req(t.A.createCategoria, { categoria: { nome: "Lazer" } });
  await t.req(t.A.deleteCategoria, { id: vazia.id });
  assert.equal((await t.req(t.A.getCategorias)).categorias.filter((c) => c.nome === "Outros").length, 1);
  await assert.rejects(t.req(t.A.deleteConta, { id: conta.id }), codigo("OPERATION_FAILED"));
});

test("categorias sugeridas não duplicam nomes que já existem", async () => {
  const t = carregar();
  const sugeridas = t.Z.regras.categoriasSugeridas || [];
  assert.ok(sugeridas.length > 0);
  await t.req(t.A.createCategoria, { categoria: { nome: sugeridas[0].nome.toUpperCase() } });
  await t.req(t.A.createCategoriasSugeridas, {});
  await t.req(t.A.createCategoriasSugeridas, {});
  const nomes = (await t.req(t.A.getCategorias)).categorias.map((c) => c.nome.toLowerCase());
  assert.equal(nomes.length, new Set(nomes).size);
  assert.equal(nomes.length, sugeridas.length);
});

test("recorrência mensal: pagar a ocorrência do mês duas vezes não duplica; encerrar e reabrir; excluir a série", async () => {
  const t = carregar();
  const { lancamento: origem } = await t.req(t.A.createLancamento, lanc({ data: inicioMesAnterior(), descricao: "Aluguel", valor: 1500 }));
  await t.req(t.A.tornarRecorrente, { id: origem.id, recorrencia: "mensal" });
  const doMes = async () => (await t.req(t.A.getRecorrencias, { mes: mesAtual() })).recorrencias.filter((o) => o.serieId === origem.id);
  assert.equal((await doMes()).length, 1);
  const p1 = await t.req(t.A.pagarRecorrencia, { serieId: origem.id, mes: mesAtual() });
  const p2 = await t.req(t.A.pagarRecorrencia, { serieId: origem.id, mes: mesAtual() });
  assert.equal(p1.lancamentoId, p2.lancamentoId);                                // repetir não cria outro pagamento
  const pagamentos = (await t.req(t.A.getLancamentos)).lancamentos.filter((l) => l.serieId === origem.id && l.id !== origem.id);
  assert.equal(pagamentos.length, 1);
  assert.equal(pagamentos[0].valor, 1500);
  await assert.rejects(t.req(t.A.pagarRecorrencia, { serieId: origem.id, mes: "março" }), codigo("OPERATION_FAILED"));
  await assert.rejects(t.req(t.A.pagarRecorrencia, { serieId: pagamentos[0].id, mes: mesAtual() }), codigo("OPERATION_FAILED"));   // não é a origem

  await t.req(t.A.encerrarRecorrencia, { serieId: origem.id });
  assert.equal((await doMes()).length, 0);
  await t.req(t.A.encerrarRecorrencia, { serieId: origem.id, reabrir: true });
  assert.equal((await doMes()).length, 1);

  await t.req(t.A.excluirRecorrencia, { serieId: origem.id });
  const todas = (await t.req(t.A.getLancamentos)).lancamentos;
  assert.ok(todas.every((l) => l.tipo === "regular" && !l.serieId && !l.recorrencia));
  assert.equal(todas.length, 2);                                                 // os pagamentos já feitos ficam
});

test("vincular uma transação a uma série e desvincular; parte de divisão não entra em recorrência", async () => {
  const t = carregar();
  const { lancamento: origem } = await t.req(t.A.createLancamento, lanc({ data: inicioMesAnterior(), descricao: "Academia", valor: 90 }));
  await t.req(t.A.tornarRecorrente, { id: origem.id, recorrencia: "mensal" });
  const { lancamento: avulso } = await t.req(t.A.createLancamento, lanc({ data: hoje(), descricao: "Academia (pago)", valor: 90 }));
  await t.req(t.A.vincularRecorrencia, { id: avulso.id, serieId: origem.id });
  let l = (await t.req(t.A.getLancamentos)).lancamentos.find((x) => x.id === avulso.id);
  assert.equal(l.serieId, origem.id);
  assert.equal(l.tipo, "recorrente");
  await assert.rejects(t.req(t.A.vincularRecorrencia, { id: origem.id, serieId: origem.id }), codigo("OPERATION_FAILED"));
  await t.req(t.A.desvincularRecorrencia, { id: avulso.id });
  l = (await t.req(t.A.getLancamentos)).lancamentos.find((x) => x.id === avulso.id);
  assert.equal(l.serieId, null);
  assert.equal(l.tipo, "regular");

  const { perfil: a } = await t.req(t.A.createPerfil, { perfil: { nome: "A" } });
  const { perfil: b } = await t.req(t.A.createPerfil, { perfil: { nome: "B" } });
  const { categoria } = await t.req(t.A.createCategoria, { categoria: { nome: "Saúde" } });
  const { lancamento: conta } = await t.req(t.A.createLancamento, lanc({ data: hoje(), descricao: "Farmácia", valor: 30 }));
  await t.req(t.A.dividirLancamento, { id: conta.id, partes: [
    { data: hoje(), valor: 10, perfilId: a.id, categoriaId: categoria.id }, { data: hoje(), valor: 20, perfilId: b.id, categoriaId: categoria.id }] });
  await assert.rejects(t.req(t.A.vincularRecorrencia, { id: conta.id, serieId: origem.id }), codigo("SPLIT_INVALID"));
});

test("dividir: soma diferente, perfil repetido ou inexistente, data diferente, sem categoria e partes demais são recusados", async () => {
  const t = carregar();
  const { perfil: a } = await t.req(t.A.createPerfil, { perfil: { nome: "A" } });
  const { perfil: b } = await t.req(t.A.createPerfil, { perfil: { nome: "B" } });
  const { categoria } = await t.req(t.A.createCategoria, { categoria: { nome: "Mercado" } });
  const { lancamento } = await t.req(t.A.createLancamento, lanc({ valor: 100 }));
  const parte = (extra) => Object.assign({ data: "2025-03-10", valor: 50, perfilId: a.id, categoriaId: categoria.id }, extra);
  const casos = [
    [parte(), parte({ perfilId: b.id, valor: 49.99 })],                          // soma 99,99
    [parte(), parte()],                                                           // perfil repetido
    [parte(), parte({ perfilId: "p-de-outra-conta" })],
    [parte(), parte({ perfilId: b.id, data: "2025-03-11" })],
    [parte(), parte({ perfilId: b.id, categoriaId: null })],
    [parte({ valor: 100 }), parte({ perfilId: b.id, valor: 0 })],                 // parte zerada
    [parte({ valor: 150 }), parte({ perfilId: b.id, valor: -50 })],               // parte negativa
    [],
    Array.from({ length: 31 }, () => parte({ valor: 100 / 31 })),
  ];
  for (const partes of casos) await assert.rejects(t.req(t.A.dividirLancamento, { id: lancamento.id, partes }), codigo("SPLIT_INVALID"));
  await assert.rejects(t.req(t.A.dividirLancamento, { id: "l-inexistente", partes: [parte()] }), codigo("SPLIT_INVALID"));
  // nada mudou: a transação continua inteira
  const l = (await t.req(t.A.getLancamentos)).lancamentos;
  assert.equal(l.length, 1);
  assert.equal(l[0].valor, 100);
  assert.ok(!l[0].divisao);
});

test("excluir em lote devolve o efeito no saldo e refaz o total da divisão que sobrou", async () => {
  const t = carregar();
  const { conta } = await t.req(t.A.createConta, { conta: { nome: "Itaú", tipo: "corrente", saldo: 1000 } });
  const { lancamento: d1 } = await t.req(t.A.createLancamento, lanc({ data: hoje(), descricao: "Débito", valor: 100, tipo: "debito", contaId: conta.id }));
  const perfis = [];
  for (const n of ["A", "B", "C"]) perfis.push((await t.req(t.A.createPerfil, { perfil: { nome: n } })).perfil.id);
  const { categoria } = await t.req(t.A.createCategoria, { categoria: { nome: "Mercado" } });
  const { lancamento: base } = await t.req(t.A.createLancamento, lanc({ data: hoje(), valor: 90 }));
  await t.req(t.A.dividirLancamento, { id: base.id, partes: perfis.map((p) => ({ data: hoje(), valor: 30, perfilId: p, categoriaId: categoria.id })) });
  const partes = (await t.req(t.A.getLancamentos)).lancamentos.filter((l) => l.divisao);
  assert.equal(partes.length, 3);
  const r = await t.req(t.A.deleteLancamentos, { ids: [d1.id, partes[0].id, "l-inexistente"] });
  assert.equal(r.excluidos, 2);
  assert.equal((await t.req(t.A.getContas)).contas.find((c) => c.id === conta.id).valor, 1000);
  const restantes = (await t.req(t.A.getLancamentos)).lancamentos.filter((l) => l.divisao);
  assert.equal(restantes.length, 2);
  assert.ok(restantes.every((l) => l.divisao.total === 60 && l.divisao.partes === 2));
  // com só uma parte, deixa de ser divisão
  await t.req(t.A.deleteLancamentos, { ids: [restantes[0].id] });
  assert.ok((await t.req(t.A.getLancamentos)).lancamentos.every((l) => !l.divisao));
});

test("leituras de algo que não existe falham sem expor nada", async () => {
  const t = carregar();
  await assert.rejects(t.req(t.A.getContaHistorico, { id: "c-x" }), codigo("LOAD_FAILED"));
  await assert.rejects(t.req(t.A.getSerieRecorrencia, { serieId: "l-x" }), codigo("LOAD_FAILED"));
  await assert.rejects(t.req(t.A.updateLancamento, { id: "l-x", lancamento: lanc().lancamento }), codigo("OPERATION_FAILED"));
  await assert.rejects(t.req(t.A.deleteLancamento, { id: "l-x" }), codigo("OPERATION_FAILED"));
  await assert.rejects(t.req(t.A.updateLancamentosEmLote, { ids: [] }), codigo("OPERATION_FAILED"));
  await assert.rejects(t.req(t.A.updateLancamentosEmLote, { ids: ["l-x"], tipo: "inventado" }), codigo("OPERATION_FAILED"));
});

test("configuração: foto só JPEG em data URL e pequena; moeda só com o multicâmbio ligado e da lista", async () => {
  const t = carregar();
  for (const foto of ["data:image/png;base64,AAAA", "javascript:alert(1)", "data:image/jpeg;base64,<svg>", "data:image/jpeg;base64," + "A".repeat(300000)]) {
    await assert.rejects(t.req(t.A.updateConfig, { foto }), codigo("OPERATION_FAILED"), foto.slice(0, 30));
  }
  await t.req(t.A.updateConfig, { foto: "data:image/jpeg;base64,/9j/AAAA" });
  assert.equal((await t.req(t.A.getConfig)).foto, "data:image/jpeg;base64,/9j/AAAA");
  await t.req(t.A.updateConfig, { foto: null });
  assert.equal((await t.req(t.A.getConfig)).foto, null);
  await assert.rejects(t.req(t.A.updateConfig, { moeda: "EUR" }), codigo("OPERATION_FAILED"));          // multicâmbio desligado
  await t.req(t.A.updateConfig, { multicambio: true });
  await assert.rejects(t.req(t.A.updateConfig, { moeda: "BTC" }), codigo("OPERATION_FAILED"));
  const r = await t.req(t.A.updateConfig, { moeda: "EUR", campoQualquer: "x" });
  assert.equal(r.moeda, "EUR");
  assert.equal(r.primeiraVez, true);
  assert.equal("campoQualquer" in t.documento().config, false);                  // campo desconhecido não é gravado
});

test("demonstração: além do que foi gerado, só um de cada; categorias sugeridas recusadas", async () => {
  const t = carregar({ demo: true });
  await t.req(t.A.createCategoria, { categoria: { nome: "Uma" } });
  await assert.rejects(t.req(t.A.createCategoria, { categoria: { nome: "Duas" } }), codigo("DEMO_LIMIT"));
  await assert.rejects(t.req(t.A.createCategoriasSugeridas, {}), codigo("DEMO_LIMIT"));
  await t.req(t.A.createConta, { conta: { nome: "Conta", tipo: "corrente", saldo: 0 } });
  await t.req(t.A.createConta, { conta: { nome: "Cartão", tipo: "cartao", saldo: 0 } });        // cartão conta separado
  await assert.rejects(t.req(t.A.createConta, { conta: { nome: "Outra", tipo: "poupanca", saldo: 0 } }), codigo("DEMO_LIMIT"));
});

test("gravação recusada por outro dispositivo (conflito): alteração desfeita, aviso e a próxima leitura relê do servidor", async () => {
  const t = carregar();
  await t.req(t.A.createConta, { conta: { nome: "Primeira", tipo: "corrente", saldo: 0 } });
  const original = t.Z.bridge.requestHost;
  t.Z.bridge.requestHost = async (acao, dados) => {
    if (acao === "saveUserData") throw Object.assign(new Error("conflito"), { code: "DATA_CHANGED" });
    return original(acao, dados);
  };
  await assert.rejects(t.req(t.A.createConta, { conta: { nome: "Segunda", tipo: "corrente", saldo: 0 } }), codigo("DATA_CHANGED"));
  assert.ok(t.eventos.some((e) => e.type === "zozo:dados-alterados"));
  t.Z.bridge.requestHost = original;
  assert.deepEqual((await t.req(t.A.getContas)).contas.map((c) => c.nome), ["Primeira"]);
});

test("gravação que falha desfaz a alteração na memória; sem resposta (TIMEOUT) não desfaz às cegas", async () => {
  const t = carregar();
  await t.req(t.A.createConta, { conta: { nome: "Primeira", tipo: "corrente", saldo: 0 } });
  const original = t.Z.bridge.requestHost;
  let falha = "STORAGE_UNAVAILABLE";
  t.Z.bridge.requestHost = async (acao, dados) => {
    if (acao === "saveUserData") throw Object.assign(new Error(falha), { code: falha });
    return original(acao, dados);
  };
  await assert.rejects(t.req(t.A.createConta, { conta: { nome: "Segunda", tipo: "corrente", saldo: 0 } }), codigo("STORAGE_UNAVAILABLE"));
  assert.ok(t.eventos.some((e) => e.type === "zozo:dados-revertidos"));
  assert.deepEqual((await t.req(t.A.getContas)).contas.map((c) => c.nome), ["Primeira"]);
  falha = "TIMEOUT";
  await assert.rejects(t.req(t.A.createConta, { conta: { nome: "Terceira", tipo: "corrente", saldo: 0 } }), codigo("SAVE_UNCONFIRMED"));
  assert.ok(t.eventos.some((e) => e.type === "zozo:dados-alterados" && e.detail && e.detail.codigo === "SAVE_UNCONFIRMED"));
  t.Z.bridge.requestHost = original;
  assert.deepEqual((await t.req(t.A.getContas)).contas.map((c) => c.nome), ["Primeira"]);   // relido do "servidor"
});

test("documento gravado por uma versão mais nova do ZoZo não abre nem é regravado", async () => {
  const t = carregar({ documento: { versao: 999, perfis: [], contas: [], categorias: [], lancamentos: [] } });
  await assert.rejects(t.req(t.A.getContas), codigo("DOCUMENT_NEWER"));
  await assert.rejects(t.req(t.A.createConta, { conta: { nome: "X", tipo: "corrente", saldo: 0 } }), codigo("DOCUMENT_NEWER"));
  assert.equal(t.salvos.length, 0);
});

test("documento sumido do servidor (host abre só para leitura): nenhuma alteração é aceita", async () => {
  const t = carregar();
  t.Z.bridge.requestHost = async (acao) => {
    if (acao === "loadUserData") return { documento: null, aviso: "DOCUMENT_MISSING", somenteLeitura: true };
    throw new Error("não deveria gravar");
  };
  assert.deepEqual((await t.req(t.A.getContas)).contas, []);
  await assert.rejects(t.req(t.A.createConta, { conta: { nome: "X", tipo: "corrente", saldo: 0 } }), codigo("DOCUMENT_MISSING_LOCKED"));
  assert.ok(t.eventos.some((e) => e.type === "zozo:aviso-dados" && e.detail.codigo === "DOCUMENT_MISSING"));
});

/* ---------------- Pagar fatura do cartão ---------------- */
async function cenarioFatura(t, { fatura = 500, saldo = 1000, digitos = "0123" } = {}) {
  const { conta: cartao } = await t.req(t.A.createConta, { conta: { nome: "Ultravioleta", tipo: "cartao", saldo: fatura, ultimos4Digitos: digitos } });
  const { conta } = await t.req(t.A.createConta, { conta: { nome: "Itaú", tipo: "corrente", saldo } });
  const { perfil } = await t.req(t.A.createPerfil, { perfil: { nome: "Ana" } });
  return { cartao, conta, perfil };
}
const valorDe = async (t, id) => (await t.req(t.A.getContas)).contas.find((c) => c.id === id).valor;

test("pagar fatura: débito na conta + receita no cartão, com nome, data, perfil, categoria Fatura e observação", async () => {
  const t = carregar();
  const { cartao, conta, perfil } = await cenarioFatura(t);
  const r = await t.req(t.A.pagarFatura, { cartaoId: cartao.id, contaId: conta.id, valor: 500, perfilId: perfil.id });
  const nota = "Pagamento da fatura do cartão de crédito Ultravioleta com 4 últimos dígitos 0123.";
  assert.equal(r.debito.tipo, "debito");
  assert.equal(r.debito.contaId, conta.id);
  assert.equal(r.debito.categoria.nome, "Fatura");
  assert.equal(r.receita.tipo, "receita");
  assert.equal(r.receita.contaId, cartao.id);
  for (const l of [r.debito, r.receita]) {
    assert.equal(l.descricao, "Pagamento fatura");
    assert.equal(l.valor, 500);
    assert.equal(l.data, hoje());
    assert.equal(l.perfilId, perfil.id);
    assert.equal(l.notas, nota);
  }
  assert.equal(await valorDe(t, conta.id), 500);                                 // saiu da conta
  assert.equal(await valorDe(t, cartao.id), 0);                                  // fatura quitada
  assert.equal((await t.req(t.A.getLancamentos)).lancamentos.length, 2);
});

test("pagar fatura: parcial; a categoria Fatura existente é reaproveitada (não duplica)", async () => {
  const t = carregar();
  const { cartao, conta, perfil } = await cenarioFatura(t);
  const { categoria } = await t.req(t.A.createCategoria, { categoria: { nome: "Fatura", icone: "🧾" } });
  const r1 = await t.req(t.A.pagarFatura, { cartaoId: cartao.id, contaId: conta.id, valor: "120.50", perfilId: perfil.id });
  const r2 = await t.req(t.A.pagarFatura, { cartaoId: cartao.id, contaId: conta.id, valor: 79.5, perfilId: perfil.id });
  assert.equal(r1.debito.categoriaId, categoria.id);
  assert.equal(r2.debito.categoriaId, categoria.id);
  assert.equal(await valorDe(t, cartao.id), 300);
  assert.equal(await valorDe(t, conta.id), 800);
  assert.equal((await t.req(t.A.getCategorias)).categorias.filter((c) => c.nome === "Fatura").length, 1);
});

test("pagar fatura: valor inválido, acima da fatura ou do saldo, conta errada e sem perfil são recusados sem criar nada", async () => {
  const t = carregar();
  const { cartao, conta, perfil } = await cenarioFatura(t, { fatura: 500, saldo: 200 });
  const conta2 = async (tipo) => (await t.req(t.A.createConta, { conta: { nome: "C-" + tipo, tipo, saldo: 5000 } })).conta.id;
  const investimento = await conta2("investimento"), emprestimo = await conta2("emprestimo"), outroCartao = await conta2("cartao");
  const pedido = (extra) => Object.assign({ cartaoId: cartao.id, contaId: conta.id, valor: 100, perfilId: perfil.id }, extra);
  const casos = [
    [{ valor: 0 }, "PAYMENT_INVALID"], [{ valor: -10 }, "PAYMENT_INVALID"], [{ valor: "10abc" }, "PAYMENT_INVALID"], [{ valor: 0.001 }, "PAYMENT_INVALID"],
    [{ valor: 500.01, contaId: investimento }, "PAYMENT_ACCOUNT"],
    [{ valor: 200.01 }, "INSUFFICIENT_FUNDS"],
    [{ contaId: emprestimo }, "PAYMENT_ACCOUNT"], [{ contaId: outroCartao }, "PAYMENT_ACCOUNT"], [{ contaId: "c-inexistente" }, "PAYMENT_ACCOUNT"],
    [{ cartaoId: conta.id }, "OPERATION_FAILED"], [{ cartaoId: "c-inexistente" }, "OPERATION_FAILED"],
    [{ perfilId: null }, "PROFILE_REQUIRED"], [{ perfilId: "p-de-outra-conta" }, "PROFILE_REQUIRED"],
  ];
  for (const [extra, cod] of casos) await assert.rejects(t.req(t.A.pagarFatura, pedido(extra)), codigo(cod), JSON.stringify(extra));
  const { conta: rica } = await t.req(t.A.createConta, { conta: { nome: "Poupança", tipo: "poupanca", saldo: 9000 } });
  await assert.rejects(t.req(t.A.pagarFatura, pedido({ contaId: rica.id, valor: 500.01 })), codigo("PAYMENT_ABOVE_INVOICE"));
  await t.req(t.A.arquivarPerfil, { id: perfil.id, arquivar: true });
  const { perfil: outro } = await t.req(t.A.createPerfil, { perfil: { nome: "Bia" } });
  await assert.rejects(t.req(t.A.pagarFatura, pedido({})), codigo("PROFILE_ARCHIVED"));
  // nada foi criado nem mudou de saldo
  assert.equal((await t.req(t.A.getLancamentos)).lancamentos.length, 0);
  assert.equal(await valorDe(t, cartao.id), 500);
  assert.equal(await valorDe(t, conta.id), 200);
  assert.ok(!(await t.req(t.A.getCategorias)).categorias.some((c) => c.nome === "Fatura"));
  await t.req(t.A.pagarFatura, pedido({ perfilId: outro.id }));                   // com perfil válido, passa
});

test("pagar fatura: cartão sem fatura em aberto é recusado; sem o recurso Perfis, o perfil não é pedido", async () => {
  const t = carregar({ recursos: { perfis: false, boleto: false, pix: false, cambio: false } });
  const { conta: cartao } = await t.req(t.A.createConta, { conta: { nome: "Visa", tipo: "cartao", saldo: 0 } });
  const { conta } = await t.req(t.A.createConta, { conta: { nome: "Itaú", tipo: "corrente", saldo: 100 } });
  await assert.rejects(t.req(t.A.pagarFatura, { cartaoId: cartao.id, contaId: conta.id, valor: 10 }), codigo("NO_INVOICE"));
  const { conta: cartao2 } = await t.req(t.A.createConta, { conta: { nome: "Master", tipo: "cartao", saldo: 50 } });
  const r = await t.req(t.A.pagarFatura, { cartaoId: cartao2.id, contaId: conta.id, valor: 50 });
  assert.equal(r.debito.perfilId, null);
  assert.equal(r.debito.notas, "Pagamento da fatura do cartão de crédito Master.");    // sem dígitos cadastrados
});

test("frequência só da tabela: nomes herdados de Object viram mensal", async () => {
  const t = carregar();
  const { lancamento } = await t.req(t.A.createLancamento, lanc({}));
  for (const recorrencia of ["constructor", "toString", "__proto__"]) {
    await t.req(t.A.tornarRecorrente, { id: lancamento.id, recorrencia });
    assert.equal((await t.req(t.A.getLancamentos)).lancamentos[0].recorrencia, "mensal", recorrencia);
  }
});
