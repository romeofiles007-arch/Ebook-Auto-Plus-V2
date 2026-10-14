import test from 'node:test';
import assert from 'node:assert/strict';
import { keepFigureMarkers, healFigureMarkers, markerFor, figureNamesIn } from './figure-markers.js';
import { buildDocument } from '../typeset/template.js';

const para = (n) => `ย่อหน้าที่ ${n} อธิบายขั้นตอนการแต่งเพลงให้ผู้อ่านทำตามได้`;
const M1 = '![เลือกคีย์](fig:fig-2.1-1.png 83% 72mm)';
const M2 = '![เขียนท่อนฮุก](fig:fig-2.1-2.png 83% 72mm)';

test('ฉบับแก้ที่ทำเครื่องหมายภาพหาย ได้เครื่องหมายคืนตำแหน่งสัดส่วนเดิม', () => {
  const old = [para(1), M1, para(2), para(3), M2, para(4)].join('\n\n');
  const rewritten = [para('ก'), para('ข'), para('ค'), para('ง')].join('\n\n');
  const kept = keepFigureMarkers(old, rewritten);
  assert.deepEqual(kept.restored, ['fig-2.1-1.png', 'fig-2.1-2.png']);
  const parts = kept.md.split('\n\n');
  assert.equal(parts.length, 6);
  assert.equal(parts[0], para('ก')); // ไม่วางก่อนย่อหน้าแรก
  assert.ok(parts.indexOf(M1) < parts.indexOf(M2));
  assert.deepEqual([...figureNamesIn(kept.md)], ['fig-2.1-1.png', 'fig-2.1-2.png']);
});

test('ฉบับแก้ที่ยังมีเครื่องหมายครบ ไม่ถูกแตะ และรูปที่ยังอยู่ไม่ถูกวางซ้ำ', () => {
  const old = [para(1), M1, para(2), M2].join('\n\n');
  const same = [para('ก'), M1, para('ข'), M2].join('\n\n');
  assert.deepEqual(keepFigureMarkers(old, same), { md: same, restored: [] });
  const half = keepFigureMarkers(old, [para('ก'), M2, para('ข')].join('\n\n'));
  assert.deepEqual(half.restored, ['fig-2.1-1.png']);
  assert.equal(half.md.split(M2).length, 2);
});

test('ภาพในแผนที่ไม่มีเครื่องหมายในเนื้อหา ถูกวางคืนกระจายทั้งตอน', () => {
  const figs = [1, 2, 3].map((n) => ({ kind: 'image', name: `fig-2.1-${n}.png`, caption: `ภาพ ${n}`, widthPct: 83, heightMm: 72 }));
  assert.equal(markerFor(figs[0]), '![ภาพ 1](fig:fig-2.1-1.png 83% 72mm)');
  const md = [1, 2, 3, 4, 5, 6].map(para).join('\n\n');
  const healed = healFigureMarkers(md, figs);
  assert.deepEqual(healed.restored, figs.map((f) => f.name));
  const at = figs.map((f) => healed.md.split('\n\n').indexOf(markerFor(f)));
  assert.ok(at[0] >= 1 && at[0] < at[1] && at[1] < at[2]);
  assert.ok(at[1] - at[0] > 1); // ไม่กองติดกัน
  assert.deepEqual(healFigureMarkers(healed.md, figs).restored, []); // เรียกซ้ำไม่วางซ้ำ
  assert.deepEqual(healFigureMarkers('', figs), { md: '', restored: [] });
});

/**
 * เล่ม "แต่งเพลง": เครื่องหมายของตอน 2.1 อยู่ครบ แต่ตัวเรียงพิมพ์อ่านไม่ออก งานหยุดซ้ำแม้กดทำต่อ
 * สามแบบที่ทำให้อ่านไม่ออก: คำบรรยายมีวงเล็บเหลี่ยม · คำบรรยายขึ้นบรรทัดใหม่ · ความกว้างเป็นทศนิยม
 */
