import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { minimalDocx, minimalPptx, minimalXlsx } from './office-fixtures.cjs';

test.beforeEach(async ({ page }) => {
  await page.route('https://servicodados.ibge.gov.br/api/v1/localidades/**', route =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify([
        { nome: 'Anápolis' },
        { nome: 'Goiânia' },
        { nome: 'Silvânia' },
      ]),
    }));
  await page.route('https://viacep.com.br/ws/**', route =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        cep: '74000-123',
        logradouro: 'Avenida Central',
        bairro: 'Centro',
        localidade: 'Goiânia',
        uf: 'GO',
      }),
    }));
});

async function prepareCalculationPage(page, path = 'calculos/') {
  await page.goto('financeiro/', { waitUntil: 'networkidle' });
  await page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('officejur-financeiro', 2);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction('domains-v2', 'readwrite');
      const store = transaction.objectStore('domains-v2');
      const now = new Date().toISOString();
      store.put({ name: 'people', value: { schema: 'officejur/financeiro-pessoas-data', version: 1, updatedAt: now, records: [{ id: 'person-test', name: 'Cliente de teste', cpf: '529.982.247-25', birthDate: '1990-01-10', maritalStatus: 'solteiro', profession: 'comerciante', updatedAt: now }], deleted: [] } });
      store.put({ name: 'clients', value: { schema: 'officejur/financeiro-clientes-data', version: 2, updatedAt: now, records: [{ id: 'client-test', type: 'pf', personId: 'person-test', updatedAt: now }], deleted: [] } });
      store.put({ name: 'cases', value: { schema: 'officejur/financeiro-casos-data', version: 1, updatedAt: now, records: [{ id: 'case-test', clientId: 'client-test', title: 'Ação de teste', number: '0000000-00.2026.8.00.0000', type: 'Judicial', status: 'active', parties: [{ id: 'party-claimant', name: 'Cliente de teste', role: 'Reclamante' }, { id: 'party-respondent', name: 'Parte contrária de teste', role: 'Reclamada' }], updatedAt: now }], deleted: [] } });
      transaction.oncomplete = () => { database.close(); resolve(); };
      transaction.onerror = () => reject(transaction.error);
    };
  }));
  await page.goto(path, { waitUntil: 'networkidle' });
}

async function configureDataJudWorker(page) {
  await page.evaluate(() => {
    localStorage.setItem('officejur::financeiro::officejur::settings', JSON.stringify({ apiUrl: 'https://worker.example' }));
    sessionStorage.setItem('officejur::financeiro::officejur::session-key', 'chave-do-servico');
  });
  await page.reload({ waitUntil: 'networkidle' });
}

async function stubBcbIndices(page) {
  const requests = [];
  await page.route('https://api.bcb.gov.br/dados/serie/**', async route => {
    const url = new URL(route.request().url());
    const seriesId = url.pathname.match(/bcdata\.sgs\.(\d+)\/dados$/)?.[1];
    const initial = url.searchParams.get('dataInicial');
    const final = url.searchParams.get('dataFinal');
    requests.push({ seriesId, start: initial, end: final });
    const parseBcbDate = value => {
      const [, day, month, year] = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    };
    const cursor = parseBcbDate(initial);
    cursor.setUTCDate(1);
    const end = parseBcbDate(final);
    const rows = [];
    while (cursor <= end) {
      rows.push({
        data: `01/${String(cursor.getUTCMonth() + 1).padStart(2, '0')}/${cursor.getUTCFullYear()}`,
        valor: seriesId === '11' ? '0,20' : '0,10',
      });
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(rows) });
  });
  return requests;
}

test('cálculos usam cliente, caso e partes do mesmo contexto', async ({ page }) => {
  await prepareCalculationPage(page, 'calculos/trabalhista/');
  await page.locator('#clientId').selectOption('client-test');
  await expect(page.locator('#caseId')).toHaveValue('');
  await expect(page.locator('#clientPartyName')).toHaveValue('Cliente de teste');
  await page.locator('select[name="partyType"]').selectOption({ label: 'Reclamante' });
  await page.locator('#caseId').selectOption('case-test');
  await expect(page.locator('#caseNumber')).toHaveValue('0000000-00.2026.8.00.0000');
  await expect(page.locator('#clientPartyName')).toHaveValue('Cliente de teste');
  await expect(page.locator('input[name="opposingPartyName"]')).toHaveValue('');
  await page.locator('input[name="opposingPartyName"]').fill('Parte contrária preenchida');
  await expect(page.getByText('Parte contrária — Reclamada')).toBeVisible();

  await page.goto('calculos/completo/', { waitUntil: 'networkidle' });
  await page.locator('#clientId').selectOption('client-test');
  await expect(page.locator('#caseId')).toHaveValue('');
  await expect(page.locator('#clientPartyName')).toHaveValue('Cliente de teste');
  await page.locator('#caseId').selectOption('case-test');
  await expect(page.locator('#caseNumber')).toHaveValue('0000000-00.2026.8.00.0000');
  await expect(page.locator('#clientPartyName')).toHaveValue('Cliente de teste');
  await expect(page.locator('input[name="opposingPartyName"]')).toHaveValue('');
  const addGeneralParty = page.getByRole('button', { name: '＋ Adicionar parte adicional' });
  await expect(addGeneralParty).toBeVisible();
  await addGeneralParty.click();
  await addGeneralParty.click();
  await expect(page.locator('[data-additional-index]')).toHaveCount(2);
  await expect(page.locator('[data-additional-index="0"] [data-additional-field="source"]')).not.toContainText('Cliente de teste');
  await page.locator('[data-additional-index="0"] [data-additional-field="source"]').selectOption('case:party-respondent');
  await expect(page.locator('[data-additional-index="0"] [data-additional-field="name"]')).toHaveValue('Parte contrária de teste');
  await page.locator('[data-additional-index="1"] [data-additional-field="name"]').fill('Parte manual de teste');
  await page.locator('[data-additional-index="1"] [data-additional-field="role"]').fill('Assistente');
  await page.locator('#caseId').selectOption('');
  await expect(page.locator('[data-additional-index]')).toHaveCount(1);
  await expect(page.locator('[data-additional-index="0"] [data-additional-field="name"]')).toHaveValue('Parte manual de teste');

  await page.goto('calculos/pensao/', { waitUntil: 'networkidle' });
  await page.locator('#clientId').selectOption('client-test');
  await expect(page.locator('#caseId')).toHaveValue('');
  await expect(page.locator('#clientPartyName')).toHaveValue('Cliente de teste');
  await page.locator('#clientPartyRole').selectOption({ label: 'Executado / Devedor' });
  const addPensionParty = page.getByRole('button', { name: '＋ Adicionar parte adicional' });
  await expect(addPensionParty).toBeVisible();
  await page.locator('#caseId').selectOption('case-test');
  await expect(page.locator('#clientPartyName')).toHaveValue('Cliente de teste');
  await expect(page.locator('input[name="opposingPartyName"]')).toHaveValue('');
  await page.locator('input[name="opposingPartyName"]').fill('Credor preenchido');
  await expect(page.getByText('Parte contrária — Exequente / Credor')).toBeVisible();
});

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
  'arquivos/',
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

test('módulos sincronizáveis usam o mesmo estado de nuvem no cabeçalho', async ({ page }) => {
  const routes = [
    'financeiro/',
    'calculos/',
    'calculos/facil/',
    'calculos/completo/',
    'calculos/pensao/',
    'calculos/trabalhista/',
    'arquivos/',
    'lab/controle-pagamentos/',
    'lab/central-guias/',
  ];

  for (const route of routes) {
    await page.goto(route, { waitUntil: 'networkidle' });
    const status = page.locator('header office-cloud-status');
    await expect(status, `Indicador de nuvem ausente em ${route}`).toBeVisible();
    await expect(status).toHaveText('Somente neste navegador');
    await expect(page.locator('body')).not.toContainText(/Gist configurado|Gist sincronizado|sincronizad[oa]s? com o Gist/i);
  }
});

test('tema da instalação é aplicado à interface e aos documentos', async ({ page }) => {
  await page.goto('', { waitUntil: 'networkidle' });
  const interfaceTheme = await page.evaluate(() => ({
    configured: window.OFFICEJUR_CONFIG.theme.colors,
    primary: getComputedStyle(document.documentElement).getPropertyValue('--navy').trim(),
    accent: getComputedStyle(document.documentElement).getPropertyValue('--gold').trim(),
    browser: document.querySelector('meta[name="theme-color"]')?.content,
  }));
  expect(interfaceTheme.primary).toBe(interfaceTheme.configured.primary);
  expect(interfaceTheme.accent).toBe(interfaceTheme.configured.accent);
  expect(interfaceTheme.browser).toBe(interfaceTheme.configured.primary);

  await page.goto('documentos/procuracao/', { waitUntil: 'networkidle' });
  const documentTheme = await page.evaluate(() => ({
    configured: window.OFFICEJUR_CONFIG.theme.colors.pdfAccent,
    pdf: window.OFFICEJUR_DOCUMENT_CONFIG.pdf.colors.gold,
  }));
  const hex = documentTheme.configured.slice(1);
  expect(documentTheme.pdf).toEqual([
    Number.parseInt(hex.slice(0, 2), 16),
    Number.parseInt(hex.slice(2, 4), 16),
    Number.parseInt(hex.slice(4, 6), 16),
  ]);
});

test('headers com sincronização automática não exibem ação manual', async ({ page }) => {
  const synchronizedRoutes = [
    'calculos/',
    'calculos/facil/',
    'calculos/completo/',
    'calculos/pensao/',
    'calculos/trabalhista/',
    'financeiro/',
    'lab/controle-pagamentos/',
  ];
  for (const route of synchronizedRoutes) {
    await page.goto(route, { waitUntil: 'networkidle' });
    await expect(page.locator('.topbar #sync-now, .topbar #sync-retry')).toHaveCount(0);
    await expect(page.locator('.topbar').getByRole('button', { name: /^(Sincronizar|Tentar novamente)$/ })).toHaveCount(0);
  }
});

test('lease expirado bloqueia Cálculos antes de expor os dados e preserva a cópia para revalidação', async ({ page }) => {
  await page.goto('calculos/', { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    localStorage.setItem('officejur::calculos-juridicos::data', JSON.stringify({
      schema: 'officejur/calculos-juridicos-data', version: 1, updatedAt: new Date().toISOString(),
      records: [{ id: 'segredo', name: 'Cálculo confidencial', updatedAt: new Date().toISOString() }], deleted: []
    }));
    localStorage.setItem('officejur::gist-access-lease', JSON.stringify({
      version: 1, phase: 'active', gistId: 'gist-teste', expiresAt: Date.now() - 1, graceExpiresAt: 0, clearedModules: {}
    }));
  });
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.getByRole('alert')).toContainText('Acesso local bloqueado');
  await expect(page.locator('body')).not.toContainText('Cálculo confidencial');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('officejur::gist-access-lease'))).toContain('"stale"');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('officejur::calculos-juridicos::data'))).not.toBeNull();
});

