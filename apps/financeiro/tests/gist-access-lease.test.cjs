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

test("expiração vira stale sem apagar configuração ou dados", async () => {
  let time = 0;
  const storage = memoryStorage();
  storage.setItem("officejur-gist-settings", JSON.stringify({ gistId: "gist-a", token: "token" }));
  storage.setItem("officejur::calculos-juridicos::data", "segredo");
  const lease = leaseApi.create({ storage, clock: { now: () => time }, policy: { leaseHours: 3 } });
  lease.renew("gist-a");
  assert.equal(lease.state().phase, "active");
  time = 3 * 60 * 60 * 1000 + 1;
  assert.equal(lease.state().phase, "stale");
  assert.equal(await lease.guard("calculos", () => {}), false);
  assert.equal(storage.getItem("officejur-gist-settings") !== null, true);
  assert.equal(storage.getItem("officejur::calculos-juridicos::data"), "segredo");
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

test("revalidação autenticada após expiração libera dados sem expô-los antes", async () => {
  let time = 0;
  const storage = memoryStorage();
  storage.setItem("officejur-gist-settings", JSON.stringify({ gistId: "gist-a", token: "token" }));
  storage.setItem("officejur::calculos-juridicos::data", "calculo");
  let calls = 0;
  const lease = leaseApi.create({ storage, clock: { now: () => time }, policy: { leaseHours: 3 }, client: { gist: async () => { calls += 1; } } });
  lease.renew("gist-a");
  time = 3 * 60 * 60 * 1000 + 1;
  assert.equal(lease.state().phase, "stale");
  assert.equal(await lease.guard("financeiro", () => {}), true);
  assert.equal(calls, 1);
  assert.equal(lease.state().phase, "active");
  assert.equal(storage.getItem("officejur::calculos-juridicos::data"), "calculo");
});

test("instalação vinculada sem lease revalida antes de liberar dados", async () => {
  const storage = memoryStorage();
  storage.setItem("officejur-gist-settings", JSON.stringify({ gistId: "gist-a", token: "token" }));
  storage.setItem("officejur::calculos-juridicos::data", "segredo");
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const lease = leaseApi.create({ storage, client: { gist: () => pending } });
  assert.equal(lease.state().phase, "unverified");
  const guarded = lease.guard("calculos", () => {});
  assert.equal(lease.state().phase, "unverified");
  release({});
  assert.equal(await guarded, true);
  assert.equal(lease.state().phase, "active");
  assert.equal(storage.getItem("officejur::calculos-juridicos::data"), "segredo");
});

test("falhas transitórias mantêm bloqueio e configuração para retry", async () => {
  let time = 0;
  const storage = memoryStorage();
  storage.setItem("officejur-gist-settings", JSON.stringify({ gistId: "gist-a", token: "token" }));
  const errors = ["network", "timeout", "server", "rate_limit"];
  for (const category of errors) {
    const lease = leaseApi.create({ storage, clock: { now: () => time }, client: { gist: async () => { throw { category }; } } });
    lease.renew("gist-a");
    time += 4 * 60 * 60 * 1000;
    assert.equal(await lease.guard("calculos", () => {}), false);
    assert.equal(lease.state().phase, "stale");
    assert.notEqual(storage.getItem("officejur-gist-settings"), null);
  }
});

test("401 após vencimento inicia purga e nunca libera por graça", async () => {
  let time = 0;
  const storage = memoryStorage();
  storage.setItem("officejur-gist-settings", JSON.stringify({ gistId: "gist-a", token: "token" }));
  storage.setItem("officejur::calculos-juridicos::data", "segredo");
  const lease = leaseApi.create({ storage, clock: { now: () => time }, policy: { leaseHours: 3, graceMinutes: 180 }, client: { gist: async () => { throw { category: "auth", status: 401 }; } } });
  lease.renew("gist-a");
  time = 4 * 60 * 60 * 1000;
  assert.equal(await lease.guard("calculos", () => {}), false);
  assert.equal(lease.state().phase, "purged");
  assert.equal(storage.getItem("officejur::calculos-juridicos::data"), null);
});

test("instalação sem Gist continua local durante heartbeat", async () => {
  const lease = leaseApi.create({ storage: memoryStorage(), client: { gist: async () => { throw new Error("não deve consultar Gist"); } } });
  assert.equal(lease.state().phase, "active");
  await lease.heartbeat();
  assert.equal(lease.state().phase, "active");
  assert.equal(await lease.guard("financeiro", () => {}), true);
});

test("heartbeat antecipado mantém o lease utilizável até a resposta", async () => {
  const storage = memoryStorage();
  storage.setItem("officejur-gist-settings", JSON.stringify({ gistId: "gist-a", token: "token" }));
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const lease = leaseApi.create({ storage, client: { gist: () => pending } });
  lease.renew("gist-a");
  const heartbeat = lease.heartbeat();
  assert.equal(lease.state().phase, "active");
  assert.equal(await lease.guard("financeiro", () => {}), true);
  release({});
  await heartbeat;
  assert.equal(lease.state().phase, "active");
});

test("resposta tardia não ressuscita lease revogado", async () => {
  let time = 0;
  const storage = memoryStorage();
  storage.setItem("officejur-gist-settings", JSON.stringify({ gistId: "gist-a", token: "token" }));
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const lease = leaseApi.create({ storage, clock: { now: () => time }, client: { gist: () => pending } });
  lease.renew("gist-a");
  time = 4 * 60 * 60 * 1000;
  const revalidation = lease.revalidate();
  await lease.revoke();
  release({});
  await revalidation;
  assert.equal(lease.state().phase, "purged");
});

test("heartbeat e duas abas compartilham uma única revalidação", async () => {
  const storage = memoryStorage();
  storage.setItem("officejur-gist-settings", JSON.stringify({ gistId: "gist-a", token: "token" }));
  let calls = 0;
  const client = { gist: async () => { calls += 1; } };
  const first = leaseApi.create({ storage, client });
  const second = leaseApi.create({ storage, client });
  first.renew("gist-a");
  await Promise.all([first.heartbeat(), second.heartbeat(), first.heartbeat()]);
  assert.equal(calls, 1);
  assert.equal(first.state().phase, "active");
  assert.equal(second.state().phase, "active");
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
