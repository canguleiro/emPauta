# Testes no Firebase Emulator

Este conjunto exercita as regras reais do Firestore, não mocks. Requer Node.js 20+, Firebase CLI e dependências de desenvolvimento instaladas.

```bash
npm install
npx firebase emulators:exec --only firestore --project criart-rules-emulator "node tests/emulator/firestore-rules.emulator.test.mjs"
```

O teste usa apenas o projeto fictício `criart-rules-emulator`; não contém credenciais de produção e não acessa o projeto remoto.

A suíte deve passar antes de qualquer deploy. O histórico de transições da rotação é deliberadamente server-only: o backend usa Admin SDK e as regras de cliente permanecem deny-by-default.
