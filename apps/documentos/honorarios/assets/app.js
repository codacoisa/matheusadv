const STORAGE_KEY = 'officejur-documentos-honorarios-draft';
const form = document.getElementById('document-form');
const preview = document.getElementById('preview');
const loading = document.getElementById('preview-loading');
const pageCount = document.getElementById('page-count');
const clausesList = document.getElementById('clauses-list');
const clausesToggle = document.getElementById('clauses-toggle');
const clausesHint = document.getElementById('clauses-hint');
const pagamentoPersonalizadoField = document.getElementById('pagamento-personalizado-field');
const fixedModeField = document.getElementById('fixed-mode-field');
const totalBlock = document.getElementById('total-block');
const cashDueField = document.getElementById('cash-due-field');
const installmentsBlock = document.getElementById('installments-block');
const monthlyBlock = document.getElementById('monthly-block');
const stagesBlock = document.getElementById('stages-block');
const successBlock = document.getElementById('success-block');
const agreementSummary = document.getElementById('agreement-summary');
const stageList = document.getElementById('stage-list');
const addStageBtn = document.getElementById('add-stage');
const peopleContainer = document.getElementById('people-container');
const addPersonBtn = document.getElementById('add-person');
const importBtn = document.getElementById('import');
const importFile = document.getElementById('import-file');

const DOCUMENT_CONFIG = window.OFFICEJUR_DOCUMENT_CONFIG;
const TEMPLATE_CONFIG = DOCUMENT_CONFIG.templates.honorarios;
const PDF_COLORS = DOCUMENT_CONFIG.pdf.colors;
const GOLD = PDF_COLORS.gold;
const GRAY = PDF_COLORS.gray;
const FOOTER_GRAY = PDF_COLORS.footerGray;
const MAPS_URL = DOCUMENT_CONFIG.pdf.footer.mapsUrl;
const WHATSAPP_URL = DOCUMENT_CONFIG.pdf.footer.whatsappUrl;
const LEFT = 19;
const WIDTH = 172;
const PEOPLE_LIMIT = 4;
const PDF_DRAFT_MARKER = TEMPLATE_CONFIG.draftMarker;
const DOCUMENT_HANDOFF_PREFIX = 'officejur-documentos-handoff-';
const DOCUMENT_HANDOFF_TTL = 5 * 60 * 1000;
const GIST_PROTECTED_MARKER = '__officejurGistProtected';
let gistProtectedDraft = false;

const PERSON_FIELD_GROUPS = [
  { fields: [
    { name: 'name', label: 'Nome completo', span: true, autocomplete: 'name', kind: 'pf' },
    { name: 'nationality', label: 'Nacionalidade', kind: 'pf' },
    { name: 'maritalStatus', label: 'Estado civil', kind: 'pf' },
    { name: 'profession', label: 'Profissão', kind: 'pf' },
    { name: 'rg', label: 'RG', kind: 'pf' },
    { name: 'rgIssuer', label: 'Órgão expedidor', kind: 'pf' },
    { name: 'cpf', label: 'CPF', mask: 'cpf', kind: 'pf' },
    { name: 'companyName', label: 'Razão social', span: true, kind: 'pj' },
    { name: 'tradeName', label: 'Nome fantasia', kind: 'pj' },
    { name: 'cnpj', label: 'CNPJ', mask: 'cnpj', kind: 'pj' },
    { name: 'representativeName', label: 'Representante legal', span: true, kind: 'pj' },
    { name: 'representativeRole', label: 'Cargo/qualidade', kind: 'pj' },
    { name: 'representativeCpf', label: 'CPF do representante', mask: 'cpf', kind: 'pj' },
    { name: 'phone', label: 'Telefone/WhatsApp' },
    { name: 'email', label: 'E-mail', span: true, type: 'email', autocomplete: 'email' },
  ] },
  { sublegend: 'Endereço', fields: [
    { name: 'street', label: 'Logradouro', span: true, autocomplete: 'street-address' },
    { name: 'number', label: 'Número' },
    { name: 'complement', label: 'Complemento' },
    { name: 'neighborhood', label: 'Bairro' },
    { name: 'city', label: 'Cidade', autocomplete: 'address-level2' },
    { name: 'state', label: 'UF', maxlength: 2, autocomplete: 'address-level1' },
    { name: 'zip', label: 'CEP', autocomplete: 'postal-code', mask: 'zip' },
  ] },
];

