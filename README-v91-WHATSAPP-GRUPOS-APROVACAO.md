# v91 - WhatsApp de grupos na aprovação

Correção para envio de aprovação em grupos do WhatsApp.

## Ajustes

- O sistema agora preserva destinos do tipo `120363406739579811@g.us`.
- O campo Telefone Secretária passou a aceitar número comum ou JID de grupo.
- O payload enviado ao n8n agora inclui `remote_jid_aprovacao`, `destino_aprovacao`, `telefone_secretaria` e `telefone_doutor`.
- Se o destino tiver `@g.us`, o sistema não remove caracteres e não adiciona `55`.
- Números comuns continuam sendo normalizados para Brasil quando necessário.

## Exemplo

Entrada cadastrada no cliente:

```
120363406739579811@g.us
```

Payload enviado ao n8n:

```
remote_jid_aprovacao: "120363406739579811@g.us"
```
