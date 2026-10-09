# LEME Social Feed — instalação, uso e integração

Versão do Sistema LEME: **112.42**  
Versão do plugin: **1.0.0**

## 1. Instalar e conectar

1. No WordPress, acesse **Plugins → Adicionar plugin → Enviar plugin**.
2. Selecione `leme-social-feed.zip`, instale e ative.
3. Abra **LEME Social Feed** no menu do WordPress.
4. Clique em **Gerar chave** e copie a chave. Ela é mostrada apenas uma vez.
5. No Sistema LEME, abra **Clientes → cliente desejado → Site → Configurações do site**.
6. Informe a URL pública HTTPS do WordPress e a chave, salve e clique em **Testar conexão**.
7. No Elementor Free, adicione um widget **Shortcode** e informe `[leme_social_feed]`. O mesmo shortcode funciona no editor padrão.

O plugin não altera páginas, usuários, modelos Elementor ou configurações gerais do WordPress. Ele somente recebe o feed e renderiza o shortcode.

## 2. Uso pela equipe

1. Abra **Cliente → Site → Feed do Instagram**.
2. Use **Adicionar publicação** para enviar JPG, PNG ou WebP, informar o link do post/Reel, texto alternativo e status.
3. Ajuste o enquadramento pelos controles horizontal e vertical. O original é preservado e a exibição permanece em 4:5.
4. Reordene arrastando os cards ou usando as setas, que também funcionam como alternativa em telas touch.
5. Em **Configurar galeria**, ajuste textos, perfil, quantidade, colunas, espaçamento, cantos, botões, animações, cores e fontes.
6. Confira **Pré-visualizar** em desktop, tablet e mobile.
7. Clique em **Publicar no site**. Em caso de falha, corrija a mensagem exibida e clique novamente; a requisição é idempotente e a última versão válida continua no site.

Publicações ocultas permanecem no rascunho do Sistema LEME, mas não são enviadas para a versão pública seguinte. Sem publicações ativas, o shortcode não produz marcação nem espaço vazio.

## 3. Segurança e operação

- Cada site usa uma chave própria. No WordPress somente o hash da chave é armazenado; no Sistema LEME ela fica cifrada com `CLIENT_INTEGRATION_ENCRYPTION_KEY`.
- A chave nunca é usada no navegador para chamar o WordPress: a integração parte exclusivamente do backend.
- Em produção, a URL precisa usar HTTPS. Endereços locais, privados e destinos DNS privados são bloqueados para reduzir risco de SSRF.
- Uploads aceitam apenas imagens JPG, PNG ou WebP de até 8 MB e no mínimo 320 × 400 px. O SHA-256 é conferido nas duas pontas.
- Links aceitos pertencem somente a posts ou Reels em `instagram.com`.
- O WordPress limita tentativas de chave inválida, rejeita versões antigas ou concorrentes e não registra credenciais nos logs.
- Regenerar a chave no WordPress invalida imediatamente a anterior. Atualize a conexão no Sistema LEME e teste novamente.
- As imagens públicas são servidas pela biblioteca de mídia do WordPress. O site não consulta o Sistema LEME durante a visita.

Não altere `CLIENT_INTEGRATION_ENCRYPTION_KEY` depois de cadastrar chaves. Se ela for perdida ou trocada, regenere as chaves dos plugins e recadastre-as.

## 4. API REST do plugin

Base: `/wp-json/leme-social/v1`  
Autenticação administrativa: header `X-LEME-KEY: <chave individual>`

| Método | Rota | Função |
|---|---|---|
| `GET` | `/status` | Diagnóstico, versão, instalação e última versão publicada |
| `GET` | `/feed` | Retorna o contrato atualmente publicado |
| `POST` | `/media` | Recebe uma imagem validada e faz deduplicação por SHA-256 |
| `PUT` | `/feed` | Valida todas as mídias e troca atomicamente a versão pública |

O backend também tenta o formato de compatibilidade `?rest_route=/leme-social/v1/...` quando links permanentes não atendem a rota amigável.

### POST `/media`

`multipart/form-data`:

- `file`: arquivo binário.
- `content_hash`: SHA-256 hexadecimal do arquivo.
- `external_id`: ID persistente da publicação no Sistema LEME.

Resposta útil: `attachment_id`, `url` e `deduplicated`.

### PUT `/feed`

