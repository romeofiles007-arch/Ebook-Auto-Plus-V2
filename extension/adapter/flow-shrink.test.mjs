/**
 * งานหยุดที่ "ชี้แล้วโดน Agent" — หน้า Flow ค้างที่ซูม 6% เพราะตัวขับสองตัว (ตัวเก่าที่ถูกตัดขาดหลังโหลดส่วนขยายใหม่ + ตัวใหม่)
 * สแกนซ้อนกัน ชุดที่สองจำ "0.06" เป็นค่าเดิมแล้วคืนหน้าค้างไว้
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const src = await readFile(new URL('./flow.js', import.meta.url), 'utf8');
const shrink = src.slice(src.indexOf("  const SHRINK = '0.06';"), src.indexOf('  /** ให้ tile ทุกใบถูกวาดอย่างน้อยหนึ่งครั้ง'));
const sleepSrc = src.slice(src.indexOf('  const extAlive = () => {'), src.indexOf('  const visible = '));

function page(zoom = '') {
  const html = { style: { zoom }, dataset: {} };
  const ctx = vm.createContext({ document: { documentElement: html }, window: { dispatchEvent() {} }, Event: class {}, Number, String, Math });
  vm.runInContext(`${shrink}\nglobalThis.api = { beginShrink, endShrink, unstickShrink };`, ctx);
  return { html, ...ctx.api };
}

test('สแกนซ้อนกัน (ตัวขับสองตัวในหน้าเดียว) คืนซูมเดิมเมื่อชุดสุดท้ายจบ ไม่ค้าง 6%', () => {
  const p = page('');
  p.beginShrink(); // ตัวเก่า
  p.beginShrink(); // ตัวใหม่ ระหว่างตัวเก่ายังสแกน
  p.endShrink();
  assert.equal(p.html.style.zoom, '0.06', 'อีกชุดยังสแกนอยู่');
  p.endShrink();
  assert.equal(p.html.style.zoom, '');
  assert.equal(p.html.dataset.ebookShrink, undefined);
});

test('ตัวขับตายกลางสแกน → เริ่มงานถัดไปคืนขนาดหน้าเอง', () => {
  const p = page('0.9');
  p.beginShrink(); // ไม่มี endShrink — ตัวขับตาย
  assert.equal(p.html.style.zoom, '0.06');
  p.unstickShrink();
  assert.equal(p.html.style.zoom, '0.9');
  const q = page('0.06'); // หน้าที่ค้างจากโค้ดรุ่นก่อน (ไม่มีเครื่องหมายใน dataset)
  q.unstickShrink();
  assert.equal(q.html.style.zoom, '');
});

test('สแกนคืนซูมใน finally · ตัวขับที่ถูกตัดขาดหยุดเองที่ sleep · เริ่มงานคืนหน้าที่ค้าง', async () => {
  const scan = src.slice(src.indexOf('  async function scanAllTiles()'), src.indexOf('const scroller = gridScroller();', src.indexOf('  async function scanAllTiles()')));
  assert.match(scan, /beginShrink\(\);\s*try \{[\s\S]*\} finally \{\s*endShrink\(\);/);
  assert.doesNotMatch(scan, /const old = html\.style\.zoom/);
  const run = src.slice(src.indexOf('  async function run(op, args) {'), src.indexOf('  globalThis.__ebookPlusFlow'));
  assert.match(run, /unstickShrink\(\);/);

  const chrome = { runtime: { id: 'abc' } };
  const ctx = vm.createContext({ chrome, setTimeout, Promise, Error, Object });
  vm.runInContext(`${sleepSrc}\nglobalThis.sleep = sleep;`, ctx);
  await ctx.sleep(1);
  chrome.runtime.id = undefined; // กดโหลดส่วนขยายใหม่ — ตัวนี้ถูกตัดขาด
  await assert.rejects(ctx.sleep(1), (e) => e.code === 'orphaned');
});

test('service worker: ติดต่อตัวขับไม่ได้ = โหลดแท็บใหม่ก่อน ไม่ฉีดตัวใหม่ซ้อนตัวเก่า', async () => {
  const sw = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
  const fn = sw.slice(sw.indexOf('async function ensureFlowAdapter('), sw.indexOf('\n}\n', sw.indexOf('async function ensureFlowAdapter(')));
  const reload = fn.indexOf('await chrome.tabs.reload(tabId).catch(() => {});');
  const inject = fn.indexOf("files: ['adapter/flow.js']");
  assert.ok(reload > 0 && inject > reload, 'โหลดใหม่ก่อน ฉีดเป็นทางสุดท้าย');
});
