#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PROJECT_ID="criart-rules-emulator"
if [[ "${PROJECT_ID}" != "criart-rules-emulator" ]]; then
  echo "ERRO: projeto de homologação inesperado." >&2
  exit 1
fi

if ! command -v firebase >/dev/null 2>&1; then
  echo "Firebase CLI não encontrado. Instale com: npm install --global firebase-tools" >&2
  exit 2
fi

if [[ ! -d node_modules/@firebase/rules-unit-testing || ! -d node_modules/firebase ]]; then
  echo "Dependências de teste ausentes. Execute: npm install" >&2
  exit 3
fi

if [[ ! -f firebase/firestore.rules || ! -f tests/emulator/firestore-rules.emulator.test.mjs ]]; then
  echo "Arquivos de regras/teste não encontrados." >&2
  exit 4
fi

echo "Pré-requisitos presentes. Projeto isolado: ${PROJECT_ID}."
echo "Nenhum comando de deploy será executado."
