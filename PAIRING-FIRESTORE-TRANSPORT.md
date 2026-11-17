# CrIArt — transporte Firestore para pareamento (Etapa 3C)

## Estado

Esta entrega acrescenta a camada de transporte Firestore e regras para sessões, raízes e certificados públicos. Ela **ainda não está ligada à interface do aplicativo nem ao login/fluxo de sessão**. Não publicar como versão funcional e não aplicar as regras em produção ainda.

## Arquivos

- `js/device-pairing-store.js`: operações de criação/escuta de sessão, envio de solicitação, resposta cifrada, fixação TOFU da raiz e publicação do certificado.
- `firebase/firestore.rules`: novas regras para `pairingSessions`, `deviceRoots` e `devices/{uid}/items`.
- `js/device-pairing.js`: protocolo criptográfico da etapa anterior.

## Modelo Firestore

- `private/private-room/pairingSessions/{sessionId}`: oferta pública, solicitação e resposta cifrada; expiração em até cinco minutos.
- `private/private-room/deviceRoots/{uid}`: chave pública raiz fixada na primeira utilização (TOFU).
- `private/private-room/devices/{uid}/items/{deviceId}`: certificado público assinado do dispositivo.

## Limitações de segurança sem backend

1. Firestore TTL, se configurado, é limpeza eventual e não controle de validade. O cliente rejeita sessões expiradas pelo campo `expiresAtMs`.
2. Regras do Firestore não validam ECDSA e não distinguem duas instalações autenticadas com o mesmo UID. Um cliente modificado pode tentar gravar solicitação/resposta/certificado falso. Clientes oficiais precisam validar assinatura e identidade raiz antes de confiar em certificados.
3. A primeira chave raiz é TOFU. Se um invasor controlar a conta durante a primeira fixação, poderá fixar uma raiz maliciosa.
4. O estado de sessão e as transições são reforçados por transações no cliente, mas não são uma garantia contra um cliente malicioso com o mesmo UID.
5. A identidade raiz privada compartilhada entre dispositivos permite que um dispositivo comprometido emita certificados. Revogação real requer rotação da raiz e reemissão dos certificados dos dispositivos restantes.
6. O transporte ainda não implementa a interface QR, armazenamento IndexedDB, revogação/rotação nem mensagens multi-dispositivo.

## Importante

Não substituir regras de produção nesta etapa. A integração completa precisa conectar o módulo ao ciclo de autenticação, validar todos os dados recebidos, persistir as chaves localmente e testar com dois usuários e pelo menos quatro instalações.
