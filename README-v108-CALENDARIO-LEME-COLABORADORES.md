# Sistema LEME v108 — calendário interno por colaborador

## O que mudou

- As publicações do calendário interno da LEME agora possuem o campo `Colaborador`.
- Em novas publicações, o colaborador autenticado é selecionado automaticamente; a seleção pode ser alterada antes de salvar.
- O cartão mensal e o cartão do Kanban mostram o nome do colaborador.
- A etiqueta e a faixa lateral usam a cor definida em `Colaboradores → Editar → Cor de identificação`.
- Publicações antigas sem responsável aparecem como `Sem colaborador` até serem editadas.
- O campo `Link da pasta no Drive` voltou para as publicações da LEME.
- Quando existe link, a edição exibe `Abrir no Drive`; sem link, permanece a opção `Acionar n8n`.
- O cliente virtual da LEME envia ao fluxo de Drive a pasta configurada em `LEME → Informações da LEME → Drive da LEME`.
- O atalho lateral do Local Radar passou a abrir `https://maps.lememarketingmedico.com.br`.

## Compatibilidade

- Não exige migração de banco: `publicacoes.responsavel_id` e `publicacoes.drive_folder_url` já existiam.
- O backend PostgreSQL e os webhooks atuais continuam usando o mesmo formato.
- Calendários dos clientes não receberam a etiqueta colorida; a mudança visual é exclusiva do calendário interno da LEME.

## Como validar depois do deploy

1. Abra `Colaboradores`, edite cada pessoa e confirme a cor de identificação.
2. Entre em `LEME → Calendário` e crie uma publicação.
3. Selecione o colaborador, informe um link de pasta do Drive e salve.
4. Confirme que o cartão mensal e o Kanban exibem o nome na cor cadastrada.
5. Atualize a página e confirme que colaborador e Drive continuam salvos.
6. Clique em `Abrir no Drive` e depois no atalho lateral `GBP LEME` para validar os dois endereços.
