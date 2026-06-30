# v81 - Exclusão de cliente com publicações e exclusão rápida no calendário

## Novidades

- Ao excluir um cliente, o sistema agora permite apagar também todas as publicações vinculadas a ele.
- A API `/webhook/deletar-cliente` aceita `delete_publicacoes: true` ou `deletePublications: true`.
- Novo endpoint `/webhook/deletar-publicacoes` para exclusão em massa de publicações.
- No calendário do cliente, é possível clicar com o botão direito em uma demanda e excluir sem abrir o modal.
- No calendário, `Ctrl`/`Cmd` permite selecionar mais de uma demanda.
- No calendário, `Shift` seleciona demandas em sequência.
- Com várias demandas selecionadas, o botão direito permite excluir todas em massa.

## Observação

A exclusão de cliente com publicações ainda bloqueia se houver eventos ou tráfego pago vinculados, para evitar perda acidental de registros financeiros ou de agenda.
