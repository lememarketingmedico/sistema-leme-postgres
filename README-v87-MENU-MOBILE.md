# Sistema LEME v79 — Correção de CRUD

Esta versão corrige o problema em que editar um colaborador criava um novo registro e o problema de criação de clientes com payload incorreto.

## Correções principais

- Backend aceita `client` e `cliente`.
- Backend aceita `collaborator` e `colaborador`.
- Criar, atualizar e deletar agora usam endpoints separados.
- Registros incorretos criados anteriormente com envelope errado são reparados automaticamente ao iniciar o app.
- Clientes e colaboradores só são excluídos quando não possuem vínculos.

## Novos endpoints internos

- `/webhook/atualizar-cliente`
- `/webhook/deletar-cliente`
- `/webhook/atualizar-colaborador`
- `/webhook/deletar-colaborador`

## Depois do deploy

1. Suba esta versão no GitHub.
2. Clique em Implantar no EasyPanel.
3. Aguarde o app reiniciar.
4. Abra o sistema com Ctrl + F5.
5. Clique em Atualizar dados.

Ao iniciar, o backend executa um reparo automático para remover/normalizar linhas criadas incorretamente pelo bug anterior.
