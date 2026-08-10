const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../../../../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('Central sincroniza sua configuração sem alterar o Gist global', () => {
  const index = read('apps/lab/tools/central-guias/index.html');
  const app = read('apps/lab/tools/central-guias/assets/app.js');

  assert.match(index, /ID ou endereço do Gist/);
  assert.match(index, /Configuração do módulo/);
  assert.match(index, /gist-access-lease/);
  assert.match(app, /central-guias::config/);
  assert.match(app, /persistConfig/);
  assert.match(app, /officejur-central-guias\.json/);
  assert.match(app, /officejur\/central-guias-config/);
  assert.match(app, /syncClient\.patch/);
  assert.match(app, /targetGistClient\.gist/);
  assert.match(app, /OfficeJurGistSettings\?\.load/);
  assert.doesNotMatch(app, /OfficeJurGistSettings\?\.save/);
});

test('Central oferece uma fila de trabalho orientada a vencimentos', () => {
  const index = read('apps/lab/tools/central-guias/index.html');
  const styles = read('apps/lab/tools/central-guias/assets/styles.css');
  const app = read('apps/lab/tools/central-guias/assets/app.js');

  assert.match(index, /Fila de trabalho/);
  assert.match(index, /focus-actions/);
  assert.match(styles, /\.work-queue/);
  assert.match(styles, /\.hero-card--config/);
  assert.match(app, /renderFocusActions/);
});
