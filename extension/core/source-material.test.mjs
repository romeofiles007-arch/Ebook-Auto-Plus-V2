import test from 'node:test';
import assert from 'node:assert/strict';
import * as P from './prompts.js';
import * as B from './bible.js';
import { themePrompt, itemBatchPrompt } from './items.js';
import { recoverContentDraft } from './content-readiness.js';
import { splitSource, sourceExcerpt, sourceOverview, sourceBlock, sourceOnlyRule, sourceFingerprint, SOURCE_BUDGET } from './source-material.js';

const section = { id: '1.1', title: 'หมักปุ๋ยจากเศษผัก', problem: 'เศษผักในครัวทิ้งทุกวัน',
  claim: 'หมักในถังปิดได้ภายในสามสัปดาห์', beats: ['สัดส่วนเศษผักกับใบไม้แห้ง'], verdict: 'เริ่มหมักถังแรกได้',
  quota: 1800 };
const chapter = { n: 1, title: 'ปุ๋ยหมักในบ้าน', objective: 'ทำปุ๋ยใช้เอง', sections: [section] };
const book = (over = {}) => ({ id: 'b', topic: 'สวนครัวหลังบ้าน', contentMode: 'prose', genre: 'how-to',
  audience: 'มือใหม่', language: 'th', tone: 'เป็นกันเอง', targetPages: 40, bible: B.emptyBible(),
  outline: { title: 'สวนครัวหลังบ้าน', thesis: 'ปลูกกินเองได้', reader_promises: [], chapters: [chapter] }, ...over });
const args = (b) => ({ book: b, outline: b.outline, bible: b.bible, chapter, sections: [section], withContext: true });

const MARK = 'เศษผักสามส่วนต่อใบไม้แห้งหนึ่งส่วน หมักในถังปิดฝา กลับกองทุกห้าวัน';
// ต้นฉบับยาวเกินงบ: เรื่องอื่นล้วน ๆ มีย่อหน้าเรื่องปุ๋ยหมักซ่อนอยู่กลางฉบับ
const filler = (i) => `บันทึกการเดินทางวันที่ ${i} ขึ้นรถไฟสายเหนือ แวะตลาดเช้า ซื้อของฝากและถ่ายรูปสถานีเก่า `.repeat(9);
const LONG = [...Array.from({ length: 30 }, (_, i) => filler(i)), MARK.repeat(6), ...Array.from({ length: 30 }, (_, i) => filler(i + 30))].join('\n\n');

test('เล่มที่ไม่มีต้นฉบับ: ทุกก้อนเป็นค่าว่าง และกุญแจสาระดิบไม่เปลี่ยน', () => {
  const b = book();
  assert.equal(sourceBlock(b, { stage: 'outline' }), '');
  assert.equal(sourceOnlyRule({ ...b, sourceOnly: true }), ''); // ติ๊กไว้แต่ไม่มีต้นฉบับ = ไม่มีอะไรให้บังคับ
  assert.equal(sourceFingerprint(b), '');
  assert.ok(!P.contentDraftKey(b, chapter, section).includes('userSource'));
  assert.doesNotMatch(P.contentDraftPrompt(args(b)), /ต้นฉบับผู้ใช้/);
});

test('ต้นฉบับสั้นส่งทั้งฉบับ ต้นฉบับยาวคัดส่วนที่เกี่ยวกับตอน', () => {
  assert.deepEqual(sourceExcerpt(MARK, 'อะไรก็ได้'), { text: MARK, partial: false });
  assert.ok(LONG.length > SOURCE_BUDGET.write * 2);
  assert.ok(splitSource(LONG).every((c) => c.length <= 1900));
  const pick = sourceExcerpt(LONG, 'หมักปุ๋ยจากเศษผัก ใบไม้แห้ง ถังปิด');
  assert.equal(pick.partial, true);
  assert.ok(pick.text.includes(MARK));
  assert.ok(pick.text.length <= SOURCE_BUDGET.write + 2400);
  const wide = sourceOverview(LONG, 6000);
  assert.equal(wide.partial, true);
  assert.ok(wide.text.length <= 6600);
});

test('ไม่ติ๊กโหมดเข้ม: แนบต้นฉบับเป็นแกน แต่ไม่มีกติกาห้ามเติม', () => {
  const b = book({ sourceMaterial: LONG, sourceName: 'โน้ตสวน.docx' });
  const draft = P.contentDraftPrompt(args(b));
  assert.ok(draft.includes(MARK));
  assert.match(draft, /โน้ตสวน\.docx/);
  assert.match(draft, /เสริมคำอธิบายหรือตัวอย่างจากความรู้ทั่วไปได้/);
  assert.doesNotMatch(draft, /เขียนจากเนื้อหาที่ให้เท่านั้น —/);
  assert.match(P.outlinePrompt(b), /<<<ต้นฉบับผู้ใช้>>>/);
});