const CONTRATADA_TEXT = TEMPLATE_CONFIG.contractedPartyText;
const DEFAULT_CLAUSES = TEMPLATE_CONFIG.clauses;

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
  document(doc, x, y, s, color) {
    strokeIcon(doc, color, s * 0.07, () => {
      doc.roundedRect(x + s * 0.14, y, s * 0.72, s, s * 0.06, s * 0.06, 'S');
      [0.3, 0.5, 0.7].forEach(fy => doc.line(x + s * 0.27, y + s * fy, x + s * 0.73, y + s * fy));
    });
  },
  check(doc, x, y, s, color) {
    strokeIcon(doc, color, s * 0.08, () => {
      doc.circle(x + s / 2, y + s / 2, s / 2 - s * 0.04, 'S');
      doc.line(x + s * 0.28, y + s * 0.52, x + s * 0.44, y + s * 0.68);
      doc.line(x + s * 0.44, y + s * 0.68, x + s * 0.74, y + s * 0.32);
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
  formatCNPJ,
  formatCPF,
  formatLongDate,
  formatPhone,
  formatZip,
  joinParts,
  representationClause,
  representativesOf,
  todayISO,
} = window.OfficeJurDocumentUtils;
const normalizeFilename = value => window.OfficeJurDocumentUtils.normalizeFilename(value, 'contrato-de-honorarios');

function getDraft() {
  const draft = { people: [], params: {}, document: {}, clauses: {} };
  for (const element of form.elements) {
    if (!element.name) continue;
    const parts = element.name.split('.');
    if (parts[0] === 'clauses') {
      const [, id, field] = parts;
      draft.clauses[id] = draft.clauses[id] || {};
      draft.clauses[id][field] = element.type === 'checkbox' ? element.checked : element.value;
    } else if (parts[0] === 'people') {
      const [, index, field] = parts;
      const i = Number(index);
      draft.people[i] = draft.people[i] || {};
      draft.people[i][field] = element.value;
    } else {
      const [group, field] = parts;
      if (draft[group]) draft[group][field] = element.value;
    }
  }
  peopleContainer.querySelectorAll('.person-card').forEach((card, index) => {
    let representatives = [];
    try { representatives = JSON.parse(card.dataset.representatives || '[]'); } catch { representatives = []; }
    if (!representatives.length || !draft.people[index]) return;
    representatives[0] = {
      ...representatives[0],
      name: draft.people[index].representativeName || '',
      role: draft.people[index].representativeRole || '',
      cpf: draft.people[index].representativeCpf || '',
    };
    draft.people[index].representatives = representatives;
  });
  if (!draft.people.length) draft.people = [{}];
  return draft;
}

function setDraft(draft) {
  for (const element of form.elements) {
    if (!element.name) continue;
    const parts = element.name.split('.');
    if (parts[0] === 'clauses' || parts[0] === 'people') continue;
    const [group, field] = parts;
    const value = draft?.[group]?.[field];
    if (value != null) element.value = value;
  }
  if (!form.elements['document.location'].value) form.elements['document.location'].value = TEMPLATE_CONFIG.defaultLocation;
  if (!form.elements['document.date'].value) form.elements['document.date'].value = todayISO();
  if (draft?.params?.entradaForma === 'misto' && !draft?.params?.parteFixaForma) {
    form.elements['params.parteFixaForma'].value = 'vista';
  }
  renderStages(form.elements['params.etapas'].value);
  updateAgreementEditor();
}

function renderPeopleUI(savedPeople) {
  const people = savedPeople && savedPeople.length ? savedPeople : [{}];
  peopleContainer.replaceChildren();

  people.forEach((person, index) => {
    const personType = person.type === 'pj' ? 'pj' : 'pf';
    const card = document.createElement('div');
    card.className = 'person-card';
    card.dataset.representatives = JSON.stringify(Array.isArray(person.representatives) ? person.representatives : []);

    const head = document.createElement('div');
    head.className = 'person-card-head';
    const title = document.createElement('strong');
    title.textContent = people.length > 1 ? `Contratante ${index + 1}` : 'Contratante';
    head.appendChild(title);
    if (index > 0) {
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'remove-person';
      removeBtn.textContent = '×';
      removeBtn.setAttribute('aria-label', `Remover contratante ${index + 1}`);
      removeBtn.addEventListener('click', () => removePerson(index));
      head.appendChild(removeBtn);
    }
    card.appendChild(head);

    const typeLabel = document.createElement('label');
    typeLabel.textContent = 'Tipo de pessoa';
    const typeSelect = document.createElement('select');
    typeSelect.name = `people.${index}.type`;
    typeSelect.append(
      new Option('Pessoa física', 'pf'),
      new Option('Pessoa jurídica', 'pj'),
    );
    typeSelect.value = personType;
    typeSelect.addEventListener('change', () => {
      const draft = getDraft();
      renderPeopleUI(draft.people);
      saveDraft();
      updatePreview();
    });
    typeLabel.appendChild(typeSelect);
    card.appendChild(typeLabel);

    const linkedRepresentatives = representativesOf(person);
    if (personType === 'pj' && linkedRepresentatives.length > 1) {
      const summary = document.createElement('p');
      summary.className = 'representatives-summary';
      summary.textContent = `Representantes vinculados: ${linkedRepresentatives.map(item => item.name).join('; ')}.`;
      card.appendChild(summary);
    }

    PERSON_FIELD_GROUPS.forEach(group => {
      if (group.sublegend) {
        const sub = document.createElement('div');
        sub.className = 'sub-legend';
        sub.textContent = group.sublegend;
        card.appendChild(sub);
      }
      const grid = document.createElement('div');
      grid.className = 'field-grid';
      group.fields.forEach(field => {
        if (field.kind && field.kind !== personType) return;
        const label = document.createElement('label');
        if (field.span) label.className = 'span-2';
        label.textContent = field.label;
        const input = document.createElement('input');
        input.name = `people.${index}.${field.name}`;
        if (field.type) input.type = field.type;
        if (field.autocomplete) input.autocomplete = field.autocomplete;
        if (field.maxlength) input.maxLength = field.maxlength;
        if (field.mask) input.inputMode = 'numeric';
        input.value = person[field.name] || '';
        label.appendChild(input);
        grid.appendChild(label);
      });
      card.appendChild(grid);
    });

    peopleContainer.appendChild(card);
  });

  peopleContainer.querySelectorAll('input').forEach(input => {
    const field = input.name.split('.').pop();
    const formatter = ['cpf', 'representativeCpf'].includes(field) ? formatCPF
      : field === 'cnpj' ? formatCNPJ : field === 'zip' ? formatZip : field === 'phone' ? formatPhone : null;
    if (formatter) input.addEventListener('input', () => { input.value = formatter(input.value); });
  });

  addPersonBtn.disabled = people.length >= PEOPLE_LIMIT;
  addPersonBtn.textContent = people.length >= PEOPLE_LIMIT
    ? `Limite de ${PEOPLE_LIMIT} contratantes atingido`
    : '+ Adicionar contratante';
}

function removePerson(index) {
  const draft = getDraft();
  draft.people.splice(index, 1);
  renderPeopleUI(draft.people);
  saveDraft();
  updatePreview();
}

function joinQualifications(list) {
  const items = list.filter(Boolean);
  if (!items.length) return '';
  if (items.length === 1) return items[0];
  const trimmed = items.map(t => (t.endsWith('.') ? t.slice(0, -1) : t));
  return `${trimmed.slice(0, -1).join('; ')}; e ${trimmed[trimmed.length - 1]}.`;
}

function saveDraft() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...getDraft(), ...(gistProtectedDraft ? { [GIST_PROTECTED_MARKER]: true } : {}) }));
}

