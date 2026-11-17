# CrIArt — Etapa 4B.10: protocolo verificável de rotação da raiz

## Entrega
Foi criado `js/device-root-rotation.js`, um protocolo criptográfico offline para preparar e validar uma rotação da autoridade raiz sem alterar automaticamente Firestore ou IndexedDB.

## Fluxo criptográfico
1. O aparelho de autoridade apresenta o inventário completo de certificados ativos.
2. O módulo valida cada certificado com a chave pública da raiz antiga.
3. Gera uma nova identidade ECDSA P-256.
4. Reemite certificados para os mesmos `deviceId` e chaves públicas ECDH, agora assinados pela nova raiz e marcados com `rootEpoch`.
5. Produz uma transição contendo fingerprint da raiz anterior, nova chave pública, inventário ordenado e digest dos certificados.
6. A transição é assinada pela raiz antiga e pela nova raiz (dupla assinatura), demonstrando continuidade e posse da nova chave privada.
7. O validador verifica as duas assinaturas, UID, fingerprint anterior, digest e correspondência exata do inventário.

## Limites deliberados
- Esta etapa NÃO comita a rotação no Firestore.
- NÃO substitui a raiz no IndexedDB.
- NÃO revoga nem altera certificados remotos.
- NÃO habilita clientes antigos automaticamente.
- Não altera regras remotas ou locais do Firebase.

A razão é estrutural: Firestore Security Rules não validam ECDSA e todos os aparelhos de uma conta compartilham o mesmo Firebase UID. Sem backend confiável (por exemplo, Cloud Functions) ou um desenho de autorização adicional, uma gravação cliente de `deviceRoots/{uid}` não pode ser considerada uma rotação imposta pelo servidor. As regras atuais proíbem update da raiz e isso deve continuar assim até a decisão arquitetural.

## Operação necessária antes de um commit futuro
- Confirmar inventário de todos os aparelhos ativos e sua presença física/controle pelo usuário.
- Atualizar todos os clientes para entender transições de raiz.
- Fazer backup do Firestore/Storage e dos cofres locais.
- Validar o bundle em cada aparelho ativo.
- Definir mecanismo confiável de commit e prevenção de rollback.
- Só então migrar raiz e certificados em operação coordenada; nunca apagar a raiz antiga antes da confirmação de todos os aparelhos.

## Testes
`tests/device-root-rotation.test.mjs` cobre quatro dispositivos, dupla assinatura, reemissão de certificados, vínculo exato do inventário, UID incorreto, raiz antiga incorreta, certificado adulterado, transição adulterada e inventário incompleto.
