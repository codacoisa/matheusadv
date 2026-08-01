const test = require("node:test");
const assert = require("node:assert/strict");

const storage = require("../assets/storage.js");
const dataStore = require("../assets/data-store.js");

function sampleData() {
  return {
    updatedAt: "2026-07-29T12:00:00.000Z",
    clients: [
      {
        id: "cliente-1",
        name: "Cliente",
        updatedAt: "2026-07-29T12:00:00.000Z",
      },
    ],
    cases: [
      {
        id: "caso-1",
        clientId: "cliente-1",
        assignments: [{ personId: "pessoa-1" }],
        updatedAt: "2026-07-29T12:00:00.000Z",
      },
    ],
    packages: [],
    team: [
      {
        id: "pessoa-1",
        name: "Responsável",
        updatedAt: "2026-07-29T12:00:00.000Z",
      },
    ],
    entries: [
      {
        id: "lancamento-1",
        clientId: "cliente-1",
        caseId: "caso-1",
        updatedAt: "2026-07-29T12:00:00.000Z",
      },
    ],
    charges: [],
    accounts: [{ id: "pix", name: "PIX" }],
    deletedClients: [],
    deletedCases: [],
    deletedPackages: [],
    deletedTeam: [],
    deletedEntries: [],
    deletedCharges: [],
    deletedAccounts: [],
  };
}

test("separa cada domínio em arquivo e chave local próprios", () => {
  const domains = storage.split(sampleData());

  assert.deepEqual(Object.keys(domains), storage.domainNames);
  storage.domainNames.forEach((name) => {
    assert.equal(domains[name].schema, storage.DOMAINS[name].schema);
    assert.equal(domains[name].version, storage.DOMAINS[name].version);
    assert.ok(storage.DOMAINS[name].file.endsWith(".json"));
    assert.match(
      storage.DOMAINS[name].storageKey,
      new RegExp(`^officejur::financeiro::.+::data$`),
    );
  });
  assert.equal(domains.clients.records[0].id, "cliente-1");
  assert.equal(domains.cases.records[0].clientId, "cliente-1");
});

test("remonta os domínios sem perder relacionamentos", () => {
  const domains = storage.split(sampleData()),
    assembled = storage.assemble(domains);

  assert.equal(assembled.cases[0].clientId, assembled.clients[0].id);
  assert.equal(assembled.entries[0].caseId, assembled.cases[0].id);
  assert.deepEqual(storage.validateReferences(domains), []);
});

test("detecta referências quebradas entre bancos", () => {
  const domains = storage.split(sampleData());
  domains.clients.records = [];

  assert.deepEqual(storage.validateReferences(domains), [
    "Caso caso-1 referencia cliente inexistente cliente-1.",
    "Lançamento lancamento-1 referencia cliente inexistente cliente-1.",
  ]);
});

test("mescla um domínio registro por registro e respeita exclusões", () => {
  const base = storage.split(sampleData()).clients,
    changed = {
      ...base,
      updatedAt: "2026-07-30T12:00:00.000Z",
      records: [
        {
          ...base.records[0],
          name: "Nome atualizado",
          updatedAt: "2026-07-30T10:00:00.000Z",
        },
        {
          id: "cliente-2",
          name: "Excluído",
          updatedAt: "2026-07-29T10:00:00.000Z",
        },
      ],
      deleted: [
        {
          id: "cliente-2",
          deletedAt: "2026-07-30T11:00:00.000Z",
        },
      ],
    },
    merged = storage.mergeDomain("clients", base, changed);

  assert.equal(merged.records.length, 1);
  assert.equal(merged.records[0].name, "Nome atualizado");
  assert.equal(
    storage.signature("clients", merged),
    storage.signature("clients", storage.mergeDomain("clients", changed, base)),
  );
});

test("lê as chaves legadas como ponto de partida da migração", () => {
  const domains = storage.split(sampleData());
  const values = new Map(
    storage.domainNames.map((name) => [
      storage.DOMAINS[name].storageKey,
      JSON.stringify(domains[name]),
    ]),
  );
  const legacyStorage = { getItem: (key) => values.get(key) || null };

  const migrated = dataStore.legacyDomains(legacyStorage, storage);

  assert.deepEqual(migrated, domains);
});
