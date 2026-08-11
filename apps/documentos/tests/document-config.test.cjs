const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const read = (path) => fs.readFileSync(path, 'utf8');
const config = read('config/document-config.js');
const officeConfig = read('config/office.js');
const officeContext = read('packages/ui/office-context.js');
const documentModules = [
  'ciencia-audiencia',
  'hipossuficiencia',
  'honorarios',
  'procuracao',
];

test('configuração documental centraliza os templates da instalação', () => {
  assert.match(config, /officejur\/document-config/);
  assert.match(config, /document-templates\/pdf\/wordmark\.png/);
  assert.match(config, /document-templates\/pdf\/watermark\.png/);
  assert.match(config, /logoCrop/);
  assert.match(config, /wordmarkCrop/);
  assert.match(config, /wordmarkCrop: Object\.freeze\(\{ x: 238, y: 384, w: 1068, h: 190 \}\)/);
  assert.match(config, /watermarkCrop/);
  assert.doesNotMatch(config, /legacy/i);
  assert.equal((config.match(/Object\.freeze\(\{ id:/g) || []).length, 19);
  for (const moduleName of documentModules) {
    assert.match(config, new RegExp(moduleName));
  }
});

test('geradores usam a configuração sem incorporar a identidade da instalação', () => {
  for (const moduleName of documentModules) {
    const app = read(`apps/documentos/${moduleName}/assets/app.js`);
    const html = read(`apps/documentos/${moduleName}/index.html`);
    assert.match(app, /OFFICEJUR_DOCUMENT_CONFIG/);
    assert.match(app, /OfficeJurPdfTemplate/);
    assert.doesNotMatch(app, /(?:drawPageChrome|addContentPage)\(doc, ['"](?:CONTRATO DE HONORÁRIOS ADVOCATÍCIOS|PROCURAÇÃO)['"]\)/);
    assert.doesNotMatch(app, /Greg[oó]rio|Morais|gregorio/);
    assert.doesNotMatch(app, /(?:wordmark|watermark)\.png/);
    assert.match(html, /document-config\.js/);
    assert.match(html, /pdf-template\.js/);
  }
});

test('tema da instalação alimenta a interface e as cores dos PDFs', () => {
  for (const color of [
    'primary',
    'primaryDark',
    'primarySoft',
    'accent',
    'accentStrong',
    'accentLight',
    'accentSoft',
    'canvas',
    'surface',
    'text',
    'muted',
    'line',
    'success',
    'danger',
    'warning',
    'info',
    'headerText',
    'headerMuted',
    'pdfAccent',
    'pdfText',
    'pdfMuted',
  ]) {
    assert.match(officeConfig, new RegExp(`${color}:`));
  }
  assert.match(officeContext, /applyTheme/);
  assert.match(officeContext, /--officejur-primary/);
  assert.match(officeContext, /--navy/);
  assert.match(officeContext, /meta\[name="theme-color"\]/);
  assert.match(config, /themeColors\.pdfAccent/);
});

test('geradores preservam múltiplos representantes recebidos do Financeiro', () => {
  const context = { window: {} };
  vm.runInNewContext(read('apps/documentos/assets/document-utils.js'), context);
  const utils = context.window.OfficeJurDocumentUtils;
  const person = {
    type: 'pj',
    representatives: [
      { name: 'Maria da Silva', role: 'Administradora', cpf: '52998224725' },
      { name: 'João de Souza', role: 'Diretor', cpf: '11144477735', signatureRule: 'joint' },
    ],
  };

  assert.deepEqual(
    JSON.parse(JSON.stringify(utils.representativesOf(person))),
    [
      { name: 'Maria da Silva', role: 'Administradora', cpf: '529.982.247-25', authority: '', signatureRule: 'individual' },
      { name: 'João de Souza', role: 'Diretor', cpf: '111.444.777-35', authority: '', signatureRule: 'joint' },
    ],
  );
  assert.equal(
    utils.representationClause(person),
    'neste ato representada por MARIA DA SILVA, Administradora, inscrito(a) no CPF sob o nº 529.982.247-25; e JOÃO DE SOUZA, Diretor, inscrito(a) no CPF sob o nº 111.444.777-35',
  );
  for (const moduleName of ['procuracao', 'honorarios']) {
    const app = read(`apps/documentos/${moduleName}/assets/app.js`);
    assert.match(app, /payload\.version !== 2/);
    assert.match(app, /representationClause\(person\)/);
    assert.match(app, /representativesOf\(person\)/);
  }
});
