# CrIArt — Etapa 4B.7: paginação e validação local

## Implementado
- Varredura do histórico com paginação Firestore por ID de documento (inclui registros sem `createdAtMs`), em páginas de 200 documentos.
- Cursor `startAfter` baseado no último snapshot, evitando o corte fixo anterior de 500 mensagens.
- Limite de segurança de 250 páginas (até 50.000 registros por varredura), com aviso explícito quando a varredura atingir o limite.
- Prévia e execução da migração de texto e anexos passam a consumir o resultado paginado.
- Deduplicação de IDs e detecção de cursor que não avança.
- Teste automatizado com 537 mensagens, cenário truncado e cursor estagnado.

## Validação
Os testes automatizados cobrem o protocolo V3, envio/recebimento, anexos, migração de mensagens, migração de anexos, integração da interface, paginação e verificações estáticas das regras locais.

As regras do Firestore e Storage são verificadas estaticamente no pacote. Não foi executado Firebase Emulator nem teste contra projeto remoto nesta etapa. Portanto, isso não equivale a uma validação real de permissões no backend.

## Limites e segurança
- Cada varredura consulta até 50.000 documentos. Se houver mais, a interface informa que o limite foi atingido; novas rodadas percorrem os primeiros registros novamente, e mensagens já migradas deixam de ser elegíveis, permitindo avançar.
- A paginação ordena por ID de documento (inclui registros sem `createdAtMs`); documentos sem esse campo não entram nesta consulta e precisam ser identificados em uma auditoria separada antes da migração real.
- Não remover arquivos V2 nem limpar dados locais.
- Nenhuma migração real foi executada e nenhuma regra foi publicada.
