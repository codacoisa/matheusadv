const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const leaseApi = require(path.resolve(__dirname, "../../../packages/ui/gist-access-lease.js"));

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
    key: (index) => [...values.keys()][index] || null,
    get length() { return values.size; },
  };
}

test("renova somente após sucesso e expira mesmo sem rede", async () => {
  let time = 0;
  const lease = leaseApi.create({ storage: memoryStorage(), clock: { now: () => time }, policy: { leaseHours: 3 } });
  lease.renew("gist-a");
  assert.equal(lease.state().phase, "active");
  time = 3 * 60 * 60 * 1000 + 1;
  let cleared = 0;
  assert.equal(await lease.guard("calculos", () => { cleared += 1; }), false);
  assert.equal(cleared, 1);
  assert.equal(lease.state().phase, "purged");
});

test("401 inicia graça, rate limit e rede não", () => {
  let time = 0;
  const lease = leaseApi.create({ storage: memoryStorage(), clock: { now: () => time } });
  lease.renew("gist-a");
  lease.fail({ category: "rate_limit", status: 429 });
  assert.equal(lease.state().phase, "active");
  lease.fail({ category: "network" });
  assert.equal(lease.state().phase, "active");
  lease.fail({ category: "auth", status: 401 });
  assert.equal(lease.state().phase, "grace");
  const firstGraceDeadline = lease.state().graceExpiresAt;
  lease.fail({ category: "auth", status: 401 });
  assert.equal(lease.state().graceExpiresAt, firstGraceDeadline);
  assert.doesNotThrow(() => lease.canSync("gist-a"));
});

test("novo Gist exige limpeza local e token do mesmo Gist recupera durante a graça", async () => {
  const lease = leaseApi.create({ storage: memoryStorage(), policy: { leaseHours: 3 } });
  lease.renew("gist-a");
  lease.fail({ category: "auth", status: 401 });
  lease.renew("gist-a");
  assert.equal(lease.state().phase, "active");
  lease.renew("gist-b");
  let cleared = 0;
  assert.equal(await lease.guard("controle-pagamentos", () => { cleared += 1; }), true);
  assert.equal(cleared, 1);
});

test("purge iniciado por qualquer módulo remove todas as cópias protegidas", async () => {
  let time = 0;
  const storage = memoryStorage();
  storage.setItem("officejur::calculos-juridicos::data", "calculo");
  storage.setItem("officejur::financeiro::sync-state", "financeiro");
  storage.setItem("officejur::controle-pagamentos::data", "pagamentos");
  storage.setItem("officejur::documentos::handoff:abc", "handoff");
  const lease = leaseApi.create({ storage, clock: { now: () => time }, policy: { leaseHours: 3 } });
  lease.renew("gist-a");
  time = 3 * 60 * 60 * 1000 + 1;
  let cleared = 0;
  assert.equal(await lease.guard("financeiro", () => { cleared += 1; }), false);
  assert.equal(cleared, 1);
  assert.equal(lease.state().phase, "purged");
  assert.equal(storage.getItem("officejur::calculos-juridicos::data"), null);
  assert.equal(storage.getItem("officejur::financeiro::sync-state"), null);
  assert.equal(storage.getItem("officejur::controle-pagamentos::data"), null);
  assert.equal(storage.getItem("officejur::documentos::handoff:abc"), null);
});

test("instalação já vinculada sem lease falha fechada antes de liberar dados", async () => {
  const storage = memoryStorage();
  storage.setItem("officejur-gist-settings", JSON.stringify({ gistId: "gist-a", token: "token" }));
  storage.setItem("officejur::calculos-juridicos::data", "segredo");
  const lease = leaseApi.create({ storage });
  assert.equal(lease.state().phase, "purging");
  assert.equal(await lease.guard("calculos", () => {}), false);
  assert.equal(storage.getItem("officejur::calculos-juridicos::data"), null);
  assert.equal(storage.getItem("officejur-gist-settings"), null);
});

test("resposta iniciada antes da expiração não ressuscita dados após a purga", async () => {
  let time = 0;
  let finish;
  const pending = new Promise((resolve) => { finish = resolve; });
  const storage = memoryStorage();
  const lease = leaseApi.create({ storage, clock: { now: () => time }, policy: { leaseHours: 3 } });
  lease.renew("gist-a");
  const client = lease.gatedClient({ gist: async () => pending });
  const request = client.gist("gist-a", "token");
  time = 3 * 60 * 60 * 1000 + 1;
  await lease.guard("calculos", () => {});
  finish({ files: {} });
  await assert.rejects(request, (error) => error.code === "lease-changed" && error.category === "access");
  assert.equal(lease.state().phase, "purged");
});

test("troca concorrente de Gist preserva o novo vínculo e limpa rascunhos derivados", async () => {
  const storage = memoryStorage();
  storage.setItem("officejur::documentos::procuracao::draft", JSON.stringify({ __officejurGistProtected: true, person: "cliente" }));
  storage.setItem("officejur::documentos::honorarios::draft", JSON.stringify({ people: [{ name: "Rascunho local" }] }));
  const first = leaseApi.create({ storage });
  const second = leaseApi.create({ storage });
  first.renew("gist-a");
  first.renew("gist-b");
  await Promise.all([
    first.guard("financeiro", () => {}),
    second.guard("calculos", () => {}),
  ]);
  assert.equal(first.state().phase, "active");
  assert.equal(first.state().gistId, "gist-b");
  assert.equal(storage.getItem("officejur::documentos::procuracao::draft"), null);
  assert.notEqual(storage.getItem("officejur::documentos::honorarios::draft"), null);
});

test("revogação explícita remove configurações e dados protegidos", async () => {
  const storage = memoryStorage();
  storage.setItem("officejur-gist-settings", JSON.stringify({ gistId: "gist-a", token: "token" }));
  storage.setItem("officejur::controle-pagamentos::data", "segredo");
  const lease = leaseApi.create({ storage });
  lease.renew("gist-a");
  await lease.revoke();
  assert.equal(lease.state().phase, "purged");
  assert.equal(storage.getItem("officejur-gist-settings"), null);
  assert.equal(storage.getItem("officejur::controle-pagamentos::data"), null);
});
