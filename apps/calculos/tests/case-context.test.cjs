const test = require("node:test");
const assert = require("node:assert/strict");
const context = require("../assets/case-context.js");
const finance = require("../assets/finance-link.js");

const data = {
  clients: [{ id: "c1", name: "Cliente" }],
  cases: [{
    id: "case-1",
    clientId: "c1",
    title: "Ação de teste",
    number: "0001",
    parties: [
      { id: "p1", name: "Cliente", role: "Reclamante" },
      { id: "p2", name: "Empresa", role: "Reclamada" },
    ],
  }],
};

test("monta contexto cliente-caso com número e partes do Financeiro", () => {
  assert.deepEqual(context.caseContext(data, { clientId: "c1", caseId: "case-1" }, finance), {
    version: context.VERSION,
    clientId: "c1",
    clientName: "Cliente",
    caseId: "case-1",
    caseName: "Ação de teste — 0001",
    caseNumber: "0001",
    clientParty: null,
    parties: [
      { id: "p1", name: "Cliente", role: "Reclamante", source: "financeiro", sourceId: "p1" },
      { id: "p2", name: "Empresa", role: "Reclamada", source: "financeiro", sourceId: "p2" },
    ],
  });
});

test("rejeita caso de outro cliente e mantém partes manuais", () => {
  const input = {
    clientId: "c1",
    parties: [{ id: "manual", name: "Parte manual", role: "Autor", source: "manual" }],
  };
  const invalid = context.validateCaseContext(data, { clientId: "c1", caseId: "missing" }, finance);
  assert.deepEqual(invalid, { valid: false, reason: "case" });
  context.applyCaseContext(input, context.caseContext(data, { clientId: "c1", caseId: "case-1" }, finance));
  assert.equal(input.caseNumber, "0001");
  assert.deepEqual(input.parties, [{ id: "manual", name: "Parte manual", role: "Autor", source: "manual" }]);
});

test("localiza a parte contrária sem presumir o papel do cliente", () => {
  const current = context.caseContext(data, { clientId: "c1", caseId: "case-1" }, finance);
  assert.equal(context.opposingParty(current, "Reclamante", { Reclamante: "Reclamada" }).name, "Empresa");
  assert.equal(context.partyForRole(current, "Reclamada").name, "Empresa");
});

test("monta o cliente no polo escolhido e preserva a oposição manual", () => {
  const current = context.partyContext(data, { clientId: "c1", caseId: "case-1", clientRole: "Reclamada" }, finance);
  assert.deepEqual(current.clientParty, { id: "c1", name: "Cliente", role: "Reclamada", source: "client", sourceId: "c1" });
  assert.equal(current.opposingRole, "Reclamante");
  const input = { clientId: "", parties: [{ id: "manual", name: "Outra", role: "Reclamante", source: "manual" }] };
  context.applyCaseContext(input, current);
  assert.equal(input.clientId, "c1");
  assert.deepEqual(input.parties, [{ id: "manual", name: "Outra", role: "Reclamante", source: "manual" }]);
});

test("aceita os nomes dos seletores de polo dos módulos e mantém o contrato comum", () => {
  assert.equal(context.partyContext(data, { clientId: "c1", clientPartyRole: "Executado / Devedor" }, finance).clientParty.role, "Executado / Devedor");
  assert.equal(context.partyContext(data, { clientId: "c1", partyType: "Reclamada" }, finance).opposingRole, "Reclamante");
});
