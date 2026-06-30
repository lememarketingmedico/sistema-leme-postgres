# Sistema LEME v77 PostgreSQL

Esta versão mantém o visual do sistema e troca a persistência principal para PostgreSQL.

## Arquitetura

- O frontend continua sendo o Sistema LEME que a equipe usa no navegador.
- O backend Node/Express serve o frontend e expõe endpoints compatíveis com os webhooks atuais.
- O PostgreSQL é o banco oficial.
- O n8n continua sendo usado apenas para automações: Drive, WhatsApp, relatório, blog, anexos e aprovações.

## Como o vínculo com n8n funciona

O sistema chama endpoints locais como `/webhook/criar-publicacao` e `/webhook/listar-publicacoes`.
Esses endpoints agora são atendidos pelo backend e salvam no PostgreSQL.

Para automações externas, o backend encaminha para o n8n usando variáveis de ambiente:

- `N8N_DRIVE_WEBHOOK_URL`
- `N8N_APPROVAL_WEBHOOK_URL`
- `N8N_BLOG_WEBHOOK_URL`
- `N8N_REPORT_WEBHOOK_URL`
- `N8N_CRM_UPLOAD_WEBHOOK_URL`

Assim, criar/editar/listar dados não depende mais das Data Tables do n8n.

## Endpoints principais

### Leitura

- `POST /webhook/listar-clientes`
- `POST /webhook/listar-colaboradores`
- `POST /webhook/listar-publicacoes`
- `POST /webhook/listar-eventos`
- `POST /webhook/listar-trafego-pago`
- `POST /webhook/crm-listar-prospects`
- `POST /webhook/crm-listar-acoes`

### Escrita

- `POST /webhook/criar-cliente`
- `POST /webhook/criar-colaborador`
- `POST /webhook/criar-publicacao`
- `POST /webhook/atualizar-publicacao`
- `POST /webhook/deletar-publicacao`
- `POST /webhook/criar-evento`
- `POST /webhook/salvar-trafego-pago`
- `POST /webhook/crm-criar-prospect`
- `POST /webhook/crm-atualizar-prospect`
- `POST /webhook/crm-deletar-prospect`
- `POST /webhook/crm-criar-acao`
- `POST /webhook/crm-atualizar-acao`
- `POST /webhook/crm-deletar-acao`
- `POST /webhook/crm-converter-cliente`

### Automações encaminhadas ao n8n

- `POST /webhook/webhook-drive`
- `POST /webhook/enviar-aprovacao`
- `POST /webhook/enviar-blog`
- `POST /webhook/enviar-relatorio`
- `POST /webhook/crm-upload-anexo`

## Deploy no EasyPanel via GitHub

1. Crie um repositório no GitHub.
2. Suba todos os arquivos desta pasta para o repositório.
3. No EasyPanel, crie um projeto, por exemplo `sistema-leme`.
4. Crie um serviço Postgres com:
   - Database: `sistema_leme`
   - User: `sistema_leme`
   - Password: uma senha forte.
5. Crie um App Service apontando para o GitHub.
6. Use o Dockerfile da raiz do projeto.
7. Configure as variáveis de ambiente do App Service.
8. Aponte o domínio para o serviço do app.
9. Faça deploy.
10. Abra `/health` para confirmar se banco e API estão ok.

## Variáveis de ambiente do App Service

```env
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://sistema_leme:SENHA_DO_POSTGRES@NOME_DO_SERVICO_POSTGRES:5432/sistema_leme
CORS_ORIGIN=https://www.sistemaleme.com.br
N8N_API_KEY=crie_uma_chave_forte
N8N_DRIVE_WEBHOOK_URL=https://n8n.adati.app.br/webhook/webhook-drive
N8N_APPROVAL_WEBHOOK_URL=https://n8n.adati.app.br/webhook/enviar-aprovacao
N8N_BLOG_WEBHOOK_URL=https://n8n.adati.app.br/webhook/enviar-blog
N8N_REPORT_WEBHOOK_URL=https://n8n.adati.app.br/webhook/enviar-relatorio
N8N_CRM_UPLOAD_WEBHOOK_URL=https://n8n.adati.app.br/webhook/crm-upload-anexo
TZ=America/Sao_Paulo
```

## Migração dos dados antigos

1. Na versão antiga, vá em Configurações.
2. Clique em `Baixar dados do sistema`.
3. Salve o JSON.
4. Na VPS, execute:

```bash
npm run import:json -- /caminho/leme-flow-dados.json
```

Se usar EasyPanel sem terminal direto, rode temporariamente o comando no console do container do app.

## Testes pós-deploy

- `/health` deve responder `database: ok`.
- Criar publicação.
- Editar publicação.
- Excluir publicação.
- Arrastar publicação no calendário.
- Criar cliente.
- Criar colaborador.
- Criar evento.
- Abrir CRM.
- Criar prospect.
- Registrar ação.
- Converter prospect em cliente.
- Acionar Drive.
- Enviar aprovação.

## Observação importante

O modo visual do sistema foi preservado. A troca principal está na camada de persistência.
O nome dos campos e endpoints antigos foi mantido para reduzir risco de quebra.
