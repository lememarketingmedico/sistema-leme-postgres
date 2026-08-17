# v96 - IA LEME com interface tipo chat

- A aba IA LEME saiu da lista simples do menu e virou botão destacado na lateral, no estilo do GBP LEME.
- O chat foi redesenhado para ficar mais parecido com o ChatGPT.
- Campo de digitação fica fixo na parte inferior da área do chat.
- Mensagens rolam dentro do painel, sem precisar descer a página inteira.
- Backend agora usa `N8N_CHAT_WEBHOOK_URL` quando configurada e, se não existir, usa o webhook padrão de teste `https://n8n.adati.app.br/webhook/chat-ia-leme-teste`.
- Cache atualizado para v96.
