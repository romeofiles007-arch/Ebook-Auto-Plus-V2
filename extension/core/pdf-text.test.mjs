import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { typstPageItems } from './pdf-typst-text.js';
import { tidyThaiPdfText, pageTextFromItems, joinPdfPages, pdfPlainText, thaiTextSuspect } from './pdf-text.js';

test('ซ่อมภาษาไทยที่ PDF เก็บมาผิดรูป และไม่แตะข้อความที่ถูกอยู่แล้ว', () => {
  assert.equal(tidyThaiPdfText('นํ้าดื่ม'), 'น้ำดื่ม'); // นิคหิต + ไม้โท + สระอา
  assert.equal(tidyThaiPdfText('ทํางาน'), 'ทำงาน');
  assert.equal(tidyThaiPdfText('ท่ีนี่'), 'ที่นี่'); // วรรณยุกต์มาก่อนสระบน
  assert.equal(tidyThaiPdfText('น ้ำ และ ที ่ดิน'), 'น้ำ และ ที่ดิน');
  assert.equal(tidyThaiPdfText('ขึ้้น'), 'ขึ้น');
  assert.equal(tidyThaiPdfText('ปา พ'), 'ป้า พิ่'); // รหัสพิเศษของฟอนต์ไทยรุ่นเก่า
  const good = 'น้ำใจที่ดี ทำให้ผู้อ่านเข้าใจ — Budget 2,500 บาท (ต่อเดือน)';
  assert.equal(tidyThaiPdfText(good), good);
  assert.equal(tidyThaiPdfText(tidyThaiPdfText('นํ้า')), 'น้ำ');
});

test('ต่อชิ้นข้อความเป็นย่อหน้า: ไทยไม่เว้นวรรค อังกฤษเว้นวรรค ช่องไฟกว้างคือขึ้นย่อหน้า', () => {
  const it = (str, x, y, w = str.length * 6) => ({ str, x, y, w, h: 12 });
  const paras = pageTextFromItems([
    it('การหมักปุ๋ย', 50, 700), it('จากเศษผัก', 116, 700), // ชิดกัน = คำเดียวกัน ไม่เว้นวรรค
    it('ใช้เวลาสามสัปดาห์', 50, 684),
    it('Compost needs', 50, 640), it('air', 150, 640), // ห่างกัน = เว้นวรรค
    it('and mois-', 50, 624), it('ture.', 50, 608),
  ]);
  assert.deepEqual(paras, ['การหมักปุ๋ยจากเศษผักใช้เวลาสามสัปดาห์', 'Compost needs air and moisture.']);
});

test('รวมหน้า: ตัดเลขหน้าและหัวกระดาษที่ซ้ำ เก็บเนื้อหาไว้ครบ', () => {
  const pages = Array.from({ length: 6 }, (_, i) => ['คู่มือสวนครัว', `เนื้อหาหน้า ${i + 1} ยาวพอสมควร`, `- ${i + 1} -`]);
  const text = joinPdfPages(pages);
  assert.doesNotMatch(text, /คู่มือสวนครัว|- \d -/);
  assert.equal(text.split('\n\n').length, 6);
  // ไฟล์สั้นไม่เดาว่าบรรทัดแรกเป็นหัวกระดาษ
  assert.match(joinPdfPages([['ชื่อบท', 'เนื้อหา'], ['ชื่อบท', 'ต่อ']]), /ชื่อบท/);
});

test('จับข้อความไทยที่สระ/วรรณยุกต์หาย หรือแตกเป็นพยัญชนะโดด โดยไม่เตือนร้อยแก้วปกติ', () => {
  assert.equal(thaiTextSuspect('การหมักปุ๋ยเป็นเรื่องที่ทำได้ ใส่ parameter เดียวบน block ทุกตัว ถ้ากลับกองทุกห้าวันจะเร็วขึ้น ทีละขั้น '.repeat(12)), false);
  assert.equal(thaiTextSuspect('การหมักปุยเปนเรืองทีทำได้ เลือกหัวข้อทีชอบ แล้วเปดดู '.repeat(6)), true);
  assert.equal(thaiTextSuspect('ตั้ วเลขตั้ าย้ ตั้ ว ทาไมกลบ้ ไปเม นึ่อวานจ งย้ ากกวาการไปพื่ ร งน '.repeat(12)), true);
  assert.equal(thaiTextSuspect('Plain English text has nothing to judge here.'.repeat(20)), false);
});

test('PDF จาก Typst (เล่มที่ระบบนี้ทำเอง) อ่านกลับเป็นไทยที่สะกดถูก ไม่มีพยางค์ซ้ำ', async () => {
  // ไฟล์นี้คือ PDF ที่ยังไม่ผ่านตัวซ่อมชั้นข้อความ — โปรแกรมอ่านทั่วไปได้ "นั้นั้น / กั้กั้ั้น" และ pdf.js ได้ "นั้ นั้นั้กั้"
  const bytes = new Uint8Array(await readFile(new URL('../typeset/fixtures/thai-marks.pdf', import.meta.url)));
  const out = await pdfPlainText(bytes);
  assert.equal(out.text.replace(/\s+/g, ''), 'นั้นกั้นทั้งใช้ใช่เมื่อปลี่ยนทำน้ำที่');
  assert.equal(out.pages, 1);
  assert.equal(out.suspect, false);
  await assert.rejects(pdfPlainText(new TextEncoder().encode('ไม่ใช่ PDF')), /เปิด PDF ไม่ได้/);
});

test('ตัวอ่าน Typst: ใช้ ActualText แทนตารางแปลงอักษร ข้ามหัวกระดาษ และคืนวรรคที่ถูกวาดเป็นระยะห่าง', () => {
  // รูปอักษร 1 ถูกผูกกับ "ตั้" ทั้งที่จุดนี้ข้อความจริงคือ "ต่" — ต้องเชื่อ ActualText
  const font = { uni: new Map([[1, 'ตั้'], [2, 'อ'], [3, 'ไป']]), zero: () => false, width: () => 500 };
  const stream = `/Artifact << /Type /Pagination >> BDC
BT /f0 10 Tf 1 0 0 -1 0 0 Tm (\\000\\002) Tj ET
EMC
q 1 0 0 -1 50 700 cm BT
/Span << /ActualText <FEFF0E150E48> >> BDC /f0 10 Tf 1 0 0 -1 0 0 Tm (\\000\\001) Tj EMC
/f0 10 Tf 1 0 0 -1 5 0 Tm (\\000\\002) Tj
/f0 10 Tf 1 0 0 -1 14 0 Tm (\\000\\003) Tj
ET Q`;
  const items = typstPageItems(stream, { f0: font });
  assert.deepEqual(items.map((i) => i.str), ['ต่', 'อ', 'ไป']);
  assert.deepEqual(pageTextFromItems(items), ['ต่อ ไป']); // "อ" จบที่ x=60 ชิ้นถัดไปเริ่ม x=64 = วรรค
});
