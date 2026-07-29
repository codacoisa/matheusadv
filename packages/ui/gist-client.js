((root, factory) => {
  const api = factory();
  root.OfficeJurGistClient = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window, () => {
  "use strict";

  const API_URL = "https://api.github.com";
  const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;
  const DEFAULT_TIMEOUT = 15_000;

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
        signal: controller.signal,
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        if (response.status === 412)
          throw new Error(
            "O Gist foi alterado em outro navegador. Sincronize novamente para mesclar as versões.",
          );
        throw new Error(body.message || `GitHub respondeu com status ${response.status}.`);
      }
      return response;
    } catch (error) {
      if (error?.name === "AbortError")
        throw new Error("A conexão com o GitHub excedeu o tempo limite.");
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

  async function text(file, options = {}) {
    if (!file) throw new Error("Arquivo não encontrado no Gist.");
    const maxBytes = Number(options.maxBytes || DEFAULT_MAX_BYTES);
    if (Number(file.size || 0) > maxBytes)
      throw new Error("O arquivo do Gist excede o limite permitido.");
    if (!file.truncated && typeof file.content === "string") return file.content;
    if (!file.raw_url) throw new Error("O GitHub não retornou o conteúdo completo do arquivo.");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeout || DEFAULT_TIMEOUT);
    try {
      const response = await fetch(file.raw_url, {
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

  async function patch(id, token, files, options = {}) {
    const response = await request(
      "/gists/" + encodeURIComponent(normalizeId(id)),
      token,
      {
      method: "PATCH",
      headers: options.etag ? { "If-Match": options.etag } : undefined,
      body: JSON.stringify({ files }),
      },
    );
    return {
      gist: await response.json(),
      etag: response.headers.get("ETag") || "",
    };
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
