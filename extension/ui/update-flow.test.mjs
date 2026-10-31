/**
 * ผู้ใช้: "ทำ update ให้เหมือน E:\Youtube Free animation Auto Claude สิ" (แนบภาพ "ยกเลิกการอัปเดต")
 * กล่อง confirm() ของเบราว์เซอร์ไม่ขึ้นในแผงข้าง และคืนค่า "ไม่" ทันที → ทุกครั้งที่กดคือ "ยกเลิก"
 * แบบโปรเจกต์ Youtube: กดปุ่มเดียวแล้วอัปเดตเลย · ตรวจเองทุก 30 นาที · บอกว่ามีอะไรใหม่ · ปิดปุ่มระหว่างทำงาน
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { recentChanges } from '../core/update-check.js';

const read = (p) => readFile(new URL(p, import.meta.url), 'utf8');

test('กดอัปเดตแล้วไม่มีกล่องยืนยัน — ปุ่มคือการยืนยัน', async () => {
  const ui = await read('./self-update-ui.js');
  assert.doesNotMatch(ui, /confirm\(/);
});

test('แผงข้างส่งไปอัปเดตที่ Studio (หน้าต่างเลือกโฟลเดอร์ใช้ได้แน่นอน) ผ่านคำสั่ง showUpdate', async () => {
  const panel = await read('./panel.js');
  assert.match(panel, /command: 'showUpdate'/);
  assert.doesNotMatch(panel, /runSelfUpdate/);
  const sw = await read('../sw.js');
  assert.match(sw, /msg\.command === 'showUpdate'/);
  const studio = await read('./studio.js');
  assert.match(studio, /m\.command === 'showUpdate'/);
});

test('Studio ตรวจอัปเดตเองทุก 30 นาที และปิดปุ่มระหว่างทำเล่ม', async () => {
  const studio = await read('./studio.js');
  assert.match(studio, /UPDATE_CHECK_EVERY_MS = 30 \* 60 \* 1000/);
  assert.match(studio, /setInterval\(\(\) => runUpdateCheck\(\)/);
  assert.match(studio, /\$\('updateNow'\)\.disabled = machineBusy/);
});

test('มีอะไรใหม่: อ่านหัวข้อ commit ล่าสุดของโฟลเดอร์ extension · ต่อ GitHub ไม่ได้ = รายการว่าง ไม่พัง', async () => {
  const ok = async () => ({
    ok: true,
    json: async () => [
      { commit: { message: '0.2.6 — Flow: เมนูที่ค้าง\n\nรายละเอียด', committer: { date: '2026-10-31T13:00:00Z' } } },
      { commit: { message: 'ปุ่มอัปเดตเลย', committer: { date: '2026-10-31T12:00:00Z' } } },
    ],
  });
  assert.deepEqual(await recentChanges(ok), [
    { subject: '0.2.6 — Flow: เมนูที่ค้าง', date: '2026-10-31T13:00:00Z' },
    { subject: 'ปุ่มอัปเดตเลย', date: '2026-10-31T12:00:00Z' },
  ]);
  assert.deepEqual(await recentChanges(async () => { throw new Error('offline'); }), []);
});
