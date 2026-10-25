/**
 * ลูกค้า (โหมด Gemini + Flow): "ข้อความเมนูทุกอย่างเป็น chatgpt ทั้งหมดเลยครับ" — เข้าใจว่าระบบสั่งผิดเว็บ
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { siteLabel, chatSiteName, writesWithGemini } from './site-label.js';

const gemini = { textSource: 'gemini', imageSource: 'flow' };

test('โหมด Gemini + Flow: ข้อความบนจอบอก Gemini ไม่ใช่ ChatGPT', () => {
  assert.equal(siteLabel('รอคำตอบจาก ChatGPT 6 วินาที', gemini), 'รอคำตอบจาก Gemini 6 วินาที');
  assert.equal(siteLabel('กำลังใส่ Prompt ลงใน ChatGPT · ChatGPT ตอบแล้ว', gemini), 'กำลังใส่ Prompt ลงใน Gemini · Gemini ตอบแล้ว');
  assert.equal(chatSiteName(gemini), 'Gemini');
});

test('โหมด ChatGPT และ API ไม่เปลี่ยนข้อความ', () => {
  assert.equal(siteLabel('รอคำตอบจาก ChatGPT', { textSource: 'web', imageSource: 'flow' }), 'รอคำตอบจาก ChatGPT');
  assert.equal(siteLabel('รอคำตอบจาก ChatGPT', { textSource: 'api', imageSource: 'api' }), 'รอคำตอบจาก ChatGPT');
  assert.equal(chatSiteName({ textSource: 'web' }), 'ChatGPT');
});

test('Gemini เขียน แต่ภาพยังวาดใน ChatGPT — คำว่า ChatGPT ถูกอยู่แล้ว ไม่เปลี่ยน', () => {
  assert.equal(writesWithGemini({ textSource: 'gemini', imageSource: 'web' }), false);
  assert.equal(siteLabel('สร้างภาพใน ChatGPT', { textSource: 'gemini' }), 'สร้างภาพใน ChatGPT');
});

test('ค่าว่างผ่านได้ไม่พัง', () => {
  assert.equal(siteLabel(null, gemini), null);
  assert.equal(siteLabel('', gemini), '');
});

test('Studio และแผงข้างใช้ตัวเปลี่ยนชื่อที่จุดแสดงผลหลัก', async () => {
  const studio = await readFile(new URL('./studio.js', import.meta.url), 'utf8');
  for (const sink of ['function publishActivity', 'function addEvent', 'function runState', 'const status = ']) {
    const at = studio.indexOf(sink);
    assert.ok(at >= 0, sink);
    assert.match(studio.slice(at, at + 900), /brand\(/, `${sink} ต้องผ่าน brand()`);
  }
  const panel = await readFile(new URL('./panel.js', import.meta.url), 'utf8');
  assert.match(panel, /chatSite/);
});
