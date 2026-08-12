(() => {
  'use strict';

  const storage = window.OfficeJurDocuments;
  const documentFiles = window.OfficeJurDocumentFiles;
  const templates = window.OfficeJurDocumentTemplates;
  const financeStorage = window.FinanceStorage;
  const financeDataStore = window.FinanceDataStore;
  const gistSettings = window.OfficeJurGistSettings;
  const access = window.OfficeJurGistAccessLease?.create();
  const gistClient = access?.gatedClient(window.OfficeJurGistClient) || window.OfficeJurGistClient;
  const cloudStatus = document.querySelector('#cloud-status');
  const institutionalTemplateConfig = window.OFFICEJUR_CONFIG?.documents?.institutionalDocxTemplate || null;
  const $ = (selector) => document.querySelector(selector);
  const AUTO_SAVE_INTERVAL = 10000;
  const AUTO_SAVE_KEY = 'officejur.documentos.autosave';
  const SYNC_STATE_KEY = 'officejur::documentos::sync-state';
  const state = { clients: [], documents: [], selectedId: '', query: '', dialogMode: 'create', dirty: false, deletedDocuments: [] };
  let officeReady = false;
  let officeOpenId = '';
  let officeSave = null;
  let autoSaveTimer = null;
  let syncTimer = null;
  let syncInFlight = null;
  let syncPending = false;
  let officePrintFrame = null;
  let officePrintUrl = '';

  const els = {
    status: $('#status'), count: $('#document-count'), clientCount: $('#client-count'), folders: $('#client-folders'),
    libraryEmpty: $('#library-empty'), search: $('#document-search'), clearLibrary: $('#clear-library'),
    editorDialog: $('#editor-dialog'), editorFormat: $('#editor-format'), editorNameTrigger: $('#editor-name-trigger'),
    editorNameForm: $('#editor-name-form'), editorName: $('#editor-name'), cancelEditorName: $('#cancel-editor-name'), editorClient: $('#editor-client'),
    deleteDocument: $('#delete-document'), saveDocument: $('#save-document'), downloadDocument: $('#download-document'),
    autoSaveToggle: $('#autosave-toggle'),
    csvEditor: $('#csv-editor'), csvContent: $('#csv-content'), csvPreview: $('#csv-preview'),
    officeEditor: $('#office-editor'), officeFrame: $('#office-editor-frame'), officeStatus: $('#office-status'),
    dialog: $('#document-dialog'), form: $('#document-form'), dialogEyebrow: $('#dialog-eyebrow'), dialogTitle: $('#dialog-title'),
    dialogCopy: $('#dialog-copy'), clientSelect: $('#client-select'), clientEmpty: $('#client-empty'), name: $('#document-name'),
    type: $('#document-type'), createFormatField: $('#create-format-field'), importFileField: $('#import-file-field'),
    institutionalTemplateField: $('#institutional-template-field'), institutionalTemplate: $('#institutional-template'),
    institutionalTemplateDetail: $('#institutional-template-detail'),
    file: $('#document-file'), filePickerTitle: $('#file-picker-title'), confirm: $('#confirm-document'),
  };

  const formatNames = { csv: 'CSV', docx: 'DOCX', xlsx: 'XLSX', pptx: 'PPTX' };
  const mimeTypes = {
    csv: 'text/csv;charset=utf-8',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  };
  const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  const id = () => globalThis.crypto?.randomUUID?.() || `doc-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const now = () => new Date().toISOString();
  const extension = (name) => String(name || '').split('.').pop().toLowerCase();
  const baseName = (name) => String(name || '').replace(/\.[^.]+$/, '') || 'Documento sem título';
  const currentRecord = () => state.documents.find((item) => item.id === state.selectedId) || null;
  const clientName = (clientId, fallback = '') => state.clients.find((client) => client.id === clientId)?.name || fallback || 'Cliente removido';
  const recordClientName = (documentRecord) => clientName(documentRecord?.clientId, documentRecord?.clientName);

  function autoSaveEnabled() {
    try { return localStorage.getItem(AUTO_SAVE_KEY) !== 'off'; }
    catch { return true; }
  }

  function setAutoSavePreference(enabled) {
    try { localStorage.setItem(AUTO_SAVE_KEY, enabled ? 'on' : 'off'); }
    catch { /* O armazenamento pode estar indisponível em navegação privada. */ }
  }

  function autoSaveTime() {
    return new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  function setStatus(message, error = false) {
    els.status.textContent = message;
    els.status.classList.toggle('error', error);
  }

  function setOfficeStatus(message, error = false) {
    els.officeStatus.textContent = message;
    els.officeStatus.classList.toggle('error', error);
  }

  function officeTarget() { return els.officeFrame?.contentWindow || null; }

  function sendOfficeCommand(type, payload = {}) {
    const target = officeTarget();
    if (!officeReady || !target) throw new Error('O editor ainda não está pronto.');
    target.postMessage({ type, payload }, window.location.origin);
  }

  function restoreOfficeFocus() {
    const documentRecord = currentRecord();
    if (!els.editorDialog.open || !officeReady || documentRecord?.extension === 'csv') return;
    window.setTimeout(() => {
      try {
        els.officeFrame.focus({ preventScroll: true });
        sendOfficeCommand('document:focus');
      } catch { /* O documento pode estar sendo aberto ou fechado. */ }
    }, 0);
  }

  function printOfficeFile(file) {
    if (!(file instanceof Blob)) throw new Error('O OnlyOffice não retornou o PDF para impressão.');
    if (officePrintFrame) officePrintFrame.remove();
    if (officePrintUrl) URL.revokeObjectURL(officePrintUrl);

    officePrintUrl = URL.createObjectURL(file);
    officePrintFrame = document.createElement('iframe');
    officePrintFrame.className = 'office-print-frame';
    officePrintFrame.title = 'Documento preparado para impressão';
    officePrintFrame.addEventListener('load', () => {
      window.setTimeout(() => {
        try {
          officePrintFrame?.contentWindow?.focus();
          officePrintFrame?.contentWindow?.print();
          setOfficeStatus('Documento enviado para impressão.');
        } catch (error) {
          setOfficeStatus(`Não foi possível abrir a impressão: ${error.message}`, true);
        }
      }, 150);
    }, { once: true });
    officePrintFrame.src = officePrintUrl;
    document.body.append(officePrintFrame);
  }

  function openOfficeRecord(documentRecord) {
    if (!documentRecord?.dataBase64 || documentRecord.extension === 'csv' || !officeReady) return;
    const file = storage.toFile(documentRecord);
    if (!file) return;
    officeOpenId = documentRecord.id;
    setOfficeStatus('Abrindo documento no OnlyOffice…');
    try { sendOfficeCommand('document:open-file', { file, readonly: false }); }
    catch (error) { officeOpenId = ''; setOfficeStatus(error.message, true); }
  }

  function resolveOfficeSave(error) {
    const pending = officeSave;
    officeSave = null;
    if (pending?.timer) clearTimeout(pending.timer);
    if (error) pending?.reject(error);
    else pending?.resolve();
  }

  async function refreshDocuments() {
    state.documents = await storage.list();
    renderLibrary();
  }

  function loadSyncState() {
    try {
      const saved = JSON.parse(localStorage.getItem(SYNC_STATE_KEY) || '{}');
      state.deletedDocuments = Array.isArray(saved.deletedDocuments) ? saved.deletedDocuments : [];
    } catch (_) {
      state.deletedDocuments = [];
    }
  }

  function currentSyncSettings() {
    return gistSettings?.load?.() || { gistId: '', token: '', autoSync: false };
  }

  async function documentMetadata(documentRecord) {
    const bytes = storage.base64ToBytes(documentRecord.dataBase64 || '');
    const originalBytes = storage.base64ToBytes(documentRecord.originalDataBase64 || '');
    const [hash, originalHash] = await Promise.all([sha256(bytes), sha256(originalBytes)]);
    const { dataBase64, originalDataBase64, ...metadata } = documentRecord;
    return documentFiles.normalizeDocument({
      ...metadata,
      size: bytes.byteLength,
      originalSize: originalBytes.byteLength,
      sha256: hash,
      originalSha256: originalHash,
      payloadFile: documentFiles.payloadFileName(documentRecord.id),
      originalPayloadFile: documentFiles.originalPayloadFileName(documentRecord.id),
    });
  }

  async function localSyncData(records = state.documents) {
    const documents = await Promise.all(records.map(documentMetadata));
    return documentFiles.normalizeData({
      schema: documentFiles.SCHEMA,
      version: documentFiles.VERSION,
      updatedAt: now(),
      documents,
      deletedDocuments: state.deletedDocuments,
    });
  }

  function saveSyncState(data, signature = '') {
    localStorage.setItem(SYNC_STATE_KEY, JSON.stringify({
      lastSyncAt: now(),
      lastSyncSignature: signature || documentFiles.signature(data),
      deletedDocuments: state.deletedDocuments,
    }));
  }

  function rememberDeletion(id) {
    if (!id) return;
    state.deletedDocuments = [
      ...state.deletedDocuments.filter((item) => item.id !== id),
      { id, deletedAt: now() },
    ];
    try {
      const saved = JSON.parse(localStorage.getItem(SYNC_STATE_KEY) || '{}');
      localStorage.setItem(SYNC_STATE_KEY, JSON.stringify({ ...saved, deletedDocuments: state.deletedDocuments }));
    } catch (_) { /* a próxima sincronização persiste a marca de exclusão */ }
  }

  async function readGistText(file, message) {
    if (!file) throw new Error(message || 'Arquivo não encontrado na nuvem.');
    return gistClient.text(file, { maxBytes: documentFiles.MAX_PAYLOAD_BYTES });
  }

  async function readGistIndex(gist) {
    const file = gist?.files?.[documentFiles.INDEX_FILE];
    if (!file) return documentFiles.emptyData();
    return documentFiles.normalizeData(JSON.parse(await readGistText(file, 'Não foi possível ler o índice de documentos da nuvem.')));
  }

  async function readRemotePayload(gist, metadata, original = false) {
    const fileName = original ? metadata.originalPayloadFile : metadata.payloadFile;
    const file = gist?.files?.[fileName];
    if (!file) throw new Error(`O conteúdo Base64 de “${metadata.name}” não foi encontrado na nuvem.`);
    const encoded = (await readGistText(file, `Não foi possível ler o conteúdo de “${metadata.name}”.`)).replace(/\s+/g, '');
    const bytes = documentFiles.fromBase64(encoded);
    const expected = original ? metadata.originalSha256 : metadata.sha256;
    const actual = await sha256(bytes);
    if (expected && actual !== expected) throw new Error(`A integridade de “${metadata.name}” não pôde ser confirmada.`);
    return encoded;
  }

  async function syncDocuments() {
    if (syncInFlight) {
      syncPending = true;
      return syncInFlight;
    }
    syncInFlight = (async () => {
      const settings = currentSyncSettings();
      if (!settings.gistId) throw new Error('Configure a nuvem nas Configurações do OfficeJur.');
      access?.canSync(settings.gistId);
      window.OfficeJurCloudStatus?.set(cloudStatus, 'syncing');
      setStatus('Sincronizando documentos com a nuvem…');
      const snapshot = await gistClient.gistSnapshot(settings.gistId, settings.token);
      const localRecords = await storage.list();
      const localData = await localSyncData(localRecords);
      const remoteData = await readGistIndex(snapshot.gist);
      const mergedData = documentFiles.mergeData(localData, remoteData);
      const localMeta = new Map(localData.documents.map((item) => [item.id, item]));
      const localRecordsById = new Map(localRecords.map((item) => [item.id, item]));
      const mergedRecords = [];

      for (const metadata of mergedData.documents) {
        const localRecord = localRecordsById.get(metadata.id);
        const localMetadata = localMeta.get(metadata.id);
        let dataBase64 = '';
        let originalDataBase64 = '';
        if (localRecord && localMetadata?.sha256 === metadata.sha256 && localMetadata?.originalSha256 === metadata.originalSha256) {
          dataBase64 = localRecord.dataBase64;
          originalDataBase64 = localRecord.originalDataBase64;
        } else {
          dataBase64 = await readRemotePayload(snapshot.gist, metadata);
          originalDataBase64 = await readRemotePayload(snapshot.gist, metadata, true);
        }
        mergedRecords.push({
          ...metadata,
          dataBase64,
          originalDataBase64,
          content: metadata.content || localRecord?.content || (metadata.extension === 'csv' ? new TextDecoder().decode(storage.base64ToBytes(dataBase64)) : ''),
        });
      }

      const mergedIds = new Set(mergedRecords.map((item) => item.id));
      for (const record of localRecords) if (!mergedIds.has(record.id)) await storage.remove(record.id);
      for (const record of mergedRecords) await storage.save(record);
      state.documents = await storage.list();
      renderLibrary();

      let revision = snapshot.etag || '';
      const remoteById = new Map(remoteData.documents.map((item) => [item.id, item]));
      for (const metadata of mergedData.documents) {
        const record = state.documents.find((item) => item.id === metadata.id);
        if (!record || !documentFiles.needsPayloadUpload(metadata, remoteById.get(metadata.id))) continue;
        const payloads = {
          [metadata.payloadFile]: { content: record.dataBase64 || '' },
          [metadata.originalPayloadFile]: { content: record.originalDataBase64 || '' },
        };
        const patched = await gistClient.patch(settings.gistId, settings.token, payloads, { etag: revision });
        revision = patched.etag || revision;
      }
      const indexChanged = documentFiles.signature(mergedData) !== documentFiles.signature(remoteData);
      const changedFiles = {};
      if (indexChanged) changedFiles[documentFiles.INDEX_FILE] = { content: JSON.stringify(mergedData, null, 2) };
      documentFiles.deletedPayloadFiles(mergedData, snapshot.gist?.files).forEach((fileName) => { changedFiles[fileName] = null; });
      if (Object.keys(changedFiles).length) await gistClient.patch(settings.gistId, settings.token, changedFiles, { etag: revision });
      state.deletedDocuments = mergedData.deletedDocuments;
      saveSyncState(mergedData);
      window.OfficeJurCloudStatus?.set(cloudStatus, 'synced');
      setStatus('Documentos sincronizados com a nuvem.');
    })();
    try { await syncInFlight; }
    catch (error) {
      window.OfficeJurCloudStatus?.set(cloudStatus, 'error', error.message);
      setStatus(error.message || 'Não foi possível sincronizar os documentos.', true);
      throw error;
    }
    finally {
      syncInFlight = null;
      if (syncPending) { syncPending = false; void syncDocuments(); }
    }
  }

  function scheduleSync() {
    const settings = currentSyncSettings();
    if (!settings.gistId || !settings.token || !settings.autoSync) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => void syncDocuments().catch(() => {}), 1400);
  }

  async function persistOfficeSave(file, payload, documentRecord, automatic = false) {
    if (!file || !documentRecord) throw new Error('O OnlyOffice não retornou o arquivo editado.');
    documentRecord.dataBase64 = await storage.blobToBase64(file);
    documentRecord.fileName = payload.fileName || `${documentRecord.name}.${documentRecord.extension}`;
    documentRecord.updatedAt = now();
    await storage.save(documentRecord);
    await refreshDocuments();
    scheduleSync();
    state.dirty = false;
    setStatus(automatic ? `Salvo automaticamente às ${autoSaveTime()}.` : 'Alterações salvas neste navegador.');
    setOfficeStatus(automatic ? `Salvo automaticamente às ${autoSaveTime()}` : 'Alterações salvas.');
    renderEditor();
    if (documentRecord.extension !== 'csv') {
      try { sendOfficeCommand('document:focus'); }
      catch { /* O editor pode estar sendo fechado. */ }
    }
  }

  window.addEventListener('message', (event) => {
    if (event.source !== officeTarget() || event.origin !== window.location.origin) return;
    const message = event.data || {};
    const payload = message.payload || {};
    if (!String(message.type || '').startsWith('document:')) return;

    if (message.type === 'document:ready') {
      officeReady = true;
      setOfficeStatus('Editor pronto · português brasileiro');
      const documentRecord = currentRecord();
      if (els.editorDialog.open && documentRecord?.extension !== 'csv') openOfficeRecord(documentRecord);
      return;
    }
    if (message.type === 'document:opened') {
      state.dirty = false;
      setOfficeStatus('Documento aberto para edição');
      return;
    }
    if (message.type === 'document:changed') {
      state.dirty = Boolean(payload.modified);
      if (state.dirty) setOfficeStatus(els.autoSaveToggle.checked ? 'Alterações pendentes · salvamento automático ativo' : 'Alterações pendentes');
      return;
    }
    if (message.type === 'document:renamed') {
      setOfficeStatus('Nome atualizado no editor');
      try { sendOfficeCommand('document:focus'); }
      catch { /* O documento pode estar concluindo a abertura. */ }
      return;
    }
    if (message.type === 'document:print-started') {
      setOfficeStatus('Preparando documento para impressão…');
      return;
    }
    if (message.type === 'document:print-ready') {
      try { printOfficeFile(payload.file); }
      catch (error) { setOfficeStatus(error.message, true); }
      return;
    }
    if (message.type === 'document:print-fallback') {
      setOfficeStatus('Impressão aberta pelo OnlyOffice.');
      setStatus('Este arquivo usou a impressão nativa do OnlyOffice porque a conversão para PDF não era compatível.');
      return;
    }
    if (message.type === 'document:print-native') {
      setOfficeStatus('Impressão aberta pelo OnlyOffice.');
      setStatus('A impressão nativa preserva a formatação completa do documento DOCX.');
      return;
    }
    if (message.type === 'document:saved') {
      const automatic = Boolean(officeSave?.automatic);
      const savedRecord = officeSave
        ? state.documents.find((record) => record.id === officeSave.documentId) || null
        : currentRecord();
      void persistOfficeSave(payload.file, payload, savedRecord, automatic).then(() => resolveOfficeSave()).catch((error) => {
        resolveOfficeSave(error);
        setOfficeStatus(error.message, true);
        setStatus(`Não foi possível salvar: ${error.message}`, true);
      });
      return;
    }
    if (message.type === 'document:error') {
      const error = new Error(payload.message || 'O OnlyOffice não conseguiu concluir a operação.');
      setOfficeStatus(error.message, true);
      setStatus(error.message, true);
      resolveOfficeSave(error);
    }
  });

  function createOption(value, label) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    return option;
  }

  function updateDialogConfirmation() {
    const missingClient = !state.clients.length;
    const missingImport = state.dialogMode === 'import' && !els.file.files?.[0];
    els.confirm.disabled = missingClient || missingImport;
  }

  function configuredInstitutionalTemplate() {
    return institutionalTemplateConfig?.enabled && institutionalTemplateConfig?.base64Url
      ? institutionalTemplateConfig
      : null;
  }

  function renderInstitutionalTemplateChoice() {
    const template = configuredInstitutionalTemplate();
    const visible = state.dialogMode === 'create' && els.type.value === 'docx' && Boolean(template);
    els.institutionalTemplateField.hidden = !visible;
    els.institutionalTemplate.disabled = !visible;
    els.institutionalTemplateDetail.textContent = template?.label || '';
  }

  async function sha256(bytes) {
    if (!globalThis.crypto?.subtle) return '';
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
  }

  async function loadInstitutionalTemplate() {
    const template = configuredInstitutionalTemplate();
    if (!template) throw new Error('O modelo institucional não está configurado nesta implantação.');
    const response = await fetch(template.base64Url, { credentials: 'same-origin' });
    if (!response.ok) throw new Error(`O modelo institucional não foi publicado (${response.status}).`);
    const dataBase64 = (await response.text()).replace(/\s+/g, '');
    const bytes = storage.base64ToBytes(dataBase64);
    if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new Error('O modelo institucional publicado não é um DOCX válido.');
    if (template.sha256) {
      const actualHash = await sha256(bytes);
      if (actualHash && actualHash !== String(template.sha256).toLowerCase())
        throw new Error('A integridade do modelo institucional não pôde ser confirmada.');
    }
    return dataBase64;
  }

  function renderClients() {
    const previous = els.clientSelect.value;
    els.clientSelect.replaceChildren();
    els.clientSelect.append(createOption('', state.clients.length ? 'Selecione um cliente' : 'Nenhum cliente cadastrado'));
    state.clients.forEach((client) => els.clientSelect.append(createOption(client.id, client.name)));
    if (state.clients.some((client) => client.id === previous)) els.clientSelect.value = previous;
    els.clientEmpty.hidden = state.clients.length > 0;
    updateDialogConfirmation();
  }

  function filteredDocuments() {
    const term = state.query.trim().toLocaleLowerCase('pt-BR');
    return state.documents.filter((documentRecord) => !term || [documentRecord.name, recordClientName(documentRecord), documentRecord.extension]
      .some((value) => String(value).toLocaleLowerCase('pt-BR').includes(term)));
  }

  function formatUpdatedAt(value) {
    return new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  }

  function renderLibrary() {
    const documents = filteredDocuments();
    const groups = new Map();
    documents.forEach((documentRecord) => {
      const group = groups.get(documentRecord.clientId) || [];
      group.push(documentRecord);
      groups.set(documentRecord.clientId, group);
    });

    els.count.textContent = String(state.documents.length);
    els.clientCount.textContent = String(new Set(state.documents.map((record) => record.clientId)).size);
    els.clearLibrary.disabled = state.documents.length === 0;
    els.libraryEmpty.hidden = documents.length > 0;
    els.folders.hidden = documents.length === 0;
    els.folders.replaceChildren();

    if (!documents.length && state.documents.length) {
      els.libraryEmpty.querySelector('h2').textContent = 'Nenhum arquivo encontrado';
      els.libraryEmpty.querySelector('p').textContent = 'Tente pesquisar por outro nome, cliente ou formato.';
    } else {
      els.libraryEmpty.querySelector('h2').textContent = 'Nenhum arquivo na biblioteca';
      els.libraryEmpty.querySelector('p').textContent = 'Crie um documento em branco ou importe um arquivo e vincule-o a um cliente.';
    }

    [...groups.entries()].sort((left, right) => recordClientName(left[1][0]).localeCompare(recordClientName(right[1][0]), 'pt-BR')).forEach(([clientId, records]) => {
      const folder = document.createElement('section');
      folder.className = 'client-folder';
      folder.dataset.clientId = clientId;
      const cards = records.map((record) => `
        <article class="file-card" data-card-id="${escape(record.id)}">
          <button class="file-open" type="button" data-open-id="${escape(record.id)}" aria-label="Abrir ${escape(record.name)}">
            <span class="format-icon format-${escape(record.extension)}">${escape(formatNames[record.extension])}</span>
            <span class="file-copy"><strong>${escape(record.name)}</strong><small>${escape(formatUpdatedAt(record.updatedAt))}</small></span>
          </button>
        </article>`).join('');
      folder.innerHTML = `
        <header class="folder-head">
          <div class="folder-title"><span class="folder-symbol" aria-hidden="true"></span><span><strong>${escape(recordClientName(records[0]) || clientId)}</strong><small>Documentos vinculados a este cliente</small></span></div>
          <span class="folder-count">${records.length} ${records.length === 1 ? 'arquivo' : 'arquivos'}</span>
        </header>
        <div class="file-grid">${cards}</div>`;
      els.folders.append(folder);
    });
  }

  function csvRows(value) {
    const lines = String(value || '').split(/\r?\n/).filter((line, index, all) => line || index < all.length - 1);
    return lines.map((line) => line.split(line.includes(';') ? ';' : ',').map((cell) => cell.trim()));
  }

  function renderCsvPreview() {
    const rows = csvRows(els.csvContent.value);
    els.csvPreview.replaceChildren();
    if (!rows.length || !rows.some((row) => row.some(Boolean))) {
      els.csvPreview.textContent = 'Digite dados para visualizar a tabela.';
      return;
    }
    const table = document.createElement('table');
    rows.slice(0, 30).forEach((row, rowIndex) => {
      const tr = document.createElement('tr');
      row.forEach((cell) => {
        const cellElement = document.createElement(rowIndex === 0 ? 'th' : 'td');
        cellElement.textContent = cell;
        tr.append(cellElement);
      });
      table.append(tr);
    });
    els.csvPreview.append(table);
  }

  function renderEditor() {
    const documentRecord = currentRecord();
    if (!documentRecord) return;
    els.editorFormat.textContent = formatNames[documentRecord.extension];
    els.editorFormat.className = `format-icon format-${documentRecord.extension}`;
    els.editorNameTrigger.textContent = documentRecord.name;
    if (els.editorNameForm.hidden) els.editorName.value = documentRecord.name;
    els.editorClient.textContent = `${recordClientName(documentRecord)} · atualizado em ${formatUpdatedAt(documentRecord.updatedAt)}`;
    const isCsv = documentRecord.extension === 'csv';
    els.csvEditor.hidden = !isCsv;
    els.officeEditor.hidden = isCsv;
    els.downloadDocument.disabled = !isCsv && !documentRecord.dataBase64;
    els.saveDocument.textContent = 'Salvar';
    if (isCsv) {
      els.csvContent.value = documentRecord.content || '';
      setOfficeStatus('Editor CSV');
      renderCsvPreview();
      return;
    }
    if (!documentRecord.dataBase64) {
      setOfficeStatus('Este documento ainda não possui conteúdo.', true);
      return;
    }
    if (officeReady && officeOpenId !== documentRecord.id) openOfficeRecord(documentRecord);
    else if (!officeReady) setOfficeStatus('Preparando editor…');
  }

  async function loadData() {
    loadSyncState();
    const allowed = access ? await access.guard('documentos', async () => {
      await storage.clear();
      localStorage.removeItem(SYNC_STATE_KEY);
      state.documents = [];
      state.deletedDocuments = [];
    }) : true;
    if (!allowed) {
      setStatus('O acesso local aos documentos sincronizados está bloqueado. Revise a nuvem nas Configurações.', true);
      return;
    }
    try {
      const domains = await financeDataStore.load({ financeStorage });
      state.clients = financeStorage.resolvedClients(domains)
        .map((client) => ({
          id: String(client.id),
          name: String(client.name || 'Cliente sem nome'),
        }))
        .sort((left, right) => left.name.localeCompare(right.name, 'pt-BR'));
      renderClients();
    } catch (error) {
      setStatus(`Não foi possível carregar os clientes do Financeiro: ${error.message}`, true);
      renderClients();
    }
    await refreshDocuments();
    const syncSettings = currentSyncSettings();
    if (syncSettings.gistId && syncSettings.token) await syncDocuments().catch(() => {});
  }

  function openDocumentDialog(mode) {
    state.dialogMode = mode;
    els.form.reset();
    els.type.value = 'docx';
    els.createFormatField.hidden = mode === 'import';
    els.importFileField.hidden = mode !== 'import';
    els.dialogEyebrow.textContent = mode === 'import' ? 'IMPORTAR ARQUIVO' : 'NOVO DOCUMENTO';
    els.dialogTitle.textContent = mode === 'import' ? 'Importar para a biblioteca' : 'Criar documento';
    els.dialogCopy.textContent = mode === 'import'
      ? 'Escolha um arquivo; o formato e o nome serão detectados automaticamente.'
      : 'Crie um arquivo em branco e vincule-o a uma pasta de cliente.';
    els.confirm.textContent = mode === 'import' ? 'Importar arquivo' : 'Criar documento';
    els.filePickerTitle.textContent = 'Escolher arquivo';
    renderClients();
    renderInstitutionalTemplateChoice();
    els.dialog.showModal();
    if (state.clients.length) els.clientSelect.focus();
  }

  function closeDocumentDialog() { els.dialog.close(); }

  async function saveNewDocument(event) {
    event.preventDefault();
    const clientId = els.clientSelect.value;
    const importing = state.dialogMode === 'import';
    const file = importing ? els.file.files?.[0] || null : null;
    if (!clientId) { setStatus('Selecione um cliente antes de continuar.', true); return; }
    if (importing && !file) { setStatus('Escolha o arquivo que deseja importar.', true); return; }
    const selectedExtension = importing ? extension(file.name) : els.type.value;
    if (!formatNames[selectedExtension]) { setStatus('Formato não suportado. Use DOCX, XLSX, PPTX ou CSV.', true); return; }

    const timestamp = now();
    const documentName = els.name.value.trim() || baseName(file?.name) || 'Documento sem título';
    let dataBase64 = '';
    let content = '';
    if (file) {
      dataBase64 = await storage.blobToBase64(file);
      if (selectedExtension === 'csv') content = await file.text();
    } else if (selectedExtension === 'csv') {
      dataBase64 = storage.textToBase64('');
    } else if (selectedExtension === 'docx' && els.institutionalTemplate.checked) {
      try { dataBase64 = await loadInstitutionalTemplate(); }
      catch (error) { setStatus(`Não foi possível usar o modelo do escritório: ${error.message}`, true); return; }
    } else {
      if (!templates?.createBlank) { setStatus('Os modelos Office não estão disponíveis neste build.', true); return; }
      try { dataBase64 = storage.bytesToBase64(new Uint8Array(await templates.createBlank(selectedExtension))); }
      catch (error) { setStatus(`Não foi possível criar o documento: ${error.message}`, true); return; }
    }

    const record = {
      id: id(), clientId, clientName: clientName(clientId), name: documentName, extension: selectedExtension,
      mimeType: file?.type || mimeTypes[selectedExtension],
      source: file ? 'imported' : (selectedExtension === 'docx' && els.institutionalTemplate.checked ? 'institutional-template' : 'created'),
      fileName: `${documentName}.${selectedExtension}`, content, createdAt: timestamp, updatedAt: timestamp,
      dataBase64, originalDataBase64: dataBase64,
    };
    await storage.save(record);
    state.selectedId = record.id;
    officeOpenId = '';
    closeDocumentDialog();
    await refreshDocuments();
    scheduleSync();
    setStatus(`“${record.name}” foi adicionado à pasta de ${record.clientName}.`);
    openEditor(record.id);
  }

  function openEditor(recordId) {
    const documentRecord = state.documents.find((record) => record.id === recordId);
    if (!documentRecord) return;
    state.selectedId = recordId;
    state.dirty = false;
    if (officeOpenId !== recordId) officeOpenId = '';
    if (!els.editorDialog.open) els.editorDialog.showModal();
    renderEditor();
    syncAutoSaveTimer();
  }

  async function closeEditor() {
    if (state.dirty && els.autoSaveToggle.checked) await saveCurrent({ automatic: true });
    clearInterval(autoSaveTimer);
    autoSaveTimer = null;
    hideEditorRename();
    els.editorDialog.close();
  }

  function showEditorRename() {
    const documentRecord = currentRecord();
    if (!documentRecord) return;
    if (documentRecord.extension !== 'csv' && officeReady) {
      try { sendOfficeCommand('document:blur'); }
      catch { /* O editor pode estar concluindo a abertura. */ }
    }
    els.editorName.value = documentRecord.name;
    els.editorNameTrigger.hidden = true;
    els.editorNameForm.hidden = false;
    els.editorName.focus();
    els.editorName.select();
  }

  function hideEditorRename() {
    els.editorNameForm.hidden = true;
    els.editorNameTrigger.hidden = false;
    restoreOfficeFocus();
  }

  function syncAutoSaveTimer() {
    clearInterval(autoSaveTimer);
    autoSaveTimer = null;
    if (!els.autoSaveToggle.checked || !els.editorDialog.open) return;
    autoSaveTimer = setInterval(() => {
      if (state.dirty && !officeSave) void saveCurrent({ automatic: true });
    }, AUTO_SAVE_INTERVAL);
  }

  async function renameRecord(documentRecord, requestedName) {
    const newName = baseName(String(requestedName || '').trim());
    if (!newName || newName === documentRecord.name) return;
    documentRecord.name = newName;
    documentRecord.fileName = `${newName}.${documentRecord.extension}`;
    documentRecord.updatedAt = now();
    await storage.save(documentRecord);
    await refreshDocuments();
    scheduleSync();
    if (state.selectedId === documentRecord.id) {
      renderEditor();
      if (documentRecord.extension !== 'csv' && officeReady && officeOpenId === documentRecord.id) {
        try { sendOfficeCommand('document:rename', { fileName: documentRecord.fileName }); }
        catch (error) { setOfficeStatus(`Nome salvo na biblioteca, mas não atualizado no editor: ${error.message}`, true); }
      }
    }
    setStatus(`Arquivo renomeado para “${newName}”.`);
  }

  async function renameSelected() {
    const documentRecord = currentRecord();
    if (documentRecord) await renameRecord(documentRecord, els.editorName.value);
    hideEditorRename();
  }

  async function saveCurrent({ automatic = false } = {}) {
    const documentRecord = currentRecord();
    if (!documentRecord) return;
    try {
      if (automatic && !state.dirty) return;
      if (documentRecord.extension === 'csv') {
        documentRecord.content = els.csvContent.value;
        documentRecord.dataBase64 = storage.textToBase64(documentRecord.content);
        documentRecord.updatedAt = now();
        await storage.save(documentRecord);
        await refreshDocuments();
        scheduleSync();
        state.dirty = false;
        setStatus(automatic ? `Salvo automaticamente às ${autoSaveTime()}.` : 'Alterações salvas neste navegador.');
        setOfficeStatus(automatic ? `Salvo automaticamente às ${autoSaveTime()}` : 'Alterações salvas.');
        return;
      }
      if (!officeReady || officeOpenId !== documentRecord.id) throw new Error('Aguarde o documento abrir no editor antes de salvar.');
      if (officeSave) {
        if (automatic) return;
        throw new Error('Já existe uma solicitação de salvamento em andamento.');
      }
      setOfficeStatus(automatic ? 'Salvando automaticamente…' : 'Salvando alterações…');
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => resolveOfficeSave(new Error('O editor demorou para retornar o arquivo.')), 30000);
        officeSave = { resolve, reject, timer, automatic, documentId: documentRecord.id };
        try { sendOfficeCommand('document:save', { targetExt: documentRecord.extension.toUpperCase() }); }
        catch (error) { resolveOfficeSave(error); }
      });
    } catch (error) {
      setStatus(`Não foi possível salvar: ${error.message}`, true);
      setOfficeStatus(error.message, true);
    }
  }

  async function downloadCurrent() {
    const documentRecord = currentRecord();
    if (!documentRecord) return;
    let blob;
    if (documentRecord.extension === 'csv') blob = new Blob([els.csvContent.value], { type: mimeTypes.csv });
    else blob = storage.toBlob(documentRecord);
    if (!blob) { setStatus('Este documento ainda não possui conteúdo para baixar.', true); return; }
    const filename = `${documentRecord.name}.${documentRecord.extension}`;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 500);
    setStatus(`Download de ${filename} iniciado.`);
  }

  async function removeCurrent() {
    const documentRecord = currentRecord();
    if (!documentRecord || !confirm(`Excluir “${documentRecord.name}” da biblioteca?`)) return;
    await storage.remove(documentRecord.id);
    rememberDeletion(documentRecord.id);
    state.dirty = false;
    await closeEditor();
    state.selectedId = '';
    officeOpenId = '';
    await refreshDocuments();
    scheduleSync();
    setStatus('Arquivo excluído deste navegador.');
  }

  async function clearLibrary() {
    const count = state.documents.length;
    if (!count) return;
    if (!confirm(`Confirmação 1 de 3: remover todos os ${count} arquivos da biblioteca?`)) return;
    if (!confirm('Confirmação 2 de 3: esta ação não poderá ser desfeita. Deseja continuar?')) return;
    const phrase = prompt('Confirmação 3 de 3: digite APAGAR para excluir toda a biblioteca.');
    if (phrase !== 'APAGAR') { setStatus('Limpeza cancelada: a confirmação final não corresponde.', true); return; }
    await storage.clear();
    state.documents.forEach((record) => rememberDeletion(record.id));
    state.documents = [];
    state.selectedId = '';
    officeOpenId = '';
    renderLibrary();
    scheduleSync();
    setStatus('Biblioteca apagada deste navegador.');
  }

  $('#new-document').addEventListener('click', () => openDocumentDialog('create'));
  $('#import-document').addEventListener('click', () => openDocumentDialog('import'));
  document.querySelectorAll('[data-action="new"]').forEach((button) => button.addEventListener('click', () => openDocumentDialog('create')));
  $('#close-dialog').addEventListener('click', closeDocumentDialog);
  $('#cancel-dialog').addEventListener('click', closeDocumentDialog);
  $('#close-editor').addEventListener('click', () => void closeEditor());
  els.form.addEventListener('submit', (event) => void saveNewDocument(event));
  els.search.addEventListener('input', () => { state.query = els.search.value; renderLibrary(); });
  els.clearLibrary.addEventListener('click', () => void clearLibrary());
  els.folders.addEventListener('click', (event) => {
    const openButton = event.target.closest('[data-open-id]');
    if (openButton) { openEditor(openButton.dataset.openId); return; }
  });
  els.csvContent.addEventListener('input', () => {
    state.dirty = true;
    setOfficeStatus(els.autoSaveToggle.checked ? 'Alterações pendentes · salvamento automático ativo' : 'Alterações pendentes');
    renderCsvPreview();
  });
  els.editorNameTrigger.addEventListener('click', showEditorRename);
  els.editorNameForm.addEventListener('submit', (event) => {
    event.preventDefault();
    void renameSelected().catch((error) => setStatus(`Não foi possível renomear: ${error.message}`, true));
  });
  els.cancelEditorName.addEventListener('click', hideEditorRename);
  els.editorName.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { event.preventDefault(); hideEditorRename(); }
  });
  els.saveDocument.addEventListener('click', () => void saveCurrent());
  els.downloadDocument.addEventListener('click', () => void downloadCurrent());
  els.deleteDocument.addEventListener('click', () => void removeCurrent());
  els.officeFrame.addEventListener('load', () => setOfficeStatus('Carregando editor…'));
  els.file.addEventListener('change', () => {
    const file = els.file.files?.[0];
    els.filePickerTitle.textContent = file?.name || 'Escolher arquivo';
    if (file && !els.name.value) els.name.value = baseName(file.name);
    updateDialogConfirmation();
  });
  els.type.addEventListener('change', renderInstitutionalTemplateChoice);

  els.autoSaveToggle.checked = autoSaveEnabled();
  els.autoSaveToggle.addEventListener('change', () => {
    setAutoSavePreference(els.autoSaveToggle.checked);
    syncAutoSaveTimer();
    setOfficeStatus(els.autoSaveToggle.checked ? 'Salvamento automático ativo · a cada 10 segundos' : 'Salvamento automático desativado');
  });

  if (!storage || !financeStorage || !financeDataStore) {
    setStatus('O armazenamento de documentos ou o Financeiro não está disponível.', true);
  } else {
    void loadData().catch((error) => setStatus(error.message, true));
  }
})();
