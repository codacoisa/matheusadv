import { configurePdfWorker, parsePdf, parseP7s } from "./validation.js";
import {
  DEFAULT_LIMIT_KB,
  MIN_PAGES_FOR_AVERAGE_LIMIT,
  averageKilobytes,
  compareResults,
  formatBytes,
  formatKilobytes,
  isP7s,
  isPdf,
  normalizeFileName,
  originalNameFor,
  violatesProjudiAverageLimit
} from "./core.js";

configurePdfWorker("./assets/pdf.worker.min.mjs");

const elements = {
  dropZone: document.querySelector("#drop-zone"),
  fileInput: document.querySelector("#file-input"),
  chooseButton: document.querySelector("#choose-files"),
  results: document.querySelector("#results"),
  resultSection: document.querySelector("#result-section"),
  emptyState: document.querySelector("#empty-state"),
  summary: document.querySelector("#summary"),
  clearButton: document.querySelector("#clear-files"),
  errorButton: document.querySelector("#show-errors"),
  limitInput: document.querySelector("#limit-kb"),
  liveRegion: document.querySelector("#live-region")
};

let results = [];
let filterErrors = false;

function currentLimit() {
  const value = Number(elements.limitInput.value);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_LIMIT_KB;
}

function certificateIsCurrent(item) {
  const date = item.signedAt || new Date();
  if (item.validFrom && date < item.validFrom) return false;
  if (item.validUntil && date > item.validUntil) return false;
  return true;
}

function classify(item) {
  if (item.error) {
    return { status: "error", title: "Arquivo inválido", message: item.error };
  }
  if (item.kind === "p7s" && item.signatureVerified === false) {
    return { status: "error", title: "Assinatura inconsistente", message: "A integridade criptográfica da assinatura não foi confirmada." };
  }
  if (item.kind === "p7s" && !certificateIsCurrent(item)) {
    return { status: "error", title: "Certificado fora da validade", message: "O certificado não estava válido na data informada pela assinatura." };
  }
  if (violatesProjudiAverageLimit(item.averageKb, item.pages, currentLimit())) {
    return {
      status: "error",
      title: "Acima do limite do Projudi",
      message: `Como o documento tem mais de ${MIN_PAGES_FOR_AVERAGE_LIMIT} páginas, a média de ${formatKilobytes(item.averageKb)} por página não pode ultrapassar ${formatKilobytes(currentLimit())}.`
    };
  }
  if (item.kind === "pdf") {
    return {
      status: "reference",
      title: "PDF para conferência",
      message: item.pages <= MIN_PAGES_FOR_AVERAGE_LIMIT
        ? `Este PDF tem até ${MIN_PAGES_FOR_AVERAGE_LIMIT} páginas, então a regra de média por página não se aplica. Para o campo assinado, selecione o respectivo .pdf.p7s.`
        : "Este é o documento original. Para o campo de arquivo assinado, selecione o respectivo .pdf.p7s."
    };
  }
  if (item.pages <= MIN_PAGES_FOR_AVERAGE_LIMIT) {
    return {
      status: "ready",
      title: "Regra de tamanho não aplicável",
      message: `O documento tem ${item.pages} página(s). O limite médio só é aplicado a arquivos com mais de ${MIN_PAGES_FOR_AVERAGE_LIMIT} páginas; a integridade da assinatura foi confirmada.`
    };
  }
  return {
    status: "ready",
    title: "Pronto para o limite analisado",
    message: `A média por página está dentro de ${formatKilobytes(currentLimit())} e a integridade da assinatura foi confirmada.`
  };
}

function applyClassification(item) {
  return Object.assign(item, classify(item));
}

async function analyzeFile(file) {
  const base = {
    id: `${normalizeFileName(file.name)}-${file.size}-${file.lastModified}`,
    name: file.name,
    size: file.size,
    kind: isP7s(file.name) ? "p7s" : "pdf",
    status: "checking",
    title: "Analisando...",
    message: "Lendo o documento no seu navegador."
  };

  try {
    const buffer = await file.arrayBuffer();
    if (base.kind === "p7s") {
      const signature = await parseP7s(buffer);
      Object.assign(base, signature);
      base.pages = await parsePdf(signature.pdfBytes);
    } else {
      base.pages = await parsePdf(new Uint8Array(buffer));
    }
    base.averageKb = averageKilobytes(file.size, base.pages);
  } catch (error) {
    base.error = error instanceof Error ? error.message : "Não foi possível analisar o arquivo.";
  }

  return applyClassification(base);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
  })[character]);
}

function formatDate(value) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return "Não informada";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(value);
}

