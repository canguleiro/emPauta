# CrIArt — Etapa 3D: armazenamento local das identidades

## Entrega
`js/device-pairing-vault.js` acrescenta funções para persistir e recuperar:
- identidade raiz da conta (CryptoKey ECDSA + chave pública JWK); a chave privada raiz é exportável apenas para ser transferida dentro do canal cifrado ECDH/AES-GCM;
- identidade privada de cada dispositivo (CryptoKey ECDH não exportável + certificado);
- listagem e remoção de identidades locais de dispositivos.

O módulo utiliza o banco IndexedDB `em-pauta-private`, versão 1, e o object store `keys` já criado pelo aplicativo. Não altera `app.js`, `index.html`, regras Firebase ou o fluxo de mensagens.

## Segurança e limites
- As chaves privadas são armazenadas como objetos `CryptoKey`. A chave privada de cada dispositivo é não exportável. A chave raiz da conta é exportável porque o pareamento precisa transferi-la, sempre dentro do envelope cifrado ECDH/AES-GCM; ela não é gravada como PKCS#8/JWK em texto no IndexedDB.
- A persistência depende das garantias de armazenamento do navegador e do sistema operacional. IndexedDB não é um cofre protegido contra malware ou acesso local ao perfil do navegador.
- `saveAccountRoot` e `saveLocalDevice` usam `add`, evitando sobrescrita silenciosa.
- Remover a chave local não revoga o certificado remoto. A revogação remota ainda precisa ser implementada e validada.
- Este módulo ainda não está integrado ao login nem ao pareamento Firestore.

## Testes
Verificação de sintaxe executada com `node --check`. O comportamento real do IndexedDB e a persistência de CryptoKey precisam ser testados em navegadores compatíveis (Chrome/Android e Chrome/desktop) antes da publicação.

## Instrução
Não publicar isoladamente. A próxima integração deverá chamar estas funções no fluxo de inicialização, no pareamento e na gestão de dispositivos, com tratamento de migração e recuperação explícito.
