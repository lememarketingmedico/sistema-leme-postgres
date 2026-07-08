# Sistema LEME v99 — cadastro de clientes em blocos

Esta versão reorganiza a área de informações do cliente para facilitar edição e leitura.

## Ajustes

- Remove campos repetidos de login do Instagram e Facebook.
- O campo Instagram/@ também é salvo internamente como login do Instagram para manter compatibilidade.
- O campo Facebook/Página também é salvo internamente como login do Facebook para manter compatibilidade.
- Organiza o cadastro em blocos:
  - Dados principais
  - Contato e aprovação
  - Google, Drive e produção
  - Redes sociais
  - E-mail, domínio e site
  - Financeiro
- Mantém compatibilidade com campos antigos já salvos no banco.
- Atualiza cache de frontend para `v99`.

## Depois de subir

Abra o sistema com:

```text
https://www.sistemaleme.com.br/?v=99
```
