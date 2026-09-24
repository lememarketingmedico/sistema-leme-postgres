# V112.34 — Fluxo Gotenberg corrigido

Esta revisão existe para evitar a importação da cópia antiga do workflow.

Arquivo correto para importação:

`LEME-Local-Radar-V112.34-PDF-UNICO-GOTENBERG.json`

O fluxo importado aparece no n8n com o nome:

`LEME Local Radar V112.34 — PDF ÚNICO via Gotenberg`

## Saída única

O caminho final é:

1. Auditor GBP com IA
2. Montar HTML da auditoria
3. Converter HTML em arquivo
4. GOTENBERG — Gerar PDF único
5. Extrair PDF final
6. EVOLUTION — Enviar somente o PDF

Não há nó de envio da auditoria em texto ou divisão em várias mensagens.

O endpoint configurado é:

`https://leme-gotenberg.bnwvvh.easypanel.host/forms/chromium/convert/html`

Antes de ativar, configure o segredo e o grupo no nó `CONFIGURAÇÃO — EDITE AQUI`, confirme as credenciais e desative o workflow antigo com o mesmo webhook.
