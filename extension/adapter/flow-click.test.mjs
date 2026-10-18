import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('./flow.js', import.meta.url), 'utf8');
const clicks = source.slice(source.indexOf('  function realClick('), source.indexOf('  const escape ='));

test('both normal generation and Agent sending resolve the current button during layout changes', () => {
  for (const start of ['  async function sendAgentPrompt(', '  async function opGenerate(']) {
    const body = source.slice(source.indexOf(start));
    const loop = body.slice(0, body.indexOf('    if (!taken)'));
    assert.match(loop, /await trustedClick\(SEL\.send\)/);
    assert.doesNotMatch(loop, /await trustedClick\(btn\)/);
  }
});

function harness({ hit, onWait, send } = {}) {
  const events = [];
  const messages = [];
  const scrolls = [];
  let waits = 0;
  const button = {
    isConnected: true,
    disabled: false,
    getAttribute: () => null,
    getBoundingClientRect: () => ({ left: 100, top: 100, width: 80, height: 40 }),
    contains: (node) => node === child,
    scrollIntoView: (options) => scrolls.push(options),
    dispatchEvent: (event) => events.push(event),
  };
  const child = {};
  const context = vm.createContext({
    innerWidth: 500,
    innerHeight: 300,
    // addEventListener: ตัวเล็งก่อนคลิก (aimTrusted) ฟัง mousemove — ชุดนี้ไม่จำลองการชี้ จึงคลิกแบบเดิม (ดู flow-aim.test.mjs)
    document: { elementFromPoint: (x, y) => hit ? hit({ x, y, button, child, waits }) : child, addEventListener: () => {} },
    performance: { now: (() => { let t = 0; return () => (t += 1000); })() },
    sleep: async () => { waits++; onWait?.({ button, waits }); },
    chrome: { runtime: { id: 'test', sendMessage: async (message) => {
      if (message.moveOnly) return { ok: true }; // การชี้ก่อนคลิก ไม่ใช่การคลิก
      messages.push(message);
      return send ? send({ button, message }) : { ok: true };
    } } },
    PointerEvent: class { constructor(type, options) { Object.assign(this, { type }, options); } },
    MouseEvent: class { constructor(type, options) { Object.assign(this, { type }, options); } },
  });
  vm.runInContext(`${clicks}\nglobalThis.click = trustedClick;`, context);
  return { button, events, messages, scrolls, click: context.click, waits: () => waits };
}

test('center is covered: click an exposed point in the same button once', async () => {
  const h = harness({ hit: ({ x, button }) => x < 130 ? button : {} });
  assert.equal(await h.click(h.button), true);
  assert.equal(h.messages.length, 1);
  assert.equal(h.messages[0].x, 120);
  assert.equal(h.messages[0].y, 120);
  assert.equal(h.events.length, 0);
  assert.equal(h.scrolls[0].block, 'nearest');
});

test('partially clipped button: use its visible area inside the viewport', async () => {
  const h = harness();
  h.button.getBoundingClientRect = () => ({ left: 480, top: 280, width: 80, height: 40 });
  await h.click(h.button);
  assert.equal(h.messages[0].x, 490);
  assert.equal(h.messages[0].y, 290);
});

test('temporary overlay: wait until it disappears before sending a click', async () => {
  const h = harness({ hit: ({ waits, button }) => waits >= 3 ? button : {} });
  await h.click(h.button);
  assert.equal(h.waits(), 3);
  assert.equal(h.messages.length, 1);
});

test('fully covered button: stop within a bounded wait without clicking the overlay', async () => {
  const h = harness({ hit: () => ({}) });
  await assert.rejects(h.click(h.button), { code: 'wrong_place' });
  assert.equal(h.waits(), 8);
  assert.equal(h.messages.length, 0);
  assert.equal(h.events.length, 0);
});

test('composer is replaced while settling: resolve and measure the new button', async () => {
  let current;
  let replacement;
  const h = harness({
    onWait: ({ button, waits }) => {
      if (waits === 1) {
        button.isConnected = false;
        current = replacement;
      }
    },
    hit: () => current,
  });
  current = h.button;
  replacement = { ...h.button, getBoundingClientRect: () => ({ left: 250, top: 100, width: 80, height: 40 }) };
  await h.click(() => current);
  assert.equal(h.waits(), 2);
  assert.equal(h.messages.length, 1);
  assert.equal(h.messages[0].x, 290);
});

test('disabled or disconnected button: no trusted or synthetic click', async () => {
  for (const state of [{ disabled: true }, { isConnected: false }, { getAttribute: () => 'true' }]) {
    const h = harness();
    Object.assign(h.button, state);
    await assert.rejects(h.click(h.button), { code: 'wrong_place' });
    assert.equal(h.messages.length, 0);
    assert.equal(h.events.length, 0);
  }
});

test('debugger failure: synthetic fallback uses an exposed point without scrolling again', async () => {
  const h = harness({ hit: ({ x, button }) => x < 130 ? button : {}, send: () => ({ ok: false }) });
  assert.equal(await h.click(h.button), false);
  assert.equal(h.events.length, 5);
  assert.equal(h.events.at(-1).clientX, 120);
  assert.equal(h.scrolls.length, 1);
});

test('overlay appears during debugger failure: do not fall back to a blocked click', async () => {
  let covered = false;
  const h = harness({
    hit: ({ button }) => covered ? {} : button,
    send: () => { covered = true; return { ok: false }; },
  });
  await assert.rejects(h.click(h.button), { code: 'wrong_place' });
  assert.equal(h.events.length, 0);
});

/**
 * prompt ยาวทำให้ Flow กางช่องพิมพ์เป็นแผงใหญ่ที่มีปุ่มส่งของตัวเอง ปุ่มเดิมยัง "มองเห็น" แต่ถูกทับ
 * (เจอจริง ต.ค. 2026: หยุดที่ "มีแผงบัง (ขั้น: กดสร้าง)" ตั้งแต่ปกหน้า)
 */
test('send prefers the generate button that is not covered by the expanded prompt panel', () => {
  const start = source.indexOf('    send: () => {');
  const fn = source.slice(start + '    send: '.length, source.indexOf('\n    },', start) + 6);
  const covered = { name: 'covered', label: 'Start generation' };
  const free = { name: 'free', label: 'arrow_forward' };
  const send = vm.runInNewContext(`(${fn})`, {
    $$: (sel) => (sel === 'button' ? [covered, free] : [covered]),
    visible: () => true,
    text: (b) => b.label,
    clickPoint: (b) => (b === free ? { x: 1, y: 1 } : null),
  });
  assert.equal(send(), free);
});

test('a covered button stops with what is covering it, without clicking', async () => {
  const context = vm.createContext({
    innerWidth: 500, innerHeight: 300,
    text: (el) => el.label || '',
    document: { elementFromPoint: () => ({ nodeType: 1, label: 'close', closest: () => null }), addEventListener: () => {} },
    sleep: async () => {},
    chrome: { runtime: { id: 'test', sendMessage: async () => assert.fail('must not click') } },
  });
  vm.runInContext(`${clicks}\nglobalThis.click = trustedClick;`, context);
  const button = { isConnected: true, disabled: false, getAttribute: () => null, contains: () => false,
    getBoundingClientRect: () => ({ left: 100, top: 100, width: 80, height: 40, right: 180, bottom: 140 }) };
  await assert.rejects(context.click(button), (e) => e.code === 'wrong_place' && /ชี้แล้วโดน "close"/.test(e.message));
});
