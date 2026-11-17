# CrIArt — Etapa 4B.4: migração progressiva do histórico V2

## Entregue nesta etapa
- Serviço isolado `js/history-migration.js` para migração progressiva de mensagens V2 para envelopes V3.
- Prévia (`dryRun`) sem descriptografar nem gravar dados.
- Migração serial, uma mensagem por vez, com lote configurável de até 100 registros (padrão: 25).
- Escopo limitado às mensagens enviadas pela conta que executa a migração. Isso respeita as regras Firestore atuais, que permitem ao remetente alterar o conteúdo cifrado.
- Mensagens recebidas são deixadas para o respectivo remetente migrar.
- Mensagens com anexos são ignoradas nesta etapa; o arquivo binário exige migração própria para V3.
- Persistência somente do envelope V3 e `v: 3`; o texto claro permanece apenas em memória.
- Falhas isoladas não interrompem o restante do lote. A mensagem que falhou permanece V2 e pode ser tentada novamente.

## Integração deliberadamente pendente
O serviço não é disparado automaticamente pelo aplicativo e ainda não há botão de migração na interface. O próximo passo é integrar uma tela de prévia/confirmação e conectar callbacks reais do Firestore, `decryptObject` e `encryptMessageV3`. Essa separação evita uma migração em massa acidental.

## Procedimento previsto para a migração completa
1. Em cada conta, executar a migração em um dispositivo antigo que ainda possua a chave V2 original.
2. Migrar primeiro mensagens de texto próprias, em lotes pequenos.
3. Migrar anexos históricos em uma operação separada, descriptografando o arquivo com a chave legada e cifrando-o para todos os dispositivos ativos.
4. Conferir a leitura V3 em todos os aparelhos autorizados antes de considerar o histórico migrado.
5. Manter backups cifrados dos dados anteriores antes de qualquer alteração em produção.

## Limites e segurança
- Não recupera chaves V2 ausentes; um aparelho novo não pode migrar mensagens antigas por conta própria.
- Não modifica nem apaga anexos V2.
- Não publica regras nem escreve no Firebase nesta etapa.
- Não implementa Double Ratchet nem forward secrecy histórica.

## Testes
`npm test` inclui prévia sem efeitos colaterais, filtragem por remetente, preservação de mensagens com anexos, gravação apenas de envelope V3 e tratamento de falhas parciais.
