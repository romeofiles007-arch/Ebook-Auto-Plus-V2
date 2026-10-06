/**
 * ชั้นข้อความ PDF ภาษาไทย — คัดลอกจากเล่มจริงได้ "ขึ้ขึ้น", "นั้นั้น" (Typst 0.14.2 ติดข้อความพยางค์ซ้ำให้วรรณยุกต์ที่ถูกแยกวาด)
 * fixtures/thai-marks.pdf: Typst วาดคำ "นั้น กั้น ทั้ง ใช้ ใช่ เมื่อ ปลี่ยน ทำ น้ำ ที่" · ก่อนซ่อม MuPDF อ่านได้ "นั้นั้น / กั้กั้ั้น / ทั้ทั้ั้ง"
 * หลังซ่อมอ่านได้ถูกทุกคำ และหน้ากระดาษเหมือนเดิมทุกพิกเซล (ตรวจด้วย PyMuPDF ตอนพัฒนา)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fixThaiTextLayer, fixContent } from './pdf-text-fix.js';

const dec = (u8) => Buffer.from(u8).toString('latin1');

test('ชิ้นที่มีแต่ glyph กว้างศูนย์ ไม่มีข้อความซ้ำ · ชิ้นปกติไม่ถูกแตะ', () => {
  const zero = (c) => c === 5;
  const fonts = { f0: { zero, uni: new Map([[5, 'ขึ้'], [3, 'ข']]) } };
  const B = String.fromCharCode(92);
  const g = (n) => `(${B}000${B}00${n})`;
  const src = ["/f0 14 Tf", "/Span <<", "  /ActualText <FEFF0E020E360E49>", ">> BDC", `[${g(3)}] TJ`, "EMC", "/Span <<", "  /ActualText <FEFF0E020E360E49>", ">> BDC", `[9 ${g(5)}] TJ`, "EMC", `${g(5)} Tj`, `${g(3)} Tj`].join(String.fromCharCode(10));
  const { out, changed } = fixContent(src, fonts);
  assert.equal(changed, 2);
  const NL = String.fromCharCode(10);
  assert.ok(out.includes(['  /ActualText <FEFF0E020E360E49>', '>> BDC', `[${g(3)}] TJ`].join(NL)), 'ชิ้นที่มีตัวพยัญชนะคงข้อความเดิม');
  assert.ok(out.includes(['  /ActualText <FEFF>', '>> BDC', `[9 ${g(5)}] TJ`].join(NL)), 'ชิ้นวรรณยุกต์ล้วนไม่มีข้อความ');
  assert.ok(out.includes(['/Span <<', '  /ActualText <FEFF>', '>> BDC', `${g(5)} Tj`, 'EMC'].join(NL)), 'glyph กว้างศูนย์นอก ActualText ถูกครอบให้ไม่มีข้อความ');
  assert.ok(out.endsWith(['EMC', `${g(3)} Tj`].join(NL)), 'glyph ปกติไม่ถูกครอบ');
});

test('ซ่อมไฟล์จริงจาก Typst: ToUnicode ของ glyph ซ้ำว่าง · xref ถูกต้อง', async () => {
  const src = await readFile(new URL('./fixtures/thai-marks.pdf', import.meta.url));
  const { bytes, changed } = await fixThaiTextLayer(src);
  assert.ok(changed > 0);
  const s = dec(bytes);
  assert.ok(s.startsWith('%PDF-1.7'));
  assert.match(s, /<[0-9A-F]{4}> <>/, 'ToUnicode ของวรรณยุกต์ที่ติดทั้งพยางค์ถูกทำให้ว่าง');
  // xref ชี้ตรงตำแหน่งอ็อบเจกต์ทุกตัว
  const at = Number(/startxref\n(\d+)/.exec(s)[1]);
  assert.ok(s.startsWith('xref', at));
  const rows = s.slice(at).split('\n').slice(2).filter((l) => / 00000 n\r?$/.test(l));
  for (const [i, row] of rows.entries()) {
    const off = Number(row.slice(0, 10));
    assert.match(s.slice(off, off + 12), /^\d+ 0 obj\n/, `แถว ${i + 1}`);
  }
  // ซ่อมซ้ำได้ผลเท่าเดิม ไม่มีอะไรให้แก้อีก
  assert.equal((await fixThaiTextLayer(bytes)).changed, 0);
});

test('ไฟล์ที่อ่านไม่ออกคืนของเดิม ไม่ทำให้ไฟล์เสีย', async () => {
  const junk = new Uint8Array([1, 2, 3]);
  assert.equal((await fixThaiTextLayer(junk)).bytes, junk);
});

test('ส่งออก PDF ทุกทางผ่านตัวซ่อม · เอกสาร Typst ไม่มี ZWSP', async () => {
  const compiler = await readFile(new URL('./compiler.js', import.meta.url), 'utf8');
  assert.match(compiler, /const \{ bytes \} = await fixThaiTextLayer\(pdf\);/);
  const template = await readFile(new URL('./template.js', import.meta.url), 'utf8');
  assert.match(template, /\.split\(BOX_CLOSE\)\.join\('\];'\)\.split\('\u200b'\)\.join\(''\)/);
});
