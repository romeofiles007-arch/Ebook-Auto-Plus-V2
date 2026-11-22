import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

/**
 * หน้าแชตของ ChatGPT (พ.ย. 2026) มีช่องพิมพ์สองชุด และชุดที่ซ่อนมาก่อนใน DOM
 *
 * ของจริงจากหน้าเว็บ (ตรวจสด 22 พ.ย. 2026):
 *   #0 form[data-composer-placement="home"]   display:none  ปุ่ม: Add files · model · Dictate · Stop (ซ่อน)
 *   #1 form[data-composer-placement="thread"] มองเห็น       ปุ่ม: Add files · model · Dictate · Send
 * เดิมทุกจุดหยิบ $(S.composer) = ตัวแรก = ตัวที่ซ่อน → หาปุ่มส่งไม่เจอ รอ 30 วินาที → composer_busy_stuck
 * และ sw.forceSend โฟกัสตัวที่ซ่อนไม่ได้ → ไม่ได้พิมพ์ ไม่ได้กด Enter → ทุกเทิร์นล้ม 4 ครั้งก่อนผ่าน
 */
const source = await readFile(new URL('./chatgpt.js', import.meta.url), 'utf8');
const sw = await readFile(new URL('../sw.js', import.meta.url), 'utf8');

const slice = (from, to) => {
  const a = source.indexOf(from);
  assert.ok(a >= 0, `หา ${from} ไม่เจอ`);
  return source.slice(a, source.indexOf(to, a));
};

function box(name, { visible, form = null } = {}) {
  return {
    name,
    disabled: false,
    offsetParent: visible ? {} : null,
    isConnected: true,
    getAttribute: () => null,
    closest: (what) => (what === 'form' ? form : null),
  };
}

function scopeWith(boxes) {
  const scope = {
    S: { composer: 'COMPOSER' },
    $: (sel) => (sel === 'COMPOSER' ? boxes[0] || null : null),
    $$: (sel) => (sel === 'COMPOSER' ? [...boxes] : []),
    getComputedStyle: () => ({ position: 'static' }),
  };
  vm.createContext(scope);
  vm.runInContext(
    `${slice('function composerReady()', '\n  const waitForComposer')}\n${slice('function composerEl()', '\n  }')}\n  }\nglobalThis.pick = composerEl;`,
    scope,
  );
  return scope;
}

test('มีช่องพิมพ์ที่ซ่อนอยู่ก่อน ต้องได้ช่องที่มองเห็น ไม่ใช่ตัวแรกในหน้า', () => {
  const hidden = box('home', { visible: false });
  const shown = box('thread', { visible: true });
  assert.equal(scopeWith([hidden, shown]).pick(), shown);
});

test('ช่องพิมพ์เดียวที่มองเห็น ได้ตัวนั้นตามเดิม', () => {
  const only = box('home', { visible: true });
  assert.equal(scopeWith([only]).pick(), only);
});

test('ยังไม่มีช่องไหนมองเห็น (หน้ากำลังวาด) คืนตัวแรกเหมือนพฤติกรรมเดิม ไม่ใช่ null', () => {
  const hidden = box('home', { visible: false });
  assert.equal(scopeWith([hidden]).pick(), hidden);
});

test('ไม่มีจุดไหนในตัวขับหยิบช่องพิมพ์ด้วย $(S.composer) ตรง ๆ อีก ยกเว้นทางสำรองใน composerEl', () => {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const raw = [...code.matchAll(/(?<!\$)\$\(S\.composer\)/g)];
  assert.equal(raw.length, 1, 'เหลือได้จุดเดียวคือ return composerReady() || $(S.composer)');
  assert.match(code, /function composerEl\(\) \{\s*return composerReady\(\) \|\| \$\(S\.composer\);/);
});

test('clickSend หาปุ่มส่งจากช่องพิมพ์ที่มองเห็น', () => {
  const send = slice('async function clickSend', '// ---------- รู้ได้อย่างไรว่าตอบจบ');
  assert.match(send, /usableButton = \(\) => sendCandidates\(composerEl\(\)\)/);
  assert.match(send, /composerBusy = \(\) => sendCandidates\(composerEl\(\)\)/);
});

/** ฟังก์ชันที่ sw.forceSend ฉีดเข้าหน้าเว็บ — ทั้งขั้นโฟกัสและขั้นตรวจหลังพิมพ์ */
function swPicks() {
  const start = sw.indexOf("case 'sw.forceSend'");
  const end = sw.indexOf('case ', start + 30);
  const block = sw.slice(start, end);
  return [...block.matchAll(/const box = (\[\.\.\.document\.querySelectorAll\(SEL\)\][^;]+);/g)].map((m) => m[1]);
}

test('sw.forceSend เลือกช่องพิมพ์ที่มองเห็นทั้งตอนโฟกัสและตอนตรวจ', () => {
  const picks = swPicks();
  assert.equal(picks.length, 2, 'ต้องมีทั้งขั้นโฟกัสและขั้นตรวจ');
  const hidden = box('home', { visible: false });
  const shown = box('thread', { visible: true });
  for (const expr of picks) {
    const scope = {
      SEL: 'COMPOSER',
      document: { querySelectorAll: () => [hidden, shown], querySelector: () => hidden },
      getComputedStyle: () => ({ position: 'static' }),
    };
    vm.createContext(scope);
    assert.equal(vm.runInContext(expr, scope), shown);
  }
});

test('sw.forceSend ไม่เหลือ document.querySelector ช่องพิมพ์แบบหยิบตัวแรก', () => {
  const start = sw.indexOf("case 'sw.forceSend'");
  const block = sw.slice(start, sw.indexOf('case ', start + 30));
  assert.doesNotMatch(block, /const box = document\.querySelector\('#prompt-textarea/);
});

// ---------- ไฟล์ "Pasted text" ที่ค้างในช่องพิมพ์ ----------

function button(label) {
  const b = { label, disabled: false, clicks: 0, getAttribute: (k) => (k === 'aria-label' ? label : null) };
  b.click = () => {
    b.clicks++;
    b.gone = true;
  };
  return b;
}

async function runClear(buttons) {
  const form = { querySelectorAll: () => buttons.filter((b) => !b.gone) };
  const scope = { frame: async () => {} };
  vm.createContext(scope);
  vm.runInContext(`${slice('const PASTED_REMOVE', '\n  /** ล้างช่องพิมพ์ให้สุดความสามารถ')}\nglobalThis.clear = clearPastedText;`, scope);
  return scope.clear({ isConnected: true, closest: () => form });
}

test('ล้างไฟล์ Pasted text ที่พอกอยู่ทุกชิ้น', async () => {
  const chips = [1, 2, 3, 4].map(() => button('Remove pasted text attachment'));
  const others = ['Add files and more', 'Select ChatGPT model', 'Dictate', 'Send'].map(button);
  assert.equal(await runClear([...chips, ...others]), 4);
  assert.ok(chips.every((c) => c.clicks === 1));
  assert.ok(others.every((b) => b.clicks === 0), 'ห้ามกดปุ่มอื่นในช่องพิมพ์');
});

test('รูปอ้างอิงที่แนบไว้ไม่ถูกลบโดยตัวล้างข้อความที่วาง', async () => {
  const image = button('Remove file');
  assert.equal(await runClear([image]), 0);
  assert.equal(image.clicks, 0);
});

test('clearComposer ล้างไฟล์ Pasted text ก่อนลบข้อความ', () => {
  const body = slice('async function clearComposer', '\n  function sendCandidates');
  assert.match(body, /^async function clearComposer\(box\) \{\s*await clearPastedText\(box\);/);
});
