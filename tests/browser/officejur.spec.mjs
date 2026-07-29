import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const pages = [
  '',
  'configuracoes/',
  'documentos/procuracao/',
  'documentos/hipossuficiencia/',
  'documentos/honorarios/',
  'documentos/ciencia-audiencia/',
  'financeiro/',
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
