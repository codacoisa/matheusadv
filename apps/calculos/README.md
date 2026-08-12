# Cálculos Jurídicos

Módulo permanente do OfficeJur para memórias de cálculo reproduzíveis.

## Organização

- `pensao/`: página, assistente e PDF do cálculo de pensão alimentícia;
- `trabalhista/`: assistente, motor e PDF dos cálculos trabalhistas;
- `assets/`: catálogo, núcleo de cálculo compartilhado, armazenamento, sincronização, integração com o Financeiro, índices e estilos compartilhados.

## Calculadoras disponíveis

- **Atualização monetária simples** — fluxo enxuto para atualização, juros, multas,
  honorários e lançamentos de débito ou pagamento;
- **Atualização monetária completa** — fluxo em quatro etapas com dados do processo,
  índices por parcela, multas, honorários e custas processuais;
- pensão alimentícia, com assistente em quatro etapas;
- verbas trabalhistas, com assistente em cinco etapas inspirado no fluxo de
  conferência por competências;
- parcelas e abatimentos editáveis;
- INPC, IPCA e IPCA-E (IPCA-15 mensal) consultados no SIDRA/IBGE;
- Taxa Legal reproduzida a partir da Selic diária e do IPCA-15, conforme a Resolução CMN 5.171/2024;
- registros versionados em `officejur-calculos-juridicos.json`, usando a configuração global do Gist;
- PDF detalhado com parâmetros, memória por lançamento, séries e fontes.

O demonstrativo não substitui a conferência do título judicial, dos termos iniciais e dos critérios definidos no caso concreto.

## Contrato obrigatório de identificação

Todo cálculo publicado deve carregar `assets/finance-link.js` e
`assets/case-context.js`. O fluxo inicial é sempre cliente → caso/processo →
contexto de partes: o caso selecionado preenche número, título e partes
disponíveis, mas os campos continuam editáveis. A escolha do papel do cliente
é explícita; o sistema não presume que ele seja autor, réu, credor ou devedor.

Ao criar uma nova calculadora, use `OfficeJurCalculationCaseContext` para
validar o vínculo, aplicar o snapshot e preservar edições manuais. O formato
atual do cálculo deve ser usado desde a criação do registro.

No cálculo trabalhista, percentuais, bases, reflexos e pagamentos permanecem
editáveis. As premissas são declaradas no resultado e no PDF para permitir a
revisão pelo profissional responsável.
