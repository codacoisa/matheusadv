(() => {
  'use strict';

  const gistSettings = window.OfficeJurGistSettings;
  const gistClient = window.OfficeJurGistClient;
  const access = window.OfficeJurGistAccessLease?.create();
  const officeName = window.OFFICEJUR_CONFIG?.office?.name || 'OfficeJur';
  const form = document.querySelector('#gist-form');
  const gistIdInput = document.querySelector('#gist-id');
  const tokenInput = document.querySelector('#gist-token');
  const autoSyncInput = document.querySelector('#auto-sync');
  const saveButton = document.querySelector('#save-test');
  const createButton = document.querySelector('#create-gist');
  const clearButton = document.querySelector('#clear-gist');
  const status = document.querySelector('#action-status');
  const connectionDot = document.querySelector('#connection-dot');
  const connectionTitle = document.querySelector('#connection-title');
  const connectionDetail = document.querySelector('#connection-detail');

  function currentFormSettings() {
    return gistSettings.normalize({
      gistId: gistIdInput.value,
      token: tokenInput.value,
      autoSync: autoSyncInput.checked
    });
  }

  function render(settings = gistSettings.load()) {
    gistIdInput.value = settings.gistId;
    tokenInput.value = settings.token;
    autoSyncInput.checked = settings.autoSync;
    const configured = !!(settings.gistId && settings.token);
    const lease = access?.state();
    connectionDot.classList.toggle('configured', configured && ['active', 'grace'].includes(lease?.phase || 'active'));
    if (!configured) {
      connectionTitle.textContent = 'Gist não configurado';
      connectionDetail.textContent = 'Os módulos continuarão salvando apenas neste navegador.';
    } else if (lease?.phase === 'grace') {
      connectionTitle.textContent = 'Acesso ao Gist em período de graça';
      connectionDetail.textContent = 'A última verificação foi recusada. Salve e teste a configuração para confirmar o acesso.';
    } else if (['stale', 'unverified'].includes(lease?.phase)) {
      connectionTitle.textContent = 'Configuração presente; verificação pendente';
      connectionDetail.textContent = `O Gist ${settings.gistId} será revalidado antes de liberar os dados locais.`;
    } else if (['purging', 'purged'].includes(lease?.phase)) {
      connectionTitle.textContent = 'Acesso revogado ou cópia local removida';
      connectionDetail.textContent = 'Teste e salve uma configuração válida para restabelecer o acesso.';
    } else {
      connectionTitle.textContent = 'Gist global configurado e confirmado';
      connectionDetail.textContent = `Todos os módulos sincronizáveis usarão o Gist ${settings.gistId}.`;
    }
  }

  function setStatus(message, tone = '') {
    status.textContent = message;
    status.className = `action-status${tone ? ` ${tone}` : ''}`;
  }

  function setBusy(busy) {
    [saveButton, createButton, clearButton].forEach((button) => {
      button.disabled = busy;
    });
  }

  async function saveAndTest(event) {
    event.preventDefault();
    const settings = currentFormSettings();
    if (!settings.gistId || !settings.token) {
      setStatus('Informe o Gist ID e o token do GitHub.', 'error');
      return;
    }
    setBusy(true);
    setStatus('Verificando acesso ao Gist...');
    try {
      await gistClient.gist(settings.gistId, settings.token);
      gistSettings.save(settings);
      access?.renew(settings.gistId);
      if (access?.state().phase === 'purging') await access.purge();
      render(settings);
      setStatus('Configuração global salva e acesso confirmado.', 'ok');
    } catch (error) {
      setStatus(error.message || 'Não foi possível acessar o Gist.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function createGist() {
    const settings = currentFormSettings();
    if (!settings.token) {
      setStatus('Informe primeiro o token do GitHub.', 'error');
      tokenInput.focus();
      return;
    }
    setBusy(true);
    setStatus('Criando Gist...');
    try {
      const gist = await gistClient.json('/gists', settings.token, {
        method: 'POST',
        body: JSON.stringify({
          description: `OfficeJur — ${officeName}`,
          public: false,
          files: {
            'officejur-config.json': {
              content: JSON.stringify({
                schema: 'officejur-gist-v1',
                createdAt: new Date().toISOString(),
                description: 'Gist compartilhado pelos módulos do OfficeJur.'
              }, null, 2)
            }
          }
        })
      });
      const saved = gistSettings.save({ ...settings, gistId: gist.id });
      access?.renew(saved.gistId);
      if (access?.state().phase === 'purging') await access.purge();
      render(saved);
      setStatus('Gist criado e definido como configuração global.', 'ok');
    } catch (error) {
      setStatus(error.message || 'Não foi possível criar o Gist.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function clearSettings() {
    if (!confirm('Remover o Gist ID, o token e as cópias locais protegidas deste navegador? Os dados remotos não serão excluídos.')) return;
    setBusy(true);
    const cleared = gistSettings.clear();
    try { await access?.revoke(); }
    catch (error) {
      setStatus(error.message || 'Não foi possível concluir a limpeza local.', 'error');
      setBusy(false);
      return;
    }
    render(cleared);
    setStatus('Configuração e cópias locais protegidas removidas. O Gist remoto foi preservado.', 'ok');
    setBusy(false);
  }

  form.addEventListener('submit', saveAndTest);
  createButton.addEventListener('click', createGist);
  clearButton.addEventListener('click', clearSettings);
  access?.subscribe(() => render());
  render();
})();
