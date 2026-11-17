# Etapa 4B.23 — homologação contínua e gates de release

## Objetivo

Transformar as verificações finais em gates reproduzíveis e obrigatórios antes de qualquer release. Esta etapa não executa deploy e não altera Firebase remoto.

## Implementado

- Job independente `browser-indexeddb` no GitHub Actions.
- Instalação explícita do Chrome no runner e execução do teste real de IndexedDB/WebCrypto.
- Preservação do job `firestore-rules`, que executa as regras no Firebase Emulator.
- Script `npm run test:release-gates` que executa, em sequência, a suíte Node.js, o Emulator e o navegador; qualquer etapa ausente ou reprovada interrompe o processo.
- Nenhum gate declara aprovação por fallback ou por teste simulado.

## Execução

```bash
npm install --no-audit --no-fund
npm run test:release-gates
```

O script requer Firebase CLI, dependências `@firebase/rules-unit-testing`/`firebase`, runtime do Emulator e Chrome funcional. A ausência de qualquer requisito bloqueia o gate.

## Validação nesta sessão

- `npm test`: APROVADO — todos os testes criptográficos, integração, rotação e endurecimento de chaves passaram.
- `npm run test:emulator:preflight`: BLOQUEADO — Firebase CLI ausente.
- `npm install --no-audit --no-fund`: não concluiu dentro do limite de execução disponível; portanto as dependências do Emulator não foram instaladas.
- `npm run test:browser:indexeddb`: BLOQUEADO neste container — Chromium instalado, mas o processo headless não concluiu `--dump-dom` e atingiu o timeout. O job GitHub Actions foi preparado para executar em runner limpo com Chrome instalado pela action.

## Critério de liberação

A release só pode ser considerada homologada quando os dois jobs do GitHub Actions (`firestore-rules` e `browser-indexeddb`) estiverem verdes, além da suíte Node.js. Esta etapa não recebeu esses resultados remotos e, portanto, não declara o CrIArt pronto para produção.

## Segurança

- O workflow não executa deploy.
- O projeto de Emulator permanece fictício e isolado (`criart-rules-emulator`).
- Nenhuma credencial de produção é usada.
- Nenhuma chave, mensagem, anexo ou documento remoto foi alterado.
