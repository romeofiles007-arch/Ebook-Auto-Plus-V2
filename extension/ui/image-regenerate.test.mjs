import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('./studio.js', import.meta.url), 'utf8');
const start = source.indexOf('async function regenerateImageAsset(name)');
const method = source.slice(start, source.indexOf('\n/**', start));

test('สร้างภาพประกอบใหม่: ลบรหัส Agent เก่าของภาพนั้นและกันภาพเก่ากลับเข้ามา', async () => {
  const name = 'fig-1.1-1.png';
  const book = {
    id: 'book-1', imageSource: 'flow', figureMode: 'auto', coverMode: 'auto', job: {},
    imagePhase: { agentMediaIds: { [name]: 'old-media-id', 'fig-1.2-1.png': 'keep-media-id' } },
  };
  const deleted = [];
  const calls = [];
  const scope = {
    book,
    db: {
      loadBook: async () => book,
      deleteAsset: async (_, slot) => deleted.push(slot),
      saveBook: async () => calls.push('saved'),
    },
    phase2RequiredNames: () => [name],
    syncSharedProject: async () => {},
    openImagePhaseGate: async () => calls.push('gate'),
    startPhase2: async () => calls.push('started'),
    status: () => assert.fail('ภาพนี้สร้างใหม่ได้'),
  };
  vm.runInNewContext(`${method}\nglobalThis.run = regenerateImageAsset;`, scope);
  await scope.run(name);

  assert.deepEqual(deleted, [name]);
  assert.equal(book.imagePhase.agentMediaIds[name], undefined);
  assert.equal(book.imagePhase.agentMediaIds['fig-1.2-1.png'], 'keep-media-id');
  assert.equal(book.imagePhase.rejectedImageNames.includes(name), true);
  assert.equal(book.imagePhase.regenerateImageName, name);
  assert.deepEqual(calls, ['saved', 'gate', 'started']);
});
