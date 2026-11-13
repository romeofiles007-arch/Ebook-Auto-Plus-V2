/**
 * ผู้ใช้: "ทำไมไม่ใช้ front พู่กันจีน" — โหมด Flow ให้ Flow วาดชื่อเรื่องเองเสมอ ฟอนต์ SP-Kangfu จึงเป็นแค่คำบรรยาย
 * ฟอนต์ที่โมเดลภาพวาดตามไม่ได้ / ผู้ใช้เลือกพิมพ์ทับ = Flow วาดภาพเปล่า แล้ว Typst พิมพ์ชื่อด้วยไฟล์ฟอนต์จริง
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as P from './prompts.js';

const flowNovel = (over = {}) => ({ imageSource: 'flow', contentMode: 'fiction', language: 'th', ...over });

test('นิยายจีนโบราณโหมด Flow: ปกหน้าพิมพ์ชื่อทับด้วยฟอนต์พู่กันจริง ไม่ให้ Flow วาด', () => {
  assert.equal(P.coverTextBaked(flowNovel({ fictionGenre: 'chinese' })), false);
  assert.equal(P.coverTextBaked(flowNovel({ fictionGenre: 'romance', typography: { coverFont: 'SP-Kangfu' } })), false, 'เลือกฟอนต์พู่กันเองก็พิมพ์ทับ');
});

test('แนวอื่นโหมด Flow ยังให้ Flow วาดชื่อแบบโปสเตอร์ · เลือก "ให้ระบบพิมพ์ทับภาพ" เองได้', () => {
  assert.equal(P.coverTextBaked(flowNovel({ fictionGenre: 'romance' })), true);
  assert.equal(P.coverTextBaked(flowNovel({ fictionGenre: 'chinese', language: 'en' })), true, 'ภาษาอังกฤษไม่ใช้ฟอนต์ไทย');
  assert.equal(P.coverTextBaked(flowNovel({ fictionGenre: 'romance', coverTextMode: 'typeset' })), false);
  assert.equal(P.coverTextBaked({ imageSource: 'flow', contentMode: 'prose' }), true);
  assert.equal(P.coverTextBaked({ imageSource: 'web', coverTextMode: 'typeset' }), false);
});

test('เล่มที่ปกไม่ได้วาดชื่อ: เรียงพิมพ์ชื่อทับด้วยฟอนต์ตามแนวหนังสือ', async () => {
  const tpl = await readFile(new URL('../typeset/template.js', import.meta.url), 'utf8');
  assert.match(tpl, /const coverFace = resolveCoverTypography\(book\);/);
  assert.match(tpl, /#text\(font: \$\{str\(coverFace\.family\)\}/);
});
