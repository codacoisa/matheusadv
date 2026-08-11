((root, factory) => {
  const api = factory();
  root.OfficeJurDocuments = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, () => {
  'use strict';

  const DATABASE = 'officejur-arquivos';
  const VERSION = 1;
  const STORE = 'documents';

  function openDatabase(indexedDb = globalThis.indexedDB) {
    if (!indexedDb?.open) return Promise.reject(new Error('O armazenamento deste navegador não está disponível.'));
    return new Promise((resolve, reject) => {
      const request = indexedDb.open(DATABASE, VERSION);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE))
          request.result.createObjectStore(STORE, { keyPath: 'id' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Não foi possível abrir os documentos deste navegador.'));
    });
  }

  function transaction(database, mode, work) {
    return new Promise((resolve, reject) => {
      const request = database.transaction(STORE, mode);
      let result;
      try { result = work(request.objectStore(STORE)); }
      catch (error) { request.abort(); reject(error); return; }
      request.oncomplete = () => resolve(result);
      request.onerror = () => reject(request.error || new Error('Não foi possível salvar o documento.'));
      request.onabort = () => reject(request.error || new Error('A operação foi cancelada.'));
    });
  }

  function bytesToBase64(bytes) {
    const source = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || 0);
    let binary = '';
    const chunkSize = 0x8000;
    for (let offset = 0; offset < source.length; offset += chunkSize)
      binary += String.fromCharCode(...source.subarray(offset, offset + chunkSize));
    return globalThis.btoa(binary);
  }

  function base64ToBytes(base64) {
    const binary = globalThis.atob(String(base64 || ''));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }

  async function blobToBase64(value) {
    if (!value) return '';
    if (typeof value === 'string') return value;
    if (value instanceof ArrayBuffer) return bytesToBase64(new Uint8Array(value));
    if (ArrayBuffer.isView(value)) return bytesToBase64(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
    if (typeof value.arrayBuffer === 'function') return bytesToBase64(new Uint8Array(await value.arrayBuffer()));
    throw new Error('Não foi possível codificar o arquivo em Base64.');
  }

  function textToBase64(value) {
    return bytesToBase64(new TextEncoder().encode(String(value || '')));
  }

  function base64ToBlob(base64, mimeType = 'application/octet-stream') {
    return new Blob([base64ToBytes(base64)], { type: mimeType });
  }

  function toBlob(document, original = false) {
    if (!document) return null;
    const base64 = original ? document.originalDataBase64 : document.dataBase64;
    return base64 == null ? null : base64ToBlob(base64, document.mimeType);
  }

  function toFile(document, original = false) {
    const blob = toBlob(document, original);
    if (!blob) return null;
    const filename = document.fileName || `${document.name}.${document.extension}`;
    return new File([blob], filename, { type: document.mimeType || blob.type });
  }

  function normalize(document) {
    if (!document) return document;
    return {
      id: String(document.id || ''),
      clientId: String(document.clientId || ''),
      clientName: String(document.clientName || ''),
      name: String(document.name || 'Documento sem título'),
      extension: String(document.extension || 'docx'),
      mimeType: String(document.mimeType || 'application/octet-stream'),
      fileName: String(document.fileName || ''),
      source: String(document.source || 'created'),
      content: String(document.content || ''),
      size: Math.max(0, Number(document.size || 0)),
      originalSize: Math.max(0, Number(document.originalSize || 0)),
      sha256: String(document.sha256 || ''),
      originalSha256: String(document.originalSha256 || ''),
      payloadFile: String(document.payloadFile || ''),
      originalPayloadFile: String(document.originalPayloadFile || ''),
      createdAt: String(document.createdAt || ''),
      updatedAt: String(document.updatedAt || ''),
      dataBase64: String(document.dataBase64 ?? ''),
      originalDataBase64: String(document.originalDataBase64 ?? ''),
    };
  }

  async function list({ indexedDb } = {}) {
    const database = await openDatabase(indexedDb);
    try {
      const records = await new Promise((resolve, reject) => {
        const request = database.transaction(STORE, 'readonly').objectStore(STORE).getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      return records.map(normalize).sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)));
    } finally { database.close(); }
  }

  async function get(id, { indexedDb } = {}) {
    const database = await openDatabase(indexedDb);
    try {
      const record = await new Promise((resolve, reject) => {
        const request = database.transaction(STORE, 'readonly').objectStore(STORE).get(id);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
      if (!record) return null;
      return normalize(record);
    } finally { database.close(); }
  }

  async function save(document, { indexedDb } = {}) {
    const database = await openDatabase(indexedDb);
    const serialized = normalize(document);
    try { await transaction(database, 'readwrite', (store) => store.put(serialized)); return serialized; }
    finally { database.close(); }
  }

  async function remove(id, { indexedDb } = {}) {
    const database = await openDatabase(indexedDb);
    try { await transaction(database, 'readwrite', (store) => store.delete(id)); }
    finally { database.close(); }
  }

  async function clear({ indexedDb } = {}) {
    const database = await openDatabase(indexedDb);
    try { await transaction(database, 'readwrite', (store) => store.clear()); }
    finally { database.close(); }
  }

  return {
    DATABASE, STORE, VERSION, base64ToBlob, base64ToBytes, blobToBase64, bytesToBase64,
    clear, get, list, normalize, openDatabase, remove, save, textToBase64, toBlob, toFile,
  };
});
