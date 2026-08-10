((root) => {
  'use strict';

  const DEFAULT_MANIFEST_URL = './assets/engine/manifest.json';
  let sequence = 0;

  class DocumentEngineError extends Error {
    constructor(message, code = 'ENGINE_ERROR') {
      super(message);
      this.name = 'DocumentEngineError';
      this.code = code;
    }
  }

  function resolveUrl(value) {
    const base = root.document?.baseURI || root.location?.href;
    return base ? new URL(value, base).href : value;
  }

  function create({ WorkerClass = root.Worker, workerUrl = './assets/office-engine.worker.js', manifestUrl = DEFAULT_MANIFEST_URL } = {}) {
    if (typeof WorkerClass !== 'function') {
      return { probe: async () => ({ available: false, reason: 'Web Worker não está disponível neste navegador.' }) };
    }
    const worker = new WorkerClass(resolveUrl(workerUrl));
    const pending = new Map();
    let closed = false;

    function close() {
      if (closed) return;
      closed = true;
      pending.forEach(({ reject }) => reject(new DocumentEngineError('O worker do engine foi encerrado.', 'WORKER_CLOSED')));
      pending.clear();
      worker.terminate();
    }

    function request(type, data = {}, transfer = []) {
      if (closed) return Promise.reject(new DocumentEngineError('O worker do engine foi encerrado.', 'WORKER_CLOSED'));
      const id = `engine-${++sequence}`;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        worker.postMessage({ id, type, data }, transfer);
      });
    }

    worker.addEventListener('message', (event) => {
      const { id, ok, result, error } = event.data || {};
      const task = pending.get(id);
      if (!task) return;
      pending.delete(id);
      if (ok) task.resolve(result);
      else task.reject(new DocumentEngineError(error || 'Falha no engine WASM.'));
    });

    worker.addEventListener('error', (event) => {
      const error = new DocumentEngineError(event.message || 'Não foi possível iniciar o worker do engine.', 'WORKER_ERROR');
      pending.forEach(({ reject }) => reject(error));
      pending.clear();
    });

    let initialization;
    function probe() {
      initialization ||= request('initialize', { manifestUrl: resolveUrl(manifestUrl) });
      return initialization;
    }

    async function roundTrip({ file, extension, mimeType }) {
      if (!(file instanceof Blob)) throw new DocumentEngineError('O round-trip exige um arquivo local.', 'INVALID_FILE');
      const state = await probe();
      if (!state.available) throw new DocumentEngineError(state.reason || 'Engine WASM indisponível.', 'ENGINE_UNAVAILABLE');
      const bytes = await file.arrayBuffer();
      const result = await request('round-trip', { bytes, extension, mimeType }, [bytes]);
      return new Blob([result.bytes], { type: mimeType || file.type || 'application/octet-stream' });
    }

    return { close, probe, roundTrip };
  }

  root.OfficeJurDocumentEngine = { DocumentEngineError, create, DEFAULT_MANIFEST_URL };
  if (typeof module === 'object' && module.exports) module.exports = root.OfficeJurDocumentEngine;
})(typeof globalThis !== 'undefined' ? globalThis : window);
