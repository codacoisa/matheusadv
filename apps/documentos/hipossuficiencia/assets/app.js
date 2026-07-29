const STORAGE_KEY = 'gm-hipossuficiencia-draft-v1';
const form = document.getElementById('document-form');
const preview = document.getElementById('preview');
const loading = document.getElementById('preview-loading');
const guardianSection = document.getElementById('guardian-section');
const guardianTitle = document.getElementById('guardian-title');
const pageCount = document.getElementById('page-count');
const importBtn = document.getElementById('import');
const importFile = document.getElementById('import-file');

const GOLD = [179, 135, 49];
const GRAY = [88, 88, 92];
const FOOTER_GRAY = [125, 125, 128];
const MAPS_URL = 'https://maps.app.goo.gl/r8CVrczAXdqNZc6u9';
const WHATSAPP_URL = 'https://wa.me/5562993161514';
const LEFT = 20;
const TEXT_X = 44;
const TEXT_WIDTH = 145;
const PDF_DRAFT_MARKER = 'GM_HIPOSSUFICIENCIA_DRAFT:';

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
  mode: 'normal',
  assets: {},
  previewUrl: null,
};

const {
  arrayBufferToBinaryString,
  clean,
  decodePdfDraft,
  formatCNPJ,
  formatCPF,
  formatLongDate,
  formatZip,
  joinParts,
  todayISO,
} = window.OfficeJurDocumentUtils;
const normalizeFilename = value => window.OfficeJurDocumentUtils.normalizeFilename(value, 'hipossuficiencia');

function getDraft() {
  const draft = { mode: state.mode, person: {}, guardian: {}, document: {} };
  for (const element of form.elements) {
    if (!element.name) continue;
    const [group, field] = element.name.split('.');
    if (draft[group]) draft[group][field] = element.value;
  }
  return draft;
}

