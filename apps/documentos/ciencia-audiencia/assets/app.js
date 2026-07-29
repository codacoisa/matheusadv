const STORAGE_KEY = 'gm-ciencia-audiencia-draft-v1';
const form = document.getElementById('document-form');
const preview = document.getElementById('preview');
const loading = document.getElementById('preview-loading');
const pageCount = document.getElementById('page-count');
const importBtn = document.getElementById('import');
const importFile = document.getElementById('import-file');

const GOLD = [179, 135, 49];
const GRAY = [88, 88, 92];
const FOOTER_GRAY = [125, 125, 128];
const TABLE_INK = [55, 55, 55];
const TABLE_HEADER_BG = [189, 192, 191];
const TABLE_LABEL_BG = [220, 220, 220];
const TABLE_VALUE_BG = [245, 245, 245];
const TABLE_BORDER = [150, 150, 150];
const MAPS_URL = 'https://maps.app.goo.gl/r8CVrczAXdqNZc6u9';
const WHATSAPP_URL = 'https://wa.me/5562993161514';
const LEFT = 19;
const WIDTH = 172;
const PDF_DRAFT_MARKER = 'GM_CIENCIA_AUDIENCIA_DRAFT:';

const ATTORNEYS = [
  { name: 'Adauto Aparecido de Morais', oab: '33.799' },
  { name: 'Jales Gregório de Oliveira Sousa', oab: '62.131' },
  { name: 'Matheus Ricardo de Sousa Ferreira', oab: '60.162' },
];

function strokeIcon(doc, color, weight, fn) {
  doc.setDrawColor(...color);
  doc.setLineWidth(weight);
  fn();
}

const ICONS = {
  person(doc, x, y, s, color) {
    strokeIcon(doc, color, s * 0.08, () => {
      doc.circle(x + s * 0.5, y + s * 0.24, s * 0.2, 'S');
      doc.roundedRect(x + s * 0.18, y + s * 0.5, s * 0.64, s * 0.46, s * 0.12, s * 0.12, 'S');
    });
  },
  pen(doc, x, y, s, color) {
    strokeIcon(doc, color, s * 0.09, () => {
      doc.line(x + s * 0.1, y + s * 0.92, x + s * 0.78, y + s * 0.18);
      doc.line(x + s * 0.78, y + s * 0.18, x + s * 0.92, y + s * 0.06);
      doc.line(x + s * 0.08, y + s * 0.94, x + s * 0.18, y + s * 0.84);
    });
  },
  calendar(doc, x, y, s, color) {
    strokeIcon(doc, color, s * 0.07, () => {
      doc.roundedRect(x, y + s * 0.16, s, s * 0.8, s * 0.07, s * 0.07, 'S');
      doc.line(x + s * 0.2, y, x + s * 0.2, y + s * 0.3);
      doc.line(x + s * 0.8, y, x + s * 0.8, y + s * 0.3);
      doc.line(x, y + s * 0.42, x + s, y + s * 0.42);
    });
  },
  phone(doc, x, y, s, color) {
    strokeIcon(doc, color, s * 0.09, () => {
      doc.roundedRect(x + s * 0.28, y, s * 0.44, s, s * 0.14, s * 0.14, 'S');
      doc.line(x + s * 0.42, y + s * 0.84, x + s * 0.58, y + s * 0.84);
    });
  },
  pin(doc, x, y, s, color) {
    strokeIcon(doc, color, s * 0.08, () => {
      doc.circle(x + s / 2, y + s * 0.34, s * 0.3, 'S');
      doc.line(x + s * 0.28, y + s * 0.56, x + s * 0.5, y + s * 0.96);
      doc.line(x + s * 0.72, y + s * 0.56, x + s * 0.5, y + s * 0.96);
      doc.circle(x + s / 2, y + s * 0.34, s * 0.1, 'S');
    });
  },
  envelope(doc, x, y, s, color) {
    strokeIcon(doc, color, s * 0.07, () => {
      doc.rect(x, y + s * 0.16, s, s * 0.68, 'S');
      doc.line(x, y + s * 0.16, x + s / 2, y + s * 0.54);
      doc.line(x + s, y + s * 0.16, x + s / 2, y + s * 0.54);
    });
  },
};

