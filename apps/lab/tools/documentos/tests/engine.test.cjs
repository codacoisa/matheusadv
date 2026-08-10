const test = require('node:test');
const assert = require('node:assert/strict');
const engine = require('../assets/engine.js');

class FakeWorker {
  constructor(url) {
    this.url = url;
    this.listeners = { message: [], error: [] };
    this.terminated = false;
  }

  addEventListener(type, listener) {
    this.listeners[type].push(listener);
  }

  postMessage(message) {
    queueMicrotask(() => {
      if (message.type === 'initialize') {
        this.emit('message', {
          data: {
            id: message.id,
            ok: true,
            result: {
              available: false,
              manifest: { status: 'not-installed' },
              reason: 'O engine WASM ainda não foi instalado neste build.',
            },
          },
        });
        return;
      }
      this.emit('message', { data: { id: message.id, ok: false, error: 'engine indisponível' } });
    });
  }

  emit(type, event) {
    this.listeners[type].forEach((listener) => listener(event));
  }

  terminate() {
    this.terminated = true;
  }
}

test('o cliente carrega o manifest uma vez e informa engine ausente', async () => {
  const client = engine.create({ WorkerClass: FakeWorker, manifestUrl: '/lab/documentos/assets/engine/manifest.json' });
  const first = await client.probe();
  const second = await client.probe();

  assert.equal(first.available, false);
  assert.equal(second, first);
  assert.equal(first.manifest.status, 'not-installed');
  client.close();
});

test('o cliente recusa round-trip sem engine instalado', async () => {
  const client = engine.create({ WorkerClass: FakeWorker });
  await assert.rejects(
    client.roundTrip({ file: new Blob(['conteúdo']), extension: 'docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }),
    (error) => error.name === 'DocumentEngineError' && error.code === 'ENGINE_UNAVAILABLE',
  );
  client.close();
});