const localAccessBlockedRoutes = [
  'calculos/',
  'calculos/facil/',
  'calculos/completo/',
  'calculos/pensao/',
  'calculos/trabalhista/',
  'financeiro/',
  'lab/controle-pagamentos/',
];
const blockedDescription = 'Os dados sincronizados estão protegidos e aguardam a revalidação autenticada da nuvem. Eles não serão exibidos até a confirmação do acesso.';

for (const route of localAccessBlockedRoutes) {
  test(`${route} padroniza o acesso local bloqueado`, async ({ page }) => {
    const runtimeErrors = [];
    page.on('pageerror', error => runtimeErrors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error') runtimeErrors.push(message.text());
    });
    await page.goto(route, { waitUntil: 'networkidle' });
    await page.evaluate(() => {
      localStorage.setItem('officejur::gist-access-lease', JSON.stringify({
        version: 2, phase: 'active', gistId: 'gist-teste', expiresAt: Date.now() - 1,
        graceExpiresAt: 0, resetForGistId: '', purgeId: 0,
      }));
    });
    await page.reload({ waitUntil: 'networkidle' });

    const alert = page.getByRole('alert');
    await expect(alert).toHaveCount(1);
    const title = alert.getByRole('heading', { name: 'Acesso local bloqueado', level: 1 });
    await expect(title).toBeVisible();
    await expect(title).toBeFocused();
    await expect(alert).toHaveAttribute('aria-labelledby', 'local-access-title');
    await expect(alert).toHaveAttribute('aria-describedby', 'local-access-description');
    await expect(alert).toContainText(blockedDescription);
    const settings = alert.getByRole('link', { name: 'Abrir Configurações' });
    await expect(settings).toHaveAttribute('href', /\/configuracoes\/$/);
    await expect(page.locator('.topbar')).toHaveCSS('height', '68px');
    await expect(page.locator('body')).toHaveClass(/local-access-blocked/);
    await expect(page.locator('.local-access-status')).toHaveAttribute('role', 'status');
    await expect(page.locator('.local-access-status')).toHaveAttribute('aria-live', 'polite');
    await expect(page.locator('.local-access-status')).toContainText('Acesso à nuvem bloqueado');
    await expect(page.getByRole('button', { name: 'Tentar novamente' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Sincronizar/ })).toHaveCount(0);
    await expect(page.locator('main')).toHaveCount(1);
    await expect(page.locator('.workspace, .shell, .sidebar, .people-pane, .detail-pane')).toHaveCount(0);
    await expect(page.locator('office-app-switcher')).toBeVisible();
    await expect(page.locator('office-site-footer')).toBeVisible();
    if (route === 'financeiro/') {
      await expect(page.locator('#mobile-menu-btn')).toBeHidden();
      await expect(page.locator('office-site-footer')).not.toHaveAttribute('sidebar', '');
    }
    await page.evaluate(() => {
      const container = document.querySelector('.local-access-page, .local-access-container');
      window.OfficeJurLocalAccessBlocked.render({
        container,
        settingsHref: new URL('configuracoes/', location.href).pathname,
        footer: document.querySelector('office-site-footer'),
      });
    });
    await expect(page.getByRole('alert')).toHaveCount(1);
    await page.waitForTimeout(100);
    await expect(page.getByRole('alert')).toHaveCount(1);
    const accessibility = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(accessibility.violations).toEqual([]);
    expect(runtimeErrors).toEqual([]);
  });
}

test('estado bloqueado permanece responsivo nas referências visuais', async ({ page }) => {
  const viewports = [
    { width: 1440, height: 900 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
    { width: 320, height: 568 },
  ];
  for (const viewport of viewports) {
    let visualReference;
    for (const route of ['calculos/', 'financeiro/', 'lab/controle-pagamentos/']) {
      await page.setViewportSize(viewport);
      await page.goto(route, { waitUntil: 'networkidle' });
      await page.evaluate(() => {
        localStorage.setItem('officejur::gist-access-lease', JSON.stringify({
          version: 2, phase: 'active', gistId: 'gist-teste', expiresAt: Date.now() - 1,
          graceExpiresAt: 0, resetForGistId: '', purgeId: 0,
        }));
      });
      await page.reload({ waitUntil: 'networkidle' });
      await expect(page.locator('.local-access-card')).toBeVisible();
      const layout = await page.evaluate(() => {
        const card = document.querySelector('.local-access-card');
        const title = card.querySelector('h1');
        const description = card.querySelector('p');
        const cta = card.querySelector('.local-access-primary');
        const cardStyle = getComputedStyle(card);
        const titleStyle = getComputedStyle(title);
        const descriptionStyle = getComputedStyle(description);
        const ctaStyle = getComputedStyle(cta);
        return ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        cardRect: card.getBoundingClientRect().toJSON(),
        canvas: getComputedStyle(document.body).backgroundColor,
        card: [cardStyle.padding, cardStyle.borderRadius, cardStyle.backgroundColor, cardStyle.boxShadow],
        title: [titleStyle.fontFamily, titleStyle.fontSize, titleStyle.lineHeight, titleStyle.color],
        description: [descriptionStyle.fontFamily, descriptionStyle.fontSize, descriptionStyle.lineHeight, descriptionStyle.color],
        cta: [ctaStyle.minHeight, ctaStyle.marginTop, ctaStyle.borderRadius, ctaStyle.backgroundColor, ctaStyle.color],
        footerWidth: document.querySelector('office-site-footer').getBoundingClientRect().width,
      });
      });
      expect(layout.scrollWidth).toBe(layout.clientWidth);
      expect(layout.cardRect.width).toBeLessThanOrEqual(viewport.width);
      expect(layout.footerWidth).toBe(viewport.width);
      const comparable = { ...layout, cardRect: { x: layout.cardRect.x, y: layout.cardRect.y, width: layout.cardRect.width } };
      if (!visualReference) visualReference = comparable;
      else expect(comparable).toEqual(visualReference);
      if (viewport.width <= 420) {
        await expect(page.getByRole('button', { name: 'Tentar novamente' })).toHaveCSS('min-width', '40px');
      }
    }
  }
});

test('retry recarrega a página e o seletor continua operável no bloqueio', async ({ page }) => {
  await page.goto('calculos/', { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.setItem('officejur::gist-access-lease', JSON.stringify({
    version: 2, phase: 'purged', gistId: 'gist-teste', expiresAt: 0,
    graceExpiresAt: 0, resetForGistId: '', purgeId: 1,
  })));
  await page.reload({ waitUntil: 'networkidle' });
  const switcher = page.locator('office-app-switcher');
  const launcher = switcher.getByRole('button', { name: /Abrir menu de sistemas/ });
  await launcher.click();
  await expect(switcher.getByRole('navigation', { name: 'Alternar sistema' })).toBeVisible();
  await page.keyboard.press('Escape');
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle' }),
    page.getByRole('button', { name: 'Tentar novamente' }).click(),
  ]);
  await expect(page.getByRole('alert')).toContainText('Acesso local bloqueado');
});

test('guard stale bloqueia antes de cada aplicativo ler ou remover o armazenamento protegido', async ({ page }) => {
  const cases = [
    ['calculos/', 'officejur::calculos-juridicos::data'],
    ['financeiro/', 'officejur::financeiro::sync-state'],
    ['lab/controle-pagamentos/', 'officejur::controle-pagamentos::data'],
    ['lab/controle-pagamentos/', 'officejur::controle-pagamentos::sync-state'],
  ];
  await page.addInitScript(({ protectedKeys }) => {
    const originalGetItem = Storage.prototype.getItem;
    const originalRemoveItem = Storage.prototype.removeItem;
    window.__officejurProtectedStorageEvents = [];
    Storage.prototype.getItem = function (key) {
      if (protectedKeys.includes(key)) window.__officejurProtectedStorageEvents.push(`read:${key}`);
      return originalGetItem.call(this, key);
    };
    Storage.prototype.removeItem = function (key) {
      if (protectedKeys.includes(key)) window.__officejurProtectedStorageEvents.push(`remove:${key}`);
      return originalRemoveItem.call(this, key);
    };
  }, { protectedKeys: [...new Set(cases.map(([, key]) => key))] });

  for (const [route, protectedKey] of cases) {
    await page.goto(route, { waitUntil: 'networkidle' });
    await page.evaluate(({ key }) => {
      localStorage.setItem(key, JSON.stringify({ secret: 'não deve ser lido' }));
      localStorage.setItem('officejur::gist-access-lease', JSON.stringify({
        version: 2, phase: 'active', gistId: 'gist-teste', expiresAt: Date.now() - 1,
        graceExpiresAt: 0, resetForGistId: '', purgeId: 0,
      }));
    }, { key: protectedKey });
    await page.reload({ waitUntil: 'networkidle' });
    const events = await page.evaluate(({ key }) =>
      window.__officejurProtectedStorageEvents.filter((event) => event.endsWith(key)), { key: protectedKey });
    expect(events).toEqual([]);
    await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), protectedKey)).not.toBeNull();
    await expect(page.getByRole('alert')).toContainText('Acesso local bloqueado');
  }
});

test('revogação definitiva remove o armazenamento protegido', async ({ page }) => {
  const protectedKey = 'officejur::calculos-juridicos::data';
  await page.goto('calculos/', { waitUntil: 'networkidle' });
  await page.evaluate((key) => {
    localStorage.setItem(key, JSON.stringify({ secret: 'deve ser removido' }));
    localStorage.setItem('officejur::gist-access-lease', JSON.stringify({
      version: 3, phase: 'purged', gistId: 'gist-teste', expiresAt: 0,
      graceExpiresAt: 0, resetForGistId: '', purgeId: 1,
    }));
  }, protectedKey);
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.getByRole('alert')).toContainText('Acesso local bloqueado');
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), protectedKey)).toBeNull();
});

test('calculadora interna usa o guard antes de carregar um registro protegido', async ({ page }) => {
  await page.goto('calculos/pensao/', { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    localStorage.setItem('officejur::calculos-juridicos::data', JSON.stringify({
      schema: 'officejur/calculos-juridicos-data', version: 1, updatedAt: new Date().toISOString(),
      records: [{ id: 'segredo', type: 'pension', name: 'Pensão confidencial', updatedAt: new Date().toISOString() }], deleted: []
    }));
    localStorage.setItem('officejur::gist-access-lease', JSON.stringify({
      version: 2, phase: 'active', gistId: 'gist-teste', expiresAt: Date.now() - 1, graceExpiresAt: 0, resetForGistId: '', purgeId: 0
    }));
  });
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.getByRole('alert')).toContainText('Acesso local bloqueado');
  await expect(page.locator('body')).not.toContainText('Pensão confidencial');
});

