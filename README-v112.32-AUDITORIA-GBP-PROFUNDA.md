# V112.32 — Auditoria GBP profunda

Esta versão amplia o relatório mensal do Local Radar enviado ao n8n.

## O que mudou

- O backend envia até 6 amostras de fotos do perfil analisado.
- O backend coleta dados oficiais do Google Places dos 5 concorrentes mais fortes do grid.
- O benchmark inclui posição no grid, categoria, nota, volume e amostras de avaliações, fotos, site, telefone, horários e links públicos.
- O agente GPT-6 Sol usa Web Search com contexto alto e raciocínio médio.
- A pesquisa orientada passa a usar de 6 a 12 buscas direcionadas.
- A auditoria final inclui diagnóstico, benchmark, estratégia para Top 1/Top 3, plano 30/60/90 dias, fotos, avaliações, métricas e checklist de execução.
- A análise completa é dividida automaticamente em mensagens de até 3.400 caracteres no WhatsApp.
- O PDF é enviado apenas uma vez antes das partes da auditoria.

## Limites corretos da análise

- O Google Places retorna no máximo 5 avaliações e até 10 referências de fotos por perfil.
- Informações administrativas, desempenho e edição do GBP continuam dependendo do acesso ao painel do cliente.
- O objetivo de primeira posição é tratado por metas de Top 1, Top 3, média e conversão; não há promessa de posição orgânica.

## Arquivo para importar no n8n

`LEME-Local-Radar-Mensal-WhatsApp-IA.json`
