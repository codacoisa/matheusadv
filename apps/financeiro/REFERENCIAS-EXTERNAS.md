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

### Mercado Pago

- **Checkout Pro:** criação dos links de pagamento exibidos no módulo de
  cobranças.
- **Mercado Pago API:** acessada exclusivamente pelo serviço protegido em
  `worker/src/index.js`, por meio de `https://api.mercadopago.com`.
- **Credencial privada:** `MP_ACCESS_TOKEN`, armazenada como segredo no serviço
  protegido e nunca na página estática.
- **Chave do serviço:** `OFFICEJUR_API_KEY`, também armazenada como segredo no
  Worker e informada somente na sessão ativa do navegador.
- **Referências:** [Visão geral do Checkout Pro](https://www.mercadopago.com.br/developers/pt/docs/checkout-pro/overview),
  [criação da aplicação](https://www.mercadopago.com.br/developers/pt/docs/checkout-pro/create-application),
  [testes da integração](https://www.mercadopago.com.br/developers/pt/docs/checkout-pro/integration-test)
  e [entrada em produção](https://www.mercadopago.com.br/developers/pt/docs/checkout-pro/go-to-production).

### Cloudflare Workers

- **Uso:** opção adotada para publicar o serviço protegido que intermedeia o
  sistema estático e a API do Mercado Pago.
- **Código do serviço:** `worker/src/index.js`.
- **Configuração:** `worker/wrangler.toml`.
- **Proteção de tráfego:** binding `RATE_LIMITER` do Cloudflare Workers,
  configurado para limitar chamadas ao serviço por origem e rota.
- **Segredos:** o Access Token do Mercado Pago deve ser cadastrado como segredo
  do Worker.
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
