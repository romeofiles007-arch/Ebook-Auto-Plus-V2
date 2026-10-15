import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import * as P from './prompts.js';

const source = await readFile(new URL('./machine.js', import.meta.url), 'utf8');
const start = source.indexOf('  async flowAgentBatches(');
const method = source.slice(start, source.indexOf('  async imagesViaFlow(', start));

async function run(jobs, { alreadyGenerated = false, finishBatch = false } = {}) {
  const calls = [];
  const book = {
    id: 'book', contentMode: 'prose', figureStyle: 'doodle', language: 'th',
    figures: jobs.map((j) => ({ name: j.name, subject: j.name === 'rejected.png' ? 'A person practicing conversation' : 'A person listening' })),
    imagePhase: { rejectedImageNames: ['rejected.png'], agentMediaIds: { 'rejected.png': 'rejected-old-id' } },
  };
  if (alreadyGenerated) {
    book.imagePhase.agentMediaIds['rejected.png'] = 'new-confirmed-id';
    book.imagePhase.agentRegeneratedMediaIds = { 'rejected.png': 'new-confirmed-id' };
  }
  const context = vm.createContext({
    book, P, AGENT_BATCH: 10, FLOW_MODELS: ['Nano Banana 2 Lite'], FLOW_REF_COLLECTION: 'References',
    db: { loadAsset: async (_, name) => name === 'rejected.png' ? { meta: {}, blob: {} } : null },
    validatePhase2Asset: async () => ({ ok: true }),
    flowRatioFor: () => ({ label: '4:3' }),
    flowCall: async (op, args) => {
      calls.push({ op, args });
      if (op === 'lookupNamed') return { ok: true, mediaIds: { 'recoverable.png': 'existing-good-id' } };
      if (finishBatch) return { ok: true, mediaIds: { 'rejected.png': 'new-confirmed-id' }, named: ['rejected.png'], missing: [], created: 1 };
      // Stop after observing the new batch request, without any real model or browser call.
      return { ok: false, code: 'wrong_place', error: 'end of test' };
    },
    setInterval: () => 1,
    clearInterval() {},
  });
  vm.runInContext(`class TestMachine { ${method} }
    globalThis.machine = new TestMachine();
    Object.assign(machine, { book, missingAuthorFace: () => false, save: async () => {}, log() {}, emit() {}, stopFlowTabBusy: async () => true });`, context);
  await context.machine.flowAgentBatches(jobs, [], new Map());
  return { calls, book };
}

test('rejected artwork: ignore its stale asset and media id, and request a new shot without name recovery', async () => {
  const { calls } = await run([{ name: 'rejected.png', kind: 'interior' }]);
  assert.deepEqual(calls.map((c) => c.op), ['agentBatch']);
  assert.deepEqual(Array.from(calls[0].args.shots, (s) => s.name), ['rejected.png']);
  assert.match(calls[0].args.brief, /FINAL ARTWORK CHECK/);
});

test('mixed queue: recover approved artwork and regenerate only rejected artwork', async () => {
  const { calls, book } = await run([
    { name: 'rejected.png', kind: 'interior' },
    { name: 'recoverable.png', kind: 'interior' },
  ]);
  assert.deepEqual(calls.map((c) => c.op), ['lookupNamed', 'agentBatch']);
  assert.deepEqual(Array.from(calls[0].args.names), ['recoverable.png']);
  assert.deepEqual(Array.from(calls[1].args.shots, (s) => s.name), ['rejected.png']);
  assert.equal(book.imagePhase.agentMediaIds['recoverable.png'], 'existing-good-id');
});

test('resume after generation but before asset download: use the confirmed new id without generating again', async () => {
  const { calls } = await run([{ name: 'rejected.png', kind: 'interior' }], { alreadyGenerated: true });
  assert.deepEqual(calls, []);
});

test('completed redraw checkpoints its fresh media id while the old artwork remains rejected', async () => {
  const { book } = await run([{ name: 'rejected.png', kind: 'interior' }], { finishBatch: true });
  assert.equal(book.imagePhase.agentRegeneratedMediaIds['rejected.png'], 'new-confirmed-id');
  assert.equal(book.imagePhase.agentMediaIds['rejected.png'], 'new-confirmed-id');
  assert.equal(book.imagePhase.rejectedImageNames.includes('rejected.png'), true);
});
