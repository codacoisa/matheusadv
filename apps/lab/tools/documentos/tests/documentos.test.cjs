const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../../../../..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('Documentos integra o editor OnlyOffice local', () => {
  const index = read('apps/lab/tools/documentos/index.html');
  const app = read('apps/lab/tools/documentos/assets/app.js');

  assert.match(index, /id="office-editor-frame"/);
  assert.match(index, /locale=pt-BR/);
  assert.match(app, /document:open-file/);
  assert.match(app, /document:save/);
  assert.match(app, /document:saved/);
  assert.match(app, /originalFile/);
  assert.doesNotMatch(app, /engineApi|office-oxide/);
});

test('o build publica o submódulo e a licença AGPL do editor', () => {
  const build = read('scripts/build-site.sh');
  const patch = read('third_party/ranuts-document.patch');

  assert.match(build, /RANUTS_EDITOR_BASE="fcaa66e/);
  assert.match(build, /third_party\/ranuts-document\.patch/);
  assert.match(build, /pnpm --dir "\$RANUTS_EDITOR_SOURCE" run build/);
  assert.match(build, /AGPL-3\.0\.LICENSE/);
  assert.match(patch, /packages\/shared\/src\/document-utils\.ts/);
  assert.match(patch, /pt-br\.json/);
});
