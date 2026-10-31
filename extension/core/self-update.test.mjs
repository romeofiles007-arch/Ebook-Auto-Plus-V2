/**
 * ผู้ใช้: "ทำเป็นแบบกด update หน้า extension ให้ด้วย" — ลูกค้าไม่ต้องดาวน์โหลด ZIP แล้วแตกไฟล์ทับเอง
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { gitBlobSha, extensionEntries, applyUpdate, resolveExtensionDir, rawUrl } from './self-update.js';

const enc = (s) => new TextEncoder().encode(s);

test('gitBlobSha ตรงกับ git hash-object', async () => {
  assert.equal(await gitBlobSha(enc('')), 'e69de29bb2d1d6434b8b29ae775ad8c2e48c5391');
  assert.equal(await gitBlobSha(enc('hello\n')), 'ce013625030ba8dba906f756967f9e9ca394464a');
});

test('เอาเฉพาะไฟล์ในโฟลเดอร์ extension และไม่แตะเล่มของผู้ใช้', () => {
  const list = extensionEntries({
    tree: [
      { path: 'README.md', type: 'blob', sha: 'a', size: 1 },
      { path: 'extension', type: 'tree', sha: 'b' },
      { path: 'extension/manifest.json', type: 'blob', sha: 'c', size: 2 },
      { path: 'extension/ui/panel.js', type: 'blob', sha: 'd', size: 3 },
      { path: 'extension/Ebook Projects/x.json', type: 'blob', sha: 'e', size: 4 },
    ],
  });
  assert.deepEqual(list.map((e) => e.path), ['manifest.json', 'ui/panel.js']);
});

test('ที่อยู่ไฟล์ดิบเข้ารหัสทีละช่วง', () => {
  assert.match(rawUrl('extension/ui/a b.js'), /\/master\/extension\/ui\/a%20b\.js$/);
});

// ---------- โฟลเดอร์ปลอมแบบ File System Access ----------
function fakeDir(files = {}, name = 'extension') {
  const writes = [];
  const make = (prefix, dirName) => ({
    kind: 'directory',
    name: dirName,
    async getDirectoryHandle(n, { create = false } = {}) {
      const p = `${prefix}${n}/`;
      if (!create && !Object.keys(files).some((k) => k.startsWith(p))) throw Object.assign(new Error('nf'), { name: 'NotFoundError' });
      return make(p, n);
    },
    async getFileHandle(n, { create = false } = {}) {
      const p = `${prefix}${n}`;
      if (!(p in files) && !create) throw Object.assign(new Error('nf'), { name: 'NotFoundError' });
      return {
        kind: 'file',
        async getFile() {
          const b = files[p] ?? new Uint8Array();
          return { size: b.length, arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.length) };
        },
        async createWritable() {
          return { write: async (d) => { files[p] = new Uint8Array(d); writes.push(p); }, close: async () => {} };
        },
      };
    },
    async *keys() {
      const seen = new Set();
      for (const k of Object.keys(files)) if (k.startsWith(prefix)) seen.add(k.slice(prefix.length).split('/')[0]);
      yield* seen;
    },
  });
  return { root: make('', name), files, writes };
}

async function remote(files) {
  const tree = [];
  for (const [p, s] of Object.entries(files)) tree.push({ path: `extension/${p}`, type: 'blob', sha: await gitBlobSha(enc(s)), size: enc(s).length });
  const fetcher = async (url) => {
    if (url.includes('api.github.com')) return { ok: true, json: async () => ({ tree, truncated: false }) };
    const path = decodeURIComponent(url.split('/master/extension/')[1].split('?')[0]);
    const body = enc(files[path] ?? '');
    return { ok: true, arrayBuffer: async () => body.buffer };
  };
  return fetcher;
}

const manifest = (v) => JSON.stringify({ name: 'Ebook Plus', version: v });

test('อัปเดตเฉพาะไฟล์ที่เปลี่ยน · manifest.json เขียนเป็นไฟล์สุดท้าย · ไฟล์ของผู้ใช้ไม่ถูกแตะ', async () => {
  const d = fakeDir({
    'manifest.json': enc(manifest('0.2.4')),
    'ui/a.js': enc('same'),
    'ui/b.js': enc('old'),
    'Ebook Projects/book.json': enc('mine'),
  });
  const fetcher = await remote({ 'manifest.json': manifest('0.2.5'), 'ui/a.js': 'same', 'ui/b.js': 'new', 'ui/c.js': 'added' });
  const r = await applyUpdate({ dir: d.root, fetcher });
  assert.deepEqual(d.writes, ['ui/b.js', 'ui/c.js', 'manifest.json']);
  assert.equal(r.changed, 3);
  assert.equal(new TextDecoder().decode(d.files['ui/b.js']), 'new');
  assert.equal(new TextDecoder().decode(d.files['Ebook Projects/book.json']), 'mine');
});

test('ไฟล์ที่ดาวน์โหลดมาไม่ตรงลายนิ้วมือ = หยุด ไม่เขียนทับ', async () => {
  const d = fakeDir({ 'manifest.json': enc(manifest('0.2.4')), 'ui/b.js': enc('old') });
  const good = await remote({ 'manifest.json': manifest('0.2.5'), 'ui/b.js': 'new' });
  const broken = async (url) => (url.includes('api.github.com') ? good(url) : { ok: true, arrayBuffer: async () => enc('corrupt').buffer });
  await assert.rejects(applyUpdate({ dir: d.root, fetcher: broken }), /ไม่ตรง/);
  assert.deepEqual(d.writes, []);
});

test('เลือกโฟลเดอร์ผิด = ปฏิเสธ · เลือกโฟลเดอร์แม่ที่มี extension อยู่ข้างใน = ใช้โฟลเดอร์ข้างใน', async () => {
  const wrong = fakeDir({ 'manifest.json': enc(JSON.stringify({ name: 'Other' })) });
  await assert.rejects(resolveExtensionDir(wrong.root, 'Ebook Plus'), /ไม่ใช่โฟลเดอร์ของ Ebook Plus/);
  const parent = fakeDir({ 'extension/manifest.json': enc(manifest('0.2.4')) }, 'Ebook-Auto-Plus-V2-master');
  const inner = await resolveExtensionDir(parent.root, 'Ebook Plus');
  assert.equal(inner.name, 'extension');
});

test('โฟลเดอร์ซอร์สโค้ดที่มี .git = ปฏิเสธ (ไม่เขียนทับงานที่ยังไม่ commit)', async () => {
  const repo = fakeDir({ '.git/HEAD': enc('ref'), 'extension/manifest.json': enc(manifest('0.2.4')) }, 'repo');
  await assert.rejects(resolveExtensionDir(repo.root, 'Ebook Plus'), /git/);
});
