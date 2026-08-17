# Sistema LEME v78 — Tempo real + n8n

## O que mudou

A v78 adiciona tempo real entre dispositivos usando Server-Sent Events.

Quando um usuário cria, edita, exclui ou move uma publicação, o backend salva no PostgreSQL e avisa todos os navegadores conectados pelo endpoint:

```text
GET /api/realtime
```

Os outros dispositivos recebem o aviso e sincronizam os dados automaticamente pelo próprio backend.

## Importante

Para tempo real funcionar no EasyPanel, mantenha o app com 1 instância/réplica.

Se no futuro usar mais de uma réplica do app, será necessário adicionar Redis Pub/Sub para distribuir os eventos entre containers.

## Como o n8n fica vinculado agora

O navegador não deve chamar o n8n direto.

O navegador chama o backend:

```text
/webhook/webhook-drive
/webhook/enviar-aprovacao
/webhook/enviar-blog
/webhook/enviar-relatorio
/webhook/crm-upload-anexo
```

O backend encaminha para o n8n usando as variáveis de ambiente:

```env
N8N_DRIVE_WEBHOOK_URL=https://n8n.adati.app.br/webhook/webhook-drive
N8N_APPROVAL_WEBHOOK_URL=https://n8n.adati.app.br/webhook/enviar-aprovacao
N8N_BLOG_WEBHOOK_URL=https://n8n.adati.app.br/webhook/enviar-blog
N8N_REPORT_WEBHOOK_URL=https://n8n.adati.app.br/webhook/enviar-relatorio
N8N_CRM_UPLOAD_WEBHOOK_URL=https://n8n.adati.app.br/webhook/crm-upload-anexo
```

Assim, quando o n8n devolver um link do Drive, o backend salva esse link no PostgreSQL e avisa os outros dispositivos em tempo real.

## Rotina n8n chamando o sistema

Quando o n8n precisar mexer no sistema, use HTTP Request para a API própria.

Exemplo para colocar publicações da próxima semana em andamento:

```text
POST https://SEU_DOMINIO/api/jobs/proxima-semana-em-andamento
```

Headers:

```text
x-api-key: SUA_N8N_API_KEY
Content-Type: application/json
```

Body:

```json
{
  "action": "set_next_week_in_progress"
}
```

Resposta:

```json
{
  "ok": true,
  "updated": 18,
  "range": {
    "inicio": "2026-07-05",
    "fim": "2026-07-11"
  }
}
```

## O que configurar no EasyPanel

No serviço do app, em Ambiente, configure:

```env
N8N_API_KEY=uma_chave_forte
N8N_DRIVE_WEBHOOK_URL=https://n8n.adati.app.br/webhook/webhook-drive
N8N_APPROVAL_WEBHOOK_URL=https://n8n.adati.app.br/webhook/enviar-aprovacao
N8N_BLOG_WEBHOOK_URL=https://n8n.adati.app.br/webhook/enviar-blog
N8N_REPORT_WEBHOOK_URL=https://n8n.adati.app.br/webhook/enviar-relatorio
N8N_CRM_UPLOAD_WEBHOOK_URL=https://n8n.adati.app.br/webhook/crm-upload-anexo
```

Depois clique em Implantar.

## Como testar tempo real

1. Abra o sistema no computador.
2. Abra o mesmo sistema no celular ou em aba anônima.
3. Em um dispositivo, arraste uma publicação para outro dia.
4. No outro dispositivo, a mudança deve aparecer sozinha em poucos segundos.

Se não aparecer, confira:

- se o serviço foi implantado depois de subir a v78;
- se está usando a v78;
- se só existe uma réplica do app;
- se o navegador não está com cache antigo, use Ctrl + F5;
- se o console do navegador não mostra erro em `/api/realtime`.
