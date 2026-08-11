# Ativos gráficos dos PDFs

Coloque aqui os PNGs institucionais usados nos PDFs:

- `wordmark.png`: marca horizontal do cabeçalho;
- `watermark.png`: marca-d’água das páginas.

O logo principal usado no recorte do PDF vem de `packages/ui/assets/logo.png` e
é indicado por `office.logoUrl` em `config/office.js`. Se trocar o tamanho ou a
posição do conteúdo de qualquer imagem, ajuste `logoCrop`, `wordmarkCrop` ou
`watermarkCrop` em `config/document-config.js`.
