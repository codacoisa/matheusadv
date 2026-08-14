const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../generalista/assets/generalista-core.js");

test("calcula débito e pagamento com correção e juros pró-rata", () => {
  const result = core.calculateGeneric({
    calculationDate: "2026-03-01",
    items: [
      { id: "d1", date: "2026-01-01", amount: 1000, description: "Parcela", kind: "debit" },
      { id: "p1", date: "2026-02-01", amount: 200, description: "Pagamento", kind: "payment" },
    ],
    settings: { correctionType: "INPC", correctionProrata: true, interestRate: 1, interestPeriodicity: "monthly", interestProrata: true },
    ratesByType: { INPC: { "2026-01": 1, "2026-02": 2 } },
  });
  assert.equal(result.ledger.length, 2);
  assert.equal(result.totals.original, 800);
  assert.ok(result.totals.total > 800);
});

test("aplica honorários percentuais, multa e custas separadamente", () => {
  const result = core.calculateGeneric({
    calculationDate: "2026-02-01",
    items: [{ id: "d1", date: "2026-01-01", amount: 1000, kind: "debit" }],
    penalties: [{ rate: 2, description: "Multa contratual" }],
    fees: [{ rate: 10, type: "percent", description: "Honorários" }],
    costs: [{ date: "2026-01-01", amount: 50, description: "Custas", correctionType: "none" }],
    settings: { correctionType: "none", interestRate: 0 },
  });
  assert.equal(result.totals.penalty, 20);
  assert.equal(result.totals.fees, 102);
  assert.equal(result.totals.costs, 50);
  assert.equal(result.totals.total, 1172);
});

test("não trata série de correção vazia como atualização sem índice", () => {
  assert.throws(() => core.calculateGeneric({
    calculationDate: "2026-03-01",
    items: [{ id: "d1", date: "2026-01-01", amount: 1000, kind: "debit", correctionType: "IPCA" }],
    settings: { correctionType: "none" },
    ratesByType: { IPCA: {} },
  }), /Índice de correção ausente/);
});

test("aceita juros anuais sem pró-rata", () => {
  const result = core.interestRate("2025-01-01", "2027-01-01", 12, "annual", false);
  assert.equal(result.rate, 24);
});

test("aplica Taxa Legal por lançamento a partir de 30/08/2024", () => {
  const result = core.calculateGeneric({
    calculationDate: "2024-09-30",
    periodStartDate: "2024-08-30",
    items: [{ id: "d1", date: "2024-08-01", amount: 1000, kind: "debit", interestType: "legal" }],
    settings: { correctionType: "none" },
    legalRates: { "2024-08": 0.2, "2024-09": 0.3 },
  });
  assert.equal(result.ledger[0].interestType, "legal");
  assert.equal(result.ledger[0].interestRate, 0.3029032258);
  assert.equal(result.totals.interest, 3.03);
});
