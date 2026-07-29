# 🤝 Como contribuir com o OfficeJur

Obrigado pelo interesse em melhorar o OfficeJur. Este projeto recebe
contribuições mediante revisão técnica e **cessão expressa dos direitos
patrimoniais sobre cada contribuição aceita**.

## 🧭 Antes de começar

1. Confira se já existe issue ou discussão sobre a mudança.
2. Para alterações relevantes, proponha primeiro o problema e a solução.
3. Não inclua dados reais de clientes, credenciais, segredos ou documentos
   protegidos.
4. Verifique as licenças de qualquer material de terceiros.
5. Leia a [licença do projeto](LICENSE.md), o
   [acordo de cessão](CONTRIBUTOR-ASSIGNMENT-AGREEMENT.md) e os
   [avisos de terceiros](THIRD-PARTY-NOTICES.md).

## ⚖️ Cessão patrimonial obrigatória

O OfficeJur utiliza licenciamento público source-available, licenciamento
comercial e conversão futura de versões para AGPLv3. Para que o mantenedor possa
preservar esse modelo, contribuições somente poderão ser incorporadas após a
aceitação do
[Contributor Assignment Agreement](CONTRIBUTOR-ASSIGNMENT-AGREEMENT.md).

A cessão:

- incide somente sobre a contribuição identificada pelo pull request e seus
  commits;
- é total, definitiva, exclusiva, mundial e pelo prazo legal de proteção;
- ocorre expressamente a título gratuito, sem remuneração presente ou futura;
- permite adaptação, distribuição, exploração comercial e relicenciamento,
  inclusive sob licenças públicas ou proprietárias; e
- não transfere direitos morais indisponíveis por lei.

Uma frase solta no pull request não substitui o acordo. Na primeira contribuição,
o mantenedor poderá solicitar uma via assinada eletronicamente ou por outro meio
escrito que identifique o colaborador e a contribuição. O pull request só será
mesclado depois da confirmação de aceite.

## 🛠️ Fluxo de contribuição

1. Crie uma branch curta e focada.
2. Faça mudanças pequenas, rastreáveis e coerentes.
3. Preserve movimentações de arquivos no histórico sempre que possível.
4. Atualize testes, documentação e avisos de terceiros quando necessário.
5. Execute as verificações aplicáveis.
6. Abra um pull request e preencha integralmente o modelo.

## ✅ Verificações locais

Na raiz do repositório:

```bash
npm ci
npx playwright install chromium
npm run test:browser
./scripts/build-site.sh
node scripts/validate-site.mjs
```

Para o Financeiro:

```bash
cd apps/financeiro
npm test
```

Para o Validador Projudi:

```bash
cd apps/validador-projudi
npm ci
npm run check
```

## 🤖 Uso de inteligência artificial

Contribuições produzidas com auxílio de IA são aceitas somente quando o
colaborador:

- revisa e compreende integralmente o conteúdo enviado;
- assume responsabilidade pela contribuição;
- verifica riscos de reprodução de material de terceiros;
- informa no pull request as ferramentas relevantes utilizadas; e
- adiciona a coautoria exigida pelas regras de commit do repositório quando
  aplicável.

Ferramentas de IA não são tratadas como autoras, cedentes ou titulares.

## 🧩 Dependências e materiais externos

Não adicione biblioteca, imagem, fonte, ícone, texto ou modelo externo sem:

- identificar a origem e a versão;
- confirmar compatibilidade de licença;
- preservar o texto de licença e os créditos exigidos; e
- atualizar [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

## 🔐 Segurança e privacidade

Vulnerabilidades não devem ser publicadas em issues. Siga o processo descrito
em [SECURITY.md](SECURITY.md).

Todo dado de teste deve ser fictício. Pull requests contendo dados pessoais,
sigilosos ou credenciais serão fechados e poderão exigir limpeza do histórico.

## 📝 Commits

Siga o arquivo `.gitmessage`: mensagens em português do Brasil, verbo no
infinitivo, tipo convencional e primeira linha com até 72 caracteres. Declare a
coautoria de IA quando ela tiver contribuído materialmente.

## 🚦 Aceitação

O envio de uma contribuição não garante sua incorporação. O mantenedor poderá
solicitar ajustes, recusar a contribuição ou encerrá-la por razões técnicas,
jurídicas, de produto, segurança ou manutenção.
