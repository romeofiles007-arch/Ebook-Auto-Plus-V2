import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { findRepeats, repeatInstruction } from './repetition.js';
import { stripEchoedHeading, cleanEpigraph } from './extract.js';
import { sectionEndingNote, rewritePrompt, batchPrompt } from './prompts.js';
import { buildDocument } from '../typeset/template.js';

const CRITERIA = 'ให้ใส่เกณฑ์จากตอน 3.2 ไว้ในช่อง จุดเปลี่ยน โดยระบุว่า หากมีไข้นานเกิน 4 วัน หรือมีอาการนานเกิน 10 วันโดยไม่ดีขึ้น ให้ติดต่อบุคลากรทางการแพทย์';
const FIRST = '- **จุดเปลี่ยน** — ทำช่องเตือนไว้สำหรับระบุว่าเมื่อใดพบสัญญาณอันตราย หรือเมื่อมีไข้นานเกิน 4 วัน อาการนานเกิน 10 วันโดยไม่ดีขึ้น หรืออาการแย่ลงจนควรขอการประเมินทางการแพทย์';

test('จับย่อหน้าที่เล่าเกณฑ์เดิมซ้ำด้วยถ้อยคำใหม่ (คู่มือรับมือหวัด บทที่ 4)', () => {
  const md = [FIRST, 'ตัวอย่างต่อไปนี้เป็นข้อมูลสมมติ เพื่อแสดงวิธีกรอกแบบบันทึก ไม่ใช่ข้อมูลจากผู้ป่วยจริง', CRITERIA].join('\n\n');
  const r = findRepeats(md);
  assert.equal(r.length, 1);
  assert.equal(r[0].later, 2);
  assert.equal(r[0].earlier, 0);
  assert.match(repeatInstruction(r), /ตัดส่วนที่ซ้ำ/);
});

test('ย่อหน้าต่างเรื่องกัน หัวข้อ และตาราง ไม่ถูกนับว่าซ้ำ', () => {
  const md = [
    'การนอนพักช่วยให้ร่างกายฟื้นตัว ควรดื่มน้ำให้เพียงพอตลอดวัน',
    'การล้างมือบ่อยช่วยลดการแพร่เชื้อ โดยเฉพาะหลังไอหรือจาม',
    '## การนอนพักช่วยให้ร่างกายฟื้นตัว ควรดื่มน้ำให้เพียงพอตลอดวัน',
    '| a | b |\n|---|---|\n| การนอนพักช่วยให้ร่างกายฟื้นตัว ควรดื่มน้ำให้เพียงพอ | x |',
  ].join('\n\n');
  assert.deepEqual(findRepeats(md), []);
});

test('rewrite ไม่เก็บฉบับที่ซ้ำเพิ่ม · มีขั้นตัดส่วนซ้ำหลังขยายตอน', () => {
  const src = fs.readFileSync(new URL('./machine.js', import.meta.url), 'utf8');
  assert.match(src, /mustReduceRepeats \? newRepeats >= oldRepeats : newRepeats > oldRepeats/);
  assert.match(src, /await this\.growShortSections\(all\);\n\s+await this\.fixRepeatedSections\(\);/);
});

test('หัวข้อทวน "ตอน 3.2 ..." ถูกตัด แม้เป็นบรรทัดธรรมดา', () => {
  const s = { id: '3.2', title: 'วันที่ 4–5: ดูต่อหรือประเมินใหม่?' };
  assert.equal(stripEchoedHeading('ตอน 3.2 วันที่ 4–5: ดูต่อหรือประเมินใหม่?\n\nเนื้อหา', s), 'เนื้อหา');
  assert.equal(stripEchoedHeading('### ตอนที่ 3.2 วันที่ 4–5: ดูต่อหรือประเมินใหม่?\nเนื้อหา', s), 'เนื้อหา');
  const keep = 'ตอน 3.2 บอกไว้แล้วว่าให้ดูอาการต่อ\n\nเนื้อหา';
  assert.equal(stripEchoedHeading(keep, s), keep);
});

test('คำคมเปิดบทที่มีเศษลิงก์ถือว่าเสีย', () => {
  assert.equal(cleanEpigraph('ได้]()าง ไร'), '');
  assert.equal(cleanEpigraph('[ดู](https://x.y)'), '');
  assert.equal(cleanEpigraph('“ร่างกายรู้ก่อนเราเสมอ”'), 'ร่างกายรู้ก่อนเราเสมอ');
});

const outline = {
  title: 'คู่มือ', thesis: 't',
  chapters: [
    { n: 1, title: 'ก', sections: [{ id: '1.1', title: 'a' }, { id: '1.2', title: 'b' }] },
    { n: 2, title: 'ข', sections: [{ id: '2.1', title: 'c' }, { id: '2.2', title: 'd' }] },
  ],
};

test('ตอนสุดท้ายของบทและของเล่มได้คำสั่งปิดท้าย', () => {
  assert.equal(sectionEndingNote(outline, [{ id: '1.1' }]), '');
  assert.match(sectionEndingNote(outline, [{ id: '1.2' }]), /ตอนสุดท้ายของบทที่ 1/);
  assert.match(sectionEndingNote(outline, [{ id: '2.2' }]), /ตอนสุดท้ายของทั้งเล่ม/);
  const book = { language: 'th', outline, audience: 'x', tone: 'x' };
  assert.match(rewritePrompt({ book, section: { id: '2.2', title: 'd', chars: 100 }, currentText: 'x', targetChars: 200 }), /ตอนสุดท้ายของทั้งเล่ม/);
  const chapter = { ...outline.chapters[1], objective: 'o' };
  const p = batchPrompt({ book, outline, bible: {}, chapter, sections: [{ id: '2.2', title: 'd', quota: 1000 }], withContext: true });
  assert.match(p, /ตอนสุดท้ายของทั้งเล่ม/);
});

test('ตารางแบบหนังสือ: ตัดคอลัมน์ว่าง มีเส้นหัวตาราง ไม่มีกรอบข้าง', () => {
  const md = '| วัน | อาการ | ยา |\n|---|---|---|\n| Day 1 | คัดจมูก | — |\n| Day 2 | ไอ | - |';
  const book = {
    id: 't', language: 'th', contentMode: 'prose',
    trim: { preset: 'a5', widthMm: 148, heightMm: 210 },
    typography: { bodyFont: 'Sarabun', headFont: 'IBM Plex Sans Thai', sizePt: 15, lineHeight: 1.6, marginsMm: { inner: 18, outer: 14, top: 16, bottom: 18 } },
    frontMatter: [], backMatter: [],
  };
  const src = buildDocument({ book, outline: { title: 'x', chapters: [{ n: 1, title: 'ก', sections: [{ id: '1.1', title: 'a' }] }] }, sections: [{ id: '1.1', md }], opts: {} });
  assert.match(src, /table\.header\(/);
  assert.match(src, /table\.hline\(stroke: 1\.2pt/);
  assert.doesNotMatch(src, /\[ยา\]/);
});
