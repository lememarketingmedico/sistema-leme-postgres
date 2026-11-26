# Monitoramento de comentários Meta — LEME

## Arquitetura entregue

O Sistema LEME é a fonte central de clientes, vínculos, ativação, tokens protegidos, histórico, deduplicação e tentativas. O n8n possui um único webhook para toda a carteira: recebe o evento, valida a assinatura, normaliza Instagram/Facebook, consulta o cliente pelo ID da conta, registra de forma idempotente e envia ao grupo pela Evolution API.

Não existe lista de clientes no workflow. Ao cadastrar, editar ou desativar um cliente, use a aba **Comentários** dentro dele.

## Limitações reais da Meta

- A inscrição por cliente pode ser automatizada com `POST /{page-id}/subscribed_apps` e `subscribed_fields=feed`, usando Page Access Token.
- A seleção do campo Instagram `comments` é feita uma única vez no painel do aplicativo Meta; não é uma configuração repetida por cliente.
- O aplicativo precisa estar em modo Live, com empresa verificada e Advanced Access para as permissões usadas fora de contas com função no app.
- A documentação atual da Meta informa limitação de webhooks de comentários do Instagram para Reels. O fluxo processa comentários de mídia que a Meta efetivamente entregar e não promete cobertura integral de Reels.
- Direct, curtidas, exclusões e edições não são assinados/processados por este workflow. No Facebook, somente `feed` + `item=comment` + `verb=add` é aceito.

## Permissões

Solicite somente o necessário para as contas gerenciadas:

- `pages_show_list`
- `pages_manage_metadata`
- `pages_read_engagement`
- `pages_read_user_content` (quando o conteúdo de terceiros da Página exigir)
- `instagram_basic`
- `instagram_manage_comments`

As permissões precisam de App Review/Advanced Access quando o app atender clientes que não são usuários de teste/desenvolvimento do aplicativo.

## Configuração do aplicativo LEME Insights

1. No produto Webhooks do app, configure o callback de produção do n8n: `https://SEU-N8N/webhook/leme-meta-comments`.
2. Defina um Verify Token forte e coloque o mesmo valor em `META_WEBHOOK_VERIFY_TOKEN` no ambiente do n8n.
3. Em Instagram, assine o campo `comments` no painel do aplicativo.
4. Para Pages, mantenha o campo `feed`. A inscrição da Página é feita automaticamente pelo Sistema LEME.
5. Coloque o app em Live somente depois de concluir App Review, verificação empresarial, Política de Privacidade e exclusão de dados.
6. Nunca coloque App Secret, tokens Meta ou chaves da Evolution dentro do JSON do workflow.

## Variáveis do n8n

```env
META_WEBHOOK_VERIFY_TOKEN=valor-forte-e-aleatorio
META_APP_SECRET=app-secret-do-leme-insights
N8N_LEME_SECRET=o-mesmo-valor-do-backend
EVOLUTION_API_KEY=chave-da-evolution
NODE_FUNCTION_ALLOW_BUILTIN=crypto
```

O último item permite que o Code node calcule o HMAC SHA-256 sobre o corpo bruto. Se sua instalação bloqueia `$env` em nodes, desative `N8N_BLOCK_ENV_ACCESS_IN_NODE` ou substitua as expressões por credenciais nativas equivalentes, sem inserir os segredos no JSON exportado.

No node **CONFIGURAÇÃO — EDITE AQUI**, informe apenas URLs, instância, grupo e fuso horário.

## Variáveis do backend

```env
N8N_LEME_SECRET=o-mesmo-valor-do-n8n
CLIENT_INTEGRATION_ENCRYPTION_KEY=chave-mestra-longa-exclusiva
META_GRAPH_VERSION=v27.0
```

Mantenha `TOKEN_ENCRYPTION_SECRET` durante a transição. As senhas antigas em texto são criptografadas na próxima edição do cliente; o ideal é abrir e salvar cada cadastro após o deploy.

## Endpoints do Sistema LEME

### Painel autenticado

- `GET /api/clients/:clientId/comment-monitoring` — configuração mascarada e últimos 100 comentários.
- `PUT /api/clients/:clientId/comment-monitoring` — cria/edita IDs, token, ativação e regra de comentário próprio.
- `POST /api/clients/:clientId/comment-monitoring/subscribe` — instala o app na Página via Graph API.
- `POST /api/clients/:clientId/comment-monitoring/unsubscribe` — remove a inscrição e desativa.
- `POST /api/clients/:clientId/secrets/:field/reveal` — revela temporariamente uma senha do cofre e cria auditoria.

Exemplo de configuração:

```json
{
  "enabled": true,
  "instagram_account_id": "17841400000000000",
  "instagram_username": "doutor.exemplo",
  "facebook_page_id": "123456789012345",
  "facebook_page_name": "Dr. Exemplo",
  "page_access_token": "TOKEN_DA_PAGINA",
  "ignore_own_comments": true
}
```

### Automação n8n

Todas exigem `X-LEME-N8N-KEY`.

- `GET /api/automations/social-comments/resolve?provider=instagram&account_id=...`
- `POST /api/automations/social-comments/register`
- `POST /api/automations/social-comments/:id/delivery`
- `GET /api/automations/social-comments/retry-queue`

Registro normalizado:

```json
{
  "client_id": "uuid-do-cliente",
  "provider": "instagram",
  "account_id": "17841400000000000",
  "comment_id": "18000000000000000",
  "post_id": "17900000000000000",
  "parent_comment_id": "",
  "author_id": "123",
  "author_name": "usuario",
  "author_username": "usuario",
  "message": "Como faço para agendar?",
  "occurred_at": "2026-11-26T16:30:00.000Z",
  "publication_url": ""
}
```

A chave única `(provider, comment_id)` impede duplicidade de forma persistente. O texto é limitado a 4.000 caracteres, o payload bruto não é armazenado e tokens ficam criptografados em AES-256-GCM.

## Teste seguro

1. Faça deploy e confirme que as migrações subiram.
2. Importe `n8n/LEME-Monitoramento-Comentarios-Meta.json`, edite o node de configuração e ative o workflow.
3. Use a URL de produção, não a URL `/webhook-test/`, no painel Meta.
4. Verifique o callback no painel Meta.
5. Abra um cliente > **Comentários**, preencha IDs e Page Access Token, salve e clique **Inscrever na Meta**.
6. Faça um comentário externo numa publicação compatível.
7. Confirme: execução no n8n, linha no histórico do cliente e uma única mensagem no grupo.
8. Reenvie o mesmo payload: o endpoint deve responder `duplicate: true` e não mandar outra mensagem.
9. Pare temporariamente a Evolution para validar `failed`, backoff e a fila `/retry-queue`.

## Retenção e privacidade

O sistema armazena apenas os dados necessários para identificar e encaminhar o comentário público. Recomenda-se uma rotina de exclusão após 180 dias, acesso restrito à equipe, logs sem conteúdo sensível e nunca usar comentários para inferir condição de saúde. Não há resposta, ocultação ou exclusão automática.
