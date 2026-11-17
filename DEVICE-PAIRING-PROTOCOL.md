# CrIArt — protocolo de pareamento sem Cloud Functions

## Estado desta entrega

Este pacote contém o primeiro módulo criptográfico verificável do pareamento. Ele **ainda não está conectado à interface, ao Firestore nem ao fluxo de mensagens**. Não publicar como atualização funcional do aplicativo.

## Modelo

- Uma identidade raiz ECDSA P-256 por UID assina certificados de dispositivos.
- Cada dispositivo gera uma chave ECDH P-256 independente.
- Um pareamento usa uma chave ECDH efêmera de cada lado, HKDF-SHA-256 e AES-256-GCM.
- Os dois lados calculam um código de verificação de seis dígitos a partir do segredo ECDH e do desafio da sessão. A interface deverá mostrar o mesmo código nos dois aparelhos e exigir confirmação humana antes de enviar/aceitar a resposta.
- A identidade raiz privada é transferida dentro do canal cifrado para permitir que qualquer dispositivo já vinculado assine certificados de aparelhos futuros.
- O certificado contém UID, identificador do dispositivo, chave pública ECDH e assinatura da identidade raiz.
- Os clientes devem verificar a assinatura e o UID antes de confiar em qualquer registro do Firestore.

## API do módulo `js/device-pairing.js`

- `createAccountRootIdentity()` — cria a identidade raiz inicial.
- `createDeviceIdentity(uid, rootPrivateKey)` — cria uma identidade de dispositivo e certificado assinado.
- `createPairingOffer(uid, rootPublicKeyJwk)` — cria oferta temporária para QR Code.
- `acceptPairingOffer(offer, expectedUid)` — novo dispositivo aceita a oferta somente se o UID corresponder à conta autenticada e gera a solicitação.
- `completePairingHost(offerState, request, rootIdentity)` — aparelho existente cria resposta cifrada.
- `finishPairingClient(context, response, displayedHostCode)` — novo aparelho valida o código, abre o pacote e verifica o certificado.
- `verifyDeviceCertificate(certificate, expectedUid, rootPublicKeyJwk)` — verifica assinatura e UID.

## Regras obrigatórias para a futura integração

1. O QR Code deve conter apenas a oferta pública (UID, ID de sessão, chave ECDH efêmera pública, chave raiz pública, desafio e expiração). Nunca colocar chaves privadas no QR Code.
2. O documento temporário no Firestore deve ser vinculado ao UID e ao ID aleatório da sessão, ter expiração curta (máximo de cinco minutos) e ser apagado após o uso. Sem Cloud Functions, a expiração e o uso único precisam ser reforçados pelos clientes e por regras de acesso; o Firestore TTL é limpeza eventual, não mecanismo de autorização.
3. O aparelho host só deve publicar a resposta depois que a pessoa confirmar que os códigos de segurança coincidem nos dois aparelhos. O novo aparelho também deve confirmar o código exibido pelo host.
4. Registros de dispositivo não são confiáveis por existirem no Firestore. A confiança vem exclusivamente de um certificado cuja assinatura seja verificada contra a chave raiz já fixada localmente.
5. A chave pública raiz inicial deve ser criada uma única vez e fixada nos dispositivos confiáveis. Não aceitar substituição silenciosa da raiz. Troca/recuperação da raiz exige procedimento explícito de recuperação.
6. A chave privada raiz é compartilhada entre os dispositivos vinculados e é exportável para transferência cifrada. Isso é uma concessão deliberada do modelo sem backend: o comprometimento de qualquer dispositivo vinculado pode permitir a emissão de certificados falsos. Revogar um aparelho deve ser acompanhado de rotação da raiz e atualização dos certificados dos aparelhos restantes. A conclusão do pareamento também prova que a chave privada raiz transferida corresponde à chave pública raiz anunciada.
7. O segredo ECDH de cada dispositivo deve permanecer local e não exportável. Não armazenar chaves privadas de dispositivo no Firestore.
8. Não habilitar o novo formato de mensagens até que a integração de dispositivos, envelopes de chave por dispositivo, revogação e testes de quatro aparelhos esteja concluída.

## Limitações

- O módulo não implementa transporte Firestore, interface de QR Code, armazenamento IndexedDB da raiz, revogação, rotação de raiz, criptografia de mensagens ou migração.
- A validação é feita nos clientes. Sem Cloud Functions, as Security Rules não verificam assinatura ECDSA. Um registro forjado pode ser gravado, mas clientes corretos devem rejeitá-lo.
- O primeiro cadastro da chave raiz é um evento de confiança inicial (TOFU). A conta Firebase comprometida durante o primeiro cadastro pode ser usada para fixar uma raiz maliciosa.
- O código de seis dígitos deve ser comparado visualmente nos dois aparelhos; não substitui a verificação humana.
- Esta implementação não é um protocolo auditado nem substitui auditoria criptográfica independente.

## Endurecimento desta revisão

- A aceitação da oferta exige o UID da sessão autenticada; ofertas de outra conta são rejeitadas.
- O host confere se a identidade raiz local corresponde à chave pública incluída na oferta.
- O novo aparelho comprova que a chave privada raiz recebida corresponde à chave pública raiz já fixada, evitando aceitar um par de chaves divergente.
- Os testes cobrem UID divergente, chave raiz divergente, certificado adulterado, código incorreto e sessão expirada.

## Teste

Com Node.js 20+:

```bash
npm run test:pairing
```

O teste simula host e novo dispositivo, compara os códigos, valida a assinatura do certificado, verifica o vínculo ao UID, rejeita alteração do certificado e rejeita código incorreto.
