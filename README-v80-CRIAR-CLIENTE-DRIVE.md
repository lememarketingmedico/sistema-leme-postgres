# v80 - Criar cliente com Drive e calendário automático

Esta versão mantém as correções da v79 e adiciona o disparo automático do n8n quando um novo cliente é criado no Sistema LEME.

## Nova variável de ambiente

Adicione no EasyPanel:

```env
N8N_CLIENT_WEBHOOK_URL=https://n8n.adati.app.br/webhook/criar-cliente-teste
```

## Como funciona

1. O usuário cria o cliente no Sistema LEME.
2. O backend salva o cliente no PostgreSQL imediatamente.
3. O backend dispara o n8n em segundo plano.
4. O n8n cria a pasta principal, subpastas, mês atual, próximo mês, datas e publicações.
5. O n8n atualiza o cliente com o link da pasta principal.
6. As novas publicações aparecem no sistema em tempo real.

O disparo do n8n é assíncrono para evitar que a tela de criação do cliente fique travada esperando a criação de todas as pastas no Google Drive.
