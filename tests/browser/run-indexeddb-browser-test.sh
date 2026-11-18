#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PORT="${CRIART_TEST_PORT:-8765}"
TMP="$(mktemp -d)"
SERVER_PID=""
cleanup() {
  if [[ -n "$SERVER_PID" ]]; then kill "$SERVER_PID" 2>/dev/null || true; fi
  rm -rf "$TMP"
}
trap cleanup EXIT

python3 -m http.server "$PORT" --bind 127.0.0.1 --directory "$ROOT" >"$TMP/http.log" 2>&1 &
SERVER_PID=$!
READY=0
for _ in $(seq 1 100); do
  if curl -fsS --max-time 1 "http://127.0.0.1:$PORT/tests/browser/indexeddb-vault.browser.html" >/dev/null 2>&1; then
    READY=1
    break
  fi
  sleep 0.1
done
if [[ "$READY" -ne 1 ]]; then
  cat "$TMP/http.log" >&2
  echo "FAIL: servidor HTTP local não iniciou." >&2
  exit 1
fi

cd "$ROOT"
node tests/browser/run-indexeddb-browser-test.mjs
