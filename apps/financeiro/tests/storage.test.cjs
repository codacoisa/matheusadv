const test = require("node:test");
const assert = require("node:assert/strict");

const storage = require("../assets/storage.js");

function sampleData() {
  return {
    updatedAt: "2026-07-29T12:00:00.000Z",
    people: [
      {
        id: "pessoa-cliente-1",
        name: "Cliente",
        cpf: "529.982.247-25",
        updatedAt: "2026-07-29T12:00:00.000Z",
      },
    ],
    clients: [
      {
        id: "cliente-1",
        type: "pf",
        personId: "pessoa-cliente-1",
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
    deletedPeople: [],
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
  });
  assert.equal(domains.clients.records[0].id, "cliente-1");
  assert.equal(domains.people.records[0].id, "pessoa-cliente-1");
  assert.equal(domains.cases.records[0].clientId, "cliente-1");
});

test("remonta os domínios sem perder relacionamentos", () => {
  const domains = storage.split(sampleData()),
    assembled = storage.assemble(domains);

  assert.equal(assembled.cases[0].clientId, assembled.clients[0].id);
  assert.equal(assembled.entries[0].caseId, assembled.cases[0].id);
  assert.deepEqual(storage.validateReferences(domains), []);
});

test("resolve clientes PF e PJ para os módulos consumidores", () => {
  const data = sampleData();
  data.clients.push({
    id: "empresa-1",
    type: "pj",
    legalName: "Empresa Exemplo Ltda.",
    cnpj: "04.252.011/0001-10",
  });
  const domains = storage.split(data), resolved = storage.resolvedClients(domains);

  assert.deepEqual(
    resolved.map((client) => ({ id: client.id, name: client.name, document: client.document })),
    [
      { id: "cliente-1", name: "Cliente", document: "529.982.247-25" },
      { id: "empresa-1", name: "Empresa Exemplo Ltda.", document: "04.252.011/0001-10" },
    ],
  );
});

test("detecta referências quebradas entre bancos", () => {
  const domains = storage.split(sampleData());
  domains.clients.records = [];

  assert.deepEqual(storage.validateReferences(domains), [
    "Caso caso-1 referencia cliente inexistente cliente-1.",
    "Lançamento lancamento-1 referencia cliente inexistente cliente-1.",
  ]);
});

test("valida representantes reutilizáveis de cliente pessoa jurídica", () => {
  const data = sampleData();
  data.clients.push({
    id: "empresa-1",
    type: "pj",
    legalName: "Empresa Exemplo Ltda.",
    cnpj: "04.252.011/0001-10",
    representatives: [
      {
        id: "representacao-1",
        personId: "pessoa-cliente-1",
        role: "Administradora",
        isPrimary: true,
        isSigner: true,
      },
    ],
    updatedAt: "2026-07-29T12:00:00.000Z",
  });
  const domains = storage.split(data);

  assert.deepEqual(storage.validateReferences(domains), []);
  domains.people.records = [];
  assert.deepEqual(storage.validateReferences(domains), [
    "Cliente cliente-1 referencia pessoa inexistente pessoa-cliente-1.",
    "Cliente empresa-1 referencia representante inexistente pessoa-cliente-1.",
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
          personId: "pessoa-cliente-1",
          notes: "Cadastro atualizado",
          updatedAt: "2026-07-30T10:00:00.000Z",
        },
        {
          id: "cliente-2",
          type: "pf",
          personId: "pessoa-cliente-1",
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
  assert.equal(merged.records[0].notes, "Cadastro atualizado");
  assert.equal(
    storage.signature("clients", merged),
    storage.signature("clients", storage.mergeDomain("clients", changed, base)),
  );
});
