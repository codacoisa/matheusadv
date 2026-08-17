const test = require("node:test");
const assert = require("node:assert/strict");
const storage = require("../assets/storage.js");

const financeData = {
  people: [{ id: "pessoa-1", name: "Pessoa sem cliente" }],
  clients: [{ id: "cliente-1", name: "Cliente" }],
  team: [{ id: "equipe-1", name: "Advogada" }],
};

test("aceita cliente ou pessoa sem cliente e uma equipe válida", () => {
  const clientRecord = storage.normalizeRecord({
    id: "atendimento-1",
    date: "2026-08-17",
    startTime: "09:00",
    subjectType: "client",
    clientId: "cliente-1",
    teamIds: ["equipe-1"],
  });
  const personRecord = storage.normalizeRecord({
    id: "atendimento-2",
    date: "2026-08-17",
    startTime: "10:00",
    subjectType: "person",
    personId: "pessoa-1",
    teamIds: ["equipe-1"],
  });
  assert.deepEqual(storage.validateRecord(clientRecord, financeData), []);
  assert.deepEqual(storage.validateRecord(personRecord, financeData), []);
});

test("rejeita vínculos que não existem no Financeiro", () => {
  const record = storage.normalizeRecord({
    id: "atendimento-1",
    date: "2026-08-17",
    startTime: "09:00",
    subjectType: "client",
    clientId: "cliente-inexistente",
    teamIds: ["equipe-inexistente"],
  });
  assert.deepEqual(storage.validateRecord(record, financeData), [
    "Selecione um cliente cadastrado no Financeiro.",
    "O integrante equipe-inexistente não está cadastrado na equipe.",
  ]);
});

test("mescla alterações pelo timestamp e respeita exclusões posteriores", () => {
  const merged = storage.merge(
    {
      records: [{ id: "1", kind: "consulta", updatedAt: "2026-08-17T09:00:00Z" }],
    },
    {
      records: [{ id: "1", kind: "retorno", updatedAt: "2026-08-17T10:00:00Z" }],
      deleted: [{ id: "2", deletedAt: "2026-08-17T11:00:00Z" }],
    },
  );
  assert.equal(merged.records[0].kind, "retorno");
  assert.equal(merged.records.some((item) => item.id === "2"), false);
  assert.equal(merged.deleted[0].id, "2");
});
