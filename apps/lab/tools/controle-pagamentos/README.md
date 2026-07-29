# Controle de Pagamentos

App estático para GitHub Pages que guarda pessoas e pagamentos mensais no navegador e pode sincronizar tudo no Gist privado global do OfficeJur.

## Execução

O módulo é publicado pelo workflow do OfficeJur em `/officejur/lab/controle-pagamentos/`. Durante o desenvolvimento, ele pode ser testado pelo site montado com `scripts/build-site.sh`.

## Gist

Na área **Configurações** do OfficeJur, informe:

- Gist ID global, se já existir.
- Token do GitHub com permissão para Gists.

Na engrenagem do Controle de Pagamentos permanece apenas o nome do arquivo deste módulo, por padrão `controle-pagamentos.json`, e a opção de sincronização automática. O Gist ID e o token são compartilhados com os demais módulos no mesmo navegador e só podem ser alterados na área central. Sempre que o Controle de Pagamentos é aberto com o Gist configurado, ele baixa, mescla e publica seu arquivo. Os dados locais continuam funcionando mesmo sem Gist configurado.