test('abas abertas convergem para stale sem remover a cópia local', async ({ context, page }) => {
  await page.goto('calculos/', { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    localStorage.setItem('officejur::calculos-juridicos::data', JSON.stringify({
      schema: 'officejur/calculos-juridicos-data', version: 1, updatedAt: new Date().toISOString(),
      records: [{ id: 'segredo', name: 'Cálculo confidencial', updatedAt: new Date().toISOString() }], deleted: []
    }));
    localStorage.setItem('officejur::gist-access-lease', JSON.stringify({
      version: 3, phase: 'active', gistId: 'gist-teste', expiresAt: Date.now() + 60_000, graceExpiresAt: 0, resetForGistId: '', purgeId: 0
    }));
  });
  const second = await context.newPage();
  await Promise.all([
    page.reload({ waitUntil: 'networkidle' }),
    second.goto('calculos/', { waitUntil: 'networkidle' }),
  ]);
  await page.evaluate(() => {
    const lease = JSON.parse(localStorage.getItem('officejur::gist-access-lease'));
    lease.expiresAt = Date.now() - 1;
    localStorage.setItem('officejur::gist-access-lease', JSON.stringify(lease));
    window.dispatchEvent(new StorageEvent('storage', { key: 'officejur::gist-access-lease', newValue: JSON.stringify(lease) }));
  });
  await expect(page.getByRole('alert')).toContainText('Acesso local bloqueado', { timeout: 5_000 });
  await expect(second.getByRole('alert')).toContainText('Acesso local bloqueado', { timeout: 5_000 });
  await expect(page.locator('body')).not.toContainText('Cálculo confidencial');
  await expect(second.locator('body')).not.toContainText('Cálculo confidencial');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('officejur::calculos-juridicos::data'))).not.toBeNull();
  await second.close();
});

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

test('Documentos começa vazio e exige vínculo com cliente', async ({ page }) => {
  await page.goto('arquivos/', { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { name: 'Biblioteca de arquivos', level: 1 })).toBeVisible();
  await expect(page.getByText('Nenhum arquivo na biblioteca')).toBeVisible();
  await page.getByRole('button', { name: 'Novo documento' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('#client-select')).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Criar documento' })).toBeDisabled();
});

test('Documentos cria DOCX com o modelo institucional da implantação', async ({ page }) => {
  await prepareCalculationPage(page, 'arquivos/');
  await page.getByRole('button', { name: 'Novo documento' }).click();
  await page.locator('#client-select').selectOption('client-test');
  await page.locator('#document-name').fill('Petição com timbre');
  await expect(page.locator('#institutional-template-field')).toBeVisible();
  await expect(page.locator('#institutional-template')).not.toBeChecked();
  const configuredOfficeName = await page.evaluate(() => window.OFFICEJUR_CONFIG.office.shortName);
  await expect(page.locator('#institutional-template-detail')).toContainText(configuredOfficeName);
  await page.locator('#document-type').selectOption('xlsx');
  await expect(page.locator('#institutional-template-field')).toBeHidden();
  await page.locator('#document-type').selectOption('docx');
  await expect(page.locator('#institutional-template-field')).toBeVisible();
  await page.locator('#institutional-template').check();
  await page.getByRole('button', { name: 'Criar documento' }).click();

  await expect.poll(() => page.evaluate(async () => {
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open('officejur-arquivos', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const records = await new Promise((resolve, reject) => {
      const request = database.transaction('documents', 'readonly').objectStore('documents').getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    database.close();
    const configured = window.OFFICEJUR_CONFIG.documents.institutionalDocxTemplate;
    const template = (await (await fetch(configured.base64Url)).text()).replace(/\s+/g, '');
    return records[0]?.source === 'institutional-template' && records[0]?.dataBase64 === template;
  })).toBe(true);
  await expect(page.locator('#office-status')).toContainText('Documento aberto para edição', { timeout: 30_000 });
  const office = page.frameLocator('#office-editor-frame').frameLocator('iframe');
  const printButton = office.locator('button:has(> i.icon--inverse.btn-print)');
  await expect(printButton).toBeEnabled({ timeout: 30_000 });
  await printButton.click();
  await expect(page.locator('#office-status')).toContainText(/Impressão aberta pelo OnlyOffice|Documento enviado para impressão/, { timeout: 60_000 });
  await expect(page.locator('#office-status')).not.toHaveClass(/error/);
});

test('Financeiro separa número, quadra e lote do logradouro', async ({ page }) => {
  await page.goto('financeiro/', { waitUntil: 'networkidle' });
  await page.locator('#quick-client').click();
  const street = page.locator('#client-form [name="street"]');

  await expect(street).toHaveAttribute('readonly', '');
  await expect(street).toHaveAttribute('placeholder', 'Preencha o CEP primeiro');
  await page.locator('#client-form [name="zip"]').fill('74000123');
  await expect(page.locator('#client-form [data-address-status]')).toContainText('Endereço localizado pelo CEP');
  await expect(street).not.toHaveAttribute('readonly', '');
  await street.fill('Rua das Flores Nº 10 QUADRA A lt 3');
  await expect(street).toHaveValue('Rua das Flores 10 A 3');
  await expect(page.locator('#street-warning')).toContainText('Preencha no campo Número');
  await expect(page.locator('#toast')).toContainText('Preencha no campo Número');

  await street.fill('Avenida Central');
  await expect(page.locator('#street-warning')).toBeHidden();
  await street.fill('Avenida Central qD. B');
  await expect(street).toHaveValue('Avenida Central B');
  await expect(page.locator('#street-warning')).toContainText('Preencha no campo Quadra');
});

test('Financeiro preenche o endereço por CEP e restringe cidade à lista do IBGE', async ({ page }) => {
  await page.goto('financeiro/', { waitUntil: 'networkidle' });
  await page.locator('#quick-client').click();
  const form = page.locator('#client-form');

  await form.locator('[name="zip"]').fill('74000123');
  await expect(form.locator('[data-address-status]')).toContainText('Endereço localizado pelo CEP');
  await expect(form.locator('[name="street"]')).toHaveValue('Avenida Central');
  await expect(form.locator('[name="neighborhood"]')).toHaveValue('Centro');
  await expect(form.locator('[name="state"]')).toHaveValue('GO');
  await expect(form.locator('[name="city"]')).toHaveValue('Goiânia');
  await expect(form.locator('[name="city"] option')).toHaveText([
    'Selecione a cidade',
    'Anápolis',
    'Goiânia',
    'Silvânia',
  ]);
});

test('Financeiro exige CEP antes de liberar logradouro em cliente e pessoa', async ({ page }) => {
  await page.goto('financeiro/', { waitUntil: 'networkidle' });
  await page.locator('#quick-client').click();
  const clientStreet = page.locator('#client-form [name="street"]');
  await expect(clientStreet).toHaveAttribute('readonly', '');
  await page.locator('#client-form [name="zip"]').fill('74000123');
  await expect(clientStreet).not.toHaveAttribute('readonly', '');
  await expect(clientStreet).toHaveAttribute('placeholder', 'Ex.: Rua das Flores');
  await expect(page.locator('#street-help')).toHaveText('Informe somente o tipo e o nome do logradouro.');

  await page.locator('#client-dialog .modal-head button[value="cancel"]').click();
  await expect(page.locator('#client-dialog')).not.toBeVisible();
  await page.locator('[data-view="clients"]').click();
  await page.locator('#open-people').click();
  await page.locator('#new-person').click();
  const personStreet = page.locator('#person-form [name="street"]');
  await expect(personStreet).toHaveAttribute('readonly', '');
  await page.locator('#person-form [name="zip"]').fill('74000123');
  await expect(personStreet).not.toHaveAttribute('readonly', '');
  await expect(personStreet).toHaveAttribute('placeholder', 'Ex.: Rua das Flores');
  await expect(page.locator('#person-street-help')).toHaveText('Informe somente o tipo e o nome do logradouro.');
});

test('Financeiro gerencia pessoas e organiza pacotes junto aos casos', async ({ page }) => {
  await prepareCalculationPage(page, 'financeiro/');

  await page.locator('[data-view="clients"]').click();
  await page.locator('#open-people').click();
  await expect(page.locator('#people-view')).toBeVisible();
  await expect(page.locator('[data-view="clients"]')).toHaveClass(/active/);
  const personRow = page.locator('.person-row').filter({ hasText: 'Cliente de teste' });
  await expect(personRow).toContainText('Cliente pessoa física');
  await expect(personRow.locator('[data-view-person]')).toBeVisible();
  await expect(personRow.locator('[data-promote-person]')).toHaveCount(0);
  await personRow.locator('[data-edit-person]').click();
  await page.locator('#person-form [name="email"]').fill('cliente@exemplo.com.br');
  await page.locator('#person-form').getByRole('button', { name: 'Salvar pessoa' }).click();
  await expect(personRow).toContainText('cliente@exemplo.com.br');

  await page.locator('#new-person').click();
  const personForm = page.locator('#person-form');
  await personForm.locator('[name="name"]').fill('Contato Futuro');
  await personForm.locator('[name="cpf"]').fill('111.444.777-35');
  await personForm.locator('[name="birthDate"]').fill('1992-05-20');
  await personForm.locator('[name="maritalStatus"]').fill('solteiro');
  await personForm.locator('[name="profession"]').fill('empresário');
  await personForm.locator('[name="phoneNational"]').fill('62999999999');
  await personForm.locator('[name="zip"]').fill('74000123');
  await expect(personForm.locator('[data-address-status]')).toContainText('Endereço localizado pelo CEP');
  await personForm.locator('[name="street"]').fill('Rua das Flores');
  await personForm.locator('[name="neighborhood"]').fill('Centro');
  await personForm.locator('[name="state"]').selectOption('GO');
  await personForm.locator('[name="city"]').selectOption('Silvânia');
  await personForm.getByRole('button', { name: 'Salvar pessoa' }).click();
  const futureRow = page.locator('.person-row').filter({ hasText: 'Contato Futuro' });
  await expect(futureRow).toContainText('Contato sem vínculo');
  await futureRow.locator('[data-promote-person]').click();
  await expect(page.locator('#client-modal-title')).toHaveText('Tornar pessoa cliente');
  await expect(page.locator('#client-form [name="personId"]')).toHaveValue(/.+/);
  await page.locator('#save-client').click();
  await expect(futureRow).toContainText('Cliente pessoa física');
  await expect(futureRow.locator('[data-promote-person]')).toHaveCount(0);

  await page.locator('[data-view="cases"]').click();
  await expect(page.locator('#contracts-hub-title')).toHaveText('Honorários dos casos');
  await expect(page.locator('#package-overview')).toHaveText('Nenhum pacote criado');
  await expect(page.locator('#packages-content')).toBeHidden();
  await page.locator('#toggle-packages').click();
  await expect(page.locator('#packages-content')).toBeVisible();
  await expect(page.locator('#packages-grid')).toContainText('Nenhum pacote cadastrado');
  await expect(page.locator('.case-card')).toContainText('Cliente de Teste');
  await expect(page.locator('.case-card')).not.toContainText('Cliente não encontrado');
  await page.locator('#new-package').click();
  await expect(page.locator('#package-dialog')).toBeVisible();
});

test('Financeiro consulta DataJud, libera o judicial e exibe movimentações', async ({ page }) => {
  const processNumber = '00008323520184013202';
  await page.route('https://worker.example/datajud/search', async route => {
    const request = route.request();
    expect(request.method()).toBe('POST');
    expect(request.headers().authorization).toBe('Bearer chave-do-servico');
    expect(request.postDataJSON()).toEqual({ path: '/api_publica_trf1/_search', number: processNumber });
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        hits: {
          hits: [{
            _source: {
              id: `TRF1_436_JE_16403_${processNumber}`,
              numeroProcesso: processNumber,
              tribunal: 'TRF1',
              classe: { codigo: 436, nome: 'Procedimento do Juizado Especial Cível' },
              sistema: { codigo: 1, nome: 'Pje' },
              formato: { codigo: 1, nome: 'Eletrônico' },
              grau: 'JE',
              dataAjuizamento: '2018-10-29T00:00:00.000Z',
              orgaoJulgador: { codigo: 16403, nome: 'JEF Adj - Tefé', codigoMunicipioIBGE: 5128 },
              assuntos: [{ codigo: 6177, nome: 'Concessão' }, { codigo: 6178, nome: 'Benefício' }],
              movimentos: [{ codigo: 26, nome: 'Distribuição', dataHora: '2018-10-30T14:06:24.000Z' }],
              nivelSigilo: 0,
              dataHoraUltimaAtualizacao: '2023-07-21T19:10:08.483Z',
            },
          }],
        },
      }),
    });
  });
  await prepareCalculationPage(page, 'financeiro/');
  await configureDataJudWorker(page);
  await page.locator('[data-view="cases"]').click();
  await page.locator('#new-case').click();
  const form = page.locator('#case-form');
  await form.locator('[name="clientId"]').selectOption('client-test');
  await expect(form.locator('[name="title"]')).toBeDisabled();
  await expect(form.locator('[name="contractScope"]')).toBeDisabled();
  await form.locator('[name="number"]').fill(processNumber);
  await expect(form.locator('[data-case-datajud-status]')).toContainText('Dados públicos carregados', { timeout: 10_000 });
  await expect(form.locator('[name="title"]')).toBeEnabled();
  await expect(form.locator('[name="title"]')).toHaveValue('Procedimento do Juizado Especial Cível · Concessão e outros assuntos');
  await expect(form.locator('#case-datajud-panel')).toBeVisible();
  await expect(form.locator('[data-datajud-field="tribunal"]')).toContainText('TRF1');
  await form.getByRole('button', { name: 'Salvar caso' }).click();

  const card = page.locator('.case-card').filter({ hasText: 'Procedimento do Juizado Especial Cível · Concessão e outros assuntos' });
  await card.locator('[data-view-case]').click();
  await expect(page.locator('#detail-dialog')).toBeVisible();
  await page.getByRole('tab', { name: /Movimentações/ }).click();
  await expect(page.locator('[data-case-panel="movements"]')).toContainText('Distribuição');
  await expect(page.locator('[data-case-panel="movements"]')).toContainText('podem estar atrasadas');
});

