((root, factory) => {
  const api = factory();
  root.OfficeJurLabDocuments = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, () => {
  'use strict';

  const DATABASE = 'officejur-documentos-lab';
  const VERSION = 3;
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
    const normalized = { ...document };
    delete normalized.file;
    delete normalized.originalFile;
    normalized.dataBase64 = String(normalized.dataBase64 ?? normalized.fileBase64 ?? '');
    normalized.originalDataBase64 = String(normalized.originalDataBase64 ?? normalized.originalFileBase64 ?? normalized.dataBase64);
    delete normalized.fileBase64;
    delete normalized.originalFileBase64;
    return normalized;
  }

  async function serialize(document) {
    if (!document) return document;
    const serialized = { ...document };
    if (serialized.file) serialized.dataBase64 = await blobToBase64(serialized.file);
    if (serialized.originalFile) serialized.originalDataBase64 = await blobToBase64(serialized.originalFile);
    if (serialized.dataBase64 == null) serialized.dataBase64 = '';
    if (serialized.originalDataBase64 == null) serialized.originalDataBase64 = serialized.dataBase64;
    return normalize(serialized);
  }

  async function migrate(records, database) {
    const migrated = await Promise.all(records.map(serialize));
    const changed = records.some((record) => record?.file || record?.originalFile || record?.fileBase64 || record?.originalFileBase64);
    if (changed) await transaction(database, 'readwrite', (store) => migrated.forEach((record) => store.put(record)));
    return migrated;
  }

  async function list({ indexedDb } = {}) {
    const database = await openDatabase(indexedDb);
    try {
      const records = await new Promise((resolve, reject) => {
        const request = database.transaction(STORE, 'readonly').objectStore(STORE).getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      return (await migrate(records, database)).sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)));
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
      const [migrated] = await migrate([record], database);
      return migrated;
    } finally { database.close(); }
  }

  async function save(document, { indexedDb } = {}) {
    const database = await openDatabase(indexedDb);
    const serialized = await serialize(document);
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
