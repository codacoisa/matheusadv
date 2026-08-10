(() => {
  'use strict';

  const storage = window.OfficeJurLabDocuments;
  const templates = window.OfficeJurDocumentTemplates;
  const engineApi = window.OfficeJurDocumentEngine;
  const financeStorage = window.FinanceStorage;
  const financeDataStore = window.FinanceDataStore;
  const $ = (selector) => document.querySelector(selector);
  const state = { clients: [], documents: [], selectedId: '', query: '', busy: false, officeEditor: { id: '', originalText: '' } };
  let engineClient = null;
  const els = {
    status: $('#status'),
    count: $('#document-count'),
    list: $('#document-list'),
    search: $('#document-search'),
    empty: $('#editor-empty'),
    editor: $('#editor-view'),
    editorType: $('#editor-type'),
    editorTitle: $('#editor-title'),
    editorClient: $('#editor-client'),
    editorNotice: $('#editor-notice'),
    deleteDocument: $('#delete-document'),
    csvEditor: $('#csv-editor'),
    csvContent: $('#csv-content'),
    csvPreview: $('#csv-preview'),
    officeEditor: $('#office-editor'),
    officeVisual: $('#office-visual'),
    officeContent: $('#office-content'),
    officeNotes: $('#office-notes'),
    engineInspect: $('#engine-inspect'),
    engineStatus: $('#engine-status'),
    enginePreview: $('#engine-preview'),
    enginePreviewText: $('#engine-preview-text'),
    engineSearch: $('#engine-search'),
    engineReplacement: $('#engine-replacement'),
    engineReplace: $('#engine-replace'),
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

  function setEngineStatus(message, error = false) {
    els.engineStatus.textContent = message;
    els.engineStatus.classList.toggle('error', error);
  }

  function getEngineClient() {
    if (!engineApi?.create) return null;
    engineClient ||= engineApi.create();
    return engineClient;
  }

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
    els.engineInspect.disabled = isCsv || !documentRecord.file;
    els.engineReplace.disabled = isCsv || !documentRecord.file;
    els.enginePreview.hidden = true;
    els.enginePreviewText.textContent = '';
    if (state.officeEditor.id !== documentRecord.id) {
      els.officeVisual.hidden = true;
      els.officeContent.textContent = '';
    }
    if (isCsv) {
      els.csvContent.value = documentRecord.content || '';
      renderCsvPreview();
      els.editorNotice.textContent = documentRecord.source === 'imported' ? 'Este CSV foi importado do dispositivo e pode ser editado diretamente.' : 'Este CSV é um documento novo salvo somente neste navegador.';
    } else {
      els.officeNotes.value = documentRecord.notes || '';
      els.editorNotice.textContent = documentRecord.fileName ? `Arquivo local: ${documentRecord.fileName}. O original importado permanece preservado.` : 'Documento Office local criado em branco. Abra-o para começar a editar o texto.';
      setEngineStatus(documentRecord.file ? 'Verificando engine WASM…' : 'Sem arquivo binário para testar');
      void refreshEngineStatus(documentRecord);
    }
  }

  async function refreshEngineStatus(documentRecord) {
    if (!documentRecord.file) return;
    const client = getEngineClient();
    if (!client) {
      setEngineStatus('Web Worker indisponível neste navegador', true);
      return;
    }
    try {
      const result = await client.probe();
      if (state.selectedId !== documentRecord.id) return;
      setEngineStatus(result.available ? `Engine disponível: ${result.manifest.engine} ${result.manifest.packageVersion}` : result.reason, !result.available);
    } catch (error) {
      if (state.selectedId === documentRecord.id) setEngineStatus(error.message, true);
    }
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
      try {
        fileBytes = await templates.createBlank(selectedExtension);
      } catch (error) {
        setStatus(`Não foi possível criar o modelo vazio: ${error.message}`, true);
        return;
      }
    }
    const fileBlob = fileBytes ? new Blob([fileBytes], { type: file?.type || mimeTypes[selectedExtension] }) : null;
    const record = {
      id: id(), clientId, clientName: clientName(clientId), name: documentName, extension: selectedExtension,
      mimeType: file?.type || mimeTypes[selectedExtension], source: file ? 'imported' : 'created', fileName: file?.name || (fileBlob ? `${documentName}.${selectedExtension}` : ''), content: selectedExtension === 'csv' && file ? await file.text() : '', notes: '', createdAt: timestamp, updatedAt: timestamp,
      file: fileBlob,
      originalFile: fileBlob ? new Blob([fileBytes], { type: file?.type || mimeTypes[selectedExtension] }) : null,
      engine: { status: 'not-tested' },
    };
    await storage.save(record);
    state.documents = await storage.list();
    state.selectedId = record.id;
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
      } else {
        documentRecord.notes = els.officeNotes.value;
        if (state.officeEditor.id === documentRecord.id && !els.officeVisual.hidden) {
          const editedText = els.officeContent.innerText.replace(/\r\n/g, '\n');
          const originalText = state.officeEditor.originalText;
          if (editedText !== originalText) {
            const client = getEngineClient();
            if (!client) throw new Error('Web Worker indisponível neste navegador.');
            setEngineStatus('Salvando texto no arquivo local…');
            const result = await client.replaceText({ file: documentRecord.file, extension: documentRecord.extension, mimeType: documentRecord.mimeType, search: originalText, replacement: editedText });
            documentRecord.file = result.blob;
            documentRecord.engine = { status: 'visual-text-edited', at: now(), path: result.path, count: result.count };
            state.officeEditor.originalText = editedText;
          }
        }
      }
      documentRecord.updatedAt = now();
      await storage.save(documentRecord);
      state.documents = await storage.list();
      setStatus('Alterações salvas localmente.');
      render();
    } catch (error) {
      setStatus(`Não foi possível salvar: ${error.message}`, true);
      setEngineStatus(error.message, true);
    }
  }

  async function inspectWithEngine() {
    const documentRecord = state.documents.find((item) => item.id === state.selectedId);
    if (!documentRecord?.file || documentRecord.extension === 'csv') return;
    const client = getEngineClient();
    if (!client) {
      setEngineStatus('Web Worker indisponível neste navegador', true);
      return;
    }
    els.engineInspect.disabled = true;
    setEngineStatus('Lendo conteúdo localmente…');
    try {
      const result = await client.inspect({ file: documentRecord.file, extension: documentRecord.extension, mimeType: documentRecord.mimeType });
      els.enginePreviewText.textContent = result.plainText || 'O engine não encontrou texto extraível neste arquivo.';
      els.enginePreview.hidden = false;
      state.officeEditor = { id: documentRecord.id, originalText: result.plainText || '' };
      els.officeContent.textContent = result.plainText || '';
      els.officeVisual.hidden = false;
      setStatus(`Conteúdo ${result.format.toUpperCase()} lido localmente; o original foi preservado.`);
      setEngineStatus(`${result.format.toUpperCase()} aberto para edição local`);
    } catch (error) {
      setEngineStatus(error.message, true);
      setStatus('O engine não conseguiu ler este documento.', true);
    } finally {
      els.engineInspect.disabled = !documentRecord.file;
    }
  }

  async function replaceTextWithEngine() {
    const documentRecord = state.documents.find((item) => item.id === state.selectedId);
    const search = els.engineSearch.value;
    const replacement = els.engineReplacement.value;
    if (!documentRecord?.file || documentRecord.extension === 'csv') return;
    if (!search) { setStatus('Informe o texto atual antes de substituir.', true); els.engineSearch.focus(); return; }
    const client = getEngineClient();
    if (!client) { setEngineStatus('Web Worker indisponível neste navegador', true); return; }
    els.engineReplace.disabled = true;
    setEngineStatus('Regravando cópia local…');
    try {
      const result = await client.replaceText({ file: documentRecord.file, extension: documentRecord.extension, mimeType: documentRecord.mimeType, search, replacement });
      documentRecord.file = result.blob;
      documentRecord.engine = { status: 'text-replaced', at: now(), path: result.path, count: result.count };
      state.officeEditor = { id: '', originalText: '' };
      documentRecord.updatedAt = now();
      await storage.save(documentRecord);
      state.documents = await storage.list();
      render();
      setStatus(`${result.count} ocorrência substituída localmente; o original foi preservado.`);
      setEngineStatus('Cópia editada localmente');
    } catch (error) {
      setEngineStatus(error.message, true);
      setStatus('A edição estrutural não foi aplicada.', true);
    } finally {
      els.engineReplace.disabled = !documentRecord.file;
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
    state.documents = await storage.list(); state.selectedId = ''; state.officeEditor = { id: '', originalText: '' };
    setStatus('Documento removido deste navegador.'); render();
  }

  $('#new-document').addEventListener('click', openDialog);
  $('#import-document').addEventListener('click', openDialog);
  document.querySelectorAll('[data-action="new"]').forEach((button) => button.addEventListener('click', openDialog));
  $('#close-dialog').addEventListener('click', closeDialog);
  $('#cancel-dialog').addEventListener('click', closeDialog);
  els.form.addEventListener('submit', saveNewDocument);
  els.search.addEventListener('input', () => { state.query = els.search.value; renderList(); });
  els.list.addEventListener('click', (event) => { const button = event.target.closest('[data-id]'); if (button) { state.selectedId = button.dataset.id; render(); } });
  els.csvContent.addEventListener('input', renderCsvPreview);
  $('#save-document').addEventListener('click', () => void saveCurrent());
  $('#download-document').addEventListener('click', () => void downloadCurrent());
  $('#delete-document').addEventListener('click', () => void removeCurrent());
  els.engineInspect.addEventListener('click', () => void inspectWithEngine());
  els.engineReplace.addEventListener('click', () => void replaceTextWithEngine());
  els.file.addEventListener('change', () => { const file = els.file.files?.[0]; if (file) { els.type.value = extension(file.name); if (!els.name.value) els.name.value = baseName(file.name); } });

  if (!storage || !financeStorage || !financeDataStore) {
    setStatus('O armazenamento de documentos ou o Financeiro não está disponível.', true);
  } else {
    void loadData().catch((error) => setStatus(error.message, true));
  }
})();
