# Referências externas

Este documento relaciona as bibliotecas, plataformas, APIs e serviços de
terceiros utilizados pelo Financeiro Jurídico. Credenciais, tokens e dados do
escritório não fazem parte do repositório.

## Biblioteca incorporada

### Font Awesome Free 7.3.0

- **Uso:** ícones da interface e das páginas de ajuda.
- **Implementação:** SVG com JavaScript, hospedado no próprio projeto para não
  depender de fontes externas durante a execução.
- **Arquivo incorporado:** `assets/fontawesome-7.3.0.min.js`.
- **Origem do arquivo:** [cdnjs — Font Awesome 7.3.0](https://cdnjs.cloudflare.com/ajax/libs/font-awesome/7.3.0/js/all.min.js).
- **Pacote oficial:** [@fortawesome/fontawesome-free](https://www.npmjs.com/package/@fortawesome/fontawesome-free).
- **Projeto oficial:** [FortAwesome/Font-Awesome](https://github.com/FortAwesome/Font-Awesome).
- **Licenças:** ícones sob CC BY 4.0, fontes sob SIL OFL 1.1 e código sob MIT,
  conforme a [licença do Font Awesome Free](https://fontawesome.com/license/free).
- **Integridade do arquivo incorporado — SHA-256:**
  `a732e7d9903221429c9ded8a536414e013a68dca485f132fdfad36fdf47e36cd`.

O cabeçalho de autoria e licença original foi preservado no arquivo
incorporado.

### libphonenumber-js 1.13.8

- **Uso:** lista internacional de países e DDIs, formatação durante a digitação,
  validação e normalização de telefones no padrão E.164.
- **Implementação:** bundle completo hospedado no próprio projeto, sem consulta
  a serviços externos durante o cadastro.
- **Arquivo incorporado:** `assets/libphonenumber-max.js`.
- **Pacote oficial:** [libphonenumber-js](https://www.npmjs.com/package/libphonenumber-js).
- **Projeto oficial:** [catamphetamine/libphonenumber-js](https://gitlab.com/catamphetamine/libphonenumber-js).
- **Licença:** MIT, preservada em `vendor-licenses/libphonenumber-js.txt`.
- **Integridade do arquivo incorporado — SHA-256:**
  `82eb5022716aefd34b5e649e61092dca2e734fef4db9a04f529375d0a606c334`.

## Plataformas e APIs

### GitHub

- **GitHub Pages:** hospedagem estática do sistema.
- **GitHub Gist:** armazenamento secreto por URL usado pela sincronização entre
  navegadores; não é um cofre privado nem substitui criptografia.
- **GitHub REST API:** leitura, criação e atualização do Gist por meio de
  `https://api.github.com`.
- **Autenticação:** token pessoal com a menor permissão necessária para Gists;
  o token permanece no navegador configurado e não é versionado.
- **Referências:** [GitHub Pages](https://docs.github.com/pages) e
  [REST API para Gists](https://docs.github.com/en/rest/gists/gists).

### OpenCNPJ

- **Uso:** consulta pública de dados cadastrais para pré-preenchimento do
  cadastro de clientes pessoa jurídica.
- **Endpoint:** `https://api.opencnpj.org/{cnpj}`; a consulta é feita somente
  após a validação local do CNPJ e não exige credencial no navegador.
- **Dados utilizados:** razão social, nome fantasia, natureza jurídica,
  contatos e endereço. O retorno não é salvo integralmente; o OfficeJur grava
  somente os campos próprios do cadastro após a conferência da pessoa usuária.
- **Formato:** o OfficeJur aceita os 14 caracteres do CNPJ vigente, com as 12
  primeiras posições alfanuméricas e os dois dígitos verificadores numéricos.
- **Fonte e projeto:** [OpenCNPJ](https://opencnpj.org/) e
  [repositório oficial](https://github.com/Hitmasu/opencnpj).
- **Observação:** os dados são públicos e processados a partir de fontes da
  Receita Federal; a consulta é auxiliar e não substitui conferência cadastral
  ou documento oficial.

### API Pública do DataJud

- **Uso:** consulta de metadados públicos de processos judiciais pelo número
  CNJ e exibição opcional das movimentações retornadas.
- **Endpoint:** `https://api-publica.datajud.cnj.jus.br/api_publica_<tribunal>/_search`.
  O tribunal é identificado pelos campos `J` e `TR` da numeração CNJ.
- **Autenticação:** o Worker usa `DATAJUD_API_KEY` como segredo para autenticar
  a chamada perante o CNJ. Como a API não libera CORS para a aplicação estática,
  o navegador conversa somente com o endpoint `/datajud/search` do Worker.
- **Proxy:** publique `worker/src/index.js`, cadastre `DATAJUD_API_KEY` como
  segredo e informe a URL e a chave do Worker na área global
  **Configurações → Cloudflare Workers**. A chave `OFFICEJUR_API_KEY` usada pelo
  Worker fica salva localmente neste navegador; o token do Mercado Pago não é
  necessário para a rota DataJud.
- **Dados utilizados:** tribunal, segmento de Justiça, classe, sistema,
  formato, grau, data de ajuizamento, órgão julgador, assuntos, nível de sigilo,
  atualização da origem e movimentações. O retorno normalizado e a resposta
  pública da consulta ficam associados ao caso para permitir conferência e
  sincronização.
- **Limites:** a API cobre metadados de processos públicos, pode não retornar
  processos sob sigilo, não garante atualidade durante atrasos de carga e não
  substitui a consulta oficial do tribunal ou a conferência profissional.
- **Referências:** [API Pública do CNJ](https://www.cnj.jus.br/sistemas/datajud/api-publica/),
  [acesso e chave pública](https://datajud-wiki.cnj.jus.br/api-publica/acesso/),
  [endpoints](https://datajud-wiki.cnj.jus.br/api-publica/endpoints/),
  [exemplo por número de processo](https://datajud-wiki.cnj.jus.br/api-publica/exemplos/exemplo1/)
  e [glossário de dados](https://datajud-wiki.cnj.jus.br/api-publica/glossario/).

### Mercado Pago

- **Checkout Pro:** criação dos links de pagamento exibidos no módulo de
  cobranças.
- **Mercado Pago API:** acessada exclusivamente pelo serviço protegido em
  `worker/src/index.js`, por meio de `https://api.mercadopago.com`.
- **Credencial privada:** `MP_ACCESS_TOKEN`, armazenada como segredo no serviço
  protegido e nunca na página estática.
- **Chave do serviço:** `OFFICEJUR_API_KEY`, armazenada como segredo no Worker
  e informada na configuração global, que a mantém localmente neste navegador.
- **Referências:** [Visão geral do Checkout Pro](https://www.mercadopago.com.br/developers/pt/docs/checkout-pro/overview),
  [criação da aplicação](https://www.mercadopago.com.br/developers/pt/docs/checkout-pro/create-application),
  [testes da integração](https://www.mercadopago.com.br/developers/pt/docs/checkout-pro/integration-test)
  e [entrada em produção](https://www.mercadopago.com.br/developers/pt/docs/checkout-pro/go-to-production).

### Cloudflare Workers

- **Uso:** publica o serviço protegido que intermedeia o sistema estático e as
  APIs do Mercado Pago, do DataJud e de futuras integrações.
- **Código do serviço:** `worker/src/index.js`.
- **Configuração:** `worker/wrangler.toml`.
- **Proteção de tráfego:** binding `RATE_LIMITER` do Cloudflare Workers,
  configurado para limitar chamadas ao serviço por origem e rota.
- **Segredos:** `MP_ACCESS_TOKEN` é usado pelo Mercado Pago; `DATAJUD_API_KEY`
  é usado pelo DataJud; `OFFICEJUR_API_KEY` protege as chamadas do navegador.
- **Referências:** [Cloudflare Workers](https://developers.cloudflare.com/workers/)
  e [Workers Secrets](https://developers.cloudflare.com/workers/configuration/secrets/).

### WhatsApp

- **Uso:** abertura opcional de uma conversa com o telefone de um cliente
  marcado como WhatsApp.
- **Endpoint:** `https://wa.me/`, acessado apenas quando a pessoa usuária clica
  no atalho correspondente.
- **Referência:** [Click to Chat](https://faq.whatsapp.com/5913398998672934/).

## Responsabilidade sobre serviços externos

Cada plataforma possui termos, disponibilidade e políticas próprias. Antes de
usar o sistema em produção, o escritório deve manter as credenciais protegidas,
conceder somente as permissões necessárias e revisar periodicamente as
configurações das contas externas.