function loadDraft() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

function consumeDocumentHandoff() {
  const url = new URL(window.location.href);
  const token = url.searchParams.get('handoff');
  if (!token) return null;
  url.searchParams.delete('handoff');
  history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  const key = `${DOCUMENT_HANDOFF_PREFIX}${token}`;
  const raw = localStorage.getItem(key);
  localStorage.removeItem(key);
  if (!raw) return null;
  try {
    const payload = JSON.parse(raw);
    const validAge = Number(payload.createdAt) > 0
      && Date.now() - Number(payload.createdAt) <= DOCUMENT_HANDOFF_TTL;
    if (payload.version !== 2 || payload.source !== 'financeiro'
      || payload.target !== 'honorarios' || !validAge
      || !payload.person || typeof payload.person !== 'object') return null;
    return payload.person;
  } catch {
    return null;
  }
}

function encodePdfDraft(draft) {
  const portable = { ...draft };
  delete portable[GIST_PROTECTED_MARKER];
  return window.OfficeJurDocumentUtils.encodePdfDraft(PDF_DRAFT_MARKER, portable);
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
  gistProtectedDraft = false;
  renderClausesUI(draft.clauses || {});
  const anyEditing = Object.values(draft.clauses || {}).some(clause => clause.editing);
  setClausesToggle(anyEditing);
  renderPeopleUI(draft.people);
  setDraft(draft);
  saveDraft();
  updatePreview();
}

function parseStages(value) {
  try {
    const stages = JSON.parse(value || '[]');
    return Array.isArray(stages) ? stages : [];
  } catch {
    return [];
  }
}

function stageDraft() {
  return [...stageList.querySelectorAll('.stage-row')].map(row => ({
    description: row.querySelector('[data-stage="description"]').value,
    amount: row.querySelector('[data-stage="amount"]').value,
    dueDate: row.querySelector('[data-stage="dueDate"]').value,
  }));
}

function syncStagesField() {
  form.elements['params.etapas'].value = JSON.stringify(stageDraft());
}

function addStageRow(stage = {}) {
  const row = document.createElement('div');
  row.className = 'stage-row';
  const description = document.createElement('input');
  description.dataset.stage = 'description';
  description.placeholder = 'Descrição da etapa';
  description.setAttribute('aria-label', 'Descrição da etapa');
  description.value = stage.description || '';
  const amount = document.createElement('input');
  amount.dataset.stage = 'amount';
  amount.inputMode = 'decimal';
  amount.placeholder = 'Valor (R$)';
  amount.setAttribute('aria-label', 'Valor da etapa');
  amount.value = stage.amount || '';
  const dueDate = document.createElement('input');
  dueDate.dataset.stage = 'dueDate';
  dueDate.type = 'date';
  dueDate.setAttribute('aria-label', 'Vencimento da etapa');
  dueDate.value = stage.dueDate || '';
  const removeButton = document.createElement('button');
  removeButton.type = 'button';
  removeButton.className = 'remove-stage';
  removeButton.setAttribute('aria-label', 'Remover etapa');
  removeButton.textContent = '×';
  removeButton.addEventListener('click', () => {
    row.remove();
    syncStagesField();
    saveDraft();
    updateAgreementEditor();
    updatePreview();
  });
  row.append(description, amount, dueDate, removeButton);
  stageList.appendChild(row);
}

