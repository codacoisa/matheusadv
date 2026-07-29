const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const gistSettings = require(path.resolve(
  __dirname,
  '../../../packages/ui/gist-settings.js'
));

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    }
  };
}

test('lê exclusivamente a configuração global do Gist', () => {
  const storage = memoryStorage({
    [gistSettings.STORAGE_KEY]: JSON.stringify({ gistId: 'global', token: 'token-global' })
  });

  assert.deepEqual(gistSettings.load({ storage }), {
    gistId: 'global',
    token: 'token-global',
    autoSync: false
  });
});

test('salva e limpa somente a configuração global do Gist', () => {
  const storage = memoryStorage();

  assert.deepEqual(
    gistSettings.save(
      {
        gistId: ' abc ',
        token: ' xyz ',
        autoSync: true,
        fileName: 'nao-global.json'
      },
      { storage }
    ),
    { gistId: 'abc', token: 'xyz', autoSync: true }
  );
  assert.deepEqual(gistSettings.clear({ storage }), {
    gistId: '',
    token: '',
    autoSync: false
  });
  assert.deepEqual(JSON.parse(storage.getItem(gistSettings.STORAGE_KEY)), {
    gistId: '',
    token: '',
    autoSync: false
  });
});

test('aceita o endereço completo de um Gist na configuração central', () => {
  assert.deepEqual(
    gistSettings.normalize({
      gistId: 'https://gist.github.com/usuario/abcdef123456',
      token: 'token'
    }),
    { gistId: 'abcdef123456', token: 'token', autoSync: false }
  );
});
