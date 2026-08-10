const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const storage = require('../assets/storage.js');

const root = path.resolve(__dirname, '../../../../..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('Documentos integra o editor OnlyOffice', () => {
  const index = read('apps/lab/tools/documentos/index.html');
  const app = read('apps/lab/tools/documentos/assets/app.js');

  assert.match(index, /id="office-editor-frame"/);
  assert.match(index, /locale=pt-BR/);
  assert.match(app, /document:open-file/);
  assert.match(app, /document:save/);
  assert.match(app, /document:rename/);
  assert.match(app, /document:focus/);
  assert.match(app, /document:print-ready/);
  assert.match(app, /office-print-frame/);
  assert.match(app, /document:saved/);
  assert.doesNotMatch(app, /data-rename-id|rename-file/);
  assert.match(app, /AUTO_SAVE_INTERVAL = 10000/);
  assert.match(app, /dataBase64/);
  assert.match(app, /originalDataBase64/);
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

test('Documentos oferece o modelo institucional definido pela implantação', () => {
  const index = read('apps/lab/tools/documentos/index.html');
  const app = read('apps/lab/tools/documentos/assets/app.js');
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
  const validator = read('scripts/validate-site.mjs');

  assert.match(build, /RANUTS_EDITOR_BASE="fcaa66e/);
  assert.match(build, /third_party\/ranuts-document\.patch/);
  assert.match(build, /pnpm --dir "\$RANUTS_EDITOR_SOURCE" run build/);
  assert.match(build, /AGPL-3\.0\.LICENSE/);
  assert.match(build, /config\/document-templates/);
  assert.match(patch, /packages\/shared\/src\/document-utils\.ts/);
  assert.match(patch, /ranuts:document-native-save/);
  assert.match(patch, /ranuts:document-native-print/);
  assert.match(patch, /grabFocus/);
  assert.match(patch, /ranutsFocusRecovery/);
  assert.match(patch, /contentWindow\?\.focus/);
  assert.match(patch, /documenteditor\/main\/locale\/en\.json/);
  assert.match(patch, /pt-br\.json/);
  assert.match(patch, /"DE\.Views\.Toolbar\.capBtnInsImage": "Imagem"/);
  assert.match(patch, /"DE\.Views\.Toolbar\.capBtnDateTime": "Data e Hora"/);
  assert.match(validator, /thirdPartyHtmlPrefixes = \["lab\/documentos\/editor\/"\]/);
});
