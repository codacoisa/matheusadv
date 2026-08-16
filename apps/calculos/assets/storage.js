((root, factory) => {
  const api = factory();
  root.OfficeJurCalculationStorage = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window, () => {
  "use strict";
  const FILE = "officejur-calculos-juridicos.json";
  const STORAGE_KEY = "officejur-calculos-juridicos-data";
  const SCHEMA = "officejur/calculos-juridicos-data";
  const VERSION = 1;
  const stamp = (item) => String(item?.updatedAt || item?.createdAt || item?.deletedAt || "");

  function normalize(raw) {
    const source = raw && typeof raw === "object" ? raw : {};
    if (source.schema && source.schema !== SCHEMA) throw new Error(`${FILE} usa um formato incompatível.`);
    if (source.version !== undefined && Number(source.version) !== VERSION)
      throw new Error(`${FILE} usa uma versão incompatível.`);
    const records = new Map();
    (Array.isArray(source.records) ? source.records : []).forEach((item) => {
      if (!item?.id) return;
      const current = records.get(String(item.id));
      if (!current || stamp(item) >= stamp(current)) records.set(String(item.id), { ...item, id: String(item.id) });
    });
    const deleted = new Map();
    (Array.isArray(source.deleted) ? source.deleted : []).forEach((item) => {
      if (!item?.id) return;
      const current = deleted.get(String(item.id));
      if (!current || stamp(item) >= stamp(current))
        deleted.set(String(item.id), { id: String(item.id), deletedAt: String(item.deletedAt || "") });
    });
    return {
      schema: SCHEMA,
      version: VERSION,
      updatedAt: String(source.updatedAt || new Date().toISOString()),
      records: [...records.values()].filter((item) => !deleted.get(item.id) || stamp(item) > deleted.get(item.id).deletedAt)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
      deleted: [...deleted.values()].sort((a, b) => a.id.localeCompare(b.id)),
    };
  }

  function merge(leftRaw, rightRaw) {
    const left = normalize(leftRaw), right = normalize(rightRaw);
    return normalize({
      updatedAt: [left.updatedAt, right.updatedAt].sort().pop(),
      records: [...left.records, ...right.records],
      deleted: [...left.deleted, ...right.deleted],
    });
  }

  function load(storage = localStorage) {
    try { return normalize(JSON.parse(storage.getItem(STORAGE_KEY) || "{}")); }
    catch { return normalize({}); }
  }
  function save(data, storage = localStorage) {
    const normalized = normalize({ ...data, updatedAt: new Date().toISOString() });
    storage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    return normalized;
  }
  function clear(storage = localStorage) { storage.removeItem(STORAGE_KEY); }

  return { FILE, SCHEMA, STORAGE_KEY, VERSION, clear, load, merge, normalize, save };
});
