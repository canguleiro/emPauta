import assert from 'node:assert/strict';
import { collectMessageHistoryPages } from '../js/message-history-pagination.js';

const source = Array.from({ length: 537 }, (_, i) => ({ id: `message_${String(i).padStart(4, '0')}`, v: 2 }));
let calls = 0;
const scan = await collectMessageHistoryPages({
  pageSize: 100,
  maxPages: 10,
  fetchPage: async ({ cursor, pageSize }) => {
    calls++;
    const start = cursor == null ? 0 : Number(cursor);
    const items = source.slice(start, start + pageSize);
    const next = items.length ? start + items.length : null;
    return { items, nextCursor: next };
  }
});
assert.equal(scan.scanned, 537);
assert.equal(scan.pages, 6);
assert.equal(scan.truncated, false);
assert.equal(calls, 6);
assert.equal(scan.messages[536].id, 'message_0536');

const limited = await collectMessageHistoryPages({
  pageSize: 100,
  maxPages: 2,
  fetchPage: async ({ cursor, pageSize }) => {
    const start = cursor == null ? 0 : Number(cursor);
    const items = source.slice(start, start + pageSize);
    return { items, nextCursor: start + items.length };
  }
});
assert.equal(limited.scanned, 200);
assert.equal(limited.truncated, true);

await assert.rejects(() => collectMessageHistoryPages({
  pageSize: 10,
  fetchPage: async () => ({ items: Array.from({ length: 10 }, () => ({ id: 'same' })), nextCursor: 1 })
}), /cursor de paginação não avançou/i);

console.log('OK: paginação percorre históricos acima de 500 mensagens, respeita limite de segurança e detecta cursor estagnado.');
