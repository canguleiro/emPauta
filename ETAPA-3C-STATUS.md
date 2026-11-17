# CrIArt — Etapa 3C consolidada

## Conteúdo
- `js/device-pairing.js`: protocolo criptográfico da etapa 3B revisada.
- `js/device-pairing-store.js`: transporte Firestore da etapa 3C.
- `tests/device-pairing.test.mjs`: testes unitários do protocolo.
- `firebase/firestore.rules`: proposta de regras para estruturas de pareamento.

## Verificações executadas
- Sintaxe dos dois módulos JavaScript.
- Testes automatizados do protocolo criptográfico em Node.js.
- Comparação dos arquivos-base: `js/app.js`, `index.html`, `css/app.css`, `sw.js`, `firebase/storage.rules` permanecem iguais ao projeto original.

## Não implementado
- Integração com o fluxo de autenticação e `app.js`.
- UI de QR Code e leitura de QR Code.
- Persistência de chaves privadas e identidade raiz no IndexedDB.
- Escuta/validação de certificados e gestão de dispositivos.
- Revogação e rotação da raiz.
- Criptografia de mensagens/anexos para múltiplos dispositivos.
- Testes com Firebase real ou Firebase Emulator Suite.

**Não publicar nem aplicar regras em produção.** Este ZIP é uma base de desenvolvimento consolidada, não uma versão funcional multi-dispositivo.
