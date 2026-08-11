# Configuração do OfficeJur

Esta pasta reúne a personalização de uma instalação do OfficeJur. Os arquivos
daqui são publicados junto com o site; por isso, não coloque senhas, tokens ou
qualquer segredo neles.

## Onde editar cada coisa

- [`office.js`](./office.js): identidade do escritório, URLs da instalação,
  nome do produto, tema visual geral e modelo DOCX institucional.
- [`document-config.js`](./document-config.js): conteúdo e aparência dos
  geradores de procuração, ciência de audiência, hipossuficiência e honorários.
  É aqui que ficam cláusulas, profissionais, textos, contatos do rodapé e
  recortes das imagens. As cores dos PDFs ficam no tema de `office.js`.
- [`document-templates/`](./document-templates/): arquivos usados como modelo
  pelos documentos. O DOCX deve permanecer em Base64 e os ativos gráficos são
  PNGs separados.

## Como personalizar uma nova instalação

1. Edite os valores marcados nos dois arquivos JavaScript de configuração.
2. Substitua as imagens e o modelo em `document-templates/` quando necessário.
3. Atualize o `sha256` do modelo DOCX em `office.js` se o arquivo for trocado.
4. Execute o build e os testes antes de publicar.

Os nomes das propriedades devem ser preservados, porque as aplicações leem
essas propriedades diretamente no navegador.