function drawIcon(doc, type, x, y, s, color = GOLD) {
  const icon = ICONS[type];
  if (icon) icon(doc, x, y, s, color);
}

const state = {
  assets: {},
  previewUrl: null,
};

const {
  arrayBufferToBinaryString,
  clean,
  decodePdfDraft,
  formatLongDate,
  formatShortDate,
  formatTime,
  joinParts,
  todayISO,
} = window.OfficeJurDocumentUtils;
const formatCPF = window.OfficeJurDocumentUtils.formatCPF;
const normalizeFilename = value => window.OfficeJurDocumentUtils.normalizeFilename(value, 'ciencia-audiencia');

function getDraft() {
  const draft = { case: {}, hearing: {}, witness: {}, document: {} };
  for (const element of form.elements) {
    if (!element.name) continue;
    const [group, field] = element.name.split('.');
    if (draft[group]) draft[group][field] = element.value;
  }
  return draft;
}

function setDraft(draft) {
  for (const element of form.elements) {
    if (!element.name) continue;
    const [group, field] = element.name.split('.');
    const value = draft?.[group]?.[field];
    if (value != null) element.value = value;
  }
  if (!form.elements['document.date'].value) form.elements['document.date'].value = todayISO();
}

function saveDraft() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(getDraft()));
}

function loadDraft() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

function encodePdfDraft(draft) {
  return window.OfficeJurDocumentUtils.encodePdfDraft(PDF_DRAFT_MARKER, draft);
}

function extractDraftFromPdfText(text) {
  return window.OfficeJurDocumentUtils.extractDraftFromPdfText(text, PDF_DRAFT_MARKER, decodePdfDraft);
}

async function importDraftFromPdf(file) {
  const buffer = await file.arrayBuffer();
  const text = arrayBufferToBinaryString(buffer);
  const draft = extractDraftFromPdfText(text);
  if (!draft) {
    alert('Não encontrei dados editáveis neste PDF. Importe um PDF gerado por esta página após a atualização do botão Importar.');
    return;
  }
  setDraft(draft);
  saveDraft();
  updatePreview();
}

function loadCroppedImage(src, crop) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = crop.w;
      canvas.height = crop.h;
      canvas.getContext('2d').drawImage(image, crop.x, crop.y, crop.w, crop.h, 0, 0, crop.w, crop.h);
      resolve(canvas.toDataURL('image/png'));
    };
    image.onerror = reject;
    image.src = src;
  });
}

async function loadAssets() {
  const [logo, wordmark, watermark] = await Promise.all([
    loadCroppedImage('../../assets/logo.png', { x: 200, y: 234, w: 623, h: 962 }),
    loadCroppedImage('../assets/wordmark.png', { x: 238, y: 384, w: 1068, h: 190 }),
    loadCroppedImage('../assets/watermark.png', { x: 0, y: 0, w: 1414, h: 2000 }),
  ]);
  state.assets = { logo, wordmark, watermark };
}

function drawWatermark(doc) {
  if (!state.assets.watermark) return;
  if (doc.GState && doc.setGState) doc.setGState(new doc.GState({ opacity: 0.18 }));
  doc.addImage(state.assets.watermark, 'PNG', 134.4, 42.3, 150, 212.3);
  if (doc.GState && doc.setGState) doc.setGState(new doc.GState({ opacity: 1 }));
}

function drawHeader(doc, title = 'TERMO DE CIÊNCIA E COMPROMISSO\nDE COMPARECIMENTO EM AUDIÊNCIA') {
  if (state.assets.logo) doc.addImage(state.assets.logo, 'PNG', 95.3, 5, 19.4, 30);
  if (state.assets.wordmark) doc.addImage(state.assets.wordmark, 'PNG', 74.1, 38, 61.8, 11);
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.35);
  doc.line(0, 56, 210, 56);
  doc.setFont('times', 'bold');
  doc.setTextColor(...GOLD);
  doc.setFontSize(11.5);
  const lines = title.split('\n');
  doc.text(lines, 105, 61.5, { align: 'center', lineHeightFactor: 1.2 });
}