```json
{
  "request_id": "sync_site_ID_VERSAO",
  "version": 4,
  "config": {
    "title": "Acompanhe nossas publicações.",
    "description": "Conteúdos, orientações e novidades.",
    "instagram_username": "cliente",
    "profile_url": "https://www.instagram.com/cliente/",
    "show_profile_button": true,
    "max_posts": 6,
    "columns_desktop": 3,
    "columns_tablet": 2,
    "columns_mobile": 2,
    "gap": 20,
    "radius": 10,
    "button_style": "solid",
    "animations": true,
    "appearance_mode": "automatic",
    "colors": {},
    "fonts": {}
  },
  "posts": [
    {
      "id": "feed_ID",
      "attachment_id": 123,
      "instagram_url": "https://www.instagram.com/p/IDENTIFICADOR/",
      "alt_text": "Descrição acessível",
      "sort_order": 0,
      "crop_x": 50,
      "crop_y": 50,
      "content_hash": "SHA256"
    }
  ]
}
```

O plugin só substitui `leme_social_feed_data` depois de validar todas as referências. Repetir o mesmo `request_id` e versão retorna sucesso idempotente; uma versão anterior ou a mesma versão com outro ID é rejeitada. As cinco versões anteriores ficam mantidas internamente como histórico de recuperação.

## 5. Contrato visual e Elementor

- Os cards usam `aspect-ratio: 4 / 5`, `object-fit: cover` e posição de corte configurável.
- Padrão: 3 colunas no desktop, 2 no tablet e 2 no celular, podendo usar 1 no celular.
- No modo automático, título, texto e destaque usam as variáveis globais do Elementor quando disponíveis, com fallbacks neutros.
- No modo personalizado, cores e famílias tipográficas são aplicadas como variáveis CSS isoladas no componente.
- O WordPress entrega `srcset`/`sizes` pelas funções nativas da biblioteca de mídia.
- O JavaScript público contém apenas a animação por `IntersectionObserver`; com movimento reduzido ou falha do script, a galeria continua utilizável.

Pontos preparados para o futuro instalador de sites:

- instalar/ativar o ZIP `leme-social-feed.zip`;
- gerar ou provisionar a chave pelo processo administrativo do plugin;
- registrar identidade visual pelo payload `config`;
- inserir apenas `[leme_social_feed]` no modelo Elementor e posicioná-lo na Home;
- filtros/ações: `leme_social_feed_default_config`, `leme_social_feed_synced` e `leme_social_feed_cache_purge`.

O conteúdo do feed não deve ser duplicado no JSON do Elementor.

## 6. Banco e arquivos alterados

Novas tabelas do Sistema LEME, criadas de forma idempotente pela migração existente:

- `client_sites`: conexão, versões e configuração visual por site;
- `site_feed_posts`: originais, links, acessibilidade, ordem, status e enquadramento;
- `site_feed_sync_logs`: tentativas, versões, erros e respostas de sincronização.

Arquivos principais criados:

- `backend/src/social-feed.js`
- `v112/system-v11241-social-feed.js`
- `wordpress-plugin/leme-social-feed/leme-social-feed.php`
- `wordpress-plugin/leme-social-feed/assets/social-feed.css`
- `wordpress-plugin/leme-social-feed/assets/social-feed.js`

Arquivos principais modificados:

- `backend/src/server.js`
- `backend/migrations/001_schema.sql`
- `index.html`
- `package.json`

## 7. Checklist depois do deploy

1. Confirme que `CLIENT_INTEGRATION_ENCRYPTION_KEY` está definido e é estável no EasyPanel.
2. Faça o deploy da versão 112.41; a migração roda na inicialização.
3. Instale o plugin em um WordPress de teste e gere a chave.
4. Teste chave correta e incorreta.
5. Envie pelo menos duas imagens, reorganize, oculte uma e publique.
6. Abra a página sem estar logado no WordPress e confira desktop/mobile.
7. Desligue temporariamente o Sistema LEME e confirme que a seção continua carregando do WordPress.
8. Se houver cache de página, limpe-o após a primeira publicação. O plugin também dispara o hook `leme_social_feed_cache_purge` e tenta limpar caches conhecidos.

### Correção V112.42

Uma recusa de autenticação pelo WordPress não é mais confundida com expiração da sessão do Sistema LEME. Assim, uma chave incorreta ou antiga apresenta a orientação de reconexão sem desconectar o colaborador. O indicador de mudanças pendentes também informa as versões de rascunho e publicação.
