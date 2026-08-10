# Documentos (protótipo de laboratório)

Este módulo é experimental e mantém os arquivos somente no navegador, em um
IndexedDB próprio (`officejur-documentos-lab`). Não há sincronização com Gist,
upload automático ou integração com servidor.

## Fluxo atual

- vínculo obrigatório com um cliente lido do Financeiro do OfficeJur;
- importação de DOCX, XLSX, PPTX e CSV com formato detectado pelo arquivo;
- criação de arquivos Office vazios no navegador;
- biblioteca organizada em pastas por cliente;
- edição de DOCX, XLSX e PPTX com o OnlyOffice em modal de 90% da tela e
  catálogo oficial completo em português brasileiro (`pt-BR`);
- renomeação somente durante a edição, após clicar no título do pop-up, com
  atualização imediata do nome exibido pelo OnlyOffice;
- edição direta de CSV, com pré-visualização tabular;
- salvamento manual ou automático a cada 10 segundos, com preferência
  persistida no navegador;
- armazenamento do arquivo editado em Base64 no IndexedDB e download pelo navegador;
- exclusão apenas da cópia mantida neste navegador.

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
pop-up. O comando Imprimir gera um PDF pelo conversor WASM e o entrega a um
quadro temporário, que abre a caixa de impressão do navegador.

O Microsoft Word descreve o AutoSave como um salvamento realizado a cada
"poucos segundos", sem publicar um intervalo exato. Este protótipo adota 10
segundos para equilibrar recuperação rápida e o custo de reconverter o arquivo
Office no navegador. Referência: [Microsoft Support](https://support.microsoft.com/en-gb/office/what-is-autosave-6d6bd723-ebfd-4e40-b5f6-ae6e8088f7a5).

O build do site executa `pnpm install --frozen-lockfile` e `pnpm run build` no
submódulo, copia o `dist` para `lab/documentos/editor/` e inclui a licença AGPL
junto dos assets publicados. O build é estático e adequado ao GitHub Pages;
nenhum arquivo é enviado a um servidor para ser editado.

O armazenamento usa `dataBase64` para a versão corrente e
`originalDataBase64` para a versão originalmente importada. Registros antigos
com `Blob` ou `File` são migrados para Base64 na primeira leitura após a
atualização. Nenhum binário estruturado permanece gravado no IndexedDB.

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
