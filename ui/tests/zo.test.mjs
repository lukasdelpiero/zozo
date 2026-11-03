// Testes das ferramentas do Zo (js/data/zo.ts): rodam no navegador, pelo serviço de dados.
// O modelo só escolhe e preenche; aqui se confere que nada é gravado sem o confirmar() da pessoa, que faltas viram
// pergunta (não gravação), que o resumo vem dos dados reais e que os nomes batem com a lista do servidor (api/src/zo.py).
//   node --test ui/tests
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { carregar } from "./carregar.mjs";

const hoje = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
const args = (o) => JSON.stringify(o);

async function cenario({ perfis = true, tela } = {}) {
  const t = carregar({ recursos: { perfis, boleto: perfis, pix: perfis, cambio: false } });
  const { conta: cartao } = await t.req(t.A.createConta, { conta: { nome: "Nubank", tipo: "cartao", saldo: 0 } });
  const { conta: banco } = await t.req(t.A.createConta, { conta: { nome: "Itaú", tipo: "corrente", saldo: 1000 } });
  const { categoria: compras } = await t.req(t.A.createCategoria, { categoria: { nome: "Compras", icone: "🛍️", reservado: 500 } });
  const { categoria: mercado } = await t.req(t.A.createCategoria, { categoria: { nome: "Mercado", icone: "🛒" } });
  const perfil = perfis ? (await t.req(t.A.createPerfil, { perfil: { nome: "Ana" } })).perfil : null;
  const zo = t.Z.zoFerramentas.criar((acao, dados) => t.req(acao, dados), tela ? { perfis: () => perfis, tela } : { perfis: () => perfis });
  return { t, zo, cartao, banco, compras, mercado, perfil };
}

