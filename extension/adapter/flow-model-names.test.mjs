/**
 * ผู้ใช้: "ของลูกค้าบางคนเป็น นาโน บานานา เลยนะ แบบไทยประมาณนี้เลย"
 * บัญชีบางบัญชี Flow แสดงชื่อรุ่นเป็นภาษาไทย — เทียบชื่อแบบตรงตัวกับ "Nano Banana 2 Lite" จึงไม่เคยเจอ
 * ทั้งตอนเลือกรุ่นที่ใช้ 0 เครดิต ตอนปิดเมนูรุ่น และตอนตั้ง Agent settings
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const src = await readFile(new URL('./flow.js', import.meta.url), 'utf8');
const start = src.indexOf('  const modelKey = ');
const end = src.indexOf('\n\n', src.indexOf('const isNanoBanana'));
assert.ok(start > 0 && end > start, 'modelKey/sameModel/isNanoBanana ต้องอยู่ใน adapter/flow.js');
const ctx = {};
vm.runInNewContext(`${src.slice(start, end)}\nthis.sameModel = sameModel; this.isNanoBanana = isNanoBanana;`, ctx);
const { sameModel, isNanoBanana } = ctx;

test('ชื่อรุ่นภาษาไทยตรงกับภาษาอังกฤษ', () => {
  assert.equal(sameModel('🍌 นาโน บานานา 2 Lite', 'Nano Banana 2 Lite'), true);
  assert.equal(sameModel('นาโน บานานา 2 ไลต์', 'Nano Banana 2 Lite'), true);
  assert.equal(sameModel('🍌 นาโนบานาน่า โปร', 'Nano Banana Pro'), true);
  assert.equal(sameModel('🍌 Nano Banana 2.1 arrow_drop_down', 'Nano Banana 2.1'), true);
});

test('คนละรุ่นต้องไม่ตรงกัน — ห้ามเลือกรุ่นที่กินเครดิตแทน', () => {
  assert.equal(sameModel('นาโน บานานา โปร', 'Nano Banana 2 Lite'), false);
  assert.equal(sameModel('Nano Banana 2', 'Nano Banana 2.1'), false);
  assert.equal(sameModel('Nano Banana 2.1', 'Nano Banana 2'), false);
  assert.equal(sameModel('', 'Nano Banana 2 Lite'), false);
});

test('รู้จักตระกูล Nano Banana ทั้งชื่อไทยและอังกฤษ', () => {
  assert.equal(isNanoBanana('🍌 นาโน บานานา 2 Lite'), true);
  assert.equal(isNanoBanana('Nano Banana Pro'), true);
  assert.equal(isNanoBanana('Imagen 4'), false);
});

test('ทุกจุดที่เทียบชื่อรุ่นใช้ sameModel — ไม่เหลือการเทียบแบบตรงตัว', () => {
  assert.doesNotMatch(src, /\.model === model|=== model\b|model !== model|=== current\b/);
  assert.doesNotMatch(src, /\/\^Nano Banana\\b\/i\.test/);
});
