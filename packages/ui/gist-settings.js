((root, factory) => {
  const api = factory();
  root.OfficeJurGistSettings = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, () => {
  'use strict';

  const STORAGE_KEY = 'officejur-gist-settings-v1';
  const LEGACY_KEYS = [
    'gm-financeiro-gist-v2',
    'gm-payments-gist-settings-v1'
  ];

  function normalize(value) {
    const source = value && typeof value === 'object' ? value : {};
    const rawGistId = String(source.gistId || '').trim();
    const gistUrlMatch = rawGistId.match(
      /(?:gist\.github\.com\/(?:[^/]+\/)?|api\.github\.com\/gists\/)([a-f0-9]+)/i
    );
    return {
      gistId: gistUrlMatch ? gistUrlMatch[1] : rawGistId,
      token: String(source.token || '').trim()
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
    const opts = options || {};
    const storage = opts.storage || localStorage;
    const globalSettings = read(storage, STORAGE_KEY);
    if (storage.getItem(STORAGE_KEY) !== null) {
      return globalSettings;
    }

    const legacyKeys = Array.isArray(opts.legacyKeys)
      ? opts.legacyKeys
      : opts.legacyKey
        ? [opts.legacyKey]
        : LEGACY_KEYS;
    const candidates = legacyKeys.map((key) => read(storage, key));
    const legacySettings =
      candidates.find((settings) => settings.gistId && settings.token) ||
      candidates.find((settings) => settings.gistId || settings.token) ||
      normalize({});
    if (legacySettings.gistId || legacySettings.token) {
      storage.setItem(STORAGE_KEY, JSON.stringify(legacySettings));
    }
    return legacySettings;
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

  return { LEGACY_KEYS, STORAGE_KEY, clear, load, normalize, save };
});