test('Financeiro libera edição manual quando o Worker não está configurado', async ({ page }) => {
  await prepareCalculationPage(page, 'financeiro/');
  await page.locator('[data-view="cases"]').click();
  await page.locator('#new-case').click();
  const form = page.locator('#case-form');
  await form.locator('[name="clientId"]').selectOption('client-test');
  await form.locator('[name="number"]').fill('00008323520184013202');
  await expect(form.locator('[data-case-datajud-status]')).toContainText('Consulta DataJud não configurada', { timeout: 10_000 });
  await expect(form.locator('[name="title"]')).toBeEnabled();
  await expect(form.getByRole('button', { name: 'Salvar caso' })).toBeEnabled();
});

test('Financeiro mantém o judicial bloqueado quando o Worker configurado falha', async ({ page }) => {
  await page.route('https://worker.example/datajud/search', route => route.abort('failed'));
  await prepareCalculationPage(page, 'financeiro/');
  await configureDataJudWorker(page);
  await page.locator('[data-view="cases"]').click();
  await page.locator('#new-case').click();
  const form = page.locator('#case-form');
  await form.locator('[name="clientId"]').selectOption('client-test');
  await form.locator('[name="number"]').fill('00008323520184013202');
  await expect(form.locator('[data-case-datajud-status]')).toContainText('Não foi possível acessar o proxy DataJud', { timeout: 10_000 });
  await expect(form.locator('[name="title"]')).toBeDisabled();
  await expect(form.getByRole('button', { name: 'Salvar caso' })).toBeDisabled();
});

test('Financeiro gera recibo em PDF ao registrar pagamento', async ({ page }) => {
  await prepareCalculationPage(page, 'financeiro/');
  await page.locator('#new-entry').click();
  const form = page.locator('#entry-form');
  await form.locator('[name="description"]').fill('Pagamento de honorários');
  await form.locator('[name="amount"]').fill('500,00');
  await form.locator('[name="clientId"]').selectOption('client-test');
  await form.locator('[name="status"]').selectOption('paid');
  await form.locator('[name="paidDate"]').fill('2026-08-11');
  await expect(page.locator('#receipt-option')).toBeVisible();
  await page.locator('#generate-receipt').check();
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#save-entry').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^recibo-2026-.*Cliente-de-teste\.pdf$/);
  await expect(page.locator('#toast')).toContainText('Recibo gerado em PDF');
});

test('Financeiro avisa ao preencher CPF já cadastrado', async ({ page }) => {
  await prepareCalculationPage(page, 'financeiro/');
  await page.locator('#quick-client').click();
  const clientForm = page.locator('#client-form');
  await clientForm.locator('[name="document"]').fill('529.982.247-25');
  await expect(page.locator('#client-cpf-warning')).toBeVisible();
  await expect(page.locator('#client-cpf-warning')).toHaveText('Já existe um cliente cadastrado com este CPF.');
  await expect(clientForm.locator('[name="document"]')).toHaveAttribute('aria-invalid', 'true');
  await clientForm.getByRole('button', { name: 'Cancelar' }).click();

  await page.locator('[data-view="clients"]').click();
  await page.locator('#open-people').click();
  await page.locator('#new-person').click();
  const personForm = page.locator('#person-form');
  await personForm.locator('[name="cpf"]').fill('529.982.247-25');
  await expect(page.locator('#person-cpf-warning')).toBeVisible();
  await expect(page.locator('#person-cpf-warning')).toHaveText('Já existe uma pessoa cadastrada com este CPF.');
  await expect(personForm.locator('[name="cpf"]')).toHaveAttribute('aria-invalid', 'true');
});

test('Financeiro aceita CNPJ alfanumérico e pré-preenche a pessoa jurídica', async ({ page }) => {
  await page.route('https://api.opencnpj.org/12ABC34501DE35', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      cnpj: '12ABC34501DE35',
      razao_social: 'EMPRESA ALFANUMERICA LTDA',
      nome_fantasia: 'ALFA NOVA',
      natureza_juridica: 'Sociedade Empresária Limitada',
      telefones: [{ ddd: '62', numero: '999999999', is_fax: false }],
      email: 'contato@alfanova.example',
      logradouro: 'Avenida Central',
      numero: '123',
      complemento: 'Sala 4',
      bairro: 'Centro',
      cep: '',
      uf: 'GO',
      municipio: 'Goiânia',
      situacao_cadastral: 'Ativa',
    }),
  }));
  await page.route('https://servicodados.ibge.gov.br/api/v1/localidades/estados/GO/municipios?orderBy=nome', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify([{ nome: 'Goiânia' }]),
  }));
  await page.goto('financeiro/', { waitUntil: 'networkidle' });
  await page.locator('#quick-client').click();
  const form = page.locator('#client-form');
  await form.locator('[name="type"]').selectOption('pj');
  await expect(form.locator('[name="legalName"]')).toBeDisabled();
  await expect(page.locator('#save-client')).toBeDisabled();
  await form.locator('[name="cnpj"]').fill('12abc34501de35');

  await expect(form.locator('[name="cnpj"]')).toHaveValue('12.ABC.345/01DE-35');
  await expect(form.locator('[name="legalName"]')).toHaveValue('EMPRESA ALFANUMERICA LTDA');
  await expect(form.locator('[name="tradeName"]')).toHaveValue('ALFA NOVA');
  await expect(form.locator('[name="legalNature"]')).toHaveValue('Sociedade Empresária Limitada');
  await expect(form.locator('[name="phoneNational"]')).toHaveValue(/9999/);
  await expect(form.locator('[name="addressNumber"]')).toHaveValue('123');
  await expect(form.locator('[name="city"]')).toHaveValue('Goiânia');
  await expect(form.locator('[data-cnpj-status]')).toContainText('Dados públicos carregados');
  await expect(form.locator('[data-cnpj-status]')).toContainText('Situação cadastral: Ativa');
  await expect(form.locator('[name="legalName"]')).toBeEnabled();
  await expect(page.locator('#save-client')).toBeEnabled();

  await form.locator('[name="cnpj"]').fill('12ABC34501DE36');
  await expect(form.locator('#client-cnpj-warning')).toHaveText(/CNPJ inválido/);
  await expect(form.locator('[name="cnpj"]')).toHaveAttribute('aria-invalid', 'true');
});

test('Financeiro filtra e ordena a carteira de clientes', async ({ page }) => {
  await prepareCalculationPage(page, 'financeiro/');
  await page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('officejur-financeiro', 2);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction('domains-v2', 'readwrite');
      const store = transaction.objectStore('domains-v2');
      const now = new Date().toISOString();
      store.put({ name: 'clients', value: { schema: 'officejur/financeiro-clientes-data', version: 2, updatedAt: now, records: [
        { id: 'client-test', type: 'pf', personId: 'person-test', updatedAt: now },
        { id: 'client-company', type: 'pj', legalName: 'Empresa Alfa Ltda', tradeName: 'Alfa', cnpj: '04.252.011/0001-10', city: 'Anápolis', state: 'GO', updatedAt: now },
      ], deleted: [] } });
      store.put({ name: 'entries', value: { schema: 'officejur/financeiro-lancamentos-data', version: 1, updatedAt: now, records: [
        { id: 'entry-settled', clientId: 'client-test', kind: 'income', description: 'Honorários quitados', category: 'Honorários fixos', amount: 500, paidAmount: 500, dueDate: '2026-01-10', paidDate: '2026-01-10', status: 'paid', updatedAt: now },
        { id: 'entry-overdue', clientId: 'client-company', kind: 'income', description: 'Honorários em atraso', category: 'Honorários fixos', amount: 1000, paidAmount: 0, dueDate: '2026-01-10', paidDate: '', status: 'pending', updatedAt: now },
      ], deleted: [] } });
      transaction.oncomplete = () => { database.close(); resolve(); };
      transaction.onerror = () => reject(transaction.error);
    };
  }));
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('[data-view="clients"]').click();

  const names = page.locator('#clients-grid .client-card h3');
  await expect(names).toHaveText(['Cliente de teste', 'Empresa Alfa Ltda']);
  await page.locator('#client-order').selectOption('name-desc');
  await expect(names).toHaveText(['Empresa Alfa Ltda', 'Cliente de teste']);

  await page.locator('#client-financial-filter').selectOption('overdue');
  await expect(names).toHaveText(['Empresa Alfa Ltda']);
  await expect(page.locator('#client-filter-summary')).toHaveText('Exibindo 1 de 2 clientes.');

  await page.locator('#clear-client-filters').click();
  await page.locator('#client-type-filter').selectOption('pf');
  await expect(names).toHaveText(['Cliente de teste']);
  await page.locator('#client-type-filter').selectOption('');
  await page.locator('#client-city-filter').selectOption({ label: 'Anápolis/GO' });
  await expect(names).toHaveText(['Empresa Alfa Ltda']);
});

