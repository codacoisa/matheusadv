((root, factory) => {
  const api = factory();
  root.OfficeJurGistClient = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window, () => {
  "use strict";

  const API_URL = "https://api.github.com";
  const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;
  const DEFAULT_TIMEOUT = 15_000;
  const MUTATION_INTERVAL = 1_000;
  const ALLOWED_RAW_HOSTS = new Set(["gist.githubusercontent.com"]);
  let mutationQueue = Promise.resolve();
  let lastMutationAt = 0;

  function normalizeId(value) {
    const raw = String(value || "").trim();
    const match = raw.match(/(?:gist\.github\.com\/(?:[^/]+\/)?|api\.github\.com\/gists\/)([a-f0-9]+)/i);
    return match ? match[1] : raw;
  }

  async function request(path, token, options = {}) {
    const { timeout: requestedTimeout, headers: requestedHeaders, ...fetchOptions } = options;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), requestedTimeout || DEFAULT_TIMEOUT);
    const authorization = String(token || "").trim();
    try {
      const response = await fetch(API_URL + path, {
        ...fetchOptions,
        headers: {
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
          "X-GitHub-Api-Version": "2022-11-28",
          ...(authorization ? { Authorization: `Bearer ${authorization}` } : {}),
          ...requestedHeaders,
        },
        signal: controller.signal, cache: "no-store",
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        if (response.status === 412)
          throw Object.assign(new Error(
            "O Gist foi alterado em outro navegador. Sincronize novamente para mesclar as versões.",
          ), { status: 412, category: "conflict" });
        const rateLimited = response.status === 429 || response.headers.get("x-ratelimit-remaining") === "0";
        const category = rateLimited ? "rate_limit" : response.status === 401 ? "auth" : [403, 404].includes(response.status) ? "access" : response.status >= 500 ? "server" : "http";
        throw Object.assign(new Error(body.message || `GitHub respondeu com status ${response.status}.`), { status: response.status, category });
      }
      return response;
    } catch (error) {
      if (error?.name === "AbortError")
        throw Object.assign(new Error("A conexão com o GitHub excedeu o tempo limite."), { category: "timeout" });
      if (!error?.category && error instanceof TypeError) error.category = "network";
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  async function json(path, token, options) {
    return (await request(path, token, options)).json();
  }

  async function gist(id, token) {
    return json("/gists/" + encodeURIComponent(normalizeId(id)), token);
  }

  async function gistSnapshot(id, token) {
    const response = await request(
      "/gists/" + encodeURIComponent(normalizeId(id)),
      token,
    );
    return {
      gist: await response.json(),
      etag: response.headers.get("ETag") || "",
    };
  }

  function revisionConflict() {
    return new Error(
      "O Gist foi alterado em outro navegador. Sincronize novamente para mesclar as versões.",
    );
  }

  async function confirmRevision(id, token, expectedEtag) {
    if (!expectedEtag) return;
    const current = await gistSnapshot(id, token);
    if (current.etag && current.etag !== expectedEtag) throw revisionConflict();
  }

  function wait(milliseconds) {
    return milliseconds > 0
      ? new Promise((resolve) => setTimeout(resolve, milliseconds))
      : Promise.resolve();
  }

  function withBrowserWriteLock(operation) {
    if (
      typeof navigator !== "undefined" &&
      navigator.locks &&
      typeof navigator.locks.request === "function"
    ) {
      return navigator.locks.request("officejur-gist-write", operation);
    }
    return operation();
  }

  function enqueueMutation(operation) {
    const queued = mutationQueue
      .catch(() => undefined)
      .then(() => withBrowserWriteLock(operation));
    mutationQueue = queued;
    return queued;
  }

  async function text(file, options = {}) {
    if (!file) throw new Error("Arquivo não encontrado no Gist.");
    const maxBytes = Number(options.maxBytes || DEFAULT_MAX_BYTES);
    if (Number(file.size || 0) > maxBytes)
      throw new Error("O arquivo do Gist excede o limite permitido.");
    if (!file.truncated && typeof file.content === "string") return file.content;
    if (!file.raw_url) throw new Error("O GitHub não retornou o conteúdo completo do arquivo.");
    let rawUrl;
    try {
      rawUrl = new URL(file.raw_url);
    } catch {
      throw new Error("O GitHub retornou um endereço inválido para o arquivo.");
    }
    if (rawUrl.protocol !== "https:" || !ALLOWED_RAW_HOSTS.has(rawUrl.hostname)) {
      throw new Error("O GitHub retornou uma origem não autorizada para o arquivo.");
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeout || DEFAULT_TIMEOUT);
    try {
      const response = await fetch(rawUrl.href, {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("Não foi possível baixar o conteúdo completo do Gist.");
      const content = await response.text();
      if (new TextEncoder().encode(content).byteLength > maxBytes)
        throw new Error("O arquivo do Gist excede o limite permitido.");
      return content;
    } catch (error) {
      if (error?.name === "AbortError")
        throw new Error("O download do Gist excedeu o tempo limite.");
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  function patch(id, token, files, options = {}) {
    return enqueueMutation(async () => {
      await wait(MUTATION_INTERVAL - (Date.now() - lastMutationAt));
      await confirmRevision(id, token, options.etag);
      const response = await request(
        "/gists/" + encodeURIComponent(normalizeId(id)),
        token,
        {
          method: "PATCH",
          body: JSON.stringify({ files }),
        },
      );
      lastMutationAt = Date.now();
      const gist = await response.json();
      let etag = response.headers.get("ETag") || "";
      if (!etag && options.etag) {
        etag = (await gistSnapshot(id, token)).etag;
      }
      return {
        gist,
        etag,
      };
    });
  }

  return {
    DEFAULT_MAX_BYTES,
    gist,
    gistSnapshot,
    json,
    normalizeId,
    patch,
    request,
    text,
  };
});
