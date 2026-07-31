const test = require("node:test");
const assert = require("node:assert/strict");
const calculationSync = require("../assets/sync.js");

function fixture(overrides = {}) {
  let data = { records: [{ id: "local" }] };
  const statuses = [];
  const patches = [];
  const storage = {
    FILE: "officejur-calculos-juridicos.json",
    merge: (local, remote) => ({ records: [...local.records, ...remote.records] }),
    save: value => value,
  };
  const gistSettings = {
    load: () => ({ gistId: "gist-1", token: "token", autoSync: true }),
  };
  const gistClient = {
    gistSnapshot: async () => ({
      etag: '"v1"',
      gist: {
        files: {
          [storage.FILE]: { content: JSON.stringify({ records: [{ id: "remote" }] }) },
        },
      },
    }),
    text: async file => file.content,
    patch: async (...args) => { patches.push(args); },
  };
  const sync = calculationSync.create({
    storage,
    gistSettings,
    gistClient,
    getData: () => data,
    setData: value => { data = value; },
    setStatus: value => statuses.push(value),
    ...overrides,
  });
  return { sync, getData: () => data, statuses, patches };
}

test("carrega e mescla o mesmo arquivo compartilhado de cálculos", async () => {
  const { sync, getData, statuses } = fixture();
  await sync.fromGist();
  assert.deepEqual(getData().records.map(item => item.id), ["local", "remote"]);
  assert.deepEqual(statuses, ["Sincronizando…", "Gist sincronizado"]);
});

test("salva no Gist somente quando a sincronização automática está ativa", async () => {
  const active = fixture();
  await active.sync.toGist();
  assert.equal(active.patches.length, 1);
  assert.equal(active.statuses.at(-1), "Gist sincronizado");

  const inactive = fixture({
    gistSettings: { load: () => ({ gistId: "gist-1", token: "token", autoSync: false }) },
  });
  await inactive.sync.toGist();
  assert.equal(inactive.patches.length, 0);
});
