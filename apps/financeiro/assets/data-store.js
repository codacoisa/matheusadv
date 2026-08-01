((root, factory) => {
  const api = factory();
  root.FinanceDataStore = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window, () => {
  "use strict";

  const DATABASE = "officejur-financeiro";
  const VERSION = 1;
  const DOMAIN_STORE = "domains";
  const META_STORE = "meta";
  const MIGRATION_KEY = "local-storage-migrated-v1";

  function openDatabase(indexedDb = indexedDB) {
    return new Promise((resolve, reject) => {
      const request = indexedDb.open(DATABASE, VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(DOMAIN_STORE))
          database.createObjectStore(DOMAIN_STORE, { keyPath: "name" });
        if (!database.objectStoreNames.contains(META_STORE))
          database.createObjectStore(META_STORE);
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

  function legacyDomains(storage, financeStorage) {
    const defaults = financeStorage.split({});
    return Object.fromEntries(
      financeStorage.domainNames.map((name) => {
        const definition = financeStorage.DOMAINS[name];
        const saved = storage.getItem(definition.storageKey);
        return [
          name,
          saved
            ? financeStorage.normalizeDomain(name, JSON.parse(saved))
            : defaults[name],
        ];
      }),
    );
  }

  function legacyRaw(storage, financeStorage) {
    return Object.fromEntries(
      financeStorage.domainNames.map((name) => {
        const definition = financeStorage.DOMAINS[name];
        return [definition.file, storage.getItem(definition.storageKey)];
      }),
    );
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

  async function load({ storage = localStorage, financeStorage, indexedDb } = {}) {
    if (!financeStorage) throw new Error("O schema financeiro não está disponível.");
    const database = await openDatabase(indexedDb);
    try {
      const migrated = await new Promise((resolve, reject) => {
        const tx = database.transaction(META_STORE, "readonly");
        const request = tx.objectStore(META_STORE).get(MIGRATION_KEY);
        request.onsuccess = () => resolve(Boolean(request.result));
        request.onerror = () => reject(request.error);
      });
      if (migrated) return readDomains(database, financeStorage);

      const domains = legacyDomains(storage, financeStorage);
      await save(domains, { database, financeStorage, markMigrated: true });
      // Só removemos o legado depois da transação IndexedDB concluída.
      financeStorage.domainNames.forEach((name) =>
        storage.removeItem(financeStorage.DOMAINS[name].storageKey),
      );
      return domains;
    } finally {
      database.close();
    }
  }

  async function save(domains, { database: existingDatabase, financeStorage, markMigrated = false } = {}) {
    if (!financeStorage) throw new Error("O schema financeiro não está disponível.");
    const database = existingDatabase || (await openDatabase());
    try {
      const normalized = Object.fromEntries(
        financeStorage.domainNames.map((name) => [
          name,
          financeStorage.normalizeDomain(name, domains[name]),
        ]),
      );
      await transaction(database, [DOMAIN_STORE, META_STORE], "readwrite", (tx) => {
        const store = tx.objectStore(DOMAIN_STORE);
        financeStorage.domainNames.forEach((name) =>
          store.put({ name, value: normalized[name] }),
        );
        if (markMigrated) tx.objectStore(META_STORE).put(true, MIGRATION_KEY);
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
    legacyRaw,
    MIGRATION_KEY,
    META_STORE,
    VERSION,
    legacyDomains,
    load,
    rawDomains,
    save,
  };
});
