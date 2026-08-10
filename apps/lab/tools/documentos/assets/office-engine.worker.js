(() => {
  'use strict';

  let adapter = null;
  let manifest = null;

  function message(id, payload = {}, transfer = []) {
    self.postMessage({ id, ...payload }, transfer);
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
    const adapterModule = await import(adapterUrl);
    if (typeof adapterModule.create !== 'function') throw new Error('O adaptador WASM não expôs create().');
    return adapterModule.create({ manifest: value, baseUrl });
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

  async function inspect(data) {
    if (!adapter) throw new Error('O engine WASM ainda não foi instalado neste build.');
    if (typeof adapter.inspect !== 'function') throw new Error('O adaptador não implementa inspect().');
    return adapter.inspect({
      bytes: new Uint8Array(data.bytes),
      extension: data.extension,
      mimeType: data.mimeType,
    });
  }

  async function replaceText(data) {
    if (!adapter) throw new Error('O engine WASM ainda não foi instalado neste build.');
    if (typeof adapter.replaceText !== 'function') throw new Error('O adaptador não implementa replaceText().');
    return adapter.replaceText({
      bytes: new Uint8Array(data.bytes),
      extension: data.extension,
      search: data.search,
      replacement: data.replacement,
    });
  }

  self.onmessage = (event) => {
    const { id, type, data = {} } = event.data || {};
    if (!id) return;
    Promise.resolve()
      .then(() => {
        if (type === 'initialize') return initialize(data);
        if (type === 'inspect') return inspect(data);
        if (type === 'replace-text') return replaceText(data);
        throw new Error(`Operação do engine desconhecida: ${type}.`);
      })
      .then((result) => {
        const transfer = result?.bytes instanceof ArrayBuffer ? [result.bytes] : [];
        message(id, { ok: true, result }, transfer);
      })
      .catch((error) => message(id, { ok: false, error: error.message || String(error) }));
  };
})();
