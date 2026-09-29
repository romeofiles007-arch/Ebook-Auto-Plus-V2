/**
 * ตัดบรรทัดภาษาไทย — เจอจริงในเล่ม "7 วันจัดการหวัดทีละขั้น":
 * "เลือกดี / ขึ้น", "ที่รบ / กวนชีวิต" (Typst ตัดเองด้วยพจนานุกรมของมัน), ” ตกไปอยู่บรรทัดใหม่ตัวเดียว,
 * คำคมเปิดบทตัวห่างจนสระแยกจากพยัญชนะ, หัวกระดาษของบทก่อนขึ้นบนหน้าเปิดบท
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareForTypeset, stripZwsp, BOX_OPEN, BOX_CLOSE } from '../core/thai.js';
import { buildDocument } from './template.js';

const show = (s) => s.replace(/​/g, '|').replaceAll(BOX_OPEN, '[').replaceAll(BOX_CLOSE, ']');

test('ทุกก้อนคำไทยอยู่ในกล่อง — Typst ตัดกลางคำไม่ได้', () => {
  assert.equal(show(prepareForTypeset('เฉพาะจุดที่รบกวนชีวิตจริง')), '[เฉพาะ]|[จุด]|ที่|[รบกวน]|[ชีวิต]|[จริง]');
});

test('คำที่ต้องเกาะกันไม่ถูกแยก: ดีขึ้น แย่ลง ทำไว้ การ... ไม่... เมื่อวาน', () => {
  const out = show(prepareForTypeset('เลือกดีขึ้นทรงตัวหรือแย่ลง บันทึกไว้ การรักษา ไม่จำเป็น เหมือนเมื่อวาน ทีละอาการ'));
  for (const w of ['[ดีขึ้น]', '[แย่ลง]', '[บันทึกไว้]', '[การรักษา]', '[ไม่จำเป็น]', '[เมื่อวาน]', '[ทีละ]']) assert.ok(out.includes(w), `${w} ใน ${out}`);
});

test('เครื่องหมายคำพูด/วงเล็บติดคำ ไม่ตกบรรทัดตัวเดียว', () => {
  const out = show(prepareForTypeset('เพียงว่า “วันนี้ไม่เหมือนเมื่อวาน” (ตัวอย่าง) ได้ไหม?'));
  assert.ok(out.includes('[“วันนี้]'), out);
  assert.ok(out.includes('[เมื่อวาน”]'), out);
  assert.ok(out.includes('[(ตัวอย่าง)]'), out);
  assert.ok(out.includes('[ได้ไหม?]'), out);
});

test('ตัวครอบไม่หลุดไปที่อื่น: stripZwsp ลบออก · ต้นฉบับที่เก็บไม่มี', () => {
  assert.equal(stripZwsp(prepareForTypeset('ดีขึ้นแล้ว “จริง”')), 'ดีขึ้นแล้ว “จริง”');
});

const book = {
  id: 't', language: 'th', contentMode: 'prose', author: 'ก',
  trim: { preset: 'a5', widthMm: 148, heightMm: 210 },
  typography: { bodyFont: 'Sarabun', headFont: 'IBM Plex Sans Thai', sizePt: 15, lineHeight: 1.6, marginsMm: { inner: 18, outer: 14, top: 16, bottom: 18 } },
  frontMatter: [], backMatter: [],
};
const outline = { title: 'คู่มือ', chapters: [{ n: 1, title: 'รบกวน', sections: [{ id: '1.1', title: 'เมื่อวาน' }] }] };

test('เอกสาร Typst: กล่องคำเป็น #tw[...] ที่ก้นกล่อง = เส้นฐาน · ชื่อบท/ตอนไม่ครอบ (ที่คั่นหน้า PDF)', () => {
  const src = buildDocument({ book, outline, sections: [{ id: '1.1', md: 'เลือกดีขึ้นหรือแย่ลง' }], opts: {} });
  assert.match(src, /#let tw\(b\) = box\(text\(bottom-edge: "baseline", b\)\)/);
  assert.match(src, /#tw\[ดีขึ้น\]/);
  assert.doesNotMatch(src, /[]/, 'ตัวครอบต้องแปลงหมด');
  const plain = src.replace(/​/g, '').replace(/#h\([^)]*\)/g, ' ');
  assert.match(plain, /^= บทที่ 1 · รบกวน$/m);
  assert.match(plain, /^== เมื่อวาน$/m);
  // หัวกระดาษ: ชื่อหนังสือไม่มีเครื่องหมายคำพูดติดมา
  assert.match(src, /else \[#"คู่มือ" #h\(1fr\)\]/);
});

test('ภาพที่แทรกในต้นฉบับไทยถูกคืนจากตัวป้องกันคำก่อนส่งเข้า Typst', () => {
  const md = 'ขั้นตอนแรก\n\n![ภาพขั้นตอน](fig:fig-1.1-1.png 80% 45mm)\n\nขั้นตอนต่อไป';
  const prepared = prepareForTypeset(md);
  assert.match(prepared, /!\[ภาพขั้นตอน\]\(fig:fig-1\.1-1\.png 80% 45mm\)/);
  assert.doesNotMatch(prepared, /\u0000/);
  const src = buildDocument({
    book, outline, sections: [{ id: '1.1', md }],
    opts: { assetNames: ['fig-1.1-1.png'] },
  });
  assert.match(src, /image\("\/img\/fig-1\.1-1\.png", width: 80%, height: 45mm/);
  assert.doesNotMatch(src, /\u0000/);
});

test('ภาพที่มีไฟล์แล้วแต่ไม่ถูกวางในเนื้อหา ต้องไม่ส่งออก PDF เงียบ ๆ', () => {
  assert.throws(() => buildDocument({
    book: { ...book, figures: [{ kind: 'image', name: 'fig-1.1-1.png', section: '1.1' }] },
    outline,
    sections: [{ id: '1.1', md: 'เนื้อหาไม่มีตำแหน่งภาพ' }],
    opts: { assetNames: ['fig-1.1-1.png'] },
  }), /ภาพที่สร้างแล้วไม่ถูกวางใน PDF: fig-1\.1-1\.png/);
});

/** ผู้ใช้ส่งภาพหน้า 40/47/48/50: หัวข้อย่อย ("2. ปรับแผน") ค้างบรรทัดสุดท้ายของหน้า เนื้อหาไปขึ้นหน้าถัดไป */
test('หัวข้อไม่ตกท้ายหน้า: ตัวหนาล้วนเป็นหัวข้อติดเนื้อหาถัดไป · หัวข้อระดับ 2-3 ติดเนื้อหาเช่นกัน', async () => {
  const { mdToTypst } = await import('./template.js');
  const out = mdToTypst('ย่อหน้า\n\n**2. ปรับแผน**\n\nเนื้อหา\n\n**เหตุผล:**\n\nข้อความ **ตัวหนา** ในประโยค');
  assert.match(out, /#block\(sticky: true, above: 1\.1em, below: 0\.55em, text\(weight: 700\)\[2\. ปรับแผน\]\)/);
  assert.match(out, /#block\(sticky: true[^\n]*\[เหตุผล:\]\)/, 'หัวข้อลงท้ายด้วย : ก็นับ');
  assert.match(out, /^ข้อความ \*ตัวหนา\* ในประโยค$/m, 'ตัวหนากลางประโยคไม่ใช่หัวข้อ');
  const src = buildDocument({ book, outline, sections: [{ id: '1.1', md: 'ก' }], opts: {} });
  assert.match(src, /#show heading\.where\(level: 2\): it => block\(sticky: true,/);
  assert.match(src, /#show heading\.where\(level: 3\): it => block\(sticky: true,/);
});

/** ผู้ใช้: "สำหรับนิยาย ถ้าจบก็ให้เขียนด้วยว่า จบ … ส่วนหนังสืออื่น ๆ ให้ทำเป็นขีดกลางแนวนอน" */
test('เครื่องหมายจบเล่ม: นิยาย = "จบ" · หนังสืออื่น = ขีดแนวนอน · เล่มที่ยังเขียนไม่ครบไม่มี', () => {
  const fic = { ...book, contentMode: 'fiction' };
  const src = (b, md) => buildDocument({ book: b, outline, sections: [{ id: '1.1', md }], opts: {} });
  assert.match(src(fic, 'ฉากสุดท้าย'), /#text\(size: [\d.]+pt, weight: 600\)\[จบ\]/);
  assert.doesNotMatch(src(fic, 'ฉากสุดท้าย'), /#line\(length: 28%/);
  assert.match(src(book, 'เนื้อหา'), /#align\(center\)\[#line\(length: 28%, stroke: 0\.8pt \+ luma\(110\)\)\]/);
  assert.doesNotMatch(src(book, 'เนื้อหา'), /\[จบ\]/);
  assert.doesNotMatch(src(fic, ''), /\[จบ\]/, 'ตอนสุดท้ายยังไม่มีเนื้อหา = ยังไม่จบ');
  assert.match(buildDocument({ book: { ...fic, language: 'en' }, outline, sections: [{ id: '1.1', md: 'end' }], opts: {} }), /\[THE END\]/);
  // อยู่ก่อนส่วนท้ายเล่ม
  const s = src(fic, 'ฉากสุดท้าย');
  assert.ok(s.indexOf('[จบ]') > s.indexOf('ฉาก'));
});
