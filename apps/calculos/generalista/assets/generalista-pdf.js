((root, factory) => {
  const api = factory(root);
  root.OfficeJurGenericPdf = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window, (root) => {
  "use strict";

  const COLORS = Object.freeze({
    navy: [23, 33, 58], green: [22, 128, 93], gold: [193, 139, 45], ink: [32, 41, 58],
    gray: [102, 112, 133], line: [221, 229, 237], soft: [247, 249, 252], mint: [235, 244, 240],
    amber: [255, 250, 235], white: [255, 255, 255],
  });
  const value = (input, fallback = "Não informado") => {
    const text = String(input ?? "").trim();
    return text || fallback;
  };
  const date = (input) => {
    const match = String(input ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
    return match ? `${match[3]}/${match[2]}/${match[1]}` : "Não informado";
  };
  const instant = (input) => {
    const parsed = input ? new Date(input) : new Date();
    return Number.isNaN(parsed.getTime()) ? "Não informado" : parsed.toLocaleDateString("pt-BR");
  };
  const number = (input) => Number(input || 0);
  const safeName = (input) => value(input, "atualizacao-monetaria")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase();

  function createCurrency(core) {
    return (input) => core?.currency ? core.currency(number(input)) : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(number(input));
  }

  const itemInterestType = (item = {}, settings = {}) => item.interestType || settings.interestType || (Number(item.interestRate) ? "fixed" : "none");
  const legalInterestSelected = (input = {}) => (input.items || []).some((item) => itemInterestType(item, input.settings) === "legal");
  const legalSource = (source) => /bcdata\.sgs\.11\/dados|l14905|Resolu%C3%A7%C3%A3o5171|d12797|Taxa Legal:/i.test(String(source));
  const withPeriod = (input, fallback) => {
    const text = String(input || fallback || "").trim();
    return /[.!?]$/.test(text) ? text : `${text}.`;
  };

  function sourceList(record, input) {
    const sources = new Set(record.indexSnapshot?.sources || input.sources || []);
    const legalSelected = legalInterestSelected(input);
    if (!legalSelected) [...sources].filter(legalSource).forEach((source) => sources.delete(source));
    const correctionTypes = new Set([
      ...(input.items || []).map((item) => item.correctionType),
      ...(input.costs || []).map((item) => item.correctionType),
    ].filter((type) => type && type !== "none"));
    correctionTypes.forEach((type) => sources.add(`Índice de correção selecionado: ${type}.`));
    if (legalSelected) sources.add("Taxa Legal: Lei 14.905/2024 e Resolução CMN 5.171/2024.");
    return [...sources];
  }

  async function create(record = {}) {
    const jsPDF = root.jspdf?.jsPDF;
    const core = root.OfficeJurGenericCalculations;
    if (!jsPDF) throw new Error("A biblioteca de PDF do OfficeJur não foi carregada.");
    if (!core?.calculateGeneric) throw new Error("O motor da calculadora generalista não foi carregado.");

    const input = record.input || {};
    const calculationInput = {
      ...input,
      ratesByType: record.indexSnapshot?.ratesByType || input.ratesByType || {},
      legalRates: record.indexSnapshot?.legalRates || input.legalRates || {},
    };
    const result = core.calculateGeneric(calculationInput);
    const currency = createCurrency(core);
    const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
    const margin = 16;
    const width = 178;
    const bottom = 278;
    let y = 18;
    const addPage = () => { doc.addPage(); y = 20; };
    const ensure = (height) => { if (y + height <= bottom) return false; addPage(); return true; };
    const textLines = (content, maxWidth, size) => { doc.setFontSize(size); return doc.splitTextToSize(value(content), maxWidth); };
    const lineHeight = (size) => size * 0.46;
    const section = (title, subtitle = "") => {
      const lines = subtitle ? textLines(subtitle, width - 8, 8.5) : [];
      const height = subtitle ? Math.max(18, 11 + lines.length * 3.9) : 13;
      if (y > 25) y += 5;
      ensure(height);
      doc.setFillColor(...COLORS.green); doc.roundedRect(margin, y, 3, height - 4, 1.5, 1.5, "F");
      doc.setTextColor(...COLORS.navy); doc.setFont("helvetica", "bold"); doc.setFontSize(14); doc.text(title, margin + 7, y + 5);
      if (subtitle) { doc.setTextColor(...COLORS.gray); doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.text(lines, margin + 7, y + 10); }
      y += height;
    };
    const paragraph = (content, options = {}) => {
      const size = options.size || 8.8;
      const lines = textLines(content, options.width || width, size);
      ensure(lines.length * lineHeight(size) + (options.after ?? 4));
      doc.setTextColor(...(options.color || COLORS.ink)); doc.setFont("helvetica", options.bold ? "bold" : "normal"); doc.setFontSize(size);
      doc.text(lines, options.x || margin, y, options.align ? { align: options.align, maxWidth: options.width || width } : undefined);
      y += lines.length * lineHeight(size) + (options.after ?? 4);
    };
    const cellLines = (cell, maxWidth, size, preserveEmpty = false) => preserveEmpty && !String(cell ?? "").trim() ? [""] : textLines(cell, maxWidth, size);
    const rowHeight = (cells, widths, size = 7.5, paddingY = 3.2, preserveEmpty = false) => {
      const lines = cells.map((cell, index) => cellLines(cell, widths[index] - 5, size, preserveEmpty));
      return Math.max(...lines.map((item) => item.length)) * 3.45 + paddingY * 2;
    };
    const row = (cells, widths, options = {}) => {
      const size = options.fontSize || 7.5;
      const paddingX = 2.5;
      const paddingY = 3.2;
      const lines = cells.map((cell, index) => cellLines(cell, widths[index] - paddingX * 2, size, options.preserveEmpty));
      const height = Math.max(...lines.map((item) => item.length)) * 3.45 + paddingY * 2;
      if (options.fill) { doc.setFillColor(...options.fill); doc.rect(margin, y, width, height, "F"); }
      doc.setDrawColor(...COLORS.line); doc.line(margin, y + height, margin + width, y + height);
      let x = margin;
      lines.forEach((linesForCell, index) => { doc.setTextColor(...(options.color || COLORS.ink)); doc.setFont("helvetica", options.bold ? "bold" : "normal"); doc.setFontSize(size); doc.text(linesForCell, x + paddingX, y + paddingY + 2.15); x += widths[index]; });
      y += height;
    };
    const table = (headers, widths, rows, total = null, options = {}) => {
      const header = () => row(headers, widths, { bold: true, fill: COLORS.navy, color: COLORS.white, fontSize: 7.1 });
      ensure(13); header();
      rows.forEach((cells, index) => { const height = rowHeight(cells, widths, options.fontSize || 7.5, 3.2, true); if (ensure(height)) header(); row(cells, widths, { fill: index % 2 ? COLORS.soft : COLORS.white, fontSize: options.fontSize, preserveEmpty: true }); });
      if (total) { const height = rowHeight(total, widths, options.fontSize || 7.5, 3.2, true); if (ensure(height)) header(); row(total, widths, { bold: true, fill: COLORS.mint, color: COLORS.navy, fontSize: options.fontSize, preserveEmpty: true }); }
      y += 2;
    };
    const infoGrid = (items) => {
      const widths = [25, 64, 25, 64];
      for (let index = 0; index < items.length; index += 2) {
        const right = items[index + 1] || ["", ""];
        const cells = [items[index][0], items[index][1], right[0], right[1]];
        ensure(rowHeight(cells, widths, 7.7));
        row(cells, widths, { fill: index % 4 ? COLORS.white : COLORS.soft, fontSize: 7.7 });
      }
      y += 2;
    };
    const summary = () => {
      const cards = [["Original", result.totals?.original], ["Correção", result.totals?.correction], ["Juros", result.totals?.interest], ["Multa", result.totals?.penalty], ["Honorários", result.totals?.fees], ["Total atualizado", result.totals?.total]];
      const cardWidth = 56; const gap = 5;
      ensure(65);
      cards.forEach(([label, amount], index) => { if (index === 3) y += 23; const x = margin + (index % 3) * (cardWidth + gap); const total = index === cards.length - 1; doc.setFillColor(...(total ? COLORS.navy : COLORS.soft)); doc.roundedRect(x, y, cardWidth, 18, 2, 2, "F"); doc.setTextColor(...(total ? COLORS.white : COLORS.gray)); doc.setFont("helvetica", "normal"); doc.setFontSize(7.1); doc.text(label.toUpperCase(), x + 4, y + 6); doc.setTextColor(...(total ? COLORS.white : COLORS.navy)); doc.setFont("helvetica", "bold"); doc.setFontSize(10.1); doc.text(currency(amount), x + 4, y + 13); });
      y += 24;
    };

    doc.setFillColor(...COLORS.navy); doc.rect(0, 0, 210, 52, "F"); doc.setFillColor(...COLORS.gold); doc.rect(0, 0, 5, 52, "F");
    doc.setTextColor(...COLORS.white); doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.text("OFFICEJUR", margin, 16); doc.setFontSize(20); doc.text(input.type === "easy" ? "Atualização monetária simples" : "Atualização monetária completa", margin, 29);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8.4); doc.text(`Código ${value(record.code, "sem código")} | versão ${value(result.calculationVersion || record.calculationVersion, "generic-1.2.0")}`, margin, 39); doc.text(`Emitido em ${instant(record.updatedAt)}`, margin, 45);
    y = 62;

    section("Identificação do cálculo");
    infoGrid([
      ["Nome", record.name], ["Data-base", date(input.calculationDate)],
      ["Polo do cliente", input.clientRole || input.clientPartyRole], ["Cliente", input.clientName || input.clientId],
      ["Caso", value(input.caseName || input.caseId, "Não vinculado")], ["Processo", input.caseNumber],
      ["Partes", `${input.parties?.length || 0} cadastrada(s)`], ["Parte contrária", input.opposingParty?.name],
    ]);
    section("Resumo financeiro", "Consolidação em reais na data-base informada.");
    summary();
    section("Parâmetros e metodologia");
    const corrections = [...new Set([...(input.items || []), ...(input.costs || [])].map((item) => item.correctionType).filter((type) => type && type !== "none"))];
    paragraph(`Índices de correção: ${corrections.length ? corrections.join(", ") : "não aplicados"}. ${withPeriod(result.methodology?.correctionConvention, "Índices aplicados conforme os lançamentos.")}`, { align: "justify" });
    paragraph(`Juros: ${withPeriod(result.methodology?.interest, "não aplicados")} ${withPeriod(result.methodology?.interestConvention, "Juros conforme os parâmetros informados.")}`, { align: "justify" });
    const unavailableMonths = Object.entries(record.indexSnapshot?.unavailableMonthsByType || {}).flatMap(([type, months]) => (months || []).map((key) => `${type}: ${key}`));
    if (unavailableMonths.length) paragraph(`Competência(s) ainda sem publicação oficial no BACEN: ${unavailableMonths.join(", ")}. A fração corrente foi mantida sem correção até a divulgação do índice.`, { color: COLORS.gold, bold: true, align: "justify" });
    paragraph("Os termos iniciais, índices, encargos e demais premissas devem ser conferidos com o título e pelo profissional responsável antes do uso judicial.", { color: COLORS.ink, align: "justify" });

    addPage();
    section("Memória por lançamento", "Valores negativos representam pagamentos ou abatimentos.");
    const ledger = result.ledger || [];
    table(["Data", "Lançamento", "Tipo", "Original", "Corrigido", "Juros", "Total"], [20, 40, 22, 24, 24, 25, 23], ledger.map((item) => [date(item.date), value(item.description), item.sign < 0 ? "Abatimento" : item.kind === "cost" ? "Custas" : "Débito", currency(item.original), currency(item.corrected), currency(item.interest), currency(item.total)]), ["", "TOTAL", "", currency(result.totals?.original), currency(result.totals?.corrected), currency(result.totals?.interest), currency(result.totals?.total)], { fontSize: 7.1 });
    if ((result.penaltyRows || []).length || (result.feeRows || []).length) {
      section("Encargos adicionais");
      table(["Descrição", "Tipo", "Valor"], [90, 43, 45], [...(result.penaltyRows || []).map((item) => [item.description, "Multa", currency(item.amount)]), ...(result.feeRows || []).map((item) => [item.description, "Honorários", currency(item.amount)])]);
    }

    addPage();
    section("Séries e fontes declaradas", "Referências preservadas com o cálculo para auditoria.");
    const snapshot = record.indexSnapshot || {};
    paragraph(`Séries capturadas em ${snapshot.fetchedAt ? new Date(snapshot.fetchedAt).toLocaleString("pt-BR") : "data não registrada"}.`, { size: 8.4 });
    const rates = new Map();
    Object.entries(snapshot.ratesByType || {}).forEach(([type, values]) => Object.entries(values || {}).forEach(([month, rate]) => rates.set(month, { ...(rates.get(month) || {}), correction: `${type}: ${rate}` })));
    const legalSelected = legalInterestSelected(input);
    const legalRates = legalSelected ? snapshot.legalRates || {} : {};
    Object.entries(legalRates).forEach(([month, rate]) => rates.set(month, { ...(rates.get(month) || {}), legal: rate }));
    const hasCorrectionSeries = [...rates.values()].some((item) => item.correction !== undefined);
    const hasLegalSeries = Object.keys(legalRates).length > 0;
    if (rates.size && hasCorrectionSeries && hasLegalSeries) table(["Competência", "Correção (%)", "Taxa Legal (% a.m.)"], [50, 64, 64], [...rates].sort().map(([month, values]) => [month, values.correction ?? "—", values.legal ?? "—"]));
    else if (rates.size && hasCorrectionSeries) table(["Competência", "Correção (%)"], [55, 123], [...rates].sort().map(([month, values]) => [month, values.correction ?? "—"]));
    else if (rates.size && hasLegalSeries) table(["Competência", "Taxa Legal (% a.m.)"], [55, 123], [...rates].sort().map(([month, values]) => [month, values.legal ?? "—"]));
    else paragraph("Nenhuma série econômica externa foi aplicada neste cálculo.", { size: 8.4 });
    section("Fontes declaradas");
    const sources = sourceList(record, input);
    if (sources.length) sources.forEach((source, index) => paragraph(`${index + 1}. ${source}`, { size: 7.7, after: 3 }));
    else paragraph("Nenhuma fonte externa foi necessária para os parâmetros informados.", { size: 8.4 });

    const pages = doc.getNumberOfPages();
    for (let page = 1; page <= pages; page += 1) { doc.setPage(page); doc.setDrawColor(...COLORS.line); doc.line(margin, 286, margin + width, 286); doc.setTextColor(...COLORS.gray); doc.setFont("helvetica", "normal"); doc.setFontSize(6.8); doc.text(`OfficeJur | ${value(record.code, "sem código")} | versão ${value(result.calculationVersion || record.calculationVersion, "generic-1.2.0")}`, margin, 291); doc.text(`Página ${page} de ${pages}`, 194, 291, { align: "right" }); }
    doc.setProperties({ title: `Atualização monetária - ${value(record.name, "OfficeJur")}`, subject: `OfficeJur ${value(record.code, "cálculo")}`, author: "OfficeJur", creator: "OfficeJur Cálculos Jurídicos", keywords: "atualização monetária, cálculo jurídico, memória de cálculo" });
    return { blob: doc.output("blob"), filename: `${value(record.code, "calculo")}-${safeName(record.name)}.pdf` };
  }

  function download(file) {
    const url = URL.createObjectURL(file.blob);
    const link = document.createElement("a");
    link.href = url; link.download = file.filename; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 2_000);
  }

  return { create, download };
});
