    const DEFAULT_FILE_NAME = 'projudi-central-guias.json';
    const STORAGE_KEY = 'central-guias::config';
    const ALERT_BUSINESS_DAYS = 7;
    const WEEK_DAYS = 7;
    const STALE_SYNC_DAYS = 10;
    const BACKUP_SCHEMA = 'projudi-central-guias-backup-v1';
    const MAX_BACKUP_BYTES = 20 * 1024 * 1024;

    const state = {
      gistId: '',
      payload: null,
      db: null,
      rows: [],
      processOptions: [],
      activeView: 'critical',
      filters: {
        search: '',
        status: 'critical',
        sort: 'due-asc',
        process: 'all'
      }
    };

    const nodes = {
      gistId: document.getElementById('gist-id'),
      loadButton: document.getElementById('load-button'),
      resetButton: document.getElementById('reset-button'),
      loadStatus: document.getElementById('load-status'),
      statsGrid: document.getElementById('stats-grid'),
      viewNav: document.getElementById('view-nav'),
      criticalPanel: document.getElementById('critical-panel'),
      processesPanel: document.getElementById('processes-panel'),
      criticalSubtitle: document.getElementById('critical-subtitle'),
      criticalTableContainer: document.getElementById('critical-table-container'),
      quickFilters: document.getElementById('quick-filters'),
      searchInput: document.getElementById('search-input'),
      statusFilter: document.getElementById('status-filter'),
      sortFilter: document.getElementById('sort-filter'),
      processFilter: document.getElementById('process-filter'),
      processGrid: document.getElementById('process-grid'),
      processSubtitle: document.getElementById('process-subtitle'),
      backupMetaLabel: document.getElementById('backup-meta-label'),
      backupMetaExported: document.getElementById('backup-meta-exported'),
      backupMetaSignature: document.getElementById('backup-meta-signature')
    };

    init();

    function init() {
      hydrateConfig();
      persistConfig();
      bindEvents();
      syncInputs();
      render();
      if (state.gistId) loadBackup();
      else setStatus('Informe o ID ou endereço de um Gist público para carregar o backup.');
    }

    function bindEvents() {
      nodes.loadButton.addEventListener('click', () => {
        state.gistId = nodes.gistId.value.trim();
        persistConfig();
        loadBackup();
      });

      nodes.resetButton.addEventListener('click', () => {
        state.gistId = '';
        state.payload = null;
        state.db = null;
        state.rows = [];
        state.processOptions = [];
        persistConfig();
        syncInputs();
        render();
        setStatus('Configuração removida deste navegador.');
      });

      nodes.searchInput.addEventListener('input', (event) => {
        state.filters.search = event.currentTarget.value.trim().toLowerCase();
        render();
      });

      nodes.statusFilter.addEventListener('change', (event) => {
        state.filters.status = event.currentTarget.value;
        render();
      });

      nodes.sortFilter.addEventListener('change', (event) => {
        state.filters.sort = event.currentTarget.value;
        render();
      });

      nodes.processFilter.addEventListener('change', (event) => {
        state.filters.process = event.currentTarget.value;
        render();
      });

      nodes.viewNav.addEventListener('click', (event) => {
        const button = event.target.closest('button[data-view]');
        if (!button) return;
        state.activeView = button.dataset.view === 'processes' ? 'processes' : 'critical';
        renderViewNav();
      });

      nodes.quickFilters.addEventListener('click', (event) => {
        const button = event.target.closest('button[data-status]');
        if (!button) return;
        state.filters.status = button.dataset.status;
        nodes.statusFilter.value = state.filters.status;
        render();
      });

      nodes.criticalTableContainer.addEventListener('click', async (event) => {
        const button = event.target.closest('button[data-copy]');
        if (!button) return;
        const value = button.dataset.copy || '';
        try {
          await navigator.clipboard.writeText(value);
          button.dataset.copied = 'true';
          const original = button.textContent;
          button.textContent = 'Copiado';
          window.setTimeout(() => {
            button.dataset.copied = 'false';
            button.textContent = original;
          }, 1200);
        } catch (error) {
          setStatus('Não foi possível copiar o número do processo.', true);
        }
      });

      nodes.processGrid.addEventListener('click', async (event) => {
        const button = event.target.closest('button[data-copy-process]');
        if (!button) return;
        try {
          await navigator.clipboard.writeText(button.dataset.copyProcess || '');
          button.textContent = 'Copiado';
          window.setTimeout(() => {
            button.textContent = 'Copiar processo';
          }, 1200);
        } catch (_) {
          setStatus('Não foi possível copiar o número do processo.', true);
        }
      });
    }

    function hydrateConfig() {
      try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
        const gistIdFromUrl = new URLSearchParams(location.search).get('gist');
        state.gistId = String(gistIdFromUrl || saved.gistId || '').trim();
      } catch (_) {
        state.gistId = '';
      }
    }

    function persistConfig() {
      if (!state.gistId) {
        localStorage.removeItem(STORAGE_KEY);
        return;
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        gistId: state.gistId
      }));
    }

    function syncInputs() {
      nodes.gistId.value = state.gistId;
      nodes.statusFilter.value = state.filters.status;
      nodes.sortFilter.value = state.filters.sort;
      renderViewNav();
    }

    async function loadBackup() {
      const gistId = normalizeGistId(state.gistId);
      if (!gistId) {
        setStatus('Informe um Gist válido.', true);
        return;
      }
      setLoading(true);
      setStatus('Carregando backup...');

      try {
        const gistClient = window.OfficeJurGistClient;
        if (!gistClient) throw new Error('Cliente compartilhado do Gist indisponível.');
        const gist = await gistClient.gist(gistId, '');
        const gistFiles = gist && gist.files ? Object.values(gist.files) : [];
        const selectedFile = gist?.files?.[DEFAULT_FILE_NAME]
          || gistFiles.find((file) => String(file?.filename || '').toLowerCase().endsWith('.json'));
        if (!selectedFile) {
          throw new Error('Arquivo de backup não encontrado neste Gist.');
        }

        const rawContent = await gistClient.text(selectedFile, { maxBytes: MAX_BACKUP_BYTES });

        const payload = JSON.parse(rawContent);
        if (payload?.schema !== BACKUP_SCHEMA) {
          throw new Error('O arquivo não usa o formato atual da Central de Guias.');
        }
        if (!payload.db || typeof payload.db !== 'object') {
          throw new Error('O backup atual não contém a base de dados esperada.');
        }
        const payloadDb = payload.db;
        state.payload = payload;
        state.db = normalizeDb(payloadDb, payload);
        state.rows = flattenRows(state.db);
        state.processOptions = buildProcessOptions(state.db);
        render();

        const exportedAt = payload && payload.exportedAt ? formatDateTime(payload.exportedAt) : 'data não informada';
        setStatus(`Backup carregado com sucesso. Exportado em ${exportedAt}.`);
      } catch (error) {
        state.payload = null;
        state.db = null;
        state.rows = [];
        state.processOptions = [];
        render();
        setStatus(error instanceof Error ? error.message : 'Falha ao carregar o backup.', true);
      } finally {
        setLoading(false);
      }
    }

    function setLoading(loading) {
      nodes.loadButton.disabled = loading;
      nodes.loadButton.textContent = loading ? 'Carregando...' : 'Carregar backup';
    }

    function getBackupInfo(payload) {
      const source = payload && typeof payload === 'object' ? payload : {};
      const scriptName = String(source.scriptName || 'Central de Guias').trim();
      const version = String(source.version || '').trim();
      const backupSignature = String(source.backupSignature || '').trim();
      return {
        exportedAt: String(source.exportedAt || '').trim(),
        host: String(source.host || '').trim(),
        backupSignature,
        label: version ? `${scriptName} v${version}` : scriptName
      };
    }

    function setStatus(message, isError) {
      nodes.loadStatus.textContent = message || '';
      nodes.loadStatus.dataset.tone = isError ? 'error' : 'default';
    }

    function normalizeGistId(input) {
      const text = String(input || '').trim();
      if (!text) return '';
      const urlMatch = text.match(/gist\.github\.com\/(?:[^/]+\/)?([a-f0-9]{20,})/i);
      if (urlMatch) return urlMatch[1];
      const rawMatch = text.match(/^([a-f0-9]{20,})$/i);
      return rawMatch ? rawMatch[1] : text;
    }

    function normalizeDb(value, payloadMeta = {}) {
      const next = value && typeof value === 'object' ? value : {};
      const backupInfo = getBackupInfo(payloadMeta);
      const sourceProcesses = next.processes && typeof next.processes === 'object' ? next.processes : {};
      const processes = {};

      Object.keys(sourceProcesses).forEach((key) => {
        const process = sourceProcesses[key];
        if (!process || typeof process !== 'object') return;

        processes[key] = {
          key: process.key || key,
          processId: String(process.processId || '').trim(),
          cnj: String(process.cnj || '').trim(),
          shortNumber: String(process.shortNumber || '').trim(),
          area: String(process.area || '').trim(),
          serventia: String(process.serventia || '').trim(),
          classe: String(process.classe || '').trim(),
          assunto: String(process.assunto || '').trim(),
          processUrl: String(process.processUrl || '').trim(),
          lastProcessSeenAt: String(process.lastProcessSeenAt || '').trim(),
          lastGuidesSyncAt: String(process.lastGuidesSyncAt || '').trim(),
          lastGuidesSyncSource: String(process.lastGuidesSyncSource || '').trim(),
          archived: !!process.archived,
          archivedAt: String(process.archivedAt || '').trim(),
          untracked: !!process.untracked,
          untrackedAt: String(process.untrackedAt || '').trim(),
          backupExportedAt: backupInfo.exportedAt,
          guides: (Array.isArray(process.guides) ? process.guides : []).map((guide, index) => ({
            rowNumber: guide && guide.rowNumber != null ? guide.rowNumber : index + 1,
            guideId: String(guide && guide.guideId || '').trim(),
            number: String(guide && guide.number || '').trim(),
            type: String(guide && guide.type || '').trim(),
            issueDate: String(guide && guide.issueDate || '').trim(),
            dueDate: String(guide && guide.dueDate || '').trim(),
            receivedDate: String(guide && guide.receivedDate || '').trim(),
            canceledDate: String(guide && guide.canceledDate || '').trim(),
            situation: String(guide && guide.situation || '').trim(),
            nature: String(guide && guide.nature || '').trim(),
            installmentText: String(guide && guide.installmentText || '').trim(),
            installmentNumber: guide && guide.installmentNumber != null ? Number(guide.installmentNumber) : null,
            installmentTotal: guide && guide.installmentTotal != null ? Number(guide.installmentTotal) : null,
            detailUrl: String(guide && guide.detailUrl || '').trim(),
            lastSeenAt: String(guide && guide.lastSeenAt || process.lastGuidesSyncAt || backupInfo.exportedAt || '').trim(),
            manual: normalizeManual(guide && guide.manual)
          }))
        };
      });

      return {
        version: Number(next.version || 1) || 1,
        backupInfo,
        processes
      };
    }

    function normalizeManual(manual) {
      return {
        paid: !!(manual && manual.paid),
        notified: !!(manual && manual.notified),
        ignored: !!(manual && manual.ignored)
      };
    }

    function startOfToday() {
      const date = new Date();
      date.setHours(0, 0, 0, 0);
      return date;
    }

    function stripTime(date) {
      const copy = new Date(date.getTime());
      copy.setHours(0, 0, 0, 0);
      return copy;
    }

    function isWeekend(date) {
      const day = date.getDay();
      return day === 0 || day === 6;
    }

    function addBusinessDays(base, amount) {
      const date = stripTime(base);
      let remaining = Math.max(0, amount | 0);
      while (remaining > 0) {
        date.setDate(date.getDate() + 1);
        if (isWeekend(date)) continue;
        remaining -= 1;
      }
      return new Date(date.getTime());
    }

    function diffInDays(target, base) {
      const msPerDay = 24 * 60 * 60 * 1000;
      return Math.floor((stripTime(target) - stripTime(base)) / msPerDay);
    }

    function computeGuideStatus(guide, baseDate = startOfToday()) {
      const manual = normalizeManual(guide.manual);
      const due = guide.dueDate ? new Date(guide.dueDate) : null;
      const hasReceived = !!guide.receivedDate;
      const hasCanceled = !!guide.canceledDate;
      const situation = String(guide.situation || '').toUpperCase();

      if (manual.ignored) return 'ignored';
      if (manual.paid) return 'paid_manual';
      if (hasReceived) return 'paid';
      if (hasCanceled) return 'canceled';
      if (situation.includes('BAIXADA COM GRATUIDADE')) return 'gratuidade';
      if (situation.includes('PARCELAMENTO PAGO')) return 'parcelamento_pago';
      if (situation.includes('PARCELAMENTO REALIZADO')) return 'parcelamento_realizado';
      if (!due || Number.isNaN(due.getTime())) return 'open';

      const days = diffInDays(due, baseDate);
      const businessDeadline = addBusinessDays(baseDate, ALERT_BUSINESS_DAYS);
      if (days < 0) return 'overdue';
      if (days === 0) return 'due_today';
      if (stripTime(due) <= businessDeadline) return 'due_soon';
      if (days <= WEEK_DAYS) return 'due_week';
      return 'open';
    }

    function computeProcessSummary(processRecord, baseDate = startOfToday()) {
      const guides = Array.isArray(processRecord.guides) ? processRecord.guides : [];
      const effectiveSyncAt = getEffectiveSyncAt(processRecord);
      const summary = {
        total: guides.length,
        open: 0,
        overdue: 0,
        dueToday: 0,
        dueSoon: 0,
        dueWeek: 0,
        paid: 0,
        canceled: 0,
        ignored: 0,
        notified: 0,
        nearestDueDate: null,
        nearestDueGuide: null,
        staleSync: false,
        neverSynced: !effectiveSyncAt
      };

      guides.forEach((guide) => {
        const status = computeGuideStatus(guide, baseDate);
        const due = guide.dueDate ? new Date(guide.dueDate) : null;
        if (guide.manual && guide.manual.notified) summary.notified += 1;
        if (status === 'overdue') summary.overdue += 1;
        else if (status === 'due_today') summary.dueToday += 1;
        else if (status === 'due_soon') summary.dueSoon += 1;
        else if (status === 'due_week') summary.dueWeek += 1;
        else if (['paid', 'gratuidade', 'paid_manual', 'parcelamento_pago', 'parcelamento_realizado'].includes(status)) summary.paid += 1;
        else if (status === 'canceled') summary.canceled += 1;
        else if (status === 'ignored') summary.ignored += 1;

        if (['overdue', 'due_today', 'due_soon', 'due_week', 'open'].includes(status) && due && !Number.isNaN(due.getTime())) {
          if (!summary.nearestDueDate || due < summary.nearestDueDate) {
            summary.nearestDueDate = due;
            summary.nearestDueGuide = guide;
          }
        }
      });

      summary.open = guides.filter((guide) => ['open', 'due_week', 'due_soon', 'due_today', 'overdue'].includes(computeGuideStatus(guide, baseDate))).length;

      if (effectiveSyncAt) {
        const lastSync = new Date(effectiveSyncAt);
        if (!Number.isNaN(lastSync.getTime())) {
          summary.staleSync = diffInDays(baseDate, lastSync) >= STALE_SYNC_DAYS;
        }
      }

      return summary;
    }

    function activeProcesses(db) {
      return Object.values(db && db.processes ? db.processes : {})
        .filter((processRecord) => processRecord && !processRecord.archived && !processRecord.untracked);
    }

    function flattenRows(db, baseDate = startOfToday()) {
      const rows = [];
      const processes = activeProcesses(db);
      processes.forEach((processRecord) => {
        const processSummary = computeProcessSummary(processRecord, baseDate);
        processRecord.guides.forEach((guide) => {
          rows.push({
            processRecord,
            guide,
            status: computeGuideStatus(guide, baseDate),
            processSummary
          });
        });
      });
      return rows;
    }

    function buildProcessOptions(db) {
      return activeProcesses(db)
        .map((processRecord) => ({
          value: processRecord.key,
          label: processRecord.shortNumber || processRecord.cnj || processRecord.processId || 'Processo sem número'
        }))
        .sort((left, right) => left.label.localeCompare(right.label, 'pt-BR', { numeric: true }));
    }

    function getStatusLabel(status) {
      const labels = {
        overdue: 'Vencida',
        due_today: 'Vence hoje',
        due_soon: 'Vencendo',
        due_week: 'Nesta semana',
        open: 'Em aberto',
        ignored: 'Ignorada',
        paid: 'Paga',
        paid_manual: 'Paga manualmente',
        canceled: 'Cancelada',
        gratuidade: 'Baixada com gratuidade',
        parcelamento_pago: 'Parcelamento pago',
        parcelamento_realizado: 'Parcelamento realizado'
      };
      return labels[status] || 'Em aberto';
    }

    function getStatusTone(status) {
      if (status === 'overdue') return 'overdue';
      if (status === 'due_today' || status === 'due_soon' || status === 'due_week') return 'soon';
      if (['paid', 'paid_manual', 'canceled', 'gratuidade', 'parcelamento_pago', 'parcelamento_realizado'].includes(status)) return 'paid';
      return 'open';
    }

    function getEffectiveSyncAt(processRecord) {
      return processRecord.lastGuidesSyncAt || processRecord.backupExportedAt || '';
    }

    function getFilteredRows() {
      const search = state.filters.search;
      let rows = state.rows.slice();

      if (state.filters.process !== 'all') {
        rows = rows.filter((row) => row.processRecord.key === state.filters.process);
      }

      rows = rows.filter((row) => {
        if (state.filters.status === 'critical') {
          if (!['overdue', 'due_today', 'due_soon', 'due_week'].includes(row.status)) return false;
        } else if (state.filters.status === 'overdue') {
          if (row.status !== 'overdue') return false;
        } else if (state.filters.status === 'due_soon') {
          if (!['due_today', 'due_soon'].includes(row.status)) return false;
        } else if (state.filters.status === 'due_week') {
          if (row.status !== 'due_week') return false;
        } else if (state.filters.status === 'open') {
          if (!['open', 'due_week', 'due_soon', 'due_today', 'overdue'].includes(row.status)) return false;
        } else if (state.filters.status === 'paid') {
          if (!['paid', 'gratuidade', 'paid_manual', 'parcelamento_pago', 'parcelamento_realizado'].includes(row.status)) return false;
        } else if (state.filters.status === 'ignored') {
          if (row.status !== 'ignored') return false;
        }

        if (!search) return true;
        const haystack = [
          row.processRecord.shortNumber,
          row.processRecord.cnj,
          row.processRecord.processId,
          row.processRecord.classe,
          row.processRecord.assunto,
          row.processRecord.serventia,
          row.guide.number,
          row.guide.type,
          row.guide.situation,
          row.guide.nature,
          row.guide.installmentText,
          getStatusLabel(row.status)
        ].join(' ').toLowerCase();
        return haystack.includes(search);
      });

      rows.sort((left, right) => {
        const leftDue = left.guide.dueDate ? new Date(left.guide.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
        const rightDue = right.guide.dueDate ? new Date(right.guide.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
        const leftSync = new Date(left.processRecord.lastGuidesSyncAt || left.processRecord.lastProcessSeenAt || 0).getTime();
        const rightSync = new Date(right.processRecord.lastGuidesSyncAt || right.processRecord.lastProcessSeenAt || 0).getTime();
        const leftProcess = left.processRecord.shortNumber || left.processRecord.cnj || left.processRecord.processId || '';
        const rightProcess = right.processRecord.shortNumber || right.processRecord.cnj || right.processRecord.processId || '';

        if (state.filters.sort === 'due-desc') return rightDue - leftDue;
        if (state.filters.sort === 'process') return leftProcess.localeCompare(rightProcess, 'pt-BR', { numeric: true });
        if (state.filters.sort === 'sync') return rightSync - leftSync;
        return leftDue - rightDue;
      });

      return rows;
    }

    function computeGlobalStats(db, rows, baseDate = startOfToday()) {
      const processes = activeProcesses(db);
      const processSummaries = processes.map((processRecord) => ({
        processRecord,
        summary: computeProcessSummary(processRecord, baseDate)
      }));

      const totals = processSummaries.reduce((acc, entry) => {
        acc.processes += 1;
        acc.guides += entry.summary.total;
        acc.open += entry.summary.open;
        acc.overdue += entry.summary.overdue;
        acc.dueSoon += entry.summary.dueToday + entry.summary.dueSoon;
        acc.stale += entry.summary.staleSync ? 1 : 0;
        return acc;
      }, {
        processes: 0,
        guides: 0,
        open: 0,
        overdue: 0,
        dueSoon: 0,
        stale: 0
      });

      return {
        ...totals,
        criticalRows: rows.filter((row) => ['overdue', 'due_today', 'due_soon', 'due_week'].includes(row.status)).length,
        exportedAt: state.payload && state.payload.exportedAt ? state.payload.exportedAt : '',
        host: state.payload && state.payload.host ? state.payload.host : '',
        backupLabel: state.db && state.db.backupInfo ? state.db.backupInfo.label : '',
        backupSignature: state.db && state.db.backupInfo ? state.db.backupInfo.backupSignature : '',
        processSummaries
      };
    }

    function render() {
      renderFilters();
      renderViewNav();

      if (!state.db) {
        renderBackupMeta(null);
        renderStatsEmpty();
        nodes.criticalTableContainer.innerHTML = '<div class="empty">Nenhum backup carregado.</div>';
        nodes.processGrid.innerHTML = '<div class="empty">Os processos monitorados aparecerão aqui após a leitura do backup.</div>';
        return;
      }

      const filteredRows = getFilteredRows();
      const stats = computeGlobalStats(state.db, state.rows);
      renderBackupMeta(stats);
      renderStats(stats);
      renderCriticalTable(filteredRows, stats);
      renderProcesses(stats.processSummaries);
    }

    function renderBackupMeta(stats) {
      if (!stats) {
        nodes.backupMetaLabel.innerHTML = '<i class="fa-solid fa-database" aria-hidden="true"></i> Aguardando leitura';
        nodes.backupMetaExported.innerHTML = '<i class="fa-regular fa-clock" aria-hidden="true"></i> Sem data';
        nodes.backupMetaSignature.innerHTML = '<i class="fa-solid fa-fingerprint" aria-hidden="true"></i> Sem assinatura';
        return;
      }

      const signature = formatSignatureLabel(stats.backupSignature);
      nodes.backupMetaLabel.innerHTML = `<i class="fa-solid fa-database" aria-hidden="true"></i> ${escapeHtml(stats.backupLabel || 'Backup')}`;
      nodes.backupMetaExported.innerHTML = `<i class="fa-regular fa-clock" aria-hidden="true"></i> ${escapeHtml(stats.exportedAt ? formatDateTime(stats.exportedAt) : 'Sem data')}`;
      nodes.backupMetaSignature.innerHTML = `<i class="fa-solid fa-fingerprint" aria-hidden="true"></i> ${escapeHtml(signature)}`;
    }

    function formatSignatureLabel(value) {
      const text = String(value || '').trim();
      if (!text) return 'Sem assinatura';
      let hash = 0;
      for (let index = 0; index < text.length; index += 1) {
        hash = ((hash << 5) - hash + text.charCodeAt(index)) | 0;
      }
      return `Assinatura ${Math.abs(hash).toString(16).padStart(8, '0').slice(0, 8)}`;
    }

    function renderViewNav() {
      const tabs = nodes.viewNav.querySelectorAll('button[data-view]');
      tabs.forEach((tab) => {
        tab.classList.toggle('active', tab.dataset.view === state.activeView);
      });
      nodes.criticalPanel.hidden = state.activeView !== 'critical';
      nodes.processesPanel.hidden = state.activeView !== 'processes';
    }

    function renderFilters() {
      nodes.processFilter.innerHTML = [
        '<option value="all">Todos</option>',
        ...state.processOptions.map((option) => `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`)
      ].join('');
      nodes.processFilter.value = state.filters.process;

      const quickItems = [
        { value: 'critical', label: 'Críticas' },
        { value: 'overdue', label: 'Vencidas' },
        { value: 'due_soon', label: 'Vencendo' },
        { value: 'open', label: 'Em aberto' },
        { value: 'paid', label: 'Pagas' }
      ];

      nodes.quickFilters.innerHTML = quickItems.map((item) => {
        const active = state.filters.status === item.value ? 'active' : '';
        return `<button type="button" class="chip ${active}" data-status="${escapeHtml(item.value)}">${escapeHtml(item.label)}</button>`;
      }).join('');
    }

    function renderStatsEmpty() {
      nodes.statsGrid.innerHTML = [
        statCard('0', 'Processos', 'Nenhum backup carregado.'),
        statCard('0', 'Guias', 'Sem dados para exibir.'),
        statCard('0', 'Em aberto', 'Sem dados para exibir.'),
        statCard('0', 'Vencidas', 'Sem dados para exibir.', 'danger'),
        statCard('0', 'Vencendo', 'Sem dados para exibir.', 'warn')
      ].join('');
    }

    function renderStats(stats) {
      nodes.statsGrid.innerHTML = [
        statCard(String(stats.processes), 'Processos', `${stats.stale} com sincronização antiga.`),
        statCard(String(stats.guides), 'Guias monitoradas', stats.backupLabel || `Host de origem: ${stats.host || 'não informado'}.`),
        statCard(String(stats.open), 'Guias em aberto', 'Inclui vencidas e vincendas.', 'ok'),
        statCard(String(stats.overdue), 'Guias vencidas', 'Precisam de atenção imediata.', 'danger'),
        statCard(String(stats.dueSoon), 'Vencendo em breve', 'Hoje e próximos dias úteis.', 'warn')
      ].join('');
    }

    function renderCriticalTable(rows, stats) {
      const exportedAtText = stats.exportedAt ? formatDateTime(stats.exportedAt) : 'data não informada';
      nodes.criticalSubtitle.textContent = `${rows.length} linha(s) exibida(s) • backup exportado em ${exportedAtText}.`;

      if (!rows.length) {
        nodes.criticalTableContainer.innerHTML = '<div class="empty">Nenhuma guia encontrada com os filtros atuais.</div>';
        return;
      }

      nodes.criticalTableContainer.innerHTML = `
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Processo</th>
                <th>Guia</th>
                <th>Tipo / Natureza</th>
                <th>Vencimento</th>
                <th>Status</th>
                <th>Sincronização</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map((row) => renderRow(row)).join('')}
            </tbody>
          </table>
        </div>
      `;
    }

    function renderRow(row) {
      const processLabel = row.processRecord.shortNumber || row.processRecord.cnj || row.processRecord.processId || 'Sem número';
      const cnj = row.processRecord.cnj && row.processRecord.cnj !== processLabel ? row.processRecord.cnj : '';
      const tone = getStatusTone(row.status);
      const dueDate = row.guide.dueDate ? formatDateTime(row.guide.dueDate) : '--';
      const syncDate = getEffectiveSyncAt(row.processRecord) ? formatDateTime(getEffectiveSyncAt(row.processRecord)) : '--';
      const syncLabel = row.processRecord.lastGuidesSyncAt ? 'Última sync' : 'Backup exportado';

      return `
        <tr>
          <td>
            <div class="process-main">
              <div class="process-number">${escapeHtml(processLabel)}</div>
              <div class="process-meta">
                ${cnj ? `CNJ: ${escapeHtml(cnj)}<br>` : ''}
                ${row.processRecord.classe ? `Classe: ${escapeHtml(row.processRecord.classe)}<br>` : ''}
                ${row.processRecord.assunto ? `Assunto: ${escapeHtml(row.processRecord.assunto)}` : ''}
              </div>
            </div>
          </td>
          <td>
            <div class="stack">
              <strong>${escapeHtml(row.guide.number || row.guide.guideId || 'Sem número')}</strong>
              <div class="guide-meta">
                ${row.guide.installmentText ? `${escapeHtml(row.guide.installmentText)}<br>` : ''}
                Situação original: ${escapeHtml(row.guide.situation || 'Não informada')}
              </div>
            </div>
          </td>
          <td>
            <div class="stack">
              <strong>${escapeHtml(row.guide.type || 'Tipo não informado')}</strong>
              <div class="guide-meta">${escapeHtml(row.guide.nature || 'Natureza não informada')}</div>
            </div>
          </td>
          <td>
            <div class="stack">
              <strong>${escapeHtml(dueDate)}</strong>
              <div class="guide-meta">Emissão: ${escapeHtml(row.guide.issueDate ? formatDateTime(row.guide.issueDate) : '--')}</div>
            </div>
          </td>
          <td>
            <span class="pill pill-${tone}">${escapeHtml(getStatusLabel(row.status))}</span>
          </td>
          <td>
            <div class="guide-meta">
              ${escapeHtml(syncLabel)}: ${escapeHtml(syncDate)}<br>
              Último avistamento: ${escapeHtml(row.guide.lastSeenAt ? formatDateTime(row.guide.lastSeenAt) : '--')}
            </div>
          </td>
          <td>
            <button type="button" class="copy-btn" data-copy="${escapeHtml(processLabel)}">Copiar processo</button>
          </td>
        </tr>
      `;
    }

    function renderProcesses(processSummaries) {
      nodes.processSubtitle.textContent = `${processSummaries.length} processo(s) monitorado(s).`;

      if (!processSummaries.length) {
        nodes.processGrid.innerHTML = '<div class="empty">Nenhum processo encontrado no backup.</div>';
        return;
      }

      const sorted = processSummaries
        .slice()
        .sort((left, right) => {
          const leftCritical = left.summary.overdue + left.summary.dueToday + left.summary.dueSoon;
          const rightCritical = right.summary.overdue + right.summary.dueToday + right.summary.dueSoon;
          if (leftCritical !== rightCritical) return rightCritical - leftCritical;
          return (left.processRecord.shortNumber || left.processRecord.cnj || '').localeCompare(right.processRecord.shortNumber || right.processRecord.cnj || '', 'pt-BR', { numeric: true });
        });

      nodes.processGrid.innerHTML = sorted.map(({ processRecord, summary }) => {
        const processLabel = processRecord.shortNumber || processRecord.cnj || processRecord.processId || 'Sem número';
        return `
          <article class="process-card">
            <div class="process-card-head">
              <div>
                <h3 class="process-card-title">${escapeHtml(processLabel)}</h3>
                <div class="panel-subtitle">
                  ${escapeHtml(processRecord.assunto || processRecord.classe || processRecord.serventia || 'Sem metadados adicionais')}
                </div>
              </div>
              <button type="button" class="copy-btn" data-copy-process="${escapeHtml(processLabel)}">Copiar processo</button>
            </div>

            <div class="process-card-summary">
              <span class="pill pill-overdue">${summary.overdue} vencida(s)</span>
              <span class="pill pill-soon">${summary.dueToday + summary.dueSoon} vencendo</span>
              <span class="pill pill-open">${summary.open} em aberto</span>
              <span class="pill pill-paid">${summary.paid} paga(s)</span>
            </div>

            <div class="guide-meta">
              Processo ID: ${escapeHtml(processRecord.processId || '--')}<br>
              CNJ: ${escapeHtml(processRecord.cnj || '--')}<br>
              ${escapeHtml(processRecord.lastGuidesSyncAt ? 'Última sincronização' : 'Backup exportado')}: ${escapeHtml(getEffectiveSyncAt(processRecord) ? formatDateTime(getEffectiveSyncAt(processRecord)) : '--')}<br>
              Próximo vencimento: ${escapeHtml(summary.nearestDueDate ? formatDateTime(summary.nearestDueDate) : '--')}
            </div>
          </article>
        `;
      }).join('');
    }

    function statCard(value, label, help, tone) {
      const toneClass = tone ? ` stat-${tone}` : '';
      return `
        <article class="stat${toneClass}">
          <div class="stat-value">${escapeHtml(value)}</div>
          <div class="stat-label">${escapeHtml(label)}</div>
          <div class="stat-help">${escapeHtml(help)}</div>
        </article>
      `;
    }

    function formatDateTime(value) {
      if (!value) return '--';
      const date = value instanceof Date ? value : new Date(value);
      if (Number.isNaN(date.getTime())) return '--';
      return date.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    }

    function escapeHtml(value) {
      return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }
