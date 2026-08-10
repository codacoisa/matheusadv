# Documentos (protótipo de laboratório)

Este módulo é experimental e, por enquanto, mantém os arquivos somente no navegador, em um IndexedDB próprio (`officejur-documentos-lab`). Não há sincronização com Gist, upload automático ou integração com servidor.

## Escopo desta primeira versão

- lista vazia quando o navegador ainda não tem documentos locais;
- vínculo obrigatório com um cliente lido do Financeiro do OfficeJur;
- importação local de DOCX, XLSX, PPTX e CSV;
- criação e edição real de CSV, com pré-visualização tabular e download;
- preservação do binário importado dos formatos Office e campo local de anotações;
- exclusão apenas da cópia mantida neste navegador.

DOCX, XLSX e PPTX ainda não são regravados por um motor Office nesta etapa. A primeira camada WASM faz leitura e prévia textual local, sem alterar o binário original. O módulo não baixa nem incorpora um editor remoto silenciosamente e não salva um arquivo inválido com extensão Office.

## Camada de integração WASM

O protótipo agora possui um contrato local e um primeiro engine WASM instalado:

- `assets/engine/manifest.json` registra engine, versão, origem, licença, hashes e tamanho dos assets;
- `assets/office-engine.worker.js` isola o processamento do thread da interface;
- `assets/engine.js` carrega o worker sob demanda e expõe `probe()` e `inspect()`;
- `assets/engine/office-oxide-adapter.js` adapta `office-oxide-wasm` para leitura de texto, Markdown e HTML;
- o original importado é preservado em `originalFile`, enquanto `file` representa a versão corrente.

O pacote `office-oxide-wasm@0.1.8` é copiado durante o build para os assets do Lab. O runtime web tem aproximadamente 14 KB e o WASM 1,05 MB; o manifest fixa SHA-256 dos dois arquivos. A API pública desta versão lê e converte o conteúdo, mas não fornece ainda um editor visual nem uma operação de regravação binária.

O aceite desta etapa é a leitura local de um DOCX, seguida de XLSX e PPTX. Isso valida o transporte de `Blob`, o worker, o carregamento no GitHub Pages e a preservação do original. A próxima decisão será entre implementar edições estruturais sobre uma IR ou adicionar uma camada de editor visual.

## Referências avaliadas

- [ranuts/document](https://github.com/ranuts/document) — referência de editor/preview local no navegador, com suporte anunciado a DOCX, XLSX, PPTX e CSV. O repositório informa licença AGPL-3.0 e referências a `onlyoffice-x2t-wasm`, `sdkjs` e `web-apps`.
- [ONLYOFFICE/web-apps](https://github.com/ONLYOFFICE/web-apps) — referência da camada de interface dos editores web do ONLYOFFICE. O repositório informa licença AGPL-3.0 e separa a interface do Document Server/engine.

Nenhum código dessas referências é copiado ou carregado por esta versão. Antes de adicionar bibliotecas, WASM ou assets de terceiros, registrar origem, versão, licença e créditos em `THIRD-PARTY-NOTICES.md` e nesta pasta.

## Próxima etapa sugerida

Escolher e auditar um engine local compatível com a licença do OfficeJur, empacotar seus assets no build e criar um adaptador que receba `Blob`, idioma `pt-BR`, permissões somente locais e callback de salvamento de volta ao IndexedDB.
