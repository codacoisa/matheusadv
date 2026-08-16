((root, factory) => {
  const api = factory();
  root.OfficeJurWorkerSettings = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window, () => {
  "use strict";

  const STORAGE_KEY = "officejur-worker-settings";
  const VERSION = 1;

  function normalize(value) {
    const source = value && typeof value === "object" ? value : {};
    return {
      version: VERSION,
      apiUrl: String(source.apiUrl || "").trim().replace(/\/$/, ""),
      apiKey: String(source.apiKey || "").trim(),
    };
  }

  function read(storage, key) {
    try {
      return JSON.parse(storage.getItem(key) || "{}");
    } catch (_) {
      return {};
    }
  }

  function load(options) {
    const local = (options && options.storage) || localStorage;
    return normalize(read(local, STORAGE_KEY));
  }

  function save(value, options) {
    const local = (options && options.storage) || localStorage;
    const settings = normalize(value);
    local.setItem(STORAGE_KEY, JSON.stringify({
      version: settings.version,
      apiUrl: settings.apiUrl,
      apiKey: settings.apiKey,
    }));
    return settings;
  }

  function clear(options) {
    const local = (options && options.storage) || localStorage;
    const settings = normalize({});
    local.setItem(STORAGE_KEY, JSON.stringify({
      version: settings.version,
      apiUrl: settings.apiUrl,
      apiKey: settings.apiKey,
    }));
    return settings;
  }

  return { STORAGE_KEY, VERSION, clear, load, normalize, save };
});
