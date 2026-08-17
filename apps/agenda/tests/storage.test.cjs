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

test("cria lembrete persistente no dia seguinte e resolve ao concluir", () => {
  const record = storage.normalizeRecord({
    id: "atendimento-pendente",
    date: "2026-08-16",
    startTime: "09:00",
    endTime: "10:00",
    subjectType: "client",
    clientId: "cliente-1",
    teamIds: ["equipe-1"],
    status: "scheduled",
    updatedAt: "2026-08-16T10:00:00.000Z",
  });
  const pending = storage.ensureReminders(
    { records: [record] },
    new Date("2026-08-17T12:00:00-03:00"),
  );
  assert.equal(pending.reminders.length, 1);
  assert.equal(pending.reminders[0].appointmentId, record.id);
  assert.equal(pending.reminders[0].dueDate, "2026-08-17");
  assert.equal(pending.reminders[0].status, "pending");

  const resolved = storage.ensureReminders({
    ...pending,
    records: [{ ...record, status: "done", updatedAt: "2026-08-17T13:00:00.000Z" }],
  }, new Date("2026-08-17T13:00:00-03:00"));
  assert.equal(resolved.reminders[0].status, "resolved");
});

test("não cria lembrete para evento futuro ou já concluído", () => {
  const base = {
    id: "atendimento-futuro",
    date: "2026-08-18",
    startTime: "09:00",
    endTime: "10:00",
    subjectType: "client",
    clientId: "cliente-1",
    teamIds: ["equipe-1"],
  };
  assert.equal(storage.ensureReminders({ records: [base] }, new Date("2026-08-17T12:00:00-03:00")).reminders.length, 0);
  assert.equal(storage.ensureReminders({ records: [{ ...base, status: "done" }] }, new Date("2026-08-19T12:00:00-03:00")).reminders.length, 0);
});
