# CrIArt — Etapa 4B.11: pacote portátil e validação anti-replay

## Entrega

- `js/device-root-rotation-package.js`
- `tests/device-root-rotation-package.test.mjs`

A etapa acrescenta uma representação JSON portátil da transição de raiz e dos certificados reemitidos. O serializador usa uma lista de campos permitidos: mesmo que receba o objeto bruto produzido pela etapa 4B.10 (que mantém a nova `CryptoKey` privada em memória), a chave privada não é incluída no arquivo exportado.

## Validação no aparelho receptor

`validateRootRotationPackage` exige:

1. UID esperado;
2. chave pública da raiz antiga já confiável no aparelho;
3. época local confiável, informada pelo chamador;
4. época do pacote exatamente igual à época local + 1;
5. dupla assinatura da transição;
6. digest íntegro dos certificados;
7. inventário de dispositivos sem omissões ou duplicações;
8. certificados válidos sob a nova raiz.

O resultado é apenas uma validação criptográfica do pacote. Não instala a nova raiz, não grava Firestore, não confirma presença física de aparelhos e não prova que todos os dispositivos participaram.

## Segurança e limites

- Pacotes acima de 256 KiB são rejeitados.
- JSON inválido, formato desconhecido, UID divergente, replay, rollback e salto de época são rejeitados.
- A chave privada da nova raiz não é exportada.
- A chave privada da nova raiz permanece na memória do aparelho que criou a rotação; a persistência recuperável dessa identidade precisa ser implementada com um fluxo local explícito e testado antes de iniciar qualquer rotação real.
- A época confiável deve vir de estado local protegido e coerente com a raiz fixada. Não se deve aceitar o valor informado pelo próprio pacote como âncora.
- Nenhum commit remoto é executado nesta etapa.

## Testes

`npm test` inclui o teste novo e valida roundtrip, exclusão de segredos, assinatura, UID, anti-replay, rollback e salto de época.
