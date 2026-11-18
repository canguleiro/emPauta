import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const chrome = process.env.CHROME_BIN || 'chromium';
const port = process.env.CRIART_TEST_PORT || '8765';
const timeoutMs = Number(process.env.CRIART_BROWSER_TEST_TIMEOUT_MS || 45000);
const url = `http://127.0.0.1:${port}/tests/browser/indexeddb-vault.browser.html`;
const profile = await mkdtemp(join(tmpdir(), 'criart-chrome-'));
let child;
let socket;
let stderr = '';
let nextId = 0;
const pending = new Map();

function fail(message) {
  throw new Error(message);
}

try {
  child = spawn(chrome, [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--disable-background-networking',
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
    url
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

  child.stderr.setEncoding('utf8');
  child.stderr.on('data', chunk => { stderr += chunk; });

  const startedAt = Date.now();
  let debuggingPort;
  while (!debuggingPort && Date.now() - startedAt < 15000) {
    const match = stderr.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//);
    if (match) debuggingPort = match[1];
    if (child.exitCode !== null) fail(`Chrome encerrou durante a inicialização.\n${stderr}`);
    await delay(100);
  }
  if (!debuggingPort) fail(`Chrome não disponibilizou a interface de depuração.\n${stderr}`);

  let page;
  while (!page && Date.now() - startedAt < 20000) {
    try {
      const response = await fetch(`http://127.0.0.1:${debuggingPort}/json/list`);
      const targets = await response.json();
      page = targets.find(target => target.type === 'page' && target.url.startsWith(url));
    } catch {}
    if (!page) await delay(100);
  }
  if (!page?.webSocketDebuggerUrl) fail('Chrome iniciou, mas a aba de teste não foi localizada.');

  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });

  socket.addEventListener('message', event => {
    let message;
    try { message = JSON.parse(event.data); } catch { return; }
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
    }
  });

  const cdp = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(`Timeout na chamada CDP ${method}`));
      }
    }, 10000).unref?.();
  });

  await cdp('Runtime.enable');
  const deadline = Date.now() + timeoutMs;
  let lastText = 'A página ainda não informou o resultado.';
  while (Date.now() < deadline) {
    const evaluation = await cdp('Runtime.evaluate', {
      expression: `(() => ({
        status: document.documentElement.dataset.testStatus || '',
        text: document.querySelector('#result')?.textContent || '',
        ready: document.readyState
      }))()`,
      returnByValue: true,
      awaitPromise: true
    });
    const state = evaluation.result?.value;
    if (state?.text) lastText = state.text;
    if (state?.status === 'passed' &&
        state.text.includes('PASS: HOMOLOGAÇÃO REAL DO INDEXEDDB CONCLUÍDA')) {
      process.stdout.write(`${state.text}\n`);
      process.exitCode = 0;
      break;
    }
    if (state?.status === 'failed') {
      fail(state.text || 'O teste do navegador informou falha sem detalhes.');
    }
    await delay(150);
  }

  if (process.exitCode !== 0) {
    fail(`Tempo esgotado aguardando o teste real do navegador.\nÚltimo estado: ${lastText}`);
  }
} catch (error) {
  console.error(`FAIL: ${error?.stack || error}`);
  if (stderr.trim()) console.error(stderr.trim());
  process.exitCode = 1;
} finally {
  try { socket?.close(); } catch {}
  if (child && child.exitCode === null) child.kill('SIGTERM');
  await delay(250);
  if (child && child.exitCode === null) child.kill('SIGKILL');
  await rm(profile, { recursive: true, force: true });
}
