# LEME Analytics 2.0

## Atualização no WordPress

1. Faça backup do WordPress e do banco.
2. Em **Plugins**, atualize o LEME Analytics com `leme-analytics-2.0.0.zip`.
3. Abra **Configurações → LEME Analytics**.
4. Clique em **Regenerar Key** e copie a nova Key exibida. Ela aparece apenas uma vez.
5. No Sistema LEME, abra o cliente em **Site → Configurações do site** (ou Informações do Cliente), cole a Key em **Nova Key — LEME Analytics** e salve.
6. Clique em **Testar conexão**.

Os pageviews e agregados existentes são preservados. Métricas de sessão, engajamento e tempo real começam a ser preenchidas após a instalação da versão 2.0.

## Configuração obrigatória do Sistema LEME

Mantenha `CLIENT_INTEGRATION_ENCRYPTION_KEY` configurada no EasyPanel com um valor longo, aleatório e permanente. Não altere esse valor entre deploys. Se ele já foi alterado, o sistema agora abre normalmente e solicita apenas que a Key do plugin seja cadastrada novamente.

## Como o tempo real é calculado

- O navegador envia um sinal a cada 15 segundos enquanto a página está visível.
- “Ativos agora” conta sessões visíveis com sinal nos últimos 60 segundos.
- Ao ocultar ou fechar a página, o plugin encerra a presença quando o navegador permite o envio final.
- Retentativas de rede usam um identificador único e não duplicam pageviews.
- Navegações em sites SPA também são registradas.

## Fidelidade e privacidade

O plugin não armazena IP puro nem cria fingerprint. Administradores logados, bots conhecidos e rotas técnicas ficam fora da contagem. Como qualquer analytics executado no navegador, acessos com JavaScript bloqueado, bloqueadores de conteúdo ou falha de rede podem não ser contabilizados; por isso as definições aparecem no painel e não há promessa artificial de “100%”.

## Dados disponíveis

- visitantes ativos em tempo real;
- visualizações e visitantes estimados;
- sessões, sessões engajadas, taxa e tempo médio de engajamento;
- páginas, cidades, estados, origens e dispositivos;
- evolução diária e comparação com o período anterior;
- API privada com Key protegida por hash.
