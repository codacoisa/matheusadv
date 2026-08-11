# Arquivos

Este app mantém os arquivos em um IndexedDB próprio (`officejur-arquivos`)
e pode sincronizá-los pelo Gist global configurado no OfficeJur. O índice dos
documentos fica separado dos conteúdos: cada arquivo corrente e sua versão
original são enviados como payloads Base64 próprios, no mesmo padrão usado
pelos PDFs do Financeiro.

## Fluxo atual

- vínculo obrigatório com um cliente lido do Financeiro do OfficeJur;
- importação de DOCX, XLSX, PPTX e CSV com formato detectado pelo arquivo;
- criação de arquivos Office vazios no navegador;
- criação opcional de DOCX a partir do modelo institucional definido internamente
  em `config/office.js`;
- biblioteca organizada em pastas por cliente;
- edição de DOCX, XLSX e PPTX com o OnlyOffice em modal de 90% da tela e
  catálogo oficial completo em português brasileiro (`pt-BR`);
- renomeação somente durante a edição, após clicar no título do pop-up, com
  atualização imediata do nome exibido pelo OnlyOffice;
- edição direta de CSV, com pré-visualização tabular;
- salvamento manual ou automático a cada 10 segundos, com preferência
  persistida no navegador;
- armazenamento do arquivo editado em Base64 no IndexedDB e download pelo navegador;
- sincronização do índice `arquivos-documentos.json` e dos payloads Base64 individuais;
- exclusão registrada como marca de sincronização para os demais computadores.

## Editor Office

O editor é incorporado por um iframe same-origin construído a partir do
submódulo `third_party/ranuts-document`, baseado na camada web do OnlyOffice.
O build fixa o submódulo no commit público `fcaa66e` e aplica o patch
`third_party/ranuts-document.patch` para o caminho do GitHub Pages e o idioma
português, sem depender de commits privados ou locais.
O aplicativo principal envia o arquivo por `postMessage` e recebe os eventos
`document:ready`, `document:opened`, `document:saved` e `document:error`.
Também usa `document:rename`, `document:focus` e `document:changed` para
sincronizar o título, devolver o foco ao documento e acionar o salvamento
automático somente quando houver alterações. O comando Salvar da faixa nativa
do OnlyOffice publica o arquivo editado pela mesma ponte usada pelo botão do
pop-up. O comando Imprimir usa a impressão nativa do OnlyOffice para DOCX,
preservando documentos complexos com timbre, cabeçalhos e imagens sem depender
da conversão WASM para PDF. Nos demais formatos, o conversor gera o PDF e o
entrega a um quadro temporário que abre a caixa de impressão do navegador; se
essa conversão falhar, a impressão nativa também é usada como alternativa.

No Safari, a recuperação de foco ativa primeiro o iframe interno e depois a
área editável do OnlyOffice. Ela é repetida por um quadro de animação e após
cliques na página, evitando o cursor visual sem entrada de teclado.

O Microsoft Word descreve o AutoSave como um salvamento realizado a cada
"poucos segundos", sem publicar um intervalo exato. Este app adota 10
segundos para equilibrar recuperação rápida e o custo de reconverter o arquivo
Office no navegador. Referência: [Microsoft Support](https://support.microsoft.com/en-gb/office/what-is-autosave-6d6bd723-ebfd-4e40-b5f6-ae6e8088f7a5).

O build do site executa `pnpm install --frozen-lockfile` e `pnpm run build` no
submódulo, copia o `dist` para `arquivos/editor/` e inclui a licença AGPL
junto dos assets publicados. O build é estático e adequado ao GitHub Pages;
nenhum arquivo é enviado a um servidor para ser editado.

O armazenamento usa `dataBase64` para a versão corrente e
`originalDataBase64` para a versão originalmente importada. O esquema atual
aceita somente Base64; nenhum binário estruturado é gravado no IndexedDB.

## Modelo institucional

O modelo DOCX é uma configuração da implantação, não uma preferência alterável
pela interface. O arquivo fica versionado como texto Base64 em
`config/document-templates/modelo-institucional.docx.base64`; os metadados, a
ativação e o hash SHA-256 ficam em `config/office.js`. O build publica esse
recurso junto da configuração institucional. Ao marcar **Usar modelo do
escritório**, o app valida a integridade do modelo e cria uma cópia no
IndexedDB, sem modificar o arquivo-base.

## Licenciamento

O código do OfficeJur continua sujeito à OfficeJur Source License. O editor
incorporado é um componente de terceiros sob AGPL-3.0; o submódulo, o arquivo
`AGPL-3.0.LICENSE` publicado e `THIRD-PARTY-NOTICES.md` devem ser mantidos ao
redistribuir o site.

Referências principais:

- [ranuts/document](https://github.com/ranuts/document) — editor baseado
  em OnlyOffice Web, com suporte anunciado a DOCX, XLSX, PPTX e CSV;
- [ONLYOFFICE Docs API](https://api.onlyoffice.com/docs) — documentação da
  integração e dos eventos do editor;
- [ONLYOFFICE/web-apps](https://github.com/ONLYOFFICE/web-apps) — camada web
  utilizada pelo editor.

## Build local

Na raiz do repositório, com os submódulos disponíveis:

```bash
git submodule update --init --recursive
npm ci
./scripts/build-site.sh
```

O resultado fica em `_site/`. Para publicação, o workflow do GitHub Pages
instala o pnpm usado pelo submódulo antes de executar o build.
