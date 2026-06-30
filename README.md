# LEME Flow MVP 2.0

Versão atualizada do sistema interno da LEME com foco em calendário editorial, clientes, colaboradores e agenda.

## O que foi adicionado nesta versão

- Layout do calendário editorial inspirado no modelo enviado
- Identidade visual com as cores da LEME
- Logo da LEME dentro do sistema
- Exportação do calendário do cliente em imagem PNG com um clique
- Responsável definido no cadastro do cliente
- Página para cada colaborador
- Demandas do colaborador divididas por cliente
- Agenda individual do colaborador
- Cadastro de compromissos como gravação, reunião ou outro
- Dashboard principal com resumo de gravações e agenda da equipe

## Como abrir

Extraia os arquivos e abra `index.html` no navegador.

## Estrutura atual

### Clientes
- nome_cliente
- especialidade
- cidade
- instagram
- site
- status
- responsavel_id
- drive_folder_url
- observacoes

### Publicações
- cliente_id
- titulo
- tema
- formato
- data_publicacao
- status
- responsavel_id
- texto_carrossel
- legenda
- observacoes
- drive_folder_url
- google_docs_texto_url
- google_docs_legenda_url

### Eventos de colaborador
- colaborador_id
- cliente_id
- titulo
- tipo
- data
- hora
- observacoes

## Integração com n8n

Em `Configurações`, troque o modo para `Webhook n8n` e cole os endpoints dos workflows.

Webhooks previstos:
- criar cliente
- criar publicação
- atualizar publicação
- criar pasta/documentos no drive
- criar compromisso

## Sugestão de próximos passos

1. Ligar os formulários nas Data Tables do n8n
2. Criar workflow que gera pasta do cliente e da publicação no Drive
3. Criar workflow que devolve os links do Drive para a publicação
4. Criar login de usuários
5. Criar página de aprovação do cliente


## Atualização v3

A planilha atual da LEME foi usada apenas como referência de estrutura operacional. O sistema não usa Notion e foi pensado para substituir esse controle.

### Novidades v3

- Na página de cada colaborador, agora existe a aba `Calendários dos clientes`
- Essa aba mostra os clientes sob responsabilidade do colaborador
- Em cada cliente, é possível abrir o calendário ou criar uma nova publicação
- Na aba `Demandas`, cada demanda agora é clicável
- Ao clicar na demanda, abre a tela de edição completa da publicação
- Dá para atualizar status, data, formato, responsável, briefing, legenda, texto e links
- Cadastro de cliente ganhou campos operacionais inspirados na planilha atual:
  - Banco de dados Google
  - Secretária
  - Telefone da secretária
  - Valor tráfego pago
  - Slug do eBook
  - Link do relatório

### Observação importante

Campos sensíveis da planilha, como senhas, não foram trazidos para o sistema. O ideal é manter senhas em um gerenciador próprio e não dentro do painel editorial.


## Atualização v4

- Logo branco da LEME aplicado na barra lateral para melhor contraste.
- Publicações do calendário agora podem ser arrastadas de um dia para outro.
- Ao soltar uma publicação em outro dia, o sistema atualiza automaticamente a data.
- Se o modo webhook estiver ativo, a alteração também chama o webhook de atualização da publicação no n8n.


## Atualização v5

- Removido o bloco `Status do mês` do dashboard inicial.
- Exportação do calendário em imagem ajustada para funcionar sem depender do carregamento externo do logo no canvas.
- Cada dia do calendário agora possui um botão `+` para criar uma demanda diretamente naquele dia.
- Na página do colaborador foi criada a aba `Enviar para aprovação`.
- Essa aba lista os clientes do colaborador e permite acionar o webhook do n8n para enviar as demandas da semana.
- Dentro da demanda, o campo `Link da pasta no Drive` foi movido para cima por ser um campo de uso frequente.
- Ao arrastar demandas no calendário ou alterar dados, o webhook de atualização pode ser chamado para manter o n8n/Data Tables sincronizado.


## Atualização v6

- Calendário ajustado para ficar mais próximo da referência enviada.
- Removido o segundo nome do mês que aparecia no layout.
- Sábados e domingos ganharam fundo cinza.
- Botão `+` do calendário ficou mais claro e discreto.
- Exportação em imagem melhorada: títulos quebram em linhas, não ficam cortados tão facilmente, e o formato aparece em azul.
- Exportação usa o logo da LEME embutido no arquivo para evitar falha no canvas.


## Atualização v7

- A exportação do calendário ganhou margem lateral maior para o mês vertical não cortar.
- A tela de demandas do colaborador agora mostra apenas publicações com status `Em produção`.
- Essa tela passa a funcionar como lista de trabalho da semana.
- Fluxo esperado: o n8n filtra demandas da próxima semana, muda o status para `Em produção` e o colaborador trabalha nessa lista.
- Adicionado botão para baixar todos os dados locais do sistema em JSON, útil para conferência e transição para Data Tables.
- Reforçada a ideia de que todos os dados devem ser acessíveis ao n8n por webhooks e tabelas estruturadas.


## Atualização v8

- Na janela de criar/editar publicação, os botões Excluir, Cancelar e Salvar/Criar foram movidos para o topo.
- Os botões inferiores foram removidos para deixar a edição das demandas mais rápida.


## Atualização v9

- No calendário exportado, o logo da LEME passou a ser o vertical e ficou um pouco maior.
- Status visíveis no calendário do sistema com cores mais evidentes:
  - Ideia = cinza
  - Em produção = amarelo
  - Concluído = roxo
  - Postado = verde
- O destaque visual dos status foi aplicado apenas ao calendário dentro do sistema, sem afetar a imagem exportada.
- O bloco de `Próximas publicações` no dashboard agora ocupa largura total para evitar cortes.
- Títulos e textos das tabelas passaram a quebrar linha para não cortar no dashboard.


## Atualização v10

- A aba `Enviar para aprovação` foi simplificada.
- Agora o sistema não seleciona nem filtra demandas nessa tela.
- Cada cliente possui apenas um botão `Enviar para aprovação`.
- O botão dispara o webhook do n8n enviando dados do cliente e do colaborador.
- O n8n fica responsável por buscar as publicações na Data Table, filtrar a próxima semana e enviar pelo WhatsApp.


## Atualização v11

- Ajustado o logo vertical no calendário exportado para ficar menor, alinhado com o nome do cliente e sem risco de corte nas bordas.


## Atualização v12

- Status oficiais reduzidos para apenas 4 opções:
  - Ideia
  - Em produção
  - Concluído
  - Postado
- Status antigos como `Arte pronta`, `Legenda pronta`, `Aprovado`, `Agendado`, `Publicado`, `Ajuste solicitado` e `Enviado para aprovação` foram removidos da interface.
- Registros antigos são normalizados automaticamente ao carregar:
  - Publicado/Postado → Postado
  - Aprovado/Agendado/Concluído → Concluído
  - Em andamento/Em produção → Em produção
  - demais → Ideia


## Atualização v13

- Dashboard simplificado para exibir:
  - Clientes ativos
  - Próximas gravações
  - Agenda da equipe
  - Responsáveis
- Adicionado bloco financeiro de próximo pagamento.
- O cálculo usa o campo `Início do Trabalho` do cliente.
- O sistema calcula o próximo ciclo mensal e exibe mensagens como:
  - `Cheirinho de dinheiro - Faltam X dias para o Cliente X pagar`
  - `É hoje papai!! Completamos X meses com o cliente X`
- Cadastro e edição de cliente agora incluem:
  - Início do Trabalho
  - Valor mensal


## Atualização v14

- A agenda do colaborador agora possui botão `+` em todos os dias do calendário.
- Cadastro e edição de cliente agora permitem enviar logo do cliente.
- O logo aparece nas listas, cards de clientes, tabelas e identificações rápidas.
- Ao criar um novo cliente, o sistema dispara o webhook `createClient` com payload estruturado:
  - action: `create_client`
  - dados do cliente
  - instrução para o n8n cadastrar o cliente na Data Table, criar pastas no Drive e preparar os fluxos.
- Ao editar cliente, o webhook envia action `update_client`.


## Correção v15

- Corrigido erro que deixava a tela branca após a inclusão dos logos de clientes.
- Adicionadas funções ausentes para exibir logo/inicial do cliente.
- Adicionada proteção de erro para evitar tela totalmente branca em futuras falhas.


## Correção v16

- Corrigido erro `metric is not defined` que impedia o dashboard de abrir.
- Recriada a função de cards métricos usada no dashboard.


## Atualização v17

- Removido o nome `LEME Flow` da interface.
- O sistema agora fica sem nome próprio, usando apenas a identidade da LEME.


## Atualização v18

- Tela de criar/editar publicação simplificada.
- Removidos os campos:
  - Tema / briefing
  - Texto da arte ou carrossel
  - Legenda
  - Google Docs texto
  - Google Docs legenda
- A edição da demanda agora fica focada em cliente, data, título, Drive, formato, status, responsável e observações.


## Atualização v19

- Tela de nova/editar publicação ajustada para manter apenas:
  - Cliente
  - Data de publicação
  - Título
  - Link da pasta no Drive
  - Formato
  - Status
  - Responsável
  - Criar pasta no Drive / Acionar n8n
  - Legenda
- Removidos os demais campos da janela de demanda.


## Atualização v20

- Cadastro e edição de cliente reorganizados conforme campos mais importantes da planilha:
  - Especialidade
  - Telefone Doutor
  - Banco de Dados Google / Drive
  - Nome da Secretária
  - Telefone Secretária
  - Aniversário do doutor
  - Conta Instagram
  - E-mail Google
  - E-mail Facebook
  - Domínio
  - Usuário RegistroBR
  - Validade RegistroBR
  - Início do Trabalho
  - Responsável
  - Valor Tráfego Pago
  - Slug Ebook
  - Link Relatório
- Removido o campo separado `Link da pasta principal no Drive` para não confundir com `Banco de Dados Google`.
- Internamente, `Banco de Dados Google / Drive` também preenche `drive_folder_url` para manter compatibilidade com os fluxos existentes.


## Atualização v21

- Adicionada aba `Relatórios` dentro da página do cliente.
- A aba permite enviar múltiplos CSVs exportados do Meta Business Suite.
- O sistema identifica os arquivos pelo nome:
  - Visualizações
  - Alcance
  - Interações
  - Seguidores
  - Visitas
  - Cliques no link
- O sistema soma os dados, monta KPIs e gera um relatório em PDF no navegador.
- A geração abre uma nova janela e baixa o PDF automaticamente quando possível.
- Se o gerador de PDF externo não carregar, o relatório ainda pode ser salvo usando `Imprimir > Salvar como PDF`.


## Atualização v22

- A geração de relatório do cliente deixou de baixar PDF automaticamente.
- Agora o relatório gera uma imagem PNG, evitando cortes no arquivo final.
- O cabeçalho do relatório passou a usar o logo branco da LEME.
- Os gráficos permanecem visíveis no arquivo final exportado.
- O relatório abre em nova janela e inicia o download da imagem automaticamente.


## Atualização v23

- Adicionado modo escuro com alternância na barra lateral.
- Criada página de controle mensal de tráfego pago com toggle por cliente e campo de observações.
- Dashboard ajustado para manter apenas o botão azul de Novo evento.
- Página do colaborador agora possui um kanban abaixo dos calendários dos clientes.
- As demandas podem ser arrastadas entre colunas do kanban e o status é atualizado automaticamente.


## Atualização v24

- Modo escuro virou toggle no rodapé da barra lateral, sem emoji.
- Adicionada opção de criar, editar e excluir colaboradores.
- Bloco `Responsáveis` no dashboard ganhou destaque com fundo azul.
- Kanban removido da página do colaborador.
- Kanban movido para a aba `Calendário` dentro da página de cada cliente.
- Cada cliente agora tem seu próprio kanban por status, com arrastar e soltar para atualizar a demanda.


## Atualização v25

- Ajustado o azul do modo escuro na barra lateral para um tom mais fechado.
- Na página de demandas em andamento do colaborador, foi adicionada coluna `Drive`.
- Quando a demanda possui link do Drive, o botão fica azul e abre a pasta.
- Quando não possui link, o botão fica apagado/desabilitado.
- Na página `Calendário editorial geral`, o nome do cliente agora aparece com o logo/inicial ao lado.


## Atualização v26

- Corrigida a leitura dos títulos das demandas no calendário dos clientes no modo escuro.
- Adicionada tela de login.
- Usuário inicial criado:
  - usuário: Matheus
  - senha: Leme123
- Colaboradores agora possuem campos de usuário e senha.
- A senha pode ser alterada na edição do colaborador.
- Adicionado botão de sair na barra lateral.


## Atualização v27

- Cards de demandas no calendário em modo escuro foram redesenhados.
- Agora os cards ficam escuros e mais integrados ao layout.
- O status aparece como faixa inferior no card.
- Adicionado botão `Ver/Ocultar` senha no login.
- Adicionado botão `Ver/Ocultar` senha na edição do colaborador.


## Atualização v28

- Corrigida a página do colaborador no modo escuro.
- As barras dos grupos de clientes agora ficam escuras.
- Melhorada a leitura dos nomes dos clientes, textos, tabelas e botões no modo escuro.


## Atualização v29

- Removido o texto com usuário e senha inicial da tela de login.


## Atualização v30

- Adicionados webhooks de leitura para conectar o sistema às Data Tables do n8n.
- Novos campos em Configurações:
  - Listar clientes
  - Listar colaboradores
  - Listar publicações
  - Listar eventos
  - Listar tráfego pago
- Adicionado botão "Sincronizar n8n" na lateral quando o modo Webhook n8n está ativo.
- Adicionado botão "Sincronizar dados do n8n" na página de configurações.
- O sistema agora consegue buscar dados do n8n, normalizar `registro_id` como `id` interno e salvar localmente para exibir nas telas.


