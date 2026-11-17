# Etapa 4B.18 — preparação de homologação no Firebase Emulator

## Implementado
- `firebase.json` com Firestore, Auth e Storage Emulator em portas locais dedicadas.
- Harness de regras reais com `@firebase/rules-unit-testing`.
- Casos para allowlist de duas contas, fixação imutável da raiz, revogação cooperativa e histórico de rotação exclusivo do backend.
- Script `npm run test:emulator` e instruções de execução isolada.

## Resultado desta execução
A suíte Node.js existente foi executada separadamente. O teste real do Emulator NÃO foi executado nesta sessão: Firebase CLI e dependências do Emulator não estão instalados no ambiente. Não declarar homologação concluída até executar o comando documentado em ambiente com Firebase CLI.

## Segurança
O projeto configurado é fictício (`criart-rules-emulator`). Nenhum deploy, conexão ou escrita no Firebase de produção foi realizado.
