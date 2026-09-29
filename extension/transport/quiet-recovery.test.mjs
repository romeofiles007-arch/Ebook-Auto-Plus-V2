import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('./chatgpt-tab.js', import.meta.url), 'utf8');

function fixture(replies) {
  let now = 0;
  let listener;
  let probes = 0;
  const timers = new Map();
  let nextTimer = 0;
  const context = {
    Date: class extends Date { static now() { return now; } },
    setTimeout(fn, ms) {
      const id = ++nextTimer;
      if (ms === 1600) queueMicrotask(() => { now += ms; fn(); });
      else timers.set(id, { fn, ms });
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
    chrome: { runtime: {
      onMessage: { addListener(fn) { listener = fn; } },
      async sendMessage(msg) {
        if (msg.type === 'sw.recoverTurn') return replies[probes++] ?? null;
        return { ok: true };
      },
    } },
  };
  const { ChatGptTabTransport, recoverQuietTurns, hasPendingTurn } = vm.runInNewContext(
    source.replaceAll('export ', '') + '\n({ ChatGptTabTransport, recoverQuietTurns, hasPendingTurn })', context,
  );
  return { tr: new ChatGptTabTransport(), recoverQuietTurns, hasPendingTurn,
    advance(ms) { now += ms; }, probes() { return probes; }, listener, timers };
}

test('a quiet turn takes the completed result from its original tab without resending', async () => {
  const f = fixture([{ state: 'done', result: { status: 'ok', text: '<<<SEC 1.1 BEGIN>>>\nตอบแล้ว\n<<<SEC 1.1 END>>>' } }]);
  const pending = f.tr.send('เขียนตอน 1.1');
  f.advance(46000);
  await f.recoverQuietTurns();
  const result = await pending;
  assert.equal(result.status, 'ok');
  assert.match(result.text, /ตอบแล้ว/);
  assert.equal(result.meta.recoveredAfterSilence, true);
  assert.equal(f.probes(), 1);
  assert.equal(f.hasPendingTurn(), false);
});

test('an unreachable tab twice releases the pending turn without sending a duplicate', async () => {
  const f = fixture([null, null]);
  const pending = f.tr.send('เขียนตอน 1.1');
  f.advance(46000);
  await f.recoverQuietTurns();
  assert.equal(f.hasPendingTurn(), true);
  f.advance(31000);
  await f.recoverQuietTurns();
  const result = await pending;
  assert.equal(result.meta.error, 'outcome_unknown');
  assert.equal(f.probes(), 2);
  assert.equal(f.hasPendingTurn(), false);
});

test('not_sent must be confirmed twice before the prompt is safe to retry', async () => {
  const f = fixture([{ state: 'not_sent' }, { state: 'not_sent' }]);
  const pending = f.tr.send('เขียนตอน 1.1');
  f.advance(46000);
  await f.recoverQuietTurns();
  assert.equal(f.hasPendingTurn(), true);
  f.advance(31000);
  await f.recoverQuietTurns();
  assert.equal((await pending).meta.error, 'prompt_not_sent');
});

test('the second probe can confirm a stable answer from an active turn', async () => {
  const f = fixture([
    { state: 'running' },
    { state: 'done', result: { status: 'ok', text: 'คำตอบครบ' } },
  ]);
  const pending = f.tr.send('เขียนตอน 1.1');
  f.advance(46000);
  await f.recoverQuietTurns();
  const result = await pending;
  assert.equal(result.text, 'คำตอบครบ');
  assert.equal(f.probes(), 2);
});