test('เครื่องหมายที่อยู่ครบแต่เคยอ่านไม่ออก ถูกวางเป็นภาพทั้งสามแบบ', () => {
  const figures = [
    { kind: 'image', section: '2.1', name: 'fig-2.1-1.png', caption: 'โครงสร้าง [Verse] [Chorus]', widthPct: 83, heightMm: 72 },
    { kind: 'image', section: '2.1', name: 'fig-2.1-2.png', caption: 'ท่อนฮุก\nแปดห้อง', widthPct: 83, heightMm: 72 },
    { kind: 'image', section: '2.1', name: 'fig-2.1-3.png', caption: 'คอร์ดหลัก', widthPct: 66.7, heightMm: 56.3 },
  ];
  const md = [para(1),
    '![โครงสร้าง [Verse] [Chorus]](fig:fig-2.1-1.png 83% 72mm)', para(2),
    '![ท่อนฮุก\nแปดห้อง](fig:fig-2.1-2.png 83% 72mm)', para(3),
    '![คอร์ดหลัก](fig:fig-2.1-3.png 66.7% 56.3mm)', para(4)].join('\n\n');
  const book = { language: 'th', contentMode: 'prose', figures, frontMatter: ['title'], backMatter: [], topic: 'แต่งเพลง',
    trim: { widthMm: 148, heightMm: 210, bleedMm: 3 },
    typography: { bodyFont: 'Sarabun', headFont: 'IBM Plex Sans Thai', sizePt: 14, lineHeight: 1.55, marginsMm: { inner: 20, outer: 16, top: 18, bottom: 20 } } };
  const outline = { title: 'แต่งเพลง', chapters: [{ n: 2, title: 'ลงมือ', sections: [{ id: '2.1', title: 'เริ่มจากท่อนฮุก' }] }] };
  const src = buildDocument({ book, outline, sections: [{ id: '2.1', md }], opts: { assetNames: figures.map((f) => f.name) } });
  for (const f of figures) assert.equal(src.split(`image("/img/${f.name}"`).length, 2, `${f.name} ต้องถูกวางหนึ่งครั้ง`);
  assert.doesNotMatch(src, /\(fig:/); // ไม่มีเครื่องหมายดิบหลุดไปเป็นข้อความในหน้า
  // ซ่อมเฉพาะที่เสียรูป: เครื่องหมายขึ้นบรรทัดใหม่ถูกเขียนใหม่ ณ ที่เดิม ที่เหลือไม่ถูกแตะ
  const healed = healFigureMarkers(md, figures);
  assert.deepEqual(healed.restored, ['fig-2.1-2.png']);
  assert.equal(healed.md.split('\n\n')[3], '![ท่อนฮุก แปดห้อง](fig:fig-2.1-2.png 83% 72mm)');
  assert.equal(markerFor(figures[2]), '![คอร์ดหลัก](fig:fig-2.1-3.png 67% 56.3mm)');
});

test('เรียงพิมพ์: ภาพที่มีไฟล์แล้วแต่เครื่องหมายหาย ถูกวางลงเล่ม ไม่หยุดงานด้วย "ไม่ถูกวางใน PDF"', () => {
  const figures = [1, 2, 3].map((n) => ({ kind: 'image', section: '2.1', name: `fig-2.1-${n}.png`, caption: `ภาพ ${n}`, widthPct: 83, heightMm: 72 }));
  const book = { language: 'th', contentMode: 'prose', figures, frontMatter: ['title'], backMatter: [], topic: 'แต่งเพลง',
    trim: { widthMm: 148, heightMm: 210, bleedMm: 3 },
    typography: { bodyFont: 'Sarabun', headFont: 'IBM Plex Sans Thai', sizePt: 14, lineHeight: 1.55, marginsMm: { inner: 20, outer: 16, top: 18, bottom: 20 } } };
  const outline = { title: 'แต่งเพลง', chapters: [{ n: 2, title: 'ลงมือ', sections: [{ id: '2.1', title: 'เริ่มจากท่อนฮุก' }] }] };
  const sections = [{ id: '2.1', md: [1, 2, 3, 4].map(para).join('\n\n') }];
  const src = buildDocument({ book, outline, sections, opts: { assetNames: figures.map((f) => f.name) } });
  for (const f of figures) assert.ok(src.includes(`image("/img/${f.name}"`), f.name);
});

test('PDF · DOCX · EPUB ใช้ตัวอ่านเครื่องหมายภาพตัวเดียวกัน และซ่อมก่อนประกอบเล่มทุกแบบ', async () => {
  const { readFile } = await import('node:fs/promises');
  const { mdToHtml } = await import('./md-html.js');
  const src = (p) => readFile(new URL(p, import.meta.url), 'utf8');
  // ห้ามมีใครคัดลอกแบบของเครื่องหมายไปเขียนเองอีก — DOCX เคยใช้แบบเก่าจนภาพหายเฉพาะไฟล์ Word
  for (const file of ['../typeset/template.js', './docx.js', './md-html.js', './export.js']) {
    assert.ok(!(await src(file)).includes('\\(fig:([A-Za-z0-9'), `${file} ต้องใช้ FIG_RE จาก figure-markers.js`);
  }
  for (const file of ['../typeset/template.js', './docx.js', './export.js']) assert.match(await src(file), /withFigureMarkers\(book, s\.id,/);
  const html = mdToHtml('![โครงสร้าง [Verse] [Chorus]](fig:fig-2.1-1.png 83% 72mm)', { figure: ({ name }) => `<img src="${name}">` });
  assert.match(html, /fig-2\.1-1\.png/);
  assert.doesNotMatch(html, /\(fig:/);
});
