# v84 — Financeiro e Caixinhas

## Novidades

- Nova aba lateral **Finanças**.
- Caixinhas internas da LEME e caixinhas por cliente.
- Caixinhas padrão: Imposto, Tráfego pago da LEME e Mensalidades.
- Caixinha automática de tráfego para cada cliente ativo.
- Campo novo no cadastro e edição do cliente: **Valor mensal do cliente**.
- Ao registrar pagamento do cliente, o sistema separa automaticamente:
  - valor de tráfego do cliente na caixinha do cliente;
  - percentuais configurados nas caixinhas internas;
  - restante em Mensalidades.
- É possível criar caixinhas personalizadas, metas e percentuais.
- É possível lançar entradas, saídas/gastos e ajustes manuais.
- Ao marcar o tráfego como feito na aba Tráfego Pago, o valor do mês é subtraído da caixinha de tráfego daquele cliente.

## Endpoints novos

- `/webhook/listar-caixinhas`
- `/webhook/salvar-caixinha`
- `/webhook/deletar-caixinha`
- `/webhook/listar-movimentacoes-financeiras`
- `/webhook/salvar-movimentacao-financeira`
- `/webhook/deletar-movimentacao-financeira`

## Banco de dados

Foram adicionadas as tabelas:

- `finance_boxes`
- `finance_movements`

A migration usa `CREATE TABLE IF NOT EXISTS`, então pode ser aplicada em produção sem apagar dados existentes.