test('Financeiro cadastra pessoa jurídica com representante reutilizável', async ({ page }) => {
  await page.route('https://api.opencnpj.org/04252011000110', route => route.fulfill({
    status: 404,
    contentType: 'application/json',
    body: JSON.stringify({ error: 'not_found' }),
  }));
  await page.goto('financeiro/', { waitUntil: 'networkidle' });
  await page.locator('#quick-client').click();
  const clientForm = page.locator('#client-form');
  await clientForm.locator('[name="type"]').selectOption('pj');
  await expect(clientForm.locator('[name="legalName"]')).toBeDisabled();
  await clientForm.locator('[name="cnpj"]').fill('04.252.011/0001-10');
  await expect(clientForm.locator('[data-cnpj-status]')).toContainText('campos foram liberados para preenchimento manual');
  await expect(clientForm.locator('[name="legalName"]')).toBeEnabled();
  await clientForm.locator('[name="legalName"]').fill('Empresa Exemplo Ltda');
  await clientForm.locator('[name="tradeName"]').fill('Empresa Exemplo');
  await clientForm.locator('[name="phoneNational"]').fill('62999999999');
  await clientForm.locator('[name="zip"]').fill('74000123');
  await expect(clientForm.locator('[data-address-status]')).toContainText('Endereço localizado pelo CEP');
  await clientForm.locator('[name="street"]').fill('Avenida Central');
  await clientForm.locator('[name="neighborhood"]').fill('Centro');
  await clientForm.locator('[name="state"]').selectOption('GO');
  await clientForm.locator('[name="city"]').selectOption('Goiânia');

  await page.locator('#new-representative-person').click();
  const personForm = page.locator('#person-form');
  await personForm.locator('[name="name"]').fill('Maria da Silva');
  await personForm.locator('[name="cpf"]').fill('529.982.247-25');
  await personForm.locator('[name="birthDate"]').fill('1990-01-10');
  await personForm.locator('[name="maritalStatus"]').fill('casada');
  await personForm.locator('[name="profession"]').fill('administradora');
  await personForm.getByRole('button', { name: 'Salvar pessoa' }).click();

  await page.locator('#new-representative-person').click();
  await personForm.locator('[name="name"]').fill('João de Souza');
  await personForm.locator('[name="cpf"]').fill('111.444.777-35');
  await personForm.locator('[name="birthDate"]').fill('1988-05-20');
  await personForm.locator('[name="maritalStatus"]').fill('casado');
  await personForm.locator('[name="profession"]').fill('diretor');
  await personForm.getByRole('button', { name: 'Salvar pessoa' }).click();

  const representatives = page.locator('.representative-row');
  await expect(representatives).toHaveCount(2);
  await representatives.nth(0).locator('[data-representative="role"]').fill('Administradora');
  await representatives.nth(1).locator('[data-representative="role"]').fill('Diretor');
  await expect(representatives.nth(0).locator('[data-representative="isPrimary"]')).toBeChecked();
  await expect(representatives.nth(0).locator('[data-representative="isSigner"]')).toBeChecked();
  await expect(representatives.nth(1).locator('[data-representative="isSigner"]')).toBeChecked();
  await clientForm.getByRole('button', { name: 'Salvar cliente' }).click();

  await page.locator('[data-view="clients"]').click();
  const clientCard = page.locator('.client-card').filter({ hasText: 'Empresa Exemplo Ltda' });
  await expect(clientCard).toBeVisible();
  const saved = await page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('officejur-financeiro', 2);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction('domains-v2', 'readonly');
      const store = transaction.objectStore('domains-v2');
      const peopleRequest = store.get('people'), clientsRequest = store.get('clients');
      transaction.oncomplete = () => {
        database.close();
        resolve({ people: peopleRequest.result?.value?.records || [], clients: clientsRequest.result?.value?.records || [] });
      };
      transaction.onerror = () => reject(transaction.error);
    };
  }));
  expect(saved.people).toHaveLength(2);
  expect(saved.clients).toHaveLength(1);
  expect(saved.clients[0]).toMatchObject({ type: 'pj', legalName: 'Empresa Exemplo LTDA', cnpj: '04.252.011/0001-10' });
  expect(saved.clients[0].representatives[0]).toMatchObject({ personId: saved.people[0].id, role: 'Administradora', isPrimary: true, isSigner: true });
  expect(saved.clients[0].representatives[1]).toMatchObject({ personId: saved.people[1].id, role: 'Diretor', isPrimary: false, isSigner: true });

  await clientCard.locator('.document-menu > summary').click();
  const popupPromise = page.waitForEvent('popup');
  await clientCard.locator('[data-document-type="procuracao"]').click();
  const generator = await popupPromise;
  await generator.waitForLoadState('networkidle');
  await expect(generator.locator('[name="people.0.companyName"]')).toHaveValue('Empresa Exemplo LTDA');
  await expect(generator.locator('.representatives-summary')).toContainText('Maria da Silva; João de Souza');
  const transferredRepresentatives = await generator.evaluate(() => {
    const draft = JSON.parse(localStorage.getItem('officejur::documentos::procuracao::draft') || '{}');
    return draft.people?.[0]?.representatives || [];
  });
  expect(transferredRepresentatives).toHaveLength(2);
  await generator.close();

  await clientCard.locator('.document-menu > summary').click();
  const contractPopupPromise = page.waitForEvent('popup');
  await clientCard.locator('[data-document-type="honorarios"]').click();
  const contract = await contractPopupPromise;
  await contract.waitForLoadState('networkidle');
  await expect(contract.locator('[name="people.0.companyName"]')).toHaveValue('Empresa Exemplo LTDA');
  await expect(contract.locator('.representatives-summary')).toContainText('Maria da Silva; João de Souza');
  const contractRepresentatives = await contract.evaluate(() => {
    const draft = JSON.parse(localStorage.getItem('officejur::documentos::honorarios::draft') || '{}');
    return draft.people?.[0]?.representatives || [];
  });
  expect(contractRepresentatives).toHaveLength(2);
  await contract.close();

  await page.goto('arquivos/', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Novo documento' }).click();
  await expect(page.locator('#client-select option', { hasText: 'Empresa Exemplo LTDA' })).toHaveCount(1);
  await page.keyboard.press('Escape');

  await page.goto('calculos/facil/', { waitUntil: 'networkidle' });
  const linkedClients = await page.evaluate(async () => {
    const finance = await window.OfficeJurCalculationFinance.load();
    return finance.clients.map(client => ({ id: client.id, name: client.name, document: client.document }));
  });
  expect(linkedClients).toEqual([{ id: saved.clients[0].id, name: 'Empresa Exemplo LTDA', document: '04.252.011/0001-10' }]);
});

test('Documentos vincula cliente, organiza a pasta e salva CSV', async ({ page }) => {
  await prepareCalculationPage(page, 'arquivos/');
  await page.getByRole('button', { name: 'Novo documento' }).click();
  await page.locator('#client-select').selectOption('client-test');
  await page.locator('#document-name').fill('Planilha de teste');
  await page.locator('#document-type').selectOption('csv');
  await page.getByRole('button', { name: 'Criar documento' }).click();
  await expect(page.getByRole('region', { name: 'Biblioteca de documentos' }).getByText('Cliente de teste', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Abrir Planilha de teste/ })).toBeVisible();
  await expect(page.locator('#editor-dialog')).toBeVisible();
  await page.locator('#csv-content').fill('Nome;Valor\nTeste;10');
  await expect(page.locator('#autosave-toggle')).toBeChecked();
  await expect(page.locator('#office-status')).toContainText('Salvo automaticamente', { timeout: 15_000 });
  await expect(page.locator('#csv-preview')).toContainText('Teste');
  await page.locator('#close-editor').click();
  await expect(page.locator('[data-rename-id]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Abrir Planilha de teste' }).click();
  await page.locator('#editor-name-trigger').click();
  await page.getByRole('textbox', { name: 'Novo nome do arquivo' }).fill('Planilha renomeada');
  await page.locator('#editor-name-form').getByRole('button', { name: 'Salvar nome' }).click();
  await page.locator('#close-editor').click();
  await expect(page.getByRole('button', { name: /Abrir Planilha renomeada/ })).toBeVisible();
});

