/**
 * ผู้ใช้: "ลองสลับบัญชีแล้ว แต่ไม่สลับให้" — Flow เก็บบัญชีที่สองขึ้นไปไว้ใน path (/u/1/)
 * ระบบต้องใช้บัญชีที่แท็บแสดงอยู่ ไม่พากลับ project หรือหน้าแรกของบัญชีเก่า
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { flowAccount, flowHome, flowProjectId, flowPrepareTarget } from './flow-account.js';

const OLD = 'https://flow.google.com/project/07080f1f-fdf9/collection/d88a3101';
const NEW_HOME = 'https://flow.google.com/u/1/';
const NEW_PROJECT = 'https://flow.google.com/u/1/project/470479e1';

test('อ่านบัญชีจาก URL ของ Flow', () => {
  assert.equal(flowAccount(OLD), '0');
  assert.equal(flowAccount('https://flow.google.com/'), '0');
  assert.equal(flowAccount(NEW_HOME), '1');
  assert.equal(flowAccount('https://flow.google.com/u/2'), '2');
  assert.equal(flowAccount(NEW_PROJECT), '1');
  assert.equal(flowHome('0'), 'https://flow.google.com/');
  assert.equal(flowHome('1'), NEW_HOME);
  assert.equal(flowProjectId(OLD), '07080f1f-fdf9');
  assert.equal(flowProjectId(NEW_PROJECT), '470479e1');
});

test('สลับบัญชีในแท็บแล้ว — ไม่พากลับ project ของบัญชีเก่า', () => {
  assert.deepEqual(flowPrepareTarget(NEW_HOME, OLD), { go: '', switched: true }, 'อยู่หน้าแรกของบัญชีใหม่ = เปิด project ใหม่ตรงนั้น');
  assert.deepEqual(flowPrepareTarget(NEW_PROJECT, OLD), { go: NEW_HOME, switched: true }, 'อยู่ใน project อื่นของบัญชีใหม่ = กลับหน้าแรกของบัญชีใหม่ ไม่ใช่บัญชีแรก');
  assert.deepEqual(flowPrepareTarget('https://flow.google.com/project/abc', NEW_PROJECT), { go: 'https://flow.google.com/', switched: true }, 'สลับกลับบัญชีแรกก็ได้');
});

test('บัญชีเดิม — ทำแบบเดิม: ไป project ของเล่ม หรือหน้าแรกของบัญชีนั้น', () => {
  assert.deepEqual(flowPrepareTarget('https://flow.google.com/', OLD), { go: OLD, switched: false });
  assert.deepEqual(flowPrepareTarget(OLD, OLD), { go: '', switched: false });
  assert.deepEqual(flowPrepareTarget(`${NEW_PROJECT}/collection/x`, NEW_PROJECT), { go: '', switched: false });
  assert.deepEqual(flowPrepareTarget('https://flow.google.com/project/other', ''), { go: 'https://flow.google.com/', switched: false });
  assert.deepEqual(flowPrepareTarget(NEW_PROJECT, ''), { go: NEW_HOME, switched: false }, 'เล่มใหม่ในบัญชีที่สอง ต้องไม่หลุดไปบัญชีแรก');
});

test('ตอนเริ่มรอบภาพใช้แท็บ Flow ที่ผู้ใช้แตะล่าสุด และกดเริ่มเองล้างธงกิจกรรมผิดปกติ', async () => {
  const sw = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
  assert.match(sw, /flowPrepareTarget\(String\(flow\.url \|\| ''\), want\)/);
  assert.match(sw, /ensureFlowTab\(want \|\| undefined, \{ preferTouched: true \}\)/);
  assert.match(sw, /isFlowUrl\(tab\?\.url\)\) await S\.set\('flowTouchedTabId'/);
  assert.doesNotMatch(sw, /: \/\\\/project\\\/\/\.test\(here\) \? 'https:\/\/flow\.google\.com\/'/, 'ห้ามพากลับหน้าแรกของบัญชีแรกตรง ๆ');
  const studio = await readFile(new URL('../ui/studio.js', import.meta.url), 'utf8');
  const start = studio.slice(studio.indexOf('async function startPhase2()'));
  assert.match(start.slice(0, 900), /flowUnusualAt: null/);
  const machine = await readFile(new URL('./machine.js', import.meta.url), 'utf8');
  assert.match(machine, /สลับบัญชี Google ในแท็บ Flow/);
});