test('ติ๊กโหมดเข้ม: กติกาอยู่ท้ายคำสั่งของทุกขั้นที่สร้างเนื้อหา', () => {
  const b = book({ sourceMaterial: LONG, sourceOnly: true });
  const rule = /เขียนจากเนื้อหาที่ให้เท่านั้น — ผู้ใช้เลือกโหมดนี้เอง/;
  const draft = P.contentDraftPrompt(args(b));
  assert.match(draft, rule);
  // ต้องมาหลังข้อที่อนุญาตให้ใช้ความรู้ทั่วไป ไม่งั้นข้อนั้นเป็นคำสุดท้าย
  assert.ok(draft.search(rule) > draft.indexOf('คำอธิบายความรู้ทั่วไปและตัวอย่างสมมติ'));
  assert.match(draft, /missing_information: ใส่ \[\] เมื่อต้นฉบับมีเนื้อหาพอ/);
  const compose = P.composeBatchPrompt({ ...args(b), drafts: [{ id: '1.1', md: MARK }] });
  assert.match(compose, rule);
  assert.doesNotMatch(compose, /<<<ต้นฉบับผู้ใช้>>>/); // สาระดิบคือขอบเขตของรอบนี้อยู่แล้ว
  assert.match(P.outlinePrompt(b), /วางสารบัญจากสิ่งที่ต้นฉบับมีจริงเท่านั้น/);
  assert.match(P.batchPrompt({ ...args(b), book: { ...b, contentMode: 'fiction' } }), /ตัวละคร เหตุการณ์ ลำดับเรื่อง/);
  const rec = { ...section, chars: 900 };
  assert.match(P.rewritePrompt({ book: b, section: rec, currentText: 'เดิม', targetChars: 1800 }), rule);
  assert.match(P.repairPrompt({ book: b, section: rec, currentText: 'เดิม', issues: [{ label: 'ซ้ำ', text: 'ย่อหน้าซ้ำ' }] }), rule);
  assert.match(P.consistencyPrompt(chapter, [{ ...section, md: 'เนื้อหา' }], b.bible, b), /ห้ามเสนอให้เพิ่มข้อมูล/);
  const items = { ...b, contentMode: 'items', itemKind: 'quote' };
  assert.match(themePrompt(items, { total: 10, themes: 2, perTheme: 5 }), rule);
  assert.match(itemBatchPrompt({ book: items, outline: b.outline, theme: { n: 1, title: 'ปุ๋ยหมัก' }, count: 2, startIndex: 1 }), /ทุกชิ้นต้องดึงหรือเรียบเรียงจากข้อความ/);
  assert.match(P.outlineDirectionsPrompt({ title: 'สวนครัว', source: b }), rule);
  assert.match(P.titleIdeasPrompt({ topic: 'สวนครัว', source: b }), /<<<ต้นฉบับผู้ใช้>>>/);
});

test('เปลี่ยนต้นฉบับหรือสลับโหมด ทำให้สาระดิบที่เก็บไว้เป็นของเก่า', () => {
  const keys = [book(), book({ sourceMaterial: MARK }), book({ sourceMaterial: MARK, sourceOnly: true }), book({ sourceMaterial: MARK + ' เพิ่ม' })]
    .map((b) => P.contentDraftKey(b, chapter, section));
  assert.equal(new Set(keys).size, 4);
});

test('โหมดเข้ม: ไม่ยิงรอบเติมสาระจากความรู้ทั่วไป และเก็บสาระที่ดึงจากต้นฉบับไว้', async () => {
  const draft = { md: MARK, meta: { missing_information: ['อุณหภูมิกองปุ๋ย'] } };
  let asked = 0;
  const run = (b) => recoverContentDraft({ book: b, chapter, section, draft: structuredClone(draft),
    request: async () => { asked++; return { text: '' }; }, persist: async () => {} });
  const strict = await run(book({ sourceMaterial: MARK, sourceOnly: true }));
  assert.equal(asked, 0);
  assert.equal(strict.md, MARK);
  assert.deepEqual(strict.meta.missing_information, []);
  assert.deepEqual(strict.meta.omitted_information, ['อุณหภูมิกองปุ๋ย']);
  await run(book({ sourceMaterial: MARK }));
  assert.equal(asked, 1); // ไม่ติ๊ก = ยังเติมจากความรู้ทั่วไปได้ตามเดิม
});
