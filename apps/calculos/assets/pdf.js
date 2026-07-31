((root, factory) => {
  root.OfficeJurCalculationPdf = factory();
})(typeof globalThis !== "undefined" ? globalThis : window, () => {
  "use strict";

  const fmtDate = (value) => value ? value.split("-").reverse().join("/") : "—";
  const fmtInstantDate = (value) => value ? new Date(value).toLocaleDateString("pt-BR") : "—";
  const text = (value) => String(value ?? "—");
  const pensionVersion = (value) => {
    const version = String(value || "pension-1.0.0");
    return /^\d/.test(version) ? `pension-${version}` : version;
  };

  async function create(record) {
    const { jsPDF } = window.jspdf;
    const core = window.OfficeJurCalculations;
    const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
    const result = record.result || core.calculatePension(record.input);
    const colors = {
      navy: [23, 33, 58],
      green: [22, 128, 93],
      gold: [193, 139, 45],
      ink: [32, 41, 58],
      gray: [102, 112, 133],
      line: [221, 229, 237],
      soft: [247, 249, 252],
      white: [255, 255, 255],
    };
    const margin = 16;
    const contentWidth = 178;
    const pageBottom = 278;
    let y = 18;

    const addPage = () => {
      doc.addPage();
      y = 20;
    };

    const ensure = (height) => {
      if (y + height <= pageBottom) return false;
      addPage();
      return true;
    };

    const section = (title, subtitle = "") => {
      const blockHeight = subtitle ? 20 : 15;
      if (y > 24) y += 5;
      ensure(blockHeight);
      doc.setFillColor(...colors.green);
      doc.roundedRect(margin, y, 3, subtitle ? 13 : 9, 1.5, 1.5, "F");
      doc.setTextColor(...colors.navy);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.text(title, margin + 7, y + 5);
      if (subtitle) {
        doc.setTextColor(...colors.gray);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8.5);
        doc.text(doc.splitTextToSize(subtitle, contentWidth - 7), margin + 7, y + 10);
      }
      y += subtitle ? 18 : 13;
    };

    const paragraph = (value, size = 9, options = {}) => {
      doc.setTextColor(...(options.color || colors.ink));
      doc.setFont("helvetica", options.bold ? "bold" : "normal");
      doc.setFontSize(size);
      const lines = doc.splitTextToSize(text(value), options.width || contentWidth);
      const lineHeight = size * .46;
      ensure(lines.length * lineHeight + 4);
      doc.text(lines, options.x || margin, y);
      y += lines.length * lineHeight + (options.after ?? 4);
    };

    const drawRow = (cells, widths, options = {}) => {
      const paddingX = 2.5;
      const paddingY = 3.3;
      doc.setFont("helvetica", options.bold ? "bold" : "normal");
      doc.setFontSize(options.fontSize || 7.4);
      const lines = cells.map((cell, index) => doc.splitTextToSize(text(cell), widths[index] - paddingX * 2));
      const height = Math.max(...lines.map((item) => item.length)) * 3.45 + paddingY * 2;
      if (options.fill) {
        doc.setFillColor(...options.fill);
        doc.rect(margin, y, contentWidth, height, "F");
      }
      doc.setDrawColor(...colors.line);
      doc.line(margin, y + height, margin + contentWidth, y + height);
      let x = margin;
      cells.forEach((cell, index) => {
        doc.setTextColor(...(options.color || colors.ink));
        doc.text(lines[index], x + paddingX, y + paddingY + 2.2);
        x += widths[index];
      });
      y += height;
    };

    const table = (headers, widths, rows, totalRow = null) => {
      const drawHeader = () => drawRow(headers, widths, {
        bold: true,
        fill: colors.navy,
        color: colors.white,
        fontSize: 7.2,
      });
      ensure(14);
      drawHeader();
      rows.forEach((cells, index) => {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.4);
        const estimatedLines = cells.map((cell, cellIndex) => doc.splitTextToSize(text(cell), widths[cellIndex] - 5).length);
        const estimatedHeight = Math.max(...estimatedLines) * 3.45 + 6.6;
        if (ensure(estimatedHeight)) drawHeader();
        drawRow(cells, widths, { fill: index % 2 ? colors.soft : colors.white });
      });
      if (totalRow) {
        if (ensure(11)) drawHeader();
        drawRow(totalRow, widths, { bold: true, fill: [235, 244, 240], color: colors.navy });
      }
      y += 2;
    };

    const infoGrid = (items) => {
      const widths = [27, 62, 27, 62];
      for (let index = 0; index < items.length; index += 2) {
        const left = items[index];
        const right = items[index + 1] || ["", ""];
        ensure(12);
        drawRow([left[0], left[1], right[0], right[1]], widths, {
          fill: index % 4 ? colors.white : colors.soft,
          fontSize: 8,
        });
      }
      y += 2;
    };

    doc.setFillColor(...colors.navy);
    doc.rect(0, 0, 210, 52, "F");
    doc.setFillColor(...colors.gold);
    doc.rect(0, 0, 5, 52, "F");
    doc.setTextColor(...colors.white);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("OFFICEJUR", margin, 16);
    doc.setFontSize(21);
    doc.text("Demonstrativo de pensão alimentícia", margin, 29);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.text(`Código ${record.code}  •  versão ${pensionVersion(record.calculationVersion || result.calculationVersion)}`, margin, 39);
    doc.text(`Atualizado em ${fmtInstantDate(record.updatedAt)}`, margin, 45);
    y = 62;

    section("Identificação do cálculo");
    infoGrid([
      ["Nome", record.name],
      ["Data-base", fmtDate(record.input.calculationDate)],
      ["Exequente", record.input.creditor || "Não informado"],
      ["Executado", record.input.debtor || "Não informado"],
      ["Processo", record.input.caseNumber || "Não informado"],
      ["Período", `${fmtDate(record.input.startDate)} a ${fmtDate(record.input.endDate)}`],
    ]);

    section("Resumo financeiro", "Valores consolidados em reais na data-base indicada.");
    const summary = [
      ["Principal", result.totals.original],
      ["Correção", result.totals.correction],
      ["Juros", result.totals.interest],
      ["Multa", result.totals.penalty],
      ["Honorários", result.totals.fees],
      ["Total", result.totals.total],
    ];
    const cardWidth = 56;
    const cardGap = 5;
    summary.forEach(([label, value], index) => {
      if (index === 3) y += 23;
      const column = index % 3;
      const cardX = margin + column * (cardWidth + cardGap);
      const isTotal = label === "Total";
      doc.setFillColor(...(isTotal ? colors.navy : colors.soft));
      doc.roundedRect(cardX, y, cardWidth, 18, 2, 2, "F");
      doc.setTextColor(...(isTotal ? colors.white : colors.gray));
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.2);
      doc.text(label.toUpperCase(), cardX + 4, y + 6);
      doc.setTextColor(...(isTotal ? colors.white : colors.navy));
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10.5);
      doc.text(core.currency(value), cardX + 4, y + 13);
    });
    y += 24;

    section("Parâmetros e metodologia");
    paragraph(`Base da pensão: ${record.input.basisLabel}. 13º: ${record.input.includeThirteenth ? "incluído" : "não incluído"}.`);
    const correctionLabel = record.input.settings.correctionType === "none" ? "sem correção" : record.input.settings.correctionType;
    paragraph(`Correção monetária: ${correctionLabel}. ${result.methodology.correctionConvention}`);
    paragraph(`Juros: ${record.input.settings.interestType === "legal" ? "Taxa Legal (Lei 14.905/2024 e Resolução CMN 5.171/2024)" : record.input.settings.interestType === "fixed" ? `${record.input.settings.fixedMonthlyRate}% ao mês` : "não aplicados"}. ${result.methodology.interestConvention}`);
    paragraph(`${result.methodology.abatements} ${result.methodology.rounding}`);

    ensure(24);
    doc.setFillColor(255, 250, 235);
    doc.setDrawColor(234, 199, 123);
    doc.roundedRect(margin, y, contentWidth, 20, 2, 2, "FD");
    const note = doc.splitTextToSize("Nota técnica: a adequação do índice, termo inicial, multa, honorários e forma de abatimento ao título judicial deve ser conferida pelo profissional responsável.", contentWidth - 10);
    doc.setTextColor(...colors.ink);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(note, margin + 5, y + 7);
    y += 24;

    addPage();
    section("Memória por lançamento", "Valores positivos representam parcelas; valores negativos representam abatimentos.");
    const ledgerWidths = [18, 40, 22, 20, 22, 16, 18, 22];
    table(
      ["Data", "Descrição", "Original", "Fator", "Corrigido", "Juros %", "Juros", "Total"],
      ledgerWidths,
      result.ledger.map((item) => [
        fmtDate(item.date),
        item.description,
        core.currency(item.original),
        item.correctionFactor.toFixed(8),
        core.currency(item.corrected),
        item.interestRate.toFixed(6),
        core.currency(item.interest),
        core.currency(item.total),
      ]),
      ["", "TOTAL", core.currency(result.totals.original), "", core.currency(result.totals.corrected), "", core.currency(result.totals.interest), core.currency(result.totals.total)],
    );

    addPage();
    section("Séries e trilha de auditoria", "Percentuais preservados com o cálculo para evitar alteração retroativa do resultado.");
    const snapshot = record.indexSnapshot || {};
    paragraph(`Séries capturadas em ${snapshot.fetchedAt ? new Date(snapshot.fetchedAt).toLocaleString("pt-BR") : "data não registrada"}.`);
    const rateRows = new Map();
    Object.entries(snapshot.correctionRates || {}).forEach(([key, value]) => {
      rateRows.set(key, { ...(rateRows.get(key) || {}), correction: value });
    });
    Object.entries(snapshot.legalRates || {}).forEach(([key, value]) => {
      rateRows.set(key, { ...(rateRows.get(key) || {}), legal: value });
    });
    if (rateRows.size) {
      table(
        ["Competência", `${correctionLabel} (%)`, "Taxa Legal (% a.m.)"],
        [50, 64, 64],
        [...rateRows].sort().map(([key, value]) => [key, value.correction ?? "—", value.legal ?? "—"]),
      );
    } else {
      paragraph("Nenhuma série econômica externa foi aplicada neste cálculo.");
    }

    section("Fontes declaradas");
    const declaredSources = new Set(snapshot.sources || []);
    if (record.input.basisType === "minimum_wage") {
      declaredSources.add("https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2025/decreto/d12797.htm");
    }
    if (declaredSources.size) {
      [...declaredSources].forEach((source, index) => paragraph(`${index + 1}. ${source}`, 7.5, { after: 3 }));
    } else {
      paragraph("Nenhuma fonte externa foi necessária para os parâmetros informados.", 8);
    }

    const trails = result.ledger.filter((item) => item.correctionTrail.length || item.interestTrail.length);
    if (trails.length) {
      addPage();
      section("Fatores por lançamento", "Decomposição mensal dos fatores de cada parcela e abatimento.");
      trails.forEach((item) => {
        ensure(26);
        if (y > 25) y += 4;
        doc.setTextColor(...colors.green);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.text(`${fmtDate(item.date)} — ${item.description}`, margin, y);
        y += 5;
        const details = new Map();
        item.correctionTrail.forEach((entry) => {
          details.set(entry.month, { ...(details.get(entry.month) || {}), correction: entry });
        });
        item.interestTrail.forEach((entry) => {
          details.set(entry.month, { ...(details.get(entry.month) || {}), interest: entry });
        });
        table(
          ["Competência", "Correção %", "Fator acumulado", "Juros % a.m.", "Dias/mês", "Pró-rata %"],
          [28, 28, 34, 30, 25, 33],
          [...details].sort().map(([key, detail]) => [
            key,
            detail.correction?.rate ?? "—",
            detail.correction?.factor ?? "—",
            detail.interest?.monthlyRate ?? "—",
            detail.interest ? `${detail.interest.days}/${detail.interest.daysInMonth}` : "—",
            detail.interest?.rate ?? "—",
          ]),
        );
      });
    }

    const pages = doc.getNumberOfPages();
    for (let page = 1; page <= pages; page += 1) {
      doc.setPage(page);
      doc.setDrawColor(...colors.line);
      doc.line(margin, 286, margin + contentWidth, 286);
      doc.setTextColor(...colors.gray);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.8);
      doc.text(`OfficeJur • ${record.code} • versão ${pensionVersion(record.calculationVersion || result.calculationVersion)} • atualizado ${fmtInstantDate(record.updatedAt)}`, margin, 291);
      doc.text(`Página ${page} de ${pages}`, 194, 291, { align: "right" });
    }

    doc.setProperties({
      title: `Cálculo de pensão — ${record.name}`,
      subject: `OfficeJur ${record.code}`,
      author: "OfficeJur",
      creator: "OfficeJur Cálculos Jurídicos",
      keywords: "pensão, cálculo jurídico, memória de cálculo",
    });
    const blob = doc.output("blob");
    return {
      blob,
      filename: `${record.code}-${record.name.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").toLowerCase()}.pdf`,
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

  return { create, download, formatVersion: pensionVersion };
});