function drawFooter(doc, pageInfo) {
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.25);
  doc.line(0, 274, 210, 274);
  doc.setLineWidth(0.8);
  doc.line(0, 294, 210, 294);
  doc.setLineWidth(0.3);
  doc.line(0, 296, 210, 296);
  doc.setFont('times', 'normal');
  doc.setTextColor(...FOOTER_GRAY);
  doc.setFontSize(9);

  const rows = [
    { icon: 'phone', text: '(62) 9 9316-1514', y: 282, link: WHATSAPP_URL },
    { icon: 'pin', text: 'GO-010, Km 67, Zona Rural, Silvânia-GO', y: 287, link: MAPS_URL },
    { icon: 'envelope', text: 'gregorioemorais.adv@gmail.com', y: 292 },
  ];
  const iconSize = 3;
  const gap = 1.6;
  rows.forEach(({ icon, text, y, link }) => {
    const textWidth = doc.getTextWidth(text);
    const startX = 105 - (iconSize + gap + textWidth) / 2;
    drawIcon(doc, icon, startX, y - iconSize * 0.78, iconSize, FOOTER_GRAY);
    if (link) doc.textWithLink(text, startX + iconSize + gap, y, { url: link });
    else doc.text(text, startX + iconSize + gap, y);
  });

}

function drawPageChrome(doc, title) {
  drawWatermark(doc);
  drawHeader(doc, title);
  drawFooter(doc);
}

function addContentPage(doc, title) {
  doc.addPage('a4', 'portrait');
  drawPageChrome(doc, title);
  return 76;
}

function stampPageNumbers(doc) {
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p += 1) {
    doc.setPage(p);
    doc.setFont('times', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...FOOTER_GRAY);
    doc.text(`Página ${p} de ${total}`, 190, 292, { align: 'right' });
  }
}

function drawParagraph(doc, text, y, opts = {}) {
  if (!text) return y;
  doc.setFont('times', 'normal');
  doc.setFontSize(opts.fontSize || 10.6);
  doc.setTextColor(...GRAY);
  const lines = doc.splitTextToSize(text, WIDTH);
  doc.text(lines, LEFT, y, { lineHeightFactor: 1.25, align: 'justify', maxWidth: WIDTH });
  return y + lines.length * (opts.lineHeight || 5.2);
}

function drawInfoTable(doc, title, rows, y) {
  const labelWidth = 50;
  const valueWidth = WIDTH - labelWidth - 6;

  doc.setFillColor(...TABLE_HEADER_BG);
  doc.rect(LEFT, y, WIDTH, 8, 'F');
  doc.setDrawColor(...TABLE_BORDER);
  doc.setLineWidth(0.2);
  doc.rect(LEFT, y, WIDTH, 8, 'S');
  doc.setFont('times', 'bold');
  doc.setFontSize(10.3);
  doc.setTextColor(...TABLE_INK);
  doc.text(title, LEFT + WIDTH / 2, y + 5.4, { align: 'center' });
  y += 8;

  rows.forEach(row => {
    const value = clean(row.value);
    const lines = value ? doc.splitTextToSize(value, valueWidth) : [''];
    const rowH = Math.max(8, lines.length * 4.6 + 3.4);

    doc.setFillColor(...TABLE_LABEL_BG);
    doc.rect(LEFT, y, labelWidth, rowH, 'F');
    doc.setFillColor(...TABLE_VALUE_BG);
    doc.rect(LEFT + labelWidth, y, WIDTH - labelWidth, rowH, 'F');
    doc.setDrawColor(...TABLE_BORDER);
    doc.rect(LEFT, y, labelWidth, rowH, 'S');
    doc.rect(LEFT + labelWidth, y, WIDTH - labelWidth, rowH, 'S');

    doc.setFont('times', 'bold');
    doc.setFontSize(9.3);
    doc.setTextColor(...TABLE_INK);
    doc.text(row.label, LEFT + labelWidth / 2, y + rowH / 2 + 1.1, { align: 'center' });

    if (value) {
      doc.setFont('times', 'normal');
      doc.setFontSize(9.6);
      doc.setTextColor(...GRAY);
      const textY = y + (rowH - (lines.length - 1) * 4.6) / 2 + 0.6;
      doc.text(lines, LEFT + labelWidth + 3, textY, { lineHeightFactor: 1.15 });
    }

    y += rowH;
  });

  return y;
}

