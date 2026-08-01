((root, factory) => {
  const api = factory();
  root.OfficeJurGistSettings = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, () => {
  'use strict';

  const STORAGE_KEY = 'officejur-gist-settings';
  const VERSION = 1;

  function normalize(value) {
    const source = value && typeof value === 'object' ? value : {};
    const rawGistId = String(source.gistId || '').trim();
    const gistUrlMatch = rawGistId.match(
      /(?:gist\.github\.com\/(?:[^/]+\/)?|api\.github\.com\/gists\/)([a-f0-9]+)/i
    );
    return {
      version: VERSION,
      gistId: gistUrlMatch ? gistUrlMatch[1] : rawGistId,
      token: String(source.token || '').trim(),
      autoSync: !!source.autoSync
    };
  }

  function read(storage, key) {
    try {
      return normalize(JSON.parse(storage.getItem(key) || '{}'));
    } catch (_) {
      return normalize({});
    }
  }

  function load(options) {
    const storage = (options && options.storage) || localStorage;
    return read(storage, STORAGE_KEY);
  }

  function save(value, options) {
    const storage = (options && options.storage) || localStorage;
    const settings = normalize(value);
    storage.setItem(STORAGE_KEY, JSON.stringify(settings));
    return settings;
  }

  function clear(options) {
    const storage = (options && options.storage) || localStorage;
    const settings = normalize({});
    storage.setItem(STORAGE_KEY, JSON.stringify(settings));
    return settings;
  }

  return { STORAGE_KEY, VERSION, clear, load, normalize, save };
});
