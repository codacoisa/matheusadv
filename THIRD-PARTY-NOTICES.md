# 🧩 Avisos de terceiros

O OfficeJur utiliza os projetos de código aberto abaixo. As versões são fixadas no repositório para que a publicação seja reproduzível.

> ⚖️ A OfficeJur Source License aplica-se somente ao material próprio do
> OfficeJur e não substitui as licenças destes componentes.

## 📚 Componentes incorporados ou carregados

| Projeto | Versão | Uso no OfficeJur | Licença e origem |
| --- | --- | --- | --- |
| [office-oxide-wasm](https://github.com/yfedoseev/office_oxide) | 0.1.8 | Leitura local de DOCX, XLSX e PPTX no protótipo Documentos | MIT OR Apache-2.0 — runtime e textos de licença copiados para os assets publicados |
| [jsPDF](https://github.com/parallax/jsPDF) | 4.2.1 | Geração local dos PDFs dos módulos de documentos | MIT — [licença preservada](vendor-licenses/jspdf.txt) |
| [PDF.js](https://github.com/mozilla/pdf.js) | 6.2.108 | Leitura e análise local de PDFs no Validador Projudi | Apache-2.0 |
| [PKI.js](https://github.com/PeculiarVentures/PKI.js) | 3.4.0 | Leitura e validação das assinaturas P7S | BSD-3-Clause |
| [ASN1.js](https://github.com/PeculiarVentures/ASN1.js) | 3.0.10 | Decodificação ASN.1 das assinaturas digitais | BSD-3-Clause |
| [libphonenumber-js](https://github.com/catamphetamine/libphonenumber-js) | 1.13.8 | Validação e formatação internacional de telefones no Financeiro | MIT — [licença preservada](vendor-licenses/libphonenumber-js.txt) |
| [Font Awesome Free](https://fontawesome.com) | 7.3.0 | Ícones da interface | Código MIT, ícones CC BY 4.0 e fontes SIL OFL 1.1; créditos preservados no arquivo distribuído |
| [esbuild](https://github.com/evanw/esbuild) | 0.28.1 | Montagem do JavaScript do Validador Projudi | MIT |
| [Extensões Jurídicas](https://github.com/codacoisa/extensoes-juridicas) | projeto externo | Origem dos backups exibidos pela Central de Guias | Repositório de origem creditado na própria Central |

Os componentes visuais próprios utilizam SVGs escritos para o OfficeJur e não dependem de bibliotecas externas de ícones.

Dependências transitivas do Validador Projudi e suas licenças estão registradas
em `apps/validador-projudi/package-lock.json`.

## 🧪 Ferramentas de desenvolvimento

| Projeto | Versão | Uso no OfficeJur | Licença |
| --- | --- | --- | --- |
| [Playwright](https://playwright.dev/) | 1.62.0 | Testes automatizados em navegador real | Apache-2.0 |
| [axe-core para Playwright](https://github.com/dequelabs/axe-core-npm) | 4.12.1 | Auditoria automatizada WCAG A/AA | MPL-2.0 |

Essas ferramentas não são incorporadas ao site publicado. Suas dependências
transitivas e versões ficam registradas no `package-lock.json` da raiz.

## 🌐 Serviços externos

GitHub, GitHub Gists, Mercado Pago, Cloudflare Workers, WhatsApp, Google Maps,
Jusfy e CDNs públicas não integram o Software e permanecem sujeitos aos termos e
marcas de seus respectivos operadores.

## 📌 Obrigações de redistribuição

Quem redistribuir o OfficeJur deverá:

- preservar os textos de licença incorporados aos componentes;
- manter os avisos de copyright e atribuição exigidos;
- conferir o lockfile e os pacotes efetivamente distribuídos; e
- atualizar este arquivo ao adicionar, remover ou atualizar dependências.
