import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { minimalDocx, minimalPptx, minimalXlsx } from './office-fixtures.cjs';

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
  'lab/documentos/',
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
const blockedDescription = 'Os dados sincronizados estão protegidos e aguardam a revalidação autenticada do Gist. Eles não serão exibidos até a confirmação do acesso.';

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
    await expect(page.locator('.local-access-status')).toContainText('Acesso local bloqueado');
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
  await page.goto('lab/documentos/', { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { name: 'Biblioteca de documentos', level: 1 })).toBeVisible();
  await expect(page.getByText('Nenhum arquivo na biblioteca')).toBeVisible();
  await page.getByRole('button', { name: 'Novo documento' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('#client-select')).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Criar documento' })).toBeDisabled();
});

test('Documentos vincula cliente, organiza a pasta e salva CSV', async ({ page }) => {
  await prepareCalculationPage(page, 'lab/documentos/');
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
  await page.getByRole('button', { name: 'Renomear Planilha de teste' }).click();
  await page.getByRole('textbox', { name: 'Novo nome do arquivo' }).fill('Planilha renomeada');
  await page.locator('[data-rename-form]').getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByRole('button', { name: /Abrir Planilha renomeada/ })).toBeVisible();
});

test('Documentos abre o OnlyOffice em modal amplo e permite renomear durante a edição', async ({ page }) => {
  await prepareCalculationPage(page, 'lab/documentos/');
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
  const office = page.frameLocator('#office-editor-frame').frameLocator('iframe');
  await expect(office.getByText('Página Inicial', { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('#editor-name')).toBeHidden();
  await page.locator('#editor-name-trigger').click();
  await page.locator('#editor-name').fill('Rascunho revisado');
  await page.locator('#editor-name-form').getByRole('button', { name: 'Salvar nome' }).click();
  await expect(page.getByText('Arquivo renomeado para “Rascunho revisado”.')).toBeVisible();
  await expect(page.locator('#editor-name-trigger')).toHaveText('Rascunho revisado');
  await expect(office.locator('#title-doc-name')).toHaveValue('Rascunho revisado.docx');
  await page.locator('#save-document').click();
  await expect(page.getByText('Alterações salvas neste navegador.')).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('#delete-document').click();
  await expect(page.getByText('Nenhum arquivo na biblioteca')).toBeVisible();
});

test('Documentos exige três confirmações para limpar a biblioteca', async ({ page }) => {
  await prepareCalculationPage(page, 'lab/documentos/');
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
  await prepareCalculationPage(page, 'lab/documentos/');
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
      const request = indexedDB.open('officejur-documentos-lab', 3);
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

  await prepareCalculationPage(page, 'lab/documentos/');
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
  await page.getByLabel('Cliente').selectOption('client-test');
  await page.getByLabel('Caso / processo (opcional)').selectOption('case-test');
  await page.getByLabel('Exequente / credor').fill('Credora de teste');
  await page.getByLabel('Executado / devedor').fill('Devedor de teste');
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
  await expect(wizard.locator('.hint').first()).toContainText(/OJ-GEN-.*• versão generic-1\.0\.0/);
  await expect(page.getByText('Ajuda e sugestões')).toHaveCount(0);
  await expect(page.locator('.generic-heading, .generic-wizard, .generic-card, .generic-summary')).toHaveCount(0);
  await expect(page.locator('.wizard-step strong').filter({ hasText: /Passo\s+\d/ })).toHaveCount(0);
  await expect(page.locator('.wizard-step').first().locator('strong')).toHaveText('Dados do cálculo');
  await expect(page.locator('.wizard-step').first().locator('small')).toHaveText('critérios, valores e lançamentos');
  await expect(page.locator('.wizard-steps.steps-2')).toHaveCSS('display', 'grid');
  await expect(page.locator('.wizard-step.active')).toHaveCount(1);
  await expect(page.locator('#generalista-form .wizard-actions > div')).toHaveCSS('gap', '10px');
  await page.getByLabel('Nome do cálculo').fill('Cálculo fácil de teste');
  await page.getByLabel('Cliente').selectOption('client-test');
  await page.getByLabel('Valor do item 1').fill('150');
  await page.getByRole('button', { name: 'Calcular' }).click();
  await expect(page.locator('.wizard-steps.steps-2 .wizard-step.done')).toHaveCount(1);
  await expect(page.locator('.wizard-steps .wizard-step.active')).toContainText('Resultado');
  await expect(page.locator('.summary')).toBeVisible();
  await expect(page.getByText('R$ 150,00', { exact: true }).last()).toBeVisible();
});

test('atualização monetária completa percorre parcelas e encargos adicionais', async ({ page }) => {
  await prepareCalculationPage(page);
  await page.locator('.calculator-card').filter({ hasText: 'Atualização monetária completa' }).getByRole('link', { name: 'Iniciar cálculo' }).click();
  await expect(page.locator('.panel.wizard-head .eyebrow')).toHaveText('Generalista');
  await expect(page.locator('.panel.wizard-head .hint').first()).toContainText(/OJ-GEN-.*• versão generic-1\.0\.0/);
  await expect(page.locator('.wizard-step').nth(2).locator('strong')).toHaveText('Encargos');
  await expect(page.locator('.wizard-step').nth(2).locator('small')).toHaveText('multas, honorários e custas');
  await expect(page.locator('.wizard-steps.steps-4')).toHaveCSS('display', 'grid');
  await page.getByLabel('Nome do cálculo').fill('Cálculo completo de teste');
  await page.getByLabel('Cliente').selectOption('client-test');
  await page.getByRole('button', { name: 'Próximo' }).click();
  await expect(page.locator('.wizard-steps.steps-4 .wizard-step.done')).toHaveCount(1);
  await expect(page.locator('.generalista-items.detailed')).toHaveCSS('overflow-x', 'auto');
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
  await page.getByLabel('Cliente').selectOption('client-test');
  await page.getByLabel('Caso / processo (opcional)').selectOption('case-test');
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
