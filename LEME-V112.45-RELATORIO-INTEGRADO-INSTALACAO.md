# LEME V112.45 — Relatório Integrado

Esta versão adiciona uma nova aba **Relatório completo** dentro de cada cliente. Nenhum relatório individual foi removido ou alterado em seu funcionamento.

## O que entra no PDF único

1. Instagram: visualizações, alcance, interações, cliques, seguidores e gráficos diários.
2. Google Business: impressões, ligações, rotas, visitas ao site, reservas, evolução diária e termos de busca.
3. Local Radar: mapa limpo com grid padronizado, posições, Top 1, Top 3, Top 10 e concorrentes.
4. Analytics do Site: visualizações, visitantes, sessões, evolução, páginas, cidades, origens e dispositivos.

O PDF é salvo em `Posts / Ano / MM - Mês` dentro da pasta do cliente no Google Drive e enviado pelo WhatsApp. Se alguma fonte marcada estiver faltando, o sistema bloqueia o envio para não gerar um documento incompleto.

## 1. EasyPanel

Suba a versão V112.45 e mantenha as variáveis atuais. Acrescente ou confira:

```env
N8N_LEME_SECRET=O_MESMO_SEGREDO_USADO_NOS_FLUXOS
N8N_INTEGRATED_REPORT_WEBHOOK=https://n8n.adati.app.br/webhook/leme-relatorio-integrado
PUBLIC_APP_URL=https://sistema.lememarketingmedico.com.br
```

O banco cria automaticamente as tabelas novas no primeiro start.

## 2. Fluxo integrado no n8n

Importe `LEME-Relatorio-Integrado-Mensal-V112.45.json`.

No nó **CONFIGURAÇÃO — EDITE AQUI**:

- cole o mesmo `N8N_LEME_SECRET` do EasyPanel;
- confira `grupo_leme`;
- mantenha `leme_system_url` como `https://sistema.lememarketingmedico.com.br`;
- confira a URL do Gotenberg e a instância Evolution.

Confirme as credenciais já existentes:

- Google Drive account;
- Google Sheets account/service account usado para localizar as pastas;
- Evolution account.

Depois, ative o fluxo. Ele consulta os relatórios vencidos a cada 15 minutos, mas a API só libera cada cliente no dia e horário configurados na nova aba.

## 3. Fluxo completo do Instagram

Importe `LEME-Instagram-Completo-V112.45-RELATORIO-INTEGRADO.json` e use-o no lugar da versão anterior desse mesmo fluxo mensal. Não deixe as duas versões ativas ao mesmo tempo, pois isso duplicaria a coleta e o PDF individual do Instagram.

No nó **Configuração**, cole o mesmo segredo em `n8n_leme_secret`. A nova ramificação apenas registra uma cópia dos dados mensais já validados no Sistema LEME; o PDF individual, o WhatsApp e o Drive do Instagram continuam funcionando como antes.

## 4. Configuração por cliente

Abra o cliente e entre em **Relatório completo**:

- marque as seções contratadas;
- ative ou desative o envio mensal;
- use preferencialmente dia 6 às 10:00;
- selecione uma competência para conferir se todas as fontes estão prontas;
- use **Gerar, salvar e enviar PDF** para uma execução manual.

O sistema mostra o histórico, o status, mensagens de erro e o link do PDF salvo no Drive.

## Observações importantes

- Os relatórios individuais continuam nas abas e fluxos atuais.
- A inteligência artificial mensal do Local Radar continua independente e não é executada por um clique manual no relatório completo.
- A pasta do cliente precisa estar cadastrada no sistema e manter a estrutura `Posts / Ano / MM - Mês`, já usada pelo fluxo mensal do Instagram.
- O relatório integrado usa somente dados reais recebidos das APIs e integrações; não preenche números ausentes por aproximação.
