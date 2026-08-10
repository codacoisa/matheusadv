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

  // Recursos institucionais definidos pela implantação. Para trocar o modelo,
  // substitua o arquivo Base64 em config/document-templates e atualize os metadados abaixo.
  const documents = Object.freeze({
    institutionalDocxTemplate: Object.freeze({
      enabled: true,
      label: 'Modelo institucional Gregório & Morais',
      fileName: 'Modelo v3b.docx',
      base64Url: assetUrl('document-templates/modelo-institucional.docx.base64'),
      sha256: 'd968b58d915411c69e2be157748caa72c965cc0a2bdeef64f19d07bd34d44e95'
    })
  });

  // Política da implantação: o navegador não pode ampliá-la por configurações locais.
  const gistAccessLease = Object.freeze({ leaseHours: 3, graceMinutes: 180, minLeaseMinutes: 15, maxLeaseHours: 24 });

  window.OFFICEJUR_CONFIG = Object.freeze({ office, installation, product, documents, gistAccessLease });
})();
