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
- `assets/office-templates.js` gera modelos DOCX, XLSX e PPTX vazios no navegador;
- `fflate@0.8.3` permite regravar a cópia ZIP OOXML sem alterar o original;
- o original importado é preservado em `originalFile`, enquanto `file` representa a versão corrente.

O pacote `office-oxide-wasm@0.1.8` é copiado durante o build para os assets do Lab. O runtime web tem aproximadamente 14 KB e o WASM 1,05 MB; o manifest fixa SHA-256 dos assets. A API pública desta versão lê e converte o conteúdo; a regravação experimental é feita separadamente sobre o ZIP OOXML por `fflate`.

O fluxo `Abrir para editar` apresenta o texto extraído em uma superfície visual editável e o botão `Salvar` regrava a cópia local, preservando o original importado. A edição técnica ainda substitui somente a primeira ocorrência em `word/document.xml`, na primeira planilha `xl/worksheets/*.xml` ou no primeiro slide `ppt/slides/*.xml`, inclusive quando a ocorrência atravessa nós textuais fragmentados. Não há fidelidade de layout nem edição de imagens, tabelas ou estilos; a próxima etapa para chegar a um editor Office completo será incorporar uma camada visual especializada, com auditoria de licença e tamanho do engine.

## Referências avaliadas

- [ranuts/document](https://github.com/ranuts/document) — referência de editor/preview local no navegador, com suporte anunciado a DOCX, XLSX, PPTX e CSV. O repositório informa licença AGPL-3.0 e referências a `onlyoffice-x2t-wasm`, `sdkjs` e `web-apps`.
- [ONLYOFFICE/web-apps](https://github.com/ONLYOFFICE/web-apps) — referência da camada de interface dos editores web do ONLYOFFICE. O repositório informa licença AGPL-3.0 e separa a interface do Document Server/engine.

Nenhum código dessas referências é copiado ou carregado por esta versão. Antes de adicionar bibliotecas, WASM ou assets de terceiros, registrar origem, versão, licença e créditos em `THIRD-PARTY-NOTICES.md` e nesta pasta.

## Próxima etapa sugerida

Escolher e auditar um engine local compatível com a licença do OfficeJur, empacotar seus assets no build e criar um adaptador que receba `Blob`, idioma `pt-BR`, permissões somente locais e callback de salvamento de volta ao IndexedDB.