test("Zo: os nomes das ferramentas são os mesmos do servidor (api/src/zo.py)", async () => {
  const { zo } = await cenario();
  const fonte = readFileSync(new URL("../../api/src/zo.py", import.meta.url), "utf8");
  // só a lista FERRAMENTAS (o bloqueio por categoria, BARRAR, é só do servidor e o navegador nunca o executa)
  const lista = fonte.slice(fonte.indexOf("FERRAMENTAS: list"), fonte.indexOf("NOMES = frozenset"));
  const doServidor = [...lista.matchAll(/_f\("([a-z_]+)"/g)].map((m) => m[1]).sort();
  assert.ok(doServidor.length > 20);
  assert.deepEqual([...zo.nomes].sort(), doServidor);
  assert.ok(!zo.nomes.includes("barrar_mensagem"));
});

test("Zo: compra parcelada só grava depois de confirmar; falta de categoria vira pergunta", async () => {
  const { t, zo, cartao, compras, perfil } = await cenario();
  const contar = async () => (await t.req(t.A.getLancamentos)).lancamentos.length;
  // sem categoria (e sem perfil): nada é gravado, o Zo recebe o que falta
  const falta = await zo.executar("criar_transacao", args({ descricao: "Amazon", valor: 350, tipo: "despesa", conta_id: cartao.id, parcelas: 3 }));
  assert.equal(falta.tipo, "leitura");
  assert.deepEqual(JSON.parse(falta.resultado), { erro: "faltam_dados", campos: ["categoria_id", "perfil_id"] });
  assert.equal(await contar(), 0);
  // completo: resumo com os nomes reais e nada gravado até confirmar
  const r = await zo.executar("criar_transacao", args({ descricao: "Amazon", valor: 350, tipo: "despesa", conta_id: cartao.id, categoria_id: compras.id, perfil_id: perfil.id, parcelas: 3 }));
  assert.equal(r.tipo, "escrita");
  assert.equal(r.titulo, "Criar transação");
  assert.deepEqual(Object.fromEntries(r.linhas), { Tipo: "Despesa", Nome: "Amazon", Valor: "R$ 350,00 em 3x", Data: hoje().split("-").reverse().join("/"),
    Conta: "Nubank", Categoria: "Compras", Perfil: "Ana" });
  assert.equal(await contar(), 0);
  const feito = JSON.parse(await r.confirmar());
  assert.equal(feito.ok, true);
  const ls = (await t.req(t.A.getLancamentos)).lancamentos.filter((l) => l.descricao === "Amazon").sort((a, b) => a.data.localeCompare(b.data));
  assert.deepEqual(ls.map((l) => [l.parcelaAtual, l.parcelaTotal, l.valor]), [[1, 3, 116.68], [2, 3, 116.66], [3, 3, 116.66]]);   // pelo total, sobra na 1ª
});

test("Zo: erro do serviço volta para o Zo e não grava; ferramenta desconhecida não roda", async () => {
  const { t, zo, compras, perfil } = await cenario();
  const r = await zo.executar("criar_transacao", args({ descricao: "X", valor: 10, tipo: "debito", conta_id: "c-inexistente", categoria_id: compras.id, perfil_id: perfil.id }));
  assert.deepEqual(JSON.parse(r.resultado).campos, ["conta_id"]);
  for (const nome of ["apagar_tudo", "constructor", "__proto__", "toString"]) {
    const x = await zo.executar(nome, "{}");
    assert.deepEqual(JSON.parse(x.resultado), { erro: "ferramenta_desconhecida" }, nome);
  }
  assert.equal((await zo.executar("listar_contas", "isto não é json")).tipo, "leitura");     // argumentos ilegíveis = vazios
  assert.equal((await t.req(t.A.getLancamentos)).lancamentos.length, 0);
});

test("Zo: leitura devolve só o necessário; sugestão de categoria pelo histórico da pessoa", async () => {
  const { t, zo, banco, cartao, mercado, compras, perfil } = await cenario();
  for (const [d, cat] of [["Supermercado Dia", mercado], ["Supermercado Dia", mercado], ["Supermercado Extra", mercado], ["Loja X", compras]]) {
    await t.req(t.A.createLancamento, { lancamento: { data: hoje(), descricao: d, valor: 20, tipo: "regular", contaId: cartao.id, categoriaId: cat.id, perfilId: perfil.id, notas: "segredo de teste" } });
  }
  const lidas = JSON.parse((await zo.executar("listar_contas", "{}")).resultado);
  assert.equal(lidas.moeda, "BRL");                                   // a unidade dos valores vai junto (ZO-12)
  const contas = lidas.contas;
  assert.deepEqual(contas.map((c) => Object.keys(c).sort()), [["id", "nome", "saldo", "tipo"], ["id", "nome", "saldo", "tipo"]]);
  assert.equal(contas.find((c) => c.id === banco.id).saldo, 1000);
  const sug = JSON.parse((await zo.executar("sugerir_categoria", args({ descricao: "supermercado dia" }))).resultado);
  assert.equal(sug[0].nome, "Mercado");
  const busca = JSON.parse((await zo.executar("buscar_transacoes", args({ texto: "extra", limite: 5 }))).resultado);
  assert.equal(busca.total_encontrado, 1);
  assert.equal(busca.transacoes[0].categoria, "Mercado");
  const resumo = JSON.parse((await zo.executar("resumo_do_mes", "{}")).resultado);
  assert.equal(resumo.gasto, 80);
  assert.deepEqual(resumo.por_categoria, [{ categoria: "Mercado", gasto: 60 }, { categoria: "Compras", gasto: 20 }]);
});

test("Zo: editar e excluir só depois de confirmar; categoria mantém o orçamento ao renomear", async () => {
  const { t, zo, cartao, compras, perfil } = await cenario();
  const { lancamento } = await t.req(t.A.createLancamento, { lancamento: { data: hoje(), descricao: "Cinema", valor: 40, tipo: "regular", contaId: cartao.id, categoriaId: compras.id, perfilId: perfil.id } });
  const ed = await zo.executar("editar_transacao", args({ id: lancamento.id, valor: 55 }));
  assert.equal(Object.fromEntries(ed.linhas).Valor, "R$ 55,00");
  assert.equal((await t.req(t.A.getLancamentos)).lancamentos[0].valor, 40);                 // ainda não confirmou
  await ed.confirmar();
  assert.equal((await t.req(t.A.getLancamentos)).lancamentos[0].valor, 55);
  // excluir é sem volta: sem tela para confirmar a identidade, nada é apagado (falha fechada)
  const ex = await zo.executar("excluir_transacao", args({ id: lancamento.id }));
  assert.equal(ex.tipo, "escrita");
  assert.equal(JSON.parse(await ex.confirmar()).erro, "VERIFICACAO_NEGADA");
  assert.equal((await t.req(t.A.getLancamentos)).lancamentos.length, 1);
  const cat = await zo.executar("editar_categoria", args({ id: compras.id, nome: "Compras online" }));
  await cat.confirmar();
  const depois = (await t.req(t.A.getCategorias)).categorias.find((c) => c.id === compras.id);
  assert.deepEqual([depois.nome, depois.reservado, depois.icone], ["Compras online", 500, "🛍️"]);
});

test("Zo: sem 2FA, excluir e relatórios pedem a biometria antes; negada ou sem biometria, nada acontece", async () => {
  for (const [resposta, erro, apagou] of [["ok", null, true], ["negado", "VERIFICACAO_NEGADA", false], ["sem_metodo", "VERIFICACAO_NECESSARIA", false]]) {
    const pedidos = [];
    const tela = Object.assign(telaFalsa().tela, { verificarIdentidade: async () => { pedidos.push(1); return resposta; } });
    const { t, zo, cartao, compras, perfil } = await cenario({ tela });
    const { lancamento } = await t.req(t.A.createLancamento, { lancamento: { data: hoje(), descricao: "Cinema", valor: 40, tipo: "regular", contaId: cartao.id, categoriaId: compras.id, perfilId: perfil.id } });
    const ex = await zo.executar("excluir_transacao", args({ id: lancamento.id }));
    assert.equal(pedidos.length, 0, "a biometria só é pedida no Confirmar");
    const r = JSON.parse(await ex.confirmar());
    assert.equal(pedidos.length, 1);
    assert.equal(r.erro || null, erro, resposta);
    assert.equal((await t.req(t.A.getLancamentos)).lancamentos.length, apagou ? 0 : 1, resposta);
    // editar não é sem volta: não pede a biometria
    const ed = await zo.executar("editar_categoria", args({ id: compras.id, nome: "Lazer" }));
    await ed.confirmar();
    assert.equal(pedidos.length, 1);
  }
});

test("Zo: perfis só com o recurso; opções viram botões", async () => {
  const { zo } = await cenario({ perfis: false });
  const r = await zo.executar("criar_perfil", args({ nome: "Bia" }));
  assert.equal(JSON.parse(r.resultado).erro, "FEATURE_UNAVAILABLE");
  const op = await zo.executar("oferecer_opcoes", args({ pergunta: "Qual conta?", opcoes: ["Nubank", "", 3, "Itaú"] }));
  assert.deepEqual(JSON.parse(JSON.stringify(op)), { tipo: "opcoes", pergunta: "Qual conta?", opcoes: ["Nubank", "Itaú"] });   // objeto de outro contexto (vm)
});

/* ---------------- fase 2: fatura, configurações, telas e ações ---------------- */
function telaFalsa() {
  const chamadas = [];
  return { chamadas, tela: {
    abrirFatura: (o) => chamadas.push(["fatura", JSON.parse(JSON.stringify(o))]),
    filtrar: (f, busca) => chamadas.push(["filtrar", JSON.parse(JSON.stringify(f)), busca]),
    abrirConfiguracoes: (aba) => chamadas.push(["configuracoes", aba]),
    exportar: async () => { chamadas.push(["exportar"]); },
    sair: () => chamadas.push(["sair"]),
    seguranca: async () => ({ doisFatores: true, protecaoAvancada: false }),
    verificarIdentidade: async () => { chamadas.push(["verificar"]); return "ok"; },
  } };
}
async function cenario2() {
  const c = await cenario();
  const f = telaFalsa();
  c.zo = c.t.Z.zoFerramentas.criar((acao, dados) => c.t.req(acao, dados), { perfis: () => true, fatura: () => true, cambio: () => false, tela: f.tela });
  return Object.assign(c, f);
}

test("Zo: ajustes e pagamento recebido da fatura só depois de confirmar; a consulta mostra o total", async () => {
  const { t, zo, cartao, banco, compras, perfil } = await cenario2();
  const mes = hoje().slice(0, 7);
  await t.req(t.A.createLancamento, { lancamento: { data: hoje(), descricao: "Mercado", valor: 300, tipo: "regular", contaId: cartao.id, categoriaId: compras.id, perfilId: perfil.id } });
  const aj = await zo.executar("salvar_ajustes_fatura", args({ perfil_id: perfil.id, mes, descontos: [{ descricao: "Amizade", valor: 50 }] }));
  assert.equal(aj.tipo, "escrita");
  assert.equal(Object.fromEntries(aj.linhas).Descontos, "Amizade R$ 50,00");
  // mês atual (cartão sem fechamento) = fatura em aberto: sem incluir_aberto, nada entra
  assert.equal(JSON.parse((await zo.executar("consultar_fatura", args({ perfil_id: perfil.id, mes }))).resultado).quantidade, 0);
  let f = JSON.parse((await zo.executar("consultar_fatura", args({ perfil_id: perfil.id, mes, incluir_aberto: true }))).resultado);
  assert.equal(f.a_pagar, 300);                                                              // ainda não confirmou
  await aj.confirmar();
  const pg = await zo.executar("registrar_pagamento_recebido", args({ perfil_id: perfil.id, mes, conta_id: banco.id, valor: 100 }));
  assert.equal(Object.fromEntries(pg.linhas)["Entrou em"], "Itaú");
  await pg.confirmar();
  f = JSON.parse((await zo.executar("consultar_fatura", args({ perfil_id: perfil.id, mes, incluir_aberto: true }))).resultado);
  assert.deepEqual([f.total_transacoes, f.descontos, f.recebido, f.a_pagar, f.so_consulta], [300, -50, 100, 150, false]);
  const todos = JSON.parse((await zo.executar("consultar_fatura", args({ perfil_id: "todos", mes, incluir_aberto: true }))).resultado);
  assert.deepEqual([todos.perfil, todos.so_consulta, todos.a_pagar], ["todos", true, 300]);
});

test("Zo: configurações com confirmação; Pix e ações seguras só pela tela", async () => {
  const { t, zo, chamadas } = await cenario2();
  const cfg = await zo.executar("configurar", args({ orcamento: false }));
  assert.deepEqual(JSON.parse(JSON.stringify(cfg.linhas)), [["Orçamento", "Desligar"]]);
  assert.equal((await t.req(t.A.getConfig)).orcamentoAtivo, true);
  await cfg.confirmar();
  assert.equal((await t.req(t.A.getConfig)).orcamentoAtivo, false);
  assert.deepEqual(JSON.parse((await zo.executar("remover_pix", "{}")).resultado), { erro: "pix_nao_cadastrado" });
  const leitura = JSON.parse((await zo.executar("ler_configuracoes", "{}")).resultado);
  assert.deepEqual([leitura.orcamento_ligado, leitura.dois_fatores, leitura.protecao_avancada, leitura.pix_cadastrado], [false, true, false, false]);
  // senha, 2FA, apagar e excluir: abre a tela segura (nada passa pelo chat)
  for (const [assunto, aba] of [["senha", "conta"], ["dois_fatores", "conta"], ["excluir_conta", "conta"], ["apagar_dados", "conta"], ["pix", "geral"]]) {
    const r = JSON.parse((await zo.executar("abrir_configuracoes", args({ assunto }))).resultado);
    assert.equal(r.aberta, true, assunto);
    assert.deepEqual(chamadas.at(-1), ["configuracoes", aba], assunto);
  }
});

test("Zo: telas abrem na hora; exportar e sair pedem confirmação; sem tela, nada abre", async () => {
  const { zo, chamadas, perfil, cartao } = await cenario2();
  await zo.executar("abrir_fatura", args({ perfil_id: perfil.id, cartao_id: cartao.id, mes: "2026-09" }));
  assert.deepEqual(chamadas.at(-1), ["fatura", { perfilId: perfil.id, cartaoId: cartao.id, mes: 9, ano: 2026 }]);
  await zo.executar("filtrar_transacoes", args({ texto: "uber", tipos: ["regular", "apagar"], periodo: "mes" }));
  assert.deepEqual(chamadas.at(-1), ["filtrar", { contas: [], categorias: [], perfis: [], tipos: ["regular"], periodo: "mes" }, "uber"]);
  const exp = await zo.executar("exportar_transacoes", "{}");
  const sair = await zo.executar("sair", "{}");
  assert.deepEqual([exp.tipo, sair.tipo], ["escrita", "escrita"]);
  assert.ok(!chamadas.some((c) => c[0] === "exportar" || c[0] === "sair"));                  // nada antes do Confirmar
  await exp.confirmar(); await sair.confirmar();
  assert.deepEqual(chamadas.slice(-3), [["verificar"], ["exportar"], ["sair"]]);              // exportar (relatório) confirma a identidade antes
  const semTela = (await cenario()).zo;                                                     // sem as ações de tela
  assert.deepEqual(JSON.parse((await semTela.executar("abrir_configuracoes", args({ assunto: "senha" }))).resultado), { erro: "tela_indisponivel" });
  assert.equal(JSON.parse((await zo.executar("transferir_entre_moedas", args({ ids: ["x"], destino: "EUR" }))).resultado).erro, "FEATURE_UNAVAILABLE");
});

/* ---------------- fase 3: categorizar em lote e importar arquivo ---------------- */
test("Zo: categorizar em lote propõe pelo histórico e só aplica depois de confirmar", async () => {
  const { t, zo, cartao, compras, mercado, perfil } = await cenario({ tela: telaFalsa().tela });
  const lanc = (descricao, categoriaId) => t.req(t.A.createLancamento, { lancamento: { data: hoje(), descricao, valor: 10, tipo: "regular", contaId: cartao.id, categoriaId, perfilId: perfil.id } });
  await lanc("Supermercado Dia", mercado.id); await lanc("Loja Renner", compras.id);
  await lanc("SUPERMERCADO DIA", null); await lanc("Supermercado Dia", null); await lanc("Renner", null); await lanc("Algo novo", null);
  const r = await zo.executar("categorizar_em_lote", "{}");
  assert.equal(r.tipo, "escrita");
  assert.equal(r.titulo, "Categorizar 3 transações");
  const linhas = Object.fromEntries(JSON.parse(JSON.stringify(r.linhas)));
  assert.equal(linhas["Sem sugestão"], "1 ficam como estão");
  assert.ok(linhas.Mercado && linhas.Compras);
  const semCategoria = async () => (await t.req(t.A.getLancamentos)).lancamentos.filter((l) => !l.categoriaId).length;
  assert.equal(await semCategoria(), 4);                                                   // nada antes do Confirmar
  assert.equal(JSON.parse(await r.confirmar()).categorizadas, 3);
  assert.equal(await semCategoria(), 1);
  assert.deepEqual(JSON.parse((await (await cenario()).zo.executar("categorizar_em_lote", "{}")).resultado), { sem_categoria: 0 });
});

test("Zo: importar arquivo só mostra o botão (o arquivo é lido no aparelho, nunca vai para o Zo)", async () => {
  const { zo } = await cenario();
  assert.deepEqual(JSON.parse(JSON.stringify(await zo.executar("importar_arquivo", args({ caminho: "C:/segredo.csv" })))), { tipo: "arquivo" });
});

test("Zo: lixeira temporal recebe cada gravação confirmada e desfaz só ela; exportar e sair não entram", async () => {
  const gravadas = [];
  const f = telaFalsa();
  const c = await cenario();
  const zo = c.t.Z.zoFerramentas.criar((acao, dados) => c.t.req(acao, dados), { perfis: () => true, tela: f.tela, aoGravar: (titulo, marco) => gravadas.push({ titulo, marco }) });
  const cat = await zo.executar("criar_categoria", args({ nome: "Pets", icone: "🐶" }));
  assert.equal(gravadas.length, 0);                                                         // nada antes do Confirmar
  assert.ok(JSON.parse(await cat.confirmar()).ok);
  assert.equal(gravadas.length, 1);
  assert.equal(gravadas[0].titulo, cat.titulo);
  await (await zo.executar("exportar_transacoes", "{}")).confirmar();
  assert.equal(gravadas.length, 1);
  assert.deepEqual(await c.t.req(c.t.A.desfazerMarco, { marco: gravadas[0].marco }), { desfeitas: 1, conflitos: 0 });
  assert.ok(!(await c.t.req(c.t.A.getCategorias)).categorias.some((x) => x.nome === "Pets"));
  // gravação que falha não entra na lixeira
  const ruim = await zo.executar("editar_categoria", args({ id: "k-inexistente", nome: "X" }));
  if (ruim.tipo === "escrita") { await ruim.confirmar(); assert.equal(gravadas.length, 1); }
});

test("Zo: excluir conta, categoria e perfil mostram o impacto, pedem a biometria (sem 2FA) e voltam pela lixeira", async () => {
  const pedidos = [], gravadas = [];
  let resposta = "negado";
  const tela = Object.assign(telaFalsa().tela, { verificarIdentidade: async () => { pedidos.push(1); return resposta; } });
  const c = await cenario({ tela });
  const zo = c.t.Z.zoFerramentas.criar((acao, dados) => c.t.req(acao, dados), { perfis: () => true, tela, aoGravar: (titulo, marco) => gravadas.push(marco) });
  await c.t.req(c.t.A.createLancamento, { lancamento: { data: hoje(), descricao: "Cinema", valor: 40, tipo: "regular", contaId: c.cartao.id, categoriaId: c.compras.id, perfilId: c.perfil.id } });
  const ec = await zo.executar("excluir_conta", args({ id: c.cartao.id }));
  assert.equal(Object.fromEntries(JSON.parse(JSON.stringify(ec.linhas))).Transações, "1 continuam, sem conta");
  assert.equal(JSON.parse(await ec.confirmar()).erro, "VERIFICACAO_NEGADA");                     // biometria negada: nada sai
  assert.ok((await c.t.req(c.t.A.getContas)).contas.some((x) => x.id === c.cartao.id));
  resposta = "ok";
  assert.ok(JSON.parse(await (await zo.executar("excluir_conta", args({ id: c.cartao.id }))).confirmar()).ok);
  assert.ok(!(await c.t.req(c.t.A.getContas)).contas.some((x) => x.id === c.cartao.id));
  assert.deepEqual(await c.t.req(c.t.A.desfazerMarco, { marco: gravadas.at(-1) }), { desfeitas: 2, conflitos: 0 });   // a conta e o vínculo da transação
  assert.equal((await c.t.req(c.t.A.getLancamentos)).lancamentos[0].contaId, c.cartao.id);
  const ek = await zo.executar("excluir_categoria", args({ id: c.compras.id }));
  assert.equal(Object.fromEntries(JSON.parse(JSON.stringify(ek.linhas))).Transações, "1 vão para a categoria Outros");
  assert.ok(JSON.parse(await ek.confirmar()).ok);
  const ep = await zo.executar("excluir_perfil", args({ id: c.perfil.id }));
  assert.equal(Object.fromEntries(JSON.parse(JSON.stringify(ep.linhas))).Transações, "1 ficam sem perfil");
  assert.ok(JSON.parse(await ep.confirmar()).ok);
  assert.equal(pedidos.length, 4);                                                                // uma biometria por exclusão
  for (const [nome, erro] of [["excluir_conta", "conta_nao_encontrada"], ["excluir_categoria", "categoria_nao_encontrada"], ["excluir_perfil", "perfil_nao_encontrado"]]) {
    assert.equal(JSON.parse((await zo.executar(nome, args({ id: "x-inexistente" }))).resultado).erro, erro);
  }
  // sem tela para confirmar a identidade, nada é excluído
  const semTela = (await cenario()).zo;
  const r = await semTela.executar("excluir_categoria", args({ id: (await c.t.req(c.t.A.getCategorias)).categorias[0].id }));
  if (r.tipo === "escrita") assert.equal(JSON.parse(await r.confirmar()).erro, "VERIFICACAO_NEGADA");
});

test("Zo: senha, apagar dados, excluir a conta e Pix só abrem a tela depois da biometria (sem 2FA)", async () => {
  for (const [resposta, abre] of [["ok", true], ["negado", false], ["sem_metodo", false]]) {
    const f = telaFalsa();
    const tela = Object.assign(f.tela, { verificarIdentidade: async () => { f.chamadas.push(["verificar"]); return resposta; } });
    const { zo } = await cenario({ tela });
    for (const assunto of ["senha", "apagar_dados", "excluir_conta", "pix"]) {
      const r = JSON.parse((await zo.executar("abrir_configuracoes", args({ assunto }))).resultado);
      assert.equal(r.aberta === true, abre, resposta + " " + assunto);
      if (!abre) assert.ok(/^VERIFICACAO_/.test(r.erro));
    }
    assert.equal(f.chamadas.filter((x) => x[0] === "configuracoes").length, abre ? 4 : 0);
    // o resto das Configurações abre direto, sem biometria
    const antes = f.chamadas.filter((x) => x[0] === "verificar").length;
    await zo.executar("abrir_configuracoes", args({ assunto: "dois_fatores" }));
    assert.equal(f.chamadas.filter((x) => x[0] === "verificar").length, antes);
  }
});
