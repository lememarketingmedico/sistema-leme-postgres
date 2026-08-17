# v89 — Financeiro por cliente com repasses

Esta versão ajusta a aba Finanças para o fluxo real da LEME:

1. Cliente paga a mensalidade.
2. O sistema separa os repasses fixos por cliente para cada colaborador.
3. Depois separa o tráfego pago do cliente, usando o valor configurado no cadastro do cliente.
4. O restante vira base para as caixinhas internas com percentual, como Imposto e Tráfego pago da LEME.
5. O excedente final vai para a caixinha Saldo.

## Cadastro do cliente

Entrou uma seção chamada **Repasses por cliente**. Nela é possível informar quanto daquele cliente vai para Matheus, Luis ou qualquer outro colaborador ativo.

Exemplos:

- Cliente paga R$ 1.197,00
- Matheus: R$ 500,00
- Luis: R$ 500,00
- Tráfego do cliente: R$ 50,00
- Base restante: R$ 147,00
- Caixinhas internas usam percentual sobre essa base restante
- O que sobrar vai para Saldo

Outro exemplo:

- Cliente paga R$ 950,00
- Matheus: R$ 400,00
- Luis: R$ 400,00
- Tráfego do cliente: R$ 50,00
- Base restante: R$ 100,00

## Caixinhas automáticas

A versão cria automaticamente uma caixinha para cada colaborador ativo:

- Repasse - Matheus
- Repasse - Luis

Essas caixinhas recebem as entradas quando o pagamento do cliente é registrado.

## Backend

O endpoint `/webhook/registrar-pagamento-cliente` foi atualizado para fazer a distribuição nesta ordem:

1. Repasse dos colaboradores
2. Tráfego do cliente
3. Caixinhas internas por percentual sobre o restante
4. Saldo

Tudo continua salvo em transação no PostgreSQL.
