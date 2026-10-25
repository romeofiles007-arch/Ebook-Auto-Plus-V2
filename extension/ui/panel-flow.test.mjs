/**
 * ผู้ใช้: "ทำหน้าเปิด flow ให้หน่อย" — แผงข้างมีแค่ปุ่มเปิด Studio กับเปิด ChatGPT
 * โหมด Flow ต้องเข้าไปดู/ล็อกอิน flow.google.com บ่อย แต่ต้องไปหาแท็บเอง
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (p) => readFile(new URL(p, import.meta.url), 'utf8');

test('แผงข้างมีปุ่มเปิด Google Flow ที่สั่ง sw.focusFlow', async () => {
  const html = await read('./panel.html');
  assert.match(html, /<button id="flow"[^>]*>เปิด Google Flow<\/button>/);
  const js = await read('./panel.js');
  assert.match(js, /\$\('flow'\)\.onclick/);
  assert.match(js, /sw\.focusFlow/);
});

test('service worker เปิด/ดึงแท็บ Flow เดิมขึ้นมา ไม่โหลดทับแท็บที่ทำงานอยู่', async () => {
  const sw = await read('../sw.js');
  const at = sw.indexOf("case 'sw.focusFlow'");
  assert.ok(at > 0, 'ต้องมีคำสั่ง sw.focusFlow');
  const body = sw.slice(at, at + 900);
  assert.match(body, /ensureFlowTab\(/);
  assert.match(body, /active: true/);
  assert.doesNotMatch(body, /tabs\.update\([^)]*url/, 'ห้ามเปลี่ยนที่อยู่แท็บ Flow ที่อาจกำลังวาดภาพอยู่');
});

test('Studio ฝากแหล่งภาพและ project Flow ของเล่มไว้ให้แผงข้าง', async () => {
  const studio = await read('./studio.js');
  assert.match(studio, /flowProjectUrl:/);
  assert.match(studio, /imageSource:/);
});
