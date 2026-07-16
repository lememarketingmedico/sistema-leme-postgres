# v102 — Correção do salvamento da legenda

- Corrige a coleta do campo `legenda` ao criar ou editar uma publicação.
- A legenda agora é enviada ao backend e persistida no JSONB da publicação no PostgreSQL.
- Preserva o conteúdo original do campo, incluindo parágrafos, linhas em branco, emojis e quebras de linha.
- A legenda permanece disponível após fechar a demanda, atualizar a página ou sincronizar os dados.
- Mantém as demais telas, integrações e regras da v101 sem alterações.
