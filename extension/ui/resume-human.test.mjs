/**
 * ผู้ใช้: "กดทำต่อแล้วไม่ทำ" — ปุ่ม ▶ ทำต่อ ของแผงข้างเปิดแค่หน้ารายการภาพ เมื่อเล่มมีธง Flow ค้าง
 * คนกดเอง = เริ่มสร้างภาพที่เหลือ · ตัวกดทำต่อให้เองอัตโนมัติยังติดด่านเดิม
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const studio = await readFile(new URL('./studio.js', import.meta.url), 'utf8');
const body = studio.slice(studio.indexOf('async function resumeGo('), studio.indexOf('async function startNewBook('));

test('คนกดทำต่อที่ขั้นภาพ = เริ่มสร้างภาพ ก่อนด่านธง Flow', () => {
  const human = body.indexOf('if (byHuman && !hasManualImages(book)) return startPhase2();');
  const guard = body.indexOf("if (book.imageSource === 'flow' && book.imagePhase?.blockedCode)");
  assert.ok(human > 0 && guard > human, 'ตรวจคนกดก่อนด่าน blockedCode');
});

test('ปุ่มที่คนกด (แผงข้าง · การ์ดสถานะ · ท่อคุม) ส่ง byHuman · ตัวอัตโนมัติไม่ส่ง', () => {
  assert.match(studio, /state\.action === 'resume'\) return resumeGo\(\{ byHuman: true \}\)/);
  const panel = studio.slice(studio.indexOf("m.command === 'resumeJob'"), studio.indexOf('handleUiCommand(m);', studio.indexOf("m.command === 'resumeJob'")));
  assert.match(panel, /resumeGo\(\{ byHuman: true \}\)\.catch\(fail\);\n    sendResponse\(\{ok:true\}\)/);
  const watchdog = studio.slice(studio.indexOf('`กดทำต่อให้เอง ${autoContinues}'), studio.indexOf('`กดทำต่อให้เอง ${autoContinues}') + 400);
  assert.match(watchdog, /resumeGo\(\);/);
  assert.doesNotMatch(watchdog, /byHuman/);
});

test('startPhase2 ล้างธง Flow ที่ค้างก่อนเริ่ม', () => {
  const start = studio.slice(studio.indexOf('async function startPhase2()'), studio.indexOf('async function startPhase2()') + 900);
  assert.match(start, /blockedCode: null, flowUnusualAt: null/);
});

test('แก้ชื่อโครงการเปลี่ยนชื่อที่ปกใช้ด้วย (book.title)', () => {
  const fn = studio.slice(studio.indexOf('async function renameSavedProject('), studio.indexOf('async function deleteSavedProject('));
  assert.match(fn, /saved\.topic = title;/);
  assert.match(fn, /saved\.outline\.title = title;/);
  assert.match(fn, /if \('title' in saved\) saved\.title = title;/);
});

test('แก้ชื่อระหว่างงานวิ่ง — ชื่อใหม่ไปถึงสำเนาเล่มของเครื่อง ไม่ถูกบันทึกทับกลับ', () => {
  const fn = studio.slice(studio.indexOf('async function renameSavedProject('), studio.indexOf('async function deleteSavedProject('));
  assert.match(fn, /for \(const live of \[machine\?\.book, book\?\.id === id \? book : null\]\)/);
  assert.match(fn, /live\.topic = title;[\s\S]*live\.outline\.title = title;/);
});
