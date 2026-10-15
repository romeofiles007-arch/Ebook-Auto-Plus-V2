/**
 * เล่ม "การเลี้ยงปลาสวยงาม": 35 จาก 37 รูปได้แค่ภาพย่อ เพราะไฟล์ 2K ที่ดักได้ "ไม่ใช่ภาพเดียวกับ tile นี้" ทุกรูป
 * ไฟล์ 2K ของรูปก่อนหน้ามาถึงช้า แล้วถูกจับเป็นของรูปถัดไป — ยอมแพ้ทันทีทำให้ไฟล์ของรูปนี้ไปตกที่รูปถัดไปอีก เลื่อนกันทั้งเล่ม
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('./flow.js', import.meta.url), 'utf8');
const start = source.indexOf('  /** ง้างตัวดักไฟล์ดาวน์โหลดหนึ่งไฟล์');
const code = source.slice(start, source.indexOf('  async function fetchTileImage(id) {', start));

function harness(arrivals) {
  const listeners = new Set();
  const armed = [];
  const window = {
    addEventListener: (type, fn) => listeners.add(fn),
    removeEventListener: (type, fn) => listeners.delete(fn),
    postMessage: (d) => {
      if (d?.source !== 'ebookplus-iso' || d.type !== 'arm') return;
      armed.push(d.token);
      const blob = arrivals.shift();
      if (blob) setTimeout(() => { for (const fn of [...listeners]) fn({ source: window, data: { source: 'ebookplus-main', type: 'captured', token: d.token, blob } }); }, 5);
    },
  };
  const ctx = vm.createContext({
    window, setTimeout, clearTimeout,
    openTileMenu: async () => {}, menuItem: () => ({}), realClick: () => {}, escape: () => {},
    waitFor: async (fn) => fn(), $$: () => [{}], visible: () => true, text: () => '2K',
  });
  vm.runInContext(`${code}\nglobalThis.dl = download2k;`, ctx);
  return { dl: ctx.dl, armed };
}
const verify = async (blob) => (blob === 'mine' ? '' : `ไฟล์ที่ได้ไม่ใช่ภาพเดียวกับ tile นี้ (${blob})`);

test('ไฟล์ของรูปก่อนหน้ามาก่อน → ทิ้ง แล้วรับไฟล์ของรูปนี้ที่ตามมา', async () => {
  const h = harness(['previous', 'mine']);
  assert.equal(await h.dl('id-1', '2K', verify), 'mine');
  assert.equal(h.armed.length, 2);
});

test('ไม่มีไฟล์ที่ตรงมาเลย → บอกเหตุผลว่าไม่ตรง ไม่ใช่ "หมดเวลา" เฉย ๆ', async () => {
  const h = harness(['a', 'b', 'c', 'd']);
  await assert.rejects(h.dl('id-1', '2K', verify), /ไม่ใช่ภาพเดียวกับ tile นี้ \(d\)/);
});

test('ไม่ส่งตัวตรวจ → รับไฟล์แรกตามเดิม', async () => {
  const h = harness(['any']);
  assert.equal(await h.dl('id-1', '2K'), 'any');
});
