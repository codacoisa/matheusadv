((root, factory) => {
  const api = factory();
  root.OfficeJurAgendaStorage = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window, () => {
  "use strict";

  const FILE = "officejur-agendamentos.json";
  const STORAGE_KEY = "officejur-agendamentos-data";
  const SCHEMA = "officejur/agendamentos-data";
  const VERSION = 1;
  const STATUS = new Set(["scheduled", "confirmed", "done", "cancelled"]);
  const stamp = (item) =>
    String(item?.updatedAt || item?.createdAt || item?.deletedAt || "");

  function normalizeRecord(item = {}) {
    const subjectType = item.subjectType === "person" ? "person" : "client";
    const teamIds = [...new Set(
      (Array.isArray(item.teamIds) ? item.teamIds : [])
        .map((id) => String(id || "").trim())
        .filter(Boolean),
    )];
    return {
      id: String(item.id || ""),
      date: String(item.date || ""),
      startTime: String(item.startTime || ""),
      endTime: String(item.endTime || ""),
      kind: String(item.kind || "Atendimento"),
      subjectType,
      clientId: subjectType === "client" ? String(item.clientId || "") : "",
      personId: subjectType === "person" ? String(item.personId || "") : "",
      teamIds,
      channel: String(item.channel || "presencial"),
      status: STATUS.has(item.status) ? item.status : "scheduled",
      notes: String(item.notes || ""),
      createdAt: String(item.createdAt || ""),
      updatedAt: String(item.updatedAt || ""),
    };
  }

  function normalizeDeleted(list) {
    const records = new Map();
    (Array.isArray(list) ? list : []).forEach((item) => {
      if (!item?.id) return;
      const normalized = {
        id: String(item.id),
        deletedAt: String(item.deletedAt || ""),
      };
      const current = records.get(normalized.id);
      if (!current || normalized.deletedAt >= current.deletedAt)
        records.set(normalized.id, normalized);
    });
    return [...records.values()].sort((left, right) =>
      left.id.localeCompare(right.id),
    );
  }

  function normalize(raw) {
    const source = raw && typeof raw === "object" ? raw : {};
    if (source.schema && source.schema !== SCHEMA)
      throw new Error(`${FILE} usa um formato incompatível.`);
    if (source.version !== undefined && Number(source.version) !== VERSION)
      throw new Error(`${FILE} usa uma versão incompatível.`);

    const records = new Map();
    (Array.isArray(source.records) ? source.records : []).forEach((item) => {
      const normalized = normalizeRecord(item);
      if (!normalized.id) return;
      const current = records.get(normalized.id);
      if (!current || stamp(normalized) >= stamp(current))
        records.set(normalized.id, normalized);
    });
    const deleted = normalizeDeleted(source.deleted);
    const deletedAt = new Map(deleted.map((item) => [item.id, item.deletedAt]));
    return {
      schema: SCHEMA,
      version: VERSION,
      updatedAt: String(source.updatedAt || new Date().toISOString()),
      records: [...records.values()]
        .filter((item) => !deletedAt.get(item.id) || stamp(item) > deletedAt.get(item.id))
        .sort((left, right) => left.id.localeCompare(right.id)),
      deleted,
    };
  }

  function merge(leftRaw, rightRaw) {
    const left = normalize(leftRaw);
    const right = normalize(rightRaw);
    return normalize({
      schema: SCHEMA,
      version: VERSION,
      updatedAt: [left.updatedAt, right.updatedAt].sort().pop(),
      records: [...left.records, ...right.records],
      deleted: [...left.deleted, ...right.deleted],
    });
  }

  function canonical(value) {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === "object")
      return Object.keys(value).sort().reduce((result, key) => {
        result[key] = canonical(value[key]);
        return result;
      }, {});
    return value;
  }

  function signature(raw) {
    const data = normalize(raw);
    return JSON.stringify(canonical({
      schema: data.schema,
      version: data.version,
      records: data.records,
      deleted: data.deleted,
    }));
  }

  function load(storage = globalThis.localStorage) {
    return normalize(JSON.parse(storage.getItem(STORAGE_KEY) || "{}"));
  }

  function save(data, storage = globalThis.localStorage, { touch = true } = {}) {
    const normalized = normalize({
      ...data,
      updatedAt: touch ? new Date().toISOString() : data?.updatedAt,
    });
    storage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    return normalized;
  }

  function clear(storage = globalThis.localStorage) {
    storage.removeItem(STORAGE_KEY);
  }

  function validateRecord(record, financeData = {}) {
    const clients = new Set((financeData.clients || []).map((item) => String(item.id)));
    const people = new Set((financeData.people || []).map((item) => String(item.id)));
    const team = new Set((financeData.team || []).map((item) => String(item.id)));
    const issues = [];
    if (!record.date) issues.push("Informe a data do atendimento.");
    if (!record.startTime) issues.push("Informe o horário do atendimento.");
    if (record.endTime && record.endTime <= record.startTime)
      issues.push("O horário final deve ser posterior ao horário inicial.");
    if (record.subjectType === "person") {
      if (!record.personId || !people.has(String(record.personId)))
        issues.push("Selecione uma pessoa cadastrada no Financeiro.");
    } else if (!record.clientId || !clients.has(String(record.clientId))) {
      issues.push("Selecione um cliente cadastrado no Financeiro.");
    }
    if (!record.teamIds?.length) {
      issues.push("Selecione ao menos um integrante da equipe.");
    } else {
      record.teamIds.forEach((id) => {
        if (!team.has(String(id)))
          issues.push(`O integrante ${id} não está cadastrado na equipe.`);
      });
    }
    return issues;
  }

  return {
    FILE,
    SCHEMA,
    STORAGE_KEY,
    VERSION,
    clear,
    load,
    merge,
    normalize,
    normalizeRecord,
    save,
    signature,
    validateRecord,
  };
});
