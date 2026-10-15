import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('./flow.js', import.meta.url), 'utf8');
const start = source.indexOf('  async function opGenerate(');
const readExisting = source.slice(start, source.indexOf("    at(`ตั้งค่า", start)) + '\n  }';

function harness({ exists = true, recovered = null } = {}) {
  const finished = [];
  const recoveredNames = [];
  const context = vm.createContext({
    at() {}, openProject: async () => {}, goRoot: async () => {},
    SEL: { tiles: () => [] },
    tileId: () => null,
    revealTile: async () => exists,
    findTile: () => ({ getAttribute: () => 'SHOT-01' }),
    recoverTileByName: async (name) => { recoveredNames.push(name); return recovered; },
    finishTile: async (id) => { finished.push(id); return { mediaId: id }; },
  });
  vm.runInContext(`${readExisting}\nglobalThis.run = opGenerate;`, context);
  return { finished, recoveredNames, run: () => context.run({ onlyExisting: true, mediaId: 'verified-id', name: 'fig-1.png' }) };
}

test('confirmed media id still exists under a shot title: retrieve it without generating or guessing another named image', async () => {
  const h = harness();
  const result = await h.run();
  assert.equal(result.mediaId, 'verified-id');
  assert.deepEqual(h.finished, ['verified-id']);
  assert.deepEqual(h.recoveredNames, []);
});

test('media id disappeared: accept only the unique verified name fallback', async () => {
  const h = harness({ exists: false, recovered: 'recovered-id' });
  const result = await h.run();
  assert.equal(result.mediaId, 'recovered-id');
  assert.deepEqual(h.recoveredNames, ['fig-1.png']);
});

test('neither id nor unique name is found: stop without retrieving another image', async () => {
  const h = harness({ exists: false });
  await assert.rejects(h.run(), { code: 'not_found' });
  assert.deepEqual(h.finished, []);
});
