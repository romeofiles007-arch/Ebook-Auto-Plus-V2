import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('./sw.js', import.meta.url), 'utf8');
const start = source.indexOf("      case 'sw.recoverTurn': {");
const end = source.indexOf('      // ผู้ใช้กด "ภาพเสร็จแล้ว"', start);
const route = new Function('S', 'chrome', 'msg', 'sendResponse',
  `return (async () => { switch (msg.type) { ${source.slice(start, end)} default: return null; } })();`);

test('recovery asks the exact tab that accepted the turn', async () => {
  const asked = [];
  const S = { get: async () => ({ turn1: 42 }) };
  const chrome = { tabs: {
    sendMessage: async (id) => { asked.push(id); return { state: 'done', result: { text: 'คำตอบ' } }; },
    query: async () => { throw new Error('must not scan other tabs'); },
  } };
  const result = await route(S, chrome, { type: 'sw.recoverTurn', turnId: 'turn1', prompt: 'เขียน' }, (x) => x);
  assert.deepEqual(asked, [42]);
  assert.equal(result.result.text, 'คำตอบ');
});

test('an unrelated tab saying not_sent cannot hide the completed turn', async () => {
  const S = { get: async () => ({}) };
  const chrome = { tabs: {
    query: async () => [{ id: 1 }, { id: 2 }],
    sendMessage: async (id) => id === 1 ? { state: 'not_sent' }
      : { state: 'done', result: { text: 'คำตอบในแท็บที่สอง' } },
  } };
  const result = await route(S, chrome, { type: 'sw.recoverTurn', turnId: 'turn1', prompt: 'เขียน' }, (x) => x);
  assert.equal(result.result.text, 'คำตอบในแท็บที่สอง');
});
