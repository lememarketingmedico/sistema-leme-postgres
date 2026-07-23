# Sistema LEME v105 — Controle de gravações

## O que foi adicionado

- Nova página **Gravações** no menu.
- Controle por cliente com:
  - vídeos restantes estimados;
  - última gravação;
  - próxima data prevista ou agendada;
  - responsável;
  - histórico recente.
- Cálculo de estoque com média de **1 vídeo por semana**.
- Alertas no Dashboard quando faltarem 15, 10 e 7 dias.
- Agendamento direto pelo Dashboard ou pela página de gravações.
- Ao agendar, o sistema cria automaticamente um compromisso com o título **Gravação** na agenda do colaborador.
- Depois de agendada, a gravação deixa de gerar novos avisos.
- Ao concluir, a quantidade de vídeos produzidos gera automaticamente a próxima previsão.
- Suporte a várias gravações na mesma data no Dashboard.

## Banco de dados

A tabela `gravacoes` e os índices são criados automaticamente quando o container inicia. Não é necessário executar SQL manualmente.

## Publicação no EasyPanel

1. Suba todos os arquivos desta versão no mesmo repositório usado pelo EasyPanel.
2. Faça o redeploy/rebuild normal do serviço.
3. Confirme em `/api/system-health` que a versão retornada é `105.0.0`.

## Fluxo do n8n

Importe:

`n8n-exemplos/fluxo-n8n-v105-avisos-gravacoes-whatsapp.json`

Depois:

1. Confira a credencial **Evolution account**.
2. Nos dois nós HTTP, cole a mesma `N8N_API_KEY` configurada no backend do EasyPanel.
3. Faça um teste pelo gatilho **Teste manual**.
4. Ative o fluxo.

O fluxo roda diariamente às 08h no fuso `America/Sao_Paulo`. Ele envia ao WhatsApp do colaborador responsável; se o telefone não estiver cadastrado, usa o grupo interno configurado no próprio fluxo. O aviso só é marcado como enviado depois que o envio do WhatsApp termina com sucesso.
