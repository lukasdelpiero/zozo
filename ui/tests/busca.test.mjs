// Testes da busca local (js/core/busca.ts): várias palavras, prefixo, erros de digitação, valores e destaque.
//   node --test ui/tests
import test from "node:test";
import assert from "node:assert/strict";
import { carregar } from "./carregar.mjs";

const { Z } = carregar();
const B = Z.busca;
const ITENS = [
  { id: 1, descricao: "Supermercado do bairro", categoria: "Mercado", conta: "Itaú", valor: 152.4, data: "outubro 2026 11/10/2026" },
  { id: 2, descricao: "Uber *Trip", categoria: "Transporte", conta: "Nubank", valor: 23.9, data: "outubro 2026 10/10/2026" },
  { id: 3, descricao: "Café da manhã", categoria: "Padaria", conta: "Itaú", valor: 18, data: "setembro 2026 28/09/2026" },
  { id: 4, descricao: "Aluguel", categoria: "Moradia", conta: "Itaú", valor: 1234.56, data: "outubro 2026 05/10/2026", notas: "apartamento centro" },
  { id: 5, descricao: "Supermarket Online", categoria: "Mercado", conta: "Nubank", valor: 150, data: "setembro 2026 02/09/2026" },
];
const valorTexto = (v) => [Z.format.moedaEditavel(v), String(Math.trunc(v)), Z.format.moedaEditavel(Math.trunc(v)).replace(/,00$/, "")].join(" ");
const campos = (x) => [[x.descricao, 3], [x.categoria, 2], [x.conta, 2], [valorTexto(x.valor), 2], [x.data, 1], [x.notas, 1]];
// os módulos rodam noutro contexto do Node (vm): os arrays são copiados para comparar
const ids = (texto) => [...B.indice(ITENS, campos).buscar(texto).itens.map((x) => x.id)];

test("sem acento e sem maiúsculas", () => {
  assert.deepEqual(ids("cafe"), [3]);
  assert.deepEqual(ids("CAFÉ MANHA"), [3]);
});

test("várias palavras, em qualquer ordem e em qualquer campo (todas precisam aparecer)", () => {
  assert.deepEqual(ids("itau outubro"), [1, 4]);
  assert.deepEqual(ids("outubro itau mercado"), [1]);
  assert.deepEqual(ids("nubank setembro"), [5]);
  assert.deepEqual(ids("uber setembro"), []);
});

test("prefixo enquanto digita e trecho no meio da palavra", () => {
  assert.deepEqual(ids("merc"), [1, 5]);               // Supermercado (descrição) e Mercado (categoria)
  assert.deepEqual(ids("market"), [5]);                // Supermarket
  assert.deepEqual(ids("apart"), [4]);                 // notas
});

test("tolera erros de digitação (1 erro a partir de 5 letras, 2 a partir de 9)", () => {
  assert.deepEqual(ids("aluguell"), [4]);              // letra a mais
  assert.deepEqual(ids("supremercado"), [1]);          // letras trocadas
  assert.deepEqual(ids("supermecado"), [1]);           // letra faltando
  assert.deepEqual(ids("ubre"), []);                   // 4 letras: sem tolerância (evita resultados aleatórios)
  assert.equal(B.distancia("supermercado", "supremercado", 2), 1);
});

test("valores: número digitado, formato brasileiro e filtros > <", () => {
  assert.deepEqual(ids("1.234,56"), [4]);
  assert.deepEqual(ids("1234"), [4]);
  assert.deepEqual(ids("R$ 23,90"), [2]);
  assert.deepEqual(ids("150"), [5]);                   // 150,00 (152,40 não: "152" não começa com "150")
  assert.deepEqual(ids(">100"), [1, 4, 5]);
  assert.deepEqual(ids("> 100 < 200"), [1, 5]);
  assert.deepEqual(ids("itau >= 152,40"), [1, 4]);
  assert.deepEqual(ids("<= 18"), [3]);
});

test("datas: dia/mês e mês por extenso", () => {
  assert.deepEqual(ids("11/10"), [1]);
  assert.deepEqual(ids("setembro"), [3, 5]);
  assert.deepEqual(ids("set mercado"), [5]);
});

test("relevância: descrição vale mais que categoria; casamento exato vale mais que com erro", () => {
  const r = B.indice(ITENS, campos).buscar("mercado");
  assert.ok(r.pontos(ITENS[0]) > 0 && r.pontos(ITENS[4]) > 0);
  const r2 = B.indice(ITENS, campos).buscar("aluguel");
  const r3 = B.indice(ITENS, campos).buscar("aluguell");
  assert.ok(r2.pontos(ITENS[3]) > r3.pontos(ITENS[3]));
});

test("busca vazia devolve tudo, na ordem original", () => {
  assert.deepEqual(ids(""), [1, 2, 3, 4, 5]);
  assert.deepEqual(ids("   "), [1, 2, 3, 4, 5]);
  assert.deepEqual(ids("<"), [1, 2, 3, 4, 5]);
});

test("destaque mantém os acentos do texto original", () => {
  const partes = B.destacar("Café da Manhã", B.consulta("manha cafe").termos);
  assert.deepEqual(JSON.parse(JSON.stringify(partes)), [{ marca: "Café" }, " da ", { marca: "Manhã" }]);
  assert.deepEqual(JSON.parse(JSON.stringify(B.destacar("Supermercado", ["merc"]))), ["Super", { marca: "merc" }, "ado"]);
  assert.deepEqual([...B.destacar("Aluguel", [])], ["Aluguel"]);
});

test("índice fica guardado para a mesma lista (e muda quando a lista muda)", () => {
  const a = B.indice(ITENS, campos);
  assert.equal(B.indice(ITENS, campos), a);
  assert.notEqual(B.indice(ITENS.slice(), campos), a);
  assert.notEqual(B.indice(ITENS, campos, "outra"), a);
});

test("desempenho: 10 mil transações — índice e cada tecla em poucos milissegundos", () => {
  const palavras = ["mercado", "uber", "ifood", "farmacia", "posto", "aluguel", "academia", "cinema", "padaria", "livraria", "netflix", "spotify"];
  const muitos = Array.from({ length: 10000 }, (_x, i) => ({
    descricao: palavras[i % 12] + " " + palavras[(i * 7) % 12] + " loja " + (i % 300), categoria: palavras[(i * 5) % 12], conta: Math.floor(i / 12) % 2 ? "Itaú" : "Nubank",
    valor: (i % 5000) / 3, data: (i % 28 + 1) + "/" + (i % 12 + 1) + "/2026",
  }));
  let t = performance.now();
  const ind = B.indice(muitos, campos);
  const montar = performance.now() - t;
  const tempos = ["m", "me", "mer", "merc", "merca", "mercad", "mercado", "mercado i", "mercado it", "mercado ita", "mercado itau", "mercadoo itau", "farmacai >100"].map((q) => {
    t = performance.now(); const r = ind.buscar(q); return [q, performance.now() - t, r.itens.length];
  });
  assert.ok(montar < 1500, "índice levou " + montar.toFixed(0) + " ms");
  for (const [q, ms, n] of tempos) assert.ok(ms < 150, q + " levou " + ms.toFixed(1) + " ms (" + n + " itens)");
  assert.ok(tempos.find((x) => x[0] === "mercado itau")[2] > 0);
  assert.ok(tempos.find((x) => x[0] === "farmacai >100")[2] > 0);   // com erro de digitação e filtro de valor
});
