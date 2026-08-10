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
              available: true,
              manifest: { status: 'ready', engine: 'office-oxide-wasm', packageVersion: '0.1.8' },
            },
          },
        });
        return;
      }
      this.emit('message', { data: { id: message.id, ok: true, result: { format: 'docx', plainText: 'fixture', markdown: 'fixture', html: '<p>fixture</p>' } } });
    });
  }

  emit(type, event) {
    this.listeners[type].forEach((listener) => listener(event));
  }

  terminate() {
    this.terminated = true;
  }
}

test('o cliente carrega o manifest uma vez e expõe o engine disponível', async () => {
  const client = engine.create({ WorkerClass: FakeWorker, manifestUrl: '/lab/documentos/assets/engine/manifest.json' });
  const first = await client.probe();
  const second = await client.probe();

  assert.equal(first.available, true);
  assert.equal(second, first);
  assert.equal(first.manifest.engine, 'office-oxide-wasm');
  const result = await client.inspect({ file: new Blob(['fixture']), extension: 'docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  assert.equal(result.plainText, 'fixture');
  client.close();
});

test('o cliente recusa inspeção sem worker', async () => {
  const client = engine.create({ WorkerClass: FakeWorker });
  assert.equal(typeof client.inspect, 'function');
  client.close();
});
