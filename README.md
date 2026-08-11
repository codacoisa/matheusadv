# OfficeJur

Produto integrado de gestão e operações jurídicas para escritórios de advocacia.

> ⚖️ **Código-fonte disponível, mas não open source durante o período
> restrito.** O uso profissional ou em produção exige licença comercial. Cada
> versão é convertida para AGPLv3 dez anos após sua primeira disponibilização
> pública. Consulte a [licença completa](LICENSE.md).

O OfficeJur reúne, em um único monorepo, o portal interno, os geradores de documentos, o sistema financeiro, as ferramentas operacionais permanentes e um laboratório para recursos em avaliação.

## Módulos

- **Portal** — acesso centralizado às ferramentas.
- **Documentos** — procuração, declaração de hipossuficiência, contrato de honorários e ciência de audiência.
- **Financeiro Jurídico** — clientes, casos, equipe, honorários, receitas, despesas, cobranças e relatórios.
- **Validador Projudi** — conferência local de PDFs e assinaturas P7S antes do protocolo.
- **Lab** — ferramentas temporárias e experimentais, atualmente Controle de Pagamentos e Central de Guias.

## Organização

```text
config/
├── office.js                  # identidade, produto e implantação
├── document-config.js         # templates, cláusulas e identidade dos PDFs
└── document-templates/        # modelo DOCX e ativos gráficos documentais

apps/
├── portal/
│   └── assets/                 # estilos exclusivos da entrada do sistema
├── documentos/
│   ├── assets/                 # interface, utilitários, imagens e jsPDF compartilhados
│   ├── procuracao/
│   ├── hipossuficiencia/
│   ├── honorarios/
│   └── ciencia-audiencia/
├── financeiro/
├── lab/
│   ├── assets/catalog.js      # catálogo das ferramentas disponíveis
│   └── tools/
│       ├── controle-pagamentos/
│       └── central-guias/
└── validador-projudi/

packages/
└── ui/
    ├── assets/                 # identidade visual institucional compartilhada
    ├── app-switcher.js
    └── site-footer.js

tests/
└── browser/                    # navegação real e auditoria WCAG A/AA
```

## Configuração do escritório

A instalação é personalizada em `config/office.js`. Esse arquivo concentra o nome do escritório, nome curto, descrição institucional, identificação para cobranças, URLs da implantação, caminhos dos elementos visuais e o tema de cores aplicado em todos os módulos e nos PDFs.

Os módulos exibem o OfficeJur como produto e consomem os dados do escritório como contexto da instalação. Para trocar de escritório, edite a configuração e substitua os arquivos visuais indicados nela; não é necessário alterar cada aplicação.

`config/document-config.js` concentra a personalização dos geradores: metadados,
localidade padrão, profissionais, texto da parte contratada, cláusulas,
contatos do rodapé, recortes dos ativos gráficos e marcadores de
rascunho. As cores são lidas do tema de `config/office.js`. O modelo DOCX institucional fica em
`config/document-templates/modelo-institucional.docx.base64`, enquanto os
ativos usados nos PDFs ficam em `config/document-templates/pdf/`. Assim, a
troca de escritório fica limitada à configuração e aos arquivos da implantação,
sem misturar a identidade do cliente ao código do produto.

Os módulos continuam isolados internamente. Os geradores compartilham cabeçalho, estilos, utilitários de campos e rascunhos, imagens documentais e jsPDF em `apps/documentos/assets`; todo o sistema compartilha navegação, rodapé e imagens institucionais mantidos em `packages/ui`. Portal, Lab e Central de Guias mantêm marcação, estilos e comportamento em arquivos separados.

As bibliotecas de terceiros, suas versões, origens e licenças estão registradas
em [Avisos de terceiros](THIRD-PARTY-NOTICES.md).

## ⚖️ Licenciamento

O OfficeJur utiliza licenciamento duplo:

- [OfficeJur Source License 1.0](LICENSE.md) — permite estudo, auditoria,
  avaliação, testes, ensino simulado e contribuição, mas proíbe Uso em Produção
  durante o período restrito;
- [Licenciamento comercial](COMMERCIAL-LICENSE.md) — necessário para escritórios,
  profissionais, empresas, hospedagem, SaaS e demais usos operacionais; e
- **GNU AGPLv3 após dez anos** — a conversão ocorre separadamente para cada tag,
  release ou commit, conforme definido na licença.

Também fazem parte da política do projeto:

- [Aviso de autoria](NOTICE.md);
- [Notas sobre o modelo de licenciamento](LICENSING-NOTES.md);
- [Política de marcas](TRADEMARKS.md);
- [Como contribuir](CONTRIBUTING.md);
- [Acordo de cessão de contribuições](CONTRIBUTOR-ASSIGNMENT-AGREEMENT.md);
- [Política de segurança](SECURITY.md); e
- [Avisos de terceiros](THIRD-PARTY-NOTICES.md).

> 🔎 A licença é personalizada e deve ser revisada por advogado especializado
> antes de embasar contratos, cobrança ou fiscalização.

## Publicação

O workflow `Publicar OfficeJur` monta todas as aplicações em um único artefato estático e o publica no GitHub Pages:

- `/officejur/` — portal;
- `/officejur/configuracoes/` — conexões globais da instalação;
- `/officejur/documentos/<modulo>/` — geradores de documentos;
- `/officejur/financeiro/` — financeiro;
- `/officejur/validador-projudi/` — validação de PDFs e assinaturas P7S;
- `/officejur/lab/` — catálogo do Laboratório;
- `/officejur/lab/controle-pagamentos/` — controle simplificado em avaliação;
- `/officejur/lab/central-guias/` — leitura de backups e consulta de guias.

O site é majoritariamente estático, mas o Validador Projudi é compilado com
esbuild antes da publicação. O workflow valida, monta e injeta os componentes
compartilhados no artefato publicado. Antes da publicação, uma suíte abre todos
os módulos em Chromium, bloqueia erros de execução e aplica verificações
automatizadas WCAG A/AA com axe-core.

## Verificações locais

Na raiz do repositório:

```bash
npm ci
npx playwright install chromium
npm run test:browser
./scripts/build-site.sh
node ./scripts/validate-site.mjs
```

As verificações específicas do Financeiro, do worker do Mercado Pago e do
Validador Projudi continuam disponíveis em suas respectivas pastas.

## Dados e credenciais

Dados jurídicos e financeiros não são arquivos da aplicação e não devem ser versionados. A área permanente `/configuracoes/` concentra o Gist ID, o token, a sincronização automática e o guia completo de sincronização de um único Gist secreto no navegador. Os módulos sincronizáveis não possuem controles nem páginas de ajuda próprios para o Gist: apenas consomem essa configuração compartilhada e armazenam seus dados em arquivos fixos, separados e complementares. O Financeiro mantém arquivos próprios para clientes, casos, pacotes, equipe, lançamentos, cobranças, contas e documentos, relacionados por IDs; cada PDF codificado em Base64 fica em seu próprio payload e é baixado somente quando necessário. Ao abrir, cada módulo baixa, mescla e publica seus arquivos. O token do GitHub permanece somente no navegador. Um Gist secreto não aparece em buscas, mas não é privado: quem obtiver a URL poderá visualizar seu conteúdo, inclusive recuperar PDFs codificados em Base64. Credenciais privadas de integrações, como o Mercado Pago, permanecem em serviços protegidos.
