# CrIArt — Etapa 4A: envelopes V3 por dispositivo

## Escopo desta entrega

Esta etapa implementa e testa, em módulo isolado, o formato criptográfico de mensagens e anexos destinado a múltiplos dispositivos. Não altera a rotina V2 em produção e não habilita envio/recebimento V3 no `app.js`.

## Modelo criptográfico

1. O conteúdo (texto serializado ou bytes de anexo) recebe uma chave de conteúdo aleatória AES-256-GCM.
2. O conteúdo é cifrado uma única vez. O AAD vincula versão, finalidade, ID da mensagem e identidade do dispositivo remetente.
3. Para cada dispositivo ativo autorizado, é gerado um par ECDH P-256 efêmero independente.
4. A chave de conteúdo é encapsulada individualmente com ECDH + HKDF-SHA-256 + AES-256-GCM.
5. Cada wrapper é vinculado por AAD ao ID, finalidade, UID e ID de dispositivo do remetente e destinatário.
6. O certificado raiz-assinado do remetente acompanha o envelope. O receptor valida o certificado contra a chave raiz pública fixada antes de abrir o wrapper.
7. O dispositivo local só abre a mensagem se houver wrapper com seu UID e seu ID de dispositivo.

A lista de destinatários deve incluir todos os dispositivos ativos das duas contas, inclusive o dispositivo remetente. Isso permite sincronizar mensagens enviadas no próprio aparelho e recebê-las nos outros aparelhos autorizados.

## API do módulo

`js/multidevice-envelope.js` exporta:

- `encryptForDevices(...)` / `decryptForDevice(...)` para bytes;
- `encryptJsonForDevices(...)` / `decryptJsonForDevice(...)` para objetos JSON;
- `multiDeviceEnvelopeVersion` (3).

O formato V3 retornado contém `v`, `algorithm`, `messageId`, `purpose`, `senderUid`, `senderDeviceId`, `senderCertificate`, `iv`, `ciphertext` e `wraps[]`. Não contém texto claro nem chave de conteúdo em claro.

Para anexos, usar `purpose: 'attachment'`, ID da mensagem e o mesmo inventário de dispositivos. O envelope de bytes deve ser armazenado no Storage como binário cifrado; os metadados necessários para localizá-lo devem ficar dentro do corpo V3 da mensagem.

## Compatibilidade e migração

- Mensagens históricas V2 continuam usando `ciphertext/salt/iv` e ECDH legado entre contas.
- Mensagens V3 usam `envelope` e wrappers por dispositivo.
- O leitor futuro deve selecionar explicitamente por `v`: V2 → `decryptObject`; V3 → `decryptJsonForDevice`.
- Não converter nem reescrever mensagens V2 em lote.
- Não remover nem substituir `privateKey:{uid}` dos aparelhos originais.
- Não apagar IndexedDB, certificados, raízes ou dados PWA.

## Condições para integração no aplicativo

Ainda não concluídas nesta etapa:

1. Fazer `prepareDeviceAccess` devolver a identidade do dispositivo local, sua chave privada e seu certificado ao `app.js` sem exportar a chave.
2. Carregar o inventário remoto de dispositivos ativos das duas contas e verificar todos os certificados contra as raízes públicas fixadas.
3. Definir o comportamento de entrega quando um dispositivo estiver offline, revogado ou com certificado inválido.
4. Integrar V3 ao envio, edição, leitura, histórico e anexos, mantendo leitura V2.
5. Atualizar Firestore/Storage Rules e validá-las no Firebase Emulator Suite.
6. Testar com quatro instalações reais e duas contas, inclusive concorrência, revogação e restauração de backup.

## Limites de segurança

O ECDH efêmero por destinatário protege o encapsulamento da chave de conteúdo e evita reutilizar a chave de encapsulamento entre mensagens. Porém, este desenho ainda não implementa Double Ratchet nem forward secrecy completa para o conteúdo: a segurança histórica depende da proteção das chaves privadas dos dispositivos e da gestão das chaves raiz. Um aparelho comprometido enquanto autorizado pode ler mensagens destinadas a ele.

Sem backend confiável/Cloud Functions, as Firestore Rules não conseguem validar assinaturas ECDSA nem provar que o inventário de dispositivos é completo. A verificação criptográfica no cliente é obrigatória; regras permissivas por UID não substituem isso.

## Testes desta etapa

`npm test` executa os testes existentes de pareamento/QR e os novos testes V3. Cobertura V3:

- quatro instalações (duas por conta) abrem o mesmo conteúdo;
- dispositivo não listado não consegue abrir;
- wrapper adulterado é rejeitado;
- certificado do remetente adulterado é rejeitado;
- o dispositivo remetente precisa estar na lista de destinatários para sincronização.

## Estado

**Etapa 4A concluída como protocolo isolado e testado.** Integração de mensageria e ativação em produção permanecem bloqueadas. Não publicar esta versão nem alterar o Firebase em produção.
