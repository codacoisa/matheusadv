(() => {
  'use strict';

  const storage = window.OfficeJurLabDocuments;
  const templates = window.OfficeJurDocumentTemplates;
  const financeStorage = window.FinanceStorage;
  const financeDataStore = window.FinanceDataStore;
  const $ = (selector) => document.querySelector(selector);
  const state = { clients: [], documents: [], selectedId: '', query: '' };
  let officeReady = false;
  let officeOpenId = '';
  let officeSave = null;

  const els = {
    status: $('#status'),
    count: $('#document-count'),
    list: $('#document-list'),
    search: $('#document-search'),
    clearLibrary: $('#clear-library'),
    empty: $('#editor-empty'),
    editor: $('#editor-view'),
    editorType: $('#editor-type'),
    editorTitle: $('#editor-title'),
    editorClient: $('#editor-client'),
    editorNotice: $('#editor-notice'),
    deleteDocument: $('#delete-document'),
    saveDocument: $('#save-document'),
    downloadDocument: $('#download-document'),
    csvEditor: $('#csv-editor'),
    csvContent: $('#csv-content'),
    csvPreview: $('#csv-preview'),
    officeEditor: $('#office-editor'),
    officeFrame: $('#office-editor-frame'),
    officeStatus: $('#office-status'),
    dialog: $('#document-dialog'),
    form: $('#document-form'),
    clientSelect: $('#client-select'),
    clientEmpty: $('#client-empty'),
    name: $('#document-name'),
    type: $('#document-type'),
    file: $('#document-file'),
    confirm: $('#confirm-document'),
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
  const clientName = (clientId) => state.clients.find((client) => client.id === clientId)?.name || 'Cliente removido';

  function setStatus(message, error = false) {
    els.status.textContent = message;
    els.status.classList.toggle('error', error);
  }

  function setOfficeStatus(message, error = false) {
    els.officeStatus.textContent = message;
    els.officeStatus.classList.toggle('error', error);
  }

  function officeTarget() {
    return els.officeFrame?.contentWindow || null;
  }

  function sendOfficeCommand(type, payload = {}) {
    const target = officeTarget();
    if (!officeReady || !target) throw new Error('O editor OnlyOffice ainda não está pronto.');
    target.postMessage({ type, payload }, window.location.origin);
  }

  function fileForEditor(documentRecord) {
    const filename = documentRecord.fileName || `${documentRecord.name}.${documentRecord.extension}`;
    return new File([documentRecord.file], filename, { type: documentRecord.mimeType || mimeTypes[documentRecord.extension] });
  }

  function openOfficeRecord(documentRecord) {
    if (!documentRecord?.file || documentRecord.extension === 'csv' || !officeReady) return;
    officeOpenId = documentRecord.id;
    setOfficeStatus('Abrindo documento no OnlyOffice local…');
    try {
      sendOfficeCommand('document:open-file', { file: fileForEditor(documentRecord), readonly: false });
    } catch (error) {
      officeOpenId = '';
      setOfficeStatus(error.message, true);
    }
  }

  function resolveOfficeSave(error, file = null, payload = {}) {
    const pending = officeSave;
    officeSave = null;
    if (pending?.timer) clearTimeout(pending.timer);
    if (error) pending?.reject(error);
    else pending?.resolve({ file, payload });
  }

  async function persistOfficeSave(file, payload, documentRecord) {
    if (!file) throw new Error('O OnlyOffice não retornou o arquivo editado.');
    documentRecord.file = file instanceof File ? file : new Blob([file], { type: payload.mimeType || documentRecord.mimeType });
    documentRecord.fileName = payload.fileName || documentRecord.fileName || `${documentRecord.name}.${documentRecord.extension}`;
    documentRecord.updatedAt = now();
    await storage.save(documentRecord);
    state.documents = await storage.list();
    setStatus('Alterações salvas localmente no arquivo Office.');
    setOfficeStatus('Alterações salvas no arquivo local.');
    render();
  }

  window.addEventListener('message', (event) => {
    if (event.source !== officeTarget() || event.origin !== window.location.origin) return;
    const message = event.data || {};
    const payload = message.payload || {};
    if (!String(message.type || '').startsWith('document:')) return;

    if (message.type === 'document:ready') {
      officeReady = true;
      setOfficeStatus('Editor OnlyOffice pronto · português brasileiro');
      const documentRecord = state.documents.find((item) => item.id === state.selectedId);
      if (documentRecord) openOfficeRecord(documentRecord);
      return;
    }
    if (message.type === 'document:opened') {
      setOfficeStatus('Documento aberto para edição · português brasileiro');
      return;
    }
    if (message.type === 'document:saved') {
      const documentRecord = state.documents.find((item) => item.id === state.selectedId);
      void persistOfficeSave(payload.file, payload, documentRecord).then(() => resolveOfficeSave()).catch((error) => {
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

  function renderClients() {
    els.clientSelect.replaceChildren();
    els.clientSelect.append(createOption('', state.clients.length ? 'Selecione um cliente' : 'Nenhum cliente cadastrado'));
    state.clients.forEach((client) => els.clientSelect.append(createOption(client.id, client.name)));
    els.clientEmpty.hidden = state.clients.length > 0;
    els.confirm.disabled = state.clients.length === 0;
  }

  function filteredDocuments() {
    const term = state.query.trim().toLocaleLowerCase('pt-BR');
    return state.documents.filter((document) => !term || [document.name, document.clientName, document.extension].some((value) => String(value).toLocaleLowerCase('pt-BR').includes(term)));
  }

  function renderList() {
    const documents = filteredDocuments();
    els.count.textContent = String(state.documents.length);
    els.clearLibrary.disabled = state.documents.length === 0;
    els.list.replaceChildren();
    if (!documents.length) {
      const empty = document.createElement('p');
      empty.className = 'list-empty';
      empty.textContent = state.documents.length ? 'Nenhum documento corresponde à busca.' : 'A biblioteca está vazia.';
      els.list.append(empty);
      return;
    }
    documents.forEach((record) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `document-item${record.id === state.selectedId ? ' active' : ''}`;
      button.dataset.id = record.id;
      button.innerHTML = `<span class="format-icon format-${escape(record.extension)}">${escape(formatNames[record.extension] || record.extension.toUpperCase())}</span><span class="document-copy"><strong>${escape(record.name)}</strong><small>${escape(record.clientName)}</small></span><span class="item-arrow" aria-hidden="true">›</span>`;
      els.list.append(button);
    });
  }

  function csvRows(value) {
    const lines = String(value || '').split(/\r?\n/).filter((line, index, all) => line || index < all.length - 1);
    return lines.map((line) => {
      const separator = line.includes(';') ? ';' : ',';
      return line.split(separator).map((cell) => cell.trim());
    });
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
    const documentRecord = state.documents.find((item) => item.id === state.selectedId);
    if (!documentRecord) {
      els.empty.hidden = false;
      els.editor.hidden = true;
      return;
    }
    els.empty.hidden = true;
    els.editor.hidden = false;
    els.editorType.textContent = `${formatNames[documentRecord.extension]} · ${documentRecord.source === 'imported' ? 'ARQUIVO IMPORTADO' : 'EDITOR LOCAL'}`;
    els.editorTitle.textContent = documentRecord.name;
    els.editorClient.textContent = `Vinculado a ${documentRecord.clientName} · atualizado em ${new Date(documentRecord.updatedAt).toLocaleString('pt-BR')}`;
    const isCsv = documentRecord.extension === 'csv';
    els.csvEditor.hidden = !isCsv;
    els.officeEditor.hidden = isCsv;
    els.deleteDocument.disabled = false;
    els.downloadDocument.disabled = !isCsv && !documentRecord.file;
    els.saveDocument.textContent = isCsv ? 'Salvar' : 'Salvar no OfficeJur';
    if (isCsv) {
      els.csvContent.value = documentRecord.content || '';
      renderCsvPreview();
      els.editorNotice.textContent = documentRecord.source === 'imported' ? 'Este CSV foi importado do dispositivo e pode ser editado diretamente.' : 'Este CSV é um documento novo salvo somente neste navegador.';
      return;
    }
    els.editorNotice.textContent = documentRecord.fileName ? `Arquivo local: ${documentRecord.fileName}. O original importado permanece preservado.` : 'Documento Office local criado em branco. O editor OnlyOffice abaixo trabalha no próprio navegador.';
    if (documentRecord.file && officeReady && officeOpenId !== documentRecord.id) openOfficeRecord(documentRecord);
    if (!documentRecord.file) setOfficeStatus('Este documento ainda não possui um arquivo Office.');
  }

  function render() { renderList(); renderEditor(); }

  async function loadData() {
    try {
      const domains = await financeDataStore.load({ financeStorage });
      state.clients = (domains.clients?.records || []).filter((client) => client?.id).map((client) => ({ id: String(client.id), name: String(client.name || client.companyName || 'Cliente sem nome') })).sort((left, right) => left.name.localeCompare(right.name, 'pt-BR'));
      renderClients();
    } catch (error) {
      setStatus(`Não foi possível carregar os clientes do Financeiro: ${error.message}`, true);
      renderClients();
    }
    state.documents = await storage.list();
    render();
  }

  function openDialog() {
    renderClients();
    els.form.reset();
    els.type.value = 'csv';
    els.dialog.showModal();
    if (state.clients.length) els.clientSelect.focus();
  }

  function closeDialog() { els.dialog.close(); }

  async function saveNewDocument(event) {
    event.preventDefault();
    const clientId = els.clientSelect.value;
    const file = els.file.files?.[0] || null;
    if (!clientId) { setStatus('Selecione um cliente antes de salvar o documento.', true); return; }
    const selectedExtension = file ? extension(file.name) : els.type.value;
    if (!formatNames[selectedExtension]) { setStatus('Formato não suportado. Use DOCX, XLSX, PPTX ou CSV.', true); return; }
    if (file && !['docx', 'xlsx', 'pptx', 'csv'].includes(selectedExtension)) { setStatus('Escolha um arquivo DOCX, XLSX, PPTX ou CSV.', true); return; }
    const timestamp = now();
    const documentName = els.name.value.trim() || baseName(file?.name) || 'Documento sem título';
    let fileBytes = file ? await file.arrayBuffer() : null;
    if (!file && selectedExtension !== 'csv') {
      if (!templates?.createBlank) { setStatus('Os modelos Office em branco não estão disponíveis neste build.', true); return; }
      try { fileBytes = await templates.createBlank(selectedExtension); }
      catch (error) { setStatus(`Não foi possível criar o modelo vazio: ${error.message}`, true); return; }
    }
    const fileBlob = fileBytes ? new Blob([fileBytes], { type: file?.type || mimeTypes[selectedExtension] }) : null;
    const record = {
      id: id(), clientId, clientName: clientName(clientId), name: documentName, extension: selectedExtension,
      mimeType: file?.type || mimeTypes[selectedExtension], source: file ? 'imported' : 'created', fileName: file?.name || (fileBlob ? `${documentName}.${selectedExtension}` : ''), content: selectedExtension === 'csv' && file ? await file.text() : '', notes: '', createdAt: timestamp, updatedAt: timestamp,
      file: fileBlob,
      originalFile: fileBlob ? new Blob([fileBytes], { type: file?.type || mimeTypes[selectedExtension] }) : null,
    };
    await storage.save(record);
    state.documents = await storage.list();
    state.selectedId = record.id;
    officeOpenId = '';
    closeDialog();
    setStatus(`Documento ${record.name} salvo somente neste navegador.`);
    render();
  }

  async function saveCurrent() {
    const documentRecord = state.documents.find((item) => item.id === state.selectedId);
    if (!documentRecord) return;
    try {
      if (documentRecord.extension === 'csv') {
        documentRecord.content = els.csvContent.value;
        documentRecord.updatedAt = now();
        await storage.save(documentRecord);
        state.documents = await storage.list();
        setStatus('Alterações salvas localmente.');
        render();
        return;
      }
      if (!officeReady || officeOpenId !== documentRecord.id) throw new Error('Abra o arquivo no editor OnlyOffice antes de salvar.');
      if (officeSave) throw new Error('Já existe uma solicitação de salvamento em andamento.');
      setOfficeStatus('Solicitando o arquivo editado ao OnlyOffice…');
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => resolveOfficeSave(new Error('O OnlyOffice demorou para retornar o arquivo editado.')), 30000);
        officeSave = { resolve, reject, timer };
        try { sendOfficeCommand('document:save', { targetExt: documentRecord.extension.toUpperCase() }); }
        catch (error) { resolveOfficeSave(error); }
      });
    } catch (error) {
      setStatus(`Não foi possível salvar: ${error.message}`, true);
      setOfficeStatus(error.message, true);
    }
  }

  async function downloadCurrent() {
    const documentRecord = state.documents.find((item) => item.id === state.selectedId);
    if (!documentRecord) return;
    let blob = documentRecord.file;
    let filename = documentRecord.fileName || `${documentRecord.name}.${documentRecord.extension}`;
    if (documentRecord.extension === 'csv') { blob = new Blob([els.csvContent.value], { type: mimeTypes.csv }); filename = `${documentRecord.name}.csv`; }
    if (!blob) { setStatus('Este documento ainda não possui um arquivo Office binário para baixar.', true); return; }
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = filename; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 500);
    setStatus(`Download de ${filename} iniciado.`);
  }

  async function removeCurrent() {
    const documentRecord = state.documents.find((item) => item.id === state.selectedId);
    if (!documentRecord || !confirm(`Excluir localmente “${documentRecord.name}”?`)) return;
    await storage.remove(documentRecord.id);
    state.documents = await storage.list();
    state.selectedId = '';
    officeOpenId = '';
    setStatus('Documento removido deste navegador.'); render();
  }

  async function clearLibrary() {
    if (!state.documents.length || !confirm(`Excluir os ${state.documents.length} documentos locais desta biblioteca?`)) return;
    await Promise.all(state.documents.map((documentRecord) => storage.remove(documentRecord.id)));
    state.documents = [];
    state.selectedId = '';
    officeOpenId = '';
    setStatus('Biblioteca local limpa.'); render();
  }

  $('#new-document').addEventListener('click', openDialog);
  $('#import-document').addEventListener('click', openDialog);
  document.querySelectorAll('[data-action="new"]').forEach((button) => button.addEventListener('click', openDialog));
  $('#close-dialog').addEventListener('click', closeDialog);
  $('#cancel-dialog').addEventListener('click', closeDialog);
  els.form.addEventListener('submit', saveNewDocument);
  els.search.addEventListener('input', () => { state.query = els.search.value; renderList(); });
  els.clearLibrary.addEventListener('click', () => void clearLibrary());
  els.list.addEventListener('click', (event) => { const button = event.target.closest('[data-id]'); if (button) { state.selectedId = button.dataset.id; officeOpenId = ''; render(); } });
  els.csvContent.addEventListener('input', renderCsvPreview);
  els.saveDocument.addEventListener('click', () => void saveCurrent());
  els.downloadDocument.addEventListener('click', () => void downloadCurrent());
  els.deleteDocument.addEventListener('click', () => void removeCurrent());
  els.officeFrame.addEventListener('load', () => setOfficeStatus('Carregando editor OnlyOffice local…'));
  els.file.addEventListener('change', () => { const file = els.file.files?.[0]; if (file) { els.type.value = extension(file.name); if (!els.name.value) els.name.value = baseName(file.name); } });

  if (!storage || !financeStorage || !financeDataStore) {
    setStatus('O armazenamento de documentos ou o Financeiro não está disponível.', true);
  } else {
    void loadData().catch((error) => setStatus(error.message, true));
  }
})();
