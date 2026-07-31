(() => {
  const officeName = window.OFFICEJUR_CONFIG?.office?.name || 'Escritório não configurado';
  const baseUrl = window.OFFICEJUR_CONFIG?.installation?.baseUrl || document.baseURI;
  const escapeHtml = (value) => String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
  const safeAssetUrl = (value, fallback) => {
    try {
      const url = new URL(String(value || ''), baseUrl);
      return ['http:', 'https:'].includes(url.protocol) ? url.href : fallback;
    } catch {
      return fallback;
    }
  };
  const logoWhiteUrl = safeAssetUrl(
    window.OFFICEJUR_CONFIG?.office?.logoWhiteUrl || 'assets/logo-white.png',
    new URL('../../assets/logo-white.png', document.baseURI).href,
  );
  class OfficeDocumentHeader extends HTMLElement {
    connectedCallback() {
      if (this.dataset.ready === 'true') return;

      const title = (this.getAttribute('title') || 'Gerador de documentos').trim();
      const current = (this.getAttribute('current') || '').trim();
      const label = (this.getAttribute('aria-label') || `Gerador de ${title}`).trim();

      this.innerHTML = `
        <header class="topbar">
          <a class="brand" href="./" aria-label="${escapeHtml(label)}">
            <img src="${escapeHtml(logoWhiteUrl)}" alt="">
            <span><h1>${escapeHtml(title)}</h1><small>${escapeHtml(officeName)}</small></span>
          </a>
          <div class="top-actions">
            <button id="import" class="button secondary" type="button" aria-label="Importar">
              <svg class="action-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5M5 20h14"/></svg>
              <span class="action-label">Importar</span>
            </button>
            <input id="import-file" type="file" accept="application/pdf,.pdf" hidden>
            <button id="clear" class="button secondary" type="button" aria-label="Limpar">
              <svg class="action-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></svg>
              <span class="action-label">Limpar</span>
            </button>
            <button id="print" class="button secondary" type="button" aria-label="Imprimir">
              <svg class="action-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 9V3h10v6M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M7 14h10v7H7z"/></svg>
              <span class="action-label">Imprimir</span>
            </button>
            <button id="download" class="button primary" type="button" aria-label="Gerar PDF">
              <svg class="action-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v12M7 11l5 5 5-5M5 20h14"/></svg>
              <span class="action-label">Gerar PDF</span>
            </button>
            <office-app-switcher current="${escapeHtml(current)}"></office-app-switcher>
          </div>
        </header>
      `;
      this.dataset.ready = 'true';
    }
  }

  if (!customElements.get('office-document-header')) {
    customElements.define('office-document-header', OfficeDocumentHeader);
  }
})();
