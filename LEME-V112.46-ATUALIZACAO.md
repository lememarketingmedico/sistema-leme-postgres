# Sistema LEME V112.46

## Relatório integrado

- O antigo relatório manual por upload de CSV foi removido da navegação dos clientes.
- A fonte oficial do Instagram agora é o fluxo automático completo enviado pela LEME.
- O fluxo original possui 76 nós. A versão V112.46 preserva todos eles e acrescenta somente o nó `Registrar snapshot no relatório integrado` depois de `Validar métricas obrigatórias`.
- O PDF individual do Instagram, coleta diária, histórico, retenção, Google Drive e WhatsApp continuam funcionando como antes.
- O novo snapshot validado alimenta a aba `Relatório completo` do Sistema LEME.
- O PDF completo continua reunindo Instagram, Google Business Insights, Local Radar/concorrentes e Analytics do Site.

### Instalação dos fluxos

1. Importe `LEME-Instagram-Completo-V112.46-RELATORIO-INTEGRADO.json` no lugar do fluxo mensal anterior do Instagram.
2. Não mantenha as duas versões do fluxo do Instagram ativas simultaneamente.
3. No nó `Configuração`, substitua `COLE_AQUI_O_MESMO_N8N_LEME_SECRET_DO_BACKEND` pelo mesmo `N8N_LEME_SECRET` do EasyPanel.
4. Importe e ative `LEME-Relatorio-Integrado-Mensal-V112.46.json`.
5. No nó `CONFIGURAÇÃO — EDITE AQUI`, confira segredo, grupo LEME, Evolution, Google Drive e Gotenberg.

## Publicações do dia

- Marcar como publicado atualiza a interface imediatamente.
- O card não muda de posição quando o status muda.
- A ordem agora é fixa por cliente e título, independentemente de estar publicado ou pendente.
- O retorno em tempo real do backend não redesenha a lista enquanto a alteração está sendo salva.
- No celular e no computador, somente o card alterado, o status e os contadores são atualizados.
- Se a gravação falhar, o sistema restaura o status anterior no mesmo lugar.

## Versão

Sistema LEME `112.46.0`.