function renderStages(value) {
  stageList.replaceChildren();
  parseStages(value).forEach(addStageRow);
}

function fixedMode() {
  const forma = form.elements['params.entradaForma']?.value;
  return forma === 'misto' ? form.elements['params.parteFixaForma']?.value : forma;
}

function updateAgreementEditor() {
  const forma = form.elements['params.entradaForma']?.value;
  const fixed = fixedMode();
  fixedModeField.hidden = forma !== 'misto';
  totalBlock.hidden = !['vista', 'parcelado'].includes(fixed);
  cashDueField.hidden = fixed !== 'vista';
  installmentsBlock.hidden = fixed !== 'parcelado';
  monthlyBlock.hidden = fixed !== 'mensal';
  stagesBlock.hidden = fixed !== 'etapas';
  successBlock.hidden = !['exito', 'misto'].includes(forma);
  pagamentoPersonalizadoField.hidden = forma !== 'personalizado';

  const labels = {
    vista: 'Valor à vista',
    parcelado: 'Entrada e parcelas',
    mensal: 'Mensalidades',
    etapas: 'Pagamento por etapas',
    exito: 'Somente êxito',
    misto: fixed ? `Parte fixa (${labelsForFixed(fixed)}) e êxito` : 'Escolha a forma da parte fixa',
    personalizado: 'Condição personalizada',
  };
  agreementSummary.textContent = labels[forma] || 'Selecione a modalidade';
}

function labelsForFixed(value) {
  return ({ vista: 'à vista', parcelado: 'parcelada', mensal: 'mensal', etapas: 'por etapas' })[value] || '';
}

function autoSizeTextarea(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = `${textarea.scrollHeight}px`;
}

function autoSizeAllClauseTextareas() {
  clausesList.querySelectorAll('.clause-text').forEach(autoSizeTextarea);
}

function renderClausesUI(savedClauses = {}) {
  clausesList.replaceChildren();
  DEFAULT_CLAUSES.forEach((clause, index) => {
    const saved = savedClauses[clause.id] || {};
    const editing = saved.editing === true;
    const text = saved.text !== undefined ? saved.text : clause.text;

    const item = document.createElement('div');
    item.className = 'clause-item' + (editing ? ' is-editing' : '');

    const head = document.createElement('label');
    head.className = 'clause-head';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.name = `clauses.${clause.id}.editing`;
    checkbox.checked = editing;
    const span = document.createElement('span');
    span.textContent = `${index + 1}. ${clause.title}`;
    const small = document.createElement('small');
    small.textContent = 'Editar';
    span.appendChild(small);
    head.appendChild(checkbox);
    head.appendChild(span);

    const textarea = document.createElement('textarea');
    textarea.className = 'clause-text';
    textarea.name = `clauses.${clause.id}.text`;
    textarea.rows = 2;
    textarea.value = text;
    textarea.readOnly = !editing;

    checkbox.addEventListener('change', () => {
      item.classList.toggle('is-editing', checkbox.checked);
      textarea.readOnly = !checkbox.checked;
      autoSizeTextarea(textarea);
    });
    textarea.addEventListener('input', () => autoSizeTextarea(textarea));

    item.appendChild(head);
    item.appendChild(textarea);
    clausesList.appendChild(item);
  });
}

function setClausesToggle(open) {
  clausesList.hidden = !open;
  clausesHint.hidden = !open;
  clausesToggle.textContent = open
    ? 'Ocultar cláusulas contratuais'
    : `Mostrar cláusulas contratuais (${DEFAULT_CLAUSES.length})`;
  if (open) requestAnimationFrame(autoSizeAllClauseTextareas);
}