## Atualização v31

- A sincronização com o n8n agora pode acontecer automaticamente.
- Quando o modo Webhook n8n estiver ativo e houver webhooks de leitura cadastrados, o sistema busca dados ao abrir e ao navegar entre páginas principais.
- Adicionado controle em Configurações: Sincronização automática Ativada/Desativada.
- O botão lateral foi mantido como atualização manual de backup.


## Atualização v32

- Corrigido erro `formatDateTime is not defined` ao sincronizar com o n8n.
- A última sincronização agora é exibida corretamente nas configurações.


## Atualização v33

- Sincronização com n8n reforçada para acontecer automaticamente ao abrir o sistema.
- Adicionada sincronização automática em intervalo de 60 segundos enquanto o sistema estiver aberto.
- Ao salvar as configurações com modo Webhook n8n ativo, o sistema já tenta sincronizar imediatamente.
- O botão Atualizar n8n permanece apenas como backup manual.


## Atualização v34

- Sincronização automática ajustada para 30 segundos.
- A sincronização em intervalo pausa quando a aba está minimizada ou em segundo plano.
- Ao voltar para a aba ou focar a janela, o sistema tenta sincronizar novamente.
- Mantida sincronização ao abrir e ao navegar entre páginas principais.


## Atualização v35

- Ajustado o calendário da tela de edição para exibir mês e ano no título.
- O calendário exportado não foi alterado de propósito.


## Atualização v36

- Ajustado o visual da agenda dos colaboradores no modo escuro para ficar mais próximo do calendário dos clientes.
- Adicionados cabeçalhos dos dias da semana na agenda do colaborador.
- Compromissos da agenda agora podem ser arrastados para outro dia.
- Ao arrastar um compromisso, a data é atualizada localmente e o webhook de evento é acionado quando estiver configurado.


## Atualização v37

- Adicionada subpágina "Blog" dentro da página do cliente.
- A tela de Blog permite preencher 4 artigos por mês, com ID 1, 2, 3 e 4.
- O botão "Enviar artigos para o n8n" envia cliente, mês, label do mês e os 4 artigos para o webhook configurado.
- Adicionado campo de configuração "Webhook enviar artigos do Blog".
- Adicionado campo de configuração "Webhook enviar relatório ao cliente".
- Ao gerar a imagem do relatório, a janela do relatório agora tem botão "Enviar para cliente".
- O botão de envio do relatório gera a imagem em PNG/base64 e envia para o n8n junto com cliente e período.


## Atualização v38

- Adicionado Dockerfile para subir no EasyPanel usando Nginx.
- Adicionado nginx.conf para servir o sistema como site estático.
- Adicionado .dockerignore para limpar o build.


## Atualização v39

- Adicionada proteção HTTP Basic Auth no Nginx antes da tela de login do sistema.
- O sistema agora pede uma senha de acesso restrito antes de carregar os arquivos.
- Adicionados headers para reduzir indexação e cache em domínio público.
- Usuário temporário do Basic Auth: leme
- Senha temporária do Basic Auth: SistemaLeme@2026


## Atualização v40

- Removida a segunda tela de login interna na abertura do sistema.
- O acesso principal passa a ser o login seguro do servidor via Nginx Basic Auth.
- Após validar o acesso do servidor, o painel abre direto.
- Mantido registro local de sessão apenas para identificação visual dentro do sistema.


## Atualização v41

- Corrigido build no EasyPanel quando o GitHub não envia arquivo oculto .htpasswd.
- A proteção HTTP Basic Auth agora é criada diretamente no Dockerfile durante o build.
- Não é mais necessário subir o arquivo .htpasswd para o GitHub.
- Usuário temporário do Basic Auth: leme
- Senha temporária do Basic Auth: SistemaLeme@2026


## Atualização v42

- Removida a janela de login do navegador via Basic Auth.
- Restaurada a tela bonita de login interno do sistema.
- O acesso volta a ser por colaborador, permitindo troca de usuário e senha dentro da edição do colaborador.
- Removido o preenchimento automático visível de usuário e senha na tela de login.
- Mantidos headers de noindex e no-cache no Nginx para reduzir exposição pública.
- Observação: para segurança real de produção, o login deve ser migrado para backend/autenticação central.


## Atualização v43

- Blog do cliente ajustado para formato retrátil por artigo.
- Cada artigo agora pode ser aberto e fechado individualmente.
- Adicionado upload de imagem destacada por artigo.
- A imagem é reduzida no navegador e enviada em base64 para o n8n.
- O envio pode ser feito por artigo individual ou por todos os artigos preenchidos.
- Não foi criada Data Table nova para Blog. O envio é pontual via webhook.
- Payload do artigo inclui cliente, mês de referência, artigo_id, título, texto, observações e imagem_destaque.


