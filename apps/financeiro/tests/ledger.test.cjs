const test = require("node:test");
const assert = require("node:assert/strict");
const {
  hasDuplicateCaseReference,
  hasDuplicateDocument,
  normalizeCaseReference,
  planPaymentAllocation,
  realizedAmountOf,
  remainingAmountOf,
  statusOf,
} = require("../assets/ledger.js");

test("identificar CPF duplicado independentemente da máscara", () => {
  const people = [{ id: "1", document: "123.456.789-09" }];
  assert.equal(hasDuplicateDocument(people, "12345678909"), true);
  assert.equal(hasDuplicateDocument(people, "12345678909", "1"), false);
});

test("identificar CNPJ alfanumérico duplicado independentemente da máscara", () => {
  const companies = [{ id: "1", document: "12.ABC.345/01DE-35" }];
  assert.equal(hasDuplicateDocument(companies, "12abc34501de35"), true);
  assert.equal(hasDuplicateDocument(companies, "12ABC34501DE35", "1"), false);
});

test("normalizar número CNJ e referências internas", () => {
  assert.equal(
    normalizeCaseReference("0001234-56.2026.8.09.0001"),
    "00012345620268090001",
  );
  assert.equal(
    hasDuplicateCaseReference(
      [{ id: "1", number: "Referência Ágil-42" }],
      "referencia agil 42",
    ),
    true,
  );
});

test("calcular realização parcial e saldo sem ultrapassar o total", () => {
  const partial = { amount: 1000, paidAmount: 350, dueDate: "2026-07-01" };
  assert.equal(realizedAmountOf(partial), 350);
  assert.equal(remainingAmountOf(partial), 650);
  assert.equal(statusOf(partial, "2026-07-22"), "partial");

  const settled = { amount: 1000, paidAmount: 1200, dueDate: "2026-07-01" };
  assert.equal(realizedAmountOf(settled), 1000);
  assert.equal(remainingAmountOf(settled), 0);
  assert.equal(statusOf(settled, "2026-07-22"), "paid");
});

test("distribuir excedente nas parcelas seguintes em ordem", () => {
  const entries = [
    {
      id: "p1",
      amount: 500,
      contractSource: "case",
      contractId: "case-1",
      scheduleItemId: "installment-1",
      dueDate: "2026-07-10",
    },
    {
      id: "p2",
      amount: 500,
      paidAmount: 100,
      contractSource: "case",
      contractId: "case-1",
      scheduleItemId: "installment-2",
      dueDate: "2026-08-10",
      description: "2ª parcela",
    },
    {
      id: "p3",
      amount: 500,
      contractSource: "case",
      contractId: "case-1",
      scheduleItemId: "installment-3",
      dueDate: "2026-09-10",
      description: "3ª parcela",
    },
  ];

  const plan = planPaymentAllocation(entries, "p1", 1150);
  assert.equal(plan.excess, 650);
  assert.equal(plan.unallocated, 0);
  assert.deepEqual(plan.updates, [
    {
      id: "p2",
      description: "2ª parcela",
      appliedAmount: 400,
      paidAmount: 500,
      status: "paid",
    },
    {
      id: "p3",
      description: "3ª parcela",
      appliedAmount: 250,
      paidAmount: 250,
      status: "partial",
    },
  ]);
});

test("informar excedente que não cabe nas parcelas futuras", () => {
  const entries = [
    {
      id: "p1",
      amount: 500,
      contractSource: "case",
      contractId: "case-1",
      dueDate: "2026-07-10",
    },
    {
      id: "p2",
      amount: 300,
      contractSource: "case",
      contractId: "case-1",
      dueDate: "2026-08-10",
    },
  ];
  const plan = planPaymentAllocation(entries, "p1", 1000);
  assert.equal(plan.availableFuture, 300);
  assert.equal(plan.unallocated, 200);
  assert.equal(plan.updates[0].status, "paid");
});

test("usar o valor editado da parcela atual ao calcular o excedente", () => {
  const entries = [
    {
      id: "p1",
      amount: 500,
      contractSource: "case",
      contractId: "case-1",
      dueDate: "2026-07-10",
    },
    {
      id: "p2",
      amount: 500,
      contractSource: "case",
      contractId: "case-1",
      dueDate: "2026-08-10",
    },
  ];
  const plan = planPaymentAllocation(entries, "p1", 700, 600);
  assert.equal(plan.excess, 100);
  assert.equal(plan.updates[0].paidAmount, 100);
});
