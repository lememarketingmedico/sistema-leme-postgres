# Sistema LEME V109.3 — Destaques manuais nas artes

## O que mudou

O campo **Texto da arte** agora aceita dois comandos simples de destaque:

- `*frase*` — remove os asteriscos da imagem e circula a frase com um traço irregular em azul LEME.
- `_frase_` — remove os underscores da imagem e sublinha a frase com um traço irregular em grafite.

Exemplo:

```text
Ninguém te contou na faculdade que você *precisaria entender* de _algoritmo_.
```

## Comportamento

- Os marcadores aparecem somente no editor e não entram na arte final.
- É possível marcar uma palavra ou uma frase completa.
- Se o trecho destacado quebrar de linha, cada fragmento recebe a decoração correspondente.
- Círculos e sublinhados têm duas passadas levemente diferentes para simular um traço feito à mão.
- As marcações podem ser combinadas no mesmo texto.
- Marcações sem fechamento permanecem visíveis como texto comum, evitando a perda acidental de caracteres.

## Compatibilidade preservada

- Modelos **Twitter Texto**, **Twitter Texto + imagem** e **Texto manuscrito**.
- Formatos Feed 1080 × 1350 e Story 1080 × 1920.
- Poppins Light nos modelos Twitter.
- Controle manual de tamanho da fonte.
- Margens seguras, centralização vertical e quebra somente entre palavras.
- Funcionalidade exclusiva da LEME.
