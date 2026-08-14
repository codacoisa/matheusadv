const test = require("node:test");
const assert = require("node:assert/strict");
require("../assets/bcb-api.js");
const indices = require("../assets/indices.js");

test("reproduz a Taxa Legal oficial de maio de 2026", () => {
  assert.equal(indices.legalRateFromFactors(1.01090058, 1.0089), 0.198293);
});

test("aplica piso zero quando Selic descontado o IPCA é negativo", () => {
  assert.equal(indices.legalRateFromFactors(1.001, 1.005), 0);
});

test("consulta cada índice de correção pela série BACEN correspondente", async () => {
  const originalFetch = global.fetch;
  const urls = [];
  global.fetch = async (url) => ({
    ok: true,
    json: async () => [
      (() => { urls.push(String(url)); return { data: "01/01/2026", valor: "0,42" }; })(),
    ],
  });
  try {
    for (const type of ["INPC", "IPCA", "IPCA-E", "IPCA15"]) {
      assert.deepEqual(await indices.correction(type, "2026-01", "2026-01"), { "2026-01": 0.42 });
    }
    assert.equal(urls.filter((url) => url.includes("bcdata.sgs.188")).length, 1);
    assert.equal(urls.filter((url) => url.includes("bcdata.sgs.433")).length, 1);
    assert.equal(urls.filter((url) => url.includes("bcdata.sgs.10764")).length, 1);
    assert.equal(urls.filter((url) => url.includes("bcdata.sgs.7478")).length, 1);
  } finally {
    global.fetch = originalFetch;
  }
});

test("expõe a competência inicial da Taxa Legal como constante", () => {
  assert.equal(indices.LEGAL_RATE_START_MONTH, "2024-08");
});