## Atualização v44

- Blog simplificado: removidos campos de título e observações.
- Cada artigo agora tem apenas texto completo e imagem destacada.
- Adicionado recurso de arrastar e soltar imagem destacada diretamente no artigo.
- Mantido botão de escolher imagem como alternativa.
- Payload do n8n envia artigo_id, texto e imagem_destaque em base64.


## Atualização v45

- Ajustado upload da imagem destacada do Blog para funcionar como o campo de arquivos do relatório.
- Agora cada artigo possui um input de arquivo real, onde é possível clicar ou arrastar a imagem diretamente.
- Mantida a conversão da imagem para base64 antes do envio ao n8n.


## Atualização v46

- Ajustado envio de arquivos do relatório.
- Agora é possível arrastar os CSVs para a área inteira de upload do relatório, não apenas sobre o input.
- Mantido clique no campo de arquivo como alternativa.
- Adicionado feedback visual com os nomes dos arquivos selecionados.


## Atualização v47

- Webhooks do n8n adicionados como padrão no sistema.
- O modo da API agora abre como webhook automaticamente.
- Se um navegador antigo tinha campos vazios salvos localmente, o sistema passa a preencher com os webhooks padrão.
- Adicionado botão para restaurar webhooks padrão nas configurações.
- Sincronização automática com n8n permanece ativada.


## Atualização v48

- Cadastro de cliente simplificado para reduzir campos duplicados.
- Campo site/domínio consolidado como domínio.
- Campo Instagram/conta_instagram consolidado como Instagram.
- Campo Banco Google/Drive consolidado como drive_folder_id, usado como ID da pasta mãe do cliente no Google Drive.
- Mantidos aliases internos para compatibilidade com dados antigos e webhooks existentes.
- Campo link_relatorio renomeado visualmente para Link do Meta Business Suite.
- Adicionado botão "Abrir Meta Business Suite" na aba Relatórios do cliente.
- CSV de Data Table de clientes atualizado com colunas mais limpas.


## Atualização v51

- Arrastar publicações no calendário dos clientes ficou mais fluido.
- O calendário atualiza visualmente antes de aguardar a resposta do n8n.
- Adicionado preview visual durante o arraste.
- Datas de destino recebem destaque visual.
- Corrigido arrastar e soltar compromissos na agenda dos colaboradores.
- Eventos usam `id` ou `registro_id`, evitando falhas entre dispositivos.
- O movimento do compromisso atualiza `data` e `data_inicio`.


## Atualização v52

- Agenda dos colaboradores ajustada para usar a mesma lógica de movimentação dos calendários dos clientes.
- IDs de eventos são comparados como texto, evitando falhas entre Data Table e navegador.
- Adicionado histórico interno de navegação.
- O botão Voltar retorna à última página aberta e preserva colaborador, cliente, aba e mês.


## Atualização v53

- Agenda dos colaboradores refeita com identificação própria de eventos no drag and drop.
- Toda a célula do dia funciona como área de destino.
- Eventos mudam de data imediatamente e mantêm uma sobreposição local temporária para não serem revertidos pela sincronização automática.
- Kanban agora possui drag próprio, separado do calendário.
- Cartões do Kanban mudam de coluna imediatamente, sem aguardar o n8n.
- Destinos recebem destaque visual durante o arraste.
- IDs são normalizados entre `id` e `registro_id`.


## Atualização v54

- Removida a prioridade local de datas de eventos por navegador.
- O n8n volta a ser a fonte oficial da agenda.
- Após mover um compromisso e receber confirmação do webhook, o sistema sincroniza novamente com o n8n.
- Overrides locais antigos de eventos são apagados ao carregar o sistema.
- Corrigida divergência de datas entre notebook, PC e outros dispositivos.


## Atualização v55

- Sincronização automática reduzida de 30 para 5 segundos.
- Corrigida identificação das páginas abertas usando `state.view`.
- Sincroniza ao abrir ou trocar páginas.
- Sincroniza ao retornar para a aba ou janela.
- Evita duas sincronizações simultâneas.
- Não redesenha a tela quando os dados recebidos são iguais aos atuais.
- Mantém o botão manual apenas como recurso de emergência.
- O n8n continua sendo a fonte oficial compartilhada entre dispositivos.


## Atualização v56

