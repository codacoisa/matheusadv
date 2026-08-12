// Configuração principal da instalação do OfficeJur.
//
// Para personalizar outra instalação, normalmente basta editar este arquivo:
// - `office`: nome, descrição e imagens do escritório;
// - `installation`: endereço público, repositório e links técnicos;
// - `product`: nome e titular do produto;
// - `theme.colors`: cores da interface e dos PDFs.
//
// Os caminhos dos arquivos são resolvidos pelo próprio navegador. Não coloque
// dados secretos aqui: este arquivo é publicado junto com o site.
(() => {
  const configUrl = document.currentScript?.src || document.baseURI;
  const assetUrl = (fileName) => new URL(fileName, configUrl).href;

  const office = Object.freeze({
    // Identidade que aparece nos cabeçalhos, portal e documentos.
    name: 'Gregório & Morais Advogados',
    shortName: 'Gregório & Morais',
    tagline: 'Advocacia e ferramentas internas',
    statementDescriptor: 'GREGORIO MORAIS',
    // Substitua as imagens correspondentes em packages/ui/assets.
    logoUrl: assetUrl('logo.png'),
    logoWhiteUrl: assetUrl('logo-white.png'),
    appIconUrl: assetUrl('app-icon.png')
  });

  const theme = Object.freeze({
    // Estas cores são aplicadas globalmente por packages/ui/office-context.js.
    // Altere os valores HEX abaixo para adaptar o OfficeJur à identidade visual
    // de outro escritório. O nome das propriedades deve permanecer igual.
    colors: Object.freeze({
      // Cor principal: cabeçalhos, navegação e áreas de maior destaque.
      primary: '#17213a',
      // Variação escura da principal: fundos, gradientes e contraste.
      primaryDark: '#121b32',
      // Variação suave da principal: cartões e estados secundários.
      primarySoft: '#23304f',
      // Cor de destaque: botões principais, links e elementos selecionados.
      accent: '#8b651f',
      // Destaque forte: estado pressionado ou hover dos botões principais.
      accentStrong: '#6f4f18',
      // Destaque claro: ícones, bordas e detalhes decorativos.
      accentLight: '#d9bd7a',
      // Fundo suave do destaque: avisos e cartões com baixa ênfase.
      accentSoft: '#f3ead8',
      // Fundo geral das páginas.
      canvas: '#eef1f5',
      // Fundo de cartões, caixas de diálogo e formulários.
      surface: '#ffffff',
      // Cor principal dos textos sobre fundos claros.
      text: '#182033',
      // Textos auxiliares; mantenha contraste suficiente para leitura.
      muted: '#596273',
      // Bordas, divisórias e contornos de campos.
      line: '#d9dee7',
      // Estados de sucesso, erro, atenção e informação.
      success: '#067647',
      danger: '#b42318',
      warning: '#b54708',
      info: '#3568b8',
      // Textos exibidos sobre o cabeçalho escuro.
      headerText: '#ffffff',
      headerMuted: '#c8cfdd',

      // Cores dos PDFs em HEX: detalhes institucionais, texto e rodapé.
      // O document-config.js converte estes valores para o formato usado pelo jsPDF.
      pdfAccent: '#b38731',
      pdfText: '#58585c',
      pdfMuted: '#7d7d80'
    })
  });

  const installation = Object.freeze({
    // URL pública completa da instalação; mantenha a barra final para resolver links relativos.
    baseUrl: 'https://officejur.codacoisa.com.br/',
    // Origem usada por integrações/CORS; informe apenas protocolo, domínio e porta, sem caminho ou barra final.
    origin: 'https://officejur.codacoisa.com.br',
    // Repositório exibido no rodapé e arquivo do Worker indicado na ajuda.
    repositoryUrl: 'https://github.com/codacoisa/officejur',
    workerSourceUrl: 'https://github.com/codacoisa/officejur/blob/main/apps/financeiro/worker/src/index.js'
  });

  // Identidade do produto. Normalmente não muda entre escritórios.
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
    }),
    // Dados usados nos recibos de pagamentos gerados pelo Financeiro.
    // `issuerName` identifica quem recebeu o valor. Preencha `issuerDocument`
    // com CPF ou CNPJ somente quando ele deva constar no recibo impresso.
    // `location` aparece ao lado da data e `signatureLabel` sob a assinatura.
    receipt: Object.freeze({
      issuerName: office.name,
      issuerDocument: '',
      location: 'Silvânia/GO',
      signatureLabel: office.name
    })
  });

  // Tempo pelo qual uma instalação sincronizada pode continuar sendo usada
  // sem nova validação. Altere somente se a política de acesso exigir.
  const gistAccessLease = Object.freeze({ leaseHours: 3, graceMinutes: 180, minLeaseMinutes: 15, maxLeaseHours: 24 });

  window.OFFICEJUR_CONFIG = Object.freeze({ office, theme, installation, product, documents, gistAccessLease });
})();
