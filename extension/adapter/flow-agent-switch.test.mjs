/**
 * Flow (พ.ย. 2026) เปลี่ยนปุ่ม Agent จาก chip เป็นสวิตช์ — ตรวจสดกับหน้าจริง 22 พ.ย. 2026:
 *   button.switch[aria-label="Agent จาก Flow"] (ไอคอน spark / spark_off) อยู่ใน flow-prompt-box
 *   Agent เปิด: ช่องพิมพ์มี "การตั้งค่า Agent" (button.agent-action-button) · ปุ่มรุ่นภาพซ่อน
 *   Agent ปิด : ปุ่มรุ่นภาพ (button.settings-trigger-button "🍌 Nano Banana 2 Lite crop_9_16 x1") โผล่
 *   ปุ่มในช่องพิมพ์สลับภายใน 200ms แต่ aria-pressed ของสวิตช์ตามหลังเกิน 4 วินาที
 * เดิมหาเฉพาะ button.agent-mode-chip → ปิด Agent ไม่ได้ → "ไม่พบปุ่มตั้งค่าโมเดล" ทุกรอบ
 * แล้ว Phase 2 วนเปิด project ใหม่ไม่รู้จบ ไม่ได้ภาพสักใบ (เล่ม "90 วันเดิมพันรัก")
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const src = await readFile(new URL('./flow.js', import.meta.url), 'utf8');

const between = (from, to, start = 0) => {
  const a = src.indexOf(from, start);
  assert.ok(a >= 0, `หา ${from} ไม่เจอ`);
  return src.slice(a, src.indexOf(to, a));
};

const agentChipSrc = between('    agentChip: () =>', '    settingsTrigger: () =>');
const agentLogicSrc = between('  const scopedAgentSettings = ', '  const inProject = ');

function el({ cls = [], label = '', shown = true, pressed = null, box = null }) {
  const node = {
    cls,
    shown,
    box,
    parentElement: null,
    getAttribute: (k) => (k === 'aria-label' ? label : k === 'aria-pressed' ? pressed : null),
    matches: (sel) => sel === 'button.switch' && cls.includes('switch'),
    closest: (sel) => (/flow-prompt-box/.test(sel) ? node.box : null),
  };
  return node;
}

/** หน้า Flow จำลอง: ช่องพิมพ์หนึ่งกล่อง มีสวิตช์ Agent ปุ่มตั้งค่า Agent และปุ่มรุ่นภาพ */
function page({ oldChip = null, switchBtn = null, agentAction = false, trigger = false } = {}) {
  const box = { agentAction: el({ shown: agentAction }), trigger: el({ shown: trigger }) };
  if (switchBtn) switchBtn.box = box;
  const $$ = (sel, root) => {
    if (sel === 'button.agent-mode-chip') return oldChip ? [oldChip] : [];
    if (sel.startsWith('flow-prompt-box button.switch')) return switchBtn ? [switchBtn] : [];
    if (sel === 'button.agent-action-button' && root === box) return [box.agentAction];
    if (sel === 'button.settings-trigger-button' && root === box) return [box.trigger];
    return [];
  };
  const scope = { $$, visible: (e) => !!e?.shown, text: () => '', document: { body: {} } };
  vm.createContext(scope);
  vm.runInContext(`const SEL = {\n${agentChipSrc}\n    editor: () => null,\n  };\n${agentLogicSrc}\nglobalThis.chip = SEL.agentChip; globalThis.on = agentOn;`, scope);
  return scope;
}

const agentSwitch = (pressed, label = 'Agent จาก Flow') => el({ cls: ['switch'], label, pressed });

test('หาสวิตช์ Agent รุ่นใหม่เจอ เมื่อไม่มี chip แบบเดิมแล้ว', () => {
  const s = agentSwitch('true');
  assert.equal(page({ switchBtn: s, agentAction: true }).chip(), s);
});

test('สวิตช์อื่นในช่องพิมพ์ที่ไม่ใช่ Agent ไม่ถูกหยิบ', () => {
  assert.equal(page({ switchBtn: agentSwitch('true', 'โหมดมืด') }).chip(), undefined);
});

test('ปิด Agent แล้ว แม้ aria-pressed ยังค้างเป็น true — ต้องตอบว่าปิด (ไม่งั้น agentOff กดซ้ำจนเปิดกลับ)', () => {
  assert.equal(page({ switchBtn: agentSwitch('true'), agentAction: false, trigger: true }).on(), false);
});

test('เปิด Agent แล้ว แม้ aria-pressed ยังค้างเป็น false — ต้องตอบว่าเปิด', () => {
  assert.equal(page({ switchBtn: agentSwitch('false'), agentAction: true, trigger: false }).on(), true);
});

test('ปุ่มในช่องพิมพ์ยังไม่บอกอะไร ใช้ aria-pressed ของสวิตช์', () => {
  assert.equal(page({ switchBtn: agentSwitch('true') }).on(), true);
  assert.equal(page({ switchBtn: agentSwitch('false') }).on(), false);
});

test('chip แบบเดิมยังใช้ได้เหมือนเดิม (บัญชีที่ Flow ยังไม่เปลี่ยนหน้า)', () => {
  const chip = el({ cls: ['agent-mode-chip'], label: 'Agent', pressed: 'true' });
  const p = page({ oldChip: chip });
  assert.equal(p.chip(), chip);
  assert.equal(p.on(), true);
});

test('ไม่มีปุ่ม Agent เลย = ไม่ได้เปิด Agent', () => {
  assert.equal(page({}).on(), false);
});
