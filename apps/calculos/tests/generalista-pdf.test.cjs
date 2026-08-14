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

test("PDF identifica a data-base, ordena o polo e omite Taxa Legal em taxa fixa", async () => {
  const previous = global.jspdf;
  global.jspdf = { jsPDF: FakePdf };
  try {
    const pdf = require("../generalista/assets/generalista-pdf.js");
    const record = {
      code: "OJ-TESTE-DATA",
      name: "Cálculo fixo",
      input: {
        type: "complete",
        calculationDate: "2026-02-01",
        clientName: "Cliente de teste",
        clientRole: "Credor",
        caseName: "Caso de teste",
        caseNumber: "0000000-00.0000.0.00.0000",
        parties: [{ name: "Cliente de teste" }, { name: "Parte contrária" }],
        opposingParty: { name: "Parte contrária" },
        items: [{ id: "d1", date: "2026-01-01", amount: 1000, description: "Parcela principal", kind: "debit", correctionType: "INPC", interestType: "fixed", interestRate: 1, interestPeriodicity: "monthly", interestStart: "2026-01-01", interestEnd: "2026-02-01", interestProrata: true }],
        settings: { correctionType: "none" },
      },
      indexSnapshot: {
        ratesByType: { INPC: { "2026-01": 1 } },
        legalRates: { "2026-01": 2 },
        sources: [
          "https://api.bcb.gov.br/dados/serie/bcdata.sgs.188/dados",
          "https://api.bcb.gov.br/dados/serie/bcdata.sgs.11/dados",
          "https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2024/lei/l14905.htm",
        ],
      },
    };
    const file = await pdf.create(record);
    const text = await file.blob.text();
    assert.match(text, /Data-base/);
    assert.doesNotMatch(text, /Trânsito em Julgado ou Data-base do Cálculo/);
    assert.ok(text.indexOf("Polo do cliente") < text.indexOf("Cliente"));
    assert.match(text, /Correção \(%\)/);
    assert.doesNotMatch(text, /Taxa Legal \(% a\.m\.\)/);
    assert.doesNotMatch(text, /l14905|bcdata\.sgs\.11|Taxa Legal:/);
  } finally {
    if (previous === undefined) delete global.jspdf;
    else global.jspdf = previous;
  }
});
