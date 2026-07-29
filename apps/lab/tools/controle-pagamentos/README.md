# Controle de Pagamentos

App estático para GitHub Pages que guarda pessoas e pagamentos mensais no navegador e pode sincronizar tudo no Gist privado global do OfficeJur.

## Execução

O módulo é publicado pelo workflow do OfficeJur em `/officejur/lab/controle-pagamentos/`. Durante o desenvolvimento, ele pode ser testado pelo site montado com `scripts/build-site.sh`.

## Gist

Na área **Configurações** do OfficeJur, informe:

- Gist ID global, se já existir.
- Token do GitHub com permissão para Gists.

O Gist ID, o token e a sincronização automática são compartilhados com os demais módulos no mesmo navegador e só podem ser alterados na área central. O Controle de Pagamentos não possui configuração própria de Gist e usa sempre o arquivo `controle-pagamentos.json`. Sempre que é aberto com o Gist configurado, ele baixa, mescla e publica seu arquivo. Os dados locais continuam funcionando mesmo sem Gist configurado.
