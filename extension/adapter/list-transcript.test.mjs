/**
 * ต.ค. 2026 (15): หน้าแชตรุ่นใหม่ — ol[data-conversation-transcript] > li[data-message-role="user|assistant"]
 * ผู้ใช้เจอ "ส่งแล้วจับข้อความที่ส่งไม่ได้" และ "คำตอบยาว 0 ตัวอักษร" สามรอบติดจนวางสารบัญไม่ได้
 * ตรวจกับหน้าจริง (chatgpt.com ไม่ล็อกอิน): ตัวเลือกเดิมทุกตัวได้ 0 · ในกล่องข้อความมีหัวซ่อน "You said:" นำหน้า
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('./chatgpt.js', import.meta.url), 'utf8');
const fn = (name) => { const start = source.indexOf(`function ${name}(`); return source.slice(start, source.indexOf('\n  }', start) + 4); };

test('ตัวเลือกข้อความ คำตอบ และขอบเทิร์น รู้จักหน้าแบบรายการ โดยยังเก็บแบบเดิมไว้', () => {
  assert.match(source, /const USER_TURN = '[^']*li\[data-message-role="user"\]'/);
  assert.match(source, /const ANY_MESSAGE = '[^']*li\[data-message-role\]'/);
  assert.match(source, /const TURN_EDGE = '[^']*li\[data-message-role\]'/);
  assert.match(source, /assistantTurn: '[^']*\[data-message-author-role="assistant"\][^']*li\[data-message-role="assistant"\]'/);
  // ค่าที่ผู้ใช้เคยบันทึกไว้ (ไม่มีตัวเลือกใหม่) ต้องถูกแทนด้วยค่าตั้งต้น
  assert.match(source, /!\/data-message-role\/\.test\(S\.assistantTurn/);
});

test('หัวซ่อน "You said:" / "ChatGPT said:" ถูกตัดก่อนเทียบใบเสร็จและก่อนอ่านคำตอบ', () => {
  const ctx = vm.createContext({});
  vm.runInContext(`${fn('withoutAttribution')}\nglobalThis.strip = withoutAttribution;`, ctx);
  const node = (label, body) => ({
    innerText: `${label}\n\n${body}`,
    querySelector: (s) => (s === 'h4[data-message-attribution]' && label ? { innerText: label } : null),
  });
  assert.equal(ctx.strip(node('You said:', 'คุณคือบรรณาธิการ')).trim(), 'คุณคือบรรณาธิการ');
  assert.equal(ctx.strip(node('ChatGPT said:', '{"a":1}')).trim(), '{"a":1}');
  assert.equal(ctx.strip(node('', 'ข้อความแบบเดิมไม่มีหัว')).trim(), 'ข้อความแบบเดิมไม่มีหัว');
  assert.match(source, /return \{ text: withoutAttribution\(turn\)\.trim\(\), blocks: 0 \}/);
});

test('คำตอบแบบรายการ: ป้าย data-message-complete คือจบแล้ว · ห้ามไต่ไปหยิบปุ่มของคำตอบอื่นในรายการ', () => {
  const body = fn('actionBarFor');
  assert.match(body, /turn\.matches\?\.\(LIST_ANSWER\)/);
  assert.match(body, /if \(turn\.hasAttribute\('data-message-complete'\)\) return turn;/);
  assert.match(body, /copy response\|คัดลอกคำตอบ/);
  assert.match(body, /break; \/\/ ห้ามไต่ออกไปหาปุ่มในรายการ/);
});
