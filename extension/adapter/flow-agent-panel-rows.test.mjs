/**
 * แผง "การตั้งค่า Agent" รุ่น พ.ย. 2026 — ตรวจสดกับหน้าจริง 22 พ.ย. 2026
 *   ปุ่มเปิด: flow-prompt-box button.agent-action-button aria-label="การตั้งค่า Agent"
 *   หน้าหลัก: button[role=radio] "ทุกครั้ง"/"ไม่เลย" · button.image-defaults-row (สรุป "🍌 รุ่น, 4:3, 1 เอาต์พุต") · ไม่มีปุ่มบันทึก
 *   หน้าย่อย: label.radio-option (รุ่น · ตัวที่เลือกมี radio-option-selected) · button[role=radio] สัดส่วน/จำนวน · ← "กลับ"
 * ค่าตั้งต้นของ project ใหม่คือ Nano Banana 2.1 · 16:9 · x2 · ทุกครั้ง
 * เดิมหาปุ่ม Settings ไม่เจอ → "Flow Agent ชุด 1 (4:3) · 8 รูป ไม่สำเร็จ: รอ ปุ่ม Settings ข้าง Agent ไม่เจอ"
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const src = await readFile(new URL('./flow.js', import.meta.url), 'utf8');
const between = (from, to) => {
  const a = src.indexOf(from);
  assert.ok(a >= 0, `หา ${from} ไม่เจอ`);
  return src.slice(a, src.indexOf(to, a));
};

/** Flow จำลองที่ทำตัวเหมือนหน้าจริง: กดแล้วค่าเปลี่ยน · ← ออกทีละชั้น */
function fakeFlow(initial = {}) {
  const s = { confirm: 'ทุกครั้ง', model: 'Nano Banana 2.1', ratio: '16:9', count: 'x2', page: 'main', ...initial };
  const node = (props) => ({ isConnected: true, shown: true, getAttribute: (k) => props.attrs?.[k] ?? null, ...props });
  const radio = (label, group) =>
    node({
      innerText: `${group === 'confirm' ? '' : 'crop '}${label}`,
      attrs: { role: 'radio', get 'aria-checked'() { return String(s[group] === label); } },
      click: () => { s[group] = label; },
    });
  const panel = node({ innerText: '' });
  Object.defineProperty(panel, 'innerText', {
    get: () => (s.page === 'main' ? 'arrow_back การตั้งค่า Agent ยืนยันก่อนสร้าง' : s.page === 'sub' ? 'arrow_back ค่าเริ่มต้นของรูปภาพ โมเดล' : ''),
  });
  panel.querySelectorAll = (sel) => {
    if (s.page === 'closed') return [];
    if (sel === 'button[role="radio"]')
      return s.page === 'main'
        ? ['ทุกครั้ง', 'ไม่เลย'].map((l) => radio(l, 'confirm'))
        : [...['16:9', '4:3', '1:1', '3:4', '9:16'].map((l) => radio(l, 'ratio')), ...['x1', 'x2', 'x3', 'x4'].map((l) => radio(l, 'count'))];
    if (sel === 'button.image-defaults-row')
      return s.page === 'main' ? [node({ innerText: `🍌 ${s.model}, ${s.ratio}`, click: () => { s.page = 'sub'; } })] : [];
    if (sel === 'label.radio-option')
      return s.page === 'sub'
        ? ['Nano Banana Pro', 'Nano Banana 2 Lite', 'Nano Banana 2.1'].map((m) =>
            node({ innerText: `radio_button_${s.model === m ? 'checked' : 'unchecked'} 🍌 ${m}`, click: () => { s.model = m; } }))
        : [];
    if (sel === 'label.radio-option-selected')
      return s.page === 'sub' ? [node({ innerText: `radio_button_checked 🍌 ${s.model}` })] : [];
    if (sel === 'button')
      return [node({ attrs: { 'aria-label': 'กลับ' }, click: () => { s.page = s.page === 'sub' ? 'main' : 'closed'; } })];
    return [];
  };
  Object.defineProperty(panel, 'shown', { get: () => s.page !== 'closed' });
  return { s, panel };
}

function run(flow, model = 'Nano Banana 2 Lite', ratio = '4:3') {
  const scope = {
    document: { querySelectorAll: () => [] },
    text: (el) => (el?.innerText ?? '').replace(/\s+/g, ' ').trim(),
    visible: (el) => !!el?.shown,
    $$: (sel, root) => [...(root?.querySelectorAll?.(sel) ?? [])],
    realClick: (el) => el.click(),
    sleep: async () => {},
    escape: () => {},
    waitFor: async (fn) => {
      const v = fn();
      if (!v) throw new Error('timeout');
      return v;
    },
    agentPanel: () => flow.panel,
  };
  vm.createContext(scope);
  vm.runInContext(
    `${between('  const modelKey = (s) => {', '  const isNanoBanana')}
${between('  const AL = {', '  const agentPanel = ')}
${between('  async function configureAgentRows(', '  async function configureAgent(model, ratio)')}
globalThis.go = (m, r) => configureAgentRows(m, r, () => {
  const p = agentPanel();
  return visible(p) && /Agent settings|การตั้งค่า Agent/i.test(text(p).slice(0, 120)) ? p : null;
});`,
    scope,
  );
  return scope.go(model, ratio);
}

test('จากค่าตั้งต้นของ project ใหม่ (2.1 · 16:9 · x2 · ทุกครั้ง) ตั้งเป็น 2 Lite · 4:3 · x1 · ไม่เลย แล้วปิดแผง', async () => {
  const flow = fakeFlow();
  await run(flow);
  assert.deepEqual(
    { confirm: flow.s.confirm, model: flow.s.model, ratio: flow.s.ratio, count: flow.s.count, page: flow.s.page },
    { confirm: 'ไม่เลย', model: 'Nano Banana 2 Lite', ratio: '4:3', count: 'x1', page: 'closed' },
  );
});

test('ค่าถูกอยู่แล้ว ไม่กดเปลี่ยนอะไร แค่ปิดแผง', async () => {
  const flow = fakeFlow({ confirm: 'ไม่เลย', model: 'Nano Banana 2 Lite', ratio: '3:4', count: 'x1' });
  await run(flow, 'Nano Banana 2 Lite', '3:4');
  assert.equal(flow.s.model, 'Nano Banana 2 Lite');
  assert.equal(flow.s.ratio, '3:4');
  assert.equal(flow.s.page, 'closed');
});

test('ไม่มีรุ่นที่ขอในรายการ = หยุดพร้อมบอกชื่อรุ่น ไม่ปล่อยให้ Agent วาดด้วยรุ่นที่เสียเครดิต', async () => {
  await assert.rejects(run(fakeFlow(), 'Imagen 9'), /ไม่พบโมเดล Imagen 9/);
});

test('ปุ่มเปิดแผงรู้จัก agent-action-button และ configureAgent แยกไปใช้แผงรุ่นใหม่เมื่อเห็นแถวค่าเริ่มต้น', () => {
  const trigger = between('  const agentSettingsTrigger = () => {', '  const AGENT_GAP_MS');
  assert.match(trigger, /button\.agent-action-button/);
  const cfg = between('  async function configureAgent(model, ratio) {', '    const read = () => {');
  assert.match(cfg, /button\.image-defaults-row[\s\S]*return configureAgentRows\(model, ratio, openPanel\)/);
});
