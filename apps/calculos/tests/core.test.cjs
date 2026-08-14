const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../assets/core.js");

test("gera parcelas mensais sem saltar fevereiro em vencimentos no dia 31", () => {
  const rows = core.generateInstallments({
    startDate: "2026-01-31", endDate: "2026-03-31", basisType: "fixed", fixedAmount: 500,
  });
  assert.deepEqual(rows.map((item) => item.dueDate), ["2026-01-31", "2026-02-28", "2026-03-31"]);
});

test("usa o salário mínimo vigente em cada vencimento", () => {
  const rows = core.generateInstallments({
    startDate: "2025-12-10", endDate: "2026-01-10", basisType: "minimum_wage", percentage: 50,
  });
  assert.deepEqual(rows.map((item) => item.originalAmount), [759, 810.5]);
});

test("aplica correção composta apenas em competências mensais completas posteriores", () => {
  const result = core.correctionFactor("2026-01-10", "2026-03-31", { "2026-02": 1, "2026-03": 2 });
  assert.equal(result.factor, 1.0302);
});

test("calcula juros simples mensais com pró-rata por dias corridos", () => {
  const result = core.monthlyProrata("2026-01-16", "2026-02-16", {}, 1);
  assert.equal(result.applied.length, 2);
  assert.equal(core.round(result.rate, 8), core.round(1 * 16 / 31 + 1 * 15 / 28, 8));
});

test("deduz abatimento atualizado pela mesma regra", () => {
  const result = core.calculatePension({
    calculationDate: "2026-02-28",
    installments: [{
      id: "p1", dueDate: "2026-01-01", description: "Parcela", originalAmount: 1000,
      payments: [{ id: "a1", date: "2026-02-01", amount: 400, description: "Pagamento" }],
    }],
    settings: {
      correctionType: "none", interestType: "fixed", fixedMonthlyRate: 1,
      penaltyRate: 0, feeRate: 0,
    },
  });
  assert.equal(result.ledger.length, 2);
  assert.equal(result.ledger[1].sign, -1);
  assert.equal(result.totals.total, 615.78);
});

test("inclui o décimo terceiro apenas quando solicitado e dentro do período", () => {
  const rows = core.generateInstallments({
    startDate: "2026-11-10", endDate: "2026-12-31", basisType: "fixed", fixedAmount: 300, includeThirteenth: true,
  });
  assert.equal(rows.filter((item) => item.kind === "thirteenth").length, 1);
});

test("combina a faixa histórica e a Taxa Legal na mudança de agosto de 2024", () => {
  const result = core.calculatePension({
    calculationDate: "2024-08-31",
    installments: [{ id: "p1", dueDate: "2024-08-01", originalAmount: 1000, payments: [] }],
    settings: {
      correctionType: "none", interestType: "legal", preLegalMonthlyRate: 0,
      legalRates: { "2024-08": 3.1 }, penaltyRate: 0, feeRate: 0,
    },
  });
  assert.equal(result.ledger[0].interestRate, 1.0534246575);
  assert.match(result.methodology.interestMethod, /6% ao ano até 11\/02\/2003/);
});

test("aplica 6% e 12% ao ano nas faixas históricas dos juros legais", () => {
  const result = core.calculatePension({
    calculationDate: "2003-02-20",
    installments: [{ id: "p1", dueDate: "2003-02-01", originalAmount: 1000, payments: [] }],
    settings: { correctionType: "none", interestType: "legal", legalRates: {}, penaltyRate: 0, feeRate: 0 },
  });
  assert.equal(result.ledger[0].interestRate, 0.4438356164);
  assert.deepEqual(result.ledger[0].interestTrail.map((item) => item.regime), ["CC/1916", "CC/2002 + CTN"]);
});
