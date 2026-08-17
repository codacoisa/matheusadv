const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const storage = require('../assets/storage.js');
const documentFiles = require('../assets/files.js');

const root = path.resolve(__dirname, '../../..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('Arquivos integra o editor OnlyOffice sem se misturar aos geradores', () => {
  const index = read('apps/arquivos/index.html');
  const app = read('apps/arquivos/assets/app.js');
  const portal = read('apps/portal/index.html');
  const switcher = read('packages/ui/app-switcher.js');
  const labCatalog = read('apps/lab/assets/catalog.js');

  assert.match(portal, /href="\.\/arquivos\/"/);
  assert.match(switcher, /id: 'arquivos'/);
  assert.match(index, /current="arquivos"/);
  assert.match(index, /office-cloud-status id="cloud-status"/);
  assert.match(index, /cloud-status\.js/);
  assert.doesNotMatch(index, />[^<]*Gist[^<]*</);
  assert.doesNotMatch(index, /documentos\/procuracao|documentos\/honorarios/);
  assert.doesNotMatch(labCatalog, /id: 'documentos'/);
  assert.match(index, /id="office-editor-frame"/);
  assert.match(index, /src="\.\/editor\/editor\.html\?embed=1&amp;locale=pt-BR"/);
  assert.match(index, /locale=pt-BR/);
  assert.match(app, /document:open-file/);
  assert.match(app, /document:save/);
  assert.match(app, /document:rename/);
  assert.match(app, /document:focus/);
  assert.match(app, /document:print-ready/);
  assert.match(app, /document:print-fallback/);
  assert.match(app, /document:print-native/);
  assert.match(app, /office-print-frame/);
  assert.match(app, /document:saved/);
  assert.doesNotMatch(app, /data-rename-id|rename-file/);
  assert.match(app, /AUTO_SAVE_INTERVAL = 10000/);
  assert.match(app, /dataBase64/);
  assert.match(app, /originalDataBase64/);
  assert.match(app, /financeStorage\.resolvedClients\(domains\)/);
  assert.doesNotMatch(app, /engineApi|office-oxide/);
});

test('Documentos codifica arquivos em Base64 sem manter binários estruturados', () => {
  const bytes = new Uint8Array([0, 1, 2, 127, 128, 255]);
  const base64 = storage.bytesToBase64(bytes);
  assert.equal(base64, 'AAECf4D/');
  assert.deepEqual([...storage.base64ToBytes(base64)], [...bytes]);
  const normalized = storage.normalize({ id: 'doc', dataBase64: base64, originalDataBase64: base64 });
  assert.equal(normalized.file, undefined);
  assert.equal(normalized.originalFile, undefined);
});

test('Documentos separa índice e payloads Base64 para o Gist', () => {
  const encoded = documentFiles.toBase64(new Uint8Array([1, 2, 3]));
  const data = documentFiles.normalizeData({
    schema: documentFiles.SCHEMA,
    version: documentFiles.VERSION,
    documents: [{ id: 'doc-1', clientId: 'client-1', name: 'Petição', extension: 'docx', sha256: 'hash' }],
    deletedDocuments: [{ id: 'doc-old', deletedAt: '2026-01-01T00:00:00.000Z' }]
  });
  assert.equal(encoded, 'AQID');
  assert.equal(documentFiles.INDEX_FILE, 'arquivos-documentos.json');
  assert.equal(documentFiles.payloadFileName('doc-1'), 'officejur-documento-doc-1.b64');
  assert.equal(documentFiles.originalPayloadFileName('doc-1'), 'officejur-documento-doc-1-original.b64');
  assert.equal(data.documents[0].clientId, 'client-1');
  assert.equal(data.deletedDocuments[0].id, 'doc-old');
  assert.match(documentFiles.signature(data), /doc-1/);
  assert.equal(storage.DATABASE, 'officejur-arquivos');
});

test('Arquivos oferece o modelo institucional definido pela implantação', () => {
  const index = read('apps/arquivos/index.html');
  const app = read('apps/arquivos/assets/app.js');
  const config = read('config/office.js');
  const configuredHash = config.match(/institutionalDocxTemplate[\s\S]*?sha256:\s*'([a-f0-9]{64})'/)?.[1];
  const template = Buffer.from(read('config/document-templates/modelo-institucional.docx.base64').replace(/\s+/g, ''), 'base64');

  assert.match(index, /id="institutional-template"/);
  assert.match(index, /Usar modelo do escritório/);
  assert.match(app, /institutionalDocxTemplate/);
  assert.match(app, /loadInstitutionalTemplate/);
  assert.match(app, /source: file \? 'imported' : \(selectedExtension === 'docx'/);
  assert.match(config, /base64Url: assetUrl\('document-templates\/modelo-institucional\.docx\.base64'\)/);
  assert.equal(template.subarray(0, 2).toString(), 'PK');
  assert.equal(createHash('sha256').update(template).digest('hex'), configuredHash);
});

test('o build publica o submódulo e a licença AGPL do editor', () => {
  const build = read('scripts/build-site.sh');
  const patch = read('third_party/ranuts-document.patch');
  const editor = read('third_party/ranuts-document/lib/onlyoffice-editor.ts');
  const vendor = read('third_party/ranuts-document/public/web-apps/apps/documenteditor/main/app.js');
  const validator = read('scripts/validate-site.mjs');

  assert.match(build, /RANUTS_EDITOR_BASE="90c3ca2672e998ee68073eaacf51246d676d8570"/);
  assert.match(build, /third_party\/ranuts-document\.patch/);
  assert.match(build, /pnpm --dir "\$RANUTS_EDITOR_SOURCE" run build/);
  assert.match(build, /AGPL-3\.0\.LICENSE/);
  assert.match(build, /config\/document-templates/);
  assert.match(vendor, /Version: 9\.3\.0\.133/);
  assert.match(editor, /onlyoffice-file-stream/);
  assert.match(patch, /packages\/shared\/src\/document-utils\.ts/);
  assert.match(patch, /ranuts:document-native-print/);
  assert.match(patch, /requestNativeBrowserPrint/);
  assert.match(patch, /document:print-fallback/);
  assert.match(patch, /document:print-native/);
  assert.match(patch, /serviceCommand\(params\.command, params\.data\)/);
  assert.match(patch, /setMetaData\(\{ title: nextName \}\)/);
  assert.match(patch, /onSaveDocument: handlePersonalSaveDocument/);
  assert.match(patch, /SetDocumentModified\?\.\(false\)/);
  assert.match(patch, /typeof api\.SetDocumentModified === 'function'/);
  assert.match(patch, /markPersonalDocumentSaved/);
  assert.match(patch, /document-saved-file/);
  assert.match(patch, /installPrintBridge/);
  assert.match(patch, /grabFocus/);
  assert.match(patch, /contentWindow\?\.focus/);
  assert.match(patch, /data-ranuts-focus-recovery/);
  assert.match(validator, /thirdPartyHtmlPrefixes = \["arquivos\/editor\/"\]/);
  assert.match(validator, /sdkjs\/common\/wasm\/x2t\/x2t\.wasm\.gz/);
  assert.match(validator, /arquivos\/editor\/assets\/editor-\*\.js/);
});
