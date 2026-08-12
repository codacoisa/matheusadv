(function () {
  'use strict';

  const STORAGE_KEY = 'officejur::controle-pagamentos::data';
  const SYNC_STATE_KEY = 'officejur::controle-pagamentos::sync-state';
  const FILE_NAME = 'controle-pagamentos.json';
  const SCHEMA = 'officejur/controle-pagamentos-data';
  const VERSION = 1;
  const AUTO_SYNC_DELAY_MS = 1500;
  const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const COLORS = ['#b38731', '#17213a', '#667085', '#d9bd7a', '#067647', '#9e3b2f', '#46627f', '#8c6f2f'];
  const gistSettings = window.OfficeJurGistSettings;
  const access = window.OfficeJurGistAccessLease?.create();
  const gistClient = access?.gatedClient(window.OfficeJurGistClient) || window.OfficeJurGistClient;
  let localAccessAllowed = true;

  const state = {
    data: normalizeData({}),
    settings: normalizeSettings({}),
    selectedId: '',
    year: new Date().getFullYear(),
    tab: 'launches',
    editingPaymentId: '',
    modalEditingPaymentId: '',
    activeMonth: '',
    deleteConfirmStep: 1,
    pendingDeletePersonId: ''
  };

  const $ = (selector) => document.querySelector(selector);
  let autoSyncTimer = 0;
  let syncInFlight = null;
  let syncPending = false;

  const els = {
    cloudStatus: $('#cloud-status'),
    storageStatus: $('#storage-status'),
    personForm: $('#person-form'),
    personName: $('#person-name'),
    search: $('#search'),
    peopleList: $('#people-list'),
    emptyState: $('#empty-state'),
    personView: $('#person-view'),
    selectedName: $('#selected-name'),
    personSummary: $('#person-summary'),
    deletePerson: $('#delete-person'),
    tabs: document.querySelectorAll('.tabs button'),
    launchesTab: $('#launches-tab'),
    statsTab: $('#stats-tab'),
    paymentForm: $('#payment-form'),
    paymentMonth: $('#payment-month'),
    paymentAmount: $('#payment-amount'),
    paymentDate: $('#payment-date'),
    paymentNote: $('#payment-note'),
    paymentSubmit: $('#payment-submit'),
    cancelEdit: $('#cancel-edit'),
    previousYear: $('#previous-year'),
    nextYear: $('#next-year'),
    yearLabel: $('#year-label'),
    monthGrid: $('#month-grid'),
    metricTotal: $('#metric-total'),
    metricPaid: $('#metric-paid'),
    metricAverage: $('#metric-average'),
    metricLast: $('#metric-last'),
    pieChart: $('#pie-chart'),
    pieLegend: $('#pie-legend'),
    pieCaption: $('#pie-caption'),
    barChart: $('#bar-chart'),
    paymentsModal: $('#payments-modal'),
    paymentsTitle: $('#payments-title'),
    paymentsSubtitle: $('#payments-subtitle'),
    paymentsList: $('#payments-list'),
    closePayments: $('#close-payments'),
    addPaymentFromModal: $('#add-payment-from-modal'),
    modalPaymentForm: $('#modal-payment-form'),
    modalFormTitle: $('#modal-form-title'),
    modalFormHint: $('#modal-form-hint'),
    modalPaymentMonth: $('#modal-payment-month'),
    modalPaymentAmount: $('#modal-payment-amount'),
    modalPaymentDate: $('#modal-payment-date'),
    modalPaymentNote: $('#modal-payment-note'),
    modalPaymentSubmit: $('#modal-payment-submit'),
    cancelModalPayment: $('#cancel-modal-payment'),
    personDeleteModal: $('#person-delete-modal'),
    deleteTitle: $('#delete-title'),
    deleteMessage: $('#delete-message'),
    deleteNameRow: $('#delete-name-row'),
    deleteNameConfirm: $('#delete-name-confirm'),
    deleteError: $('#delete-error'),
    cancelDeletePerson: $('#cancel-delete-person'),
    confirmDeletePerson: $('#confirm-delete-person')
  };

  function uid() {
    if (crypto && crypto.randomUUID) return crypto.randomUUID();
    return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function todayISO() {
    return new Date().toISOString().slice(0, 10);
  }

  function currentMonthISO() {
    return new Date().toISOString().slice(0, 7);
  }

  function nowISO() {
    return new Date().toISOString();
  }

  function money(value) {
    return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function parseMoney(raw) {
    const normalized = String(raw || '')
      .replace(/[^\d,.-]/g, '')
      .replace(/\./g, '')
      .replace(',', '.');
    const value = Number(normalized);
    return Number.isFinite(value) ? Math.max(0, value) : 0;
  }

  function formatDate(value) {
    if (!value) return 'Sem data';
    const [year, month, day] = value.split('-').map(Number);
    if (!year || !month || !day) return value;
    return new Date(year, month - 1, day).toLocaleDateString('pt-BR');
  }

  function normalizePayment(payment) {
    const src = payment && typeof payment === 'object' ? payment : {};
    const month = /^\d{4}-\d{2}$/.test(src.month || '') ? src.month : currentMonthISO();
    const createdAt = src.createdAt || nowISO();
    return {
      id: src.id ? String(src.id) : uid(),
      month,
      amount: Number.isFinite(Number(src.amount)) ? Number(src.amount) : 0,
      paidAt: /^\d{4}-\d{2}-\d{2}$/.test(src.paidAt || '') ? src.paidAt : todayISO(),
      note: String(src.note || '').trim(),
      createdAt,
      updatedAt: src.updatedAt || createdAt
    };
  }

  function normalizePerson(person) {
    const src = person && typeof person === 'object' ? person : {};
    const createdAt = src.createdAt || nowISO();
    return {
      id: src.id ? String(src.id) : uid(),
      name: String(src.name || '').trim() || 'Sem nome',
      payments: Array.isArray(src.payments) ? src.payments.map(normalizePayment) : [],
      createdAt,
      updatedAt: src.updatedAt || createdAt
    };
  }

  function normalizeDeletedEntry(entry) {
    const src = entry && typeof entry === 'object' ? entry : {};
    const id = src.id ? String(src.id) : '';
    if (!id) return null;
    return {
      id,
      deletedAt: src.deletedAt || nowISO()
    };
  }

  function normalizeDeletedList(entries) {
    const map = new Map();
    (Array.isArray(entries) ? entries : []).forEach((entry) => {
      const normalized = normalizeDeletedEntry(entry);
      if (!normalized) return;
      const current = map.get(normalized.id);
      if (!current || normalized.deletedAt > current.deletedAt) {
        map.set(normalized.id, normalized);
      }
    });
    return Array.from(map.values()).sort((a, b) => a.id.localeCompare(b.id));
  }

  function normalizeData(data) {
    const src = data && typeof data === 'object' ? data : {};
    return {
      schema: SCHEMA,
      version: VERSION,
      updatedAt: src.updatedAt || nowISO(),
      people: Array.isArray(src.people) ? src.people.map(normalizePerson) : [],
      deletedPeople: normalizeDeletedList(src.deletedPeople),
      deletedPayments: normalizeDeletedList(src.deletedPayments)
    };
  }

  function markDeleted(collection, id, deletedAt) {
    if (!id) return;
    state.data[collection] = normalizeDeletedList([
      ...(state.data[collection] || []),
      { id, deletedAt: deletedAt || nowISO() }
    ]);
  }

  function loadData() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? normalizeData(currentStoredData(JSON.parse(saved))) : normalizeData({});
    } catch (_) {
      return normalizeData({});
    }
  }

  function currentStoredData(data) {
    if (!data || data.schema !== SCHEMA || data.version !== VERSION) {
      throw new Error('Os dados locais não usam o formato atual do Controle de Pagamentos.');
    }
    return data;
  }

  function loadSettings() {
    try {
      const syncState = JSON.parse(localStorage.getItem(SYNC_STATE_KEY) || '{}');
      const globalSettings = gistSettings.load();
      return normalizeSettings({ ...syncState, ...globalSettings });
    } catch (_) {
      return normalizeSettings({});
    }
  }

  function normalizeSettings(settings) {
    const src = settings && typeof settings === 'object' ? settings : {};
    return {
      gistId: String(src.gistId || '').trim(),
      token: String(src.token || '').trim(),
      autoSync: !!src.autoSync,
      lastSyncAt: String(src.lastSyncAt || '').trim(),
      lastSyncSignature: String(src.lastSyncSignature || '').trim()
    };
  }

  function saveSyncState() {
    state.settings = normalizeSettings(state.settings);
    localStorage.setItem(SYNC_STATE_KEY, JSON.stringify({
      lastSyncAt: state.settings.lastSyncAt,
      lastSyncSignature: state.settings.lastSyncSignature
    }));
    renderStatus();
  }

  function refreshGistCredentials() {
    state.settings = normalizeSettings({
      ...state.settings,
      ...gistSettings.load()
    });
    return state.settings;
  }

  function persist(options) {
    if (!localAccessAllowed) return;
    try { access?.canSync(state.settings.gistId); } catch (_) { showBlockedAccess(); return; }
    state.data = normalizeData({
      ...state.data,
      updatedAt: nowISO()
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data));
    render();
    if (options && options.skipAutoSync) return;
    refreshGistCredentials();
    if (state.settings.autoSync && state.settings.gistId && state.settings.token) {
      scheduleAutoSync();
    }
  }

  function scheduleAutoSync() {
    clearTimeout(autoSyncTimer);
    if (dataSignature(state.data) === state.settings.lastSyncSignature) return;
    autoSyncTimer = setTimeout(() => {
      pushToGist().catch((error) => renderStatus(error.message, 'err'));
    }, AUTO_SYNC_DELAY_MS);
  }

  function timestamp(record) {
    return String((record && (record.updatedAt || record.createdAt || record.deletedAt)) || '');
  }

  function isDeleted(record, deletedMap) {
    const deletedAt = deletedMap.get(record.id);
    return !!deletedAt && deletedAt >= timestamp(record);
  }

  function mergeDeletedEntries(left, right) {
    return normalizeDeletedList([...(left || []), ...(right || [])]);
  }

  function newerRecord(left, right) {
    if (!left) return right;
    if (!right) return left;
    return timestamp(right) > timestamp(left) ? right : left;
  }

  function latestTimestamp(values) {
    return values.map((value) => String(value || '')).filter(Boolean).sort().pop() || nowISO();
  }

  function dataTimestamp(data) {
    const normalized = normalizeData(data);
    const values = [normalized.updatedAt];
    normalized.people.forEach((person) => {
      values.push(person.createdAt, person.updatedAt);
      person.payments.forEach((payment) => values.push(payment.createdAt, payment.updatedAt));
    });
    normalized.deletedPeople.forEach((item) => values.push(item.deletedAt));
    normalized.deletedPayments.forEach((item) => values.push(item.deletedAt));
    return latestTimestamp(values);
  }

  function mergePayments(leftPayments, rightPayments, deletedPayments) {
    const deletedMap = new Map(deletedPayments.map((item) => [item.id, item.deletedAt]));
    const map = new Map();
    [...(leftPayments || []), ...(rightPayments || [])].map(normalizePayment).forEach((payment) => {
      const current = map.get(payment.id);
      map.set(payment.id, newerRecord(current, payment));
    });
    return Array.from(map.values())
      .filter((payment) => !isDeleted(payment, deletedMap))
      .sort((a, b) => String(b.paidAt).localeCompare(String(a.paidAt)) || a.id.localeCompare(b.id));
  }

  function mergePeople(leftPeople, rightPeople, deletedPeople, deletedPayments) {
    const deletedMap = new Map(deletedPeople.map((item) => [item.id, item.deletedAt]));
    const map = new Map();
    [...(leftPeople || []), ...(rightPeople || [])].map(normalizePerson).forEach((person) => {
      const current = map.get(person.id);
      if (!current) {
        map.set(person.id, person);
        return;
      }
      const winner = newerRecord(current, person);
      map.set(person.id, {
        ...winner,
        createdAt: current.createdAt < person.createdAt ? current.createdAt : person.createdAt,
        updatedAt: timestamp(winner),
        payments: mergePayments(current.payments, person.payments, deletedPayments)
      });
    });
    return Array.from(map.values())
      .filter((person) => !isDeleted(person, deletedMap))
      .map((person) => ({
        ...person,
        payments: mergePayments(person.payments, [], deletedPayments)
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR') || a.id.localeCompare(b.id));
  }

  function mergeData(leftData, rightData) {
    const left = normalizeData(leftData);
    const right = normalizeData(rightData);
    const deletedPeople = mergeDeletedEntries(left.deletedPeople, right.deletedPeople);
    const deletedPayments = mergeDeletedEntries(left.deletedPayments, right.deletedPayments);
    return normalizeData({
      schema: SCHEMA,
      updatedAt: latestTimestamp([dataTimestamp(left), dataTimestamp(right)]),
      people: mergePeople(left.people, right.people, deletedPeople, deletedPayments),
      deletedPeople,
      deletedPayments
    });
  }

  function stablePayment(payment) {
    return {
      id: payment.id,
      month: payment.month,
      amount: Number(payment.amount || 0),
      paidAt: payment.paidAt,
      note: payment.note || ''
    };
  }

  function stablePerson(person) {
    return {
      id: person.id,
      name: person.name,
      payments: person.payments
        .slice()
        .sort((a, b) => a.id.localeCompare(b.id))
        .map(stablePayment)
    };
  }

  function stableDataForSignature(data) {
    const normalized = normalizeData(data);
    return {
      schema: SCHEMA,
      version: VERSION,
      people: normalized.people
        .slice()
        .sort((a, b) => a.id.localeCompare(b.id))
        .map(stablePerson),
      deletedPeople: normalized.deletedPeople.slice().sort((a, b) => a.id.localeCompare(b.id)),
      deletedPayments: normalized.deletedPayments.slice().sort((a, b) => a.id.localeCompare(b.id))
    };
  }

  function dataSignature(data) {
    return JSON.stringify(stableDataForSignature(data));
  }

  function payloadSignature(payload) {
    return payload ? String(payload.backupSignature || '') : '';
  }

  function currentPayload(payload) {
    if (!payload || payload.schema !== SCHEMA || payload.version !== VERSION || typeof payload.backupSignature !== 'string'
      || !payload.data || typeof payload.data !== 'object') {
      throw new Error('O arquivo não usa o formato atual do Controle de Pagamentos.');
    }
    return payload.data;
  }

  function samePaymentContent(left, right) {
    return JSON.stringify(stablePayment(normalizePayment(left))) === JSON.stringify(stablePayment(normalizePayment(right)));
  }

  function selectedPerson() {
    return state.data.people.find((person) => person.id === state.selectedId) || null;
  }

  function paymentTotals(person) {
    const payments = person ? person.payments : [];
    const total = payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    const months = new Set(payments.map((payment) => payment.month));
    const last = payments.slice().sort((a, b) => String(b.paidAt).localeCompare(String(a.paidAt)))[0];
    return { total, paidMonths: months.size, average: months.size ? total / months.size : 0, last };
  }

  function renderStatus(message, tone) {
    const settings = state.settings;
    if (message) {
      els.storageStatus.textContent = message;
      els.storageStatus.style.color = tone === 'err' ? 'var(--danger)' : tone === 'ok' ? 'var(--ok)' : '';
      window.OfficeJurCloudStatus?.set(
        els.cloudStatus,
        tone === 'err' ? 'error' : tone === 'ok' ? 'synced' : 'syncing',
        message
      );
      return;
    }
    const warning = access?.warning?.();
    if (warning) {
      els.storageStatus.textContent = warning;
      els.storageStatus.style.color = 'var(--danger)';
      window.OfficeJurCloudStatus?.set(els.cloudStatus, 'blocked', warning);
      return;
    }
    const configured = Boolean(settings.gistId && settings.token);
    const mode = configured ? 'Nuvem configurada' : 'Salvo neste navegador';
    const last = settings.lastSyncAt ? ` - última sincronização: ${new Date(settings.lastSyncAt).toLocaleString('pt-BR')}` : '';
    els.storageStatus.textContent = `${mode}${last}.`;
    els.storageStatus.style.color = '';
    window.OfficeJurCloudStatus?.set(els.cloudStatus, configured ? 'configured' : 'local');
  }

  function renderPeople() {
    const query = els.search.value.trim().toLowerCase();
    const people = state.data.people
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
      .filter((person) => person.name.toLowerCase().includes(query));
    els.peopleList.innerHTML = '';
    people.forEach((person) => {
      const totals = paymentTotals(person);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `person-item${person.id === state.selectedId ? ' is-active' : ''}`;
      button.innerHTML = `<strong>${escapeHtml(person.name)}</strong><span>${totals.paidMonths} mês(es) - ${money(totals.total)}</span>`;
      button.addEventListener('click', () => {
        state.selectedId = person.id;
        render();
      });
      els.peopleList.appendChild(button);
    });
  }

  function renderPerson() {
    const person = selectedPerson();
    els.emptyState.hidden = !!person;
    els.personView.hidden = !person;
    if (!person) return;
    const totals = paymentTotals(person);
    els.selectedName.value = person.name;
    els.personSummary.textContent = `${totals.paidMonths} mês(es) pagos - ${money(totals.total)} recebidos`;
    els.launchesTab.hidden = state.tab !== 'launches';
    els.statsTab.hidden = state.tab !== 'stats';
    els.tabs.forEach((button) => button.classList.toggle('is-active', button.dataset.tab === state.tab));
    renderMonths(person);
    renderStats(person);
  }

  function renderMonths(person) {
    els.yearLabel.textContent = state.year;
    els.monthGrid.innerHTML = '';
    MONTHS.forEach((label, index) => {
      const monthKey = `${state.year}-${String(index + 1).padStart(2, '0')}`;
      const payments = person.payments.filter((payment) => payment.month === monthKey);
      const total = payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
      const last = payments.slice().sort((a, b) => String(b.paidAt).localeCompare(String(a.paidAt)))[0];
      const card = document.createElement('article');
      card.className = 'month-card';
      card.innerHTML = `
        <header>
          <h3>${label}</h3>
          <span class="badge ${payments.length ? 'paid' : ''}">${payments.length ? 'Pago' : 'Aberto'}</span>
        </header>
        <div class="value">${money(total)}</div>
        <p>${last ? `${formatDate(last.paidAt)}${last.note ? ` - ${escapeHtml(last.note)}` : ''}` : 'Sem lançamento para este mês.'}</p>
        <div class="month-actions">
          <button class="button ghost" type="button" data-add="${monthKey}">Lançar</button>
          <button class="button ghost" type="button" data-list="${monthKey}" ${payments.length ? '' : 'disabled'}>Ver lançamentos</button>
        </div>
      `;
      card.querySelector('[data-add]').addEventListener('click', () => {
        els.paymentMonth.value = monthKey;
        els.paymentAmount.focus();
      });
      card.querySelector('[data-list]').addEventListener('click', () => openPaymentsModal(monthKey));
      els.monthGrid.appendChild(card);
    });
  }

  function renderPaymentList(payments, monthKey) {
    if (!payments.length) {
      return '<div class="empty-payments">Nenhum lançamento registrado neste mês.</div>';
    }
    const ordered = payments.slice().sort((a, b) => String(a.paidAt).localeCompare(String(b.paidAt)));
    return `
      <div class="payment-list" data-month="${escapeHtml(monthKey)}">
        ${ordered.map((payment) => `
          <div class="payment-row">
            <div>
              <strong>${money(payment.amount)}</strong>
              <span>${formatDate(payment.paidAt)}${payment.note ? ` - ${escapeHtml(payment.note)}` : ''}</span>
            </div>
            <div class="payment-row-actions">
              <button class="mini-button" type="button" data-edit-payment="${escapeHtml(payment.id)}">Editar</button>
              <button class="mini-button danger" type="button" data-delete-payment="${escapeHtml(payment.id)}">Excluir</button>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  function monthTitle(monthKey) {
    const [year, month] = String(monthKey || '').split('-');
    const label = MONTHS[Number(month) - 1] || monthKey;
    return `${label} de ${year}`;
  }

  function openPaymentsModal(monthKey) {
    state.activeMonth = monthKey;
    renderPaymentsModal();
    els.paymentsModal.hidden = false;
  }

  function closePaymentsModal() {
    resetModalPaymentForm();
    els.paymentsModal.hidden = true;
    state.activeMonth = '';
  }

  function renderPaymentsModal() {
    const person = selectedPerson();
    if (!person || !state.activeMonth) return;
    const payments = person.payments.filter((payment) => payment.month === state.activeMonth);
    const total = payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    els.paymentsTitle.textContent = `Lançamentos de ${monthTitle(state.activeMonth)}`;
    els.paymentsSubtitle.textContent = `${person.name} - ${payments.length} lançamento(s) - ${money(total)}`;
    els.paymentsList.innerHTML = renderPaymentList(payments, state.activeMonth);
    els.paymentsList.querySelectorAll('[data-edit-payment]').forEach((button) => {
      button.addEventListener('click', () => editPaymentInModal(button.dataset.editPayment));
    });
    els.paymentsList.querySelectorAll('[data-delete-payment]').forEach((button) => {
      button.addEventListener('click', () => deletePayment(button.dataset.deletePayment));
    });
  }

  function resetModalPaymentForm() {
    state.modalEditingPaymentId = '';
    els.modalPaymentForm.reset();
    els.modalPaymentForm.hidden = true;
    els.addPaymentFromModal.hidden = false;
    els.modalFormTitle.textContent = 'Novo lançamento';
    els.modalFormHint.textContent = '';
    els.modalPaymentSubmit.textContent = 'Salvar lançamento';
  }

  function showModalPaymentForm(payment) {
    const person = selectedPerson();
    if (!person || !state.activeMonth) return;
    state.modalEditingPaymentId = payment ? payment.id : '';
    els.modalFormTitle.textContent = payment ? 'Editar lançamento' : 'Novo lançamento';
    els.modalFormHint.textContent = payment ? 'Altere os campos e salve sem sair desta lista.' : 'Informe o valor para este mês.';
    els.modalPaymentMonth.value = payment ? payment.month : state.activeMonth;
    els.modalPaymentAmount.value = payment ? String(payment.amount).replace('.', ',') : '';
    els.modalPaymentDate.value = payment ? payment.paidAt : todayISO();
    els.modalPaymentNote.value = payment ? payment.note || '' : '';
    els.modalPaymentSubmit.textContent = payment ? 'Salvar edição' : 'Salvar lançamento';
    els.modalPaymentForm.hidden = false;
    els.addPaymentFromModal.hidden = true;
    els.modalPaymentAmount.focus();
  }

  function editPaymentInModal(paymentId) {
    const person = selectedPerson();
    if (!person) return;
    const payment = person.payments.find((item) => item.id === paymentId);
    if (!payment) return;
    state.activeMonth = payment.month;
    showModalPaymentForm(payment);
  }

  function upsertModalPayment(event) {
    event.preventDefault();
    const person = selectedPerson();
    if (!person) return;
    const savedAt = nowISO();
    const payment = normalizePayment({
      id: state.modalEditingPaymentId || uid(),
      month: els.modalPaymentMonth.value,
      amount: parseMoney(els.modalPaymentAmount.value),
      paidAt: els.modalPaymentDate.value || todayISO(),
      note: els.modalPaymentNote.value,
      createdAt: savedAt,
      updatedAt: savedAt
    });
    if (!payment.amount) {
      els.modalPaymentAmount.focus();
      return;
    }
    const existingIndex = person.payments.findIndex((item) => item.id === state.modalEditingPaymentId);
    if (existingIndex >= 0) {
      if (samePaymentContent(person.payments[existingIndex], payment)) {
        state.activeMonth = payment.month;
        resetModalPaymentForm();
        renderPaymentsModal();
        return;
      }
      payment.createdAt = person.payments[existingIndex].createdAt || payment.createdAt;
      person.payments.splice(existingIndex, 1, payment);
    } else {
      person.payments.push(payment);
    }
    state.activeMonth = payment.month;
    state.year = Number(payment.month.slice(0, 4));
    resetModalPaymentForm();
    persist();
    renderPaymentsModal();
  }

  function renderStats(person) {
    const totals = paymentTotals(person);
    els.metricTotal.textContent = money(totals.total);
    els.metricPaid.textContent = String(totals.paidMonths);
    els.metricAverage.textContent = money(totals.average);
    els.metricLast.textContent = totals.last ? formatDate(totals.last.paidAt) : '-';
    renderPie(person);
    renderBars(person);
  }

  function renderPie(person) {
    const byYear = new Map();
    person.payments.forEach((payment) => {
      const year = payment.month.slice(0, 4);
      byYear.set(year, (byYear.get(year) || 0) + Number(payment.amount || 0));
    });
    const entries = Array.from(byYear.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    const total = entries.reduce((sum, item) => sum + item[1], 0);
    els.pieLegend.innerHTML = '';
    if (!total) {
      els.pieChart.style.background = '#eef1f5';
      els.pieCaption.textContent = 'sem dados';
      return;
    }
    let cursor = 0;
    const stops = entries.map(([year, value], index) => {
      const start = cursor;
      const end = cursor + (value / total) * 100;
      cursor = end;
      return `${COLORS[index % COLORS.length]} ${start}% ${end}%`;
    });
    els.pieChart.style.background = `conic-gradient(${stops.join(', ')})`;
    els.pieCaption.textContent = money(total);
    entries.forEach(([year, value], index) => {
      const row = document.createElement('div');
      row.className = 'legend-item';
      row.innerHTML = `<span class="legend-color" style="background:${COLORS[index % COLORS.length]}"></span><span>${year}</span><strong>${money(value)}</strong>`;
      els.pieLegend.appendChild(row);
    });
  }

  function renderBars(person) {
    const months = [];
    const start = new Date(state.year, new Date().getMonth() - 11, 1);
    for (let i = 0; i < 12; i += 1) {
      const date = new Date(start.getFullYear(), start.getMonth() + i, 1);
      months.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
    }
    const values = months.map((month) => person.payments
      .filter((payment) => payment.month === month)
      .reduce((sum, payment) => sum + Number(payment.amount || 0), 0));
    const max = Math.max(...values, 1);
    els.barChart.innerHTML = '';
    months.forEach((month, index) => {
      const [year, monthNumber] = month.split('-');
      const item = document.createElement('div');
      item.className = 'bar-item';
      item.title = `${month}/${year}: ${money(values[index])}`;
      item.innerHTML = `<div class="bar" style="height:${Math.max(3, (values[index] / max) * 220)}px"></div><span>${MONTHS[Number(monthNumber) - 1]}</span>`;
      els.barChart.appendChild(item);
    });
  }

  function render() {
    renderStatus();
    renderPeople();
    renderPerson();
  }

  function addPerson(name) {
    const person = normalizePerson({ name, payments: [] });
    state.data.people.push(person);
    state.selectedId = person.id;
    persist();
  }

  function resetPaymentForm(month) {
    state.editingPaymentId = '';
    els.paymentForm.reset();
    els.paymentMonth.value = month || currentMonthISO();
    els.paymentDate.value = todayISO();
    els.paymentSubmit.textContent = 'Lançar pagamento';
    els.cancelEdit.hidden = true;
  }

  function pendingDeletePerson() {
    return state.data.people.find((person) => person.id === state.pendingDeletePersonId) || null;
  }

  function openDeletePersonDialog() {
    const person = selectedPerson();
    if (!person) return;
    state.pendingDeletePersonId = person.id;
    state.deleteConfirmStep = 1;
    els.deleteNameConfirm.value = '';
    renderDeletePersonDialog();
  }

  function closeDeletePersonDialog() {
    state.pendingDeletePersonId = '';
    state.deleteConfirmStep = 1;
    els.deleteNameConfirm.value = '';
    els.deleteError.textContent = '';
    els.personDeleteModal.hidden = true;
  }

  function renderDeletePersonDialog() {
    const person = pendingDeletePerson();
    if (!person) {
      closeDeletePersonDialog();
      return;
    }
    const step = state.deleteConfirmStep;
    els.personDeleteModal.hidden = false;
    els.deleteError.textContent = '';
    els.deleteNameRow.hidden = step !== 3;
    els.personDeleteModal.querySelector('.delete-card').classList.toggle('is-danger', step >= 2);

    if (step === 1) {
      els.deleteTitle.textContent = 'Excluir pessoa';
      els.deleteMessage.textContent = `Tem certeza que deseja excluir ${person.name} e todos os lançamentos dela?`;
      els.confirmDeletePerson.textContent = 'Tenho certeza';
    } else if (step === 2) {
      els.deleteTitle.textContent = 'Atenção: exclusão definitiva';
      els.deleteMessage.textContent = `Confirme novamente: ${person.name} será removida com todo o histórico de pagamentos.`;
      els.confirmDeletePerson.textContent = 'Sim, quero excluir';
    } else {
      els.deleteTitle.textContent = 'Última confirmação';
      els.deleteMessage.textContent = `Para excluir definitivamente, digite o nome exatamente como está: ${person.name}`;
      els.confirmDeletePerson.textContent = 'Excluir definitivamente';
      setTimeout(() => els.deleteNameConfirm.focus(), 0);
    }
  }

  function advanceDeletePersonDialog() {
    const person = pendingDeletePerson();
    if (!person) {
      closeDeletePersonDialog();
      return;
    }
    if (state.deleteConfirmStep < 3) {
      state.deleteConfirmStep += 1;
      renderDeletePersonDialog();
      return;
    }
    if (els.deleteNameConfirm.value !== person.name) {
      els.deleteError.textContent = 'O nome digitado precisa estar exatamente igual ao cadastro.';
      els.deleteNameConfirm.focus();
      return;
    }
    deletePerson(person);
  }

  function deletePerson(person) {
    const deletedAt = nowISO();
    markDeleted('deletedPeople', person.id, deletedAt);
    person.payments.forEach((payment) => markDeleted('deletedPayments', payment.id, deletedAt));
    state.data.people = state.data.people.filter((item) => item.id !== person.id);
    state.selectedId = state.data.people[0] ? state.data.people[0].id : '';
    closeDeletePersonDialog();
    persist();
  }

  function upsertPayment(event) {
    event.preventDefault();
    const person = selectedPerson();
    if (!person) return;
    const savedAt = nowISO();
    const payment = normalizePayment({
      id: state.editingPaymentId || uid(),
      month: els.paymentMonth.value,
      amount: parseMoney(els.paymentAmount.value),
      paidAt: els.paymentDate.value || todayISO(),
      note: els.paymentNote.value,
      createdAt: savedAt,
      updatedAt: savedAt
    });
    if (!payment.amount) {
      els.paymentAmount.focus();
      return;
    }
    const existingIndex = person.payments.findIndex((item) => item.id === state.editingPaymentId);
    if (existingIndex >= 0) {
      if (samePaymentContent(person.payments[existingIndex], payment)) {
        state.year = Number(payment.month.slice(0, 4));
        resetPaymentForm(payment.month);
        render();
        return;
      }
      payment.createdAt = person.payments[existingIndex].createdAt || payment.createdAt;
      person.payments.splice(existingIndex, 1, payment);
    } else {
      person.payments.push(payment);
    }
    state.year = Number(payment.month.slice(0, 4));
    resetPaymentForm(payment.month);
    persist();
  }

  function deletePayment(paymentId) {
    const person = selectedPerson();
    if (!person) return;
    const payment = person.payments.find((item) => item.id === paymentId);
    if (!payment) return;
    if (!confirm(`Excluir o lançamento de ${money(payment.amount)} em ${formatDate(payment.paidAt)}?`)) return;
    const deletedAt = nowISO();
    markDeleted('deletedPayments', paymentId, deletedAt);
    person.payments = person.payments.filter((item) => item.id !== paymentId);
    if (state.editingPaymentId === paymentId) resetPaymentForm(payment.month);
    if (state.modalEditingPaymentId === paymentId) resetModalPaymentForm();
    persist();
    if (!els.paymentsModal.hidden) {
      state.activeMonth = payment.month;
      renderPaymentsModal();
    }
  }

  function clearMonth(monthKey) {
    const person = selectedPerson();
    if (!person) return;
    if (!confirm(`Remover lançamentos de ${monthKey}?`)) return;
    const paymentsToDelete = person.payments.filter((payment) => payment.month === monthKey);
    if (!paymentsToDelete.length) return;
    const deletedAt = nowISO();
    paymentsToDelete.forEach((payment) => markDeleted('deletedPayments', payment.id, deletedAt));
    person.payments = person.payments.filter((payment) => payment.month !== monthKey);
    persist();
  }

  async function fetchGistFile() {
    refreshGistCredentials();
    if (!state.settings.gistId || !state.settings.token) {
      throw new Error('Configure a nuvem nas Configurações do OfficeJur.');
    }
    const snapshot = await gistClient.gistSnapshot(
      state.settings.gistId,
      state.settings.token
    );
    const gist = snapshot.gist;
    const file = gist.files ? gist.files[FILE_NAME] : null;
    return { gist, file, revision: snapshot.etag };
  }

  async function readGistFilePayload(file) {
    if (!file) throw new Error('Arquivo não encontrado na nuvem.');
    return JSON.parse(await gistClient.text(file));
  }

  function gistPayload(data) {
    const normalized = normalizeData(data || state.data);
    return {
      schema: SCHEMA,
      version: VERSION,
      exportedAt: nowISO(),
      backupSignature: dataSignature(normalized),
      data: normalized
    };
  }

  async function pushToGist() {
    if (syncInFlight) {
      syncPending = true;
      return syncInFlight;
    }
    refreshGistCredentials();
    if (!state.settings.gistId || !state.settings.token) {
      throw new Error('Configure a nuvem nas Configurações do OfficeJur.');
    }

    syncInFlight = (async () => {
      window.OfficeJurCloudStatus?.set(els.cloudStatus, 'syncing');
      const { file, revision } = await fetchGistFile();
      let remoteData = normalizeData({});
      let remoteSignature = '';
      if (file) {
        const payload = await readGistFilePayload(file);
        remoteData = normalizeData(currentPayload(payload));
        remoteSignature = payloadSignature(payload);
      }

      const mergedData = mergeData(state.data, remoteData);
      const mergedSignature = dataSignature(mergedData);
      state.data = mergedData;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data));
      render();

      if (file && (mergedSignature === remoteSignature || mergedSignature === dataSignature(remoteData))) {
        state.settings.lastSyncAt = nowISO();
        state.settings.lastSyncSignature = mergedSignature;
        saveSyncState();
        setSyncStatus('Dados já estavam atualizados na nuvem.', 'ok');
        return;
      }

      await gistClient.patch(
        state.settings.gistId,
        state.settings.token,
        {
          [FILE_NAME]: {
            content: JSON.stringify(gistPayload(mergedData), null, 2)
          }
        },
        { etag: revision }
      );
      state.settings.lastSyncAt = nowISO();
      state.settings.lastSyncSignature = mergedSignature;
      saveSyncState();
      setSyncStatus('Dados sincronizados com a nuvem.', 'ok');
    })();

    try {
      await syncInFlight;
    } finally {
      syncInFlight = null;
      if (syncPending) {
        syncPending = false;
        await pushToGist();
      }
    }
  }

  function setSyncStatus(message, tone) {
    renderStatus(message, tone);
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    }[char]));
  }

  function bind() {
    els.personForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const name = els.personName.value.trim();
      if (!name) return;
      els.personName.value = '';
      addPerson(name);
    });
    els.search.addEventListener('input', renderPeople);
    els.selectedName.addEventListener('change', () => {
      const person = selectedPerson();
      if (!person) return;
      const nextName = els.selectedName.value.trim() || person.name;
      if (nextName === person.name) {
        els.selectedName.value = person.name;
        return;
      }
      person.name = nextName;
      person.updatedAt = nowISO();
      persist();
    });
    els.deletePerson.addEventListener('click', openDeletePersonDialog);
    els.tabs.forEach((button) => button.addEventListener('click', () => {
      state.tab = button.dataset.tab;
      render();
    }));
    els.paymentForm.addEventListener('submit', upsertPayment);
    els.cancelEdit.addEventListener('click', () => resetPaymentForm(els.paymentMonth.value));
    els.previousYear.addEventListener('click', () => {
      state.year -= 1;
      renderPerson();
    });
    els.nextYear.addEventListener('click', () => {
      state.year += 1;
      renderPerson();
    });
    els.closePayments.addEventListener('click', closePaymentsModal);
    els.paymentsModal.addEventListener('click', (event) => {
      if (event.target === els.paymentsModal) closePaymentsModal();
    });
    els.addPaymentFromModal.addEventListener('click', () => {
      showModalPaymentForm(null);
    });
    els.modalPaymentForm.addEventListener('submit', upsertModalPayment);
    els.cancelModalPayment.addEventListener('click', resetModalPaymentForm);
    els.cancelDeletePerson.addEventListener('click', closeDeletePersonDialog);
    els.confirmDeletePerson.addEventListener('click', advanceDeletePersonDialog);
    els.deleteNameConfirm.addEventListener('input', () => {
      els.deleteError.textContent = '';
    });
    els.deleteNameConfirm.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') advanceDeletePersonDialog();
    });
    els.personDeleteModal.addEventListener('click', (event) => {
      if (event.target === els.personDeleteModal) closeDeletePersonDialog();
    });
  }

  async function bootstrapAccess() {
    localAccessAllowed = await access?.guard('controle-pagamentos', () => {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(SYNC_STATE_KEY);
      state.data = normalizeData({});
    }) ?? true;
    if (localAccessAllowed) {
      state.data = loadData();
      state.settings = loadSettings();
      return true;
    }
    showBlockedAccess();
    return false;
  }

  function showBlockedAccess() {
    localAccessAllowed = false;
    state.data = normalizeData({});
    window.OfficeJurLocalAccessBlocked?.render({
      container: document.querySelector('main'),
      settingsHref: '../../configuracoes/',
      statusElement: els.cloudStatus,
      footer: document.querySelector('office-site-footer'),
    });
  }

  async function runGistAction(action, loadingMessage) {
    try {
      setSyncStatus(loadingMessage, '');
      await action();
      render();
    } catch (error) {
      setSyncStatus(access?.warning?.() || (error && error.message ? error.message : 'Falha ao acessar a nuvem.'), 'err');
    }
  }

  els.paymentMonth.value = currentMonthISO();
  els.paymentDate.value = todayISO();
  access?.subscribe((lease) => {
    if (['stale', 'unverified', 'purging', 'purged'].includes(lease.phase)) showBlockedAccess();
  });
  void bootstrapAccess().then((allowed) => {
    if (!allowed) return;
    bind();
    state.selectedId = state.data.people[0] ? state.data.people[0].id : '';
    render();
    if (state.settings.gistId && state.settings.token) runGistAction(pushToGist, 'Sincronizando ao abrir...');
  });
})();
