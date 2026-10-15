/**
 * ผู้ใช้: "ช่วงสร้างภาพจาก google flow มันติดขัด มันช้ามาก อาการเหมือนมันกดปุ่มไม่ถูก และบางครั้งก็ดึงภาพพลาด"
 * หน้า Flow ที่ถูกซูม (ภาพหน้าจอของผู้ใช้เล็กกว่า 100%) ทำให้พิกัดคลิกของตัวดีบักคลาดจากปุ่มจริง
 * ทดสอบตัวเล็ง: ชี้ก่อน ดูว่าตกตรงไหน ปรับอัตราส่วน แล้วจึงกด · ชี้ไม่โดนปุ่ม = ไม่กด
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const src = await readFile(new URL('./flow.js', import.meta.url), 'utf8');
const start = src.indexOf('  let lastMove = null;');
const code = src.slice(start, src.indexOf('  async function trustedClick(target) {', start));

/** zoom: ซูมของแท็บ (CSS px = พิกัดดีบัก / zoom) · layout: ฟังก์ชันพิกัด CSS → element ที่อยู่ตรงนั้น */
function page({ zoom = 1, dy = 0, layout, moves = true, land }) {
  let onMove = null;
  const sent = [];
  const scope = {
    document: { addEventListener: (type, fn) => { if (type === 'mousemove') onMove = fn; } },
    performance, sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    text: (el) => el?.label || '',
    chrome: { runtime: { sendMessage: async (msg) => {
      sent.push(msg);
      const [cx, cy] = land ? land(msg.x, msg.y) : [msg.x / zoom, msg.y / zoom + dy];
      if (moves) onMove({ isTrusted: true, clientX: cx, clientY: cy, target: layout(cx, cy) });
      return { ok: true };
    } } },
  };
  vm.runInNewContext(`${code}\nglobalThis.aim = aimTrusted;`, scope);
  return { aim: scope.aim, sent };
}
const button = { nodeType: 1, label: 'เริ่มสร้าง', contains: (n) => n === button };
const other = { nodeType: 1, label: 'more_vert', contains: () => false, tagName: 'BUTTON', closest: () => other };
// ปุ่มสร้างอยู่ที่ x 900–940 · y 600–640 (CSS px) นอกนั้นเป็นปุ่มอื่น
const layout = (x, y) => (x >= 900 && x <= 940 && y >= 600 && y <= 640 ? button : other);

test('หน้าไม่ซูม: ชี้ครั้งเดียวโดน กดที่พิกัดเดิม', async () => {
  const { aim, sent } = page({ layout });
  assert.deepEqual({ ...(await aim(button, 920, 620)) }, { x: 920, y: 620 });
  assert.equal(sent.length, 1);
});

test('หน้าซูม 80%: วัดสองจุดแล้วได้สัดส่วนจากของจริง → กดตรงปุ่ม และจำไว้ใช้ครั้งต่อไป', async () => {
  const { aim, sent } = page({ zoom: 0.8, layout });
  const first = await aim(button, 920, 620);
  assert.ok(Math.abs(first.x - 736) < 1 && Math.abs(first.y - 496) < 1, JSON.stringify(first));
  assert.equal(sent.length, 3);
  const again = await aim(button, 920, 620);
  assert.ok(Math.abs(again.x - 736) < 1);
  assert.equal(sent.length, 4); // คลิกถัดไปชี้ครั้งเดียว ไม่ต้องวัดใหม่
});

test('พิกัดเลื่อนทั้งหน้าแบบคงที่ (ซูม 100% แล้วยังคลาด) → หาระยะเลื่อนแล้วกดตรงปุ่ม', async () => {
  // เจอจริง: ซูม 100% แล้วยังชี้โดน "favorite"
  const { aim } = page({ dy: 45, layout });
  const r = await aim(button, 920, 620);
  assert.ok(Math.abs(r.x - 920) < 1 && Math.abs(r.y - 575) < 1, JSON.stringify(r));
});

test('เมาส์ตกตรงจุดที่ตั้งใจแต่มีของโผล่บัง (ภาพตัวอย่างตอนเมาส์ผ่าน) → กดตามเดิม ไม่หยุดงาน', async () => {
  // เจอจริง: Flow Agent ชุด 2 หยุดด้วย "ชี้โดน img"
  const { aim, sent } = page({ layout: () => other });
  assert.deepEqual({ ...(await aim(button, 920, 620)) }, { x: 920, y: 620 });
  assert.equal(sent.length, 1);
});

test('วัดแล้วยังไม่ลงตัว (ค่าที่วัดได้ไม่น่าเชื่อ) → กดที่พิกัดเดิมแบบก่อนมีตัวเล็ง ไม่หยุดงาน', async () => {
  // เจอจริง: ซูม 100% แต่วัดได้ "ตั้งใจ (1333,880) ตกที่ (1267,732)" แล้วงานหยุดที่ภาพ 4/17
  const { aim } = page({ layout: () => other, land: () => [10, 10] });
  assert.deepEqual({ ...(await aim(button, 920, 620)) }, { x: 920, y: 620 });
  // ความสัมพันธ์ที่วัดผิดต้องไม่ติดไปกับคลิกถัดไป
  const again = page({ layout });
  assert.deepEqual({ ...(await again.aim(button, 920, 620)) }, { x: 920, y: 620 });
});

test('แท็บไม่ส่ง mousemove ให้ตรวจ → คลิกแบบเดิม ไม่หยุดงาน', async () => {
  const { aim } = page({ layout, moves: false });
  assert.deepEqual({ ...(await aim(button, 920, 620)) }, { x: 920, y: 620 });
});

test('ตัวคลิกจริงเล็งก่อนทุกครั้ง และ service worker รู้จักการชี้โดยไม่กด', async () => {
  assert.match(src, /const aim = await aimTrusted\(el, x, y\);[\s\S]{0,400}type: 'sw\.trustedClick', x: aim\.x, y: aim\.y/);
  const sw = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
  assert.match(sw, /if \(msg\.moveOnly\) return sendResponse\(\{ ok: true \}\);/);
});
