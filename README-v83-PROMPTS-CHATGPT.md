# Sistema LEME v83 — Prompts prontos do ChatGPT

## O que entrou

- Nova aba **Prompts** na barra lateral.
- Cadastro de prompts por tipo de post: Todos, Post único, Carrossel, Reels e Stories.
- Prompts com variáveis automáticas, como `{{titulo}}`, `{{nome_cliente}}`, `{{especialidade}}`, `{{formato}}`, `{{data_publicacao}}`, `{{legenda}}` e `{{pasta_drive}}`.
- Campo no cadastro do cliente: **Link do projeto no ChatGPT**.
- No modal da publicação, botão **Copiar prompt + abrir ChatGPT**.
- No menu do botão direito no calendário, opção **Copiar prompt + abrir ChatGPT**.
- O sistema copia o prompt já preenchido para a área de transferência e abre o link do projeto do cliente no ChatGPT.
- Prompts salvos no PostgreSQL, com endpoints próprios.

## Endpoints adicionados

- `/webhook/listar-prompts`
- `/webhook/criar-prompt`
- `/webhook/atualizar-prompt`
- `/webhook/deletar-prompt`

## Banco

Nova tabela:

```sql
prompt_templates
```

A tabela é criada automaticamente pelo arquivo de migração existente quando o sistema subir.

## Como usar

1. Entre na aba **Prompts**.
2. Cadastre um prompt e escolha o tipo de post.
3. Vá no cliente e cadastre o link do projeto do ChatGPT.
4. Abra uma demanda no calendário ou clique nela com o botão direito.
5. Clique em **Copiar prompt + abrir ChatGPT**.
6. No ChatGPT, pressione `Ctrl + V`.