function drawSignatureLine(doc, lines, x, y, width, opts = {}) {
  if (opts.icon) drawIcon(doc, opts.icon, x - 6.5, y - 4.5, 4.4, opts.color || GRAY);
  doc.setDrawColor(100, 100, 102);
  doc.setLineWidth(0.25);
  doc.line(x, y, x + width, y);
  doc.setFont('times', opts.italic ? 'italic' : 'bold');
  doc.setTextColor(...(opts.color || GRAY));
  doc.setFontSize(10.3);
  const list = Array.isArray(lines) ? lines : [lines];
  list.forEach((line, i) => {
    doc.text(line, x + width / 2, y + 6 + i * 5, { align: 'center' });
  });
}

function generateDocument(draft = getDraft()) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  doc.setProperties({
    title: 'Termo de Ciência de Audiência',
    author: 'Gregório & Morais Advogados',
    subject: 'Ciência de audiência gerada pelo sistema Gregório & Morais',
    keywords: encodePdfDraft(draft),
  });
  drawPageChrome(doc);

  let y = 76;
  doc.setFont('times', 'normal');
  doc.setFontSize(10.6);
  doc.setTextColor(...GRAY);
  doc.text(`Processo n.º: ${clean(draft.case.number)}`, LEFT, y);
  y += 6;
  doc.text(`Juízo/Comarca: ${clean(draft.case.court)}`, LEFT, y);
  y += 9;

  const intro1 = 'Pelo presente termo, o(a) advogado(a) signatário(a), na qualidade de patrono(a) da parte que arrolou a testemunha abaixo qualificada, dá ciência a esta, nos termos do art. 455, caput, do Código de Processo Civil, da data, horário e local de realização da audiência relativa ao processo acima identificado, e formaliza o compromisso voluntário de comparecimento, assumido livremente pela testemunha mediante assinatura deste documento.';
  const intro2 = 'Este documento não constitui intimação judicial, a qual compete exclusivamente ao juízo processante. Trata-se de comunicação extrajudicial, prestada pelo(a) advogado(a) responsável por arrolar a testemunha, em cumprimento ao ônus informativo previsto no dispositivo legal acima referido.';
  y = drawParagraph(doc, intro1, y);
  y += 4;
  y = drawParagraph(doc, intro2, y);
  y += 6;

  if (y > 232) y = addContentPage(doc);
  y = drawInfoTable(doc, 'DADOS DA AUDIÊNCIA', [
    { label: 'DATA', value: formatShortDate(draft.hearing.date) },
    { label: 'HORÁRIO', value: formatTime(draft.hearing.time) },
    { label: 'LOCAL', value: clean(draft.hearing.location) },
    { label: 'MODALIDADE', value: clean(draft.hearing.modality) },
  ], y);
  y += 8;

  if (y > 224) y = addContentPage(doc);
  y = drawInfoTable(doc, 'QUALIFICAÇÃO DA TESTEMUNHA', [
    { label: 'NOME COMPLETO', value: clean(draft.witness.name).toUpperCase() },
    { label: 'CPF', value: draft.witness.cpf ? formatCPF(draft.witness.cpf) : '' },
    { label: 'TELEFONE', value: clean(draft.witness.phone) },
    { label: 'ENDEREÇO', value: clean(draft.witness.address) },
  ], y);
  y += 8;

  if (y > 248) y = addContentPage(doc);
  doc.setFont('times', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(...GOLD);
  doc.text('COMPROMISSO', 105, y, { align: 'center' });
  y += 7;

  const compromisso1 = 'A testemunha acima qualificada declara estar ciente da data, horário e local da audiência indicados neste termo, comprometendo-se a comparecer pontualmente, e estar ciente de que o não comparecimento injustificado pode ensejar requerimento de condução coercitiva, nos termos do art. 455, § 5.º, do Código de Processo Civil.';
  const compromisso2 = 'A testemunha declara, ainda, estar ciente de que eventual impossibilidade de comparecimento, por motivo justificado, deverá ser comunicada ao(à) advogado(a) signatário(a) com a maior antecedência possível, a fim de viabilizar as providências processuais cabíveis.';
  y = drawParagraph(doc, compromisso1, y);
  y += 4;
  if (y > 252) y = addContentPage(doc);
  y = drawParagraph(doc, compromisso2, y);
  y += 10;

  if (y > 248) y = addContentPage(doc);
  const location = clean(draft.document.location);
  const date = formatLongDate(draft.document.date);
  const closing = joinParts([location, date]);
  if (closing) {
    doc.setFont('times', 'normal');
    doc.setFontSize(10.5);
    doc.setTextColor(...GRAY);
    doc.text(`${closing}.`, LEFT, y);
    y += 14;
  } else {
    y += 6;
  }

  if (y > 246) y = addContentPage(doc);
  drawSignatureLine(doc, 'Assinatura da Testemunha', 66, y, 78, { icon: 'pen', italic: true, color: GOLD });
  y += 22;

  if (y > 246) y = addContentPage(doc);
  const attorneyIndex = draft.document.attorney;
  const attorney = attorneyIndex !== '' && attorneyIndex != null ? ATTORNEYS[Number(attorneyIndex)] : null;
  const attorneyLines = attorney
    ? [attorney.name, `OAB-GO ${attorney.oab}.`]
    : ['Advogado(a) Signatário(a)'];
  drawSignatureLine(doc, attorneyLines, 66, y, 78, { italic: true, color: GOLD });

  stampPageNumbers(doc);
  return doc;
}

