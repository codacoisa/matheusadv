(() => {
  const config = window.OFFICEJUR_CONFIG || {};
  const escapeHtml = (value) => String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
  const safeExternalUrl = (value, fallback = '#') => {
    try {
      const url = new URL(String(value || ''), document.baseURI);
      return ['http:', 'https:'].includes(url.protocol) ? url.href : fallback;
    } catch {
      return fallback;
    }
  };
  const icon = {
    github: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" stroke="none" d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.87c-2.78.6-3.37-1.18-3.37-1.18-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.9 1.53 2.35 1.09 2.92.83.09-.65.35-1.09.64-1.34-2.22-.25-4.56-1.11-4.56-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02A9.56 9.56 0 0 1 12 6.82a9.5 9.5 0 0 1 2.5.34c1.91-1.29 2.75-1.02 2.75-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.86v2.76c0 .27.18.58.69.48A10 10 0 0 0 12 2Z"/></svg>',
  };

  const styles = `
    :host {
      display: block;
      width: 100%;
      color-scheme: dark;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    * { box-sizing: border-box; }
    .site-footer {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      flex-wrap: wrap;
      gap: 8px;
      min-height: 96px;
      padding: 16px 20px;
      border-top: 1px solid rgba(255,255,255,.14);
      color: rgba(248,250,252,.72);
      background:
        radial-gradient(circle at 50% 0, rgba(179,135,49,.1), transparent 42%),
        #121b32;
      text-align: center;
    }
    :host([embedded]) .site-footer {
      min-height: 0;
      margin-top: 26px;
      padding: 20px 0 0;
      background: transparent;
    }
    :host([sidebar]) {
      width: calc(100% - 230px);
      margin-left: 230px;
    }
    .credits {
      position: relative;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-wrap: wrap;
      gap: 8px;
      font-size: 13px;
      font-weight: 650;
    }
    .copyright {
      color: rgba(248,250,252,.82);
      font-size: 15px;
      line-height: 1;
    }
    .links {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }
    .links a {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      min-height: 34px;
      border: 1px solid rgba(255,255,255,.16);
      border-radius: 7px;
      padding: 0 10px;
      color: rgba(248,250,252,.84);
      background: rgba(255,255,255,.025);
      font-size: 12px;
      font-weight: 700;
      text-decoration: none;
      transition: color .16s ease, border-color .16s ease, background .16s ease, transform .16s ease;
    }
    .links a:hover {
      border-color: rgba(215,187,121,.58);
      color: #d7bb79;
      background: rgba(255,255,255,.08);
      transform: translateY(-2px);
    }
    .links a:focus-visible {
      outline: 3px solid rgba(215,187,121,.28);
      outline-offset: 2px;
    }
    .links svg {
      width: 16px;
      height: 16px;
      fill: none;
      stroke: currentColor;
      stroke-width: 1.8;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    @media (max-width: 720px) {
      :host([sidebar]) {
        width: 100%;
        margin-left: 0;
      }
      .site-footer { min-height: 92px; padding: 15px 16px; }
      :host([embedded]) .site-footer { margin-top: 22px; padding-top: 18px; }
      .credits { font-size: 12px; }
    }
    @media (prefers-reduced-motion: reduce) {
      .links a { transition: none; }
    }
  `;

  class OfficeSiteFooter extends HTMLElement {
    connectedCallback() {
      if (this.shadowRoot) return;
      const repository = (this.getAttribute('repository') || '').trim();
      const year = new Date().getFullYear();
      const startYear = Number(config.product?.copyrightStartYear) || year;
      const years = year === startYear ? String(year) : `${startYear}–${year}`;
      const copyrightHolder = config.product?.copyrightHolder || 'OfficeJur';
      const repositoryUrl = safeExternalUrl(config.installation?.repositoryUrl);
      const repositoryLabel = repository
        ? `Repositório ${repository} no GitHub`
        : 'Repositório no GitHub';
      const root = this.attachShadow({ mode: 'open' });

      root.innerHTML = `
        <style>${styles}</style>
        <footer class="site-footer">
          <span class="credits">
            <span class="copyright" aria-hidden="true">&copy;</span>
            <span>${escapeHtml(years)} ${escapeHtml(copyrightHolder)}</span>
          </span>
          <nav class="links" aria-label="Links institucionais">
            <a href="${escapeHtml(repositoryUrl)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(repositoryLabel)}" title="${escapeHtml(repositoryLabel)}">
              ${icon.github}
              <span>Repositório</span>
            </a>
          </nav>
        </footer>
      `;
    }
  }

  if (!customElements.get('office-site-footer')) {
    customElements.define('office-site-footer', OfficeSiteFooter);
  }
})();
