# Sistema LEME V109.5 — Círculo atrás do texto

## Correção aplicada

O destaque criado com `*frase*` foi ajustado para não cobrir mais as letras:

- O círculo azul agora é desenhado antes do texto, ficando na camada de baixo.
- O texto é desenhado por cima e permanece totalmente legível.
- O círculo começa antes do início da palavra ou frase.
- O círculo termina depois do fim da palavra ou frase.
- A folga vertical também foi ampliada para o traço não encostar nas letras.
- O aspecto irregular de traço feito à mão foi preservado.

## Comportamento preservado

- `_frase_` continua gerando o sublinhado manual.
- Destaques que quebram de linha continuam sendo tratados por fragmento.
- Modelos Twitter Texto, Twitter Texto + imagem, Twitter Texto + 2 imagens e Texto manuscrito.
- Formatos Feed 1080 × 1350 e Story 1080 × 1920.
- Poppins Light, controle de tamanho da fonte, margens seguras e centralização vertical.
- Funcionalidade exclusiva da LEME.
