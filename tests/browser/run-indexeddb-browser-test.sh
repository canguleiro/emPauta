#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PORT="${CRIART_TEST_PORT:-8765}"
CHROME="${CHROME_BIN:-chromium}"
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

# O orçamento de tempo virtual do Chrome controla a espera. Não usar setInterval
# com Date.now(): no modo virtual, o relógio avança rapidamente e causa falso timeout.
timeout 70s "$CHROME" --headless --no-sandbox --disable-gpu --disable-dev-shm-usage \
  --disable-background-networking --no-first-run --user-data-dir="$TMP/profile" \
  --timeout=65000 --virtual-time-budget=60000 --dump-dom \
  "http://127.0.0.1:$PORT/tests/browser/indexeddb-vault.browser.html" \
  >"$TMP/dom.html" 2>"$TMP/chrome.log"

if grep -q 'data-test-status="passed"' "$TMP/dom.html" && \
   grep -q 'PASS: HOMOLOGAÇÃO REAL DO INDEXEDDB CONCLUÍDA' "$TMP/dom.html"; then
  sed -n 's/.*<pre id="result">\(.*\)<\/pre>.*/\1/p' "$TMP/dom.html" | sed 's/\\n/\n/g'
elif grep -q 'data-test-status="failed"' "$TMP/dom.html"; then
  sed -n 's/.*<pre id="result">\(.*\)<\/pre>.*/\1/p' "$TMP/dom.html"
  exit 1
else
  echo "FAIL: navegador encerrou sem sinalizar conclusão do teste." >&2
  grep -o '<pre id="result">.*</pre>' "$TMP/dom.html" || cat "$TMP/dom.html"
  cat "$TMP/chrome.log" >&2
  exit 1
fi
