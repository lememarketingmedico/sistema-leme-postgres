# V112.33 — Auditoria GBP em PDF único

O fluxo mensal do Local Radar deixa de enviar o PDF original seguido por várias mensagens de texto.

## Novo comportamento

1. O Sistema LEME envia os dados do radar, perfil, fotos e concorrentes ao n8n.
2. O GPT-6 Sol produz uma auditoria estratégica completa e sem repetições.
3. O n8n monta um HTML diagramado com capa, indicadores, benchmark, fotos e conteúdo estratégico.
4. O Gotenberg converte o HTML em PDF A4.
5. A Evolution API envia apenas esse PDF ao grupo da LEME.

## Conteúdo do PDF

- posição média, Top 1, Top 3, Top 10, melhor e pior posição;
- benchmark tabulado do cliente e dos cinco concorrentes mais fortes;
- até seis amostras visuais do perfil;
- resumo executivo e diagnóstico do grid;
- raio-X do perfil e leitura competitiva;
- estratégia para disputar Top 1 e Top 3;
- plano 30/60/90 dias;
- plano de fotos, conteúdo e avaliações;
- metas, indicadores e dez próximas ações;
- limitações e fontes públicas consultadas.

## Configuração

O nó `CONFIGURAÇÃO — EDITE AQUI` contém a URL:

`https://leme-gotenberg.bnwvvh.easypanel.host/forms/chromium/convert/html`

Arquivo para importar:

`LEME-Local-Radar-Mensal-WhatsApp-IA.json`
