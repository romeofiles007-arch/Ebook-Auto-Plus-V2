/**
 * ผู้ใช้: "ลองดูบทที่ 3 มันซ้ำ แล้วรีบตัดจบเลย แบบนี้ทำไม่ได้นะ … ให้ทำตามเนื้อหาจริง เกินกำหนดได้
 * ถ้ากำหนด 40 จะเป็น 70 ก็ยังได้ แต่ต้องจบตามเนื้อหา" (เล่ม 7 วันจัดการหวัดทีละขั้น)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { proseRules, proseBatch, proseContentDraft, proseCompose, lengthLine } from './editorial.js';
import { buildDocument } from '../typeset/template.js';

globalThis.chrome = { runtime: { onMessage: { addListener() {} } } };
const { Machine } = await import('./machine.js');

const s = { id: '3.2', title: 'ท้ายเล่ม', quota: 2000, maxChars: 2500 };
const soft = { language: 'th', pageMode: 'soft' };
const strict = { language: 'th', pageMode: 'strict' };

test('โหมดยืดหยุ่น: ความยาวเป็นขั้นต่ำ ไม่ใช่เพดาน · ห้ามรวบรัดตัดจบ', () => {
  assert.match(lengthLine(soft, s), /ขั้นต่ำโดยประมาณ ไม่ใช่เพดาน/);
  assert.doesNotMatch(lengthLine(soft, s), /เพดาน 2500/);
  assert.match(proseRules(soft), /เนื้อหามาก่อนความยาว/);
  assert.doesNotMatch(proseRules(soft), /ครบประเด็นแล้วจบได้/);
  const batch = proseBatch({ book: soft, chapter: { sections: [s] }, sections: [s], context: '', output: '' });
  assert.match(batch, /ไม่ใช่เพดาน/);
  assert.match(proseContentDraft({ book: soft, sections: [s], context: '', output: '' }), /สาระอย่างน้อยราว/);
  // รอบเรียบเรียง: ห้ามบทสรุปลอย ๆ ยกเว้นส่วนปิดบท/ปิดเล่มที่สั่งไว้
  assert.match(proseCompose({ book: soft, chapter: { sections: [s] }, sections: [s], context: '', output: '', drafts: [] }), /ยกเว้นตอนปิดบท\/ปิดเล่ม/);
});

test('โหมดเป๊ะยังมีเพดานเหมือนเดิม', () => {
  assert.match(lengthLine(strict, s), /เพดาน 2500/);
  assert.match(proseRules(strict), /ครบประเด็นแล้วจบได้/);
});

test('นิยายโหมดยืดหยุ่นไม่มี "ห้ามเกิน … เด็ดขาด"', async () => {
  const src = await readFile(new URL('./prompts.js', import.meta.url), 'utf8');
  assert.match(src, /\(book\.pageMode \|\| 'soft'\) !== 'strict' \? `ความยาวตั้งต้นราว/);
});

test('ตอนสุดท้ายของเล่มเขียนเดี่ยว ไม่ถูกบีบรวมชุดกับตอนอื่น', () => {
  const m = Object.create(Machine.prototype);
  m.book = { writeMode: 'batch', maxCharsPerTurn: 99999 };
  const outline = { chapters: [
    { n: 1, sections: [{ id: '1.1', quota: 100 }, { id: '1.2', quota: 100 }] },
    { n: 2, sections: [{ id: '2.1', quota: 100 }, { id: '2.2', quota: 100 }, { id: '2.3', quota: 100 }] },
  ] };
  const plan = m.planBatches(outline).map((b) => b.sections.map((x) => x.id));
  assert.deepEqual(plan, [['1.1', '1.2'], ['2.1', '2.2'], ['2.3']]);
});

test('หัวข้อส่วนท้ายเล่มไม่กลายเป็นหน้าเปิดบทซ้ำ', () => {
  const book = {
    id: 't', language: 'th', contentMode: 'prose', author: 'ก', chapterOpener: 'lines',
    trim: { preset: 'a5', widthMm: 148, heightMm: 210 },
    typography: { bodyFont: 'Sarabun', headFont: 'IBM Plex Sans Thai', sizePt: 15, lineHeight: 1.6, marginsMm: { inner: 18, outer: 14, top: 16, bottom: 18 } },
    frontMatter: [], backMatter: ['glossary'], bible: { glossary: [{ term: 'ก', def: 'ข' }] },
  };
  const src = buildDocument({ book, outline: { title: 'x', chapters: [{ n: 3, title: 'ท้าย', sections: [{ id: '3.1', title: 'ก' }] }] }, sections: [{ id: '3.1', md: 'เนื้อ' }], opts: {} });
  assert.match(src, /#show heading\.where\(level: 1\): it => context \{ if chapter-meta\.get\(\)\.n == "" \{/);
  const reset = src.indexOf('#chapter-meta.update((n: "", nt: "", title: [], quote: none, by: none))');
  assert.ok(reset > 0 && reset < src.indexOf('= อภิธานศัพท์'), 'ล้างค่าบทก่อนเข้าส่วนท้ายเล่ม');
});
