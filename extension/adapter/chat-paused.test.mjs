/**
 * แถบ "แชตหยุดชั่วคราว" ของ ChatGPT (ผู้ใช้เจอจริง บัญชี Free):
 *   "แชตหยุดชั่วคราวจนกว่าการใช้งานจะรีเซ็ตเวลา 16:03 · คุณใช้ถึงลิมิตสำหรับแชตที่มีการวิเคราะห์ข้อมูลแล้ว
 *    เริ่มแชตใหม่แบบข้อความเท่านั้นหรืออัปเกรดเพื่อดำเนินการต่อทันที" + ปุ่ม "แชตใหม่" · ปุ่มส่งเป็นสีเทา
 * เดิมไม่มีวลีไหนตรง งานวนส่งไม่ออกแล้วหยุด ทั้งที่แชตใหม่ใช้ได้ทันที
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const adapter = await readFile(new URL('./chatgpt.js', import.meta.url), 'utf8');
const machine = await readFile(new URL('../core/machine.js', import.meta.url), 'utf8');

function detector(elements) {
  const start = adapter.indexOf('  const CHAT_PAUSED =');
  const end = adapter.indexOf('  function hitLimit()', start);
  const ctx = { $$: () => elements, S: { composer: '#prompt-textarea' }, ANY_MESSAGE: '[data-message-author-role], [data-turn-key]', getComputedStyle: () => ({ position: 'static' }) };
  vm.runInNewContext(`${adapter.slice(start, end)}\nthis.chatPausedNotice = chatPausedNotice;`, ctx);
  return ctx.chatPausedNotice();
}
const el = (innerText, inMessage = false) => ({ innerText, offsetParent: {}, closest: (sel) => (inMessage && sel.includes('message-author') ? {} : null) });

test('จับแถบภาษาไทยจริง และอ่านเวลารีเซ็ตได้', () => {
  const r = detector([el('แชตหยุดชั่วคราวจนกว่าการใช้งานจะรีเซ็ตเวลา 16:03\nคุณใช้ถึงลิมิตสำหรับแชตที่มีการวิเคราะห์ข้อมูลแล้ว เริ่มแชตใหม่แบบข้อความเท่านั้นหรืออัปเกรดเพื่อดำเนินการต่อทันที\nแชตใหม่\nกลับมาใช้ Plus')]);
  assert.ok(r);
  assert.equal(r.resetAt, '16:03');
});

test('จับแถบภาษาอังกฤษ', () => {
  assert.ok(detector([el("Chat paused until your usage resets at 4:03 PM. You've reached the limit for chats with data analysis. Start a new text-only chat or upgrade.")]));
});

test('ข้อความในบทสนทนา (เนื้อหนังสือ) ที่พูดถึงลิมิต ไม่นับ', () => {
  assert.equal(detector([el('ตัวละครพูดว่า "แชตหยุดชั่วคราว" ในบทที่ 3', true)]), null);
  assert.equal(detector([el('ข้อความธรรมดาไม่เกี่ยวกับลิมิต')]), null);
});

test('ทุกจุดก่อนส่งเช็คแถบนี้ และคืนรหัสที่เครื่องเปิดแชตใหม่ได้', () => {
  assert.match(adapter, /const pausedAtStart = chatPausedNotice\(\);\n\s+if \(pausedAtStart\) return \{ turnId, status: 'error', text: '', meta: \{ error: 'chat_paused'/);
  assert.match(adapter, /const pausedBeforeSend = chatPausedNotice\(\);/);
  // เครื่อง: เปิดแชตใหม่หนึ่งครั้ง · ยังโดนอีกคือลิมิตทั้งบัญชี หยุดพร้อมเวลา
  assert.match(machine, /if \(res\.meta\?\.error === 'chat_paused'\) \{/);
  assert.match(machine, /opts = \{ \.\.\.opts, newThread: true \};\n\s+triedNewThread = true;\n\s+noteTrouble\(\{ step: this\.job\.step, symptom: 'chat_paused'/);
  assert.match(machine, /throw new RateLimited\(/);
});
