/**
 * งานหยุดที่ "ชี้แล้วโดน "Agent" (ขั้น: ตั้งค่า Agent)" — ช่องพิมพ์แคบเพราะแผงแชต Agent เปิดค้าง ปุ่ม Agent ทับปุ่มตั้งค่า
 * ปุ่มตั้งค่าข้าง Agent รับคลิกแบบสคริปต์ (ตรวจกับหน้าจริง พ.ย. 2026) — คลิกที่ตัวปุ่มก่อน แล้วค่อยใช้พิกัด
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const src = await readFile(new URL('./flow.js', import.meta.url), 'utf8');

test('ตั้งค่า Agent: คลิกที่ตัวปุ่มก่อน · แผงไม่เปิดค่อยคลิกด้วยพิกัด', () => {
  const body = src.slice(src.indexOf('async function configureAgent('), src.indexOf('const read = () => {', src.indexOf('async function configureAgent(')));
  const element = body.indexOf('realClick(settings);');
  const fallback = body.indexOf('await trustedClick(await waitFor(agentSettingsTrigger');
  assert.ok(element > 0, 'คลิกที่ตัวปุ่ม');
  assert.ok(fallback > element, 'ใช้พิกัดเป็นทางสำรอง');
  assert.match(body.slice(element, fallback), /waitFor\(openPanel, \{ timeout: 4000/);
});

test('แผงแชต Agent ที่เปิดค้างถูกปิดเสมอ แม้ปุ่มในช่องพิมพ์ยังนับว่ามองเห็น', () => {
  const body = src.slice(src.indexOf('async function closeAgentChat()'), src.indexOf('async function agentOff()'));
  assert.match(body, /if \(SEL\.settingsTrigger\(\) && SEL\.agentChip\(\) && !chatPanel\(\)\) return;/);
});

/** ผู้ใช้: "ทำไมถึงกดไปกดมา ไม่เห็นสร้างอะไร และทำช้ามาก" */
test('Agent ที่ตั้งไว้แล้วในหน้านี้ (สัดส่วนเดิม) ไม่ปิด-เปิด-ตั้งค่าใหม่ทุกภาพ', () => {
  const op = src.slice(src.indexOf('async function opAgentBatch('), src.indexOf('const base = await agentBaseline();'));
  const cached = op.indexOf('if (agentReady && agentReady.ratio === args.ratio && (agentOn() || chatPanel())) {');
  const configure = op.indexOf('cfg = await configure(');
  assert.ok(cached > 0 && configure > cached);
  assert.match(op, /agentReady = \{ ratio: args\.ratio, cfg \};/);
});

test('เว้นจังหวะ Agent บอกบนจอ · ภาพครบแล้วไม่ต้องรอนิ่ง 75 วินาที', () => {
  const send = src.slice(src.indexOf('async function sendAgentPrompt('), src.indexOf('async function waitAgentIdle('));
  assert.match(send, /at\(`เว้นจังหวะก่อนส่งให้ Agent อีก/);
  assert.match(src, /const AGENT_GAP_MS = 2 \* 60000;/, 'ยังเว้น 2 นาทีเท่าเดิม');
  const idle = src.slice(src.indexOf('async function waitAgentIdle('), src.indexOf('const unusualShown'));
  assert.match(idle, /quiet > 75000 \|\| \(quiet > 10000 && isDone\?\.\(\)\)/);
  assert.match(src, /waitAgentIdle\(undefined, \(\) => \[\.\.\.collectTiles\(\)\.keys\(\)\]\.filter\(\(id\) => !base\.has\(id\)\)\.length >= shots\.length\)/);
});
