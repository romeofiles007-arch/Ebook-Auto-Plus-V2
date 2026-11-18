/**
 * ผู้ใช้ให้ศึกษาละครแนวตั้ง 10 เรื่อง แล้วสั่ง "ทำทั้ง 2 ส่วนเลยให้จบ"
 *   ส่วนที่ 1 — กติกาทั่วไปที่ทุกนิยายได้ (เปิดแรง ความลับที่ผู้อ่านรู้ก่อน เฉลยต่อหน้าคน ผลกรรม ฯลฯ)
 *   ส่วนที่ 2 — ตัวเลือก "จังหวะละครแนวตั้ง" ที่ต้องเลือกเอง ไม่เลือก = prompt เหมือนเดิมทุกตัวอักษร
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as D from './short-drama.js';
import * as P from './prompts.js';
import * as B from './bible.js';

const outline = {
  title: 'เมียลับ', thesis: 'แกน', voice_card: 'ฉับไว', world_rules: ['สัญญา 1 ปี'], cast: [{ name: 'หนิง', role: 'นางเอก' }],
  chapters: [
    { n: 1, title: 'คืนนั้น', objective: 'เริ่ม', sections: [{ id: '1.1', title: 'งานเลี้ยง', quota: 2000, pov_character: 'หนิง', beats: ['ถูกหักหน้า'], takeaways: ['สัญญา'] }, { id: '1.2', title: 'สัญญา', quota: 2000, pov_character: 'หนิง' }] },
    { n: 2, title: 'บ้านใหญ่', objective: 'ต่อ', sections: [{ id: '2.1', title: 'ย้ายเข้า', quota: 2000, pov_character: 'หนิง' }] },
  ],
};
const book = (over = {}) => ({
  contentMode: 'fiction', fictionGenre: 'romance', genreBrief: 'โรแมนติก', fictionPov: 'third-limited',
  fictionEnding: 'happy', fictionRomance: 'main', tone: 't', audience: 'a', topic: 'เมียลับ', language: 'th', targetPages: 120,
  trim: { preset: 'a5' }, outline, bible: { ...B.emptyBible(), characters: outline.cast }, ...over,
});
const [ch1, ch2] = outline.chapters;
const args = (b, chapter = ch1, sections = [chapter.sections[0]]) => ({ book: b, outline, bible: b.bible, chapter, sections, prevSummaries: [], withContext: true });

test('ส่วนที่ 1: วางโครงทุกเล่มได้กติกาเปิดแรง ความลับที่ผู้อ่านรู้ก่อน เฉลยต่อหน้าคน และผลกรรม', () => {
  for (const g of ['romance', 'literary', 'horror', 'chinese']) {
    const p = P.outlinePrompt(book({ fictionGenre: g }));
    assert.match(p, /16\. เปิดเล่มด้วยแรงดึง/, g);
    assert.match(p, /17\. ความลับที่ผู้อ่านรู้ก่อนตัวละคร/, g);
    assert.match(p, /18\. จุดเฉลยหรือจุดพลิกใหญ่ควรเกิดต่อหน้าคน/, g);
    assert.match(p, /19\. ผลของการกระทำต้องสมน้ำสมเนื้อ/, g);
    assert.match(p, /22\. เดิมพันต้องจับต้องได้/, g);
    // นิยายเงียบ ๆ ไม่ถูกบังคับให้เปิดด้วยระเบิด
    assert.match(p, /ความดังของวิกฤตให้เข้ากับแนวและโทน/, g);
  }
});

test('ส่วนที่ 1: ฉากเปิดเล่มได้คำสั่งเฉพาะ ฉากอื่นไม่ได้ และกติกาเขียนฉาก/ตรวจครบ', () => {
  const b = book();
  const first = P.batchPrompt(args(b));
  assert.match(first, /ฉาก 1\.1 คือฉากเปิดเล่ม/);
  assert.match(first, /ห้ามเฉลยความลับหรือตัวตนที่โครงเรื่องวางไว้ก่อนบทที่กำหนด/);
  assert.match(first, /ห้ามจบบทหรือฉากด้วยการสรุปบทเรียน/);
  assert.doesNotMatch(P.batchPrompt(args(b, ch1, [ch1.sections[1]])), /คือฉากเปิดเล่ม/);
  assert.doesNotMatch(P.batchPrompt(args(b, ch2, ch2.sections)), /คือฉากเปิดเล่ม/);
  // รวมหลายฉากในเทิร์นเดียวที่มีฉากเปิดเล่มอยู่ด้วย ก็ต้องได้
  assert.match(P.batchPrompt(args(b, ch1, ch1.sections)), /ฉาก 1\.1 คือฉากเปิดเล่ม/);
  const review = P.consistencyPrompt(ch1, [{ ...ch1.sections[0], md: 'x' }], b.bible, b);
  assert.match(review, /ความลับที่ผู้อ่านรู้ล่วงหน้าถูกเฉลยก่อนบทที่วางไว้/);
  assert.match(review, /ฉากเปิดเล่มที่เริ่มช้า/);
});

test('ส่วนที่ 2: เลือกละครแนวตั้งแล้ว ไปถึงวางโครง เขียนฉาก แก้ฉาก และตรวจ', () => {
  const b = book({ fictionPacing: 'shortdrama' });
  const p = P.outlinePrompt(b);
  assert.match(p, /จังหวะที่ผู้ใช้เลือก: ละครแนวตั้ง/);
  assert.match(p, /วงจรดูถูก→เอาคืน/);
  assert.match(p, /คิวตัวร้าย 3–5 คน/);
  assert.match(p, /จบทุกบทด้วยตะขอ/);
  assert.match(p, /ห้ามเขียนการบังคับหรือการไม่ยินยอมให้เป็นความโรแมนติก/);
  assert.match(p, /ห้ามลอกพล็อตหรือชื่อจากละครเรื่องใด/);
  const batch = P.batchPrompt(args(b));
  const rewrite = P.rewritePrompt({ book: b, section: { ...ch1.sections[0], chars: 1000 }, currentText: 'x', targetChars: 2000 });
  for (const [name, x] of Object.entries({ batch, rewrite })) assert.match(x, /จังหวะละครแนวตั้ง: ฉากเคลื่อนเร็ว/, name);
  assert.match(P.consistencyPrompt(ch1, [{ ...ch1.sections[0], md: 'x' }], b.bible, b), /9\. จังหวะละครแนวตั้ง/);
  assert.ok(D.shortDramaSceneKit(b).length < 500, 'ฉบับย่อแนบทุกเทิร์นต้องสั้น');
});

test('ส่วนที่ 2: ขั้นตั้งชื่อ ดูกระแส เสนอทิศทาง และขัดเกลาสารบัญได้จังหวะนี้', () => {
  const base = { audience: 'a', tone: 't', contentMode: 'fiction', fictionGenre: 'romance', fictionPacing: 'shortdrama' };
  assert.match(P.titleIdeasPrompt({ ...base, topic: 'x' }), /จังหวะที่ผู้ใช้เลือก: ละครแนวตั้ง/);
  assert.match(P.trendIdeasPrompt(base), /จังหวะละครแนวตั้ง/);
  assert.match(P.outlineDirectionsPrompt({ ...base, title: 'x' }), /จังหวะที่ผู้ใช้เลือก: ละครแนวตั้ง/);
  assert.match(P.outlinePolishPrompt({ ...base, title: 'x', userOutline: [{ n: 1, title: 'a' }] }), /จังหวะที่ผู้ใช้เลือก: ละครแนวตั้ง/);
});

test('ส่วนที่ 2: ไม่เลือก หรือไม่ใช่นิยาย — prompt เหมือนไม่มีตัวเลือกนี้ทุกตัวอักษร', () => {
  const none = book();
  const classic = book({ fictionPacing: 'classic' });
  assert.equal(P.outlinePrompt(classic), P.outlinePrompt(none));
  assert.equal(P.batchPrompt(args(classic)), P.batchPrompt(args(none)));
  assert.equal(P.consistencyPrompt(ch1, [{ ...ch1.sections[0], md: 'x' }], classic.bible, classic), P.consistencyPrompt(ch1, [{ ...ch1.sections[0], md: 'x' }], none.bible, none));
  assert.doesNotMatch(P.outlinePrompt(none), /ละครแนวตั้ง/);
  const base = { audience: 'a', tone: 't', contentMode: 'fiction', fictionGenre: 'romance' };
  assert.equal(P.titleIdeasPrompt({ ...base, topic: 'x', fictionPacing: 'classic' }), P.titleIdeasPrompt({ ...base, topic: 'x' }));
  assert.equal(P.trendIdeasPrompt({ ...base, fictionPacing: 'classic' }), P.trendIdeasPrompt(base));
  const prose = { audience: 'a', tone: 't', contentMode: 'prose', title: 'x', fictionPacing: 'shortdrama' };
  assert.doesNotMatch(P.outlineDirectionsPrompt(prose), /ละครแนวตั้ง/);
  assert.equal(D.isShortDrama({ contentMode: 'prose', fictionPacing: 'shortdrama' }), false);
});

test('Studio มีตัวเลือกจังหวะ ค่าตรงกับโมดูล และส่งเข้าทุก prompt ที่ส่งสูตรแนว', async () => {
  const html = await readFile(new URL('../ui/studio.html', import.meta.url), 'utf8');
  const select = html.slice(html.indexOf('<select id="fictionPacing">'), html.indexOf('</select>', html.indexOf('<select id="fictionPacing">')));
  const keys = [...select.matchAll(/value="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(keys, D.FICTION_PACINGS.map((x) => x.key));
  assert.match(select, /value="classic" selected/);
  const studio = await readFile(new URL('../ui/studio.js', import.meta.url), 'utf8');
  assert.equal(studio.match(/fictionPacing: val\('fictionPacing', 'classic'\)/g).length, studio.match(/genreStory: formGenreStory\(\)/g).length);
  assert.match(studio, /'fictionRomance', 'fictionPacing'\]\.forEach/);
});
