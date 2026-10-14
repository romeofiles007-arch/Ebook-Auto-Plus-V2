import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { cleanSource } from '../core/source-material.js';

// ผู้ใช้: "ทำไมแนบไปแล้ว ไม่เห็นเกิดอะไรขึ้น" — ทุกไฟล์ที่เลือกต้องจบด้วยบรรทัดผลที่เห็นได้ ไม่ว่าอ่านได้หรือไม่
const src = await readFile(new URL('./studio.js', import.meta.url), 'utf8');
const start = src.indexOf('/** แสดงผลการอ่านไฟล์ทีละไฟล์');
const code = src.slice(start, src.indexOf("$('start')?.addEventListener('input', renderStepGuide);", start));

function fixture({ pdf, saveFails = false } = {}) {
  const el = () => ({ value: '', dataset: {}, textContent: '', children: [], classes: new Set(),
    classList: { toggle(name, on) { this.owner.classes[on ? 'add' : 'delete'](name); } },
    replaceChildren(...kids) { this.children = kids; } });
  const els = {};
  const $ = (id) => (els[id] ||= Object.assign(el(), {})) && (els[id].classList.owner = els[id]) && els[id];
  const said = [];
  const scope = { $, cleanSource, status: (t) => said.push(t), renderSourceState: () => {},
    saveSourceDraft: async () => { if (saveFails) throw new Error('ที่เก็บเต็ม'); },
    docxPlainText: async () => 'ข้อความจากเวิร์ด', pdfPlainText: pdf,
    document: { createElement: () => ({ className: '', textContent: '' }) }, DOMParser: class {} };
  vm.runInNewContext(code + '\nglobalThis.add = addSourceFiles;', scope);
  const lines = () => $('sourceResult').children.map((c) => `${c.className.split(' ')[1]}|${c.textContent}`);
  return { add: scope.add, $, lines, said };
}
const file = (name, text = '', type = '') => ({ name, type, text: async () => text });

test('อ่าน PDF ได้: ข้อความลงช่อง และมีบรรทัดผลบอกจำนวนอักษรกับจำนวนหน้า', async () => {
  const f = fixture({ pdf: async (_, { onProgress }) => { onProgress(1, 3); return { text: 'เนื้อหาจากพีดีเอฟ', pages: 3, emptyPages: 1, suspect: true }; } });
  await f.add([file('คู่มือ.pdf')]);
  assert.equal(f.$('sourceMaterial').value, 'เนื้อหาจากพีดีเอฟ');
  assert.equal(f.$('sourceMaterial').dataset.name, 'คู่มือ.pdf');
  const [ok, empty, suspect] = f.lines();
  assert.match(ok, /^ok\|✓ คู่มือ\.pdf: ได้ข้อความ 17 อักษร จาก 3 หน้า/);
  assert.match(empty, /^warn\|.*1 จาก 3 หน้าไม่มีตัวหนังสือ/);
  assert.match(suspect, /^warn\|.*ดูเพี้ยน/);
  assert.equal(f.$('sourceResult').classes.has('hidden'), false);
  assert.match(f.said.at(-1), /ใส่ต้นฉบับแล้ว 1 ไฟล์/);
});

test('อ่านไม่ได้: ช่องยังว่าง แต่เหตุผลขึ้นในกล่องผล ไม่เงียบ', async () => {
  const f = fixture({ pdf: async () => { throw new Error('PDF นี้เป็นภาพสแกน'); } });
  await f.add([file('สแกน.pdf', '', 'application/pdf'), file('เก่า.doc')]);
  assert.equal(f.$('sourceMaterial').value, '');
  assert.match(f.lines()[0], /^fail\|✕ สแกน\.pdf: PDF นี้เป็นภาพสแกน/);
  assert.match(f.lines()[1], /^fail\|✕ เก่า\.doc: ยังอ่านไฟล์ชนิดนี้ไม่ได้/);
  assert.equal(f.lines().length, 2);
  assert.equal(f.$('sourceResult').classes.has('hidden'), false);
  assert.match(f.said.at(-1), /อ่านไฟล์ต้นฉบับไม่ได้/);
});

test('หลายไฟล์ต่อท้ายของเดิม และบันทึกร่างล้มก็ยังเห็นผล', async () => {
  const f = fixture({ saveFails: true });
  f.$('sourceMaterial').value = 'ของเดิม';
  await f.add([file('ก.txt', 'หนึ่ง'), file('ข.docx')]);
  assert.equal(f.$('sourceMaterial').value, 'ของเดิม\n\n# ก\n\nหนึ่ง\n\n# ข\n\nข้อความจากเวิร์ด');
  assert.equal(f.lines().filter((l) => l.startsWith('ok|')).length, 2);
  assert.match(f.lines().at(-1), /^warn\|.*จำต้นฉบับข้ามการรีโหลดไม่สำเร็จ/);
});