let previewTimer;

async function updatePreview() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => {
    loading.hidden = false;
    try {
      const doc = generateDocument();
      const blob = doc.output('blob');
      if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
      state.previewUrl = URL.createObjectURL(blob);
      preview.src = `${state.previewUrl}#view=FitH`;
      pageCount.textContent = `${doc.getNumberOfPages()} página${doc.getNumberOfPages() === 1 ? '' : 's'} · A4`;
    } catch (error) {
      console.error(error);
      pageCount.textContent = 'Erro na prévia';
    } finally {
      loading.hidden = true;
    }
  }, 280);
}

['witness.cpf'].forEach(name => {
  const input = form.elements[name];
  if (input) input.addEventListener('input', () => { input.value = formatCPF(input.value); });
});

form.addEventListener('input', () => {
  saveDraft();
  updatePreview();
});

form.addEventListener('change', () => {
  saveDraft();
  updatePreview();
});

document.getElementById('download').addEventListener('click', () => {
  const draft = getDraft();
  const doc = generateDocument(draft);
  doc.save(`${normalizeFilename(draft.document.filename)}.pdf`);
});

importBtn.addEventListener('click', () => {
  importFile.click();
});

importFile.addEventListener('change', async () => {
  const file = importFile.files && importFile.files[0];
  importFile.value = '';
  if (!file) return;
  await importDraftFromPdf(file);
});

document.getElementById('print').addEventListener('click', () => {
  try {
    preview.contentWindow.focus();
    preview.contentWindow.print();
  } catch (error) {
    console.error('Falha ao imprimir', error);
    if (state.previewUrl) window.open(state.previewUrl, '_blank');
  }
});

document.getElementById('clear').addEventListener('click', () => {
  if (!confirm('Limpar todos os campos deste termo?')) return;
  localStorage.removeItem(STORAGE_KEY);
  form.reset();
  form.elements['document.location'].value = 'Silvânia-GO';
  form.elements['document.date'].value = todayISO();
  form.elements['document.filename'].value = 'ciencia-audiencia';
  updatePreview();
});

window.addEventListener('beforeunload', () => {
  if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
});

async function init() {
  setDraft(loadDraft());
  try {
    await loadAssets();
  } catch (error) {
    console.error('Falha ao carregar identidade visual', error);
  }
  updatePreview();
}

init();
