# Documentos (protótipo de laboratório)

Este módulo é experimental e, por enquanto, mantém os arquivos somente no navegador, em um IndexedDB próprio (`officejur-documentos-lab`). Não há sincronização com Gist, upload automático ou integração com servidor.

## Escopo desta primeira versão

- lista vazia quando o navegador ainda não tem documentos locais;
- vínculo obrigatório com um cliente lido do Financeiro do OfficeJur;
- importação local de DOCX, XLSX, PPTX e CSV;
- criação e edição real de CSV, com pré-visualização tabular e download;
- preservação do binário importado dos formatos Office e campo local de anotações;
- exclusão apenas da cópia mantida neste navegador.

DOCX, XLSX e PPTX ainda não são regravados por um motor Office nesta etapa. O módulo deixa a integração isolada para uma futura camada WASM; não baixa nem incorpora um editor remoto silenciosamente e não salva um arquivo inválido com extensão Office.

## Referências avaliadas

- [ranuts/document](https://github.com/ranuts/document) — referência de editor/preview local no navegador, com suporte anunciado a DOCX, XLSX, PPTX e CSV. O repositório informa licença AGPL-3.0 e referências a `onlyoffice-x2t-wasm`, `sdkjs` e `web-apps`.
- [ONLYOFFICE/web-apps](https://github.com/ONLYOFFICE/web-apps) — referência da camada de interface dos editores web do ONLYOFFICE. O repositório informa licença AGPL-3.0 e separa a interface do Document Server/engine.

Nenhum código dessas referências é copiado ou carregado por esta versão. Antes de adicionar bibliotecas, WASM ou assets de terceiros, registrar origem, versão, licença e créditos em `THIRD-PARTY-NOTICES.md` e nesta pasta.

## Próxima etapa sugerida

Escolher e auditar um engine local compatível com a licença do OfficeJur, empacotar seus assets no build e criar um adaptador que receba `Blob`, idioma `pt-BR`, permissões somente locais e callback de salvamento de volta ao IndexedDB.
