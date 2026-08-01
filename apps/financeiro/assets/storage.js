((root, factory) => {
  const api = factory();
  root.FinanceStorage = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window, () => {
  "use strict";

  const DOMAINS = Object.freeze({
    clients: {
      file: "financeiro-clientes.json",
      schema: "officejur/financeiro-clientes-data",
      version: 1,
      deletedKey: "deletedClients",
    },
    cases: {
      file: "financeiro-casos.json",
      schema: "officejur/financeiro-casos-data",
      version: 1,
      deletedKey: "deletedCases",
    },
    packages: {
      file: "financeiro-pacotes.json",
      schema: "officejur/financeiro-pacotes-data",
      version: 1,
      deletedKey: "deletedPackages",
    },
    team: {
      file: "financeiro-equipe.json",
      schema: "officejur/financeiro-equipe-data",
      version: 1,
      deletedKey: "deletedTeam",
    },
    entries: {
      file: "financeiro-lancamentos.json",
      schema: "officejur/financeiro-lancamentos-data",
      version: 1,
      deletedKey: "deletedEntries",
    },
    charges: {
      file: "financeiro-cobrancas.json",
      schema: "officejur/financeiro-cobrancas-data",
      version: 1,
      deletedKey: "deletedCharges",
    },
    accounts: {
      file: "financeiro-contas.json",
      schema: "officejur/financeiro-contas-data",
      version: 1,
      deletedKey: "deletedAccounts",
    },
  });

  const domainNames = Object.freeze(Object.keys(DOMAINS));
  const timestamp = (item) =>
    String(item?.updatedAt || item?.createdAt || item?.deletedAt || "");

  function normalizeDeleted(list) {
    const records = new Map();
    (Array.isArray(list) ? list : []).forEach((item) => {
      if (!item?.id) return;
      const normalized = {
        id: String(item.id),
        deletedAt: String(item.deletedAt || ""),
      };
      const current = records.get(normalized.id);
      if (!current || normalized.deletedAt > current.deletedAt)
        records.set(normalized.id, normalized);
    });
    return [...records.values()].sort((left, right) =>
      left.id.localeCompare(right.id),
    );
  }

  function emptyDomain(name, updatedAt = new Date().toISOString()) {
    const definition = DOMAINS[name];
    if (!definition) throw new Error(`Domínio financeiro desconhecido: ${name}.`);
    return {
      schema: definition.schema,
      version: definition.version,
      updatedAt,
      records: [],
      deleted: [],
    };
  }

  function normalizeDomain(name, raw) {
    const definition = DOMAINS[name],
      source = raw && typeof raw === "object" ? raw : {};
    if (!definition) throw new Error(`Domínio financeiro desconhecido: ${name}.`);
    if (source.schema && source.schema !== definition.schema)
      throw new Error(
        `O arquivo ${definition.file} não usa o formato atual do Financeiro.`,
      );
    if (
      source.version !== undefined &&
      Number(source.version) !== definition.version
    )
      throw new Error(
        `O arquivo ${definition.file} não usa a versão atual do Financeiro.`,
      );
    return {
      schema: definition.schema,
      version: definition.version,
      updatedAt: String(source.updatedAt || new Date().toISOString()),
      records: (Array.isArray(source.records) ? source.records : [])
        .filter((item) => item?.id)
        .map((item) => ({ ...item })),
      deleted: normalizeDeleted(source.deleted),
    };
  }

  function split(data, updatedAt = data?.updatedAt || new Date().toISOString()) {
    return Object.fromEntries(
      domainNames.map((name) => {
        const definition = DOMAINS[name];
        return [
          name,
          normalizeDomain(name, {
            schema: definition.schema,
            version: definition.version,
            updatedAt,
            records: data?.[name],
            deleted: data?.[definition.deletedKey],
          }),
        ];
      }),
    );
  }

  function assemble(domains) {
    const result = {
      updatedAt: domainNames
        .map((name) => String(domains?.[name]?.updatedAt || ""))
        .sort()
        .pop(),
    };
    domainNames.forEach((name) => {
      const definition = DOMAINS[name],
        domain = normalizeDomain(name, domains?.[name]);
      result[name] = domain.records;
      result[definition.deletedKey] = domain.deleted;
    });
    return result;
  }

  function mergeDomain(name, leftRaw, rightRaw) {
    const left = normalizeDomain(name, leftRaw),
      right = normalizeDomain(name, rightRaw),
      deleted = normalizeDeleted([...left.deleted, ...right.deleted]),
      deletedAt = new Map(deleted.map((item) => [item.id, item.deletedAt])),
      records = new Map();
    [...left.records, ...right.records].forEach((item) => {
      const current = records.get(item.id);
      if (!current || timestamp(item) >= timestamp(current))
        records.set(item.id, item);
    });
    return normalizeDomain(name, {
      schema: DOMAINS[name].schema,
      version: DOMAINS[name].version,
      updatedAt:
        [left.updatedAt, right.updatedAt].sort().pop() ||
        new Date().toISOString(),
      records: [...records.values()]
        .filter(
          (item) =>
            !deletedAt.get(item.id) ||
            deletedAt.get(item.id) < timestamp(item),
        )
        .sort((a, b) => String(a.id).localeCompare(String(b.id))),
      deleted,
    });
  }

  function canonical(value) {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === "object")
      return Object.keys(value)
        .sort()
        .reduce((result, key) => {
          result[key] = canonical(value[key]);
          return result;
        }, {});
    return value;
  }

  function signature(name, raw) {
    const domain = normalizeDomain(name, raw);
    return JSON.stringify(
      canonical({
        schema: domain.schema,
        version: domain.version,
        records: domain.records
          .slice()
          .sort((a, b) => String(a.id).localeCompare(String(b.id))),
        deleted: domain.deleted,
      }),
    );
  }

  function validateReferences(domains) {
    const data = assemble(domains),
      ids = (name) => new Set(data[name].map((item) => item.id)),
      clients = ids("clients"),
      cases = ids("cases"),
      packages = ids("packages"),
      team = ids("team"),
      entries = ids("entries"),
      issues = [],
      requireId = (condition, message) => {
        if (!condition) issues.push(message);
      };

    data.cases.forEach((item) => {
      requireId(
        clients.has(item.clientId),
        `Caso ${item.id} referencia cliente inexistente ${item.clientId}.`,
      );
      if (item.packageId)
        requireId(
          packages.has(item.packageId),
          `Caso ${item.id} referencia pacote inexistente ${item.packageId}.`,
        );
      (Array.isArray(item.assignments) ? item.assignments : []).forEach(
        (assignment) =>
          requireId(
            team.has(assignment.personId),
            `Caso ${item.id} referencia integrante inexistente ${assignment.personId}.`,
          ),
      );
    });
    data.packages.forEach((item) =>
      requireId(
        clients.has(item.clientId),
        `Pacote ${item.id} referencia cliente inexistente ${item.clientId}.`,
      ),
    );
    data.entries.forEach((item) => {
      if (item.clientId)
        requireId(
          clients.has(item.clientId),
          `Lançamento ${item.id} referencia cliente inexistente ${item.clientId}.`,
        );
      if (item.caseId)
        requireId(
          cases.has(item.caseId),
          `Lançamento ${item.id} referencia caso inexistente ${item.caseId}.`,
        );
      if (item.packageId)
        requireId(
          packages.has(item.packageId),
          `Lançamento ${item.id} referencia pacote inexistente ${item.packageId}.`,
        );
    });
    data.charges.forEach((item) => {
      if (item.clientId)
        requireId(
          clients.has(item.clientId),
          `Cobrança ${item.id} referencia cliente inexistente ${item.clientId}.`,
        );
      if (item.entryId)
        requireId(
          entries.has(item.entryId),
          `Cobrança ${item.id} referencia lançamento inexistente ${item.entryId}.`,
        );
    });
    return issues;
  }

  return {
    DOMAINS,
    domainNames,
    emptyDomain,
    normalizeDomain,
    split,
    assemble,
    mergeDomain,
    signature,
    validateReferences,
  };
});
