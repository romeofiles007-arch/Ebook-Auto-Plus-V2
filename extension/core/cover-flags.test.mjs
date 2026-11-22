/**
 * ปกกางเต็มซ้อน (เล่ม "90 วันเดิมพันรัก" · 22 พ.ย. 2026)
 * ภาพปกหน้า/หลังของ Flow บันทึกไว้ว่า meta.textBaked = true (มีชื่อเรื่องและคำโปรยในภาพแล้ว)
 * แต่ธง book.frontCoverTextBaked / backCoverTextBaked หายไปจากตัวเล่ม → ส่งออกพิมพ์ทับซ้ำทั้งหน้าและหลัง
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

// db.js แตะ indexedDB ตอนเรียกใช้เท่านั้น — ทุกเทสต์ส่งตัวโหลดภาพของตัวเองเข้าไป
const { syncCoverTextFlags } = await import('./cover-flags.js');
const P = await import('./prompts.js');
const { resolveCoverTypography } = await import('./cover-fonts.js');

const assets = (front, back) => async (_id, name) =>
  name === 'cover-front.png' ? front : name === 'cover-back.png' ? back : null;

test('เล่ม Flow ที่ธงหาย ได้ธงคืนจากบันทึกของภาพปก', async () => {
  const book = { id: 'b1', imageSource: 'flow' };
  await syncCoverTextFlags(book, assets({ meta: { textBaked: true } }, { meta: { textBaked: true } }));
  assert.equal(book.frontCoverTextBaked, true);
  assert.equal(book.backCoverTextBaked, true);
});

test('ภาพที่บันทึกว่าไม่มีตัวหนังสือ ปักธงเป็น false ให้เครื่องเรียงพิมพ์พิมพ์ทับตามปกติ', async () => {
  const book = { id: 'b1', imageSource: 'flow', frontCoverTextBaked: true };
  await syncCoverTextFlags(book, assets({ meta: { textBaked: false } }, null));
  assert.equal(book.frontCoverTextBaked, false);
  assert.equal('backCoverTextBaked' in book, false, 'ไม่มีภาพปกหลัง = ไม่แตะธง');
});

test('ภาพเก่าที่ไม่มี textBaked หรือโหลดภาพไม่ได้ ไม่แตะธงเดิม', async () => {
  const book = { id: 'b1', imageSource: 'flow', frontCoverTextBaked: true, backCoverTextBaked: false };
  await syncCoverTextFlags(book, assets({ meta: {} }, { meta: { from: 'upload' } }));
  assert.deepEqual([book.frontCoverTextBaked, book.backCoverTextBaked], [true, false]);
  await syncCoverTextFlags(book, async () => { throw new Error('db closed'); });
  assert.deepEqual([book.frontCoverTextBaked, book.backCoverTextBaked], [true, false]);
});

test('เล่มที่ไม่ใช่ Flow ไม่ถูกแตะ (ตัดสินด้วยกติกาของโหมดนั้นตามเดิม)', async () => {
  const book = { id: 'b1', imageSource: 'chatgpt' };
  await syncCoverTextFlags(book, assets({ meta: { textBaked: true } }, { meta: { textBaked: true } }));
  assert.equal('frontCoverTextBaked' in book, false);
});

// ---------- ปกกางเต็มของจริง: coverTypst กับตัวตัดสินจริงจาก prompts.js ----------

const source = await readFile(new URL('./export.js', import.meta.url), 'utf8');
const start = source.indexOf('export function coverTypst(');
const scope = {
  frontCoverTextInImage: P.frontCoverTextInImage,
  backCoverTextInImage: P.backCoverTextInImage,
  resolveCoverTypography,
};
vm.createContext(scope);
vm.runInContext(source.slice(start, source.indexOf('\n/**', start + 1)).replace('export function', 'function'), scope);

const novel = () => ({
  id: 'b90',
  imageSource: 'flow',
  contentMode: 'fiction',
  coverMode: 'auto',
  trim: { widthMm: 148, heightMm: 210, bleedMm: 3 },
  typography: { sizePt: 16, headFont: 'Sarabun' },
  outline: { title: '90 วันเดิมพันรัก', subtitle: 'สัญญาห้ามรักกลางเกาะสายลม' },
  author: 'ศศิจันทรา',
  blurb: 'มินตรา ศิริวัฒน์ ไม่เคยคิดว่าจะต้องกลับมาทำงานให้คีริน',
  backCoverCopy: { hook: 'เก้าสิบวันห้ามรัก...แต่ใครจะห้ามหัวใจได้' },
});
const geo = { widthMm: 310.4, heightMm: 216, spineMm: 8.4, spineTextAllowed: true };
const paths = { frontPath: '/img/cover-front.png', backPath: '/img/cover-back.png' };
const overlays = (src) => ({
  blurb: src.includes(JSON.stringify(novel().blurb)),
  subtitle: src.includes(JSON.stringify(novel().outline.subtitle)),
  // ชื่อผู้เขียนเดี่ยว ๆ (ไม่นับบนสันที่มาคู่กับชื่อเรื่อง)
  author: src.includes(`[${JSON.stringify(novel().author)}]`) || new RegExp(`\\)\\[${JSON.stringify(novel().author)}`).test(src),
});

test('ก่อนแก้: ธงหาย = ปกกางเต็มพิมพ์คำโปรยและชื่อรองทับภาพที่มีตัวหนังสืออยู่แล้ว (อาการที่ผู้ใช้เห็น)', () => {
  const o = overlays(scope.coverTypst(novel(), geo, paths));
  assert.equal(o.blurb, true);
  assert.equal(o.subtitle, true);
});

test('หลังซิงก์จากบันทึกของภาพ: ไม่พิมพ์ชื่อรอง คำโปรย หรือชื่อผู้เขียนทับอีก', async () => {
  const book = novel();
  await syncCoverTextFlags(book, assets({ meta: { textBaked: true } }, { meta: { textBaked: true } }));
  const src = scope.coverTypst(book, geo, paths);
  assert.deepEqual(overlays(src), { blurb: false, subtitle: false, author: false });
  assert.match(src, /cover-front\.png/);
  assert.match(src, /cover-back\.png/);
  assert.match(src, /rotate\(-90deg/, 'สันยังมีชื่อเรื่อง · ผู้เขียนตามเดิม');
});

test('ทุกทางส่งออกที่เรียงพิมพ์ปก ซิงก์ธงก่อนเสมอ', () => {
  for (const fn of ['exportInterior', 'exportScreen', 'exportBookPdf', 'exportCover', 'exportWordBook', 'exportEpub']) {
    const at = source.indexOf(`export async function ${fn}(`);
    assert.ok(at >= 0, fn);
    const head = source.slice(at, source.indexOf('\n', source.indexOf('\n', at) + 1));
    assert.match(head, /await syncCoverTextFlags\(book\);/, `${fn} ต้องซิงก์ธงเป็นบรรทัดแรก`);
  }
});
