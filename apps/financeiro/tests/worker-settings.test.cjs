const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const workerSettings = require(path.resolve(
  __dirname,
  "../../../packages/ui/worker-settings.js",
));

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

test("salva a URL e a chave global no armazenamento persistente", () => {
  const storage = memoryStorage();

  assert.deepEqual(
    workerSettings.save(
      { apiUrl: " https://worker.example/ ", apiKey: " chave " },
      { storage },
    ),
    { version: 1, apiUrl: "https://worker.example", apiKey: "chave" },
  );
  assert.deepEqual(workerSettings.load({ storage }), {
    version: 1,
    apiUrl: "https://worker.example",
    apiKey: "chave",
  });
  assert.deepEqual(JSON.parse(storage.getItem(workerSettings.STORAGE_KEY)), {
    version: 1,
    apiUrl: "https://worker.example",
    apiKey: "chave",
  });
});

test("limpa a configuração global do Worker", () => {
  const storage = memoryStorage();
  workerSettings.save({ apiUrl: "https://worker.example", apiKey: "chave" }, { storage });

  assert.deepEqual(workerSettings.clear({ storage }), {
    version: 1,
    apiUrl: "",
    apiKey: "",
  });
  assert.deepEqual(workerSettings.load({ storage }), {
    version: 1,
    apiUrl: "",
    apiKey: "",
  });
  assert.deepEqual(JSON.parse(storage.getItem(workerSettings.STORAGE_KEY)), {
    version: 1,
    apiUrl: "",
    apiKey: "",
  });
});
