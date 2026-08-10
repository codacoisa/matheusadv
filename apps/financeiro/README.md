# Financeiro Jurídico

Módulo financeiro do OfficeJur. Controla clientes, casos, honorários, recebimentos, despesas, custas, repasses, contas e inadimplência.

Clientes e casos possuem cadastros independentes. O cliente reúne dados pessoais e de contato; nome completo, CPF válido, data de nascimento e telefone são obrigatórios. O CPF não pode ser repetido entre clientes. Telefones marcados como WhatsApp possuem atalho direto para conversa. No endereço, logradouro, número, quadra e lote são campos separados; termos que identificam esses complementos são retirados do logradouro durante a digitação e o formulário indica o campo correto.

Todo processo ou caso judicial, administrativo, extrajudicial ou consultivo deve apontar para um cliente previamente cadastrado. O número ou referência é único, desconsiderando diferenças de máscara, pontuação, espaços, acentos e maiúsculas. O sistema bloqueia casos sem cliente e também impede excluir clientes que ainda possuam casos ou pacotes.

Cada caso pode ter contratação própria, integrar um pacote de honorários específico ou deixar a contratação em branco. Um mesmo cliente pode possuir vários pacotes. Todos os casos vinculados ao mesmo pacote exibem os valores contratado, recebido e em aberto de forma conjunta.

As condições financeiras contemplam valor à vista, entrada com parcelas, mensalidades, etapas, êxito, contratação mista e condição personalizada. Valores fixos válidos geram recebíveis automaticamente. Cada lançamento aceita realização integral ou parcial; nesse caso, o valor realizado entra no caixa e o saldo continua a receber e integra a inadimplência após o vencimento. Quando o valor realizado supera a parcela, o sistema pede confirmação antes de distribuir o excedente nas próximas parcelas da mesma contratação, em ordem de vencimento e com a mesma data, conta e forma de pagamento. Se a distribuição for recusada ou não houver parcela futura, o valor fica limitado à parcela atual. Ao editar a contratação, somente recebíveis sem qualquer realização são recalculados; parcelas integral ou parcialmente realizadas permanecem preservadas no histórico.

O módulo **Equipe** cadastra sócios, advogados, associados, estagiários, administrativos, correspondentes e prestadores e impede CPF/CNPJ repetido quando o documento é informado. Em cada caso é possível definir responsáveis, tipo de atuação e percentual de participação. A projeção individual considera somente o valor efetivamente realizado das receitas vinculadas ao caso; receitas de pacotes permanecem separadas.

Toda receita deve ser vinculada a um cliente e pode apontar para um pacote ou para um caso específico. Quando houver vínculo com um caso, o lançamento grava uma fotografia da equipe, dos percentuais e dos valores individuais naquele momento. Essa distribuição histórica não muda se a composição futura do caso for alterada. Despesas gerais do escritório podem permanecer sem cliente; despesas relacionadas devem ser vinculadas ao cliente, pacote ou caso correspondente.

Somente dados no esquema atual são aceitos. Um conteúdo inválido ou incompatível
bloqueia a escrita e pode ser exportado em formato bruto para recuperação, sem
inicialização silenciosa com um cadastro vazio.

Os dados ficam no navegador e podem ser sincronizados com o Gist secreto global definido na área **Configurações** do OfficeJur. Gist ID, token e sincronização automática valem para todos os módulos sincronizáveis no mesmo navegador e não podem ser alterados dentro do Financeiro.

O módulo armazena cada domínio de forma independente: `financeiro-clientes.json`, `financeiro-casos.json`, `financeiro-pacotes.json`, `financeiro-equipe.json`, `financeiro-lancamentos.json`, `financeiro-cobrancas.json`, `financeiro-contas.json` e `financeiro-documentos.json`. Os relacionamentos usam IDs estáveis, por exemplo `clientId`, `caseId`, `packageId`, `personId` e `entryId`. Cada arquivo possui schema no namespace `officejur/`, versão numérica, data de atualização, registros ativos, exclusões e estratégia de mesclagem próprios. No navegador, os sete domínios operacionais ficam no IndexedDB `officejur-financeiro` e são gravados em uma única transação.

Cada PDF é codificado em Base64 e sincronizado em seu próprio payload `financeiro-pdf-<id>.b64`; ele só é baixado quando aberto ou baixado. O cache local dos PDFs usa IndexedDB para não disputar espaço com os demais dados. Atualizações usam a revisão do Gist para impedir sobrescrita concorrente por outro navegador. O token do GitHub nunca é gravado no repositório: permanece apenas no navegador. Um Gist secreto não aparece em buscas, mas qualquer pessoa que obtenha sua URL poderá visualizar o conteúdo; Base64 não é criptografia.

O sistema inicia completamente vazio, sem clientes, casos, equipe, configurações ou lançamentos demonstrativos. Dados existentes devem ser recuperados exclusivamente após configurar e mesclar o Gist de forma consciente.

Não há compilação do código da aplicação. O workflow do OfficeJur publica este módulo em `/officejur/financeiro/`.

## Mercado Pago

O módulo **Cobranças** gera links do Checkout Pro vinculados aos recebíveis. Por segurança, a credencial privada não é armazenada na página estática.

Para configurar a integração sem terminal, abra a central de ajuda:

**[Ajuda de configuração do Mercado Pago](ajuda-mercado-pago.html)**

O código do serviço protegido permanece em `worker/src/index.js`.

## Referências externas

As bibliotecas, plataformas, APIs e serviços externos usados pelo projeto estão
documentados em **[Referências externas](REFERENCIAS-EXTERNAS.md)**, com suas
finalidades, origens e licenças aplicáveis.
