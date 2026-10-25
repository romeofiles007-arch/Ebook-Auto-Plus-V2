/**
 * เจอจริง (Gemini + Flow · ขั้นเขียนเนื้อหา): Gemini เขียนตอนยาวในกล่องโค้ด Markdown ช้ากว่า 5 นาที
 * ปุ่มหยุดยังขึ้นและข้อความยังงอกอยู่ แต่ตัวรอคำตอบตัดจบที่ 5 นาทีพอดี → outcome_unknown → งานหยุดทุกตอน
 * ต้องรอต่อตราบที่ยังพิมพ์อยู่จริง (ปุ่มหยุดขึ้น + ข้อความเพิ่งเปลี่ยน) และยังมีเพดานรวมกันค้างถาวร
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const src = await readFile(new URL('./gemini.js', import.meta.url), 'utf8');
const start = src.indexOf('const ANSWER_HARD_CAP_MS');
const end = src.indexOf('\n  }\n', src.indexOf('function answerTimedOut')) + 4;
assert.ok(start > 0 && end > start, 'answerTimedOut must exist in adapter/gemini.js');
const ctx = {};
vm.runInNewContext(`${src.slice(start, end)}\nthis.answerTimedOut = answerTimedOut;`, ctx);
const { answerTimedOut } = ctx;

const MIN = 60000;
const base = { t0: 0, timeoutMs: 5 * MIN };

test('ยังไม่ถึง 5 นาที ไม่ตัดจบ', () => {
  assert.equal(answerTimedOut({ ...base, now: 4 * MIN, stableSince: 0, busy: false }), false);
});

test('เกิน 5 นาทีแต่ Gemini ยังพิมพ์อยู่และข้อความเพิ่งงอก — รอต่อ', () => {
  assert.equal(answerTimedOut({ ...base, now: 7 * MIN, stableSince: 7 * MIN - 5000, busy: true }), false);
});

test('เกิน 5 นาที ปุ่มหยุดยังขึ้นแต่ข้อความนิ่งเกิน 2 นาที — ตัดจบ', () => {
  assert.equal(answerTimedOut({ ...base, now: 9 * MIN, stableSince: 6 * MIN, busy: true }), true);
});

test('เกิน 5 นาทีและไม่ได้พิมพ์อยู่ — ตัดจบตามเดิม', () => {
  assert.equal(answerTimedOut({ ...base, now: 6 * MIN, stableSince: 6 * MIN - 1000, busy: false }), true);
});

test('ยังพิมพ์อยู่ก็ไม่รอเกินเพดานรวม 20 นาที', () => {
  assert.equal(answerTimedOut({ ...base, now: 21 * MIN, stableSince: 21 * MIN - 1000, busy: true }), true);
});
