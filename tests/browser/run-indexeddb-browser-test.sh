#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PORT="${CRIART_TEST_PORT:-8765}"
CHROME="${CHROME_BIN:-chromium}"
TMP="$(mktemp -d)"
cleanup() { kill "${SERVER_PID:-}" 2>/dev/null || true; rm -rf "$TMP"; }
trap cleanup EXIT
python3 -m http.server "$PORT" --bind 127.0.0.1 --directory "$ROOT" >"$TMP/http.log" 2>&1 &
SERVER_PID=$!
for _ in $(seq 1 50); do
  if curl -fsS --max-time 1 "http://127.0.0.1:$PORT/tests/browser/indexeddb-vault.browser.html" >/dev/null; then break; fi
  sleep 0.1
done
timeout 30s "$CHROME" --headless --no-sandbox --disable-gpu --disable-dev-shm-usage --user-data-dir="$TMP/profile" --virtual-time-budget=15000 --dump-dom "http://127.0.0.1:$PORT/tests/browser/indexeddb-vault.browser.html" >"$TMP/dom.html" 2>"$TMP/chrome.log"
if grep -q 'data-test-status="passed"' "$TMP/dom.html" && grep -q 'PASS: HOMOLOGAÇÃO REAL DO INDEXEDDB CONCLUÍDA' "$TMP/dom.html"; then
  sed -n 's/.*<pre id="result">\(.*\)<\/pre>.*/\1/p' "$TMP/dom.html" | sed 's/\\n/\n/g'
else
  cat "$TMP/dom.html"
  cat "$TMP/chrome.log" >&2
  exit 1
fi
