const test = require("node:test");
const assert = require("node:assert/strict");
const indices = require("../assets/indices.js");

test("reproduz a Taxa Legal oficial de maio de 2026", () => {
  assert.equal(indices.legalRateFromFactors(1.01090058, 1.0089), 0.198293);
});

test("aplica piso zero quando Selic descontado o IPCA é negativo", () => {
  assert.equal(indices.legalRateFromFactors(1.001, 1.005), 0);
});
