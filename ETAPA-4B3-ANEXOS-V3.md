# CrIArt — Etapa 4B.3: anexos V3

## Implementado
- Envio de anexos com criptografia V3 por dispositivo autorizado.
- Chave AES-256-GCM aleatória por arquivo, encapsulada individualmente para cada instalação.
- Conteúdo cifrado binário enviado ao Firebase Storage.
- Envelope criptográfico sem o campo `ciphertext` persistido dentro do conteúdo cifrado da mensagem no Firestore.
- Descriptografia local condicionada a certificado válido e wrapper para o UID/deviceId local.
- Compatibilidade de leitura dos anexos V2 antigos mantida pelo fluxo legado.
- Edição de mensagens com anexo preserva os metadados criptográficos do anexo dentro do corpo cifrado.
- Limite de arquivo mantido em 8 MiB; regra local de Storage ampliada para 9 MiB para acomodar a tag de autenticação.

## Formato
`media` faz parte do corpo da mensagem V3 e, portanto, permanece cifrado no envelope da mensagem. Contém `path`, `type`, `name`, `size` e `envelope`. O envelope do anexo contém versão, finalidade, remetente, certificado, IV e wrappers por dispositivo, mas não contém os bytes cifrados. Os bytes são armazenados em `private/private-room/media/{messageId}.bin`.

## Segurança e limites
- Nenhum conteúdo em claro é enviado ao Storage.
- O Firestore não recebe os bytes do anexo nem seu ciphertext Base64.
- O cliente verifica o certificado do remetente contra a raiz fixada e só abre o arquivo se houver wrapper para o dispositivo local.
- O caminho V2 permanece disponível somente para anexos históricos que tenham `salt` e `iv` legados.
- As regras locais de Storage foram atualizadas; não foram publicadas.
- Não houve alteração no Firebase em produção nem migração dos anexos existentes.
- O protocolo ainda não implementa Double Ratchet nem forward secrecy histórica.

## Validação
Executar `npm test`. Inclui teste de arquivo binário com quatro instalações, confirmação de envelope compacto, rejeição de ciphertext adulterado e bloqueio de dispositivo não autorizado.
