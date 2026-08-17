const test = require("node:test");
const assert = require("node:assert/strict");
const agendaStorage = require("../assets/storage.js");
const financeStorage = require("../../financeiro/assets/storage.js");
const agendaSync = require("../assets/sync.js");

function localStorageStub() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

test("sincroniza a agenda sem apagar outros domínios financeiros locais", async () => {
  const previousLocalStorage = globalThis.localStorage;
  globalThis.localStorage = localStorageStub();
  try {
    const now = "2026-08-17T12:00:00.000Z";
    let agendaData = agendaStorage.normalize({
      records: [{
        id: "atendimento-1",
        date: "2026-08-18",
        startTime: "09:00",
        clientId: "cliente-1",
        teamIds: ["equipe-1"],
        updatedAt: now,
      }],
    });
    let financeData = financeStorage.assemble(financeStorage.split({
      updatedAt: now,
      people: [{ id: "pessoa-1", name: "Cliente", updatedAt: now }],
      clients: [{ id: "cliente-1", type: "pf", personId: "pessoa-1", updatedAt: now }],
      cases: [{ id: "caso-1", clientId: "cliente-1", updatedAt: now }],
      packages: [],
      team: [{ id: "equipe-1", name: "Equipe", status: "active", updatedAt: now }],
      entries: [],
      charges: [],
      accounts: [],
      deletedPeople: [], deletedClients: [], deletedCases: [], deletedPackages: [],
      deletedTeam: [], deletedEntries: [], deletedCharges: [], deletedAccounts: [],
    }));
    let savedDomains;
    const patched = [];
    const gistFiles = {};
    ["people", "clients", "team"].forEach((name) => {
      gistFiles[financeStorage.DOMAINS[name].file] = {
        value: financeStorage.split(financeData)[name],
      };
    });
    const gistClient = {
      gistSnapshot: async () => ({ gist: { files: gistFiles }, etag: "etag-1" }),
      text: async (file) => JSON.stringify(file.value),
      patch: async (_gistId, _token, files) => { patched.push(files); return { etag: "etag-2" }; },
    };
    const api = agendaSync.create({
      storage: agendaStorage,
      financeStorage,
      financeDataStore: {
        save: async (domains) => { savedDomains = domains; return domains; },
      },
      gistSettings: { load: () => ({ gistId: "gist-1", token: "token-1", autoSync: true }) },
      gistClient,
      getData: () => agendaData,
      setData: (value) => { agendaData = value; },
      getFinanceData: () => financeData,
      setFinanceData: (value) => { financeData = value; },
    });

    await api.toGist();
    assert.equal(savedDomains.cases.records[0].id, "caso-1");
    assert.equal(agendaData.records[0].id, "atendimento-1");
    assert.equal(patched.length, 1);
    assert.ok(patched[0][agendaStorage.FILE]);
  } finally {
    if (previousLocalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousLocalStorage;
  }
});
