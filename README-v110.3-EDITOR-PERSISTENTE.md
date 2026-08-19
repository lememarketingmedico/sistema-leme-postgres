# V110.3 — Editor de artes persistente

## Alterações

- Corrige definitivamente o logo cinza do modelo manuscrito usando uma versão vetorial sem margens transparentes, mantendo o símbolo inteiro, centralizado e afastado da borda inferior.
- As configurações das artes feitas dentro de uma publicação da LEME passam a ser salvas junto da própria publicação: modelo, texto, tamanho, imagens e enquadramento.
- Cada slide de carrossel preserva suas próprias imagens e posições.
- O estúdio da página Artes mantém um rascunho automático no navegador.
- Modelos com imagem ganham controles Horizontal e Vertical para reposicionar a foto dentro da moldura, além do botão Centralizar.
- Novos comandos de texto:
  - `+texto+` = negrito
  - `/texto/` = itálico
- Mantidos os comandos existentes:
  - `*texto*` = círculo azul
  - `_texto_` = sublinhado manual
  - `--texto--` = marca-texto azul

## Banco

Não exige migração. Os dados adicionais são salvos no JSON `data` da tabela `publicacoes`, como os demais dados extensíveis da publicação.
