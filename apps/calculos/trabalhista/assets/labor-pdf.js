((root, factory) => {
  const api = factory(root);
  root.OfficeJurLaborPdf = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window, (root) => {
  "use strict";

  const COLORS = Object.freeze({
    navy: [23, 33, 58],
    green: [22, 128, 93],
    gold: [193, 139, 45],
    ink: [32, 41, 58],
    gray: [102, 112, 133],
    line: [221, 229, 237],
    soft: [247, 249, 252],
    mint: [235, 244, 240],
    amber: [255, 250, 235],
    white: [255, 255, 255],
  });

  const STATUS = Object.freeze({ paid: "Pago", unpaid: "Não pago", partial: "Parcial" });
  const value = (input, fallback = "Não informado") => {
    const result = String(input ?? "").trim();
    return result || fallback;
  };
  const date = (input) => {
    const match = String(input ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
    return match ? `${match[3]}/${match[2]}/${match[1]}` : "Não informado";
  };
  const instant = (input) => {
    if (!input) return "Não informado";
    const parsed = new Date(input);
    return Number.isNaN(parsed.getTime()) ? "Não informado" : parsed.toLocaleDateString("pt-BR");
  };
  const safeName = (input) => value(input, "calculo-trabalhista")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase();
  const number = (input) => Number(input || 0);

  function createCurrency(core) {
    return (input) => {
      if (core?.currency) return core.currency(number(input));
      return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(number(input));
    };
  }

  function sourceList(record, input, result) {
    const sources = new Set([
      ...(record.indexSnapshot?.sources || []),
      ...(input.sources || []),
      ...(result?.sources || []),
    ]);
    if (input.settings?.correctionType && input.settings.correctionType !== "none")
      sources.add(`Índice de correção selecionado: ${input.settings.correctionType}.`);
    if (input.settings?.interestType === "legal")
      sources.add("Taxa legal: Lei 14.905/2024 e Resolução CMN 5.171/2024.");
    if (input.settings?.interestType === "fixed")
      sources.add(`Juros fixos informados: ${input.settings.fixedMonthlyRate || 0}% ao mês.`);
    return [...sources];
  }

  async function create(record = {}) {
    const jsPDF = root.jspdf?.jsPDF;
    const core = root.OfficeJurCalculations;
    const labor = root.OfficeJurLaborCalculations;
    if (!jsPDF) throw new Error("A biblioteca de PDF do OfficeJur não foi carregada.");
    if (!labor?.calculateLabor) throw new Error("O motor de cálculos trabalhistas não foi carregado.");

    const input = record.input || {};
    const result = record.result || labor.calculateLabor(input);
    const currency = createCurrency(core);
    const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
    const margin = 16;
    const width = 178;
    const bottom = 278;
    let y = 18;

    const addPage = () => {
      doc.addPage();
      y = 20;
    };
    const ensure = (height) => {
      if (y + height <= bottom) return false;
      addPage();
      return true;
    };
    const lineHeight = (size) => size * 0.46;
    const textLines = (content, maxWidth, size) => {
      doc.setFontSize(size);
      return doc.splitTextToSize(value(content), maxWidth);
    };
    const drawSection = (title, subtitle = "") => {
      const lines = subtitle ? textLines(subtitle, width - 8, 8.5) : [];
      const height = subtitle ? Math.max(18, 11 + lines.length * 3.9) : 13;
      if (y > 25) y += 5;
      ensure(height);
      doc.setFillColor(...COLORS.green);
      doc.roundedRect(margin, y, 3, height - 4, 1.5, 1.5, "F");
      doc.setTextColor(...COLORS.navy);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.text(title, margin + 7, y + 5);
      if (subtitle) {
        doc.setTextColor(...COLORS.gray);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8.5);
        doc.text(lines, margin + 7, y + 10);
      }
      y += height;
    };
    const drawParagraph = (content, options = {}) => {
      const size = options.size || 8.8;
      const x = options.x || margin;
      const maxWidth = options.width || width;
      const lines = textLines(content, maxWidth, size);
      const height = lines.length * lineHeight(size);
      ensure(height + (options.after ?? 4));
      doc.setTextColor(...(options.color || COLORS.ink));
      doc.setFont("helvetica", options.bold ? "bold" : "normal");
      doc.setFontSize(size);
      doc.text(lines, x, y);
      y += height + (options.after ?? 4);
    };
    const rowHeight = (cells, widths, size = 7.5, paddingY = 3.2) => {
      const lines = cells.map((cell, index) => textLines(cell, widths[index] - 5, size));
      return Math.max(...lines.map((item) => item.length)) * 3.45 + paddingY * 2;
    };
    const drawRow = (cells, widths, options = {}) => {
      const size = options.fontSize || 7.5;
      const paddingX = 2.5;
      const paddingY = 3.2;
      const lines = cells.map((cell, index) => textLines(cell, widths[index] - paddingX * 2, size));
      const height = Math.max(...lines.map((item) => item.length)) * 3.45 + paddingY * 2;
      if (options.fill) {
        doc.setFillColor(...options.fill);
        doc.rect(margin, y, width, height, "F");
      }
      doc.setDrawColor(...COLORS.line);
      doc.line(margin, y + height, margin + width, y + height);
      let x = margin;
      lines.forEach((entry, index) => {
        doc.setTextColor(...(options.color || COLORS.ink));
        doc.setFont("helvetica", options.bold ? "bold" : "normal");
        doc.setFontSize(size);
        doc.text(entry, x + paddingX, y + paddingY + 2.15);
        x += widths[index];
      });
      y += height;
      return height;
    };
    const drawTable = (headers, widths, rows, total = null) => {
      const header = () => drawRow(headers, widths, {
        bold: true, fill: COLORS.navy, color: COLORS.white, fontSize: 7.1,
      });
      ensure(13);
      header();
      rows.forEach((cells, index) => {
        const height = rowHeight(cells, widths);
        if (ensure(height)) header();
        drawRow(cells, widths, { fill: index % 2 ? COLORS.soft : COLORS.white });
      });
      if (total) {
        const height = rowHeight(total, widths);
        if (ensure(height)) header();
        drawRow(total, widths, { bold: true, fill: COLORS.mint, color: COLORS.navy });
      }
      y += 2;
    };
    const infoGrid = (items) => {
      const widths = [25, 64, 25, 64];
      for (let index = 0; index < items.length; index += 2) {
        const right = items[index + 1] || ["", ""];
        const cells = [items[index][0], items[index][1], right[0], right[1]];
        const height = rowHeight(cells, widths, 7.7);
        ensure(height);
        drawRow(cells, widths, { fill: index % 4 ? COLORS.white : COLORS.soft, fontSize: 7.7 });
      }
      y += 2;
    };
    const summaryCards = () => {
      const cards = [
        ["Principal", result.totals?.original], ["Correção", result.totals?.correction], ["Juros", result.totals?.interest],
        ["Multa", result.totals?.penalty], ["Honorários", result.totals?.fees], ["Total atualizado", result.totals?.total],
      ];
      const cardWidth = 56;
      const gap = 5;
      ensure(65);
      cards.forEach(([label, amount], index) => {
        if (index === 3) y += 23;
        const x = margin + (index % 3) * (cardWidth + gap);
        const total = index === cards.length - 1;
        doc.setFillColor(...(total ? COLORS.navy : COLORS.soft));
        doc.roundedRect(x, y, cardWidth, 18, 2, 2, "F");
        doc.setTextColor(...(total ? COLORS.white : COLORS.gray));
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.1);
        doc.text(label.toUpperCase(), x + 4, y + 6);
        doc.setTextColor(...(total ? COLORS.white : COLORS.navy));
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10.1);
        doc.text(currency(amount), x + 4, y + 13);
      });
      y += 24;
    };

    doc.setFillColor(...COLORS.navy);
    doc.rect(0, 0, 210, 52, "F");
    doc.setFillColor(...COLORS.gold);
    doc.rect(0, 0, 5, 52, "F");
    doc.setTextColor(...COLORS.white);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("OFFICEJUR", margin, 16);
    doc.setFontSize(20);
    doc.text("Memória de cálculo trabalhista", margin, 29);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.4);
    doc.text(`Código ${value(record.code, "sem código")} | versão ${value(record.calculationVersion || result.calculationVersion, "labor-1.0.0")}`, margin, 39);
    doc.text(`Emitido em ${instant(record.updatedAt || new Date().toISOString())}`, margin, 45);
    y = 62;

    const employment = input.employment || {};
    const partyByRole = role => value(input.clientParty?.role === role ? input.clientParty.name : input.opposingParty?.role === role ? input.opposingParty.name : input.parties?.find?.((party) => party.role === role)?.name);
    drawSection("Identificação do cálculo");
    infoGrid([
      ["Nome", value(record.name || input.name)],
      ["Data-base", date(input.calculationDate)],
      ["Reclamante", partyByRole("Reclamante")],
      ["Reclamada", partyByRole("Reclamada")],
      ["Cliente", value(input.clientName || input.clientId)],
      ["Caso", value(input.caseName || input.caseId, "Não vinculado")],
      ["Cargo", value(input.role || input.position)],
      ["Processo", value(input.caseNumber)],
      ["Admissão", date(input.admissionDate || employment.admissionDate || input.startDate)],
      ["Desligamento", input.active ? "Vínculo ativo" : date(input.terminationDate || employment.terminationDate || input.endDate)],
    ]);

    drawSection("Resumo financeiro", "Consolidação na data-base do cálculo. Os valores dependem das premissas e rubricas registradas.");
    summaryCards();

    drawSection("Totais por verba", "A coluna atualizada inclui a atualização econômica aplicável a cada lançamento.");
    const claimTotals = result.claimTotals || [];
    if (claimTotals.length) {
      drawTable(
        ["Verba", "Original", "Pago", "Saldo", "Atualizado"],
        [58, 30, 30, 30, 30],
        claimTotals.map((item) => [
          value(item.label || item.type), currency(item.original), currency(item.paid), currency(item.outstanding), currency(item.updated),
        ]),
        ["TOTAL", currency(result.totals?.original), "", "", currency(result.totals?.total)],
      );
    } else {
      drawParagraph("Não foram encontradas rubricas consolidadas para este cálculo.");
    }

    drawSection("Premissas e metodologia");
    drawParagraph(result.methodology?.labor || "Cada rubrica é registrada na competência de vencimento e atualizada até a data-base selecionada.");
    drawParagraph(result.methodology?.status || "Rubricas pagas ou parcialmente pagas recebem os abatimentos declarados.");
    drawParagraph(result.methodology?.thirteenth || "O 13º salário é calculado pelos avos informados ou pelo período de vínculo.");
    drawParagraph(result.methodology?.vacation || "Férias e adicionais respeitam as premissas definidas na rubrica.");
    drawParagraph(result.methodology?.hourly || "As verbas por hora utilizam salário-base, divisor, quantidade e adicional informados.");
    ensure(24);
    doc.setFillColor(...COLORS.amber);
    doc.setDrawColor(234, 199, 123);
    doc.roundedRect(margin, y, width, 20, 2, 2, "FD");
    const legalReview = result.methodology?.legalReview || "Percentuais, bases, incidências, reflexos, multas e critérios do título devem ser revisados pelo profissional responsável antes do uso judicial.";
    doc.setTextColor(...COLORS.ink);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(textLines(`Nota técnica: ${legalReview}`, width - 10, 8), margin + 5, y + 7);
    y += 24;

    addPage();
    drawSection("Memória por lançamento", "Parcelas positivas representam valores devidos; lançamentos negativos representam pagamentos ou abatimentos.");
    const ledger = result.ledger || [];
    drawTable(
      ["Vencimento", "Rubrica", "Descrição", "Original", "Correção", "Juros", "Total"],
      [23, 27, 43, 25, 20, 20, 20],
      ledger.map((item) => [
        date(item.date), value(item.claimType && labor.TYPES?.[item.claimType], item.claimType || "Lançamento"), value(item.description),
        currency(item.original), currency((item.corrected || 0) - (item.original || 0)), currency(item.interest), currency(item.total),
      ]),
      ["", "", "TOTAL", currency(result.totals?.original), currency(result.totals?.correction), currency(result.totals?.interest), currency(result.totals?.total)],
    );

    addPage();
    drawSection("Fontes e séries declaradas", "Referências registradas com o cálculo para dar contexto às premissas econômicas aplicadas.");
    const snapshot = record.indexSnapshot || {};
    drawParagraph(`Séries capturadas em ${snapshot.fetchedAt ? new Date(snapshot.fetchedAt).toLocaleString("pt-BR") : "data não registrada"}.`, { size: 8.4 });
    const rates = new Map();
    Object.entries(snapshot.correctionRates || {}).forEach(([key, amount]) => rates.set(key, { ...(rates.get(key) || {}), correction: amount }));
    Object.entries(snapshot.legalRates || {}).forEach(([key, amount]) => rates.set(key, { ...(rates.get(key) || {}), legal: amount }));
    if (rates.size) {
      drawTable(
        ["Competência", "Correção (%)", "Taxa legal (% a.m.)"], [52, 63, 63],
        [...rates].sort(([left], [right]) => left.localeCompare(right)).map(([key, ratesForMonth]) => [key, ratesForMonth.correction ?? "-", ratesForMonth.legal ?? "-"]),
      );
    } else {
      drawParagraph("Nenhuma série econômica externa foi aplicada neste cálculo.", { size: 8.4 });
    }
    drawSection("Fontes declaradas");
    const sources = sourceList(record, input, result);
    if (sources.length) sources.forEach((source, index) => drawParagraph(`${index + 1}. ${source}`, { size: 7.7, after: 3 }));
    else drawParagraph("Nenhuma fonte externa foi necessária para os parâmetros informados.", { size: 8.4 });

    const pages = doc.getNumberOfPages();
    for (let page = 1; page <= pages; page += 1) {
      doc.setPage(page);
      doc.setDrawColor(...COLORS.line);
      doc.line(margin, 286, margin + width, 286);
      doc.setTextColor(...COLORS.gray);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.8);
      doc.text(`OfficeJur | ${value(record.code, "sem código")} | versão ${value(record.calculationVersion || result.calculationVersion, "labor-1.0.0")}`, margin, 291);
      doc.text(`Página ${page} de ${pages}`, 194, 291, { align: "right" });
    }
    doc.setProperties({
      title: `Cálculo trabalhista - ${value(record.name, "OfficeJur")}`,
      subject: `OfficeJur ${value(record.code, "cálculo trabalhista")}`,
      author: "OfficeJur",
      creator: "OfficeJur Cálculos Jurídicos",
      keywords: "trabalhista, cálculo jurídico, memória de cálculo",
    });
    return {
      blob: doc.output("blob"),
      filename: `${value(record.code, "calculo")}-${safeName(record.name || "trabalhista")}.pdf`,
    };
  }

  function download(file) {
    const url = URL.createObjectURL(file.blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = file.filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 2_000);
  }

  return { create, download };
});
