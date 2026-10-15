import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('./flow.js', import.meta.url), 'utf8');
const start = source.indexOf('  async function finishTile(');
const method = source.slice(start, source.indexOf('\n  const OPS =', start));
const bitmap = (id, width, height, bit = 0) => ({ id, width, height, size: width * height, hash: Array(64).fill(bit) });

function harness({ hires, original } = {}) {
  const thumb = bitmap('thumbnail', 512, 384);
  const calls = [];
  const context = vm.createContext({
    renameTile: async () => true,
    at() {},
    download2k: async (id, size) => {
      calls.push({ id, size });
      const result = size === '2K' ? hires : original;
      if (!result || result instanceof Error) throw result || new Error('file unavailable');
      return result;
    },
    fetchTileImage: async () => thumb,
    imageSize: async (blob) => ({ width: blob.width, height: blob.height }),
    aHash: async (blob) => blob.hash,
    hamming: (a, b) => a.reduce((n, bit, i) => n + Number(bit !== b[i]), 0),
    blobToDataUrl: async (blob) => `data:image/png;base64,${blob.id}`,
    location: { href: 'https://flow.google.com/project/test' },
  });
  vm.runInContext(`${method}\nglobalThis.finish = finishTile;`, context);
  return { calls, finish: (args = {}) => context.finish('verified-media-id', { name: 'fig-1.png', ...args }) };
}

test('correct 2K: retain it without downloading another source', async () => {
  const h = harness({ hires: bitmap('hires', 2048, 1536) });
  const result = await h.finish();
  assert.equal(result.via, '2k');
  assert.equal(result.width, 2048);
  assert.deepEqual(h.calls, [{ id: 'verified-media-id', size: '2K' }]);
});

test('wrong 2K: download and verify native 1K rather than silently using a 512px thumbnail', async () => {
  const h = harness({ hires: bitmap('wrong-image', 2048, 1536, 1), original: bitmap('original', 1024, 768) });
  const result = await h.finish();
  assert.equal(result.via, '1k');
  assert.equal(result.width, 1024);
  assert.match(result.hiresError, /ไม่ใช่ภาพเดียวกับ tile/);
  assert.deepEqual(h.calls, [{ id: 'verified-media-id', size: '2K' }, { id: 'verified-media-id', size: '1K' }]);
});

test('native file belongs to another image: keep the confirmed thumbnail with an honest source label', async () => {
  const h = harness({ hires: new Error('upscale failed'), original: bitmap('wrong-original', 1024, 768, 1) });
  const result = await h.finish();
  assert.equal(result.via, 'thumbnail');
  assert.equal(result.width, 512);
  assert.match(result.originalError, /ไม่ตรงกับภาพบน tile/);
  assert.match(result.dataUrl, /thumbnail$/);
});

test('native download unavailable: preserve the image instead of failing the book or generating again', async () => {
  const h = harness({ hires: new Error('upscale failed'), original: new Error('1K unavailable') });
  const result = await h.finish();
  assert.equal(result.via, 'thumbnail');
  assert.equal(result.originalError, '1K unavailable');
  assert.equal(h.calls.every((call) => call.id === 'verified-media-id'), true);
});

test('skip upscale: still obtain the native image directly from the same tile', async () => {
  const h = harness({ original: bitmap('original', 1024, 768) });
  const result = await h.finish({ hires: false });
  assert.equal(result.via, '1k');
  assert.deepEqual(h.calls, [{ id: 'verified-media-id', size: '1K' }]);
});
