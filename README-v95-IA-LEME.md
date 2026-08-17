# Sistema LEME v88 — proteções, correções e estabilidade

## Principais correções

- Arquivos `app.js`, `crm.js`, `styles.css` e `crm.css` agora têm versionamento `?v=88` para reduzir cache no navegador/celular.
- Backend agora envia `Cache-Control: no-store` para HTML, JS e CSS.
- Log do servidor atualizado para v88 e `package.json` atualizado para `88.0.0`.
- Exclusão de evento agora grava no PostgreSQL pelo endpoint `/webhook/deletar-evento`.
- Exclusão de cliente agora pode apagar publicações, eventos, tráfego e movimentações financeiras vinculadas em uma transação.
- Caixinhas padrão do financeiro não podem mais ser excluídas, apenas editadas.
- Registro de pagamento de cliente agora usa endpoint transacional `/webhook/registrar-pagamento-cliente`.
- Desfazer pagamento usa endpoint `/webhook/desfazer-pagamento-cliente`.
- Senhas antigas em texto puro são migradas para hash na inicialização.
- Listagem de colaboradores não retorna mais senha nem hash para o frontend.
- Endpoints `/api` e `/webhook` agora exigem sessão ou `x-api-key` do n8n.
- Login agora é feito pelo backend em `/api/login`, com token de sessão.
- Tempo real `/api/realtime` passa a exigir token via query string.
- CRM recebeu cabeçalhos de autenticação nas chamadas ao backend.
- Criado endpoint protegido `/api/system-health` para conferir tamanho do banco, tabelas e sessões ativas.

## Atenção importante para n8n

Como os endpoints `/api` e `/webhook` ficaram protegidos, os fluxos do n8n precisam enviar o header:

```txt
x-api-key: mesmo valor configurado em N8N_API_KEY no EasyPanel
```

Sem esse header, o n8n não conseguirá acessar `/api/sync` nem os webhooks internos do sistema.

## Login

Na primeira entrada depois da atualização, sessões antigas sem token serão removidas e o sistema pedirá login novamente.

Usuários já existentes continuam funcionando. Na primeira autenticação, senhas antigas em texto puro são convertidas para hash.

## Endpoint de saúde

Com usuário logado, é possível consultar:

```txt
/api/system-health
```

Ele retorna:

- versão do sistema
- tamanho atual do banco
- tamanho por tabela
- número de sessões ativas
- horário da consulta
