const test = require("node:test");
const assert = require("node:assert/strict");
const bcb = require("../assets/bcb-api.js");

test("monta consulta SGS do BACEN com período e formato JSON", () => {
  const url = bcb.urlFor(11, "2024-08-30", "2024-09-30");
  assert.match(url, /bcdata\.sgs\.11\/dados/);
  assert.match(url, /formato=json/);
  assert.match(url, /dataInicial=30%2F08%2F2024/);
  assert.match(url, /dataFinal=30%2F09%2F2024/);
});

test("mantém as séries oficiais usadas pelos índices jurídicos", () => {
  assert.deepEqual(bcb.SERIES, {
    selicDaily: 11,
    inpcMonthly: 188,
    ipcaMonthly: 433,
    ipca15Monthly: 7478,
    ipcaEMonthly: 10764,
  });
});

test("normaliza séries diárias e mensais do BACEN", async () => {
  const fetchImpl = async () => ({
    ok: true,
    json: async () => [
      { data: "30/08/2024", valor: "0,031" },
      { data: "02/09/2024", valor: "0.032" },
    ],
  });
  const rows = await bcb.series(11, { start: "2024-08-30", end: "2024-09-30", fetchImpl });
  assert.deepEqual(rows, [
    { date: "2024-08-30", value: 0.031 },
    { date: "2024-09-02", value: 0.032 },
  ]);
  assert.deepEqual(await bcb.monthly(11, { start: "2024-08-30", end: "2024-09-30", fetchImpl }), {
    "2024-08": 0.031,
    "2024-09": 0.032,
  });
});
