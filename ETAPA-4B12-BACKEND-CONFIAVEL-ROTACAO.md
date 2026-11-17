# CrIArt — Etapa 4B.12: autoridade confiável de rotação no servidor

## O que foi implementado

- Serviço HTTP Node.js para Cloud Run, separado do frontend.
- Autenticação obrigatória por Firebase ID token (`verifyIdToken`).
- Allowlist obrigatória dos dois UIDs do aplicativo e origem HTTPS exata (`ALLOWED_UIDS`, `APP_ORIGIN`).
- Validação no servidor das assinaturas ECDSA da raiz antiga e da nova, fingerprint, UID, época, digest, certificados reemitidos e inventário exato dos aparelhos ativos.
- Transação Firestore Admin SDK que atualiza a raiz e todos os certificados no mesmo commit. O SDK Admin opera fora das regras de cliente; as regras continuam negando update/delete de raiz para clientes.
- Rejeição de replay/rollback e de qualquer mudança no inventário entre a preparação e o commit.
- Cliente HTTP explícito em `js/device-root-rotation-client.js`. Nenhum fluxo da interface o chama automaticamente nesta etapa.

## Documentos Firestore

O serviço lê e grava:
- `private/private-room/deviceRoots/{uid}`
- `private/private-room/devices/{uid}/items/{deviceId}`

Na rotação, a raiz recebe `publicKeyJwk`, `rootEpoch`, `rotatedAtMs` e `previousRootFingerprint`. Cada aparelho ativo recebe o certificado novo, `rootEpoch` e `certificateUpdatedAtMs`. Os estados de aparelho não são alterados.

Raiz antiga sem `rootEpoch` é interpretada como época 1. A primeira rotação passa para época 2.

## Implantação — ainda não executada

Requisitos: projeto Firebase correto, conta de serviço dedicada do Cloud Run com `roles/datastore.user`, Artifact Registry/Cloud Run habilitados e origem HTTPS exata do app.

A partir de `backend/root-rotation`:

```bash
npm install
npm test
```

Implantação ilustrativa (substituir projeto, região, serviço e origem):

```bash
gcloud run deploy criart-root-rotation \
  --source . \
  --region REGIAO \
  --project PROJETO_FIREBASE \
  --service-account CONTA_SERVICO \
  --allow-unauthenticated \
  --set-env-vars "ALLOWED_UIDS=UID_1,UID_2,APP_ORIGIN=https://ORIGEM-DO-APP"
```

`--allow-unauthenticated` refere-se somente à camada de invocação do Cloud Run. O endpoint exige Firebase ID token válido e aplica allowlist interna. A conta de serviço deve ter apenas a permissão Firestore necessária. Não incluir chaves JSON de service account no repositório.

## Limites e bloqueios antes de produção

- A implantação não foi executada e nenhum Firebase remoto foi acessado.
- O serviço verifica o inventário de aparelhos ativos no instante do commit. Não exige que cada aparelho esteja simultaneamente online: os certificados novos são publicados para aparelhos ativos que preservam suas chaves ECDH privadas.
- O serviço ainda não é integrado à interface de rotação. Não deve ser invocado até existir fluxo de prévia, confirmação explícita, persistência recuperável da nova chave privada no aparelho autorizador e plano de recuperação.
- É necessário confirmar a política de origem e os UIDs no ambiente real antes do deploy.
- A chave privada da nova raiz não é enviada ao servidor; o servidor recebe apenas o pacote público e verifica as duas assinaturas.
- A transação Firestore é atômica para os documentos raiz e dispositivos. Se o conjunto de aparelhos ultrapassar o limite transacional, a operação falha integralmente; o protocolo atual limita o inventário a 20.

## Testes

`tests/backend/root-rotation-service.test.mjs` valida commit, autenticação, allowlist, UID, inventário ativo exato, replay, adulteração e contrato transacional com repositório simulado. Isso não substitui um teste de integração no Firebase Emulator, que permanece obrigatório antes de implantação.
