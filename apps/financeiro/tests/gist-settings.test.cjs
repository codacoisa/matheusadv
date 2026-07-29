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

test('migra a configuração antiga para a chave global', () => {
  const storage = memoryStorage({
    legacy: JSON.stringify({ gistId: ' antigo ', token: ' segredo ', autoSync: true })
  });

  const loaded = gistSettings.load({ storage, legacyKey: 'legacy' });

  assert.deepEqual(loaded, { gistId: 'antigo', token: 'segredo' });
  assert.deepEqual(
    JSON.parse(storage.getItem(gistSettings.STORAGE_KEY)),
    loaded
  );
});

test('a configuração global prevalece sobre configurações antigas de módulos', () => {
  const storage = memoryStorage({
    [gistSettings.STORAGE_KEY]: JSON.stringify({ gistId: 'global', token: 'token-global' }),
    legacy: JSON.stringify({ gistId: 'local', token: 'token-local' })
  });

  assert.deepEqual(gistSettings.load({ storage, legacyKey: 'legacy' }), {
    gistId: 'global',
    token: 'token-global'
  });
});

test('a migração padrão prioriza o Financeiro independentemente do módulo aberto', () => {
  const storage = memoryStorage({
    'gm-financeiro-gist-v2': JSON.stringify({
      gistId: 'financeiro',
      token: 'token-financeiro'
    }),
    'gm-payments-gist-settings-v1': JSON.stringify({
      gistId: 'pagamentos',
      token: 'token-pagamentos'
    })
  });

  assert.deepEqual(gistSettings.load({ storage }), {
    gistId: 'financeiro',
    token: 'token-financeiro'
  });
});

test('salva e limpa apenas Gist ID e token globais', () => {
  const storage = memoryStorage();

  assert.deepEqual(
    gistSettings.save(
      { gistId: ' abc ', token: ' xyz ', fileName: 'nao-global.json' },
      { storage }
    ),
    { gistId: 'abc', token: 'xyz' }
  );
  assert.deepEqual(gistSettings.clear({ storage }), { gistId: '', token: '' });
  assert.deepEqual(JSON.parse(storage.getItem(gistSettings.STORAGE_KEY)), {
    gistId: '',
    token: ''
  });
});

test('aceita o endereço completo de um Gist na configuração central', () => {
  assert.deepEqual(
    gistSettings.normalize({
      gistId: 'https://gist.github.com/usuario/abcdef123456',
      token: 'token'
    }),
    { gistId: 'abcdef123456', token: 'token' }
  );
});

test('não restaura uma configuração antiga depois de limpar a global', () => {
  const storage = memoryStorage({
    legacy: JSON.stringify({ gistId: 'antigo', token: 'segredo' })
  });
  gistSettings.load({ storage, legacyKey: 'legacy' });
  gistSettings.clear({ storage });

  assert.deepEqual(gistSettings.load({ storage, legacyKey: 'legacy' }), {
    gistId: '',
    token: ''
  });
});
