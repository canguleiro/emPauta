# CrIArt — Etapa 4B.9: autoridade criptográfica e pareamento public-only

## Objetivo
Impedir que novos aparelhos recebam a chave privada raiz durante o pareamento. A chave raiz privada é a autoridade que assina certificados de dispositivo; distribuí-la a cada aparelho tornava a revogação cooperativa insuficiente.

## Alterações
- O aparelho autorizador continua assinando o certificado do novo dispositivo.
- O envelope de pareamento passa a transportar `payloadVersion: 2` e o certificado, sem `rootPrivateKeyPkcs8`.
- O novo aparelho valida a assinatura usando a chave pública raiz já fixada.
- O cofre local permite persistir a chave pública raiz sem chave privada (`saveAccountRootPublic`).
- `loadDeviceCryptoContext` exige somente a raiz pública e a chave privada ECDH do próprio dispositivo.
- `prepareDeviceAccess` reconhece o aparelho public-only como dispositivo vinculado e habilita seu contexto criptográfico V3.
- Aparelhos public-only não podem emitir novos certificados; a criação de novos pareamentos permanece restrita a um aparelho que possua a chave privada raiz.
- O teste de pareamento verifica explicitamente que `finishPairingClient` não retorna chave privada raiz.

## Limitação de migração
A alteração impede a distribuição da chave raiz em novos pareamentos após a atualização coordenada dos aparelhos. Ela NÃO apaga cópias privadas que tenham sido transferidas por versões anteriores. Portanto, não representa ainda uma revogação forte contra dispositivos antigos ou comprometidos.

Para completar a rotação segura, será necessário: (1) identificar o aparelho de autoridade confiável; (2) confirmar acesso aos dois usuários e aos dispositivos ativos; (3) gerar uma nova raiz; (4) reemitir certificados dos dispositivos confiáveis por um procedimento autenticado; (5) atualizar a raiz fixada com uma transição verificável; (6) invalidar a raiz anterior apenas depois de todos os aparelhos confirmarem a nova identidade. Não executar esse procedimento automaticamente.

## Compatibilidade e segurança
- Certificados existentes continuam no formato e versão atuais.
- A leitura V2/V3 e as chaves legadas não são alteradas por esta etapa.
- Não há migração ou rotação automática da raiz.
- Nenhuma regra, documento ou arquivo do Firebase remoto foi alterado.
- O protocolo exige que os aparelhos que participam do pareamento estejam atualizados em conjunto, pois versões antigas ainda transferem a chave privada raiz.

## Testes
O teste de pareamento valida UID, segredo ECDH, código de segurança, certificado assinado, adulteração, código incorreto, expiração e ausência de chave privada raiz no retorno do novo aparelho.
