=== LEME Analytics ===
Contributors: leme
Tags: analytics, privacy, rest-api, reports
Requires at least: 6.2
Requires PHP: 7.4
Stable tag: 2.0.0
License: Proprietary

Analytics próprio e leve para os sites dos clientes da LEME, com API REST protegida por Key.

== Instalação ==

1. No WordPress, abra Plugins > Adicionar plugin > Enviar plugin.
2. Envie leme-analytics-2.0.0.zip, instale e ative.
3. Abra Configurações > LEME Analytics.
4. Copie a Key.
5. No Sistema LEME, abra o cliente > Informações > Integrações do Site.
6. Informe a URL do site e a Key LEME Analytics, salve e clique em Testar conexão.

== Privacidade ==

O plugin não armazena IP puro nem usa fingerprinting. O IP é usado apenas em memória para rate limiting e resolução opcional de localização, sendo descartado em seguida. O identificador do visitante é aleatório e transformado por HMAC antes de ser gravado.

Administradores logados, bots, crawlers, REST, wp-cron, admin-ajax, wp-admin e rotas técnicas identificáveis são excluídos.

== GeoIP local ==

Use o filtro leme_analytics_geolocate_ip para conectar um banco GeoIP local. O callback recebe a localização obtida por headers e o IP temporário; deve devolver um array com city, state e country e não deve persistir o IP.

== API ==

Base: /wp-json/leme/v1/analytics/

Rotas privadas: status, realtime, summary, timeline, pages, page, cities, city, states, sources e devices.

Envie a Key no header X-LEME-KEY. O endpoint collect é público, restrito à mesma origem e protegido por rate limiting.

== Changelog ==

= 2.0.0 =
* Visitantes ativos com heartbeat de 15 segundos e janela documentada de 60 segundos.
* Sessões, tempo engajado e taxa de engajamento.
* Suporte a navegação SPA e deduplicação de pageviews por evento.
* API Key armazenada somente como hash e exibida uma única vez.
* Validação estrita de mesma origem e retenção automática de presença.

= 1.0.0 =
* Coleta anonimizada de pageviews e visitantes estimados.
* Agregação diária por página, cidade, estado, origem e dispositivo.
* API REST segura para o Sistema LEME.
* Tela administrativa com Key, status, controles de coleta e limpeza confirmada.
