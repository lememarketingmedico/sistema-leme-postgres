# Sistema LEME v106 — Navegação e área interna da LEME

## Novidades

- Setas azuis no modal de publicação para abrir a demanda anterior ou a próxima.
- A navegação fica limitada às publicações do mesmo calendário/cliente.
- Antes de trocar de publicação, a edição atual é salva e confirmada pela API.
- Novo item **LEME** no menu principal.
- Ao abrir **LEME**, o calendário editorial interno é a primeira página exibida.
- Subpágina **Informações da LEME** para dados, links e acessos internos.
- Publicações da LEME não possuem responsável e não exibem nem acionam a automação do Drive.
- O calendário da LEME reutiliza o calendário adaptável, o Kanban mensal, o arrastar e soltar e a exportação em imagem já existentes.
- A seta **Voltar** do navegador agora retorna à página anterior dentro do sistema e permanece no sistema quando chega ao início da navegação interna.

## Banco de dados

A tabela `leme_profile` é criada automaticamente na inicialização. Ela guarda a central de informações da LEME. As publicações internas continuam na tabela `publicacoes`, identificadas pelo calendário interno da LEME, sem criar um cliente ativo e sem alterar as métricas financeiras ou de gravação.

Não é necessário executar SQL manualmente.

## Publicação no EasyPanel

1. Extraia o ZIP.
2. Suba no GitHub todos os arquivos que estão dentro da pasta extraída, mantendo `Dockerfile`, `package.json`, `app.js`, `styles.css` e `backend/` na raiz.
3. Faça o redeploy/rebuild normal no EasyPanel.
4. Depois do deploy, abra `/api/system-health` e confirme a versão `106.0.0`.
5. Faça uma atualização forçada no navegador (`Ctrl + F5`) para carregar os arquivos com a nova versão de cache.

## Conferência rápida

1. Abra um calendário de cliente e edite uma publicação. As setas devem aparecer nas laterais do modal.
2. Edite uma legenda e clique na seta seguinte. Ao voltar, a legenda deve continuar salva.
3. Clique em **LEME** no menu, crie uma publicação e confirme que o modal não mostra responsável nem Drive.
4. Abra **Informações da LEME**, salve um dado, atualize a página e confirme que ele permanece.
5. Navegue entre Dashboard, Clientes e um calendário; depois use a seta Voltar do navegador.
