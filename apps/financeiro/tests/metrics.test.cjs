const test = require("node:test");
const assert = require("node:assert/strict");
const {
  cashDateOf,
  cashFlowSeries,
  previousMonths,
} = require("../assets/metrics.js");

test("listar as seis competências até o mês selecionado", () => {
  assert.deepEqual(previousMonths("2026-07"), [
    "2026-02",
    "2026-03",
    "2026-04",
    "2026-05",
    "2026-06",
    "2026-07",
  ]);
});

test("computar o caixa pela data efetiva do pagamento", () => {
  const series = cashFlowSeries(
    [
      {
        status: "paid",
        kind: "income",
        amount: 600,
        paidAmount: 600,
        dueDate: "2026-05-10",
        paidDate: "2026-07-16",
      },
      {
        status: "paid",
        kind: "expense",
        amount: 125,
        paidAmount: 125,
        dueDate: "2026-05-30",
        paidDate: "2026-05-30",
      },
      { status: "pending", kind: "income", amount: 999, dueDate: "2026-05-15" },
      {
        status: "partial",
        kind: "income",
        amount: 500,
        paidAmount: 175,
        dueDate: "2026-07-10",
        paidDate: "2026-07-18",
      },
    ],
    "2026-07",
  );

  assert.deepEqual(series.find((item) => item.month === "2026-07"), {
    month: "2026-07",
    income: 775,
    expense: 0,
  });
  assert.deepEqual(series.find((item) => item.month === "2026-05"), {
    month: "2026-05",
    income: 0,
    expense: 125,
  });
});

test("não presumir pagamento quando a data não foi informada", () => {
  const entry = {
    status: "paid",
    kind: "income",
    amount: 300,
    dueDate: "2026-05-12",
    paidDate: "",
  };
  assert.equal(cashDateOf(entry), "");
  assert.equal(cashFlowSeries([entry], "2026-07").every((item) => item.income === 0), true);
});
