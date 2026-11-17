# CrIArt — Etapa 4B.1: inventário confiável de dispositivos

## Implementado

- `listDevices` agora separa os registros remotos encontrados dos dispositivos efetivamente autorizados.
- Um dispositivo só entra em `authorized` quando o documento Firestore corresponde ao UID e ao ID esperados, está marcado como `active` e apresenta certificado válido assinado pela identidade raiz fixada.
- O inventário mantém o certificado público para que o protocolo V3 possa usar a chave ECDH de cada instalação.
- Novo método `loadDeviceCryptoContext(db, uid, deviceId)` carrega a chave privada local do dispositivo, confere a raiz local contra a raiz fixada no Firestore, valida o certificado local e exige que o dispositivo conste no inventário ativo.
- `prepareDeviceAccess` retorna `cryptoContext` para aparelhos originais já reconhecidos. Nenhuma chave privada é enviada ao Firestore.

## API adicionada

```js
const context = await loadDeviceCryptoContext(db, uid, deviceId);
// context.localDevice: { uid, deviceId, privateKey, certificate }
// context.rootPublicKeyJwk: chave pública raiz fixada
// context.authorizedDevices: certificados públicos ativos e verificados
// context.inventory: inventário local/remoto completo
```

O contexto retornado contém material privado apenas em memória no aparelho que o solicitou. Não deve ser serializado, registrado em logs ou enviado a serviços externos.

## Ainda não integrado

- O fluxo de envio e recebimento continua usando V2.
- Não houve alteração no formato das mensagens nem nas regras Firestore/Storage.
- Não há revogação de dispositivos nesta etapa. Marcar um documento como revogado sem uma política de regras e de atualização de envelopes poderia criar falsa sensação de segurança.
- A sincronização do histórico e a distribuição dos envelopes V3 continuam pendentes.

## Validação

- `node --check js/device-management.js`: aprovado.
- `npm test`: testes de pareamento, QR e protocolo V3 aprovados.
- Nenhuma operação foi realizada no Firebase de produção; nenhuma publicação foi feita.
