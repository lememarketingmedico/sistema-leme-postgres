# Campos PostgreSQL

As tabelas usam colunas principais indexáveis e uma coluna `data JSONB` para preservar todos os campos do frontend sem exigir nova migration a cada ajuste operacional.

Tabelas:

- colaboradores
- clientes
- publicacoes
- eventos
- trafego_pago
- crm_prospects
- crm_acoes
- automacao_logs

O campo `registro_id` é a chave pública usada pelo frontend e pelo n8n.
