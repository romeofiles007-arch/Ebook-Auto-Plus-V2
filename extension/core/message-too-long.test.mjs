/**
 * ลูกค้าส่งภาพหน้า ChatGPT: "ข้อความที่คุณส่งยาวเกินไป โปรดแก้ไขแล้วส่งอีกครั้ง"
 * เดิมระบบไม่รู้จักข้อความนี้ รอจนหมดเวลาแล้วหยุดทั้งเล่มด้วย "ยืนยันผลไม่ได้"
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { shrinkSourceInPrompt, sourceBlock } from './source-material.js';

globalThis.chrome ||= { runtime: { onMessage: { addListener() {} } } };
const { Machine } = await import('./machine.js');

const para = (n) => `ย่อหน้าต้นฉบับที่ ${n} เล่าเรื่องการแต่งเพลงอย่างละเอียดพอสมควร `.repeat(6);
const SOURCE = Array.from({ length: 40 }, (_, i) => para(i)).join('\n\n');
const promptWith = (text) => `ใบสั่งของตอน 1.1${sourceBlock({ sourceMaterial: text }, { stage: 'write', budget: 99999 })}รูปแบบคำตอบ <<<SEC 1.1 BEGIN>>>`;

test('ตัดเฉพาะต้นฉบับที่แนบ ตามขอบย่อหน้า ใบสั่งกับรูปแบบคำตอบอยู่ครบ', () => {
  const full = promptWith(SOURCE);
  const half = shrinkSourceInPrompt(full);
  assert.ok(half.length < full.length * 0.62 && half.length > full.length * 0.3);
  assert.ok(half.startsWith('ใบสั่งของตอน 1.1'));
  assert.ok(half.endsWith('รูปแบบคำตอบ <<<SEC 1.1 BEGIN>>>'));
  assert.match(half, /<<<จบต้นฉบับผู้ใช้>>>/);
  assert.match(half, /ถูกตัดออกจากข้อความนี้/);
  assert.equal(shrinkSourceInPrompt('คำสั่งที่ไม่มีต้นฉบับแนบ'), null);
  assert.equal(shrinkSourceInPrompt(promptWith('สั้นมาก')), null);
});

function machine(replies) {
  const m = Object.create(Machine.prototype);
  const sent = [];
  Object.assign(m, {
    book: { threadMode: 'single', job: { step: 'write' } }, logs: [],
    log(level, msg) { this.logs.push([level, msg]); },
    async turn(prompt) { sent.push(prompt); return replies.shift(); },
  });
  return { m, sent };
}
const tooLong = { status: 'error', text: '', meta: { error: 'message_too_long' } };

test('ChatGPT ไม่รับเพราะยาว → ตัดต้นฉบับแล้วส่งใหม่เอง ไม่หยุดเล่ม', async () => {
  const { m, sent } = machine([tooLong, { status: 'ok', text: 'คำตอบ' }]);
  const res = await m.turnWithRetry(promptWith(SOURCE), { label: 'สาระดิบ' });
  assert.equal(res.text, 'คำตอบ');
  assert.equal(sent.length, 2);
  assert.ok(sent[1].length < sent[0].length);
  assert.ok(m.logs.some(([, msg]) => /ตัดต้นฉบับที่แนบให้สั้นลง/.test(msg)));
});

test('ไม่มีต้นฉบับให้ตัด → หยุดทันทีพร้อมบอกสิ่งที่ต้องปรับ ไม่ส่งตัวเดิมซ้ำ', async () => {
  const { m, sent } = machine([tooLong, tooLong]);
  await assert.rejects(m.turnWithRetry('คำสั่งยาวที่ไม่มีต้นฉบับแนบ'), /ยาวเกิน.*วิธีเขียน: ทีละตอน/s);
  assert.equal(sent.length, 1);
});

test('หน้า ChatGPT: จับกล่องแดง "ยาวเกินไป" ได้ทั้งไทยและอังกฤษ และส่งรหัส message_too_long', async () => {
  const src = await readFile(new URL('../adapter/chatgpt.js', import.meta.url), 'utf8');
  const re = new Function(`return ${/const TOO_LONG = (\/.+\/i);/.exec(src)[1]}`)();
  assert.ok(re.test('ข้อความที่คุณส่งยาวเกินไป โปรดแก้ไขแล้วส่งอีกครั้ง'));
  assert.ok(re.test('The message you submitted was too long, please reload the conversation and submit something shorter.'));
  assert.ok(!re.test('เนื้อหาของบทนี้ยาวมาก'));
  assert.match(src, /error: 'message_too_long'/);
});
