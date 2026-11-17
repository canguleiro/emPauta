# CrIArt — Etapa 4B.14: cadeia de rotação para aparelhos offline

## Objetivo
Permitir que um aparelho que permaneceu offline reconheça uma ou mais rotações sucessivas sem confiar diretamente na última chave recebida. Cada transição é validada contra a chave pública da época anterior.

## Implementação
- `js/device-root-rotation-chain.js`: valida cadeia assinada, UID, inventário, continuidade de época e vínculo da cabeça da cadeia.
- `js/device-root-rotation-client.js`: consulta autenticada `GET /v1/root-rotations/chain?fromEpoch=N`.
- `backend/root-rotation/rotation-service.mjs`: endpoint de leitura autenticado e restrito aos UIDs permitidos.
- `backend/root-rotation/server.mjs`: grava cada pacote público de transição no mesmo commit transacional da atualização da raiz e dos certificados; consulta histórico ordenado por época.
- `tests/device-root-rotation-chain.test.mjs`: cadeia com duas rotações, aparelho offline, salto de época, replay, adulteração e cabeça divergente.

## Persistência
Histórico em `private/ROOM/rootRotationHistory/{uid}/items/{epoch}`. O documento é criado na mesma transação Firestore que atualiza `deviceRoots/{uid}` e os certificados dos dispositivos. A chave privada nunca é armazenada no histórico.

## Uso seguro
O cliente deve buscar a cadeia a partir da época/fingerprint já confiável localmente, validar a resposta integralmente com `verifyRootRotationChainResponse` e somente então preparar a atualização do cofre local. Esta etapa não promove automaticamente a raiz local, não revoga aparelhos e não executa implantação.

## Limitações e pré-requisitos de produção
- O endpoint ainda precisa ser implantado e testado em projeto Firebase/Cloud Run de homologação.
- A consulta depende da existência de uma âncora local confiável. Se o cofre local foi perdido, a cadeia não substitui recuperação de identidade.
- O limite de leitura é 100 transições por consulta; cadeias maiores exigem paginação explícita antes de uso real.
- A segurança das Rules e a integridade de todos os caminhos Firestore devem ser auditadas com Emulator antes de produção.
