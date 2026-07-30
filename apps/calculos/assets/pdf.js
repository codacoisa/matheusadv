((root, factory) => {
  root.OfficeJurCalculationPdf = factory();
})(typeof globalThis !== "undefined" ? globalThis : window, () => {
  "use strict";
  const fmtDate = (value) => value ? value.split("-").reverse().join("/") : "—";
  const fmtInstantDate = (value) => value ? new Date(value).toLocaleDateString("pt-BR") : "—";
  const text = (value) => String(value ?? "—");
  const shortHash = (value) => String(value || "").replace(/(.{32})/g, "$1 ").trim();

  async function create(record) {
    const { jsPDF } = window.jspdf;
    const core = window.OfficeJurCalculations;
    const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
    const result = record.result || core.calculatePension(record.input);
    const dataHash = await core.hash({ ...record, result });
    const navy = [23, 33, 58], green = [22, 128, 93], gray = [102, 112, 133], line = [221, 229, 237];
    const margin = 16, width = 178;
    let y = 18;
    const addPage = () => { doc.addPage(); y = 18; };
    const ensure = (height) => { if (y + height > 278) addPage(); };
    const heading = (title, subtitle) => {
      ensure(24); doc.setTextColor(...navy); doc.setFont("helvetica", "bold"); doc.setFontSize(15);
      doc.text(title, margin, y); y += 6;
      if (subtitle) { doc.setTextColor(...gray); doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.text(subtitle, margin, y); y += 5; }
      doc.setDrawColor(...line); doc.line(margin, y, margin + width, y); y += 7;
    };
    const paragraph = (value, size = 9) => {
      doc.setTextColor(...navy); doc.setFont("helvetica", "normal"); doc.setFontSize(size);
      const lines = doc.splitTextToSize(text(value), width); ensure(lines.length * 4 + 2); doc.text(lines, margin, y); y += lines.length * 4 + 3;
    };
    const row = (cells, widths, header = false) => {
      const lines = cells.map((cell, index) => doc.splitTextToSize(text(cell), widths[index] - 4));
      const height = Math.max(...lines.map((item) => item.length)) * 3.5 + 4; ensure(height);
      if (header) { doc.setFillColor(240, 243, 247); doc.rect(margin, y, width, height, "F"); }
      doc.setDrawColor(...line); doc.line(margin, y + height, margin + width, y + height);
      let x = margin;
      cells.forEach((cell, index) => {
        doc.setTextColor(...navy); doc.setFont("helvetica", header ? "bold" : "normal"); doc.setFontSize(header ? 7.4 : 7.2);
        doc.text(lines[index], x + 2, y + 3.5); x += widths[index];
      });
      y += height;
    };

    doc.setFillColor(...navy); doc.rect(0, 0, 210, 48, "F");
    doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(22);
    doc.text("OfficeJur", margin, 20); doc.setFontSize(13); doc.text("Demonstrativo de pensão alimentícia", margin, 30);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8.5);
    doc.text(`Código ${record.code}  •  versão ${record.calculationVersion || result.calculationVersion}`, margin, 38);
    y = 58;
    heading("Identificação do cálculo");
    row(["Nome", record.name, "Data-base", fmtDate(record.input.calculationDate)], [25, 78, 30, 45]);
    row(["Exequente", record.input.creditor || "Não informado", "Executado", record.input.debtor || "Não informado"], [25, 64, 25, 64]);
    row(["Processo", record.input.caseNumber || "Não informado", "Atualizado", fmtInstantDate(record.updatedAt)], [25, 64, 25, 64]);
    y += 6;
    heading("Resumo financeiro", "Valores em reais, na data-base indicada.");
    row(["Principal", "Correção", "Juros", "Multa", "Honorários", "Total"], [31, 29, 29, 29, 30, 30], true);
    row([
      core.currency(result.totals.original), core.currency(result.totals.correction),
      core.currency(result.totals.interest), core.currency(result.totals.penalty),
      core.currency(result.totals.fees), core.currency(result.totals.total),
    ], [31, 29, 29, 29, 30, 30]);
    y += 6;
    heading("Parâmetros e metodologia");
    paragraph(`Base da pensão: ${record.input.basisLabel}. Período: ${fmtDate(record.input.startDate)} a ${fmtDate(record.input.endDate)}. 13º: ${record.input.includeThirteenth ? "incluído" : "não incluído"}.`);
    const correctionLabel = record.input.settings.correctionType === "none" ? "sem correção" : record.input.settings.correctionType;
    paragraph(`Correção monetária: ${correctionLabel}. ${result.methodology.correctionConvention}`);
    paragraph(`Juros: ${record.input.settings.interestType === "legal" ? "Taxa Legal (Lei 14.905/2024 e Resolução CMN 5.171/2024)" : record.input.settings.interestType === "fixed" ? `${record.input.settings.fixedMonthlyRate}% ao mês` : "não aplicados"}. ${result.methodology.interestConvention}`);
    paragraph(`${result.methodology.abatements} ${result.methodology.rounding}`);
    paragraph("Nota: este demonstrativo é uma memória técnica. A adequação do índice, termo inicial, multa, honorários e forma de abatimento ao título judicial deve ser conferida pelo profissional responsável.");

    addPage();
    heading("Apêndice I — memória por lançamento", "Valores positivos representam parcelas; valores negativos representam abatimentos.");
    const ledgerWidths = [18, 40, 22, 20, 22, 16, 18, 22];
    row(["Data", "Descrição", "Original", "Fator", "Corrigido", "Juros %", "Juros", "Total"], ledgerWidths, true);
    result.ledger.forEach((item) => row([
      fmtDate(item.date), item.description, core.currency(item.original), item.correctionFactor.toFixed(8),
      core.currency(item.corrected), item.interestRate.toFixed(6), core.currency(item.interest), core.currency(item.total),
    ], ledgerWidths));
    row(["", "TOTAL", core.currency(result.totals.original), "", core.currency(result.totals.corrected), "", core.currency(result.totals.interest), core.currency(result.totals.total)], ledgerWidths, true);

    addPage();
    heading("Apêndice II — séries e trilha de auditoria");
    const snapshot = record.indexSnapshot || {};
    paragraph(`Séries capturadas em ${snapshot.fetchedAt ? new Date(snapshot.fetchedAt).toLocaleString("pt-BR") : "data não registrada"}. O cálculo salvo conserva os percentuais utilizados, evitando alteração retroativa do resultado.`);
    const rateRows = new Map();
    Object.entries(snapshot.correctionRates || {}).forEach(([key, value]) => rateRows.set(key, { ...(rateRows.get(key) || {}), correction: value }));
    Object.entries(snapshot.legalRates || {}).forEach(([key, value]) => rateRows.set(key, { ...(rateRows.get(key) || {}), legal: value }));
    row(["Competência", `${correctionLabel} (%)`, "Taxa Legal (% a.m.)"], [50, 64, 64], true);
    [...rateRows].sort().forEach(([key, value]) => row([key, value.correction ?? "—", value.legal ?? "—"], [50, 64, 64]));
    if (!rateRows.size) paragraph("Nenhuma série econômica externa foi aplicada neste cálculo.");
    y += 6;
    heading("Fontes declaradas");
    const declaredSources = new Set(snapshot.sources || []);
    if (record.input.basisType === "minimum_wage")
      declaredSources.add("https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2025/decreto/d12797.htm");
    [...declaredSources].forEach((source, index) => paragraph(`${index + 1}. ${source}`, 7.5));
    if (!declaredSources.size) paragraph("Nenhuma fonte externa foi necessária para os parâmetros informados.", 8);
    heading("Integridade dos dados");
    paragraph(`SHA-256 do conteúdo canônico que originou este demonstrativo:\n${shortHash(dataHash)}`, 8);
    paragraph("O hash acima identifica os dados e parâmetros do cálculo. O SHA-256 do arquivo PDF completo é apresentado pelo OfficeJur após a geração, pois um arquivo não pode conter o próprio hash final sem alterar esse mesmo hash.", 8);

    const trails = result.ledger.filter((item) => item.correctionTrail.length || item.interestTrail.length);
    if (trails.length) {
      addPage();
      heading("Apêndice III — fatores por lançamento", "Decomposição mensal que permite reproduzir os fatores de cada parcela e abatimento.");
      trails.forEach((item) => {
        ensure(22); doc.setTextColor(...green); doc.setFont("helvetica", "bold"); doc.setFontSize(9);
        doc.text(`${fmtDate(item.date)} — ${item.description}`, margin, y); y += 5;
        row(["Competência", "Correção %", "Fator acumulado", "Juros % a.m.", "Dias/mês", "Juros pró-rata %"], [28, 28, 34, 30, 25, 33], true);
        const details = new Map();
        item.correctionTrail.forEach((entry) => details.set(entry.month, { ...(details.get(entry.month) || {}), correction: entry }));
        item.interestTrail.forEach((entry) => details.set(entry.month, { ...(details.get(entry.month) || {}), interest: entry }));
        [...details].sort().forEach(([key, detail]) => row([
          key, detail.correction?.rate ?? "—", detail.correction?.factor ?? "—",
          detail.interest?.monthlyRate ?? "—", detail.interest ? `${detail.interest.days}/${detail.interest.daysInMonth}` : "—",
          detail.interest?.rate ?? "—",
        ], [28, 28, 34, 30, 25, 33]));
        y += 5;
      });
    }

    const pages = doc.getNumberOfPages();
    for (let page = 1; page <= pages; page += 1) {
      doc.setPage(page); doc.setDrawColor(...line); doc.line(margin, 286, margin + width, 286);
      doc.setTextColor(...gray); doc.setFont("helvetica", "normal"); doc.setFontSize(6.8);
      doc.text(`Elaborado pelo OfficeJur • ${record.code} • v${record.calculationVersion || result.calculationVersion} • atualizado ${fmtInstantDate(record.updatedAt)}`, margin, 291);
      doc.text(`Dados SHA-256 ${dataHash.slice(0, 20)}… • página ${page}/${pages}`, 194, 291, { align: "right" });
    }
    doc.setProperties({
      title: `Cálculo de pensão — ${record.name}`, subject: `OfficeJur ${record.code}`,
      author: "OfficeJur", creator: "OfficeJur Cálculos Jurídicos", keywords: `pensao, calculo juridico, ${dataHash}`,
    });
    const blob = doc.output("blob");
    const fileDigest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
    const fileHash = [...new Uint8Array(fileDigest)].map((item) => item.toString(16).padStart(2, "0")).join("");
    return { blob, dataHash, fileHash, filename: `${record.code}-${record.name.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").toLowerCase()}.pdf` };
  }
  function download(file) {
    const url = URL.createObjectURL(file.blob), link = document.createElement("a");
    link.href = url; link.download = file.filename; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 2_000);
  }
  return { create, download };
});
