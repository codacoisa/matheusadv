((root, factory) => {
  const api = factory();
  root.OfficeJurGistAccessLease = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window, () => {
  "use strict";

  const STORAGE_KEY = "officejur::gist-access-lease";
  const LOCK_KEY = "officejur::gist-access-lease::purge-lock";
  const VERSION = 2;
  const DEFAULT_POLICY = Object.freeze({ leaseHours: 3, graceMinutes: 180, minLeaseMinutes: 15, maxLeaseHours: 24 });
  const PHASES = new Set(["active", "grace", "unverified", "purging", "purged"]);
  const PROTECTED_STORAGE_KEYS = Object.freeze([
    "officejur::calculos-juridicos::data",
    "officejur::calculos-juridicos::sync-state",
    "officejur::financeiro::sync-state",
    "officejur::controle-pagamentos::data",
    "officejur::controle-pagamentos::sync-state",
    "officejur-gist-settings",
  ]);
  const PROTECTED_DERIVED_STORAGE_KEYS = Object.freeze([
    "officejur::documentos::honorarios::draft",
    "officejur::documentos::procuracao::draft",
  ]);
  const PROTECTED_DATABASES = Object.freeze([
    "officejur-financeiro",
    "officejur-financeiro-documentos",
  ]);
  const HANDOFF_PREFIX = "officejur::documentos::handoff:";
  const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || min));
  const nowMs = (clock) => Number(clock?.now?.() ?? Date.now());
  const normalizeId = (value) => String(value || "").trim().toLowerCase();
  const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

  function policy(source) {
    const candidate = source && typeof source === "object" ? source : {};
    const min = DEFAULT_POLICY.minLeaseMinutes;
    const max = DEFAULT_POLICY.maxLeaseHours * 60;
    return Object.freeze({
      leaseMinutes: clamp((candidate.leaseHours ?? DEFAULT_POLICY.leaseHours) * 60, min, max),
      graceMinutes: clamp(candidate.graceMinutes ?? DEFAULT_POLICY.graceMinutes, 1, max),
    });
  }
  function empty(phase = "active") {
    return { version: VERSION, phase, gistId: "", expiresAt: 0, graceExpiresAt: 0, resetForGistId: "", purgeId: 0 };
  }
  function hasConfiguredGist(storage) {
    try { return Boolean(JSON.parse(storage.getItem("officejur-gist-settings") || "{}").gistId); }
    catch (_) { return false; }
  }
  function read(storage) {
    try {
      const raw = storage.getItem(STORAGE_KEY);
      if (!raw) return empty(hasConfiguredGist(storage) ? "unverified" : "active");
      const saved = JSON.parse(raw);
      if (!saved || typeof saved !== "object" || !PHASES.has(saved.phase)) throw new Error("Estado inválido.");
      return {
        ...empty(),
        ...saved,
        version: VERSION,
        gistId: normalizeId(saved.gistId),
        resetForGistId: normalizeId(saved.resetForGistId),
        expiresAt: Math.max(0, Number(saved.expiresAt) || 0),
        graceExpiresAt: Math.max(0, Number(saved.graceExpiresAt) || 0),
        purgeId: Math.max(0, Number(saved.purgeId) || 0),
      };
    } catch (_) {
      return empty(hasConfiguredGist(storage) ? "unverified" : "active");
    }
  }
  function isDefinitive(error) {
    return error?.category === "auth" || error?.category === "access";
  }

  function clearDatabase(databaseName, indexedDb) {
    if (!indexedDb?.open) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const request = indexedDb.open(databaseName);
      let created = false;
      request.onupgradeneeded = () => { created = request.oldVersion === 0; };
      request.onerror = () => reject(request.error || new Error("Não foi possível abrir o armazenamento local."));
      request.onsuccess = () => {
        const database = request.result;
        if (created) {
          database.close();
          const deletion = indexedDb.deleteDatabase(databaseName);
          deletion.onsuccess = () => resolve();
          deletion.onerror = () => reject(deletion.error || new Error("Não foi possível remover o armazenamento local vazio."));
          deletion.onblocked = () => reject(new Error("A limpeza do armazenamento local foi bloqueada por outra aba."));
          return;
        }
        const stores = [...database.objectStoreNames];
        if (!stores.length) { database.close(); resolve(); return; }
        let transaction;
        try {
          transaction = database.transaction(stores, "readwrite");
          stores.forEach((store) => transaction.objectStore(store).clear());
        } catch (error) {
          database.close(); reject(error); return;
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
    PROTECTED_DERIVED_STORAGE_KEYS.forEach((key) => {
      try {
        const value = JSON.parse(storage.getItem(key) || "null");
        if (value?.__officejurGistProtected === true) storage.removeItem(key);
      } catch (_) { /* rascunhos locais sem marca de origem não pertencem à revogação do Gist */ }
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
    const browser = typeof window !== "undefined";
    const channel = browser && typeof BroadcastChannel === "function" ? new BroadcastChannel("officejur-gist-access") : null;
    const listeners = new Set();
    const clearers = new Map();
    let state = read(storage);
    let timer = 0;
    let purgePromise = null;
    let handledPurgeId = state.purgeId;
    let locallyClearedPurgeId = -1;

    const blockedError = (code) => Object.assign(new Error("O acesso local aos dados sincronizados está bloqueado."), { code, category: "access" });
    const emit = () => {
      try { storage.setItem(STORAGE_KEY, JSON.stringify(state)); }
      catch (_) { throw blockedError("lease-storage"); }
      channel?.postMessage({ version: VERSION });
      schedule();
      listeners.forEach((listener) => listener({ ...state }));
    };
    const refresh = () => { state = read(storage); schedule(); return state; };
    const transitionExpired = () => {
      const current = nowMs(clock);
      if (state.phase === "active" && state.gistId && state.expiresAt && current >= state.expiresAt) {
        state.phase = "purging"; emit();
      } else if (state.phase === "grace" && current >= state.graceExpiresAt) {
        state.phase = "purging"; emit();
      } else if (state.phase === "unverified") {
        state.phase = "purging"; emit();
      }
      return state;
    };
    const deadline = () => state.phase === "active" ? state.expiresAt : state.phase === "grace" ? state.graceExpiresAt : 0;
    function schedule() {
      clearTimeout(timer);
      const at = deadline();
      if (!at) return;
      const delay = Math.max(0, Math.min(at - nowMs(clock), 2_147_000_000));
      timer = setTimeout(() => { void purge().catch(() => {}); }, delay);
      timer?.unref?.();
    }
    async function withFallbackLock(operation) {
      if (!browser) return operation();
      const token = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
      for (let attempt = 0; attempt < 20; attempt += 1) {
        let held = null;
        try { held = JSON.parse(storage.getItem(LOCK_KEY) || "null"); } catch (_) { /* lock inválido é substituído */ }
        if (!held?.expiresAt || held.expiresAt <= Date.now()) {
          storage.setItem(LOCK_KEY, JSON.stringify({ token, expiresAt: Date.now() + 10_000 }));
          await wait(25);
          try { held = JSON.parse(storage.getItem(LOCK_KEY) || "null"); } catch (_) { held = null; }
          if (held?.token === token) {
            try { return await operation(); }
            finally {
              try {
                const current = JSON.parse(storage.getItem(LOCK_KEY) || "null");
                if (current?.token === token) storage.removeItem(LOCK_KEY);
              } catch (_) { /* o lock expira sozinho */ }
            }
          }
        }
        await wait(25 + attempt * 5);
      }
      throw blockedError("purge-lock");
    }
    const withPurgeLock = (operation) => {
      if (browser && navigator.locks?.request) return navigator.locks.request("officejur-gist-purge", operation);
      return withFallbackLock(operation);
    };
    async function clearRegistered() {
      await Promise.all([...clearers.values()].map((clear) => Promise.resolve().then(clear)));
    }
    async function performPurge() {
      return withPurgeLock(async () => {
        refresh();
        transitionExpired();
        if (state.phase !== "purging" && !state.resetForGistId) return state;
        const preserveSettings = Boolean(state.resetForGistId);
        await clearProtectedData(storage, indexedDb, { preserveSettings });
        await clearRegistered();
        refresh();
        if (state.phase !== "purging" && !state.resetForGistId) return state;
        const nextGistId = state.resetForGistId;
        state = nextGistId
          ? { ...empty("active"), gistId: nextGistId, expiresAt: state.expiresAt, purgeId: state.purgeId + 1 }
          : { ...empty("purged"), gistId: state.gistId, purgeId: state.purgeId + 1 };
        handledPurgeId = state.purgeId;
        locallyClearedPurgeId = state.purgeId;
        emit();
        return state;
      });
    }
    function purge() {
      if (!purgePromise) purgePromise = performPurge().finally(() => { purgePromise = null; });
      return purgePromise;
    }
    async function processExternalState() {
      const previousPurgeId = handledPurgeId;
      refresh();
      transitionExpired();
      if (state.phase === "purging" || state.resetForGistId) await purge();
      refresh();
      if (state.purgeId > previousPurgeId) {
        handledPurgeId = state.purgeId;
        await clearRegistered();
        locallyClearedPurgeId = state.purgeId;
      }
      listeners.forEach((listener) => listener({ ...state }));
    }
    if (channel) channel.onmessage = () => { void processExternalState(); };
    if (browser) addEventListener("storage", (event) => {
      if (event.key === STORAGE_KEY) void processExternalState();
    });

    function expireIfNeeded() {
      refresh();
      transitionExpired();
      if (state.phase === "purging") void purge().catch(() => {});
      return state;
    }
    function renew(gistId) {
      const id = normalizeId(gistId);
      if (!id) return state;
      refresh();
      const current = nowMs(clock);
      if (state.gistId && state.gistId !== id) {
        state = { ...state, phase: "purging", resetForGistId: id, expiresAt: current + configuredPolicy.leaseMinutes * 60_000, graceExpiresAt: 0 };
        emit();
        void purge().catch(() => {});
        return state;
      }
      state = { ...state, version: VERSION, phase: "active", gistId: id, expiresAt: current + configuredPolicy.leaseMinutes * 60_000, graceExpiresAt: 0, resetForGistId: "" };
      emit();
      return state;
    }
    function revoke() {
      refresh();
      state = { ...state, phase: "purging", resetForGistId: "", graceExpiresAt: 0 };
      emit();
      return purge();
    }
    function fail(errorValue) {
      if (!isDefinitive(errorValue)) return state;
      refresh();
      transitionExpired();
      if (!state.gistId || ["unverified", "purging", "purged"].includes(state.phase)) return state;
      if (state.phase === "grace") return state;
      state.phase = "grace";
      state.graceExpiresAt = Math.min(nowMs(clock) + configuredPolicy.graceMinutes * 60_000, state.expiresAt || Number.POSITIVE_INFINITY);
      emit();
      return state;
    }
    async function guard(moduleName, clear) {
      const module = String(moduleName || "");
      if (module && typeof clear === "function") clearers.set(module, clear);
      expireIfNeeded();
      if (state.phase === "purging" || state.resetForGistId) await purge();
      refresh();
      if (state.phase === "purged") {
        if (typeof clear === "function" && locallyClearedPurgeId !== state.purgeId) {
          await clear();
          locallyClearedPurgeId = state.purgeId;
        }
        return false;
      }
      return state.phase === "active" || state.phase === "grace";
    }
    function canSync(gistId) {
      expireIfNeeded();
      const id = normalizeId(gistId);
      if (state.gistId && id && state.gistId !== id) throw blockedError("gist-changed");
      if (!["active", "grace"].includes(state.phase) || state.resetForGistId) throw blockedError(state.phase);
      return true;
    }
    function warning() {
      const current = expireIfNeeded();
      if (current.phase !== "grace") return "";
      const minutes = Math.max(0, Math.ceil((current.graceExpiresAt - nowMs(clock)) / 60_000));
      const remaining = minutes >= 60 ? `${Math.floor(minutes / 60)} h${minutes % 60 ? ` e ${minutes % 60} min` : ""}` : `${minutes} min`;
      return `Acesso ao Gist recusado. Nova tentativa disponível; limpeza local em ${remaining} se não houver recuperação.`;
    }
    function gatedClient(client) {
      const withId = new Set(["gist", "gistSnapshot", "patch"]);
      const wrap = (name) => async (...args) => {
        const id = withId.has(name) ? args[0] : "";
        const before = expireIfNeeded();
        if (id) canSync(id);
        else if (before.gistId && !["active", "grace"].includes(before.phase)) throw blockedError(before.phase);
        const purgeId = before.purgeId;
        try {
          const result = await client[name](...args);
          const after = expireIfNeeded();
          if (after.purgeId !== purgeId || !["active", "grace"].includes(after.phase) || after.resetForGistId) throw blockedError("lease-changed");
          if (id) renew(id);
          return result;
        } catch (caught) { fail(caught); throw caught; }
      };
      const wrapped = { ...client };
      ["gist", "gistSnapshot", "patch", "json", "text"].forEach((name) => {
        if (typeof client?.[name] === "function") wrapped[name] = wrap(name);
      });
      return wrapped;
    }
    function subscribe(listener) {
      if (typeof listener !== "function") return () => {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
    schedule();
    return { STORAGE_KEY, policy: configuredPolicy, state: () => expireIfNeeded(), renew, revoke, fail, guard, canSync, warning, gatedClient, purge, subscribe };
  }
  return { DEFAULT_POLICY, PROTECTED_DATABASES, PROTECTED_DERIVED_STORAGE_KEYS, PROTECTED_STORAGE_KEYS, STORAGE_KEY, clearProtectedData, create, isDefinitive, policy };
});
