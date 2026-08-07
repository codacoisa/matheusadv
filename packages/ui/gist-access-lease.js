((root, factory) => {
  const api = factory();
  root.OfficeJurGistAccessLease = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window, () => {
  "use strict";

  const STORAGE_KEY = "officejur::gist-access-lease";
  const VERSION = 1;
  const DEFAULT_POLICY = Object.freeze({ leaseHours: 3, graceMinutes: 180, minLeaseMinutes: 15, maxLeaseHours: 24 });
  const MODULES = Object.freeze(["calculos", "financeiro", "controle-pagamentos"]);
  const PROTECTED_STORAGE_KEYS = Object.freeze([
    "officejur::calculos-juridicos::data",
    "officejur::calculos-juridicos::sync-state",
    "officejur::financeiro::sync-state",
    "officejur::controle-pagamentos::data",
    "officejur::controle-pagamentos::sync-state",
    "officejur-gist-settings",
  ]);
  const PROTECTED_DATABASES = Object.freeze([
    "officejur-financeiro",
    "officejur-financeiro-documentos",
  ]);
  const HANDOFF_PREFIX = "officejur::documentos::handoff:";
  const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || min));
  const nowMs = (clock) => Number(clock?.now?.() ?? Date.now());
  const normalizeId = (value) => String(value || "").trim().toLowerCase();

  function policy(source) {
    const candidate = source && typeof source === "object" ? source : {};
    const min = DEFAULT_POLICY.minLeaseMinutes;
    const max = DEFAULT_POLICY.maxLeaseHours * 60;
    return Object.freeze({
      leaseMinutes: clamp((candidate.leaseHours ?? DEFAULT_POLICY.leaseHours) * 60, min, max),
      graceMinutes: clamp(candidate.graceMinutes ?? DEFAULT_POLICY.graceMinutes, 1, max),
    });
  }
  function empty() { return { version: VERSION, phase: "active", gistId: "", expiresAt: 0, graceExpiresAt: 0, resetForGistId: "", clearedModules: {} }; }
  function read(storage) {
    try {
      const saved = JSON.parse(storage.getItem(STORAGE_KEY) || "{}");
      return { ...empty(), ...saved, clearedModules: saved.clearedModules || {} };
    }
    catch (_) { return empty(); }
  }
  function isDefinitive(error) {
    return error?.category === "auth" || error?.category === "access";
  }

  function clearDatabase(databaseName, indexedDb) {
    if (!indexedDb?.open) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const request = indexedDb.open(databaseName);
      request.onerror = () => reject(request.error || new Error("Não foi possível abrir o armazenamento local."));
      request.onsuccess = () => {
        const database = request.result;
        const stores = [...database.objectStoreNames];
        if (!stores.length) {
          database.close();
          resolve();
          return;
        }
        let transaction;
        try {
          transaction = database.transaction(stores, "readwrite");
          stores.forEach((store) => transaction.objectStore(store).clear());
        } catch (error) {
          database.close();
          reject(error);
          return;
        }
        transaction.oncomplete = () => { database.close(); resolve(); };
        transaction.onerror = () => { database.close(); reject(transaction.error || new Error("Não foi possível limpar o armazenamento local.")); };
        transaction.onabort = () => { database.close(); reject(transaction.error || new Error("Não foi possível limpar o armazenamento local.")); };
      };
    });
  }

  async function clearProtectedData(storage, indexedDb, options = {}) {
    PROTECTED_STORAGE_KEYS.forEach((key) => {
      if (options.preserveSettings && key === "officejur-gist-settings") return;
      storage.removeItem(key);
    });
    for (let index = storage.length - 1; index >= 0; index -= 1) {
      const key = storage.key(index);
      if (key?.startsWith(HANDOFF_PREFIX)) storage.removeItem(key);
    }
    await Promise.all(PROTECTED_DATABASES.map((name) => clearDatabase(name, indexedDb)));
  }

  function create(options = {}) {
    const storage = options.storage || localStorage;
    const clock = options.clock || { now: () => Date.now() };
    const indexedDb = options.indexedDb || globalThis.indexedDB;
    const configuredPolicy = policy(options.policy || globalThis.OFFICEJUR_CONFIG?.gistAccessLease);
    const channel = typeof BroadcastChannel === "function" ? new BroadcastChannel("officejur-gist-access") : null;
    let state = read(storage);
    const emit = () => { try { storage.setItem(STORAGE_KEY, JSON.stringify(state)); channel?.postMessage(state); } catch (_) {} };
    const refresh = () => { state = read(storage); return state; };
    const error = (code) => Object.assign(new Error("O acesso local aos dados sincronizados está bloqueado."), { code, category: "access" });
    if (channel) channel.onmessage = () => refresh();
    if (typeof addEventListener === "function") addEventListener("storage", (event) => { if (event.key === STORAGE_KEY) refresh(); });

    function expireIfNeeded() {
      refresh();
      const current = nowMs(clock);
      if (state.gistId && state.expiresAt && current >= state.expiresAt && state.phase === "active") {
        state.phase = "purging";
        emit();
      }
      if (state.phase === "grace" && current >= state.graceExpiresAt) { state.phase = "purging"; emit(); }
      return state;
    }
    function renew(gistId) {
      const id = normalizeId(gistId);
      if (!id) return state;
      refresh();
      if (state.gistId && state.gistId !== id) {
        state.resetForGistId = id;
        state.clearedModules = {};
      }
      const current = nowMs(clock);
      state = { ...state, version: VERSION, phase: "active", gistId: id, expiresAt: current + configuredPolicy.leaseMinutes * 60_000, graceExpiresAt: 0 };
      emit();
      return state;
    }
    function fail(errorValue) {
      if (!isDefinitive(errorValue)) return state;
      refresh();
      if (!state.gistId || state.phase === "purging" || state.phase === "purged") return state;
      if (state.phase === "grace") return state;
      state.phase = "grace";
      state.graceExpiresAt = Math.min(
        nowMs(clock) + configuredPolicy.graceMinutes * 60_000,
        state.expiresAt || Number.POSITIVE_INFINITY,
      );
      emit();
      return state;
    }
    async function guard(moduleName, clear) {
      const module = String(moduleName || "");
      expireIfNeeded();
      const needsReset = state.resetForGistId && !state.clearedModules[module];
      if ((state.phase === "purging" || state.phase === "purged" || needsReset) && typeof clear === "function") {
        state.phase = "purging";
        emit();
        const rebind = Boolean(state.resetForGistId);
        const work = async () => {
          await clearProtectedData(storage, indexedDb, { preserveSettings: rebind });
          await clear();
        };
        if (typeof navigator !== "undefined" && navigator.locks?.request) await navigator.locks.request("officejur-gist-purge", work); else await work();
        refresh();
        state.clearedModules = Object.fromEntries(MODULES.map((name) => [name, true]));
        if (rebind) {
          state.phase = "active";
          state.gistId = state.resetForGistId;
          state.resetForGistId = "";
        } else {
          state.phase = "purged";
        }
        emit();
      }
      // Durante a graça o usuário ainda pode trocar o token e recuperar o mesmo Gist.
      return (state.phase === "active" || state.phase === "grace") && !state.resetForGistId;
    }
    function canSync(gistId) {
      expireIfNeeded();
      const id = normalizeId(gistId);
      if (state.gistId && id && state.gistId !== id) throw error("gist-changed");
      if (state.phase === "purging" || state.phase === "purged") throw error(state.phase);
      return true;
    }
    function warning() {
      const current = expireIfNeeded();
      if (current.phase !== "grace") return "";
      const minutes = Math.max(0, Math.ceil((current.graceExpiresAt - nowMs(clock)) / 60_000));
      const remaining = minutes >= 60
        ? `${Math.floor(minutes / 60)} h${minutes % 60 ? ` e ${minutes % 60} min` : ""}`
        : `${minutes} min`;
      return `Acesso ao Gist recusado. Nova tentativa disponível; limpeza local em ${remaining} se não houver recuperação.`;
    }
    function gatedClient(client) {
      const wrap = (name) => async (...args) => {
        const id = name === "json" ? "" : args[0];
        if (id) canSync(id);
        try {
          const result = await client[name](...args);
          if (id) renew(id);
          return result;
        } catch (caught) { fail(caught); throw caught; }
      };
      return { ...client, gist: wrap("gist"), gistSnapshot: wrap("gistSnapshot"), patch: wrap("patch"), json: wrap("json") };
    }
    return { STORAGE_KEY, policy: configuredPolicy, state: () => expireIfNeeded(), renew, fail, guard, canSync, warning, gatedClient };
  }
  return { DEFAULT_POLICY, PROTECTED_DATABASES, PROTECTED_STORAGE_KEYS, STORAGE_KEY, clearProtectedData, create, isDefinitive, policy };
});
