# Agenda de atendimentos

Módulo operacional do OfficeJur para registrar os atendimentos do escritório
em calendário mensal e agenda diária.

Cada atendimento deve apontar para um cliente cadastrado em
`financeiro/clientes` ou para uma pessoa do Financeiro que ainda não seja
cliente. Também deve indicar ao menos um integrante cadastrado em
`financeiro/equipe`. Os vínculos são gravados por ID, e não por nome, para
continuarem auditáveis quando um cadastro for alterado.

O domínio próprio é sincronizado no Gist global como
`officejur-agendamentos.json`. Durante a sincronização, o módulo também lê e
mescla os domínios de pessoas, clientes e equipe do Financeiro, usando o mesmo
IndexedDB local e a mesma política de proteção da nuvem.

Não há dados demonstrativos. O módulo só exibe e permite selecionar cadastros
que existam nos dados financeiros locais ou sincronizados.
