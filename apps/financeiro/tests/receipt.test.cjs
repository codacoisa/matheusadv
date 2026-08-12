const test = require("node:test");
const assert = require("node:assert/strict");

const { amountInWords, receiptNumber } = require("../assets/receipt.js");

test("escrever valores de recibo por extenso em português", () => {
  assert.equal(amountInWords(1), "um real");
  assert.equal(amountInWords(1250.75), "mil, duzentos e cinquenta reais e setenta e cinco centavos");
  assert.equal(amountInWords(0.01), "um centavo");
});

test("manter numeração estável por lançamento", () => {
  const entry = { id: "entry-abc12345", paidDate: "2026-08-11" };
  assert.equal(receiptNumber(entry), "2026-ABC12345");
  assert.equal(receiptNumber(entry), "2026-ABC12345");
});