function resultCard(item) {
  const statusLabel = item.status === "error" ? "Problema" : item.status === "ready" ? "Aprovado" : "Conferência";
  const signatureDetails = item.kind === "p7s" && !item.error ? `
    <details>
      <summary>Dados da assinatura</summary>
      <dl class="signature-grid">
        <div><dt>Assinante</dt><dd>${escapeHtml(item.signer || "Não identificado")}</dd></div>
        <div><dt>Autoridade</dt><dd>${escapeHtml(item.issuer || "Não identificada")}</dd></div>
        <div><dt>Assinado em</dt><dd>${escapeHtml(formatDate(item.signedAt))}</dd></div>
        <div><dt>Validade do certificado</dt><dd>${escapeHtml(formatDate(item.validFrom))} a ${escapeHtml(formatDate(item.validUntil))}</dd></div>
      </dl>
      <p class="technical-note">A conferência criptográfica verifica se o conteúdo foi alterado. Ela não consulta revogação nem substitui validadores oficiais da ICP-Brasil.</p>
    </details>` : "";

  return `
    <article class="result-card ${item.status}" data-status="${item.status}">
      <div class="status-icon" aria-hidden="true">${item.status === "error" ? "!" : item.status === "ready" ? "✓" : "i"}</div>
      <div class="result-content">
        <div class="result-heading">
          <div>
            <span class="eyebrow">${item.kind === "p7s" ? "Arquivo assinado P7S" : "Documento PDF"}</span>
            <h3 title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</h3>
          </div>
          <span class="status-pill">${statusLabel}</span>
        </div>
        <p class="result-message"><strong>${escapeHtml(item.title)}.</strong> ${escapeHtml(item.message)}</p>
        <dl class="metrics">
          <div><dt>Tamanho</dt><dd>${formatBytes(item.size)}</dd></div>
          <div><dt>Páginas</dt><dd>${item.pages ?? "-"}</dd></div>
          <div><dt>Média por página</dt><dd>${formatKilobytes(item.averageKb)}</dd></div>
          <div><dt>Integridade</dt><dd>${item.kind === "pdf" ? "Não assinada" : item.signatureVerified ? "Confirmada" : "Não confirmada"}</dd></div>
        </dl>
        ${signatureDetails}
      </div>
    </article>`;
}

function render() {
  const sorted = results.map(applyClassification).sort(compareResults);
  const visible = filterErrors ? sorted.filter(item => item.status === "error") : sorted;
  const counts = {
    error: sorted.filter(item => item.status === "error").length,
    ready: sorted.filter(item => item.status === "ready").length,
    reference: sorted.filter(item => item.status === "reference").length
  };

  elements.emptyState.hidden = sorted.length > 0;
  elements.resultSection.hidden = sorted.length === 0;
  elements.results.innerHTML = visible.length
    ? visible.map(resultCard).join("")
    : `<div class="no-errors"><span>✓</span><strong>Nenhum problema encontrado.</strong><p>Os arquivos atendem à regra de tamanho aplicável e às verificações de assinatura.</p></div>`;
  elements.summary.innerHTML = `
    <span class="summary-chip error"><strong>${counts.error}</strong> com problema</span>
    <span class="summary-chip ready"><strong>${counts.ready}</strong> assinados aprovados</span>
    <span class="summary-chip reference"><strong>${counts.reference}</strong> PDFs de conferência</span>`;
  elements.errorButton.disabled = counts.error === 0;
  elements.errorButton.textContent = filterErrors ? "Mostrar todos" : "Mostrar só problemas";
  elements.errorButton.setAttribute("aria-pressed", String(filterErrors));
}

async function handleFiles(fileList) {
  const accepted = Array.from(fileList).filter(file => isPdf(file.name) || isP7s(file.name));
  const rejected = fileList.length - accepted.length;
  if (!accepted.length) {
    elements.liveRegion.textContent = "Nenhum PDF ou P7S foi selecionado.";
    return;
  }

  const existingIds = new Set(results.map(item => item.id));
  const uniqueFiles = accepted.filter(file => !existingIds.has(`${normalizeFileName(file.name)}-${file.size}-${file.lastModified}`));
  const placeholders = uniqueFiles.map(file => ({
    id: `${normalizeFileName(file.name)}-${file.size}-${file.lastModified}`,
    name: file.name,
    size: file.size,
    kind: isP7s(file.name) ? "p7s" : "pdf",
    status: "checking",
    title: "Analisando",
    message: "Lendo o documento no seu navegador."
  }));
  results.push(...placeholders);
  render();

  for (let index = 0; index < uniqueFiles.length; index += 2) {
    const batch = uniqueFiles.slice(index, index + 2);
    const analyzed = await Promise.all(batch.map(analyzeFile));
    for (const item of analyzed) {
      const position = results.findIndex(result => result.id === item.id);
      if (position >= 0) results[position] = item;
    }
    render();
  }

  const duplicateCount = accepted.length - uniqueFiles.length;
  elements.liveRegion.textContent = `${uniqueFiles.length} arquivo(s) analisado(s).${duplicateCount ? ` ${duplicateCount} repetido(s) ignorado(s).` : ""}${rejected ? ` ${rejected} formato(s) não aceito(s).` : ""}`;
}

elements.chooseButton.addEventListener("click", () => elements.fileInput.click());
elements.fileInput.addEventListener("change", event => {
  handleFiles(event.target.files);
  event.target.value = "";
});

for (const eventName of ["dragenter", "dragover"]) {
  elements.dropZone.addEventListener(eventName, event => {
    event.preventDefault();
    elements.dropZone.classList.add("dragging");
  });
}

for (const eventName of ["dragleave", "drop"]) {
  elements.dropZone.addEventListener(eventName, event => {
    event.preventDefault();
    elements.dropZone.classList.remove("dragging");
  });
}

elements.dropZone.addEventListener("drop", event => handleFiles(event.dataTransfer.files));
elements.clearButton.addEventListener("click", () => {
  results = [];
  filterErrors = false;
  render();
  elements.liveRegion.textContent = "Lista de arquivos limpa.";
});
elements.errorButton.addEventListener("click", () => {
  filterErrors = !filterErrors;
  render();
});
elements.limitInput.addEventListener("change", render);

render();
