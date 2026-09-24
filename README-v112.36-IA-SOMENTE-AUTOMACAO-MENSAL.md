# V112.36 — IA somente na automação mensal

O Sistema LEME agora identifica a origem de cada execução enviada ao n8n.

## Execuções manuais

Os botões de gerar PDF e de rodar/enviar ao WhatsApp trabalham somente com o relatório original do Local Radar. O agente da OpenAI e o Gotenberg não são executados.

O webhook recebe:

- `execution_mode: manual_whatsapp`
- `run_ai: false`

O WhatsApp recebe somente o PDF do mapa e o Google Drive armazena somente esse documento.

## Automação mensal

Quando a opção de rodada mensal está ativa e o processamento ocorre automaticamente, o webhook recebe:

- `execution_mode: monthly_automatic`
- `run_ai: true`

Nesse caso, o fluxo envia e armazena dois documentos:

1. PDF original do Local Radar.
2. PDF da auditoria GBP gerado pela IA e convertido pelo Gotenberg.

## Workflow

Importe `LEME-Local-Radar-V112.36-IA-SOMENTE-MENSAL.json`, confira as credenciais e desative o workflow anterior que utiliza o mesmo webhook.
