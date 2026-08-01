((root, factory) => {
  const api = factory();
  root.FinanceDataStore = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window, () => {
  "use strict";

  const DATABASE = "officejur-financeiro";
  const VERSION = 1;
  const DOMAIN_STORE = "domains";

  function openDatabase(indexedDb = indexedDB) {
    return new Promise((resolve, reject) => {
      const request = indexedDb.open(DATABASE, VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(DOMAIN_STORE))
          database.createObjectStore(DOMAIN_STORE, { keyPath: "name" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        reject(request.error || new Error("Não foi possível abrir os dados financeiros locais."));
    });
  }

  function transaction(database, stores, mode, work) {
    return new Promise((resolve, reject) => {
      const tx = database.transaction(stores, mode);
      try {
        work(tx);
      } catch (error) {
        tx.abort();
        reject(error);
        return;
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("Não foi possível salvar os dados financeiros locais."));
      tx.onabort = () => reject(tx.error || new Error("A gravação dos dados financeiros foi cancelada."));
    });
  }

  function readDomains(database, financeStorage) {
    return new Promise((resolve, reject) => {
      const tx = database.transaction(DOMAIN_STORE, "readonly");
      const store = tx.objectStore(DOMAIN_STORE);
      const domains = {};
      financeStorage.domainNames.forEach((name) => {
        const request = store.get(name);
        request.onsuccess = () => {
          domains[name] = request.result
            ? financeStorage.normalizeDomain(name, request.result.value)
            : financeStorage.emptyDomain(name);
        };
        request.onerror = () => reject(request.error);
      });
      tx.oncomplete = () => resolve(domains);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  async function load({ financeStorage, indexedDb } = {}) {
    if (!financeStorage) throw new Error("O schema financeiro não está disponível.");
    const database = await openDatabase(indexedDb);
    try {
      return readDomains(database, financeStorage);
    } finally {
      database.close();
    }
  }

  async function save(domains, { database: existingDatabase, financeStorage } = {}) {
    if (!financeStorage) throw new Error("O schema financeiro não está disponível.");
    const database = existingDatabase || (await openDatabase());
    try {
      const normalized = Object.fromEntries(
        financeStorage.domainNames.map((name) => [
          name,
          financeStorage.normalizeDomain(name, domains[name]),
        ]),
      );
      await transaction(database, DOMAIN_STORE, "readwrite", (tx) => {
        const store = tx.objectStore(DOMAIN_STORE);
        financeStorage.domainNames.forEach((name) =>
          store.put({ name, value: normalized[name] }),
        );
      });
      return normalized;
    } finally {
      if (!existingDatabase) database.close();
    }
  }

  async function rawDomains({ financeStorage } = {}) {
    const database = await openDatabase();
    try {
      return readDomains(database, financeStorage);
    } finally {
      database.close();
    }
  }

  return {
    DATABASE,
    DOMAIN_STORE,
    VERSION,
    load,
    rawDomains,
    save,
  };
});
