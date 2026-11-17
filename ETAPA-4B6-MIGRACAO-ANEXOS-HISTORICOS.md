# CrIArt — Etapa 4B.6: migração de anexos históricos V2 → V3

## Implementado
- Novo módulo `js/attachment-migration.js` para migração progressiva de anexos históricos.
- A prévia abre o corpo V2 em memória para localizar metadados de anexos, sem baixar os bytes nem gravar alterações.
- A execução descriptografa o anexo V2, cifra os bytes com o protocolo V3 por dispositivo e envia o novo arquivo ao Storage.
- Em seguida, atualiza o corpo da mensagem com os metadados V3, cifra novamente a mensagem e persiste `{ envelope, v: 3 }` no Firestore.
- Cada lote é limitado a 10 anexos; o módulo aceita no máximo 25 por chamada.
- O arquivo original V2 nunca é apagado.
- Se a atualização do Firestore falhar após o upload, o novo arquivo temporário é removido para evitar órfãos.
- A interface apresenta prévia, confirmação explícita, progresso e contagem de falhas.
- A migração só pode ser executada em um aparelho original com a identidade V2 local.

## Correção adicional no fluxo de mensagens de texto
A mídia histórica fica dentro do corpo cifrado V2 e não necessariamente no documento Firestore. O módulo `history-migration.js` agora abre o corpo em memória durante a prévia e exclui mensagens que contenham mídia. Isso impede que o fluxo de texto converta uma mensagem com anexo sem converter o arquivo correspondente.

## Sequência por mensagem
1. Descriptografar o corpo V2 localmente.
2. Identificar metadados V2 do anexo.
3. Baixar e descriptografar o arquivo V2.
4. Cifrar os bytes em V3 para todos os dispositivos autorizados.
5. Enviar o arquivo V3 para `private/private-room/media/{messageId}.v3.bin`.
6. Atualizar o corpo da mensagem com o novo caminho e envelope V3.
7. Cifrar o corpo em V3 e atualizar o documento Firestore.
8. Se a etapa 7 falhar, remover apenas o novo arquivo temporário. O original V2 permanece intacto.

## Limites e precauções
- A consulta da interface ainda examina até 500 mensagens por rodada de prévia; históricos maiores exigem paginação em etapa posterior.
- A migração processa somente mensagens enviadas pela conta autenticada. A outra conta deve executar a migração dos anexos que enviou.
- A operação real exige backup prévio e validação no Firebase Emulator ou projeto de teste.
- Não foram publicadas regras nem executada migração real nesta etapa.
- Os anexos antigos continuam ocupando Storage após migração, intencionalmente, até existir rotina de verificação e política de descarte aprovada.

## Validação
`npm test` valida pareamento, QR, envelopes V3, mensagens, anexos, migração de mensagens, migração de anexos e integração da interface. `node --check js/app.js` verifica a sintaxe do aplicativo.
