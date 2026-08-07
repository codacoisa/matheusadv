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
