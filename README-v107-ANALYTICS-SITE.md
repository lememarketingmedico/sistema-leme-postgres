# Sistema LEME v107 — Analytics do Site

Esta versão adiciona ao sistema o módulo Analytics do Site, mantendo o plugin atual de Permalinks independente.

## O que está incluído

- bloco Integrações do Site dentro das Informações do Cliente;
- URL única do site, Key de Permalinks e Key própria do LEME Analytics;
- credenciais criptografadas no PostgreSQL e mascaradas na interface;
- teste de conexão com diagnóstico de Key inválida, plugin ausente e site indisponível;
- dashboard responsivo com filtros, cards, evolução, páginas, cidades, estados, origens e dispositivos;
- detalhes clicáveis de página e cidade;
- geração de PDF e envio manual pelo WhatsApp;
- agendamento mensal por cliente, sempre usando o mês fechado anterior;
- snapshots imutáveis de períodos fechados;
- histórico, callback, erros e reenvio;
- deduplicação do relatório automático por cliente/mês;
- workflow importável em `n8n-exemplos/LEME-Analytics-Relatorio-PDF-WhatsApp.json`.

## 1. Publicar o Sistema LEME

Faça backup do PostgreSQL e publique esta pasta no projeto do EasyPanel. A aplicação executa a migração automaticamente ao iniciar e cria:

- `client_integrations`;
- `analytics_snapshots`;
- `analytics_report_deliveries`.

Adicione ao ambiente do serviço web:

```env
N8N_ANALYTICS_REPORT_WEBHOOK=https://n8n.adati.app.br/webhook/leme-analytics-report
N8N_LEME_SECRET=use_um_segredo_longo_aleatorio_e_igual_no_n8n
CLIENT_INTEGRATION_ENCRYPTION_KEY=use_outra_chave_longa_estavel
```

Importante: não altere `CLIENT_INTEGRATION_ENCRYPTION_KEY` depois de salvar Keys de clientes. A troca impede a descriptografia das credenciais existentes.

## 2. Instalar o plugin WordPress

Use o arquivo separado `leme-analytics-1.0.0.zip`:

1. WordPress → Plugins → Adicionar plugin → Enviar plugin;
2. instale e ative;
3. abra Configurações → LEME Analytics;
4. copie a Key exibida;
5. no Sistema LEME, abra Cliente → Informações → Integrações do Site;
6. informe a URL e a Key do LEME Analytics;
7. salve e clique em Testar conexão.

Os dados começam a ser coletados após a ativação; não existe preenchimento retroativo. Administradores logados, bots e rotas técnicas são excluídos. Nenhum IP puro é persistido.

## 3. Importar e ativar o fluxo n8n

Importe `LEME-Analytics-Relatorio-PDF-WhatsApp.json` no n8n.

No ambiente do n8n, configure:

```env
N8N_LEME_SECRET=mesmo_valor_configurado_no_sistema
LEME_SYSTEM_URL=https://www.sistemaleme.com.br
LEME_GOTENBERG_URL=https://leme-gotenberg.bnwvvh.easypanel.host/forms/chromium/convert/html
```

Se a sua instalação bloquear o acesso de Code nodes às variáveis de ambiente, substitua no workflow o texto `COLE_AQUI_O_MESMO_N8N_LEME_SECRET_DO_EASYPANEL` pelo mesmo segredo do Sistema LEME.

Confirme as duas credenciais já referenciadas no fluxo:

- Evolution: `Evolution account`, instância `Leme Marketing Médico`;
- Google Drive: `Google Drive account`.

Depois, ative o workflow. O endpoint de produção deve aparecer exatamente como:

```text
https://n8n.adati.app.br/webhook/leme-analytics-report
```

O Schedule roda a cada 15 minutos. O Sistema LEME decide quais clientes venceram naquele dia/horário e impede duplicidade mensal.

## 4. Teste rápido recomendado

1. Abra uma página pública do site em janela anônima.
2. Aguarde alguns segundos e confirme no WordPress que o total de acessos aumentou.
3. No Sistema LEME, teste a conexão do cliente.
4. Abra Analytics do Site e consulte Hoje.
5. Clique em Gerar relatório e confira o PDF no histórico/Drive.
6. Clique em Enviar no WhatsApp e use um número de teste.
7. Confira no histórico se o callback terminou como Enviado.

## Segurança

- WordPress recebe a Key apenas em `X-LEME-KEY`;
- Sistema e n8n usam apenas `X-LEME-N8N-KEY`;
- a chamada manual ao n8n sai do backend, nunca do navegador;
- callbacks e consultas internas exigem o mesmo segredo;
- em produção, a URL do WordPress precisa usar HTTPS;
- URLs privadas/locais são bloqueadas na integração;
- paginação e períodos da API WordPress são limitados;
- relatórios automáticos usam chave de deduplicação por cliente/mês.