function setDraft(draft) {
  state.mode = ['normal', 'under16', 'over16'].includes(draft?.mode) ? draft.mode : 'normal';
  for (const element of form.elements) {
    if (!element.name) continue;
    const [group, field] = element.name.split('.');
    const value = draft?.[group]?.[field];
    if (value != null) element.value = value;
  }
  if (!form.elements['document.date'].value) form.elements['document.date'].value = todayISO();
  updateModeUI();
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

function updateModeUI() {
  const personTypeField = document.getElementById('person-type-field');
  const personTypeInput = form.elements['person.type'];
  const isMinor = state.mode !== 'normal';
  if (isMinor && personTypeInput) personTypeInput.value = 'pf';
  document.querySelectorAll('[data-mode]').forEach(button => {
    button.classList.toggle('is-active', button.dataset.mode === state.mode);
  });
  guardianSection.hidden = !isMinor;
  guardianTitle.textContent = state.mode === 'under16' ? 'Representante' : 'Assistente';
  if (personTypeField) personTypeField.hidden = isMinor;
  const personType = personTypeInput?.value === 'pj' ? 'pj' : 'pf';
  document.querySelectorAll('[data-person-kind]').forEach(field => {
    field.hidden = field.dataset.personKind !== personType;
  });
  document.querySelector('.mode-switch').hidden = personType === 'pj';
  if (personType === 'pj') {
    state.mode = 'normal';
    guardianSection.hidden = true;
  }
}

function buildAddress(person) {
  const street = joinParts([
    person.street,
    person.number && `nº ${person.number}`,
    person.complement,
    person.neighborhood,
  ]);
  const cityState = joinParts([person.city, person.state], '/');
  const pieces = [];
  if (street) pieces.push(street);
  if (cityState) pieces.push(cityState);
  if (person.zip) pieces.push(`CEP: ${formatZip(person.zip)}`);
  return joinParts(pieces);
}

function buildQualificationParts(person, options = {}) {
  if (person.type === 'pj') {
    const name = clean(person.companyName).toUpperCase();
    const segments = ['pessoa jurídica de direito privado'];
    if (person.cnpj) segments.push(`inscrita no CNPJ sob o nº ${formatCNPJ(person.cnpj)}`);
    if (person.tradeName) segments.push(`nome fantasia ${clean(person.tradeName)}`);
    if (person.email) segments.push(`e-mail: ${clean(person.email)}`);
    const address = buildAddress(person);
    if (address) segments.push(`com sede em ${address}`);
    if (person.representativeName) {
      const role = clean(person.representativeRole);
      const cpf = person.representativeCpf ? `, inscrito(a) no CPF sob o nº ${formatCPF(person.representativeCpf)}` : '';
      segments.push(`neste ato representada por ${clean(person.representativeName).toUpperCase()}${role ? `, ${role}` : ''}${cpf}`);
    }
    return { name, rest: `${segments.join(', ')}.` };
  }
  const name = clean(person.name).toUpperCase();
  const segments = [];
  const identity = joinParts([person.nationality, person.maritalStatus, person.profession]);
  if (identity) segments.push(identity);
  if (person.rg) {
    const issuer = clean(person.rgIssuer);
    segments.push(`portador(a) do RG nº ${clean(person.rg)}${issuer ? ` - ${issuer}` : ''}`);
  }
  if (person.cpf) segments.push(`inscrito(a) no CPF sob o nº ${formatCPF(person.cpf)}`);
  if (person.email) segments.push(`e-mail: ${clean(person.email)}`);
  const address = buildAddress(person);
  if (address) segments.push(`residente e domiciliado(a) em ${address}`);
  if (options.quality) segments.push(`na qualidade de ${options.quality} do outorgante`);
  const rest = segments.length ? `${segments.join(', ')}.` : '';
  return { name, rest };
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

function drawHeader(doc, title = 'DECLARAÇÃO DE HIPOSSUFICIÊNCIA') {
  if (state.assets.logo) doc.addImage(state.assets.logo, 'PNG', 95.3, 5, 19.4, 30);
  if (state.assets.wordmark) doc.addImage(state.assets.wordmark, 'PNG', 74.1, 38, 61.8, 11);
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.35);
  doc.line(0, 56, 210, 56);
  doc.setFont('times', 'bold');
  doc.setTextColor(...GOLD);
  doc.setFontSize(12.5);
  doc.text(title, 105, 62, { align: 'center' });
}

function drawFooter(doc) {
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

function addContentPage(doc, title) {
  doc.addPage('a4', 'portrait');
  drawPageChrome(doc, title);
  return 69;
}

function drawLeadParagraph(doc, label, value, x, y, maxWidth, lineHeight) {
  if (!value && !label) return y;
  let restValue = value || '';
  let cursorY = y;

  if (label) {
    doc.setFont('times', 'bold');
    const labelLines = doc.splitTextToSize(label, maxWidth);
    doc.text(labelLines, x, cursorY, { lineHeightFactor: 1.18, align: 'justify', maxWidth });
    cursorY += labelLines.length * lineHeight;
  }

  if (restValue) {
    doc.setFont('times', 'normal');
    const lines = doc.splitTextToSize(restValue, maxWidth);
    doc.text(lines, x, cursorY, { lineHeightFactor: 1.18, align: 'justify', maxWidth });
    cursorY += lines.length * lineHeight;
  }

  return cursorY;
}

function drawPersonBlock(doc, heading, person, y, options = {}) {
  const { name, rest } = buildQualificationParts(person, options);
  if (!name && !rest) return y;

  let textY;
  if (heading) {
    doc.setFont('times', 'bold');
    doc.setFontSize(11.5);
    doc.setTextColor(...GOLD);
    doc.text(heading, TEXT_X, y + 5);
    textY = y + 11;
  } else {
    textY = y + 5;
  }

  drawIcon(doc, 'person', LEFT + 1, y + 1, 13, GOLD);
  doc.setFontSize(10.6);
  doc.setTextColor(...GRAY);
  const label = name ? `${name},` : null;
  const endY = drawLeadParagraph(doc, label, rest, TEXT_X, textY, TEXT_WIDTH, 5.1);

  return Math.max(endY, y + 22);
}

function drawSignature(doc, label, x, y, width = 78) {
  drawIcon(doc, 'pen', x - 6.5, y - 4.5, 4.4, GRAY);
  doc.setDrawColor(100, 100, 102);
  doc.setLineWidth(0.25);
  doc.line(x, y, x + width, y);
  doc.setFont('times', 'bold');
  doc.setTextColor(...GRAY);
  doc.setFontSize(10.5);
  doc.text(label, x + width / 2, y + 6, { align: 'center' });
}

function generateDocument(draft = getDraft()) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  doc.setProperties({
    title: 'Declaração de Hipossuficiência',
    author: 'Gregório & Morais Advogados',
    subject: 'Declaração de hipossuficiência gerada pelo sistema Gregório & Morais',
    keywords: encodePdfDraft(draft),
  });
  drawPageChrome(doc);

  let y = 69;
  doc.setFont('times', 'normal');
  doc.setFontSize(10.6);
  doc.setTextColor(...GRAY);
  doc.text(draft.person.type === 'pj' ? 'A declarante,' : 'Eu,', LEFT, y);
  y += 7;

  y = drawPersonBlock(doc, null, draft.person, y);

  if (draft.mode !== 'normal') {
    const title = draft.mode === 'under16' ? 'REPRESENTANTE' : 'ASSISTENTE';
    const quality = draft.mode === 'over16' ? clean(draft.guardian.relation) : '';
    y = drawPersonBlock(doc, title, draft.guardian, y, { quality });
  }

  y += 4;
  if (y > 240) y = addContentPage(doc);
  doc.setFont('times', 'bold');
  doc.setFontSize(11.5);
  doc.setTextColor(...GOLD);
  doc.text('— DECLARO —', 105, y, { align: 'center' });
  y += 8;

  const declaration = draft.person.type === 'pj'
    ? 'para todos os fins de direito e sob as penas da lei, que não possui condições de arcar com as despesas inerentes ao presente processo sem prejuízo da manutenção de suas atividades, necessitando, portanto, da Gratuidade da Justiça, nos termos do art. 98 e seguintes da Lei 13.105/2015 (Código de Processo Civil), devendo o benefício abranger todos os atos do processo.'
    : 'para todos os fins de direito e sob as penas da lei, que não tenho condições de arcar com as despesas inerentes ao presente processo, sem prejuízo do meu sustento e de minha família, necessitando, portanto, da Gratuidade da Justiça, nos termos do art. 98 e seguintes da Lei 13.105/2015 (Código de Processo Civil), devendo o benefício abranger todos os atos do processo.';
  doc.setFont('times', 'normal');
  doc.setFontSize(10.6);
  doc.setTextColor(...GRAY);
  const lines = doc.splitTextToSize(declaration, 172);
  doc.text(lines, LEFT, y, { lineHeightFactor: 1.25, align: 'justify', maxWidth: 172 });
  y += lines.length * 5.2 + 10;

  if (y > 248) y = addContentPage(doc);
  const location = clean(draft.document.location);
  const date = formatLongDate(draft.document.date);
  const closing = joinParts([location, date]);
  if (closing) {
    drawIcon(doc, 'calendar', LEFT, y - 4, 4, GOLD);
    doc.setFont('times', 'normal');
    doc.setFontSize(10.5);
    doc.setTextColor(...GRAY);
    doc.text(`${closing}.`, LEFT + 6, y);
    y += 14;
  } else {
    y += 6;
  }

  if (y > 246) y = addContentPage(doc);
  if (draft.person.type === 'pj') {
    drawSignature(doc, 'DECLARANTE/REPRESENTANTE LEGAL', 66, y, 78);
  } else if (draft.mode === 'under16') {
    drawSignature(doc, 'DECLARANTE/REPRESENTANTE', 66, y, 78);
  } else if (draft.mode === 'over16') {
    drawSignature(doc, 'DECLARANTE', 66, y, 78);
    y += 18;
    if (y > 246) y = addContentPage(doc);
    drawSignature(doc, 'ASSISTENTE', 66, y, 78);
  } else {
    drawSignature(doc, 'DECLARANTE', 66, y, 78);
  }

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

document.querySelectorAll('[data-mode]').forEach(button => {
  button.addEventListener('click', () => {
    state.mode = button.dataset.mode;
    updateModeUI();
    saveDraft();
    updatePreview();
  });
});

['person.cpf', 'person.representativeCpf', 'guardian.cpf'].forEach(name => {
  const input = form.elements[name];
  if (input) input.addEventListener('input', () => { input.value = formatCPF(input.value); });
});

['person.zip', 'guardian.zip'].forEach(name => {
  const input = form.elements[name];
  if (input) input.addEventListener('input', () => { input.value = formatZip(input.value); });
});

const personCnpj = form.elements['person.cnpj'];
if (personCnpj) personCnpj.addEventListener('input', () => { personCnpj.value = formatCNPJ(personCnpj.value); });

form.addEventListener('input', () => {
  saveDraft();
  updatePreview();
});

form.addEventListener('change', () => {
  updateModeUI();
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
  if (!confirm('Limpar todos os campos desta declaração?')) return;
  localStorage.removeItem(STORAGE_KEY);
  form.reset();
  state.mode = 'normal';
  form.elements['document.location'].value = 'Silvânia/GO';
  form.elements['document.date'].value = todayISO();
  form.elements['document.filename'].value = 'hipossuficiencia';
  updateModeUI();
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
