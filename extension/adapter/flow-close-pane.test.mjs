/**
 * ลูกค้าค้าง (0.2.5 · เหลือภาพ 3 ใบ): "เตรียม Google Flow ไม่สำเร็จ: เมนูโมเดลของ Flow เปิดอยู่ แต่ไม่พบรุ่นที่เลือกไว้สำหรับปิดเมนู"
 * closePane เห็นรายการที่เปิดค้าง (เมนูของภาพ · ตัวเลือกสื่อ) แล้วนึกว่าเป็นเมนูโมเดล หารุ่นปัจจุบันไม่เจอ → หยุดทั้งงาน
 * รายการที่ไม่ใช่เมนูโมเดลต้องถูกปิดทิ้งด้วย Esc แล้วทำต่อ — หยุดเฉพาะเมื่อปิดไม่ลงจริง ๆ
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('./flow.js', import.meta.url), 'utf8');
const start = source.indexOf('  async function closePane(');
const method = source.slice(start, source.indexOf('  async function openPane(', start));
// ตัวเทียบชื่อรุ่น (ไทย/อังกฤษ) ที่ closePane ใช้ — ดู flow-model-names.test.mjs
const helpers = source.slice(source.indexOf('  const modelKey = '), source.indexOf('\n\n', source.indexOf('const isNanoBanana')));

function harness({ items, model = 'Nano Banana 2 Lite', escapeCloses = true }) {
  const log = [];
  let open = [...items];
  let pane = true;
  const ctx = vm.createContext({
    settingsPane: () => pane,
    readPane: () => ({ model }),
    $$: () => open.map((t) => ({ t })),
    visible: () => true,
    text: (m) => m.t,
    realClick: (m) => { log.push(['click', m.t]); open = []; },
    escape: () => { log.push(['escape']); if (escapeCloses) open = []; pane = false; },
    waitFor: async (read, { timeout } = {}) => { const v = read(); if (!v) throw new Error(`timeout ${timeout}`); return v; },
    SEL: { settingsTrigger: () => ({}) },
    trustedClick: async () => { pane = false; },
  });
  vm.runInContext(`${helpers}\n${method}\nglobalThis.closePane = closePane;`, ctx);
  return { closePane: ctx.closePane, log };
}

test('เมนูโมเดลเปิดอยู่: เลือกรุ่นเดิมซ้ำเพื่อพับเมนู (ไม่เปลี่ยนรุ่น)', async () => {
  const h = harness({ items: ['🍌 Nano Banana Pro', '🍌 Nano Banana 2 Lite', '🍌 Nano Banana 2.1'] });
  await h.closePane();
  assert.deepEqual(h.log[0], ['click', '🍌 Nano Banana 2 Lite']);
});

test('รายการที่ค้างไม่ใช่เมนูโมเดล (เมนูของภาพ) → ปิดด้วย Esc แล้วทำต่อ ไม่หยุดงาน', async () => {
  const h = harness({ items: ['favorite ตั้งเป็นรายการโปรด', 'add_2 เพิ่มไปยังพรอมต์', 'download ดาวน์โหลด'] });
  await h.closePane();
  assert.equal(h.log.some(([k]) => k === 'click'), false, 'ห้ามกดรายการในเมนูของภาพ');
  assert.deepEqual(h.log[0], ['escape']);
});

test('อ่านรุ่นปัจจุบันไม่ได้ → ปิดด้วย Esc ไม่หยุดงาน', async () => {
  const h = harness({ items: ['🍌 Nano Banana Pro'], model: '' });
  await h.closePane();
  assert.deepEqual(h.log[0], ['escape']);
});

test('ปิดด้วย Esc ไม่ลงจริง ๆ → หยุดพร้อมบอกสาเหตุ (ไม่กดมั่ว)', async () => {
  const h = harness({ items: ['download ดาวน์โหลด'], escapeCloses: false });
  await assert.rejects(h.closePane(), /ไม่พบรุ่นที่เลือกไว้สำหรับปิดเมนู/);
  assert.equal(h.log.some(([k]) => k === 'click'), false);
});

test('ชื่อรุ่นในเมนูเป็นภาษาไทย ("นาโน บานานา") — ยังเลือกรุ่นเดิมซ้ำเพื่อพับเมนูได้', async () => {
  const h = harness({ items: ['🍌 นาโน บานานา โปร', '🍌 นาโน บานานา 2 Lite', '🍌 นาโน บานานา 2.1'], model: 'นาโน บานานา 2 Lite' });
  await h.closePane();
  assert.deepEqual(h.log[0], ['click', '🍌 นาโน บานานา 2 Lite']);
});
