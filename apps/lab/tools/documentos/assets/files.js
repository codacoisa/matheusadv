(() => {
  'use strict';

  const SCHEMA = 'officejur/documentos-data';
  const VERSION = 1;
  const INDEX_FILE = 'lab-documentos.json';
  const MAX_PAYLOAD_BYTES = 10 * 1024 * 1024;

  const timestamp = (item) => String(item?.updatedAt || item?.createdAt || item?.deletedAt || '');
  const payloadFileName = (id) => `officejur-documento-${String(id)}.b64`;
  const originalPayloadFileName = (id) => `officejur-documento-${String(id)}-original.b64`;

  function emptyData(updatedAt = new Date().toISOString()) {
    return { schema: SCHEMA, version: VERSION, updatedAt, documents: [], deletedDocuments: [] };
  }

  function normalizeDeleted(list) {
    const map = new Map();
    (Array.isArray(list) ? list : []).forEach((item) => {
      if (!item?.id) return;
      const normalized = { id: String(item.id), deletedAt: String(item.deletedAt || '') };
      const current = map.get(normalized.id);
      if (!current || normalized.deletedAt > current.deletedAt) map.set(normalized.id, normalized);
    });
    return [...map.values()].sort((left, right) => left.id.localeCompare(right.id));
  }

  function normalizeDocument(item = {}) {
    const id = String(item.id || '');
    return {
      id,
      clientId: String(item.clientId || ''),
      clientName: String(item.clientName || ''),
      name: String(item.name || 'Documento sem título'),
      extension: String(item.extension || 'docx').toLowerCase(),
      mimeType: String(item.mimeType || 'application/octet-stream'),
      fileName: String(item.fileName || `${item.name || 'Documento sem título'}.${item.extension || 'docx'}`),
      source: String(item.source || 'created'),
      content: String(item.content || ''),
      size: Math.max(0, Number(item.size || 0)),
      originalSize: Math.max(0, Number(item.originalSize || item.size || 0)),
      sha256: String(item.sha256 || ''),
      originalSha256: String(item.originalSha256 || item.sha256 || ''),
      payloadFile: String(item.payloadFile || payloadFileName(id)),
      originalPayloadFile: String(item.originalPayloadFile || originalPayloadFileName(id)),
      createdAt: String(item.createdAt || ''),
      updatedAt: String(item.updatedAt || item.createdAt || '')
    };
  }

  function normalizeData(raw) {
    const source = raw && typeof raw === 'object' ? raw : {};
    if (source.schema && source.schema !== SCHEMA) throw new Error('Os documentos não usam o formato atual do OfficeJur.');
    if (source.version !== undefined && Number(source.version) !== VERSION) throw new Error('Os documentos usam uma versão incompatível.');
    return {
      ...emptyData(String(source.updatedAt || new Date().toISOString())),
      documents: (Array.isArray(source.documents) ? source.documents : Array.isArray(source.files) ? source.files : [])
        .map(normalizeDocument)
        .filter((item) => item.id && item.clientId),
      deletedDocuments: normalizeDeleted(source.deletedDocuments || source.deletedFiles)
    };
  }

  function needsPayloadUpload(local, remote) {
    return !remote || remote.sha256 !== local.sha256 || remote.originalSha256 !== local.originalSha256
      || remote.payloadFile !== local.payloadFile || remote.originalPayloadFile !== local.originalPayloadFile;
  }

  function deletedPayloadFiles(raw, remoteFiles = {}) {
    const normalized = normalizeData(raw);
    const activeIds = new Set(normalized.documents.map((item) => item.id));
    return normalized.deletedDocuments
      .filter((item) => !activeIds.has(item.id))
      .flatMap((item) => [payloadFileName(item.id), originalPayloadFileName(item.id)])
      .filter((fileName) => Object.prototype.hasOwnProperty.call(remoteFiles, fileName))
      .sort();
  }

  function mergeData(leftRaw, rightRaw) {
    const left = normalizeData(leftRaw);
    const right = normalizeData(rightRaw);
    const deletedDocuments = normalizeDeleted([...left.deletedDocuments, ...right.deletedDocuments]);
    const deleted = new Map(deletedDocuments.map((item) => [item.id, item.deletedAt]));
    const map = new Map();
    [...left.documents, ...right.documents].forEach((item) => {
      const current = map.get(item.id);
      if (!current || timestamp(item) >= timestamp(current)) map.set(item.id, item);
    });
    return normalizeData({
      schema: SCHEMA,
      version: VERSION,
      updatedAt: [left.updatedAt, right.updatedAt].sort().pop() || new Date().toISOString(),
      documents: [...map.values()]
        .filter((item) => !deleted.get(item.id) || deleted.get(item.id) < timestamp(item))
        .sort((leftItem, rightItem) => leftItem.id.localeCompare(rightItem.id)),
      deletedDocuments
    });
  }

  function signature(raw) {
    const normalized = normalizeData(raw);
    return JSON.stringify({
      schema: normalized.schema,
      version: normalized.version,
      documents: normalized.documents.slice().sort((left, right) => left.id.localeCompare(right.id)),
      deletedDocuments: normalized.deletedDocuments
    });
  }

  function toBase64(value) {
    const bytes = value instanceof Uint8Array ? value : new Uint8Array(value || 0);
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    return btoa(binary);
  }

  function fromBase64(value) {
    const binary = atob(String(value || ''));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }

  const api = {
    SCHEMA, VERSION, INDEX_FILE, MAX_PAYLOAD_BYTES, emptyData, normalizeData,
    normalizeDocument, needsPayloadUpload, deletedPayloadFiles, mergeData,
    signature, payloadFileName, originalPayloadFileName, toBase64, fromBase64
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  globalThis.OfficeJurDocumentFiles = api;
})();
