# Documentos (protótipo de laboratório)

Este módulo é experimental e mantém os arquivos somente no navegador, em um
IndexedDB próprio (`officejur-documentos-lab`). Não há sincronização com Gist,
upload automático ou integração com servidor.

## Fluxo atual

- vínculo obrigatório com um cliente lido do Financeiro do OfficeJur;
- importação local de DOCX, XLSX, PPTX e CSV;
- criação de arquivos Office vazios no navegador;
- edição de DOCX, XLSX e PPTX com o editor OnlyOffice local e as abas
  principais em português brasileiro (`pt-BR`), usando fallback para strings
  ainda não traduzidas;
- edição direta de CSV, com pré-visualização tabular;
- salvamento do arquivo editado de volta no IndexedDB e download local;
- exclusão apenas da cópia mantida neste navegador.

## Editor Office local

O editor é incorporado por um iframe same-origin construído a partir do
submódulo `third_party/ranuts-document`, baseado na camada web do OnlyOffice.
O aplicativo principal envia o arquivo por `postMessage` e recebe os eventos
`document:ready`, `document:opened`, `document:saved` e `document:error`.

O build do site executa `pnpm install --frozen-lockfile` e `pnpm run build` no
submódulo, copia o `dist` para `lab/documentos/editor/` e inclui a licença AGPL
junto dos assets publicados. O build é estático e adequado ao GitHub Pages;
nenhum arquivo é enviado a um servidor para ser editado.

O editor preserva `originalFile` no IndexedDB. A propriedade `file` representa
a versão corrente que será aberta na próxima edição ou baixada pelo usuário.

## Licenciamento

O código do OfficeJur continua sujeito à OfficeJur Source License. O editor
incorporado é um componente de terceiros sob AGPL-3.0; o submódulo, o arquivo
`AGPL-3.0.LICENSE` publicado e `THIRD-PARTY-NOTICES.md` devem ser mantidos ao
redistribuir o site.

Referências principais:

- [ranuts/document](https://github.com/ranuts/document) — editor local baseado
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