function getActiveClauses(draft) {
  return DEFAULT_CLAUSES
    .map(clause => {
      const saved = draft.clauses?.[clause.id] || {};
      return {
        title: clause.title,
        text: saved.text !== undefined ? saved.text : clause.text,
      };
    })
    .filter(c => clean(c.text));
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

function buildContratanteText(person) {
  const segments = [];
  if (person.type === 'pj') {
    const company = clean(person.companyName).toUpperCase();
    if (company) segments.push(company);
    segments.push('pessoa jurídica de direito privado');
    if (person.cnpj) segments.push(`inscrita no CNPJ sob o nº ${formatCNPJ(person.cnpj)}`);
    if (person.tradeName) segments.push(`nome fantasia ${clean(person.tradeName)}`);
    if (person.email) segments.push(`e-mail: ${clean(person.email)}`);
    if (person.phone) segments.push(`telefone/WhatsApp: ${formatPhone(person.phone)}`);
    const address = buildAddress(person);
    if (address) segments.push(`com sede em ${address}`);
    const representation = representationClause(person);
    if (representation) segments.push(representation);
    return segments.length > 1 ? `${segments.join(', ')}.` : '';
  }
  const identity = joinParts([
    clean(person.name).toUpperCase(),
    person.nationality,
    person.maritalStatus,
    person.profession,
  ]);
  if (identity) segments.push(identity);
  if (person.rg) {
    const issuer = clean(person.rgIssuer);
    segments.push(`portador(a) do RG nº ${clean(person.rg)}${issuer ? ` - ${issuer}` : ''}`);
  }
  if (person.cpf) segments.push(`inscrito(a) no CPF sob o nº ${formatCPF(person.cpf)}`);
  if (person.email) segments.push(`e-mail: ${clean(person.email)}`);
  if (person.phone) segments.push(`telefone/WhatsApp: ${formatPhone(person.phone)}`);
  const address = buildAddress(person);
  if (address) segments.push(`residente e domiciliado(a) em ${address}`);
  return segments.length ? `${segments.join(', ')}.` : '';
}

function buildHonorariosBullets(p) {
  const bullets = [];
  const forma = clean(p.entradaForma);
  const percentual = clean(p.exitoPercentual);
  const base = clean(p.exitoBase) || 'proveito econômico efetivamente obtido';
  const condicaoExito = clean(p.exitoCondicao) || 'houver recebimento ou disponibilização do proveito econômico ao CONTRATANTE';
  const successTiming = /^(quando|após|com|no|na|nos|nas|em)\b/i.test(condicaoExito)
    ? condicaoExito : `quando ${condicaoExito}`;

  const contractDate = value => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(clean(value))) return clean(value);
    const [year, month, day] = value.split('-');
    return `${day}/${month}/${year}`;
  };
  const dueText = value => clean(value) ? `, com vencimento em ${contractDate(value)}` : '';
  const addFixed = mode => {
    if (mode === 'vista' && clean(p.entradaValor)) {
      bullets.push({ label: 'Pagamento à vista', value: `O valor total de R$ ${clean(p.entradaValor)} será pago em parcela única${dueText(p.entradaVencimento)}.` });
    } else if (mode === 'parcelado' && clean(p.entradaValor)) {
      const entry = clean(p.entradaSinalValor);
      if (entry) {
        bullets.push({ label: 'Entrada', value: `Será paga entrada de R$ ${entry}${dueText(p.entradaSinalVencimento)}.` });
      }
      const count = clean(p.entradaParcelas) || '[número de]';
      const firstInstallmentDue = clean(p.entradaPrimeiraParcelaVencimento || p.entradaVencimento);
      const firstDue = firstInstallmentDue
        ? `, vencendo-se a primeira em ${contractDate(firstInstallmentDue)}` : '';
      const remaining = entry ? ', descontado o valor da entrada,' : '';
      bullets.push({ label: 'Parcelamento', value: `O valor total de R$ ${clean(p.entradaValor)}${remaining} será pago em ${count} parcelas iguais e sucessivas${firstDue}.` });
    } else if (mode === 'mensal' && clean(p.mensalValor || p.entradaValor)) {
      const value = clean(p.mensalValor || p.entradaValor);
      const count = clean(p.mensalQuantidade);
      const quantity = count ? `, pelo período de ${count} mensalidades` : '';
      bullets.push({ label: 'Honorários mensais', value: `Pela consultoria ou assessoria continuada, serão devidos honorários mensais de R$ ${value}${quantity}${dueText(p.mensalPrimeiroVencimento || p.entradaVencimento)}.` });
    } else if (mode === 'etapas') {
      const stages = parseStages(p.etapas).filter(stage => clean(stage.description) || clean(stage.amount) || clean(stage.dueDate));
      if (stages.length) {
        stages.forEach((stage, index) => {
          const amount = clean(stage.amount) ? `, no valor de R$ ${clean(stage.amount)}` : '';
          bullets.push({ label: `Etapa ${index + 1}`, value: `${clean(stage.description) || 'Etapa contratada'}${amount}${dueText(stage.dueDate)}.` });
        });
      } else {
        bullets.push({ label: 'Pagamento por etapas ou atos', value: 'Os honorários serão exigíveis à medida que forem concluídas as etapas ou praticados os atos contratados.' });
      }
    }
  };

  if (forma === 'misto') {
    addFixed(clean(p.parteFixaForma) || 'vista');
    if (percentual) bullets.push({ label: 'Parcela de êxito', value: `Será devido o percentual de ${percentual}% sobre ${base}, ${successTiming}.` });
  } else if (forma === 'exito' && percentual) {
    bullets.push({ label: 'Honorários exclusivamente de êxito', value: `Será devido o percentual de ${percentual}% sobre ${base}, ${successTiming}.` });
  } else if (forma === 'personalizado' && clean(p.pagamentoPersonalizado)) {
    bullets.push({ label: null, value: clean(p.pagamentoPersonalizado) });
  } else if (forma) {
    addFixed(forma);
  } else if (clean(p.entradaValor)) {
    bullets.push({ label: 'Honorários fixos', value: `Será devido o valor de R$ ${clean(p.entradaValor)}${dueText(p.entradaVencimento)}.` });
  }

  bullets.push({ label: 'Honorários de sucumbência', value: 'Pertencem integralmente à CONTRATADA.' });
  return bullets;
}

