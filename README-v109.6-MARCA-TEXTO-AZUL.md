# Sistema LEME V109.6 — Marca-texto azul

## Novo comando

O campo **Texto da arte** agora aceita o comando `--palavra ou frase--`.

Exemplo:

```text
Ninguém te contou na faculdade que você --precisaria entender-- de algoritmo.
```

Os dois traços de cada lado são removidos da imagem e o trecho recebe uma passada de marca-texto na cor azul LEME.

## Estilo do efeito

- Marca-texto azul com transparência para manter a leitura.
- Forma levemente irregular, semelhante a uma passada manual.
- Pequena extensão antes e depois do trecho selecionado.
- Efeito sempre desenhado atrás das letras.
- Uma segunda camada suave cria variação de tinta e evita aparência de retângulo digital.
- Se o trecho quebrar de linha, cada fragmento recebe sua própria passada.

## Comandos disponíveis

- `*frase*` — círculo azul irregular atrás do texto.
- `_frase_` — sublinhado manual.
- `--frase--` — marca-texto azul atrás do texto.

Os comandos podem ser combinados e continuam disponíveis nos quatro modelos, em Feed e Story.