- Removida a sincronização periódica a cada 5 segundos.
- O sistema sincroniza ao navegar entre páginas.
- Sincroniza ao abrir clientes e colaboradores.
- Sincroniza ao trocar abas e subpáginas internas.
- Sincroniza ao mudar o mês dos calendários e do tráfego.
- Sincroniza ao usar o botão Voltar.
- Sincroniza ao retornar para a aba ou janela do navegador.
- Sincroniza ao recuperar a conexão com a internet.
- Mantém sincronização após criar, editar e arrastar registros.
- O botão manual continua disponível como segurança.


## Atualização v57

- Corrigido o calendário que estava chamando o handler do Kanban ao iniciar o arraste.
- Publicações do calendário voltaram a usar `dragPost`.
- IDs de publicações são normalizados entre `id` e `registro_id`.
- O payload enviado ao n8n agora usa `publicacao`.
- Após a confirmação do update, o sistema sincroniza novamente com o n8n.
- A célula inteira do calendário funciona como destino do drop.


## Atualização v58

- Adicionado webhook `salvar-trafego-pago`.
- Toggle ativo/inativo envia imediatamente ao n8n.
- Observações usam debounce de 700ms antes do envio.
- Registro mensal usa `mes_referencia__cliente_id` como ID fixo.
- Valor de tráfego do cadastro do cliente também é enviado.
- Após alterar o toggle, o sistema confirma os dados oficiais pelo webhook de leitura.


## Atualização v59

- Campo `Webhook salvar tráfego pago` exibido nas Configurações.
- URL padrão preenchida automaticamente.
- Campo incluído no salvamento das configurações.


## Atualização v60

- Nova página em destaque para as publicações agendadas no dia.
- Toggle para marcar a demanda como `Publicado` diretamente nessa página.
- Botão flutuante fixo para abrir a pasta geral de publicações no Google Drive.
- Botão do Meta Business Suite sempre visível na página de relatório, ativo em azul quando há link e apagado quando não há.
- Base de clientes ordenada por responsável e, depois, pelo nome do cliente.
- Status das demandas em andamento pode ser alterado diretamente na tabela.
- Upload de foto/logo do cliente aceita arrastar e soltar.
- Navegação do calendário movida para o canto superior direito e logo da LEME para a esquerda.
- Menu lateral reorganizado: Dashboard, Colaboradores, Clientes, Publicações e Tráfego pago.
- Configurações movidas para um botão de engrenagem no canto inferior da barra lateral.


## Atualização v61

- Publicações do dia passaram para uma lista horizontal compacta.
- Botão fixo da pasta de publicações ficou maior.
- Demandas em andamento mostram cliente, imagem, título, data, formato, status e Drive.
- Seletor de status recebeu cores por situação.
- Opções do seletor permanecem legíveis no modo escuro.
- Na página geral e na subpágina do cliente, clicar na linha abre a edição.
- O botão Editar foi removido dessas listas.
- A última coluna agora serve apenas para abrir o Drive.


## Atualização v62

- Corrigida a classe visual do status em Demandas em andamento.
- O seletor agora mostra a cor correspondente ao status atual.
- O texto permanece legível no modo escuro e no menu de opções.


## Atualização v63

- Adicionado webhook `https://n8n.adati.app.br/webhook/criar-colaborador`.
- Criar colaborador salva no n8n.
- Editar colaborador atualiza a mesma linha pelo `registro_id`.
- Excluir colaborador altera o status para `Inativo` no n8n.
- Campo do webhook incluído nas Configurações.
- Colaboradores sincronizam entre dispositivos pelo webhook de leitura.


## Atualização v64

- Adicionado botão `Copiar WhatsApp` em cada publicação do dia.
- O link usa primeiro `telefone_secretaria` e depois `telefone_doutor`.
- O telefone é limpo e recebe o código 55 quando necessário.
- A mensagem usada é `Olá, tudo bem? Vim pelo Instagram`.
- O botão copia o link para a área de transferência sem abrir outra página.
- Quando não existe telefone válido, o botão fica desativado.
- Demandas, publicações e clientes viram cartões no celular.
- Tabelas não ultrapassam mais a largura da tela.
- Calendários usam rolagem horizontal controlada em telas pequenas.
- Menu, modais, formulários, relatórios, Kanban e tráfego receberam ajustes para celular e tablet.


## Atualização v65

- Fuso horário visual fixado em `America/Sao_Paulo`.
- A página Publicações do dia usa a data atual de São Paulo.
- Datas ISO do n8n são convertidas antes de exibição e comparação.
- Datas puras no formato `YYYY-MM-DD` não sofrem deslocamento de um dia.
- Calendários, compromissos e meses usam o horário de São Paulo.
- Horários exibidos usam o padrão de 24 horas.
- Nomes de arquivos exportados usam a data de São Paulo.
- Registros técnicos continuam usando ISO/UTC para manter consistência entre dispositivos.


