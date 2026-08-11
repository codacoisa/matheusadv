(() => {
  const config = window.OFFICEJUR_CONFIG;
  if (!config) {
    console.warn('A configuração do OfficeJur não foi carregada.');
    return;
  }

  const valueAt = (path) => path
    .split('.')
    .reduce((value, key) => value?.[key], config);
  const resolveUrl = (value) => new URL(
    String(value),
    config.installation?.baseUrl || document.baseURI,
  ).href;

  const applyTheme = () => {
    const colors = config.theme?.colors || {};
    const variables = {
      '--officejur-primary': colors.primary,
      '--officejur-primary-dark': colors.primaryDark,
      '--officejur-primary-soft': colors.primarySoft,
      '--officejur-accent': colors.accent,
      '--officejur-accent-strong': colors.accentStrong,
      '--officejur-accent-light': colors.accentLight,
      '--officejur-accent-soft': colors.accentSoft,
      '--officejur-canvas': colors.canvas,
      '--officejur-surface': colors.surface,
      '--officejur-text': colors.text,
      '--officejur-muted': colors.muted,
      '--officejur-line': colors.line,
      '--officejur-success': colors.success,
      '--officejur-danger': colors.danger,
      '--officejur-warning': colors.warning,
      '--officejur-info': colors.info,
      '--officejur-header-navy': colors.primary,
      '--officejur-header-text': colors.headerText,
      '--officejur-header-muted': colors.headerMuted,
      '--officejur-local-access-canvas': colors.canvas,

      // Aliases usados pelos estilos específicos dos módulos atuais.
      '--navy': colors.primary,
      '--navy-2': colors.primarySoft,
      '--navy2': colors.primarySoft,
      '--gold': colors.accent,
      '--gold-strong': colors.accentStrong,
      '--gold2': colors.accentLight,
      '--gold-light': colors.accentLight,
      '--gold-soft': colors.accentSoft,
      '--brand': colors.accent,
      '--brand-strong': colors.accentStrong,
      '--ok': colors.success,
      '--green': colors.success,
      '--bad': colors.danger,
      '--danger': colors.danger,
      '--warn': colors.warning,
      '--blue': colors.info,
      '--info': colors.info,
    };

    for (const [name, value] of Object.entries(variables)) {
      if (value) document.documentElement.style.setProperty(name, value);
    }

    document.querySelectorAll('meta[name="theme-color"]').forEach((node) => {
      if (colors.primary) node.setAttribute('content', colors.primary);
    });
  };

  const apply = () => {
    applyTheme();
    document.querySelectorAll('[data-officejur-field]').forEach((node) => {
      const value = valueAt(node.dataset.officejurField);
      if (value != null) node.textContent = String(value);
    });

    document.querySelectorAll('[data-officejur-placeholder]').forEach((node) => {
      const value = valueAt(node.dataset.officejurPlaceholder);
      if (value != null) node.setAttribute('placeholder', String(value));
    });

    document.querySelectorAll('[data-officejur-href]').forEach((node) => {
      const value = valueAt(node.dataset.officejurHref);
      if (value != null) node.setAttribute('href', resolveUrl(value));
    });

    document.querySelectorAll('[data-officejur-src]').forEach((node) => {
      const value = valueAt(node.dataset.officejurSrc);
      if (value != null) {
        node.setAttribute('src', resolveUrl(value));
      }
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', apply, { once: true });
  } else {
    apply();
  }
})();
