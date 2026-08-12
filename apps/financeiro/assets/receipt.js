(() => {
  "use strict";

  const UNITS = ["", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove"];
  const TEENS = ["dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
  const TENS = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
  const HUNDREDS = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];

  function underThousand(value) {
    const number = Math.trunc(value);
    if (!number) return "";
    if (number === 100) return "cem";
    const parts = [];
    const hundreds = Math.trunc(number / 100);
    const remainder = number % 100;
    if (hundreds) parts.push(HUNDREDS[hundreds]);
    if (remainder >= 10 && remainder < 20) parts.push(TEENS[remainder - 10]);
    else {
      const tens = Math.trunc(remainder / 10);
      const units = remainder % 10;
      if (tens) parts.push(TENS[tens]);
      if (units) parts.push(UNITS[units]);
    }
    return parts.join(" e ");
  }

  function integerInWords(value) {
    const number = Math.max(0, Math.trunc(value));
    if (!number) return "zero";
    const millions = Math.trunc(number / 1_000_000);
    const thousands = Math.trunc((number % 1_000_000) / 1_000);
    const units = number % 1_000;
    const parts = [];
    if (millions)
      parts.push(millions === 1 ? "um milhão" : `${underThousand(millions)} milhões`);
    if (thousands) parts.push(thousands === 1 ? "mil" : `${underThousand(thousands)} mil`);
    if (units) parts.push(underThousand(units));
    return parts.join(units && (units < 100 || units % 100 === 0) ? " e " : ", ");
  }

  function amountInWords(value) {
    const amount = Math.max(0, Number(value || 0));
    const centsTotal = Math.round(amount * 100);
    const reais = Math.trunc(centsTotal / 100);
    const cents = centsTotal % 100;
    const parts = [];
    if (reais) parts.push(`${integerInWords(reais)} ${reais === 1 ? "real" : "reais"}`);
    if (cents) parts.push(`${integerInWords(cents)} ${cents === 1 ? "centavo" : "centavos"}`);
    return parts.join(" e ") || "zero reais";
  }

  function hexToRgb(value, fallback) {
    const match = String(value || fallback).replace("#", "").match(/^[0-9a-f]{6}$/i);
    const hex = match ? match[0] : fallback.replace("#", "");
    return [0, 2, 4].map((start) => Number.parseInt(hex.slice(start, start + 2), 16));
  }

  function formatDate(value) {
    if (!value) return "";
    const parsed = new Date(`${value}T12:00:00`);
    return Number.isNaN(parsed.getTime())
      ? ""
      : new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long", year: "numeric" }).format(parsed);
  }

  function receiptNumber(entry) {
    const year = String(entry?.paidDate || entry?.createdAt || new Date().getFullYear()).slice(0, 4);
    const suffix = String(entry?.id || "recibo").replace(/[^a-z0-9]/gi, "").slice(-8).toUpperCase();
    return `${year}-${suffix || "RECIBO"}`;
  }

  function safeFileName(value) {
    return String(value || "recibo")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9_-]+/gi, "-")
      .replace(/^-+|-+$/g, "") || "recibo";
  }

  function generate({ entry, paymentAmount, clientName, clientDocument, linkLabel }) {
    const jsPDF = globalThis.jspdf?.jsPDF;
    if (!jsPDF) throw new Error("A biblioteca de PDF do OfficeJur não foi carregada.");
    const config = globalThis.OFFICEJUR_CONFIG || {};
    const office = config.office || {};
    const receipt = config.documents?.receipt || {};
    const colors = config.theme?.colors || {};
    const primary = hexToRgb(colors.primary, "#17213a");
    const accent = hexToRgb(colors.pdfAccent || colors.accent, "#b38731");
    const muted = hexToRgb(colors.pdfMuted || colors.muted, "#7d7d80");
    const issuerName = receipt.issuerName || office.name || "Escritório";
    const issuerDocument = receipt.issuerDocument || "";
    const location = receipt.location || "";
    const number = receiptNumber(entry);
    const amount = Math.max(0, Number(paymentAmount || 0));
    const doc = new jsPDF({ unit: "mm", format: "a5", orientation: "landscape", compress: true });

    doc.setProperties({
      title: `Recibo ${number}`,
      author: issuerName,
      subject: `Quitação de ${entry.description || "pagamento"}`,
      keywords: `OfficeJur, recibo, ${number}`,
    });
    doc.setFillColor(...primary);
    doc.rect(0, 0, 210, 24, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("times", "bold");
    doc.setFontSize(16);
    doc.text("RECIBO DE PAGAMENTO", 12, 10.5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.text(issuerName, 12, 17);
    doc.text(`Nº ${number}`, 198, 12, { align: "right" });

    doc.setTextColor(...primary);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text(amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }), 198, 36, { align: "right" });
    doc.setFontSize(8);
    doc.setTextColor(...muted);
    doc.text(amountInWords(amount).toLocaleUpperCase("pt-BR"), 198, 41, { align: "right", maxWidth: 90 });

    doc.setDrawColor(...accent);
    doc.setLineWidth(0.7);
    doc.line(12, 29, 102, 29);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10.5);
    doc.setTextColor(35, 41, 55);
    const payer = `${clientName || "Pagador não identificado"}${clientDocument ? `, inscrito(a) no CPF/CNPJ sob o nº ${clientDocument}` : ""}`;
    const debt = `${entry.description || "pagamento"}${entry.category ? ` (${entry.category})` : ""}${linkLabel ? `, vinculado a ${linkLabel}` : ""}`;
    const statement = `Recebemos de ${payer} a importância acima indicada, referente a ${debt}, paga por ${entry.method || "forma não informada"}. Pelo presente instrumento, damos quitação exclusivamente do valor recebido.`;
    const lines = doc.splitTextToSize(statement, 186);
    doc.text(lines, 12, 53, { lineHeightFactor: 1.45 });

    const detailsY = 53 + lines.length * 6 + 5;
    doc.setFillColor(245, 247, 250);
    doc.roundedRect(12, detailsY, 186, 19, 2, 2, "F");
    doc.setFontSize(8);
    doc.setTextColor(...muted);
    doc.text("DATA DO PAGAMENTO", 17, detailsY + 6);
    doc.text("FORMA", 76, detailsY + 6);
    doc.text("CONTA", 126, detailsY + 6);
    doc.setFontSize(9.5);
    doc.setTextColor(...primary);
    doc.text(formatDate(entry.paidDate) || "Não informada", 17, detailsY + 13);
    doc.text(entry.method || "Não informada", 76, detailsY + 13);
    doc.text(entry.account || "Não informada", 126, detailsY + 13);

    const signatureY = 118;
    doc.setDrawColor(...muted);
    doc.setLineWidth(0.25);
    doc.line(114, signatureY, 194, signatureY);
    doc.setFontSize(8.5);
    doc.setTextColor(...primary);
    doc.text(receipt.signatureLabel || issuerName, 154, signatureY + 5, { align: "center" });
    if (issuerDocument) {
      doc.setFontSize(7.5);
      doc.setTextColor(...muted);
      doc.text(issuerDocument, 154, signatureY + 9, { align: "center" });
    }
    doc.setFontSize(9);
    doc.setTextColor(...primary);
    doc.text(`${location}${location ? ", " : ""}${formatDate(entry.paidDate)}`, 12, signatureY + 2);
    doc.setFontSize(7);
    doc.setTextColor(...muted);
    doc.text("Este recibo comprova apenas o pagamento indicado e não substitui documento fiscal quando legalmente exigido.", 12, 139);
    return { doc, number };
  }

  function download(options) {
    const { doc, number } = generate(options);
    doc.save(`${safeFileName(`recibo-${number}-${options.clientName}`)}.pdf`);
    return number;
  }

  const api = { amountInWords, download, generate, receiptNumber };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  globalThis.FinanceReceipt = api;
})();
