/**
 * ผู้ใช้: "มันไม่คืบหน้าเลย อยู่ที่เดิม แค่กระพริบ"
 * - การ์ด "ล้มเหลว · พบกิจกรรมที่ผิดปกติ" เก่าใน project ทำให้ทุกชุด Agent หยุดทันทีว่า "โดนใหม่" แล้วงานวนเริ่มใหม่
 * - ทุกรอบเริ่มด้วยวาดภาพต้นแบบเสี่ยวเถา ("เด็กสาวอายุสิบเจ็ดปี … รูปร่างเล็กกะทัดรัด") ที่ Flow ปัดตกทุกครั้ง
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { flowPolicySafe } from './flow.js';

const adapter = await readFile(new URL('../adapter/flow.js', import.meta.url), 'utf8');
const machine = await readFile(new URL('./machine.js', import.meta.url), 'utf8');

test('Agent: นับ "กิจกรรมที่ผิดปกติ" เฉพาะที่เกิดหลังส่งคำสั่งรอบนี้', () => {
  const shown = adapter.slice(adapter.indexOf('const unusualShown = '), adapter.indexOf('\n', adapter.indexOf('const unusualShown = ')));
  assert.match(shown, /!unusualBase\.tiles\.has\(k\)/);
  assert.match(shown, /unusualCount\(\) > unusualBase\.panel/);
  const op = adapter.slice(adapter.indexOf('async function opAgentBatch('), adapter.indexOf("await sendAgentPrompt(args.brief);"));
  assert.match(op, /markUnusualBase\(\);/, 'จดของเก่าไว้ก่อนส่ง brief');
});

test('ฉบับปลอดภัย: "เด็กสาว/เด็กหนุ่ม" เป็นผู้ใหญ่ และตัดคำบรรยายรูปร่าง', () => {
  const s = flowPolicySafe('APPEARANCE: เด็กสาวอายุสิบเจ็ดปี ผมมัดมวยสองข้าง รูปร่างเล็กกะทัดรัด สวมชุดสาวใช้ · a teenage girl with a petite body · เด็กหนุ่มรับใช้', 1);
  assert.doesNotMatch(s, /เด็กสาว|เด็กหนุ่ม|อายุสิบเจ็ดปี|รูปร่าง|teenage girl|petite body/);
  assert.match(s, /หญิงสาววัยผู้ใหญ่ ผมมัดมวยสองข้าง/);
  assert.match(s, /young woman/);
  assert.match(s, /ชายหนุ่มรับใช้/);
});

test('ภาพต้นแบบตัวละครที่วาดไม่ผ่าน จำไว้ ไม่ลองซ้ำทุกรอบ (จนกว่าจะแก้คำบรรยายหรือครบ 12 ชั่วโมง)', () => {
  const cast = machine.slice(machine.indexOf('  async ensureFlowCast()'), machine.indexOf('  missingAuthorFace('));
  const skip = cast.indexOf("const castFail = this.book.imagePhase?.castFailed?.[c.name];");
  const tries = cast.indexOf('const tries = photoRef ?');
  assert.ok(skip > 0 && tries > skip, 'ตรวจก่อนลองวาด');
  assert.match(cast, /Date\.now\(\) - castFail\.at < FLOW_PLAIN_BLOCK_MS && castFail\.appearance === \(c\.appearance \|\| ''\)/);
  assert.match(cast, /lastCastError = res\.error \|\| 'วาดไม่ผ่าน';/);
  assert.match(cast, /castFailed = \{ \.\.\.\(this\.book\.imagePhase\?\.castFailed \|\| \{\}\), \[c\.name\]:/);
});