## Atualização v66

- Corrigida a sincronização de status das publicações.
- O status retornado pelo n8n agora sempre substitui o estado local.
- Overrides antigos de status são removidos ao abrir o sistema.
- Alterações de status fazem rollback se o n8n falhar.
- Criação e edição de publicações aguardam confirmação do n8n.
- Sincronização automática a cada 30 segundos enquanto a aba está visível.
- Sincronização imediata após criar, editar, mover ou alterar status.
- Respostas `{ ok: false }` do n8n agora são tratadas como erro.
- Requisições possuem timeout de 15 segundos.


## Atualização v67

- Bloco `Responsáveis` movido para a coluna principal esquerda do dashboard.
- Bloco recebeu mais destaque visual, borda lateral e hierarquia reforçada.
- Cada colaborador é um card inteiro clicável.
- O clique abre diretamente a página do colaborador na aba `Demandas`.
- Removido o botão individual `Abrir página` dos cards do dashboard.
- Cards mostram demandas em andamento, demandas abertas, clientes ativos e gravações futuras.
- Navegação por teclado adicionada com Enter e Espaço.
- Layout adaptado para computador, tablet e celular.


## Atualização v68

- Dashboard reorganizado após revisão visual.
- Bloco de responsáveis permanece à esquerda e em destaque.
- Removidos os contadores internos dos colaboradores.
- Cada colaborador agora funciona apenas como atalho para Demandas em andamento.
- Cards de pagamento, clientes e gravações foram reconstruídos.
- Corrigidas sobreposições, alturas quebradas e textos fora dos cards.
- Coluna direita agora possui proporções consistentes.
- Layout revisado para computador, tablet e celular.


## Atualização v69

- Os avatares dos responsáveis no dashboard agora usam o mesmo azul-claro.
- Mantido todo o restante do layout da v68 sem alterações.


## Atualização v70

- Removido o seletor de mês da página Blog.
- Pasta do cliente no Drive agora é aberta a partir do ID salvo nas informações.
- Botão Enviar todos preenchidos ficou fixo na tela.
- Adicionada subpágina de aprovação dentro de cada cliente.
- Calendário recebeu botão de Drive em cada demanda.
- Formatos agora possuem etiquetas: Post único, Carrossel, Reels e Stories.
- Formatos do cadastro foram limitados às quatro opções definidas.
- Publicações são ordenadas por cliente e depois por data.
- Cards dos responsáveis receberam fundo azul-claro e avatar azul-escuro.
- Adicionado sistema de janelas internas independentes.
- Cada janela preserva página, cliente, colaborador, mês, filtros e histórico próprios.
- Botão + cria uma nova janela iniciando no Dashboard.


## Atualização v71

- Removido o botão Drive dos cards do calendário.
- Botão Abrir no Drive da edição agora fica azul e destacado.
- Quando não existe link, permanece o botão Acionar n8n.
- Link do Drive no Kanban virou um botão clicável.
- Barra de janelas ficou mais compacta e fixa durante a rolagem.
- Página Publicações agora é organizada em sanfonas por cliente.
- Cada grupo mostra quantidade total e demandas em aberto.
- Ao expandir, as publicações continuam ordenadas por data.


## Atualização v72

- Cards da página Colaboradores agora são inteiramente clicáveis.
- Removido o botão Abrir página.
- O botão Editar continua funcionando sem abrir o colaborador.
- Cards da subpágina Calendários dos clientes agora abrem o calendário inteiro ao clicar.
- Removidos os botões Abrir calendário e Criar publicação desses cards.
- Modais de publicação, compromisso, cliente e colaborador fecham ao clicar no fundo externo.
- Cliques dentro do card do modal não fecham a janela.
- Adicionado suporte de teclado com Enter e Espaço nos cards clicáveis.


## v73 reconstruída

Esta versão foi reconstruída diretamente a partir da v72 validada.

- Publicações existentes são salvas ao clicar fora do modal.
- Compromissos existentes são salvos ao clicar fora do modal.
- Criações novas continuam sendo canceladas ao clicar fora.
- Cancelar e X continuam fechando sem salvar.
- Abas podem ser reorganizadas por arrastar e soltar.
- O arrasto só reorganiza após soltar, evitando renderizações durante o movimento.
- Abas possuem hover e indicador visual de posição.
- O botão + fica imediatamente após a última aba.
- Base de clientes foi dividida em colunas por colaborador.
- Clientes são ordenados alfabeticamente dentro de cada coluna.
- Clientes sem responsável aparecem em um grupo separado.


## Atualização v74

