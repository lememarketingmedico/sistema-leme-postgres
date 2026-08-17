# v95 — IA LEME

## O que entrou

- Nova aba lateral: **IA LEME**.
- Chat interno com histórico salvo localmente no navegador.
- Campo de configuração para o webhook do chat.
- Backend encaminha `/webhook/chat-ia-leme` para o n8n usando a env `N8N_CHAT_WEBHOOK_URL`.
- Menu lateral mais compacto para caber todas as abas.

## Variável nova no EasyPanel

```env
N8N_CHAT_WEBHOOK_URL=https://n8n.adati.app.br/webhook/chat-ia-leme-teste
```

## Fluxo esperado

Sistema LEME → `/webhook/chat-ia-leme` → backend → n8n → `/api/sync` → IA responde → Sistema mostra no chat.

## Segurança

O chat pode responder dados sensíveis, como acessos e senhas cadastradas nos clientes. Use apenas internamente.
