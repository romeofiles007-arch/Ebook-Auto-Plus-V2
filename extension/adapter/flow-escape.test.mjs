/**
 * งานหยุดที่ "ตำแหน่งปุ่มใน Flow เปลี่ยนหรือมีแผงบัง (ชี้แล้วโดน "x1")" ทุกครั้งที่กดทำต่อ
 * ต้นเหตุ: แผงตั้งค่าโมเดลของ Flow (พ.ย. 2026) ปิดด้วย Escape ที่ตัวแผงเท่านั้น ไม่มี backdrop
 * escape() เดิมส่งที่ document อย่างเดียว แผงจึงค้างทับปุ่ม Agent
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const src = await readFile(new URL('./flow.js', import.meta.url), 'utf8');
const start = src.indexOf('  const escape = () => {');
const code = src.slice(start, src.indexOf('\n  };', start) + 5);

test('escape() ปิดแผงตั้งค่าโมเดลที่ฟัง Escape เฉพาะที่ตัวแผง', () => {
  const pane = {
    isConnected: true,
    open: true,
    getBoundingClientRect: () => ({ width: 296 }),
    dispatchEvent(e) {
      if (e.key === 'Escape') this.open = false;
    },
  };
  const document = {
    querySelector: () => null,
    querySelectorAll: (sel) => (sel === '.cdk-overlay-pane' && pane.open ? [pane] : []),
    dispatchEvent: () => {}, // หน้า Flow ไม่ฟังที่ระดับเอกสาร
  };
  const ctx = vm.createContext({
    document,
    KeyboardEvent: class {
      constructor(type, o) {
        Object.assign(this, { type, ...o });
      }
    },
  });
  vm.runInContext(
    `const visible = (el) => !!el && el.isConnected && el.getBoundingClientRect().width > 0;
     const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
     ${code}
     globalThis.escape = escape;`,
    ctx,
  );
  ctx.escape();
  assert.equal(pane.open, false);
});
