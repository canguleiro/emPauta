# Etapa 4B.17 — testes integrados de rotação ponta a ponta

## Cenário coberto
- Duas contas com raízes criptográficas independentes.
- Três dispositivos ativos em cada conta.
- Preparação e commit lógico da rotação da conta A.
- Consulta autenticada da cadeia pelo endpoint HTTP.
- Retorno de um dispositivo public-only que ficou offline.
- Validação da cadeia antes da atualização local.
- Proteção de aparelho que ainda conserva chave privada raiz.
- Bloqueio de aparelho ausente do inventário atualizado.
- Isolamento entre as contas A e B.

## Resultado
O teste de integração ponta a ponta passou junto com toda a suíte existente. O armazenamento usado neste cenário é um adaptador em memória que simula o contrato transacional; não substitui o teste com Firebase Emulator nem comprova implantação real.
