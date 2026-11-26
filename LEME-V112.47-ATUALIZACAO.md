# Sistema LEME V112.47

Atualização de usabilidade, segurança e monitoramento de comentários Meta.

## Alterações

- Publicações do dia e calendário usam atualização otimista protegida contra respostas antigas do tempo real.
- A página principal **Publicações** e a subpágina de cliente **Publicações** foram removidas; os dados e calendários continuam intactos.
- A análise rápida do Local Radar agora permite mover o centro do grid no mapa e baixar o PDF padronizado sem cadastrar cliente.
- Senhas de clientes são criptografadas em repouso, mascaradas nas listagens, reveladas por até 30 segundos e auditadas.
- Nova aba **Comentários** em cada cliente, com vínculo Instagram/Facebook, ativação, inscrição da Página na Meta e histórico de envios.
- Banco com deduplicação persistente, tentativas com backoff e status de WhatsApp.
- Workflow único do n8n em `n8n/LEME-Monitoramento-Comentarios-Meta.json`.
- Guia completo em `docs/MONITORAMENTO-COMENTARIOS-META.md`.

## EasyPanel

Confirme as variáveis:

```env
CLIENT_INTEGRATION_ENCRYPTION_KEY=chave-mestra-longa-exclusiva
N8N_LEME_SECRET=mesmo-segredo-do-n8n
META_GRAPH_VERSION=v27.0
```

Não troque a chave de criptografia depois do deploy sem um plano de rotação. As migrações são executadas automaticamente ao iniciar a aplicação.
