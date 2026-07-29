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
            <button id="import" class="button secondary" type="button">Importar</button>
            <input id="import-file" type="file" accept="application/pdf,.pdf" hidden>
            <button id="clear" class="button secondary" type="button">Limpar</button>
            <button id="print" class="button secondary" type="button">Imprimir</button>
            <button id="download" class="button primary" type="button">Gerar PDF</button>
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
