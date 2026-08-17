# Sistema LEME v86 — Financeiro com Saldo, Drive Mobile e Toggle fluido

## O que mudou

- A área de Finanças agora passa a tratar o excedente dos pagamentos na caixinha **Saldo**.
- A caixinha Saldo é criada automaticamente como caixinha interna padrão.
- Quando um pagamento de cliente é registrado, a distribuição passa a ser:
  1. Reserva de tráfego do cliente
  2. Percentuais internos configurados, como imposto e tráfego da LEME
  3. Excedente automático para Saldo
- As movimentações continuam salvas no PostgreSQL nas tabelas `finance_boxes` e `finance_movements`.
- As caixinhas acumulam saldo de um mês para o outro. A tela mostra saldo do mês e saldo total acumulado.
- Os botões de abrir Drive agora usam `openDriveLink()`. No Android, tentam abrir o app do Google Drive via intent. No iOS, tentam o esquema do app e usam o link web como fallback.
- O toggle de publicações do dia recebeu animação e feedback de salvamento.

## Como funciona a parte financeira

Cada movimento financeiro possui:

- Caixinha
- Tipo: entrada, saída ou ajuste
- Valor
- Mês de referência
- Data do movimento
- Origem

O mês de referência organiza a visualização mensal, mas o saldo total da caixinha é acumulado com todas as movimentações.

## Observação

A caixinha Mensalidades continua disponível para uso manual ou organização interna, mas o excedente automático agora vai para a caixinha Saldo.
