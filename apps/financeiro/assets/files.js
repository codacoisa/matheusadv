(() => {
  "use strict";

  const SCHEMA = "gm-financeiro-arquivos-v2";
  const MAX_FILE_SIZE = 3 * 1024 * 1024;
  const MAX_AVERAGE_PAGE_SIZE = 250 * 1024;

  const timestamp = (item) =>
    String(item?.updatedAt || item?.createdAt || item?.deletedAt || "");
  const payloadFileName = (id) => `financeiro-pdf-${String(id)}.b64`;

  function emptyData(updatedAt = new Date().toISOString()) {
    return {
      schema: SCHEMA,
      updatedAt,
      files: [],
      deletedFiles: [],
    };
  }

  function normalizeDeleted(list) {
    const map = new Map();
    (Array.isArray(list) ? list : []).forEach((item) => {
      if (!item?.id) return;
      const value = {
        id: String(item.id),
        deletedAt: String(item.deletedAt || ""),
      };
      const current = map.get(value.id);
      if (!current || value.deletedAt > current.deletedAt)
        map.set(value.id, value);
    });
    return [...map.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  function normalizeFile(item = {}) {
    const id = String(item.id || "");
    return {
      id,
      clientId: String(item.clientId || ""),
      caseIds: [
        ...new Set(
          (Array.isArray(item.caseIds) ? item.caseIds : [item.caseId])
            .filter(Boolean)
            .map(String),
        ),
      ].sort(),
      name: String(item.name || "documento.pdf"),
      mimeType: "application/pdf",
      size: Math.max(0, Number(item.size || 0)),
      pageCount: Math.max(1, Number(item.pageCount || 1)),
      sha256: String(item.sha256 || ""),
      payloadFile: String(item.payloadFile || payloadFileName(id)),
      createdAt: String(item.createdAt || ""),
      updatedAt: String(item.updatedAt || item.createdAt || ""),
    };
  }

  function normalizeData(raw) {
    const source = raw && typeof raw === "object" ? raw : {};
    if (source.schema && source.schema !== SCHEMA)
      throw new Error("Os arquivos não usam o formato atual do Financeiro.");
    return {
      ...emptyData(String(source.updatedAt || new Date().toISOString())),
      files: (Array.isArray(source.files) ? source.files : [])
        .map(normalizeFile)
        .filter((item) => item.id && item.clientId),
      deletedFiles: normalizeDeleted(source.deletedFiles),
    };
  }

  function needsPayloadUpload(local, remote) {
    return (
      !remote ||
      remote.sha256 !== local.sha256 ||
      remote.payloadFile !== local.payloadFile
    );
  }

  function mergeData(leftRaw, rightRaw) {
    const left = normalizeData(leftRaw),
      right = normalizeData(rightRaw),
      deletedFiles = normalizeDeleted([
        ...left.deletedFiles,
        ...right.deletedFiles,
      ]),
      deleted = new Map(
        deletedFiles.map((item) => [item.id, item.deletedAt]),
      ),
      map = new Map();
    [...left.files, ...right.files].forEach((item) => {
      const current = map.get(item.id);
      if (!current || timestamp(item) >= timestamp(current))
        map.set(item.id, item);
    });
    return normalizeData({
      schema: SCHEMA,
      updatedAt:
        [left.updatedAt, right.updatedAt].sort().pop() ||
        new Date().toISOString(),
      files: [...map.values()]
        .filter(
          (item) =>
            !deleted.get(item.id) || deleted.get(item.id) < timestamp(item),
        )
        .sort((a, b) => a.id.localeCompare(b.id)),
      deletedFiles,
    });
  }

  function signature(raw) {
    const normalized = normalizeData(raw);
    return JSON.stringify({
      schema: normalized.schema,
      files: normalized.files
        .slice()
        .sort((a, b) => a.id.localeCompare(b.id)),
      deletedFiles: normalized.deletedFiles,
    });
  }

  function countPdfPages(buffer) {
    const bytes =
        buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer || 0),
      header = new TextDecoder("latin1").decode(bytes.slice(0, 8));
    if (!header.startsWith("%PDF-")) return 0;
    const content = new TextDecoder("latin1").decode(bytes),
      direct = (content.match(/\/Type\s*\/Page(?!s)\b/g) || []).length;
    return (
      direct ||
      Math.max(
        0,
        ...[...content.matchAll(/\/Count\s+(\d+)/g)].map((match) =>
          Number(match[1]),
        ),
      )
    );
  }

  function validatePdf({ name, type, size, pageCount }) {
    if (!String(name || "").toLowerCase().endsWith(".pdf"))
      return "Selecione um arquivo com extensão PDF.";
    if (
      type &&
      ![
        "application/pdf",
        "application/x-pdf",
        "application/octet-stream",
      ].includes(type)
    )
      return "O arquivo selecionado não foi identificado como PDF.";
    if (!Number(size) || Number(size) > MAX_FILE_SIZE)
      return "O PDF deve possuir no máximo 3 MB.";
    if (!Number(pageCount))
      return "Não foi possível identificar as páginas do PDF. Reexporte o documento e tente novamente.";
    if (Number(size) / Number(pageCount) > MAX_AVERAGE_PAGE_SIZE)
      return "O PDF deve possuir, em média, no máximo 250 KB por página.";
    return "";
  }

  function toBase64(buffer) {
    const bytes =
      buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer || 0);
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 0x8000)
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    return btoa(binary);
  }

  function fromBase64(value) {
    const binary = atob(String(value || "")),
      bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++)
      bytes[index] = binary.charCodeAt(index);
    return bytes;
  }

  async function sha256(value) {
    const bytes = value instanceof Blob ? await value.arrayBuffer() : value,
      digest = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)]
      .map((item) => item.toString(16).padStart(2, "0"))
      .join("");
  }

  const api = {
    SCHEMA,
    MAX_FILE_SIZE,
    MAX_AVERAGE_PAGE_SIZE,
    emptyData,
    normalizeData,
    needsPayloadUpload,
    mergeData,
    signature,
    payloadFileName,
    countPdfPages,
    validatePdf,
    toBase64,
    fromBase64,
    sha256,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  globalThis.FinanceFiles = api;
})();
