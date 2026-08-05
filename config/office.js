(() => {
  const configUrl = document.currentScript?.src || document.baseURI;
  const assetUrl = (fileName) => new URL(fileName, configUrl).href;

  const office = Object.freeze({
    name: 'Gregório & Morais Advogados',
    shortName: 'Gregório & Morais',
    tagline: 'Advocacia e ferramentas internas',
    statementDescriptor: 'GREGORIO MORAIS',
    logoWhiteUrl: assetUrl('logo-white.png'),
    appIconUrl: assetUrl('app-icon.png')
  });

  const installation = Object.freeze({
    // URL pública completa da instalação; mantenha a barra final para resolver links relativos.
    baseUrl: 'https://officejur.codacoisa.com.br/',
    // Origem usada por integrações/CORS; informe apenas protocolo, domínio e porta, sem caminho ou barra final.
    origin: 'https://officejur.codacoisa.com.br',
    repositoryUrl: 'https://github.com/codacoisa/officejur'
  });

  const product = Object.freeze({
    name: 'OfficeJur',
    copyrightHolder: 'OfficeJur',
    copyrightStartYear: 2026
  });

  window.OFFICEJUR_CONFIG = Object.freeze({ office, installation, product });
})();
