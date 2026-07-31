(() => {
  const config = window.OFFICEJUR_CONFIG || {};
  const safeNavigationUrl = (value, fallback = '/') => {
    try {
      const url = new URL(String(value || ''), document.baseURI);
      return ['http:', 'https:'].includes(url.protocol) ? url.href : fallback;
    } catch {
      return fallback;
    }
  };
  const BASE_URL = safeNavigationUrl(config.installation?.baseUrl || '/').replace(/\/?$/, '/');
  const productName = config.product?.name || 'OfficeJur';
  const officeName = config.office?.name || 'Escritório não configurado';
  const escapeHtml = (value) => String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  const APPS = [
    {
      id: 'main',
      name: 'Início',
      description: 'Todas as ferramentas',
      url: BASE_URL,
      color: '#17213a',
      icon: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v10h13V10"/><path d="M9.5 20v-6h5v6"/>'
    },
    {
      id: 'financeiro',
      name: 'Financeiro',
      description: 'Gestão financeira',
      url: `${BASE_URL}financeiro/`,
      color: '#16805d',
      icon: '<path d="M4 19V9"/><path d="M10 19V5"/><path d="M16 19v-7"/><path d="M22 19H2"/>'
    },
    {
      id: 'calculos',
      name: 'Cálculos',
      description: 'Memórias jurídicas',
      url: `${BASE_URL}calculos/`,
      color: '#16805d',
      icon: '<rect x="4" y="2.5" width="16" height="19" rx="2"/><path d="M8 6.5h8M8 11h2M14 11h2M8 15h2M14 15h2M8 19h8"/>'
    },
    {
      id: 'procuracao',
      name: 'Procuração',
      description: 'Gerador de procurações',
      url: `${BASE_URL}documentos/procuracao/`,
      color: '#3568b8',
      icon: '<path d="M14 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/><path d="M9 13l2 2 4-4"/><path d="M9 3h6v4H9z"/>'
    },
    {
      id: 'honorarios',
      name: 'Honorários',
      description: 'Contratos advocatícios',
      url: `${BASE_URL}documentos/honorarios/`,
      color: '#a06b19',
      icon: '<path d="M12 3v18"/><path d="M5 7h14"/><path d="m5 7-3 6h6L5 7Z"/><path d="m19 7-3 6h6l-3-6Z"/><path d="M8 21h8"/>'
    },
    {
      id: 'hipossuficiencia',
      name: 'Hipossuficiência',
      description: 'Declarações de renda',
      url: `${BASE_URL}documentos/hipossuficiencia/`,
      color: '#7653a6',
      icon: '<path d="M6 2h9l5 5v15H6z"/><path d="M14 2v6h6"/><path d="M9 13h8"/><path d="M9 17h6"/>'
    },
    {
      id: 'ciencia-audiencia',
      name: 'Ciência',
      description: 'Ciência de audiência',
      url: `${BASE_URL}documentos/ciencia-audiencia/`,
      color: '#b84d52',
      icon: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/><path d="m8 15 2 2 5-5"/>'
    },
    {
      id: 'validador-projudi',
      name: 'Validador',
      description: 'Conferência de PDFs e P7S',
      url: `${BASE_URL}validador-projudi/`,
      color: '#b42318',
      icon: '<path d="M6 2h9l5 5v15H6z"/><path d="M14 2v6h6"/><path d="m9 15 2 2 4-5"/>'
    },
    {
      id: 'lab',
      name: 'Lab',
      description: 'Ferramentas em experimentação',
      url: `${BASE_URL}lab/`,
      color: '#6941c6',
      icon: '<path d="M9 3h6"/><path d="M10 3v5l-5.5 9.5A2.3 2.3 0 0 0 6.5 21h11a2.3 2.3 0 0 0 2-3.5L14 8V3"/><path d="M7.5 15h9"/>'
    },
    {
      id: 'configuracoes',
      name: 'Configurações',
      description: 'Conexões globais do OfficeJur',
      url: `${BASE_URL}configuracoes/`,
      color: '#475467',
      icon: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/>'
    }
  ];
  // "Início" é o ponto de retorno do produto e "Configurações" encerra a
  // lista; os aplicativos intermediários seguem uma ordem previsível.
  const displayApps = [
    APPS.find((app) => app.id === 'main'),
    ...APPS
      .filter((app) => !['main', 'configuracoes'].includes(app.id))
      .sort((first, second) => first.name.localeCompare(second.name, 'pt-BR')),
    APPS.find((app) => app.id === 'configuracoes')
  ];

  const dotsIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="5" r="1.7"/><circle cx="12" cy="5" r="1.7"/><circle cx="19" cy="5" r="1.7"/><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/><circle cx="5" cy="19" r="1.7"/><circle cx="12" cy="19" r="1.7"/><circle cx="19" cy="19" r="1.7"/></svg>';

  const styles = `
    :host {
      position: relative;
      display: inline-flex;
      flex: 0 0 auto;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color-scheme: light;
    }
    :host([portal]) {
      position: absolute;
      top: 34px;
      right: 0;
      z-index: 100;
    }
    * { box-sizing: border-box; }
    .launcher {
      display: grid;
      place-items: center;
      width: 42px;
      height: 42px;
      min-width: 42px;
      min-height: 42px;
      margin: 0;
      border: 1px solid rgba(255,255,255,.24);
      border-radius: 50%;
      padding: 0;
      color: #fff;
      background: rgba(255,255,255,.08);
      cursor: pointer;
      transition: background .16s ease, border-color .16s ease, transform .16s ease;
    }
    .launcher:hover {
      border-color: rgba(255,255,255,.42);
      background: rgba(255,255,255,.16);
      transform: translateY(-1px);
    }
    .launcher:focus-visible {
      outline: 3px solid rgba(217,189,122,.55);
      outline-offset: 2px;
    }
    .launcher svg { width: 23px; height: 23px; fill: currentColor; }
    .panel {
      position: absolute;
      top: calc(100% + 11px);
      right: 0;
      z-index: 1000;
      width: min(382px, calc(100vw - 24px));
      border: 1px solid #dfe4ec;
      border-radius: 18px;
      padding: 18px;
      color: #182033;
      background: #fff;
      box-shadow: 0 24px 64px rgba(12,22,42,.24), 0 5px 16px rgba(12,22,42,.1);
    }
    .panel[hidden] { display: none; }
    .panel-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 0 2px 16px;
    }
    .panel-head strong {
      display: block;
      color: #17213a;
      font-family: Georgia, "Times New Roman", serif;
      font-size: 21px;
      line-height: 1.1;
    }
    .panel-head span {
      display: block;
      margin-top: 3px;
      color: #667085;
      font-size: 11px;
      font-weight: 650;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 8px;
    }
    .app {
      position: relative;
      display: grid;
      justify-items: center;
      align-content: start;
      min-width: 0;
      min-height: 120px;
      border: 1px solid #e4e9f0;
      border-radius: 14px;
      padding: 12px 7px 9px;
      color: #344054;
      background: #f8fafc;
      text-align: center;
      text-decoration: none;
      transition: background .14s ease, border-color .14s ease, box-shadow .14s ease, transform .14s ease;
    }
    .app:hover {
      border-color: #ccd6e4;
      background: #fff;
      box-shadow: 0 8px 20px rgba(23,33,58,.09);
      transform: translateY(-1px);
    }
    .app:focus-visible {
      outline: 3px solid rgba(53,104,184,.24);
      outline-offset: 1px;
    }
    .app[aria-current="page"] {
      border-color: #e4e9f0;
      background: #f8fafc;
    }
    .icon {
      position: relative;
      display: grid;
      place-items: center;
      width: 44px;
      height: 44px;
      border-radius: 13px;
      color: #fff;
      background: var(--app-color);
      box-shadow: inset 0 0 0 1px rgba(255,255,255,.15), 0 5px 12px color-mix(in srgb, var(--app-color) 26%, transparent);
    }
    .app[aria-current="page"] .icon::after {
      position: absolute;
      right: -3px;
      bottom: -3px;
      width: 11px;
      height: 11px;
      border: 2px solid #fff;
      border-radius: 50%;
      background: #c28a20;
      content: "";
    }
    .icon svg {
      width: 25px;
      height: 25px;
      fill: none;
      stroke: currentColor;
      stroke-width: 1.8;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .name {
      display: block;
      width: 100%;
      margin-top: 8px;
      min-height: 2.4em;
      color: #182033;
      font-size: 12px;
      font-weight: 780;
      line-height: 1.2;
      white-space: nowrap;
    }
    .app[data-app="hipossuficiencia"] .name {
      font-size: 10px;
      letter-spacing: -.025em;
    }
    .current {
      display: block;
      margin-top: 2px;
      color: #9b6a13;
      font-size: 9px;
      font-weight: 800;
      letter-spacing: .06em;
      text-transform: uppercase;
    }
    @media (max-width: 560px) {
      :host([portal]) { top: 22px; right: 0; }
      .panel { width: min(342px, calc(100vw - 24px)); padding: 14px; border-radius: 17px; }
      .grid { gap: 6px; }
      .app { min-height: 112px; padding-inline: 4px; }
      .name { font-size: 11px; }
    }
    @media (prefers-reduced-motion: reduce) {
      .launcher, .app { transition: none; }
    }
  `;

  class OfficeAppSwitcher extends HTMLElement {
    connectedCallback() {
      if (this.shadowRoot) return;

      const currentId = this.getAttribute('current') || this.detectCurrentApp();
      const currentApp = APPS.find((app) => app.id === currentId);
      const root = this.attachShadow({ mode: 'open' });
      const items = displayApps.map((app) => {
        const isCurrent = app.id === currentId;
        return `
          <a class="app" data-app="${escapeHtml(app.id)}" href="${escapeHtml(safeNavigationUrl(app.url))}" title="${escapeHtml(app.description)}" ${isCurrent ? 'aria-current="page"' : ''}>
            <span class="icon" style="--app-color: ${app.color}">
              <svg viewBox="0 0 24 24" aria-hidden="true">${app.icon}</svg>
            </span>
            <span class="name">${escapeHtml(app.name)}</span>
            ${isCurrent ? '<span class="current">Atual</span>' : ''}
          </a>
        `;
      }).join('');

      root.innerHTML = `
        <style>${styles}</style>
        <button class="launcher" type="button" aria-label="Abrir menu de sistemas" aria-haspopup="true" aria-expanded="false" title="Sistemas do escritório">
          ${dotsIcon}
        </button>
        <section class="panel" aria-label="Sistemas do escritório" hidden>
          <div class="panel-head">
            <div><strong>${escapeHtml(productName)}</strong><span>${escapeHtml(officeName)}</span></div>
          </div>
          <nav class="grid" aria-label="Alternar sistema">${items}</nav>
        </section>
      `;

      this.button = root.querySelector('.launcher');
      this.panel = root.querySelector('.panel');
      this.button.setAttribute('aria-label', currentApp
        ? `Abrir menu de sistemas. Sistema atual: ${currentApp.name}`
        : 'Abrir menu de sistemas');

      this.onButtonClick = () => this.setOpen(this.panel.hidden);
      this.onDocumentClick = (event) => {
        if (!event.composedPath().includes(this)) this.setOpen(false);
      };
      this.onKeyDown = (event) => {
        if (event.key === 'Escape' && !this.panel.hidden) {
          this.setOpen(false);
          this.button.focus();
        }
      };

      this.button.addEventListener('click', this.onButtonClick);
      document.addEventListener('click', this.onDocumentClick);
      document.addEventListener('keydown', this.onKeyDown);
    }

    disconnectedCallback() {
      document.removeEventListener('click', this.onDocumentClick);
      document.removeEventListener('keydown', this.onKeyDown);
    }

    detectCurrentApp() {
      const path = window.location.pathname.toLowerCase();
      if (path.includes('/lab/')) return 'lab';
      return APPS.find((app) => path.includes(`/${app.id}/`))?.id || 'main';
    }

    setOpen(open) {
      this.panel.hidden = !open;
      this.button.setAttribute('aria-expanded', String(open));
    }
  }

  if (!customElements.get('office-app-switcher')) {
    customElements.define('office-app-switcher', OfficeAppSwitcher);
  }
})();
