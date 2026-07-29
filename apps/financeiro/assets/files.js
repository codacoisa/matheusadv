(() => {
  "use strict";

  const SCHEMA = "gm-financeiro-arquivos-v1";
  const MAX_FILE_SIZE = 3 * 1024 * 1024;
  const MAX_AVERAGE_PAGE_SIZE = 250 * 1024;

  const timestamp = (item) =>
    String(item?.updatedAt || item?.createdAt || item?.deletedAt || "");

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
      const normalized = {
        id: String(item.id),
        deletedAt: String(item.deletedAt || ""),
      };
      const current = map.get(normalized.id);
      if (!current || normalized.deletedAt > current.deletedAt)
        map.set(normalized.id, normalized);
    });
    return [...map.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  function normalizeFile(item = {}) {
    return {
      id: String(item.id || ""),
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
      base64: String(item.base64 || ""),
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
        .filter((item) => item.id && item.clientId && item.base64),
      deletedFiles: normalizeDeleted(source.deletedFiles),
    };
  }

  function mergeRecords(left, right, deleted) {
    const deletedMap = new Map(
        deleted.map((item) => [item.id, item.deletedAt]),
      ),
      records = new Map();
    [...left, ...right].forEach((item) => {
      const current = records.get(item.id);
      if (!current || timestamp(item) >= timestamp(current))
        records.set(item.id, item);
    });
    return [...records.values()]
      .filter(
        (item) =>
          !deletedMap.get(item.id) || deletedMap.get(item.id) < timestamp(item),
      )
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  function mergeData(leftRaw, rightRaw) {
    const left = normalizeData(leftRaw),
      right = normalizeData(rightRaw),
      deletedFiles = normalizeDeleted([
        ...left.deletedFiles,
        ...right.deletedFiles,
      ]);
    return normalizeData({
      schema: SCHEMA,
      updatedAt:
        [left.updatedAt, right.updatedAt].sort().pop() ||
        new Date().toISOString(),
      files: mergeRecords(left.files, right.files, deletedFiles),
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
      buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer || 0);
    const header = new TextDecoder("latin1").decode(bytes.slice(0, 8));
    if (!header.startsWith("%PDF-")) return 0;
    const content = new TextDecoder("latin1").decode(bytes);
    const directPages = (content.match(/\/Type\s*\/Page(?!s)\b/g) || [])
      .length;
    if (directPages) return directPages;
    const pageTreeCounts = [...content.matchAll(/\/Count\s+(\d+)/g)].map(
      (match) => Number(match[1]),
    );
    return Math.max(0, ...pageTreeCounts);
  }

  function validatePdf({ name, type, size, pageCount }) {
    if (!String(name || "").toLowerCase().endsWith(".pdf"))
      return "Selecione um arquivo com extensão PDF.";
    if (type && type !== "application/pdf")
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

  const api = {
    MAX_AVERAGE_PAGE_SIZE,
    MAX_FILE_SIZE,
    SCHEMA,
    countPdfPages,
    emptyData,
    fromBase64,
    mergeData,
    normalizeData,
    signature,
    toBase64,
    validatePdf,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  globalThis.FinanceFiles = api;
})();
