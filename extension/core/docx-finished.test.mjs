/**
 * ผู้ใช้: "ไหนส่งออกเป็น word" — ปุ่ม Word (.docx) ในแถวส่งออก = เล่มเสร็จ มีปกและภาพประกอบจริง
 * ต้นฉบับแก้ในเวิร์ด (ไม่มีภาพ มีเลขตอน) ยังทำงานเหมือนเดิม
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildDocx } from './docx.js';

const book = {
  language: 'th',
  author: 'ศศิจันทรา',
  trim: { widthMm: 148, heightMm: 210 },
  typography: { bodyFont: 'Sarabun', sizePt: 15, marginsMm: { top: 20, bottom: 20, inner: 20, outer: 15 } },
  figures: [{ name: 'fig-1.1-1.png', widthPct: 90 }],
};
const outline = { title: 'วาสนารักจอมใจ', chapters: [{ n: 1, title: 'คืนแรก', sections: [{ id: '1.1', title: 'งานวิวาห์' }] }] };
const sections = [{ id: '1.1', md: 'ย่อหน้าแรก\n\n![ซูหว่านชิงถือหนังสือหย่า](fig:fig-1.1-1.png)\n\nย่อหน้าสอง' }];
const png = (n) => ({ data: new Uint8Array([0x89, 0x50, 0x4e, 0x47, n]), ext: 'png', w: 1600, h: 900 });

const asText = async (blob) => Buffer.from(await blob.arrayBuffer()).toString('utf8');

test('เล่มเสร็จ: ปกหน้าและภาพประกอบฝังในไฟล์ · หัวข้อไม่มีเลขตอน · คำบรรยายใต้ภาพ', async () => {
  const images = new Map([['cover-front.png', { ...png(1), w: 1510, h: 2160 }], ['fig-1.1-1.png', png(2)]]);
  const z = await asText(await buildDocx({ book, outline, sections, images, finished: true }));
  assert.match(z, /word\/media\/image1\.png/);
  assert.match(z, /word\/media\/image2\.png/);
  assert.match(z, /<Relationship Id="rIdImg1" Type="[^"]+\/image" Target="media\/image1\.png"\/>/);
  assert.match(z, /<Default Extension="png" ContentType="image\/png"\/>/);
  assert.equal((z.match(/<a:blip r:embed="rIdImg\d"\/>/g) || []).length, 2);
  assert.match(z, /xmlns:wp="http:\/\/schemas\.openxmlformats\.org\/drawingml\/2006\/wordprocessingDrawing"/);
  assert.ok(z.indexOf('rIdImg1') < z.indexOf('วาสนารักจอมใจ</w:t>'), 'ปกอยู่หน้าแรกก่อนหน้าชื่อเรื่อง');
  assert.match(z, /<w:t xml:space="preserve">งานวิวาห์<\/w:t>/);
  assert.doesNotMatch(z, /1\.1 งานวิวาห์/);
  assert.match(z, /ซูหว่านชิงถือหนังสือหย่า/);
  assert.doesNotMatch(z, /พื้นที่วางภาพ/);
  // ภาพกว้าง 90% ของพื้นที่ข้อความ (148-20-15 = 113 มม.) คงสัดส่วน 16:9
  const cx = Math.round(113 * 0.9 * 36000);
  assert.match(z, new RegExp(`<wp:extent cx="${cx}" cy="${Math.round(113 * 0.9 * (900 / 1600) * 36000)}"/>`));
});

test('เล่มเสร็จที่ภาพยังไม่มีไฟล์ — ไม่มีช่องว่าง "พื้นที่วางภาพ" เหลือแค่คำบรรยาย', async () => {
  const z = await asText(await buildDocx({ book, outline, sections, images: new Map(), finished: true }));
  assert.doesNotMatch(z, /พื้นที่วางภาพ|word\/media/);
  assert.match(z, /ซูหว่านชิงถือหนังสือหย่า/);
});

test('ต้นฉบับแก้ในเวิร์ด (เดิม) — มีเลขตอน ไม่มีภาพ', async () => {
  const z = await asText(await buildDocx({ book, outline, sections }));
  assert.match(z, /1\.1 งานวิวาห์/);
  assert.match(z, /พื้นที่วางภาพ: fig-1\.1-1\.png/);
  assert.doesNotMatch(z, /word\/media|rIdImg/);
});

test('ปุ่ม Word (.docx) ในแถวส่งออก ต่อกับ exportWordBook', async () => {
  const html = await readFile(new URL('../ui/studio.html', import.meta.url), 'utf8');
  const js = await readFile(new URL('../ui/studio.js', import.meta.url), 'utf8');
  assert.match(html, /<button data-export="docx">Word \(\.docx\)<\/button>/);
  assert.match(js, /else if \(kind === 'docx'\) await X\.exportWordBook\(book, sections\);/);
  const exp = await readFile(new URL('./export.js', import.meta.url), 'utf8');
  assert.match(exp, /buildDocx\(\{ book, outline: book\.outline, sections, images, finished: true \}\)/);
});