- Adicionado webhook `https://n8n.adati.app.br/webhook/deletar-publicacao`.
- A publicação só é removida localmente depois da confirmação do n8n.
- Falhas no webhook mantêm a publicação no sistema.
- Adicionada confirmação antes da exclusão.
- Após excluir, o sistema sincroniza novamente com a Data Table.
- Exportação do calendário agora usa altura variável para cada semana.
- Títulos longos possuem quebra completa de linha, sem reticências.
- Palavras longas sem espaços também são quebradas.
- Todas as publicações do dia são exportadas.
- A altura final da imagem aumenta conforme o conteúdo.


## v75 — CRM de Prospecção

- Módulo isolado em `crm.js` e `crm.css`.
- CRM é o último item do menu lateral.
- Duas entidades: prospects e ações vinculadas por `prospect_id`.
- Funil arrastável não linear.
- Histórico em linha do tempo.
- CRUD completo de prospects e ações.
- Upload de anexo opcional sem Base64 na Data Table.
- Conversão em cliente com verificação de duplicidade.
- Sincronização exclusiva do CRM com endpoints separados.
- Nenhuma tabela ou webhook anterior foi alterado.

## v76 — Correções de edição e barra superior

- A sincronização automática com o n8n fica pausada enquanto um modal de edição/criação está aberto.
- Sincronizações iniciadas antes da abertura do modal não renderizam a tela por cima da edição em andamento.
- O botão manual "Atualizar n8n" avisa para finalizar a edição antes de sincronizar.
- O campo de título da demanda agora usa área de texto com quebra automática de linha.
- Selecionar texto dentro do modal e soltar o mouse fora dele não fecha mais a demanda.
- A barra superior das janelas internas foi ajustada para ocupar toda a largura disponível até a extremidade direita.

## v76.1 — Atalho GBP LEME

- Adicionado botão `GBP LEME` na barra lateral.
- O botão abre `https://maps.sistemaleme.com.br` em uma nova aba.
- Nenhuma rota, webhook ou tela existente foi alterada.

## v77 PostgreSQL

- Backend próprio Node/Express adicionado.
- PostgreSQL passa a ser o banco principal.
- Endpoints antigos foram preservados como rotas internas do backend.
- n8n continua conectado apenas para automações externas.
- Adicionado README-POSTGRES-EASYPANEL.md com passo a passo de deploy.

## v78 — Tempo real e vínculo correto com n8n

- Adicionado endpoint `/api/realtime` com Server-Sent Events.
- Ao criar, editar, mover ou excluir registros no PostgreSQL, o backend avisa todos os dispositivos conectados.
- O frontend escuta os eventos em tempo real e sincroniza automaticamente.
- URLs antigas absolutas do n8n salvas no navegador são trocadas pelas rotas locais `/webhook/...` para garantir que o backend seja sempre a ponte oficial.
- O n8n continua vinculado por variáveis de ambiente no backend e não é mais usado como banco principal.
- Incluído o arquivo `README-TEMPO-REAL-N8N.md` com passo a passo.

## v79 — Correção geral de cadastro, edição e exclusão

- Corrigido o problema em que editar colaborador criava um novo registro.
- Corrigido o problema em que criar cliente salvava o payload incorreto no backend.
- Adicionados endpoints próprios para atualizar e excluir clientes.
- Adicionados endpoints próprios para atualizar e excluir colaboradores.
- A API agora aceita os formatos `client/cliente` e `collaborator/colaborador`, evitando erro de envelope em integrações.
- Adicionado reparo automático de registros criados incorretamente como `Cliente sem nome` ou `Colaborador sem nome` quando havia dados válidos dentro do payload.
- Criação, edição e exclusão agora aguardam confirmação da API antes de manter a alteração na tela.
- Exclusão de cliente/colaborador é bloqueada quando há publicações, eventos, tráfego ou clientes vinculados, evitando perda de dados.
- Revisados os fluxos principais de CRUD com `node --check` no frontend e no backend.


## v80 - Novo cliente com Drive automático

Ao criar um novo cliente, o backend pode disparar `N8N_CLIENT_WEBHOOK_URL` para criar automaticamente as pastas no Google Drive e os calendários do mês atual e próximo mês.

## v83 — Prompts prontos do ChatGPT

Esta versão adiciona a aba **Prompts**, cadastro de modelos por formato de post, campo de projeto do ChatGPT no cliente e ação para copiar o prompt preenchido direto da demanda.

Arquivo detalhado: `README-v83-PROMPTS-CHATGPT.md`

## v85 - Financeiro mais intuitivo e salários

A área de Finanças foi reorganizada por etapas e agora inclui salários dos colaboradores. A nova caixinha padrão **Salários da equipe** recebe os lançamentos de saída quando um salário é marcado como pago.
