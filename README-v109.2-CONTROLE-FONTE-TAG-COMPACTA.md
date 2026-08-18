# Sistema LEME V109.2 — Controle de fonte e tag compacta

## O que mudou

- Os modelos **Twitter Texto** e **Twitter Texto + imagem** agora usam **Poppins Light (peso 300)** no texto principal.
- A tag oficial da LEME foi reduzida de 670 px para 560 px de largura nos dois modelos Twitter.
- Novo controle **Tamanho da fonte** disponível em:
  - **LEME → Artes**.
  - Card de geração de arte dentro das publicações da LEME.
- O ajuste pode ser feito pelos botões de menos/mais ou pelo slider.
- Faixa disponível: de **60% a 160%**, em passos de 5%.
- O sistema mostra simultaneamente o tamanho máximo em pixels e a porcentagem escolhida.
- A escala selecionada é salva junto à publicação em `arte_escala_fonte`.

## Segurança da composição

O tamanho escolhido funciona como limite máximo. Caso um texto longo não caiba na área disponível, o sistema ainda reduz a fonte automaticamente para:

- preservar as margens de segurança;
- impedir cortes;
- evitar divisão de palavras;
- manter o bloco completo centralizado verticalmente.

## Compatibilidade

- Feed: **1080 × 1350 px (4:5)**.
- Story: **1080 × 1920 px (9:16)**.
- Modelos: **Twitter Texto**, **Twitter Texto + imagem** e **Texto manuscrito**.
- Funcionalidade exclusiva da área LEME.
