#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

printf '\n[1/3] Suíte completa Node.js\n'
npm test

printf '\n[2/3] Firebase Emulator (pré-requisitos + regras)\n'
npm run test:emulator:preflight
npm run test:emulator

printf '\n[3/3] Navegador real (IndexedDB + WebCrypto)\n'
npm run test:browser:indexeddb

printf '\nPASS: todos os gates locais de release foram aprovados.\n'
