# CrIArt — Etapa 4B.8: revogação cooperativa e revalidação

## Implementado
- A interface de gerenciamento lista os dispositivos ativos e revogados.
- Um aparelho ativo pode marcar outro aparelho como `revoked`.
- A operação usa transação Firestore e lê o inventário antes da alteração.
- A política local impede auto-revogação, revogação de aparelho já inativo e revogação do último aparelho ativo.
- As regras locais permitem somente a transição `active` → `revoked`, com timestamp, sem alteração do certificado ou do proprietário.
- O aplicativo revalida o inventário do aparelho atual a cada cinco segundos, no máximo, antes de enviar mensagens V3, abrir mensagens V3 e descriptografar anexos V3. Se o aparelho tiver sido revogado, o contexto V3 é descartado e o envio é bloqueado.
- A interface informa a limitação de segurança da revogação atual.

## Limitação criptográfica importante
Esta é uma revogação cooperativa, não uma revogação forte contra um aparelho comprometido. No pareamento atual, a chave privada da identidade raiz é transferida aos aparelhos vinculados. Assim, um aparelho que conserve essa chave pode tentar criar outra identidade de dispositivo e registrá-la. As regras do Firestore autenticam o UID da conta, não uma instalação específica, e não conseguem validar assinaturas ECDSA.

A revogação forte exige redesenhar a autoridade de emissão: por exemplo, manter a chave raiz fora dos dispositivos de uso diário e usar um aparelho de autoridade para assinar novos certificados, ou introduzir um serviço confiável que valide dispositivos e operações. Essa mudança deve ser planejada antes de apresentar o recurso como proteção contra comprometimento.

## Validação
- Testes automatizados locais: pareamento, QR, envelopes, mensagens, anexos, migração de histórico, migração de anexos, interface de migração, paginação e política de revogação.
- `node --check` executado em `app.js`, `device-management.js` e `device-revocation-policy.js`.
- Regras do Firestore verificadas estaticamente no pacote.
- Firebase Emulator não foi executado: o Firebase CLI / Emulator Suite não está instalado nesta base. Portanto, não há validação efetiva de permissões no backend.

## Segurança operacional
- Não houve publicação das regras.
- Nenhum dispositivo foi revogado em produção.
- Nenhuma mensagem, anexo, chave privada ou dado local foi alterado.
- A revogação não apaga dados que o aparelho já tenha baixado ou descriptografado.
