import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

async function prepareCalculationPage(page, path = 'calculos/') {
  await page.goto('financeiro/', { waitUntil: 'networkidle' });
  await page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('officejur-financeiro', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction('domains', 'readwrite');
      const store = transaction.objectStore('domains');
      const now = new Date().toISOString();
      store.put({ name: 'clients', value: { schema: 'officejur/financeiro-clientes-data', version: 1, updatedAt: now, records: [{ id: 'client-test', type: 'pf', name: 'Cliente de teste', updatedAt: now }], deleted: [] } });
      store.put({ name: 'cases', value: { schema: 'officejur/financeiro-casos-data', version: 1, updatedAt: now, records: [{ id: 'case-test', clientId: 'client-test', title: 'Ação de teste', number: '0000000-00.2026.8.00.0000', type: 'Judicial', status: 'active', updatedAt: now }], deleted: [] } });
      transaction.oncomplete = () => { database.close(); resolve(); };
      transaction.onerror = () => reject(transaction.error);
    };
  }));
  await page.goto(path, { waitUntil: 'networkidle' });
}

const pages = [
  '',
  'configuracoes/',
  'configuracoes/ajuda.html',
  'calculos/',
  'calculos/facil/',
  'calculos/completo/',
  'calculos/pensao/',
  'calculos/trabalhista/',
  'documentos/procuracao/',
  'documentos/hipossuficiencia/',
  'documentos/honorarios/',
  'documentos/ciencia-audiencia/',
  'financeiro/',
  'financeiro/ajuda-mercado-pago.html',
  'validador-projudi/',
  'lab/',
  'lab/controle-pagamentos/',
  'lab/central-guias/',
];

for (const appPath of pages) {
  test(`${appPath || 'portal'} carrega sem erros e atende WCAG A/AA`, async ({ page }) => {
    const runtimeErrors = [];
    page.on('pageerror', error => runtimeErrors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error') runtimeErrors.push(message.text());
    });

    const response = await page.goto(appPath, { waitUntil: 'networkidle' });
    expect(response?.ok(), `Falha HTTP em ${appPath || 'portal'}`).toBeTruthy();
    await expect(page.locator('h1').first()).toBeVisible();
    expect(runtimeErrors, `Erros no console em ${appPath || 'portal'}`).toEqual([]);

    const accessibility = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    const issues = accessibility.violations.flatMap(violation =>
      violation.nodes.map(node => `${violation.id}: ${node.target.join(' > ')} — ${node.failureSummary}`));
    expect(issues).toEqual([]);
  });
}

