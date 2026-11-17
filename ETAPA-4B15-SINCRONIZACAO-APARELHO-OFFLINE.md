# CrIArt — Etapa 4B.15: sincronização segura de aparelho offline

## Objetivo
Quando um aparelho public-only retorna à rede depois de uma ou mais rotações, atualizar sua âncora pública e seu certificado local sem aceitar uma chave isolada ou pular épocas.

## Implementação
- `js/device-root-rotation-sync.js`: busca a cadeia autenticada, valida toda a sequência e seleciona o certificado atual do dispositivo.
- `js/device-pairing-vault.js`: `applyVerifiedPublicRootAndDeviceCertificate` atualiza raiz pública e certificado local na mesma transação IndexedDB.
- `tests/device-root-rotation-sync.test.mjs`: valida sucesso, cabeça divergente, aparelho fora do inventário e proteção do aparelho que ainda possui chave privada raiz.

## Garantias
- Nenhuma escrita local ocorre antes da validação completa da cadeia.
- A escrita da nova raiz pública e do certificado local é atômica no IndexedDB.
- A época e a chave local são rechecadas dentro da transação para evitar corrida com outra aba.
- A chave privada ECDH local do dispositivo é preservada.
- Aparelho que possui chave privada raiz não é atualizado por este fluxo; deve recuperar sua rotação pendente para não perder a autoridade.
- Dispositivo ausente do inventário reemitido não recebe certificado novo.

## Limites
- O módulo está pronto para integração explícita pela interface; não foi conectado a um gatilho automático de login nesta etapa.
- A atualização só funciona quando o aparelho conserva sua âncora pública e sua chave privada ECDH local.
- O endpoint Cloud Run ainda não foi implantado nem testado contra um projeto Firebase real.