test('Documentos abre o OnlyOffice em modal amplo e permite renomear durante a edição', async ({ page }) => {
  await prepareCalculationPage(page, 'arquivos/');
  await page.getByRole('button', { name: 'Novo documento' }).click();
  await page.locator('#client-select').selectOption('client-test');
  await page.locator('#document-name').fill('Rascunho');
  await page.locator('#document-type').selectOption('docx');
  await page.getByRole('button', { name: 'Criar documento' }).click();
  await expect(page.locator('#editor-dialog')).toBeVisible();
  const modalRatio = await page.locator('#editor-dialog').evaluate((dialog) => dialog.getBoundingClientRect().width / window.innerWidth);
  expect(modalRatio).toBeCloseTo(0.9, 2);
  await expect(page.locator('#office-editor-frame')).toBeVisible();
  await expect(page.locator('#office-status')).toContainText('Documento aberto para edição', { timeout: 30_000 });
  const officeHost = page.frameLocator('#office-editor-frame');
  const officeFrame = officeHost.locator('iframe');
  const office = officeHost.frameLocator('iframe');
  await expect(office.getByText('Página Inicial', { exact: true })).toBeVisible({ timeout: 30_000 });
  await page.locator('#autosave-toggle').uncheck();
  await expect(page.locator('#editor-name')).toBeHidden();
  await page.locator('#editor-name-trigger').click();
  await page.locator('#editor-name').fill('Rascunho revisado');
  await page.locator('#editor-name-form').getByRole('button', { name: 'Salvar nome' }).click();
  await expect(page.getByText('Arquivo renomeado para “Rascunho revisado”.')).toBeVisible();
  await expect(page.locator('#editor-name-trigger')).toHaveText('Rascunho revisado');
  await expect(office.locator('#title-doc-name')).toHaveValue('Rascunho revisado.docx');
  await expect(officeFrame).toBeFocused();
  await expect(office.locator('#area_id')).toBeFocused();
  await expect(office.locator('#editor_sdk')).toHaveAttribute('data-ranuts-focus-recovery', 'ready');
  await page.keyboard.type('Teste de foco');
  await expect(page.locator('#office-status')).toContainText('Alterações pendentes', { timeout: 10_000 });
  await page.locator('#editor-name-trigger').click();
  await page.locator('#cancel-editor-name').click();
  await expect(officeFrame).toBeFocused();
  await expect(office.locator('#area_id')).toBeFocused();
  await page.keyboard.type(' após cancelar');
  const nativeButton = (name) => office.locator(`button:has(> i.icon--inverse.btn-${name})`);
  await expect(nativeButton('undo')).toBeEnabled();
  await nativeButton('undo').click();
  await expect(nativeButton('redo')).toBeEnabled();
  await nativeButton('redo').click();
  await expect(nativeButton('print')).toBeEnabled({ timeout: 30_000 });
  await nativeButton('print').click();
  await expect(page.locator('#office-status')).toContainText(/Impressão aberta pelo OnlyOffice|Documento enviado para impressão/, { timeout: 60_000 });
  await office.locator('a[data-tab="file"]').click();
  await expect(office.locator('#file-menu-panel')).toBeVisible();
  await office.locator('#fm-btn-return').click();
  await nativeButton('save').click();
  await expect(page.getByText('Alterações salvas neste navegador.')).toBeVisible();
  await expect(officeFrame).toBeFocused();
  await expect(office.locator('#area_id')).toBeFocused();
  await page.keyboard.type(' depois de salvar');
  await expect(page.locator('#office-status')).toContainText('Alterações pendentes', { timeout: 10_000 });
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('#delete-document').click();
  await expect(page.getByText('Nenhum arquivo na biblioteca')).toBeVisible();
});

test('Documentos exige três confirmações para limpar a biblioteca', async ({ page }) => {
  await prepareCalculationPage(page, 'arquivos/');
  for (const name of ['Rascunho um', 'Rascunho dois']) {
    await page.getByRole('button', { name: 'Novo documento' }).click();
    await page.locator('#client-select').selectOption('client-test');
    await page.locator('#document-name').fill(name);
    await page.getByRole('button', { name: 'Criar documento' }).click();
    await page.locator('#close-editor').click();
  }
  await expect(page.locator('#document-count')).toHaveText('2');
  let confirmations = 0;
  page.on('dialog', async (dialog) => {
    confirmations += 1;
    await dialog.accept(dialog.type() === 'prompt' ? 'APAGAR' : undefined);
  });
  await page.locator('#clear-library').click();
  await expect(page.getByText('Biblioteca apagada deste navegador.')).toBeVisible();
  expect(confirmations).toBe(3);
  await expect(page.getByText('Nenhum arquivo na biblioteca')).toBeVisible();
  await expect(page.locator('#clear-library')).toBeDisabled();
});

