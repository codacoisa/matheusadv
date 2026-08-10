(() => {
  'use strict';

  let adapter = null;
  let manifest = null;

  function message(id, payload = {}, transfer = []) {
    self.postMessage({ id, ...payload }, transfer);
  }

  function normalizeBytes(value) {
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    throw new Error('O adaptador do engine não retornou bytes válidos.');
  }

  async function loadManifest(url) {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Manifest do engine indisponível (${response.status}).`);
    const value = await response.json();
    if (value?.schema !== 'officejur/document-engine-manifest' || value?.version !== 1) {
      throw new Error('Manifest do engine incompatível.');
    }
    return value;
  }

  async function loadAdapter(baseUrl, value) {
    if (value.status !== 'ready' || !value.adapter) return null;
    const adapterUrl = new URL(value.adapter, baseUrl).href;
    importScripts(adapterUrl);
    if (typeof self.OfficeJurDocumentEngineAdapter?.create !== 'function') {
      throw new Error('O adaptador WASM não expôs OfficeJurDocumentEngineAdapter.create().');
    }
    return self.OfficeJurDocumentEngineAdapter.create({ manifest: value, baseUrl });
  }

  async function initialize(data) {
    manifest = await loadManifest(data.manifestUrl);
    adapter = await loadAdapter(data.manifestUrl, manifest);
    return {
      available: Boolean(adapter),
      manifest,
      reason: adapter ? '' : 'O engine WASM ainda não foi instalado neste build.',
    };
  }

  async function roundTrip(data) {
    if (!adapter) throw new Error('O engine WASM ainda não foi instalado neste build.');
    if (typeof adapter.roundTrip !== 'function') throw new Error('O adaptador não implementa roundTrip().');
    const output = await adapter.roundTrip({
      bytes: new Uint8Array(data.bytes),
      extension: data.extension,
      mimeType: data.mimeType,
    });
    const bytes = normalizeBytes(output);
    return { bytes: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
  }

  self.onmessage = (event) => {
    const { id, type, data = {} } = event.data || {};
    if (!id) return;
    Promise.resolve()
      .then(() => {
        if (type === 'initialize') return initialize(data);
        if (type === 'round-trip') return roundTrip(data);
        throw new Error(`Operação do engine desconhecida: ${type}.`);
      })
      .then((result) => {
        const transfer = result?.bytes instanceof ArrayBuffer ? [result.bytes] : [];
        message(id, { ok: true, result }, transfer);
      })
      .catch((error) => message(id, { ok: false, error: error.message || String(error) }));
  };
})();
