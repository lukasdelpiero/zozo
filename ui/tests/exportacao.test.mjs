import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';

function carregarCsv() {
  const z = {dom:{}, icons:{}, ui:{}, list:{}, pagesComum:{}, messages:{ACTIONS:{},FRIENDLY:{}},
    store:{}, pages:{}, regras:{tiposValorVerde:['receita']},
    servico:{FREQUENCIAS:{mensal:{rotulo:'Mensal'}}}, recursos:{perfis:()=>true}};
  const ctx = vm.createContext({window:{ZoZo:z}, Intl, Date});
  for (const nome of ['core/format.ts', 'pages/perfil.ts']) {
    let fonte = readFileSync(new URL('../js/'+nome, import.meta.url), 'utf8');
    // Expõe somente no contexto de teste a função usada pela exportação real.
    fonte = fonte.replace('ZoZo.exportarCsv = exportarCsv;', 'ZoZo.exportarCsv = exportarCsv; (ZoZo as any).csvTeste = gerarCsv;');
    vm.runInContext(stripTypeScriptTypes(fonte), ctx);
  }
  return z.csvTeste;
}

test('CSV recusa data inválida em vez de substituí-la por hoje', () => {
  const csv = carregarCsv();
  assert.throws(() => csv([{data:'2026-02-30', descricao:'Teste', tipo:'regular', valor:10}], 'BRL'), /INVALID_DATE/);
});

test('CSV neutraliza fórmulas e escapa delimitadores e aspas', () => {
  const csv = carregarCsv();
  for (const descricao of ['=1+1', ' +SUM(A1)', '-1+2', '@SUM(A1)', '\t=1', '\r=1', 'a;b', 'a"b']) {
    const texto = csv([{data:'2026-10-23', descricao, tipo:'regular', valor:10}], 'BRL');
    if (/^\s*[=+\-@\t\r]/.test(descricao)) assert.ok(texto.includes("'"+descricao));
    if (descricao === 'a;b') assert.ok(texto.includes('"a;b"'));
    if (descricao === 'a"b') assert.ok(texto.includes('"a""b"'));
  }
});
