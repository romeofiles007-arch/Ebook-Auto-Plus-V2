import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { planFlowImageRepair } from './image-repair.js';

const jobs = [
  { name: 'redraw.png', kind: 'interior' },
  { name: 'retrieve.png', kind: 'interior' },
  { name: 'keep.png', kind: 'interior' },
  { name: 'cover-front.png', kind: 'cover' },
];
const makeBook = () => ({
  id: 'current-book', imageSource: 'flow', topic: 'Test', job: { step: 'done', status: 'done' },
  imagePhase: { status: 'complete', verified: true, total: 4, completed: 4,
    autoBookExportedAt: 1, autoInteriorExportedAt: 1, autoCoverExportedAt: 1,
    agentMediaIds: { 'redraw.png': 'old-rejected', 'retrieve.png': 'approved-original', 'keep.png': 'approved-keep' } },
});

test('repair plan rejects another book, unknown names, covers, and recapture without a verified media id', () => {
  const book = makeBook();
  for (const request of [
    { bookId: 'other-book', regenerate: ['redraw.png'] },
    { bookId: book.id, regenerate: ['unknown.png'] },
    { bookId: book.id, regenerate: ['cover-front.png'] },
    { bookId: book.id, regenerate: 'redraw.png' },
    { bookId: book.id },
  ]) assert.throws(() => planFlowImageRepair(book, jobs, request));
  delete book.imagePhase.agentMediaIds['retrieve.png'];
  assert.throws(() => planFlowImageRepair(book, jobs, { bookId: book.id, recapture: ['retrieve.png'] }), /ไม่มีรหัสภาพเดิม/);
});

test('overlapping requests redraw once and leave approved recapture attached to its original media id', () => {
  const plan = planFlowImageRepair(makeBook(), jobs, {
    bookId: 'current-book', regenerate: ['redraw.png', 'redraw.png'], recapture: ['redraw.png', 'retrieve.png'],
  });
  assert.deepEqual(plan, { regenerate: ['redraw.png'], recapture: ['retrieve.png'], all: ['redraw.png', 'retrieve.png'] });
});

const source = await readFile(new URL('../ui/studio.js', import.meta.url), 'utf8');
const start = source.indexOf('    repairImages: async (request');
const action = source.slice(start, source.indexOf('    focus: async', start));

function harness({ busy = false, backupFails = false } = {}) {
  const book = makeBook();
  const calls = [];
  const assets = new Set(jobs.map((j) => j.name));
  const context = vm.createContext({
    book, machineBusy: busy, phase2Running: false, hasPendingTurn: () => false,
    assetNames: [...assets], planFlowImageRepair, plannedImageJobs: () => jobs,
    db: {
      loadBook: async () => book,
      deleteAsset: async (_, name) => { calls.push(`delete:${name}`); assets.delete(name); },
      loadAssets: async () => [...assets].map((name) => ({ name })),
      saveBook: async () => calls.push('save'),
    },
    X: { exportProjectJson: async () => { calls.push('backup'); if (backupFails) throw new Error('backup failed'); } },
    syncSharedProject: async () => calls.push('sync'),
    addEvent() {},
    startPhase2: async () => calls.push('start'),
    fail: (error) => assert.fail(error.message),
  });
  vm.runInContext(`globalThis.actions = { ${action} };`, context);
  return { book, calls, assets, run: () => context.actions.repairImages({ bookId: book.id, regenerate: ['redraw.png'], recapture: ['retrieve.png'] }) };
}

test('repair action backs up first, preserves approved assets and original ids, and restarts only once', async () => {
  const h = harness();
  await h.run();
  assert.deepEqual(h.calls, ['backup', 'delete:redraw.png', 'delete:retrieve.png', 'save', 'sync', 'start']);
  assert.equal(h.assets.has('keep.png'), true);
  assert.equal(h.book.imagePhase.agentMediaIds['redraw.png'], undefined);
  assert.equal(h.book.imagePhase.agentMediaIds['retrieve.png'], 'approved-original');
  assert.equal(h.book.imagePhase.agentRegeneratedMediaIds['retrieve.png'], 'approved-original');
  assert.deepEqual(Array.from(h.book.imagePhase.rejectedImageNames), ['redraw.png']);
  assert.equal(h.book.imagePhase.autoBookExportedAt, undefined);
  assert.equal(h.book.imagePhase.autoInteriorExportedAt, undefined);
  assert.equal(h.book.imagePhase.autoCoverExportedAt, 1);
  assert.equal(h.book.imagePhase.verified, false);
  assert.equal(h.book.job.step, 'gate_images');
  assert.equal(h.book.imagePhase.completed, 2);
});

test('busy job or failed backup never changes assets or starts another image job', async () => {
  const busy = harness({ busy: true });
  await assert.rejects(busy.run(), /มีงานกำลังทำอยู่/);
  assert.deepEqual(busy.calls, []);
  const backup = harness({ backupFails: true });
  await assert.rejects(backup.run(), /backup failed/);
  assert.deepEqual(backup.calls, ['backup']);
  assert.equal(backup.assets.size, 4);
});
