# Arquitetura do OfficeJur

## Princípios

1. Um único repositório e uma única publicação.
2. Módulos funcionais independentes, evitando um aplicativo monolítico.
3. Componentes institucionais compartilhados em uma fonte única.
4. Dados e segredos fora do repositório.
5. Publicação contendo apenas os arquivos necessários para executar o sistema.

## Camadas

- `config/office.js`: configuração única da identidade do escritório e da implantação.
- `apps/portal`: entrada do sistema e acesso aos módulos permanentes.
- `apps/configuracoes`: interface única para conexões globais consumidas pelos módulos.
- `apps/lab`: catálogo isolado de ferramentas temporárias, experimentais ou em avaliação.
- `apps/documentos`: geradores jurídicos independentes, apoiados por uma única base visual e documental em `apps/documentos/assets`.
- `apps/financeiro`: domínio financeiro e relacionamento entre clientes, casos e equipe.
- `apps/validador-projudi`: análise local de PDFs e assinaturas P7S, sem transmissão dos documentos.
- `packages/ui`: navegação, rodapé e identidade visual institucional usados por todos os módulos.
- `apps/financeiro/worker`: integração protegida com o Mercado Pago.

## Produto e instalação

O OfficeJur é a identidade do produto. Nome, descrição, cobrança, URLs e elementos visuais do escritório são contexto da instalação e ficam em `config/office.js`. A camada compartilhada em `packages/ui` aplica essa configuração aos módulos sem criar dependências entre eles.

Os geradores de documentos permanecem como uma exceção deliberada: sua interface usa a configuração do escritório, mas o conteúdo jurídico dos PDFs continua vinculado aos modelos homologados da implantação atual.

## Laboratório

Ferramentas que ainda não são módulos permanentes ficam em `apps/lab/tools/<id>`. O catálogo em `apps/lab/assets/catalog.js` é a única lista de ferramentas exibidas pelo Lab, e o build publica automaticamente cada pasta em `/lab/<id>/`.

Para adicionar ou remover uma ferramenta, basta alterar sua pasta e a entrada no catálogo. O portal e o app-switcher conhecem apenas o Lab, evitando acoplamento com ferramentas que podem mudar ou desaparecer.

As ferramentas do Lab podem consumir os componentes e imagens institucionais de `packages/ui`, pois essa dependência é estável e injetada pelo build. Seus estilos, dados e comportamentos específicos permanecem dentro da própria pasta para que a ferramenta continue removível de forma isolada.

## Dados

Os módulos iniciam sem dados operacionais versionados. Informações jurídicas e financeiras são mantidas no navegador e, quando configurado pelo usuário em `apps/configuracoes`, sincronizadas com um Gist secreto global do OfficeJur. A biblioteca `packages/ui/gist-settings.js` é a única interface de persistência do Gist ID, do token e da opção de sincronização automática no navegador, enquanto `packages/ui/gist-client.js` concentra o acesso à API, limites de leitura e controle de concorrência por revisão. Cada módulo apenas consome essa configuração e aplica sua própria estratégia de mesclagem, sem expor engrenagem ou ajustes locais de Gist. O Financeiro usa `financeiro-juridico.json` para cadastros e `financeiro-arquivos.json` como índice de PDFs, relacionados por IDs de clientes e casos. Cada PDF fica em um payload Base64 próprio (`financeiro-pdf-<id>.b64`), baixado sob demanda e mantido no IndexedDB como cache local; assim, a sincronização de rotina trafega apenas metadados leves. O Financeiro aceita exclusivamente o esquema atual e bloqueia a aplicação, com opção de exportar os dados brutos, quando o armazenamento local não pode ser lido. Módulos sincronizáveis baixam, mesclam e publicam seus arquivos ao serem abertos. Um Gist secreto não é privado: qualquer pessoa que obtenha sua URL poderá visualizar o conteúdo, e Base64 não constitui criptografia.

## Geradores de documentos

Cada pasta em `apps/documentos/<modulo>` contém somente a página e a lógica específica do documento. Cabeçalho, estilos, identidade visual e jsPDF ficam em `apps/documentos/assets`, permitindo que novos geradores adotem a mesma estrutura sem duplicar arquivos.