test('Documentos importa formato detectado, salva Base64 e reabre DOCX', async ({ page }) => {
  await prepareCalculationPage(page, 'arquivos/');
  await page.getByRole('button', { name: 'Importar arquivo' }).click();
  await page.locator('#client-select').selectOption('client-test');
  await page.locator('#document-file').setInputFiles({
    name: 'peticao.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    buffer: minimalDocx({ paragraphs: ['OfficeJur WASM', 'Segundo parágrafo'] }),
  });
  await expect(page.locator('#document-type')).toBeHidden();
  await page.getByRole('button', { name: 'Importar arquivo' }).last().click();
  await expect(page.locator('#office-status')).toContainText('Documento aberto para edição', { timeout: 30_000 });
  const stored = await page.evaluate(async () => {
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open('officejur-arquivos', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const records = await new Promise((resolve, reject) => {
      const request = database.transaction('documents', 'readonly').objectStore('documents').getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    database.close();
    return records[0];
  });
  expect(typeof stored.dataBase64).toBe('string');
  expect(stored.dataBase64.length).toBeGreaterThan(20);
  expect(stored.file).toBeUndefined();
  expect(stored.originalFile).toBeUndefined();
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /Abrir peticao/ }).click();
  await expect(page.locator('#office-status')).toContainText('Documento aberto para edição', { timeout: 30_000 });
  await expect(page.locator('#office-editor-frame')).toBeVisible();
});

test('Documentos abre XLSX e PPTX no mesmo editor', async ({ page }) => {
  const fixtures = [
    { extension: 'xlsx', name: 'planilha.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', text: 'OfficeJur XLSX', buffer: minimalXlsx('OfficeJur XLSX') },
    { extension: 'pptx', name: 'apresentacao.pptx', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', text: 'OfficeJur PPTX', buffer: minimalPptx('OfficeJur PPTX') },
  ];

  await prepareCalculationPage(page, 'arquivos/');
  for (const fixture of fixtures) {
    await page.getByRole('button', { name: 'Importar arquivo' }).click();
    await page.locator('#client-select').selectOption('client-test');
    await page.locator('#document-file').setInputFiles({ name: fixture.name, mimeType: fixture.mimeType, buffer: fixture.buffer });
    await page.getByRole('button', { name: 'Importar arquivo' }).last().click();
    await expect(page.locator('#office-editor-frame')).toBeVisible();
    await expect(page.locator('#office-status')).toContainText('Documento aberto para edição', { timeout: 30_000 });
    await page.locator('#close-editor').click();
    await expect(page.getByRole('button', { name: new RegExp(`Abrir ${fixture.name.replace(/\.[^.]+$/, '')}`) })).toBeVisible();
  }
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

test('honorários exibe a cláusula de inteligência artificial na ordem correta', async ({ page }) => {
  const runtimeErrors = [];
  page.on('pageerror', error => runtimeErrors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') runtimeErrors.push(message.text());
  });

  await page.goto('documentos/honorarios/', { waitUntil: 'networkidle' });
  await expect(page.getByRole('button', { name: 'Mostrar cláusulas contratuais (19)' })).toBeVisible();
  await page.getByRole('button', { name: 'Mostrar cláusulas contratuais (19)' }).click();

  const clauseTitles = await page.locator('.clause-head > span').evaluateAll(spans =>
    spans.map(span => span.firstChild.textContent.trim()));
  expect(clauseTitles).toEqual([
    '1. DO OBJETO',
    '2. DOS HONORÁRIOS',
    '3. DO INADIMPLEMENTO E SUSPENSÃO DA ATUAÇÃO',
    '4. DA CIÊNCIA, ADEQUAÇÃO E LIVRE PACTUAÇÃO',
    '5. DAS DESPESAS',
    '6. DAS OBRIGAÇÕES DO CONTRATANTE',
    '7. DO ACORDO OU RECEBIMENTO DIRETO',
    '8. DA EXCLUSIVIDADE',
    '9. DA RESCISÃO',
    '10. DA IRREVOGABILIDADE E IRRETRATABILIDADE',
    '11. DO LEVANTAMENTO DE VALORES',
    '12. DA PROTEÇÃO DE DADOS',
    '13. DO COMPARTILHAMENTO DE DADOS',
    '14. DO SIGILO PROFISSIONAL',
    '15. DO USO DE INTELIGÊNCIA ARTIFICIAL',
    '16. DO SUBSTABELECIMENTO',
    '17. DA VIGÊNCIA',
    '18. DAS DISPOSIÇÕES GERAIS',
    '19. DO FORO',
  ]);

  const aiClause = page.locator('.clause-item').nth(14);
  await expect(aiClause.locator('textarea')).toHaveValue('O CONTRATANTE declara ciência e consente expressamente que a CONTRATADA utilize ferramentas de inteligência artificial, inclusive generativa, como apoio à execução dos serviços contratados, inclusive para pesquisa, análise, organização, revisão e elaboração de documentos e comunicações relacionadas ao objeto deste contrato. A utilização observará as cláusulas de proteção de dados, compartilhamento de dados e sigilo profissional deste instrumento; o CONTRATANTE está ciente de que os resultados podem conter imprecisões e não substituirão a análise dos advogados, que permanecerão responsáveis pelo conteúdo final e pelas orientações prestadas. O CONTRATANTE poderá solicitar, por escrito, que a IA não seja utilizada em atividade específica, hipótese em que a CONTRATADA avaliará alternativa compatível.');
  expect(runtimeErrors).toEqual([]);
});

test('seletor e portal exibem os aplicativos em ordem alfabética', async ({ page }) => {
  await page.goto('', { waitUntil: 'networkidle' });
  const switcher = page.locator('office-app-switcher').first();
  await switcher.getByRole('button', { name: /Abrir menu de sistemas/ }).click();
  const appNames = await switcher.locator('.name').allTextContents();
  expect(appNames).toEqual([
    'Início',
    'Arquivos',
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
    'Biblioteca de Arquivos',
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
    await expect(page.locator('.shell')).toBeVisible();
    await expect(page.locator('.sidebar')).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
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

test('Financeiro mantém header e barra lateral alinhados durante o scroll', async ({ page }) => {
  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('financeiro/', { waitUntil: 'networkidle' });
    await expect(page.locator('.shell')).toBeVisible();
    await expect(page.locator('.sidebar')).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await page.evaluate(() => window.scrollTo(0, 240));

    const layout = await page.evaluate(() => {
      const header = document.querySelector('.topbar');
      const sidebar = document.querySelector('.sidebar');
      return {
        documentOverflowX: getComputedStyle(document.documentElement).overflowX,
        headerTop: Math.round(header.getBoundingClientRect().top),
        headerBottom: Math.round(header.getBoundingClientRect().bottom),
        sidebarTop: Math.round(sidebar.getBoundingClientRect().top),
        viewportWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      };
    });

    expect(layout.documentOverflowX).toBe('clip');
    expect(layout.headerTop).toBe(0);
    expect(layout.scrollWidth).toBe(layout.viewportWidth);
    if (viewport.width > 720) {
      expect(layout.headerBottom).toBe(68);
      expect(layout.sidebarTop).toBe(68);
    } else {
      expect(layout.sidebarTop).toBe(68);
    }
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
  await page.locator('#clientId').selectOption('client-test');
  await page.getByLabel('Caso / processo (opcional)').selectOption('case-test');
  await page.locator('#clientPartyRole').selectOption({ label: 'Exequente / Credor' });
  await page.getByLabel(/Parte contrária — Executado \/ Devedor/).fill('Devedor de teste');
  await page.getByLabel('Número do processo').fill('0000000-00.2026.8.00.0000');
  await page.getByLabel('Valor mensal (R$)').fill('500');
  await page.getByRole('button', { name: 'Próximo' }).click();
  await expect(page.locator('.wizard-steps.steps-4 .wizard-step.done')).toHaveCount(1);
  await expect(page.locator('.wizard-steps .wizard-step.active')).toContainText('Parcelas');
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
  await page.getByRole('button', { name: 'Finalizar' }).click();
  await expect(page).toHaveURL(/calculos\/$/);
});

test('atualização monetária simples calcula uma parcela e exibe a memória', async ({ page }) => {
  await prepareCalculationPage(page);
  await expect(page.locator('.calculator-card').filter({ hasText: 'Atualização monetária' })).toHaveCount(2);
  const icons = await page.locator('.calculator-card').evaluateAll(cards => cards.slice(0, 2).map(card => card.querySelector('.icon svg')?.innerHTML));
  expect(new Set(icons).size).toBe(2);
  await page.locator('.calculator-card').filter({ hasText: 'Atualização monetária simples' }).getByRole('link', { name: 'Iniciar cálculo' }).click();
  const wizard = page.locator('.panel.wizard-head');
  await expect(wizard).toHaveCount(1);
  await expect(wizard.locator('.eyebrow')).toHaveText('Generalista');
  await expect(wizard.getByRole('heading', { name: 'Atualização monetária simples' })).toBeVisible();
  await expect(wizard.locator('.hint').first()).toContainText(/OJ-GEN-.*• versão generic-1\.2\.0/);
  await expect(page.getByText('Ajuda e sugestões')).toHaveCount(0);
  await expect(page.locator('.generic-heading, .generic-wizard, .generic-card, .generic-summary')).toHaveCount(0);
  await expect(page.locator('.wizard-step strong').filter({ hasText: /Passo\s+\d/ })).toHaveCount(0);
  await expect(page.locator('.wizard-step').first().locator('strong')).toHaveText('Dados do cálculo');
  await expect(page.locator('.wizard-step').first().locator('small')).toHaveText('critérios, valores e lançamentos');
  await expect(page.locator('.wizard-steps.steps-2')).toHaveCSS('display', 'grid');
  await expect(page.locator('.wizard-step.active')).toHaveCount(1);
  await expect(page.locator('#generalista-form .wizard-actions > div')).toHaveCSS('gap', '10px');
  await expect(page.locator('.simple-criteria')).toBeVisible();
  await expect(page.locator('.criteria-card')).toHaveCount(3);
  for (const width of [1280, 900, 620, 375]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByLabel('Nome do cálculo').fill('Cálculo fácil de teste');
  await page.locator('#clientId').selectOption('client-test');
  await page.getByLabel(/Parte contrária — Réu/).fill('Réu de teste');
  await page.getByLabel('Valor do item 1').fill('150');
  await page.getByRole('button', { name: 'Calcular' }).click();
  await expect(page.locator('.wizard-steps.steps-2 .wizard-step.done')).toHaveCount(1);
  await expect(page.locator('.wizard-steps .wizard-step.active')).toContainText('Resultado');
  await expect(page.locator('.summary')).toBeVisible();
  await expect(page.getByText('R$ 150,00', { exact: true }).last()).toBeVisible();
  await page.getByRole('button', { name: 'Finalizar' }).click();
  await expect(page).toHaveURL(/calculos\/$/);
});

test('atualização monetária completa percorre parcelas e encargos adicionais', async ({ page }) => {
  await prepareCalculationPage(page);
  await page.locator('.calculator-card').filter({ hasText: 'Atualização monetária completa' }).getByRole('link', { name: 'Iniciar cálculo' }).click();
  await expect(page.locator('.panel.wizard-head .eyebrow')).toHaveText('Generalista');
  await expect(page.locator('.panel.wizard-head .hint').first()).toContainText(/OJ-GEN-.*• versão generic-1\.2\.0/);
  await expect(page.locator('.wizard-step').nth(2).locator('strong')).toHaveText('Encargos');
  await expect(page.locator('.wizard-step').nth(2).locator('small')).toHaveText('multas, honorários e custas');
  await expect(page.locator('.wizard-steps.steps-4')).toHaveCSS('display', 'grid');
  await expect(page.getByLabel('Trânsito em Julgado ou Data-base do Cálculo')).toHaveCount(1);
  await expect(page.locator('body')).toContainText('Use o trânsito em julgado ou a data-base do cálculo.');
  await page.getByLabel('Nome do cálculo').fill('Cálculo completo de teste');
  await page.locator('#clientId').selectOption('client-test');
  await page.getByLabel(/Parte contrária — Réu/).fill('Réu de teste');
  await page.getByRole('button', { name: 'Próximo' }).click();
  await expect(page.locator('.wizard-steps.steps-4 .wizard-step.done')).toHaveCount(1);
  await expect(page.locator('.item-detailed .item-subsection')).toHaveCount(2);
  await expect(page.getByRole('heading', { name: 'Correção monetária' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Juros' })).toBeVisible();
  for (const field of ['correctionStart', 'correctionEnd', 'interestStart', 'interestEnd']) {
    expect(await page.locator(`[data-item-field="${field}"]`).evaluate(element => element.parentElement.getBoundingClientRect().width)).toBeGreaterThan(100);
  }
  for (const width of [1280, 1000, 800, 600, 375]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(() => page.locator('.generalista-items.detailed').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  }
  await expect(page.locator('select[data-item-field="correctionType"]').first().locator('option[value="none"]')).toHaveText('Nenhum');
  await expect(page.locator('select[data-item-field="interestType"]').first()).toContainText('Taxa Legal — Lei 14.905/2024');
  await page.getByLabel('Descrição do item 1').fill('Parcela principal');
  await page.getByLabel('Valor do item 1').fill('100');
  await page.getByRole('button', { name: 'Próximo' }).click();
  await page.getByRole('button', { name: /Adicionar multa/ }).click();
  await page.getByLabel('Multa (%)').fill('2');
  await page.getByRole('button', { name: /Adicionar honorários/ }).click();
  await page.getByLabel('Honorários (%)').fill('10');
  await page.getByRole('button', { name: 'Calcular' }).click();
  await expect(page.locator('.summary')).toBeVisible();
  await expect(page.getByText('R$ 112,20', { exact: true }).last()).toBeVisible();
  for (const width of [1280, 1000, 800, 600, 375]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(() => page.locator('.result-ledger').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await expect.poll(() => page.locator('.result-charges').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Gerar PDF' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^OJ-GEN-.*\.pdf$/i);
  await expect(page.locator('#toast')).toHaveText('PDF gerado.');
  await page.getByRole('button', { name: 'Finalizar' }).click();
  await expect(page).toHaveURL(/calculos\/$/);
});

test('pró-rata explica a regra e altera os juros do cálculo completo', async ({ page }) => {
  await prepareCalculationPage(page, 'calculos/completo/');
  await page.getByLabel('Nome do cálculo').fill('Cálculo de pró-rata');
  await page.locator('#clientId').selectOption('client-test');
  await page.getByLabel(/Parte contrária — Réu/).fill('Réu de teste');
  await page.locator('#calculationDate').fill('2026-02-15');
  await page.getByRole('button', { name: 'Próximo' }).click();
  await page.getByLabel('Data do item 1').fill('2026-01-01');
  await page.getByLabel('Valor do item 1').fill('1000');
  await page.locator('select[data-item-field="interestType"]').first().selectOption('fixed');
  await expect(page.getByLabel('Início da correção do item 1')).toHaveValue('2026-01-01');
  await expect(page.getByLabel('Início dos juros do item 1')).toHaveValue('2026-01-01');
  await page.locator('[data-item-field="interestRate"]').first().fill('1');
  await expect(page.locator('.info-tip')).toHaveCount(3);
  const correctionHelp = page.locator('[aria-labelledby="item-0-correction-title"] .info-tip');
  const legalHelp = page.locator('[aria-labelledby="item-0-interest-title"] .item-interest-choice .info-tip');
  const interestHelp = page.locator('[aria-labelledby="item-0-interest-title"] .item-check .info-tip');
  await correctionHelp.hover();
  expect(await correctionHelp.getAttribute('title')).toBeNull();
  await expect(correctionHelp.locator('.info-tip-bubble')).toBeVisible();
  await expect(correctionHelp.locator('.info-tip-bubble')).toContainText('mês incompleto');
  await legalHelp.focus();
  await expect(legalHelp.locator('.info-tip-bubble')).toBeVisible();
  await expect(legalHelp.locator('.info-tip-bubble')).toContainText('Taxa Legal');
  await interestHelp.focus();
  await expect(interestHelp.locator('.info-tip-bubble')).toBeVisible();
  await expect(interestHelp.locator('.info-tip-bubble')).toContainText('meses completos');
  for (const width of [1280, 800, 375]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    const bounds = await interestHelp.locator('.info-tip-bubble').evaluate(element => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
    });
    expect(bounds.left).toBeGreaterThanOrEqual(0);
    expect(bounds.right).toBeLessThanOrEqual(width);
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  const prorata = page.locator('[data-item-field="interestProrata"]').first();
  await expect(prorata).toBeChecked();
  await prorata.uncheck();
  await page.getByRole('button', { name: 'Próximo' }).click();
  await page.getByRole('button', { name: 'Calcular' }).click();
  await expect(page.locator('.summary')).toBeVisible();
  await expect(page.locator('.result-ledger-card').first().locator('dd').nth(3)).toHaveText('R$ 10,00');
  await expect(page.locator('.legal-note')).toContainText('Taxa fixa de 1% ao mês, sem pró-rata');
  await page.getByRole('button', { name: 'Voltar' }).click();
  await page.getByRole('button', { name: 'Voltar' }).click();
  await page.locator('[data-item-field="interestProrata"]').first().check();
  await page.getByRole('button', { name: 'Próximo' }).click();
  await page.getByRole('button', { name: 'Calcular' }).click();
  await expect(page.locator('.result-ledger-card').first().locator('dd').nth(3)).toHaveText('R$ 15,00');
  await expect(page.locator('.legal-note')).toContainText('Taxa fixa de 1% ao mês, com pró-rata');
});

test('atualização monetária consulta o início da correção informado no lançamento', async ({ page }) => {
  const requests = await stubBcbIndices(page);
  await prepareCalculationPage(page, 'calculos/completo/');
  await page.getByLabel('Nome do cálculo').fill('Cálculo com índice desde 2021');
  await page.locator('#clientId').selectOption('client-test');
  await page.getByLabel(/Parte contrária — Réu/).fill('Réu de teste');
  await page.getByRole('button', { name: 'Próximo' }).click();
  await page.getByLabel('Descrição do item 1').fill('Parcela de julho de 2021');
  await page.getByLabel('Valor do item 1').fill('100');
  await page.locator('select[data-item-field="correctionType"]').first().selectOption('IPCA15');
  await page.locator('select[data-item-field="interestType"]').first().selectOption('fixed');
  await page.locator('[data-item-field="interestRate"]').first().fill('1');
  await page.getByLabel('Início da correção do item 1').fill('2021-07-01');
  await page.getByLabel('Início dos juros do item 1').fill('2021-07-01');
  await page.getByRole('button', { name: 'Próximo' }).click();
  await page.getByRole('button', { name: 'Calcular' }).click();
  await expect(page.locator('.summary')).toBeVisible();
  await expect(page.locator('#toast')).toHaveText('Cálculo concluído.');
  expect(requests).toContainEqual(expect.objectContaining({ seriesId: '7478', start: '01/07/2021' }));
});

test('Taxa Legal carrega automaticamente as fontes oficiais antes do cálculo', async ({ page }) => {
  const requests = await stubBcbIndices(page);
  await prepareCalculationPage(page, 'calculos/completo/');
  await page.getByLabel('Nome do cálculo').fill('Cálculo com Taxa Legal');
  await page.locator('#clientId').selectOption('client-test');
  await page.getByLabel(/Parte contrária — Réu/).fill('Réu de teste');
  await page.getByRole('button', { name: 'Próximo' }).click();
  await page.getByLabel('Descrição do item 1').fill('Parcela com Taxa Legal');
  await page.getByLabel('Valor do item 1').fill('100');
  await page.getByLabel('Data do item 1').fill('2021-07-01');
  await page.locator('select[data-item-field="interestType"]').first().selectOption('legal');
  await expect.poll(() => requests.some(({ seriesId, start }) => seriesId === '11' && start === '01/07/2024')).toBe(true);
  await expect(page.locator('#toast')).toHaveText('Índices oficiais carregados e congelados neste rascunho.', { timeout: 30_000 });
  await page.getByLabel('Início dos juros do item 1').fill('2021-07-01');
  await page.getByRole('button', { name: 'Próximo' }).click();
  await page.getByRole('button', { name: 'Calcular' }).click();
  await expect(page.locator('.summary')).toBeVisible();
  await expect(page.locator('#toast')).toHaveText('Cálculo concluído.');
  expect(requests).toContainEqual(expect.objectContaining({ seriesId: '7478', start: '01/07/2024' }));
  expect(requests).toContainEqual(expect.objectContaining({ seriesId: '11', start: '01/07/2024' }));
});

test('pensão carrega automaticamente as séries ao trocar o critério de juros', async ({ page }) => {
  const requests = await stubBcbIndices(page);
  await prepareCalculationPage(page, 'calculos/pensao/');
  await page.getByLabel('Nome do cálculo').fill('Pensão com Taxa Legal');
  await page.locator('#clientId').selectOption('client-test');
  await page.getByLabel('Número do processo').fill('0000000-00.2026.8.00.0000');
  await page.getByLabel(/Parte contrária — Executado \/ Devedor/).fill('Devedor de teste');
  await page.getByLabel('Início das parcelas').fill('2021-07-01');
  await page.getByLabel('Fim das parcelas').fill('2021-07-31');
  await page.getByLabel('Data-base do cálculo').fill('2024-09-30');
  await page.getByLabel('Forma estipulada').selectOption('fixed');
  await page.getByLabel('Valor mensal (R$)').fill('1000');
  await page.getByRole('button', { name: 'Próximo' }).click();
  await page.getByRole('button', { name: 'Próximo' }).click();
  await expect(page.getByText(/Juros legais:.*6% ao ano até 11\/02\/2003/)).toBeVisible();
  await page.locator('#interestType').selectOption('fixed');
  await expect(page.locator('#toast')).toHaveText('Séries oficiais carregadas e congeladas no cálculo.', { timeout: 30_000 });
  await page.locator('#interestType').selectOption('legal');
  await expect.poll(() => requests.some(({ seriesId, start }) => seriesId === '11' && start === '01/07/2024')).toBe(true);
  await expect(page.locator('#toast')).toHaveText('Séries oficiais carregadas e congeladas no cálculo.', { timeout: 30_000 });
  await page.getByRole('button', { name: 'Calcular' }).click();
  await expect(page.locator('.summary')).toBeVisible();
});

test('trabalhista carrega a Taxa Legal antes de calcular', async ({ page }) => {
  const requests = await stubBcbIndices(page);
  await prepareCalculationPage(page, 'calculos/trabalhista/');
  await page.getByLabel('Nome do cálculo').fill('Trabalhista com Taxa Legal');
  await page.locator('#clientId').selectOption('client-test');
  await page.getByLabel(/Parte contrária — Reclamante/).fill('Reclamante de teste');
  await page.getByLabel('Data-base do cálculo').fill('2024-09-30');
  await page.getByLabel('Data da admissão').fill('2021-07-01');
  await page.getByLabel(/Empregado ainda ativo/).check();
  await page.getByLabel('Salário-base inicial (R$)').fill('3000');
  await page.getByRole('button', { name: 'Próximo' }).click();
  await page.getByRole('button', { name: 'Próximo' }).click();
  await page.getByLabel('Saldo salarial').check();
  await page.getByRole('button', { name: 'Próximo' }).click();
  await page.locator('#interestType').selectOption('legal');
  await expect.poll(() => requests.some(({ seriesId, start }) => seriesId === '11' && start === '01/07/2024')).toBe(true);
  await expect(page.locator('#labor-toast')).toHaveText('Índices oficiais carregados e congelados neste rascunho.', { timeout: 30_000 });
  await page.getByRole('button', { name: 'Calcular' }).click();
  await expect(page.getByText('Total atualizado')).toBeVisible();
});

test('calculadoras usam o mesmo componente de passos em todas as larguras', async ({ page }) => {
  const flows = [
    ['calculos/facil/', 'steps-2', 2],
    ['calculos/completo/', 'steps-4', 4],
    ['calculos/pensao/', 'steps-4', 4],
    ['calculos/trabalhista/', 'steps-5', 5],
  ];

  for (const [path, modifier, count] of flows) {
    await page.setViewportSize({ width: 1280, height: 900 });
    await prepareCalculationPage(page, path);
    const steps = page.locator(`.wizard-steps.${modifier}`);
    const firstStep = steps.locator('.wizard-step').first();

    await expect(steps).toHaveCount(1);
    await expect(steps.locator('.wizard-step')).toHaveCount(count);
    await expect(steps).toHaveCSS('gap', '10px');
    await expect(firstStep.locator('span').first()).toHaveCSS('width', '34px');
    await expect(firstStep.locator('span').first()).toHaveCSS('height', '34px');
    await expect(firstStep).toHaveClass(/active/);

    await page.setViewportSize({ width: 600, height: 900 });
    await expect.poll(() => steps.evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length)).toBe(1);
    if (path.startsWith('calculos/facil') || path.startsWith('calculos/completo')) {
      await expect(page.locator('.wizard-actions')).toHaveCSS('flex-direction', 'row');
      await expect(page.locator('.wizard-actions > div')).toHaveCSS('gap', '10px');
    }
  }
});

test('cálculo trabalhista percorre o fluxo, salva e gera PDF', async ({ page }) => {
  await prepareCalculationPage(page);
  const card = page.locator('.calculator-card').filter({ hasText: 'Verbas trabalhistas' });
  await card.getByRole('link', { name: 'Iniciar cálculo' }).click();
  await expect(page).toHaveURL(/calculos\/trabalhista\/$/);

  await page.getByLabel('Nome do cálculo').fill('Verbas de teste');
  await page.locator('#clientId').selectOption('client-test');
  await page.getByLabel('Caso / processo (opcional)').selectOption('case-test');
  await page.getByLabel(/Parte contrária — Reclamante/).fill('Reclamante de teste');
  await page.getByLabel('Salário-base inicial (R$)').fill('3000');
  await page.getByLabel(/Empregado ainda ativo/).check();
  await expect(page.locator('#labor-form .wizard-actions > div')).toHaveCSS('gap', '10px');
  await page.getByRole('button', { name: 'Próximo' }).click();
  await expect(page.locator('.wizard-steps.steps-5 .wizard-step.done')).toHaveCount(1);
  await expect(page.locator('.wizard-steps .wizard-step.active')).toContainText('Salários');

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
  await page.getByRole('button', { name: 'Finalizar' }).click();
  await expect(page).toHaveURL(/calculos\/$/);
});

test('assistentes de cálculo compartilham cancelamento e versões identificáveis', async ({ page }) => {
  await page.goto('calculos/', { waitUntil: 'networkidle' });
  await page.locator('.calculator-card').filter({ hasText: 'Pensão alimentícia' })
    .getByRole('link', { name: 'Iniciar cálculo' }).click();
  await expect(page).toHaveURL(/calculos\/pensao\/$/);
  await expect.poll(() => page.evaluate(() => window.OfficeJurCalculationPdf?.formatVersion('1.1.0')))
    .toBe('pension-1.1.0');
  expect(await page.evaluate(() => window.OfficeJurCalculationPdf.formatVersion('pension-1.1.0')))
    .toBe('pension-1.1.0');
  await expect(page.getByText(/versão pension-1\.1\.0/i)).toBeVisible();
  await page.getByRole('button', { name: 'Cancelar' }).click();
  await expect(page).toHaveURL(/calculos\/$/);

  await page.locator('.calculator-card').filter({ hasText: 'Verbas trabalhistas' })
    .getByRole('link', { name: 'Iniciar cálculo' }).click();
  await expect(page).toHaveURL(/calculos\/trabalhista\/$/);
  await expect(page.getByText(/versão labor-1\.1\.0/i)).toBeVisible();
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
    localStorage.setItem('officejur::gist-access-lease', JSON.stringify({
      version: 2,
      phase: 'active',
      gistId: 'test-gist',
      expiresAt: Date.now() + 3 * 60 * 60 * 1000,
      graceExpiresAt: 0,
      resetForGistId: '',
      purgeId: 0,
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
  await expect(page.locator('#sync-status')).toHaveText('Nuvem sincronizada');
  await page.getByLabel('Nome do cálculo').fill('Rascunho sincronizado');
  await page.locator('#clientId').selectOption('client-test');
  await page.getByLabel(/Parte contrária — Reclamante/).fill('Reclamante de teste');
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
  await expect(page.locator('h1')).toHaveText('Gist do OfficeJur');
  await expect(page.getByRole('button', { name: 'Salvar e sincronizar' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Criar novo Gist (começar do zero)' })).toBeVisible();
  await expect(page.locator('main')).not.toContainText(/Gist secreto|Salvar e testar|arquivos JSON próprios|controle-pagamentos\.json/i);
  await expect(page.locator('body')).not.toContainText(/Configurar Gist.*Financeiro/i);

  const actionLayout = await page.locator('.actions').evaluate(element => {
    const buttons = [...element.querySelectorAll('.button')];
    const tops = buttons.map(button => Math.round(button.getBoundingClientRect().top));
    return {
      display: getComputedStyle(element).display,
      sameRow: new Set(tops).size === 1,
      fits: element.scrollWidth <= element.clientWidth,
    };
  });
  expect(actionLayout).toEqual({ display: 'grid', sameRow: true, fits: true });
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
