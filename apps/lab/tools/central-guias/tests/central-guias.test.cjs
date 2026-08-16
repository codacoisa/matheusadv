const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../../../../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('Central sincroniza sua configuração sem alterar a nuvem global', () => {
  const index = read('apps/lab/tools/central-guias/index.html');
  const app = read('apps/lab/tools/central-guias/assets/app.js');

  assert.match(index, /ID ou endereço da fonte remota/);
  assert.match(index, /Configuração do módulo/);
  assert.match(index, /gist-access-lease/);
  assert.match(index, /office-cloud-status id="cloud-status"/);
  assert.match(index, /cloud-status\.js/);
  assert.match(app, /central-guias::config/);
  assert.match(app, /persistConfig/);
  assert.match(app, /officejur-central-guias\.json/);
  assert.match(app, /officejur\/central-guias-config/);
  assert.match(app, /syncClient\.patch/);
  assert.match(app, /targetGistClient\.gist/);
  assert.match(app, /OfficeJurGistSettings\?\.load/);
  assert.match(app, /OfficeJurCloudStatus/);
  assert.doesNotMatch(app, /OfficeJurGistSettings\?\.save/);
  assert.doesNotMatch(index, />[^<]*Gist[^<]*</);
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

test('Central reflete os polos resumidos e mantém o vencimento legível', () => {
  const index = read('apps/lab/tools/central-guias/index.html');
  const styles = read('apps/lab/tools/central-guias/assets/styles.css');
  const app = read('apps/lab/tools/central-guias/assets/app.js');

  assert.match(index, /Polo Ativo, Polo Passivo/);
  assert.match(app, /Polo Ativo:/);
  assert.match(app, /Polo Passivo:/);
  assert.match(index, /file-invoice-dollar/);
  assert.match(app, /activeParty/);
  assert.match(app, /passiveParty/);
  assert.match(app, /function renderPartySummary/);
  assert.match(app, /function lastPathSegment/);
  assert.match(app, /cell-truncate/);
  assert.match(app, /function getProcessOpenUrl/);
  assert.match(app, /target="_blank"/);
  assert.match(app, /arrow-up-right-from-square/);
  assert.match(app, /function formatDateOnly/);
  assert.match(app, /fa-regular fa-copy/);
  assert.match(styles, /\.table-wrap table\s*\{[\s\S]*table-layout: fixed/);
  assert.match(styles, /\.party-summary/);
  assert.match(styles, /\.process-meta-line/);
  assert.match(styles, /\.due-date/);
});
