((root, factory) => {
  const api = factory();
  root.OfficeJurLabDocuments = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, () => {
  'use strict';

  const DATABASE = 'officejur-documentos-lab';
  const VERSION = 1;
  const STORE = 'documents';

  function openDatabase(indexedDb = globalThis.indexedDB) {
    if (!indexedDb?.open) return Promise.reject(new Error('O armazenamento local não está disponível neste navegador.'));
    return new Promise((resolve, reject) => {
      const request = indexedDb.open(DATABASE, VERSION);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE))
          request.result.createObjectStore(STORE, { keyPath: 'id' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Não foi possível abrir os documentos locais.'));
    });
  }

  function transaction(database, mode, work) {
    return new Promise((resolve, reject) => {
      const request = database.transaction(STORE, mode);
      let result;
      try { result = work(request.objectStore(STORE)); }
      catch (error) { request.abort(); reject(error); return; }
      request.oncomplete = () => resolve(result);
      request.onerror = () => reject(request.error || new Error('Não foi possível salvar o documento local.'));
      request.onabort = () => reject(request.error || new Error('A operação local foi cancelada.'));
    });
  }

  async function list({ indexedDb } = {}) {
    const database = await openDatabase(indexedDb);
    try {
      return await new Promise((resolve, reject) => {
        const request = database.transaction(STORE, 'readonly').objectStore(STORE).getAll();
        request.onsuccess = () => resolve(request.result.sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt))));
        request.onerror = () => reject(request.error);
      });
    } finally { database.close(); }
  }

  async function get(id, { indexedDb } = {}) {
    const database = await openDatabase(indexedDb);
    try {
      return await new Promise((resolve, reject) => {
        const request = database.transaction(STORE, 'readonly').objectStore(STORE).get(id);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
    } finally { database.close(); }
  }

  async function save(document, { indexedDb } = {}) {
    const database = await openDatabase(indexedDb);
    try { await transaction(database, 'readwrite', (store) => store.put(document)); return document; }
    finally { database.close(); }
  }

  async function remove(id, { indexedDb } = {}) {
    const database = await openDatabase(indexedDb);
    try { await transaction(database, 'readwrite', (store) => store.delete(id)); }
    finally { database.close(); }
  }

  return { DATABASE, STORE, VERSION, get, list, openDatabase, remove, save };
});
