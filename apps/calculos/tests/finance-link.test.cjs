const test = require("node:test");
const assert = require("node:assert/strict");
const finance = require("../assets/finance-link.js");

test("filtra os casos pelo cliente selecionado", () => {
  const data = {
    clients: [{ id: "c1", name: "Ana" }, { id: "c2", name: "Bruno" }],
    cases: [
      { id: "case-1", clientId: "c1", title: "Ação", number: "1" },
      { id: "case-2", clientId: "c2", title: "Ação", number: "2" },
    ],
  };
  assert.deepEqual(finance.casesForClient(data, "c1").map((item) => item.id), ["case-1"]);
  assert.equal(finance.caseLabel(data.cases[0]), "Ação — 1");
});

test("resolve os nomes atuais dos vínculos do Financeiro", () => {
  const data = { clients: [{ id: "c1", name: "Ana" }], cases: [] };
  assert.equal(finance.clientLabel(finance.findClient(data, "c1")), "Ana");
  assert.equal(finance.findClient(data, "missing"), null);
});
