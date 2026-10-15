import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { assertExportImages, assertPdfImagesPlaced } from './export-images.js';
import { buildDocument } from '../typeset/template.js';

const figures = [{ kind: 'image', section: '2.1', name: 'fig-2.1-1.png', caption: 'ภาพจริง', prompt: 'draw', widthPct: 80, heightMm: 69 }];
const book = { id: 'b', language: 'th', contentMode: 'prose', figureMode: 'auto', coverMode: 'none', pagePattern: 'none', figures,
  frontMatter: [], backMatter: [], trim: { widthMm: 148, heightMm: 210 },
  typography: { bodyFont: 'Sarabun', headFont: 'IBM Plex Sans Thai', sizePt: 14, lineHeight: 1.55, marginsMm: { inner: 20, outer: 16, top: 18, bottom: 20 } },
  outline: { title: 'เล่ม', chapters: [{ n: 2, title: 'บท', sections: [{ id: '2.1', title: 'ตอน' }] }] } };
const asset = (name, size = 1) => ({ name, blob: new Blob([new Uint8Array(size)]) });

test('สถานะ complete เก่าไม่อนุญาตให้ส่งออกเมื่อไฟล์จริงหาย ว่าง หรือถูกปฏิเสธ', () => {
  const b = { ...book, imagePhase: { status: 'complete' } };
  for (const assets of [[], [asset(figures[0].name, 0)]]) assert.throws(() => assertExportImages(b, assets), /fig-2.1-1.png/);
  assert.throws(() => assertExportImages({ ...b, imagePhase: { rejectedImageNames: [figures[0].name] } }, [asset(figures[0].name)]), /รอแก้ไข/);
});

test('มีไฟล์ครบแต่เครื่องหมายหาย: เติมตำแหน่งจากแผนก่อนตรวจการวางจริง', () => {
  const names = assertExportImages(book, [asset(figures[0].name)]);
  const src = buildDocument({ book, outline: book.outline, sections: [{ id: '2.1', md: 'เนื้อหาจริง\n\n![เก่า](fig:2-1-exaggeration-waiting)' }], opts: { assetNames: names } });
  assert.doesNotThrow(() => assertPdfImagesPlaced(src, names));
  assert.doesNotMatch(src, /ยังไม่ได้ใส่ภาพ:|2-1-exaggeration-waiting/);
  assert.throws(() => assertPdfImagesPlaced('ตัวหนังสืออย่างเดียว', names), /ไม่ได้วางใน PDF/);
  assert.throws(() => assertPdfImagesPlaced(`${src}\nยังไม่ได้ใส่ภาพ: stale`, names), /ช่องภาพว่าง/);
});

test('PDF ทุกเส้นทางตรวจภาพก่อนเรียกคอมไพเลอร์และดาวน์โหลด', async () => {
  const src = await readFile(new URL('./export.js', import.meta.url), 'utf8');
  for (const fn of ['exportInterior', 'exportScreen', 'exportBookPdf']) {
    const body = src.slice(src.indexOf(`export async function ${fn}(`)).split('\nexport async function ')[0];
    const assetsCheck = body.indexOf('assertExportImages('), placedCheck = body.indexOf('assertPdfImagesPlaced(');
    assert.ok(assetsCheck > 0 && placedCheck > assetsCheck && body.indexOf('await toPdf(') > placedCheck, fn);
  }
});
