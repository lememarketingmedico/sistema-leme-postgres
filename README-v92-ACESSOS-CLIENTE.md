# v92 - Campos de acessos e destino de aprovação

Adicionado no cadastro/edição do cliente:

- Número do doutor
- Número da secretária
- Número ou grupo para aprovação
- Login e senha do Instagram
- Login e senha do Facebook
- Login e senha do e-mail
- Login e senha do RegistroBR
- URL, login e senha do WordPress

O campo de aprovação aceita número comum ou grupo do WhatsApp no formato `@g.us`, sem converter grupo para número.

O payload de aprovação continua enviando `remote_jid_aprovacao` e `destino_aprovacao`, então o fluxo v91 de aprovação já é compatível.
