# Sistema LEME v107.1 — correção da exibição das Keys

## O que foi corrigido

- Depois de salvar e atualizar a página, as Keys de Permalinks e do LEME Analytics continuam aparecendo no formulário de forma mascarada.
- A credencial completa continua criptografada no backend e nunca é devolvida ao navegador.
- Clicar em uma Key mascarada abre o campo para substituição por uma nova Key.
- Sair do campo sem informar outra Key restaura a máscara e mantém a credencial anterior.
- A máscara nunca é enviada nem gravada como se fosse uma credencial nova.
- O backend também ignora defensivamente valores mascarados recebidos de versões antigas da interface.

## Comportamento esperado

Após salvar, o campo do Analytics passa a exibir algo semelhante a:

```text
leme_sk_••••••••••••8F2A
```

Essa máscara confirma que a Key está salva. Para trocá-la, clique no campo, informe a nova Key e salve as alterações.

## Implantação

Publique esta versão completa e reinicie o serviço. O parâmetro de cache dos arquivos do navegador foi atualizado para `v=107.1`, portanto a nova interface será carregada sem reutilizar o JavaScript anterior.

Mantenha o mesmo valor permanente de `CLIENT_INTEGRATION_ENCRYPTION_KEY`. Alterar essa variável impede a leitura das Keys já criptografadas.
