const test = require("node:test");
const assert = require("node:assert/strict");

const {
  countPdfPages,
  emptyData,
  fromBase64,
  mergeData,
  needsPayloadUpload,
  normalizeData,
  payloadFileName,
  signature,
  toBase64,
  validatePdf,
} = require("../assets/files.js");

test("identificar páginas e converter o PDF entre bytes e Base64", () => {
  const bytes = Buffer.from(
    "%PDF-1.7\n1 0 obj <</Type /Pages /Count 2>>\n2 0 obj <</Type /Page>>\n3 0 obj <</Type /Page>>\n%%EOF",
    "latin1",
  );

  assert.equal(countPdfPages(bytes), 2);
  assert.deepEqual(Buffer.from(fromBase64(toBase64(bytes))), bytes);
});

test("usar a contagem da árvore quando as páginas estiverem comprimidas", () => {
  const bytes = Buffer.from(
    "%PDF-1.7\n1 0 obj <</Type /Pages /Count 12>>\nstream\nconteudo\nendstream\n%%EOF",
    "latin1",
  );

  assert.equal(countPdfPages(bytes), 12);
});

test("recusar arquivo acima de 3 MB ou 250 KB por página", () => {
  assert.match(
    validatePdf({
      name: "grande.pdf",
      type: "application/pdf",
      size: 3 * 1024 * 1024 + 1,
      pageCount: 20,
    }),
    /3 MB/,
  );
  assert.match(
    validatePdf({
      name: "pesado.pdf",
      type: "application/pdf",
      size: 500 * 1024 + 1,
      pageCount: 2,
    }),
    /250 KB/,
  );
  assert.equal(
    validatePdf({
      name: "valido.pdf",
      type: "application/pdf",
      size: 500 * 1024,
      pageCount: 2,
    }),
    "",
  );
});

test("manter no índice apenas metadados e mesclar por atualização", () => {
  const base = {
      ...emptyData("2026-01-01T00:00:00.000Z"),
      files: [
        {
          id: "arquivo-1",
          clientId: "cliente-1",
          caseIds: [],
          name: "antigo.pdf",
          size: 100,
          pageCount: 1,
          sha256: "abc123",
          payloadFile: payloadFileName("arquivo-1"),
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
        {
          id: "arquivo-2",
          clientId: "cliente-1",
          caseIds: [],
          name: "excluir.pdf",
          size: 100,
          pageCount: 1,
          sha256: "def456",
          payloadFile: payloadFileName("arquivo-2"),
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    },
    remote = {
      ...emptyData("2026-01-03T00:00:00.000Z"),
      files: [
        {
          ...base.files[0],
          caseIds: ["caso-1"],
          name: "atual.pdf",
          updatedAt: "2026-01-02T00:00:00.000Z",
        },
      ],
      deletedFiles: [
        {
          id: "arquivo-2",
          deletedAt: "2026-01-03T00:00:00.000Z",
        },
      ],
    },
    merged = mergeData(base, remote);

  assert.equal(merged.files.length, 1);
  assert.equal(merged.files[0].name, "atual.pdf");
  assert.deepEqual(merged.files[0].caseIds, ["caso-1"]);
  assert.equal(merged.files[0].base64, undefined);
  assert.equal(signature(merged), signature(mergeData(remote, base)));
});

test("publicar payloads apenas quando os metadados divergirem", () => {
  const local = {
    sha256: "abc123",
    payloadFile: "financeiro-pdf-arquivo-1.b64",
  };
  assert.equal(needsPayloadUpload(local, { ...local }), false);
  assert.equal(needsPayloadUpload(local, null), true);
});
