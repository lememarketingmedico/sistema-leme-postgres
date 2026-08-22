# V112.9 — Enviar arte direto para o Google Drive

## O que mudou

Na criação de artes vinculada a uma publicação da LEME, o editor agora possui o botão **Enviar para Drive**.

O botão só é habilitado quando o campo **Link da pasta no Drive** contém um link válido de pasta do Google Drive (ou um ID de pasta válido).

Ao clicar:

1. O Sistema LEME gera o arquivo final usando exatamente o mesmo fluxo da exportação normal.
2. O arquivo final é capturado como `Blob`, sem nova renderização, compressão ou conversão.
3. Esses mesmos bytes são enviados ao webhook n8n.
4. O n8n faz upload do binário diretamente para a pasta informada.
5. O mesmo arquivo também é baixado localmente.

Para carrossel, os arquivos individuais de Feed/Story são enviados ao Drive e o ZIP normal continua sendo baixado localmente.

## Workflow n8n

Importe:

`n8n-exemplos/LEME-V1129-Enviar-Arte-Drive.json`

O webhook de produção esperado pelo Sistema LEME é:

`https://n8n.adati.app.br/webhook/leme-enviar-arte-drive`

Após importar:

1. Confira o node **Enviar arquivo ao Google Drive**.
2. O workflow já aponta para a credencial existente chamada **Google Drive account**.
3. Se o n8n solicitar, selecione essa mesma credencial novamente.
4. Ative o workflow.

O Webhook está configurado para aceitar chamadas CORS do domínio:

`https://sistema.lememarketingmedico.com.br`

## Qualidade

O workflow não usa FFmpeg, conversão de imagem, resize ou recompressão.

- PNG: o arquivo enviado ao Drive é o mesmo Blob PNG final da exportação.
- MP4: o arquivo enviado ao Drive é o mesmo Blob MP4 retornado pelo render final do Sistema LEME.
- Carrossel: cada arquivo individual é enviado com os mesmos bytes usados para gerar o ZIP da exportação.

Assim, o n8n atua apenas como transporte do arquivo para o Google Drive.

## Arquivos grandes

Se a instância n8n tiver um limite de payload menor que o tamanho dos vídeos finais, aumente o limite de payload da própria instância n8n no EasyPanel. Isso não exige alterar qualidade do arquivo.
