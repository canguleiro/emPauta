# CrIArt — Etapa 4B.2: integração de mensagens V3

## Entregue
- Integração do protocolo V3 ao envio de novas mensagens de texto.
- Seleção de todos os dispositivos ativos certificados das duas contas, incluindo o aparelho remetente.
- Verificação dos certificados contra as raízes fixadas antes de cifrar.
- Descriptografia V3 somente quando existe wrapper destinado ao UID e deviceId locais.
- Leitura V2 preservada como fallback para o histórico em aparelhos que conservam a identidade V2 original.
- Edição de mensagens novas por envelope V3.
- Cache curto (10 segundos) do inventário remoto para evitar consultar Firestore repetidamente ao renderizar o histórico.
- Regras Firestore locais ampliadas para aceitar documentos V2 e V3 e edição de envelope.

## Limitações deliberadas
- Anexos novos estão temporariamente bloqueados no envio. O formato atual de anexos V2 não é compatível com a identidade independente de cada dispositivo. A etapa 4B.3 fará a criptografia V3 do conteúdo binário e o transporte do envelope pelo Storage.
- Aparelhos novos ainda não são liberados para a conversa. A leitura V2 em aparelho novo depende de uma estratégia explícita de migração de chave/histórico; o fallback V2 não inventa nem recupera chaves ausentes.
- Reações, confirmação de leitura e metadados permanecem no modelo atual.
- As regras locais não foram publicadas no Firebase. Não houve alteração em produção.
- O protocolo não implementa Double Ratchet nem forward secrecy histórica.

## Validações
Executar `npm test`. A validação de regras Firestore deve ser feita no Emulator Suite antes de qualquer publicação.
