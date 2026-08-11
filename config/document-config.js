// Personalização dos geradores de documentos.
// Edite textos, profissionais, cláusulas e ativos documentais neste arquivo.
// A identidade visual geral fica em config/office.js, no bloco `theme`.
// Não altere o nome das propriedades: os quatro geradores dependem delas.
(() => {
  const configUrl = document.currentScript?.src || document.baseURI;
  const office = window.OFFICEJUR_CONFIG?.office || {};
  const product = window.OFFICEJUR_CONFIG?.product || {};
  const theme = window.OFFICEJUR_CONFIG?.theme || {};
  const themeColors = theme.colors || {};
  const sharedAssetUrl = (fileName) => new URL(`../../assets/${fileName}`, configUrl).href;
  const hexToRgb = (value, fallback) => {
    const normalized = String(value || '').replace('#', '');
    const match = normalized.match(/^([0-9a-f]{6})$/i)
      || String(fallback).replace('#', '').match(/^([0-9a-f]{6})$/i);
    const hex = match[1];
    return Object.freeze([
      Number.parseInt(hex.slice(0, 2), 16),
      Number.parseInt(hex.slice(2, 4), 16),
      Number.parseInt(hex.slice(4, 6), 16),
    ]);
  };
  const marker = (name) => `OFFICEJUR_${name}_DRAFT:`;

  const config = Object.freeze({
    schema: 'officejur/document-config',
    version: 2,
    pdf: Object.freeze({
      // Estas três cores vêm do tema geral em office.js.
      colors: Object.freeze({
        gold: hexToRgb(themeColors.pdfAccent, '#b38731'),
        gray: hexToRgb(themeColors.pdfText, '#58585c'),
        footerGray: hexToRgb(themeColors.pdfMuted, '#7d7d80'),
      }),
      // Troque os PNGs na pasta document-templates/pdf. Os recortes informam
      // qual região da imagem será usada; x/y são a origem e w/h o tamanho.
      assets: Object.freeze({
        logoUrl: office.logoUrl || sharedAssetUrl('logo.png'),
        logoCrop: Object.freeze({ x: 200, y: 234, w: 623, h: 962 }),
        wordmarkUrl: sharedAssetUrl('document-templates/pdf/wordmark.png'),
        wordmarkCrop: Object.freeze({ x: 238, y: 384, w: 1068, h: 190 }),
        watermarkUrl: sharedAssetUrl('document-templates/pdf/watermark.png'),
        watermarkCrop: Object.freeze({ x: 0, y: 0, w: 1414, h: 2000 }),
      }),
      // Dados exibidos no rodapé dos PDFs. Deixe um texto vazio para omiti-lo.
      footer: Object.freeze({
        phone: '(62) 9 9316-1514',
        address: 'GO-010, Km 67, Zona Rural, Silvânia-GO',
        email: 'gregorioemorais.adv@gmail.com',
        mapsUrl: 'https://maps.app.goo.gl/r8CVrczAXdqNZc6u9',
        whatsappUrl: 'https://wa.me/5562993161514',
      }),
    }),
    // Cada chave abaixo corresponde à pasta de um gerador em apps/documentos.
    // `draftMarker` é interno e só deve mudar se o formato atual for substituído.
    templates: Object.freeze({
      'ciencia-audiencia': Object.freeze({
        metadata: Object.freeze({
          title: 'Termo de Ciência de Audiência',
          subject: 'Ciência de audiência gerada pelo OfficeJur',
        }),
        headerTitle: 'TERMO DE CIÊNCIA E COMPROMISSO\nDE COMPARECIMENTO EM AUDIÊNCIA',
        defaultLocation: 'Silvânia-GO',
        draftMarker: marker('CIENCIA_AUDIENCIA'),
        // Profissionais disponíveis na lista do termo de ciência.
        attorneys: Object.freeze([
          Object.freeze({ name: 'Adauto Aparecido de Morais', oab: '33.799' }),
          Object.freeze({ name: 'Jales Gregório de Oliveira Sousa', oab: '62.131' }),
          Object.freeze({ name: 'Matheus Ricardo de Sousa Ferreira', oab: '60.162' }),
        ]),
      }),
      hipossuficiencia: Object.freeze({
        metadata: Object.freeze({
          title: 'Declaração de Hipossuficiência',
          subject: 'Declaração de hipossuficiência gerada pelo OfficeJur',
        }),
        headerTitle: 'DECLARAÇÃO DE HIPOSSUFICIÊNCIA',
        defaultLocation: 'Silvânia/GO',
        draftMarker: marker('HIPOSSUFICIENCIA'),
      }),
      honorarios: Object.freeze({
        metadata: Object.freeze({
          title: 'Contrato de Honorários',
          subject: 'Contrato de honorários gerado pelo OfficeJur',
        }),
        headerTitle: 'CONTRATO DE HONORÁRIOS ADVOCATÍCIOS',
        defaultLocation: 'Silvânia/GO',
        draftMarker: marker('HONORARIOS'),
        // Qualificação da parte contratada e cláusulas padrão do contrato.
        contractedPartyText: 'Adauto Aparecido de Morais, inscrito na OAB/GO, sob o n.º 33.799; Jales Gregório de Oliveira Sousa, inscrito na OAB/GO, sob o n.º 62.131; e Matheus Ricardo de Sousa Ferreira, inscrito na OAB/GO, sob o n.º 60.162, todos integrantes do escritório Gregório & Morais, com endereço profissional indicado no rodapé deste instrumento.',
        clauses: Object.freeze([
          Object.freeze({ id: 1, title: 'DO OBJETO', text: 'A CONTRATADA prestará os serviços advocatícios descritos no Quadro de Parâmetros da Contratação, observados o objeto e os limites ali definidos.' }),
          Object.freeze({ id: 2, title: 'DOS HONORÁRIOS', text: 'Os honorários devidos pela prestação dos serviços são aqueles estabelecidos no Quadro de Parâmetros da Contratação, que integra este contrato.\nI - Em caso de inadimplemento, incidirão multa de 1% e juros de mora de 2% ao mês, calculados pro rata die.\nII - Após 30 dias de atraso, poderá a CONTRATADA considerar rescindido o contrato e exigir o pagamento imediato dos valores devidos, além das despesas incorridas.' }),
          Object.freeze({ id: 3, title: 'DO INADIMPLEMENTO E SUSPENSÃO DA ATUAÇÃO', text: 'O inadimplemento autoriza a CONTRATADA a suspender a prática de atos não urgentes, sem prejuízo da adoção das medidas éticas cabíveis, inclusive renúncia ao mandato, permanecendo exigíveis os honorários vencidos e proporcionais ao trabalho realizado.' }),
          Object.freeze({ id: 4, title: 'DA CIÊNCIA, ADEQUAÇÃO E LIVRE PACTUAÇÃO', text: 'O CONTRATANTE declara que os honorários foram livremente pactuados, compatíveis com a complexidade da causa, grau de zelo profissional e tempo estimado de dedicação, tendo sido devidamente esclarecida a distinção entre honorários contratuais e sucumbenciais.' }),
          Object.freeze({ id: 5, title: 'DAS DESPESAS', text: 'Custas, taxas e despesas extraordinárias correrão por conta do CONTRATANTE, mediante prévia comunicação, podendo a CONTRATADA adiantar despesas de pequeno valor até o limite de R$ 150,00.' }),
          Object.freeze({ id: 6, title: 'DAS OBRIGAÇÕES DO CONTRATANTE', text: 'Compete ao CONTRATANTE fornecer informações e documentos verídicos, manter seus dados atualizados, arcar com despesas comunicadas e efetuar os pagamentos pactuados.' }),
          Object.freeze({ id: 7, title: 'DO ACORDO OU RECEBIMENTO DIRETO', text: 'Qualquer valor recebido direta ou indiretamente pelo CONTRATANTE, por acordo judicial, extrajudicial ou composição informal relacionada ao objeto deste contrato, ainda que sem a intervenção da CONTRATADA, tornará imediatamente exigíveis os honorários contratuais e de êxito previstos no Quadro de Parâmetros da Contratação.' }),
          Object.freeze({ id: 8, title: 'DA EXCLUSIVIDADE', text: 'O CONTRATANTE compromete-se a não constituir outro patrono para o mesmo objeto sem ciência da CONTRATADA, sob pena de exigibilidade integral dos honorários.' }),
          Object.freeze({ id: 9, title: 'DA RESCISÃO', text: 'O contrato poderá ser rescindido por qualquer das partes mediante notificação escrita. Em caso de rescisão imotivada, desistência ou revogação do mandato pelo CONTRATANTE, aplicam-se as condições previstas no Quadro de Parâmetros da Contratação. Os valores já pagos serão imputados aos serviços efetivamente prestados ou disponibilizados pela CONTRATADA, observada a proporcionalidade do trabalho realizado, sem prejuízo da multa rescisória, se prevista.' }),
          Object.freeze({ id: 10, title: 'DA IRREVOGABILIDADE E IRRETRATABILIDADE', text: 'O presente contrato é celebrado em caráter irrevogável e irretratável, ressalvadas as hipóteses legais ou rescisão por mútuo acordo.' }),
          Object.freeze({ id: 11, title: 'DO LEVANTAMENTO DE VALORES', text: 'A CONTRATADA poderá requerer a expedição de alvará em seu nome para levantamento de honorários contratuais e sucumbenciais.' }),
          Object.freeze({ id: 12, title: 'DA PROTEÇÃO DE DADOS', text: 'O tratamento de dados pessoais observará a Lei nº 13.709/2018, limitando-se ao necessário à execução deste contrato.' }),
          Object.freeze({ id: 13, title: 'DO COMPARTILHAMENTO DE DADOS', text: 'O CONTRATANTE autoriza o compartilhamento de seus dados pessoais com peritos, correspondentes jurídicos, tribunais, plataformas digitais e demais terceiros estritamente necessários à execução do objeto contratado, observadas as disposições da Lei nº 13.709/2018.' }),
          Object.freeze({ id: 14, title: 'DO SIGILO PROFISSIONAL', text: 'O CONTRATANTE compromete-se a não divulgar estratégias, documentos ou pareceres sem autorização prévia.' }),
          Object.freeze({ id: 19, title: 'DO USO DE INTELIGÊNCIA ARTIFICIAL', text: 'O CONTRATANTE declara ciência e consente expressamente que a CONTRATADA utilize ferramentas de inteligência artificial, inclusive generativa, como apoio à execução dos serviços contratados, inclusive para pesquisa, análise, organização, revisão e elaboração de documentos e comunicações relacionadas ao objeto deste contrato. A utilização observará as cláusulas de proteção de dados, compartilhamento de dados e sigilo profissional deste instrumento; o CONTRATANTE está ciente de que os resultados podem conter imprecisões e não substituirão a análise dos advogados, que permanecerão responsáveis pelo conteúdo final e pelas orientações prestadas. O CONTRATANTE poderá solicitar, por escrito, que a IA não seja utilizada em atividade específica, hipótese em que a CONTRATADA avaliará alternativa compatível.' }),
          Object.freeze({ id: 15, title: 'DO SUBSTABELECIMENTO', text: 'A CONTRATADA poderá substabelecer os poderes recebidos, com ou sem reserva.' }),
          Object.freeze({ id: 16, title: 'DA VIGÊNCIA', text: 'A vigência perdurará até a conclusão da atuação definida no Quadro de Parâmetros da Contratação.' }),
          Object.freeze({ id: 17, title: 'DAS DISPOSIÇÕES GERAIS', text: 'A eventual tolerância ao descumprimento contratual não implica renúncia de direitos. As obrigações estendem-se aos sucessores das partes.' }),
          Object.freeze({ id: 18, title: 'DO FORO', text: 'Fica eleito o foro da Comarca de Silvânia-GO para dirimir controvérsias decorrentes deste contrato.' }),
        ]),
      }),
      procuracao: Object.freeze({
        metadata: Object.freeze({
          title: 'Procuração',
          subject: 'Procuração gerada pelo OfficeJur',
        }),
        headerTitle: 'PROCURAÇÃO',
        defaultLocation: 'Silvânia/GO',
        draftMarker: marker('PROCURACAO'),
        // Texto completo dos advogados que recebem os poderes da procuração.
        attorneysText: 'Adauto Aparecido de Morais, inscrito na OAB/GO, sob o n.º 33.799; Jales Gregório de Oliveira Sousa, inscrito na OAB/GO, sob o n.º 62.131; e Matheus Ricardo de Sousa Ferreira, inscrito na OAB/GO, sob o n.º 60.162, todos integrantes do escritório Gregório & Morais, com endereço profissional indicado no rodapé deste instrumento, aos quais confere os poderes constantes desta procuração.',
      }),
    }),
    office: Object.freeze({
      name: office.name || 'Escritório não configurado',
      productName: product.name || 'OfficeJur',
    }),
  });

  window.OFFICEJUR_DOCUMENT_CONFIG = config;
})();