test('seletor de aplicativos abre, fecha com Escape e mantém o foco', async ({ page }) => {
  await page.goto('', { waitUntil: 'networkidle' });
  const switcher = page.locator('office-app-switcher').first();
  const launcher = switcher.getByRole('button', { name: /Abrir menu de sistemas/ });
  await launcher.click();
  await expect(launcher).toHaveAttribute('aria-expanded', 'true');
  await expect(switcher.getByRole('navigation', { name: 'Alternar sistema' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(launcher).toHaveAttribute('aria-expanded', 'false');
  await expect(launcher).toBeFocused();
});

test('páginas com tema institucional habilitam a barra de status no Safari', async ({ page }) => {
  const themedPages = [
    'calculos/',
    'documentos/ciencia-audiencia/',
    'documentos/hipossuficiencia/',
    'documentos/honorarios/',
    'financeiro/',
  ];

  for (const appPath of themedPages) {
    await page.goto(appPath, { waitUntil: 'networkidle' });
    await expect(page.locator('meta[name="color-scheme"]')).toHaveAttribute('content', 'light');
    await expect(page.locator('meta[name="theme-color"][media="(prefers-color-scheme: light)"]'))
      .toHaveAttribute('content', '#17213a');
    await expect(page.locator('meta[name="theme-color"][media="(prefers-color-scheme: dark)"]'))
      .toHaveAttribute('content', '#17213a');
    await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute('content', 'yes');
    await expect(page.locator('meta[name="apple-mobile-web-app-status-bar-style"]')).toHaveAttribute('content', 'black-translucent');
  }
});

test('seletor e portal exibem os aplicativos em ordem alfabética', async ({ page }) => {
  await page.goto('', { waitUntil: 'networkidle' });
  const switcher = page.locator('office-app-switcher').first();
  await switcher.getByRole('button', { name: /Abrir menu de sistemas/ }).click();
  const appNames = await switcher.locator('.name').allTextContents();
  expect(appNames).toEqual([
    'Início',
    'Cálculos',
    'Ciência',
    'Financeiro',
    'Hipossuficiência',
    'Honorários',
    'Lab',
    'Procuração',
    'Validador',
    'Configurações',
  ]);

  const sections = page.locator('main > section');
  await expect(sections.nth(0).locator('.label strong')).toHaveText([
    'Ciência de Audiência',
    'Contrato de Honorários',
    'Hipossuficiência',
    'Procuração',
  ]);
  await expect(sections.nth(1).locator('.label strong')).toHaveText([
    'Cálculos Jurídicos',
    'Financeiro Jurídico',
    'Lab',
    'Validador Projudi',
  ]);
  await expect(page.locator('main')).not.toContainText('Configurações');
});

test('headers dos aplicativos compartilham altura, marca e ações específicas', async ({ page }) => {
  const headerPaths = pages.filter(appPath => appPath);
  for (const appPath of headerPaths) {
    await page.goto(appPath, { waitUntil: 'networkidle' });
    const header = page.locator('.topbar').first();
    await expect(header, `Header ausente em ${appPath}`).toBeVisible();
    await expect(header).toHaveCSS('height', '68px');
    await expect(header.locator('img').first()).toHaveCSS('width', '40px');
    await expect(header.locator('office-app-switcher')).toHaveCount(1);
  }

  await page.goto('documentos/procuracao/', { waitUntil: 'networkidle' });
  await expect(page.getByRole('button', { name: 'Importar' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Gerar PDF' })).toBeVisible();
  await page.goto('validador-projudi/', { waitUntil: 'networkidle' });
  await expect(page.getByRole('button', { name: 'Limpar' })).toBeVisible();
});

test('header documental preserva todas as ações sem estourar a tela móvel', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('documentos/procuracao/', { waitUntil: 'networkidle' });
  await expect(page.locator('.topbar')).toHaveCSS('height', '68px');
  for (const action of ['Importar', 'Limpar', 'Imprimir', 'Gerar PDF']) {
    await expect(page.getByRole('button', { name: action })).toBeVisible();
  }
  const viewport = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(viewport.scrollWidth).toBe(viewport.clientWidth);
});

test('Financeiro não reserva espaço acima do header compartilhado', async ({ page }) => {
  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('financeiro/', { waitUntil: 'networkidle' });
    const layout = await page.evaluate(() => {
      const header = document.querySelector('.topbar');
      const shell = document.querySelector('.shell');
      return {
        bodyPaddingTop: getComputedStyle(document.body).paddingTop,
        headerHeight: header.getBoundingClientRect().height,
        headerTop: header.getBoundingClientRect().top,
        shellTop: shell.getBoundingClientRect().top,
      };
    });
    expect(layout).toEqual({
      bodyPaddingTop: '0px',
      headerHeight: 68,
      headerTop: 0,
      shellTop: 68,
    });
  }
});

test('geradores carregam a base compartilhada de documentos', async ({ page }) => {
  await page.goto('documentos/procuracao/', { waitUntil: 'networkidle' });
  await expect.poll(() => page.evaluate(() => Object.keys(window.OfficeJurDocumentUtils || {}).sort()))
    .toContain('encodePdfDraft');
  const roundTrip = await page.evaluate(() => {
    const marker = 'OFFICEJUR_TEST:';
    const draft = { client: 'João', city: 'Silvânia' };
    const encoded = window.OfficeJurDocumentUtils.encodePdfDraft(marker, draft);
    return window.OfficeJurDocumentUtils.decodePdfDraft(encoded.slice(marker.length));
  });
  expect(roundTrip).toEqual({ client: 'João', city: 'Silvânia' });
});

test('cálculo de pensão percorre o fluxo, salva e gera PDF auditável', async ({ page }) => {
  await prepareCalculationPage(page);
  const card = page.locator('.calculator-card').filter({ hasText: 'Pensão alimentícia' });
  await card.getByRole('link', { name: 'Iniciar cálculo' }).click();
  await page.getByLabel('Forma estipulada').selectOption('fixed');
  await page.getByLabel('Nome do cálculo').fill('Teste de pensão');
  await page.getByLabel('Cliente').selectOption('client-test');
  await page.getByLabel('Caso / processo (opcional)').selectOption('case-test');
  await page.getByLabel('Exequente / credor').fill('Credora de teste');
  await page.getByLabel('Executado / devedor').fill('Devedor de teste');
  await page.getByLabel('Número do processo').fill('0000000-00.2026.8.00.0000');
  await page.getByLabel('Valor mensal (R$)').fill('500');
  await page.getByRole('button', { name: 'Próximo' }).click();
  await expect(page.getByRole('columnheader', { name: 'Abatimentos' })).toBeVisible();
  await page.getByRole('button', { name: 'Próximo' }).click();
  await page.getByLabel('Correção monetária').selectOption('none');
  await page.getByLabel('Juros').selectOption('fixed');
  await page.getByLabel('Juros simples mensais (%)').fill('0');
  await page.getByRole('button', { name: 'Calcular' }).click();
  await expect(page.getByText('R$ 500,00', { exact: true }).last()).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Gerar PDF detalhado' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^oj-cal-.*\.pdf$/i);
  await expect(page.locator('#toast')).toHaveText('PDF gerado com sucesso.');
  await expect(page.locator('#toast')).not.toContainText(/SHA|hash/i);
});

test('atualização monetária simples calcula uma parcela e exibe a memória', async ({ page }) => {
  await prepareCalculationPage(page);
  await page.locator('.calculator-card').filter({ hasText: 'Atualização monetária simples' }).getByRole('link', { name: 'Iniciar cálculo' }).click();
  await page.getByLabel('Nome do cálculo').fill('Cálculo fácil de teste');
  await page.getByLabel('Cliente').selectOption('client-test');
  await page.getByLabel('Valor do item 1').fill('150');
  await page.getByRole('button', { name: 'Calcular' }).click();
  await expect(page.getByRole('heading', { name: 'Resultado do cálculo' })).toBeVisible();
  await expect(page.getByText('R$ 150,00', { exact: true }).last()).toBeVisible();
});

test('atualização monetária completa percorre parcelas e encargos adicionais', async ({ page }) => {
  await prepareCalculationPage(page);
  await page.locator('.calculator-card').filter({ hasText: 'Atualização monetária completa' }).getByRole('link', { name: 'Iniciar cálculo' }).click();
  await page.getByLabel('Nome do cálculo').fill('Cálculo completo de teste');
  await page.getByLabel('Cliente').selectOption('client-test');
  await page.getByRole('button', { name: 'Próximo' }).click();
  await page.getByLabel('Descrição do item 1').fill('Parcela principal');
  await page.getByLabel('Valor do item 1').fill('100');
  await page.getByRole('button', { name: 'Próximo' }).click();
  await page.getByRole('button', { name: /Adicionar multa/ }).click();
  await page.getByLabel('Multa (%)').fill('2');
  await page.getByRole('button', { name: /Adicionar honorários/ }).click();
  await page.getByLabel('Honorários (%)').fill('10');
  await page.getByRole('button', { name: 'Calcular' }).click();
  await expect(page.getByRole('heading', { name: 'Resultado do cálculo' })).toBeVisible();
  await expect(page.getByText('R$ 112,20', { exact: true }).last()).toBeVisible();
});

test('cálculo trabalhista percorre o fluxo, salva e gera PDF', async ({ page }) => {
  await prepareCalculationPage(page);
  const card = page.locator('.calculator-card').filter({ hasText: 'Verbas trabalhistas' });
  await card.getByRole('link', { name: 'Iniciar cálculo' }).click();
  await expect(page).toHaveURL(/calculos\/trabalhista\/$/);

  await page.getByLabel('Nome do cálculo').fill('Verbas de teste');
  await page.getByLabel('Cliente').selectOption('client-test');
  await page.getByLabel('Caso / processo (opcional)').selectOption('case-test');
  await page.getByLabel('Salário-base inicial (R$)').fill('3000');
  await page.getByLabel(/Empregado ainda ativo/).check();
  await page.getByRole('button', { name: 'Próximo' }).click();

  await expect(page.getByRole('columnheader', { name: 'Competência' })).toBeVisible();
  await page.getByRole('button', { name: 'Próximo' }).click();
  await page.getByLabel('Saldo salarial').check();
  const claim = page.locator('.labor-claim').filter({ hasText: 'Saldo salarial' });
  await claim.getByLabel('Dias', { exact: true }).fill('10');
  await page.getByRole('button', { name: 'Próximo' }).click();

  await page.getByLabel('Correção monetária').selectOption('none');
  await page.locator('#interestType').selectOption('none');
  await page.getByRole('button', { name: 'Calcular' }).click();
  await expect(page.getByText('R$ 1.000,00', { exact: true }).last()).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Gerar PDF' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^OJ-LAB-.*\.pdf$/i);
  await expect(page.locator('#labor-toast')).toHaveText('PDF gerado.');
  await expect(page.locator('#labor-toast')).not.toContainText(/SHA|hash/i);
});

test('assistentes de cálculo compartilham cancelamento e versões identificáveis', async ({ page }) => {
  await page.goto('calculos/', { waitUntil: 'networkidle' });
  await page.locator('.calculator-card').filter({ hasText: 'Pensão alimentícia' })
    .getByRole('link', { name: 'Iniciar cálculo' }).click();
  await expect(page).toHaveURL(/calculos\/pensao\/$/);
  await expect.poll(() => page.evaluate(() => window.OfficeJurCalculationPdf?.formatVersion('1.0.0')))
    .toBe('pension-1.0.0');
  expect(await page.evaluate(() => window.OfficeJurCalculationPdf.formatVersion('pension-1.0.0')))
    .toBe('pension-1.0.0');
  await expect(page.getByText(/versão pension-1\.0\.0/i)).toBeVisible();
  await page.getByRole('button', { name: 'Cancelar' }).click();
  await expect(page).toHaveURL(/calculos\/$/);

  await page.locator('.calculator-card').filter({ hasText: 'Verbas trabalhistas' })
    .getByRole('link', { name: 'Iniciar cálculo' }).click();
  await expect(page).toHaveURL(/calculos\/trabalhista\/$/);
  await expect(page.getByText(/versão labor-1\.0\.0/i)).toBeVisible();
  await page.getByRole('button', { name: 'Cancelar' }).click();
  await expect(page).toHaveURL(/calculos\/$/);
});

test('cálculo trabalhista usa a sincronização compartilhada do Gist', async ({ page }) => {
  const requests = [];
  await page.addInitScript(() => {
    localStorage.setItem('officejur-gist-settings', JSON.stringify({
      version: 1,
      gistId: 'test-gist',
      token: 'token-de-teste',
      autoSync: true,
    }));
  });
  await page.route('https://api.github.com/gists/test-gist', async route => {
    const request = route.request();
    requests.push({ method: request.method(), body: request.postDataJSON?.() });
    await route.fulfill({
      contentType: 'application/json',
      headers: { ETag: '"calculos-1"' },
      body: JSON.stringify({ files: {} }),
    });
  });

  await prepareCalculationPage(page, 'calculos/trabalhista/');
  await expect(page.locator('#sync-status')).toHaveText('Gist sincronizado');
  await page.getByLabel('Nome do cálculo').fill('Rascunho sincronizado');
  await page.getByLabel('Cliente').selectOption('client-test');
  await page.getByLabel(/Empregado ainda ativo/).check();
  await page.getByRole('button', { name: 'Salvar rascunho' }).click();

  await expect.poll(() => requests.filter(item => item.method === 'PATCH' && item.body?.files?.['officejur-calculos-juridicos.json']).length).toBe(1);
  const patch = requests.find(item => item.method === 'PATCH' && item.body?.files?.['officejur-calculos-juridicos.json']);
  const content = JSON.parse(patch.body.files['officejur-calculos-juridicos.json'].content);
  expect(content.records.some(record => record.type === 'labor' && record.name === 'Rascunho sincronizado')).toBe(true);
});

test('configuração global do Gist permanece centralizada', async ({ page }) => {
  await page.goto('configuracoes/', { waitUntil: 'networkidle' });
  await expect(page.getByLabel(/Gist ID|ID.*Gist/i)).toBeVisible();
  await expect(page.getByLabel(/token/i)).toBeVisible();
  await expect(page.locator('body')).not.toContainText(/Configurar Gist.*Financeiro/i);
});

test('componentes compartilhados rejeitam URLs com protocolos inseguros', async ({ page }) => {
  await page.route('**/assets/office-config.js', route => route.fulfill({
    contentType: 'text/javascript',
    body: `window.OFFICEJUR_CONFIG = {
      installation: {
        baseUrl: 'javascript:alert(1)',
        repositoryUrl: 'data:text/html,unsafe'
      },
      product: {
        name: '<img src=x onerror=alert(1)>',
        copyrightHolder: '<svg onload=alert(1)>'
      },
      office: {
        name: '<script>alert(1)</script>',
        logoWhiteUrl: 'javascript:alert(1)'
      }
    };`,
  }));

  await page.goto('', { waitUntil: 'networkidle' });
  const protocols = await page.locator('office-app-switcher').evaluate(element =>
    [...element.shadowRoot.querySelectorAll('a')].map(link => new URL(link.href).protocol));
  expect(protocols.every(protocol => ['http:', 'https:'].includes(protocol))).toBeTruthy();
  const repositoryProtocol = await page.locator('office-site-footer').evaluate(element =>
    new URL(element.shadowRoot.querySelector('a').href).protocol);
  expect(['http:', 'https:']).toContain(repositoryProtocol);
  await expect(page.locator('office-app-switcher img, office-app-switcher script')).toHaveCount(0);

  await page.goto('documentos/procuracao/', { waitUntil: 'networkidle' });
  const logoProtocol = await page.locator('office-document-header .brand img').evaluate(image =>
    new URL(image.src).protocol);
  expect(['http:', 'https:']).toContain(logoProtocol);
});

test('cliente do Gist atualiza sem cabeçalho condicional incompatível', async ({ page }) => {
  const requests = [];
  await page.route('https://api.github.com/gists/test-gist', async route => {
    const request = route.request();
    requests.push({
      method: request.method(),
      headers: request.headers(),
    });
    await route.fulfill({
      contentType: 'application/json',
      headers: { ETag: '"revisao-1"' },
      body: JSON.stringify({ files: {} }),
    });
  });

  await page.goto('configuracoes/', { waitUntil: 'networkidle' });
  await page.evaluate(() => window.OfficeJurGistClient.patch(
    'test-gist',
    'token-de-teste',
    { 'dados.json': { content: '{}' } },
    { etag: '"revisao-1"' },
  ));

  expect(requests.map(request => request.method)).toEqual(['GET', 'PATCH', 'GET']);
  expect(requests[1].headers).not.toHaveProperty('if-match');
});
