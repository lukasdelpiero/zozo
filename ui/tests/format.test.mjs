// Leitura de valores digitados ou colados (js/core/format.ts: parseMoeda). Auditoria do frontend (27/10/2026):
// colar "1,234.56" (padrão americano) esvaziava o campo de valor.
//   node --test ui/tests
import test from "node:test";
import assert from "node:assert/strict";
import { carregar } from "./carregar.mjs";

test("parseMoeda: formatos brasileiros, ponto decimal e o padrão americano com milhar", () => {
  const { Z } = carregar();
  const bons = { "1.234,56": 1234.56, "1234,56": 1234.56, "1234.56": 1234.56, "1.234": 1234, "-12,5": -12.5, "R$ 1.234,56": 1234.56,
    "1,234.56": 1234.56, "1,234,567.89": 1234567.89, "-1,234.5": -1234.5 };
  for (const [txt, v] of Object.entries(bons)) assert.equal(Z.format.parseMoeda(txt), v, txt);
  for (const ruim of ["123abc", "1,2,3", "1,23.4", "12.34.56", ""]) assert.ok(Number.isNaN(Z.format.parseMoeda(ruim)), ruim);
});
