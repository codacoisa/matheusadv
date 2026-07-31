const test = require("node:test");
const assert = require("node:assert/strict");
const labor = require("../assets/labor-core.js");

const settings = { correctionType: "none", interestType: "none", penaltyRate: 0, feeRate: 0 };
const baseInput = (overrides = {}) => ({
  startDate: "2026-01-16", endDate: "2026-03-31", calculationDate: "2026-12-31",
  baseSalary: 2200, divisor: 220, settings, ...overrides,
});

test("gera competências mensais inclusivas e salários com divisor", () => {
  assert.deepEqual(labor.generateCompetences("2026-01-31", "2026-03-01"), ["2026-01", "2026-02", "2026-03"]);
  const rows = labor.createSalaryRows(baseInput());
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[0], {
    id: "salario-2026-01", competence: "2026-01", baseSalary: 2200, divisor: 220,
    description: "Salário", status: "unpaid", paidAmount: 0, paymentDate: "2026-01-31",
  });
});

test("calcula 13º por avos com ao menos quinze dias de vínculo", () => {
  const result = labor.calculateLabor(baseInput({
    endDate: "2026-12-31", terminationDate: "2026-12-31",
    claims: [{ type: "thirteenth", dueDate: "2026-12-20" }],
  }));
  assert.equal(result.claimTotals[0].original, 2200);

  const partial = labor.calculateLabor(baseInput({
    endDate: "2026-02-14", terminationDate: "2026-02-14",
    claims: [{ type: "thirteenth", dueDate: "2026-02-14" }],
  }));
  assert.equal(partial.claimTotals[0].original, 183.33);
});

test("apura férias proporcionais com um terço e dobra a remuneração completa", () => {
  const result = labor.calculateLabor(baseInput({
    claims: [
      { type: "vacation", dueDate: "2026-03-31", days: 15 },
      { type: "vacation", dueDate: "2026-03-31", days: 30, double: true },
    ],
  }));
  assert.equal(result.claimTotals[0].original, 7333.34);
});

test("usa salário-hora e divisor em horas extras, intervalo e adicional noturno", () => {
  const result = labor.calculateLabor(baseInput({
    claims: [
      { type: "overtime", dueDate: "2026-03-31", hours: 10, percentage: 50 },
      { type: "intrajornada", dueDate: "2026-03-31", hours: 2, percentage: 50 },
      { type: "night_shift", dueDate: "2026-03-31", hours: 10, percentage: 20 },
    ],
  }));
  const byType = Object.fromEntries(result.claimTotals.map((item) => [item.type, item.original]));
  assert.equal(byType.overtime, 150);
  assert.equal(byType.intrajornada, 30);
  assert.equal(byType.night_shift, 20);
});

test("deduz pagamentos parciais e integra adicionais, multas e reflexos ao total", () => {
  const result = labor.calculateLabor(baseInput({
    claims: [
      { type: "salary_balance", dueDate: "2026-03-31", days: 10, status: "partial", paidAmount: 100 },
      { type: "insalubrity", dueDate: "2026-03-31", percentage: 20 },
      { type: "periculosidade", dueDate: "2026-03-31", percentage: 30 },
      { type: "fgts_40", dueDate: "2026-03-31", baseAmount: 1000 },
      { type: "art_467", dueDate: "2026-03-31", baseAmount: 800 },
      { type: "art_477", dueDate: "2026-03-31" },
      { type: "reflexes", dueDate: "2026-03-31", baseTypes: ["insalubrity", "periculosidade"], percentage: 10 },
    ],
  }));
  const byType = Object.fromEntries(result.claimTotals.map((item) => [item.type, item]));
  assert.equal(byType.salary_balance.original, 733.33);
  assert.equal(byType.salary_balance.paid, 100);
  assert.equal(byType.insalubrity.original, 440);
  assert.equal(byType.periculosidade.original, 660);
  assert.equal(byType.fgts_40.original, 400);
  assert.equal(byType.art_467.original, 400);
  assert.equal(byType.art_477.original, 2200);
  assert.equal(byType.reflexes.original, 110);
  assert.equal(result.totals.total, 4843.33);
  assert.equal(result.ledger.filter((item) => item.sign < 0).length, 1);
  assert.equal(result.calculationVersion, labor.VERSION);
});

test("aceita todas as rubricas trabalhistas previstas pelo catálogo do motor", () => {
  const claims = Object.keys(labor.TYPES).map((type) => ({ type, dueDate: "2026-03-31", amount: 10 }));
  const result = labor.calculateLabor(baseInput({ claims }));
  assert.deepEqual(result.claimTotals.map((item) => item.type).sort(), Object.keys(labor.TYPES).sort());
  assert.equal(result.totals.total, Object.keys(labor.TYPES).length * 10);
});

test("apura benefícios, comissões, DSR e insalubridade pela base declarada", () => {
  const result = labor.calculateLabor(baseInput({
    claims: [
      { type: "dsr", dueDate: "2026-03-31", days: 4, double: true },
      { type: "insalubrity", dueDate: "2026-03-31", base: "minimum_wage", percentage: 20 },
      { type: "family_salary", dueDate: "2026-03-31", quantity: 2, unitValue: 65 },
      { type: "meal_voucher", dueDate: "2026-03-31", quantity: 22, unitValue: 30 },
      { type: "transport_voucher", dueDate: "2026-03-31", quantity: 44, unitValue: 5 },
      { type: "unemployment_insurance", dueDate: "2026-03-31", installments: 4, installmentValue: 1800 },
      { type: "commissions", dueDate: "2026-03-31", dueAmount: 900 },
    ],
  }));
  const byType = Object.fromEntries(result.claimTotals.map((item) => [item.type, item.original]));
  assert.equal(byType.dsr, 586.67);
  assert.equal(byType.insalubrity, 324.2);
  assert.equal(byType.family_salary, 130);
  assert.equal(byType.meal_voucher, 660);
  assert.equal(byType.transport_voucher, 220);
  assert.equal(byType.unemployment_insurance, 7200);
  assert.equal(byType.commissions, 900);
});
