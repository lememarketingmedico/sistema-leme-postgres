# V111 — Referências, calendário LEME, bullets e vídeo

## Publicações
- Novo campo **Referências** nos cards de edição, disponível tanto para clientes quanto para a LEME.
- Aceita vários links, um por linha, e salva os links junto da publicação.

## Calendário mensal exclusivo da LEME
- Usa `Drive da LEME` salvo em Informações da LEME (`drive_url`).
- Endpoint exclusivo: `POST /webhook/leme-calendario-mensal`.
- Não altera o fluxo existente de clientes.
- Chamada de contexto: `{ "action": "context" }` retorna o perfil e `drive_url`.
- Chamada de gravação: enviar `{ "publicacoes": [...] }`; o backend força `cliente_id = "leme-interno"` e cria/atualiza somente cards do calendário LEME.
- Autenticação para n8n: header `x-api-key` com a `N8N_API_KEY` já usada pelo sistema.

## Artes
- Novo comando: linha iniciada por `==` vira bullet point `•`.
- Twitter + imagem, Twitter + 2 imagens e Foto + gradiente passam a aceitar imagem ou vídeo.
- Vídeos mantêm os controles de enquadramento horizontal/vertical.
- Cada vídeo permite escolher **Exportar com áudio** ou sem áudio.
- Os vídeos do editor são enviados ao backend e persistidos no PostgreSQL, para continuarem disponíveis depois de reabrir a publicação ou depois de um novo deploy.
- Limite de 15 MB por arquivo de vídeo.
- Artes com vídeo são exportadas em WebM; artes sem vídeo continuam em PNG. Carrosséis mistos geram ZIP com PNG e WebM conforme cada slide.
