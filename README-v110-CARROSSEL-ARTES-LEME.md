# Sistema LEME V110.0 — Carrossel no Estúdio de Artes

## O que mudou

- A subpágina **LEME → Artes** agora permite alternar entre **Feed estático** e **Carrossel**.
- Cada slide do carrossel é independente e pode usar:
  - Twitter Texto;
  - Twitter Texto + imagem;
  - Twitter Texto + 2 imagens;
  - Texto manuscrito.
- Cada slide possui texto, tamanho de fonte, destaques, imagens e formato de pré-visualização próprios.
- É possível adicionar, duplicar, excluir e reordenar slides.
- O botão **Exportar carrossel** baixa um único ZIP contendo todos os slides em:
  - `Feed-1080x1350`;
  - `Story-1080x1920`.
- No calendário da LEME, o editor muda automaticamente para o modo de slides quando o formato da publicação é **Carrossel**.
- A configuração textual dos slides é salva junto da publicação no campo JSON `arte_slides`.

## Observação sobre imagens

As imagens escolhidas para as artes permanecem somente na sessão atual do navegador. Elas não são gravadas como Base64 no PostgreSQL, evitando crescimento excessivo do banco. Ao reabrir uma publicação em outra sessão, selecione novamente as fotos antes de exportar.

## Implantação

1. Reimplante a branch `main` no EasyPanel.
2. Confirme que o commit da V110.0 foi usado na reconstrução.
3. Faça uma atualização forçada no navegador para limpar o cache dos arquivos da V109.6.

Não é necessária migração do PostgreSQL: os novos dados usam a coluna JSONB já existente em `publicacoes.data`.