function buildRescisaoBullets(p) {
  const bullets = [{ label: null, value: 'Pagamento proporcional ao trabalho realizado.' }];
  if (clean(p.multaRescisoria)) bullets.push({ label: null, value: `Multa rescisória de ${clean(p.multaRescisoria)}%.` });
  return bullets;
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
  state.assets = await window.OfficeJurPdfTemplate.loadAssets();
}

function drawWatermark(doc) {
  window.OfficeJurPdfTemplate.drawWatermark(doc, state.assets);
}

function drawHeader(doc, title = TEMPLATE_CONFIG.headerTitle, fontSize = 11.5) {
  if (state.assets.logo) doc.addImage(state.assets.logo, 'PNG', 95.3, 5, 19.4, 30);
  if (state.assets.wordmark) doc.addImage(state.assets.wordmark, 'PNG', 74.1, 38, 61.8, 11);
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.35);
  doc.line(0, 56, 210, 56);
  doc.setFont('times', 'bold');
  doc.setTextColor(...GOLD);
  doc.setFontSize(fontSize);
  doc.text(title, 105, 62, { align: 'center' });
}

function drawFooter(doc) {
  window.OfficeJurPdfTemplate.drawFooter(doc, drawIcon);
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

function drawPersonIcon(doc, x, y) {
  drawIcon(doc, 'person', x + 1, y, 13, GOLD);
}

function drawSection(doc, title, text, y) {
  if (!text) return y;
  drawPersonIcon(doc, 20, y + 1);
  doc.setFont('times', 'bold');
  doc.setFontSize(11.5);
  doc.setTextColor(...GOLD);
  doc.text(title, 44, y + 5);
  doc.setFont('times', 'normal');
  doc.setFontSize(10.6);
  doc.setTextColor(...GRAY);
  const lines = doc.splitTextToSize(text, 145);
  doc.text(lines, 44, y + 11, { lineHeightFactor: 1.22, align: 'justify', maxWidth: 145 });
  return y + Math.max(27, 13 + lines.length * 5.1);
}

function drawLeadParagraph(doc, label, value, x, y, maxWidth, lineHeight) {
  if (!value && !label) return y;
  let cursorY = y;

  if (label) {
    doc.setFont('times', 'bold');
    const labelLines = doc.splitTextToSize(label, maxWidth);
    doc.text(labelLines, x, cursorY, { lineHeightFactor: 1.18, align: 'justify', maxWidth });
    cursorY += labelLines.length * lineHeight;
  }

  if (value) {
    doc.setFont('times', 'normal');
    const lines = doc.splitTextToSize(value, maxWidth);
    doc.text(lines, x, cursorY, { lineHeightFactor: 1.18, align: 'justify', maxWidth });
    cursorY += lines.length * lineHeight;
  }

  return cursorY;
}

function drawParamItem(doc, number, label, value, y, opts = {}) {
  if (!value) return y;
  const indent = opts.indent || 0;
  const x = LEFT + indent;
  const maxWidth = WIDTH - indent;
  const prefix = number != null ? `${number}. ` : '•  ';
  doc.setFontSize(10.3);
  doc.setTextColor(...GRAY);
  const y2 = label
    ? drawLeadParagraph(doc, `${prefix}${label}:`, value, x, y, maxWidth, 5)
    : drawLeadParagraph(doc, null, `${prefix}${value}`, x, y, maxWidth, 5);
  return y2 + 1.4;
}

function addContentPage(doc, title) {
  doc.addPage('a4', 'portrait');
  drawPageChrome(doc, title);
  return 69;
}

function drawParameters(doc, draft, y) {
  if (y > 235) y = addContentPage(doc, TEMPLATE_CONFIG.headerTitle);
  doc.setDrawColor(35, 35, 35);
  doc.setLineWidth(0.2);
  doc.line(LEFT, y, LEFT + WIDTH, y);
  doc.setFont('times', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...GOLD);
  doc.text('QUADRO DE PARÂMETROS DA CONTRATAÇÃO', 105, y + 6, { align: 'center' });
  doc.line(LEFT, y + 9, LEFT + WIDTH, y + 9);
  y += 15;

  const p = draft.params;
  const items = [];
  if (clean(p.objeto)) items.push({ label: 'Objeto da atuação jurídica', value: clean(p.objeto) });
  if (clean(p.limite)) items.push({ label: 'Limite da atuação', value: clean(p.limite) });
  items.push({ group: 'Honorários contratuais', bullets: buildHonorariosBullets(p) });
  if (clean(p.servicosIncluidos)) items.push({ label: 'Serviços incluídos', value: clean(p.servicosIncluidos) });
  if (clean(p.servicosNaoIncluidos)) items.push({ label: 'Serviços não incluídos (exigem aditivo contratual)', value: clean(p.servicosNaoIncluidos) });
  items.push({ group: 'Rescisão pelo CONTRATANTE', bullets: buildRescisaoBullets(p) });

  items.forEach((item, idx) => {
    const number = idx + 1;
    if (y > 250) y = addContentPage(doc, TEMPLATE_CONFIG.headerTitle);
    if (item.group) {
      doc.setFont('times', 'bold');
      doc.setFontSize(10.3);
      doc.setTextColor(...GRAY);
      doc.text(`${number}.  ${item.group}:`, LEFT, y);
      y += 5.2;
      item.bullets.forEach(b => {
        if (y > 252) y = addContentPage(doc, TEMPLATE_CONFIG.headerTitle);
        y = drawParamItem(doc, null, b.label, b.value, y, { indent: 8 });
      });
    } else {
      y = drawParamItem(doc, number, item.label, item.value, y, {});
    }
  });

  return y + 1;
}

function drawCommsNote(doc, draft, y) {
  if (y > 248) y = addContentPage(doc, TEMPLATE_CONFIG.headerTitle);
  const fixedForm = draft.params.entradaForma === 'misto'
    ? (draft.params.parteFixaForma || 'vista') : draft.params.entradaForma;
  const hasEntry = fixedForm === 'parcelado' && clean(draft.params.entradaSinalValor);
  if (hasEntry) {
    if (y > 248) y = addContentPage(doc, TEMPLATE_CONFIG.headerTitle);
    doc.setFont('times', 'normal');
    doc.setFontSize(7.6);
    doc.setTextColor(140, 140, 142);
    const footnote = 'Eventual valor pago a título de entrada possui natureza de remuneração pelos atos iniciais, análise do caso, orientação jurídica, atendimento, organização documental e demais providências já prestadas ou colocadas à disposição do CONTRATANTE, razão pela qual, em caso de desistência, revogação do mandato ou rescisão por iniciativa do CONTRATANTE, não será restituído, total ou parcialmente.';
    const fnLines = doc.splitTextToSize(footnote, WIDTH - 6);
    doc.text(fnLines, LEFT, y + 4, { lineHeightFactor: 1.2, align: 'justify', maxWidth: WIDTH - 6 });
    y += 4 + fnLines.length * 3.6;
  }

  if (y > 248) y = addContentPage(doc, TEMPLATE_CONFIG.headerTitle);
  doc.setFont('times', 'italic');
  doc.setFontSize(9.6);
  doc.setTextColor(...GRAY);
  const note = 'Os canais de comunicação estão devidamente informados no rodapé, e o prazo médio para resposta é de até 3 dias úteis.';
  const lines = doc.splitTextToSize(note, WIDTH - 20);
  doc.text(lines, 105, y + 6, { align: 'center', lineHeightFactor: 1.25 });
  y += 6 + lines.length * 4.6;

  doc.setFont('times', 'normal');
  return y;
}

function drawClausesSection(doc, y, clauses) {
  if (!clauses.length) return y;
  if (y > 250) y = addContentPage(doc, TEMPLATE_CONFIG.headerTitle);

  doc.setDrawColor(35, 35, 35);
  doc.setLineWidth(0.2);
  doc.line(LEFT, y, LEFT + WIDTH, y);
  doc.setFont('times', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...GOLD);
  doc.text('DAS CLÁUSULAS CONTRATUAIS', 105, y + 6, { align: 'center' });
  doc.line(LEFT, y + 9, LEFT + WIDTH, y + 9);
  y += 15;

  clauses.forEach((clause, idx) => {
    const number = idx + 1;
    const paragraphs = clause.text.split('\n').map(clean).filter(Boolean);
    if (y > 250) y = addContentPage(doc, TEMPLATE_CONFIG.headerTitle);
    doc.setFontSize(10.1);
    doc.setTextColor(...GRAY);
    y = drawLeadParagraph(doc, `${number}.  ${clause.title}:`, paragraphs[0] || '', LEFT, y, WIDTH, 4.9);
    for (let i = 1; i < paragraphs.length; i += 1) {
      if (y > 250) y = addContentPage(doc, TEMPLATE_CONFIG.headerTitle);
      y = drawLeadParagraph(doc, null, paragraphs[i], LEFT + 6, y, WIDTH - 6, 4.9);
    }
    y += 2.4;
  });

  return y;
}

function drawDeclaration(doc, draft, y) {
  if (y > 248) y = addContentPage(doc, TEMPLATE_CONFIG.headerTitle);
  doc.setFontSize(10.3);
  doc.setTextColor(...GRAY);
  y = drawLeadParagraph(doc, 'DECLARO', 'que li, compreendi e concordo com o Quadro de Parâmetros da Contratação e com todas as cláusulas deste instrumento.', LEFT, y, WIDTH, 5) + 4;

  const location = clean(draft.document.location);
  const date = formatLongDate(draft.document.date);
  const closing = joinParts([location, date]);
  if (closing) {
    if (y > 258) y = addContentPage(doc, TEMPLATE_CONFIG.headerTitle);
    drawIcon(doc, 'calendar', LEFT, y - 4, 4, GOLD);
    doc.setFont('times', 'normal');
    doc.setFontSize(10.5);
    doc.setTextColor(...GRAY);
    doc.text(`${closing}.`, LEFT + 6, y);
  }
  return y + 4;
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
  window.OfficeJurPdfTemplate.setProperties(doc, TEMPLATE_CONFIG, draft, encodePdfDraft);
  drawPageChrome(doc, TEMPLATE_CONFIG.headerTitle);

  let y = 69;
  const peopleList = draft.people && draft.people.length ? draft.people : [{}];
  const qualifications = peopleList.map(p => buildContratanteText(p));
  const activeCount = qualifications.filter(Boolean).length;
  const contratanteText = joinQualifications(qualifications);
  const contratanteTitle = activeCount > 1 ? 'CONTRATANTES' : 'CONTRATANTE';
  y = drawSection(doc, contratanteTitle, contratanteText, y);
  y = drawSection(doc, 'CONTRATADA', CONTRATADA_TEXT, y);
  y = drawParameters(doc, draft, y + 2);
  y = drawCommsNote(doc, draft, y + 3);

  const clauses = getActiveClauses(draft);
  y = drawClausesSection(doc, y + 4, clauses);
  y = drawDeclaration(doc, draft, y + 4);

  if (y > 242) y = addContentPage(doc, TEMPLATE_CONFIG.headerTitle);
  const signatureLabels = peopleList
    .filter(person => buildContratanteText(person))
    .flatMap(person => {
      if (person.type !== 'pj') return ['CONTRATANTE'];
      const representatives = representativesOf(person);
      return representatives.length
        ? representatives.map(item => `REPRESENTANTE LEGAL — ${item.name.toUpperCase()}`)
        : ['CONTRATANTE/REPRESENTANTE LEGAL'];
    });
  const labels = signatureLabels.length ? signatureLabels : ['CONTRATANTE'];
  let sigY = y + 16;
  for (const label of labels) {
    if (sigY > 258) sigY = addContentPage(doc, TEMPLATE_CONFIG.headerTitle) + 16;
    drawSignature(doc, label, 66, sigY, 78);
    sigY += 18;
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

form.elements['params.entradaForma']?.addEventListener('change', () => {
  updateAgreementEditor();
});

form.elements['params.parteFixaForma']?.addEventListener('change', updateAgreementEditor);

addStageBtn.addEventListener('click', () => {
  addStageRow();
  syncStagesField();
  saveDraft();
  updatePreview();
  stageList.lastElementChild?.querySelector('input')?.focus();
});

stageList.addEventListener('input', () => {
  syncStagesField();
});

clausesToggle.addEventListener('click', () => {
  setClausesToggle(clausesList.hidden);
});

form.addEventListener('input', () => {
  saveDraft();
  updatePreview();
});

form.addEventListener('change', () => {
  saveDraft();
  updatePreview();
});

addPersonBtn.addEventListener('click', () => {
  const draft = getDraft();
  if (draft.people.length >= PEOPLE_LIMIT) return;
  draft.people.push({});
  renderPeopleUI(draft.people);
  saveDraft();
  updatePreview();
  const cards = peopleContainer.querySelectorAll('.person-card');
  cards[cards.length - 1]?.querySelector('input')?.focus();
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

document.getElementById('clear').addEventListener('click', () => {
  if (!confirm('Limpar todos os campos deste contrato?')) return;
  localStorage.removeItem(STORAGE_KEY);
  gistProtectedDraft = false;
  form.reset();
  renderClausesUI({});
  setClausesToggle(false);
  renderPeopleUI([{}]);
  form.elements['document.location'].value = TEMPLATE_CONFIG.defaultLocation;
  form.elements['document.date'].value = todayISO();
  form.elements['document.filename'].value = 'contrato-de-honorarios';
  renderStages('');
  updateAgreementEditor();
  updatePreview();
});

window.addEventListener('beforeunload', () => {
  if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
});

async function init() {
  const transferredPerson = consumeDocumentHandoff();
  const draft = transferredPerson ? {
    people: [transferredPerson],
    params: {},
    document: {
      location: TEMPLATE_CONFIG.defaultLocation,
      date: todayISO(),
      filename: 'contrato-de-honorarios',
    },
    clauses: {},
  } : loadDraft();
  gistProtectedDraft = Boolean(transferredPerson || draft[GIST_PROTECTED_MARKER] === true);
  renderClausesUI(draft.clauses || {});
  const anyEditing = Object.values(draft.clauses || {}).some(c => c.editing);
  setClausesToggle(anyEditing);
  renderPeopleUI(draft.people);
  setDraft(draft);
  if (transferredPerson) saveDraft();
  try {
    await loadAssets();
  } catch (error) {
    console.error('Falha ao carregar identidade visual', error);
  }
  updatePreview();
}

init();
