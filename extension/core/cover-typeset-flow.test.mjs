/**
 * ปกนิยายจีนโบราณโหมด Flow กับฟอนต์พู่กันจีน
 * - 0.2.12 พิมพ์ทับด้วย SP-Kangfu → ผู้ใช้: "ไม่สวยเลย" (บาง เล็ก ไม่กลืนกับภาพ)
 * - ตอนนี้: Flow วาดชื่อเอง โดยแนบชื่อที่เขียนด้วยไฟล์ฟอนต์จริงเป็นต้นแบบตัวอักษร · พิมพ์ทับเฉพาะเมื่อผู้ใช้เลือกเอง
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as P from './prompts.js';
import { wantsLetteringRef, splitTitleLines, letteringRefName, LETTERING_REF_RULE, renderTitleLettering } from './title-lettering.js';

const flowNovel = (over = {}) => ({ imageSource: 'flow', contentMode: 'fiction', language: 'th', ...over });

test('โหมด Flow: Flow วาดชื่อเอง (รวมจีนโบราณ) · พิมพ์ทับเฉพาะเมื่อเลือก "ให้ระบบพิมพ์ทับภาพ"', () => {
  assert.equal(P.coverTextBaked(flowNovel({ fictionGenre: 'chinese' })), true);
  assert.equal(P.coverTextBaked(flowNovel({ fictionGenre: 'romance' })), true);
  assert.equal(P.coverTextBaked(flowNovel({ fictionGenre: 'chinese', coverTextMode: 'typeset' })), false);
  assert.equal(P.coverTextBaked({ imageSource: 'web', coverTextMode: 'typeset' }), false);
});

test('ต้นแบบตัวอักษรใช้กับฟอนต์พู่กันจีนเท่านั้น · ชื่อไฟล์เปลี่ยนตามชื่อเรื่อง', () => {
  assert.equal(wantsLetteringRef(flowNovel({ fictionGenre: 'chinese' })), true);
  assert.equal(wantsLetteringRef(flowNovel({ fictionGenre: 'romance' })), false);
  assert.equal(wantsLetteringRef(flowNovel({ fictionGenre: 'romance', typography: { coverFont: 'SP-Kangfu' } })), true);
  assert.equal(wantsLetteringRef(flowNovel({ fictionGenre: 'chinese', language: 'en' })), false);
  const b = flowNovel({ fictionGenre: 'chinese' });
  assert.notEqual(letteringRefName(b, 'วาสนารักจอมใจ'), letteringRefName(b, 'บัญชีรักท่านเสนาบดี'));
  assert.match(letteringRefName(b, 'x'), /^title-lettering-[a-z0-9]+\.png$/);
});

test('แบ่งชื่อยาวเป็นบรรทัดที่ช่องว่าง · ชื่อไม่มีช่องว่าง = บรรทัดเดียว', () => {
  assert.deepEqual(splitTitleLines('วาสนารักจอมใจ'), ['วาสนารักจอมใจ']);
  const lines = splitTitleLines('วาสนารักจอมใจ เกิดใหม่ครั้งนี้ ข้าจะหย่าท่านอ๋อง');
  assert.equal(lines.join(' '), 'วาสนารักจอมใจ เกิดใหม่ครั้งนี้ ข้าจะหย่าท่านอ๋อง');
  assert.ok(lines.length >= 2 && lines.length <= 3);
});

test('ไม่มี canvas (เทสต์/ที่อื่น) = ไม่แนบ ไม่พัง · กติกาไม่อ้างเลขรูปแนบ', async () => {
  assert.equal(await renderTitleLettering(flowNovel({ fictionGenre: 'chinese' }), 'x'), null);
  assert.match(LETTERING_REF_RULE, /black brush lettering on a plain white background/);
  assert.match(LETTERING_REF_RULE, /never paste the white box onto the cover/);
  assert.doesNotMatch(LETTERING_REF_RULE, /attached image \d/);
});

test('ปกหน้า Flow แนบต้นแบบตัวอักษรทั้งคำขอหลักและรอบไม่แนบตัวละคร', async () => {
  const m = await readFile(new URL('./machine.js', import.meta.url), 'utf8');
  const at = m.indexOf("if (j.name === 'cover-front.png' && textIn && wantsLetteringRef(this.book)) {");
  assert.ok(at > 0 && at < m.indexOf('const castRefNames = new Set('), 'ก่อนแยกรูปตัวละคร — ต้นแบบตัวอักษรอยู่ในรอบสุดท้ายด้วย');
  const block = m.slice(at, at + 1400);
  assert.match(block, /refs\.push\(\{ name: lettering\.name, dataUrl: lettering\.dataUrl \}\);/);
  assert.match(block, /prompt \+= `\\n\\n\$\{LETTERING_REF_RULE\}`;/);
  assert.match(block, /coverPlain \+= `\\n\\n\$\{LETTERING_REF_RULE\}`;/);
});
