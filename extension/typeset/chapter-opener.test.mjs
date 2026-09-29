/**
 * หน้าเปิดบทแบบเต็มหน้า (ผู้ใช้ส่งตัวอย่างหนังสือจริง: เลข 11 · เส้น · "ไม่กลัวการอยู่คนเดียว" · เส้น · คำคม · –แบลส์ ปาสกาล)
 * ไม่มีพื้นสี (ผู้ใช้: "สีไม่ต้อง") · เล่มเก่าที่ไม่มีค่านี้ใช้หัวบทแบบเรียบตามเดิม
 * ตรวจเรียงพิมพ์จริงด้วย Typst แล้วในหน้าพรีวิว — เทสต์นี้กันโครงสร้างที่ทำให้พังซ้ำ
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDocument } from './template.js';

const base = {
  id: 't', language: 'th', contentMode: 'prose', author: 'ก',
  trim: { preset: 'a5', widthMm: 148, heightMm: 210, bleedMm: 3 },
  typography: { bodyFont: 'Sarabun', sizePt: 15, lineHeight: 1.6, justify: false, marginsMm: { inner: 18, outer: 14, top: 16, bottom: 18 } },
  frontMatter: [], backMatter: [],
};
const outline = { title: 'ท', chapters: [{ n: 11, title: 'ไม่กลัวการอยู่คนเดียว', sections: [{ id: '11.1', title: 'ก' }] }] };
const sections = [{ id: '11.1', md: 'ย่อหน้า' }];

test('หน้าเปิดบทเต็มหน้า: เลข ชื่อ คำคม และผู้พูด ส่งเข้าหน้าเปิดบท · ไม่มีพื้นสี', () => {
  // ตัวเตรียมข้อความไทยแทรกจุดตัดคำที่มองไม่เห็น (U+200B) และช่องว่างระหว่างชื่อ — ตัดทิ้งก่อนเทียบ
  const src = buildDocument({ book: { ...base, chapterOpener: 'poster', chapterEpigraphs: { 11: { text: 'ความทุกข์ของมนุษย์', by: 'แบลส์ ปาสกาล' } } }, outline, sections })
    .replace(/​/g, '')
    .replace(/#tw\[([^\]]*)\]/g, '$1')
    .replace(/#h\([^)]*\)/g, ' ');
  // หัวกระดาษไม่ขึ้นบนหน้าเปิดบท — เทียบกับเลขหน้าจริง ไม่ใช่เลขหน้าที่พิมพ์
  assert.match(src, /let pg = here\(\)\.page\(\)\n    let opens = query\(heading\.where\(level: 1\)\)\.any\(h => h\.location\(\)\.page\(\) == pg\)/);
  assert.match(src, /if opens \{ return \}\n    if opener-pages\.final\(\)\.contains\(pg\) \{ return \}/);
  assert.match(src, /#chapter-meta\.update\(\(n: "11", nt: "๑๑", title: \[ไม่กลัวการอยู่คนเดียว\], quote: \[ความทุกข์ของมนุษย์\], by: \[แบลส์ ปาสกาล\]\)\)/);
  assert.match(src, /block\(breakable: false, width: 100%/);
  // คำคมภาษาไทยไม่ตัวห่าง (ตัวห่างแล้วสระ/วรรณยุกต์แยกจากพยัญชนะ) · ภาษาอังกฤษยังห่างตามแบบ
  assert.match(src, /tracking: 0em, fill/);
  assert.match(buildDocument({ book: { ...base, language: 'en', chapterOpener: 'poster', chapterEpigraphs: { 11: { text: 'x' } } }, outline, sections }), /tracking: 0\.26em/);
  assert.doesNotMatch(src, /rect\(width: 100%, height: 100%, fill/);
  // here() ต้องอ่านก่อนเข้า update — อยู่ในฟังก์ชันของ update แล้ว Typst ฟ้อง "context is known"
  assert.match(src, /let pg = here\(\)\.page\(\); opener-pages\.update\(pages => pages \+ \(pg,\)\)/);
  assert.doesNotMatch(src, /update\(pages => pages \+ \(here\(\)/);
  // หน้าเปิดบทไม่มีเลขหน้า
  assert.match(src, /if opener-pages\.final\(\)\.contains\(here\(\)\.page\(\)\) \{ return \}/);
});

test('ไม่มีคำคม = หน้าเปิดบทไม่มีส่วนคำคม · เล่มเก่าใช้หัวบทแบบเดิม', () => {
  const noQuote = buildDocument({ book: { ...base, chapterOpener: 'poster' }, outline, sections });
  assert.match(noQuote, /quote: none, by: none/);
  const old = buildDocument({ book: base, outline, sections });
  assert.doesNotMatch(old, /chapter-meta|opener-pages/);
  assert.match(old, /block\(text\(size: .*weight: 600, it\.body\)\)/);
});

/** ผู้ใช้ขอ: เลือกแบบเองได้ และมีแบบสุ่ม — เพิ่มแบบใหม่ได้ด้วยการใส่ในตาราง CHAPTER_OPENERS */
test('ชุดแบบหน้าเปิดบท: ทุกแบบในตารางเลือกได้จากหน้าตั้งค่า · สุ่มหนึ่งแบบต่อเล่ม · ค่ารุ่นแรก "poster" = เส้นคู่', async () => {
  const { CHAPTER_OPENERS, chapterOpenerKey, pickRandomOpener } = await import('./template.js');
  const { readFile } = await import('node:fs/promises');
  const html = await readFile(new URL('../ui/studio.html', import.meta.url), 'utf8');
  for (const key of Object.keys(CHAPTER_OPENERS)) {
    assert.match(html, new RegExp(`<option value="${key}"`), `ตัวเลือก ${key} ต้องอยู่ในหน้าตั้งค่า`);
    const src = buildDocument({ book: { ...base, chapterOpener: key }, outline, sections });
    assert.match(src, /block\(breakable: false, width: 100%/, `${key}: ทั้งหน้าต้องเป็นก้อนเดียว`);
    assert.doesNotMatch(src, /❦/, `${key}: ห้ามใช้อักขระที่ฟอนต์ไม่มี`);
  }
  assert.match(html, /<option value="random">/);
  assert.equal(chapterOpenerKey({ chapterOpener: 'poster' }), 'lines');
  assert.equal(chapterOpenerKey({ chapterOpener: 'simple' }), '');
  assert.equal(chapterOpenerKey({}), '');
  assert.ok(Object.keys(CHAPTER_OPENERS).includes(pickRandomOpener(() => 0.99)));
  // แบบคลาสสิกใช้เลขไทย
  const classic = buildDocument({ book: { ...base, chapterOpener: 'classic' }, outline, sections });
  assert.match(classic, /nt: "๑๑"/);
});

/** ผู้ใช้ขอ: คลิกเลือกแล้วมีป๊อปอัปภาพตัวอย่างเล็ก ๆ — ทุกตัวเลือกต้องมีภาพตัวอย่าง */
test('ป๊อปอัปเลือกหน้าเปิดบท: ทุกตัวเลือกมีภาพตัวอย่างใน ui/openers', async () => {
  const { readFile, stat } = await import('node:fs/promises');
  const html = await readFile(new URL('../ui/studio.html', import.meta.url), 'utf8');
  const select = html.slice(html.indexOf('<select id="chapterOpener"'), html.indexOf('</select>', html.indexOf('<select id="chapterOpener"')));
  const values = [...select.matchAll(/<option value="([a-z]+)"/g)].map((m) => m[1]);
  assert.ok(values.length >= 9);
  for (const v of values.filter((x) => x !== 'random')) {
    const info = await stat(new URL(`../ui/openers/${v}.webp`, import.meta.url));
    assert.ok(info.size > 1000, `ภาพตัวอย่าง ${v}`);
  }
  assert.match(html, /id="chapterOpenerPick"/);
  const studio = await readFile(new URL('../ui/studio.js', import.meta.url), 'utf8');
  assert.match(studio, /\nsetupOpenerPicker\(\);\n/);
});
