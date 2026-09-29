/** ผู้ใช้: "กลอนที่ออกมายังไม่คล้องจองเลย ยังมั่ว" */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { rhymes, checkKlon } from './thai-rhyme.js';
import { itemBatchPrompt } from './items.js';

test('เทียบสัมผัส: สระเดียวกัน + มาตราตัวสะกดเดียวกัน', () => {
  const yes = [['มนุษย์', 'สุด'], ['กำหนด', 'ลด'], ['ใจ', 'ไป'], ['ทาง', 'สร้าง'], ['เรียน', 'เพียร'], ['เมือง', 'เรื่อง'], ['ตัว', 'กลัว'], ['จำ', 'ทำ'], ['ขอ', 'พอ'], ['เธอ', 'เจอ'], ['ชีวิต', 'คิด'], ['สวย', 'ด้วย'], ['หนาว', 'ยาว'], ['ทุกข์', 'สุข'], ['เพื่อน', 'เหมือน'], ['หมอง', 'มอง']];
  const no = [['ใจ', 'ฝัน'], ['ทาง', 'ทำ'], ['รัก', 'ลาก'], ['คิด', 'ดี'], ['เรียน', 'เรือน'], ['ดาว', 'เดา'], ['ลม', 'ลืม']];
  for (const [a, b] of yes) assert.equal(rhymes(a, b), true, `${a}/${b}`);
  for (const [a, b] of no) assert.equal(rhymes(a, b), false, `${a}/${b}`);
});

test('ตรวจกลอนแปดทั้งบท: ของสุนทรภู่ผ่าน · กลอนที่สัมผัสผิดบอกจุดได้', () => {
  const good = 'แล้วสอนว่าอย่าไว้ใจมนุษย์\nมันแสนสุดลึกล้ำเหลือกำหนด\nถึงเถาวัลย์พันเกี่ยวที่เลี้ยวลด\nก็ไม่คดเหมือนหนึ่งในน้ำใจคน';
  assert.deepEqual(checkKlon(good), { ok: true, problems: [] });
  const bad = checkKlon('ชีวิตคนเรามีขึ้นและมีลง\nบางวันก็สดใสดังดวงดาว\nบางวันก็มืดมนและเหน็บหนาว\nแต่ขอให้เธอยืนหยัดต่อไป');
  assert.equal(bad.ok, false);
  assert.equal(bad.problems.length, 2);
  assert.match(bad.problems[0], /"ลง" ท้ายวรรคสดับ ไม่มีคำสัมผัสในวรรครับ/);
  assert.match(bad.problems[1], /"หนาว" ท้ายวรรครอง ไม่มีคำสัมผัสในวรรคส่ง/);
  assert.match(checkKlon('บรรทัดเดียว').problems[0], /บทละ 4 บรรทัด/);
});

test('คำสั่งกลอนมีฉันทลักษณ์ครบ · ส่งจุดผิดกลับไปแต่งใหม่ · ตรวจทุกชุดที่เขียน', async () => {
  const p = itemBatchPrompt({ book: { itemKind: 'poem', audience: 'a', tone: 't' }, outline: { title: 'x' }, theme: { n: 1, title: 'ก' }, count: 1, requestedIds: ['1.1'],
    fix: { '1.1': { text: 'กลอนเดิม', problems: ['บทที่ 1: "ลง" ท้ายวรรคสดับ ไม่มีคำสัมผัสในวรรครับ'] } } });
  assert.match(p, /คำท้ายวรรคสดับ สัมผัสกับคำที่ 3 หรือ 5 ของวรรครับ/);
  assert.match(p, /เขียนหนึ่งบรรทัดต่อหนึ่งวรรคเสมอ/);
  assert.match(p, /แล้วสอนว่าอย่าไว้ใจมนุษย์/);
  assert.match(p, /จุดที่ผิด:\n- บทที่ 1: "ลง"/);
  assert.doesNotMatch(itemBatchPrompt({ book: { itemKind: 'quote', audience: 'a', tone: 't' }, outline: { title: 'x' }, theme: { n: 1, title: 'ก' }, count: 1, requestedIds: ['1.1'] }), /ฉันทลักษณ์ที่ต้องทำตาม/);
  const machine = await readFile(new URL('./machine.js', import.meta.url), 'utf8');
  assert.match(machine, /if \(this\.book\.itemKind === 'poem'\) \{\s*const best = new Map\(got\.map\(\(it\) => \[it\.id, \{ it, check: checkKlon\(it\.text \|\| it\.md\) \}\]\)\);/);
  assert.match(machine, /for \(let round = 1; round <= 2; round\+\+\) \{/);
});
