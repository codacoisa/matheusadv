# Modelos de documentos

Esta pasta contém os arquivos institucionais usados pelo app Arquivos e pelos
geradores de documentos.

- `modelo-institucional.docx.base64`: modelo DOCX em Base64. Não converta para
  binário dentro do repositório; troque o conteúdo Base64 e atualize os
  metadados e o hash em `config/office.js`.
- `pdf/`: logo, marca e marca-d’água usados na geração de PDFs. Os arquivos
  podem ser substituídos sem alterar os geradores; ajuste os recortes em
  `config/document-config.js` se as dimensões da nova imagem forem diferentes.

Esses arquivos são públicos no site publicado. Não use esta pasta para guardar
documentos de clientes ou qualquer informação sigilosa.
