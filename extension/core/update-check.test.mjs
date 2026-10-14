import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { compareVersions, checkForUpdate, REMOTE_MANIFEST } from './update-check.js';

test('เทียบเลขเวอร์ชันเป็นตัวเลข ไม่ใช่ตัวอักษร', () => {
  assert.equal(compareVersions('0.2.10', '0.2.9'), 1);
  assert.equal(compareVersions('0.2.1', '0.2.1'), 0);
  assert.equal(compareVersions('0.2', '0.2.0'), 0);
  assert.equal(compareVersions('0.2.0', '0.2.1'), -1);
  assert.equal(compareVersions('1.0', '0.9.9.9'), 1);
});

const reply = (body, ok = true, status = 200) => async (url) => {
  assert.ok(url.startsWith(REMOTE_MANIFEST));
  return { ok, status, json: async () => body };
};

test('บอกได้ว่ามีของใหม่หรือไม่ และบอกเหตุผลเป็นภาษาคนเมื่อตรวจไม่ได้', async () => {
  assert.deepEqual(await checkForUpdate('0.2.1', reply({ version: '0.2.2', version_name: '0.2.2 Ebook Plus' })),
    { current: '0.2.1', latest: '0.2.2', newer: true, latestName: '0.2.2 Ebook Plus' });
  assert.equal((await checkForUpdate('0.2.1', reply({ version: '0.2.1' }))).newer, false);
  assert.equal((await checkForUpdate('0.2.2', reply({ version: '0.2.1' }))).newer, false); // เครื่องนี้ใหม่กว่า (กำลังพัฒนา)
  await assert.rejects(checkForUpdate('0.2.1', reply({}, false, 404)), /ตรวจเวอร์ชันไม่ได้ \(GitHub ตอบ HTTP 404\)/);
  await assert.rejects(checkForUpdate('0.2.1', reply({ version: 'beta' })), /อ่านไม่ออก/);
  await assert.rejects(checkForUpdate('0.2.1', async () => { throw Object.assign(new Error('x'), { name: 'AbortError' }); }), /ไม่ตอบภายใน 10 วินาที/);
});

test('ไฟล์ที่ตรวจบน GitHub คือ manifest ของส่วนขยายนี้จริง', async () => {
  const local = JSON.parse(await readFile(new URL('../manifest.json', import.meta.url), 'utf8'));
  assert.match(REMOTE_MANIFEST, /\/master\/extension\/manifest\.json$/);
  assert.match(local.version, /^\d+(\.\d+){1,3}$/);
});
