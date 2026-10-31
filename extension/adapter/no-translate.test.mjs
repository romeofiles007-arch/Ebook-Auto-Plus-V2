/**
 * ผู้ใช้: "รู้แล้วว่าบางเครื่องมันติดแปล" (ภาพ: Chrome ขึ้น "Translated to Thai" บนหน้า Google Flow)
 * Chrome แปลหน้าเว็บอัตโนมัติ → "Nano Banana" กลายเป็น "นาโน บานานา" ชื่อเมนู/ไอคอนเปลี่ยน → ส่วนขยายหาปุ่มไม่เจอ
 * ต้องบอก Chrome ว่าห้ามแปลหน้าที่ส่วนขยายขับ ตั้งแต่หน้าเริ่มโหลด และหน้าที่แปลไปแล้วต้องถูกโหลดใหม่
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const read = (p) => readFile(new URL(p, import.meta.url), 'utf8');

test('manifest ใส่ตัวกันแปลตั้งแต่หน้าเริ่มโหลด ทั้ง Flow · ChatGPT · Gemini', async () => {
  const m = JSON.parse(await read('../manifest.json'));
  const cs = m.content_scripts.find((c) => c.js.includes('adapter/no-translate.js'));
  assert.ok(cs, 'ต้องมี content script adapter/no-translate.js');
  assert.equal(cs.run_at, 'document_start');
  for (const host of ['https://flow.google.com/*', 'https://chatgpt.com/*', 'https://gemini.google.com/*'])
    assert.ok(cs.matches.includes(host), host);
});

test('ตัวกันแปลตั้ง translate="no" + class notranslate + meta google notranslate', async () => {
  const src = await read('./no-translate.js');
  const attrs = {};
  const classes = new Set();
  const metas = [];
  const html = {
    setAttribute: (k, v) => { attrs[k] = v; },
    getAttribute: (k) => attrs[k],
    classList: { add: (c) => classes.add(c), contains: (c) => classes.has(c) },
    appendChild: (n) => metas.push(n),
  };
  const document = {
    documentElement: html,
    head: null,
    querySelector: () => (metas.length ? metas[0] : null),
    createElement: () => ({}),
    addEventListener() {},
  };
  vm.runInNewContext(src, { document, MutationObserver: class { observe() {} } });
  assert.equal(attrs.translate, 'no');
  assert.ok(classes.has('notranslate'));
  assert.equal(metas[0]?.name, 'google');
  assert.equal(metas[0]?.content, 'notranslate');
});

test('หน้า Flow ที่ถูกแปลไปแล้ว: ping บอก translated และ service worker โหลดแท็บใหม่ (เฉพาะตอนว่าง)', async () => {
  const flow = await read('./flow.js');
  assert.match(flow, /translated: pageTranslated\(\)/);
  assert.match(flow, /translated-\(ltr\|rtl\)/);
  const sw = await read('../sw.js');
  assert.match(sw, /r\.translated && !r\.busy/);
});
