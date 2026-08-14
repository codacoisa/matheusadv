const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../generalista/assets/generalista-core.js");

class FakePdf {
  constructor() { this.pages = [[]]; }
  addPage() { this.pages.push([]); }
  getNumberOfPages() { return this.pages.length; }
  splitTextToSize(value) { return String(value).split("\n"); }
  text(value) { this.pages[this.pages.length - 1].push(Array.isArray(value) ? value.join(" ") : String(value)); }
  output() { return new Blob([this.pages.flat().join("\n")], { type: "application/pdf" }); }
  setFillColor() {}
  setDrawColor() {}
  setTextColor() {}
  setFont() {}
  setFontSize() {}
  roundedRect() {}
  rect() {}
  line() {}
  setPage() {}
  setProperties() {}
}

test("PDF recalcula a metodologia e não reaproveita juros 0% obsoletos", async () => {
  const previous = global.jspdf;
  global.jspdf = { jsPDF: FakePdf };
  try {
    const pdf = require("../generalista/assets/generalista-pdf.js");
    const record = {
      code: "OJ-TESTE",
      name: "Cálculo com juros",
      input: {
        type: "complete",
        calculationDate: "2026-02-15",
        periodStartDate: "2026-01-01",
        items: [{ id: "d1", date: "2026-01-01", amount: 1000, description: "Parcela principal", kind: "debit", correctionType: "none", interestType: "fixed", interestRate: 1, interestPeriodicity: "monthly", interestStart: "2026-01-01", interestEnd: "2026-02-15", interestProrata: true }],
        settings: { correctionType: "none" },
      },
      result: { methodology: { interest: "0% ao mês" }, totals: { total: 0 } },
    };
    const file = await pdf.create(record);
    const text = await file.blob.text();
    assert.match(text, /Juros: Taxa fixa de 1% ao mês/);
    assert.doesNotMatch(text, /Juros: 0% ao mês/);
  } finally {
    if (previous === undefined) delete global.jspdf;
    else global.jspdf = previous;
  }
});
