/** ผู้ใช้: "บางทีกดสร้างภาพใน google flow จะเจอปุ่ม ลองใหม่อีกครั้ง ก็ให้กดลองใหม่อีกครั้งไปเลย" */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const src = await readFile(new URL('./flow.js', import.meta.url), 'utf8');
const machine = await readFile(new URL('../core/machine.js', import.meta.url), 'utf8');

test('เจอปุ่ม "ลองใหม่อีกครั้ง" บนภาพที่ล้ม = กดให้เอง (คลิกแบบคนกดจริง) ไม่เกิน 2 ครั้งต่อภาพ', () => {
  assert.match(src, /const RETRY_TEXT = \/ลองใหม่\|ลองอีกครั้ง\|try again\|retry\/i;/);
  assert.match(src, /const FLOW_RETRY_CLICKS = 2;/);
  assert.match(src, /await trustedClick\(res\.retry\);/);
  // ทั้งบน tile ที่ล้ม และในกล่องแจ้งเตือนของหน้า
  assert.match(src, /const again = canRetry && !UNUSUAL_TEXT\.test\(why\) \? retryButton\(mine\) : null;/);
  assert.match(src, /const again = canRetry && !UNUSUAL_TEXT\.test\(text\(alert\)\) \? retryButton\(alert\) : null;/);
  // จำนวนครั้งที่กดส่งกลับไปให้ Studio บันทึก
  assert.match(src, /return \{ \.\.\.\(await finishTile\(id, \{ \.\.\.args, cfg, attached, attachError \}\)\), retried \};/);
  assert.match(machine, /Flow ขึ้นปุ่ม "ลองใหม่อีกครั้ง" — กดให้แล้ว \$\{res\.retried\} ครั้ง/);
});

test('"พบกิจกรรมที่ผิดปกติ" ห้ามกดลองใหม่ — ยังหยุดทั้งคิวเหมือนเดิม', () => {
  assert.match(src, /e\.code = UNUSUAL_TEXT\.test\(why\) \? 'unusual_activity' : 'generation_failed';/);
});

/** ผู้ใช้: "เงียบ" — prompt อยู่เต็มช่องแชต แต่ไม่ถูกส่ง ค้างที่ "พิมพ์ Prompt ลงช่อง" */
test('ช่องพิมพ์ ChatGPT: เทียบข้อความแบบไม่สนเครื่องหมาย markdown · คำสั่งตัดส่วนซ้ำไม่ยก markdown มา', async () => {
  const chat = await readFile(new URL('./chatgpt.js', import.meta.url), 'utf8');
  assert.match(chat, /const norm = \(v\) => loosePrompt\(v\);/);
  assert.match(chat, /const same = \(a, b\) => a === b \|\| bare\(a\) === bare\(b\);/);
  assert.match(chat, /if \(norm\(want\) && !same\(got, want\)\) throw new Error\('composer_text_mismatch'\);/);
  assert.doesNotMatch(chat, /if \(want && got !== want\)/);
  // ตัวเทียบเดียวกับใน adapter: markdown หาย/รายการกลายเป็น <ol> ยังนับว่าตรง · วางซ้ำสองรอบไม่ตรง
  const loosePrompt = (t) => String(t || '').replace(/```[\w-]*/g, '').replace(/[^\p{L}\p{N}\p{M}]+/gu, '');
  const bare = (v) => loosePrompt(v).replace(/\p{N}/gu, '');
  const same = (a, b) => a === b || bare(a) === bare(b);
  const sent = '- **ผู้ได้รับผลกระทบโดยประมาณ: 180–240 คน**\n1. ข้อแรก\n2. ข้อสอง';
  assert.ok(same('ผู้ได้รับผลกระทบโดยประมาณ: 180–240 คน\nข้อแรก\nข้อสอง', sent));
  assert.ok(!same(sent + sent, sent));
  const { repeatInstruction } = await import('../core/repetition.js');
  const ins = repeatInstruction([{ laterText: '- **ผู้ได้รับผลกระทบ: 180 คน**', earlierText: '**ผู้ได้รับผลกระทบ: 180 คน**' }]);
  assert.doesNotMatch(ins, /\*\*/);
  assert.match(ins, /"ผู้ได้รับผลกระทบ: 180 คน"/);
});

/** ผู้ใช้: "ทำไมยังใช้ไม่ได้" (นิยาย) — ข้อความครบในช่อง แต่แถบ debugger ค้าง งานเงียบที่ขั้นพิมพ์ */
test('ขั้นพิมพ์ไม่ค้าง: ทุกคำสั่ง debugger มีเพดานเวลา · adapter เดินต่อเมื่อเห็นข้อความครบในช่อง', async () => {
  const sw = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
  const seg = sw.slice(sw.indexOf("case 'sw.forceSend'"), sw.indexOf("case 'sw.recoverTurn'"));
  assert.match(seg, /const within = \(p, ms, what\) =>/);
  assert.match(seg, /within\(\s*new Promise\(\(resolve, reject\) => \{\s*chrome\.debugger\.sendCommand/);
  assert.match(seg, /'attach',/);
  assert.match(seg, /\}\), 15000, 'focus'\);/);
  assert.match(seg, /\}\), 15000, 'verify'\);/);
  assert.match(seg, /if \(attached\) chrome\.debugger\.detach/, 'หมดเวลาแล้วยังถอด debugger เสมอ');
  const chat = await readFile(new URL('./chatgpt.js', import.meta.url), 'utf8');
  assert.match(chat, /seen = composerMatches\(text\) \? seen \+ 1 : 0;/);
  assert.match(chat, /if \(seen >= 3\) return resolve\(\{ ok: true, viaWatch: true \}\);/);
  assert.match(chat, /chrome\.runtime\.sendMessage\(\{ type: 'sw\.forceSend', text, send: false \}\),\s*watchTyped,/);
});

/** ผู้ใช้: "ทำไมภาพนิยายไม่แนบหน้าตัวละครไปด้วยหละ" */
test('Flow Agent: นับว่าแนบภาพต้นแบบครบไหม · นิยายแนบไม่ครบ = สร้างทีละรูปพร้อมภาพต้นแบบแทน', async () => {
  const flow = await readFile(new URL('./flow.js', import.meta.url), 'utf8');
  assert.match(flow, /if \(!attachError && attached < args\.refs\.length\) attachError = `แนบภาพต้นแบบได้ \$\{attached\}\/\$\{args\.refs\.length\} ภาพ`;/);
  assert.match(flow, /if \(attachError && args\.requireRefs\) \{/);
  assert.match(flow, /e\.code = 'refs_not_attached';/);
  const machine = await readFile(new URL('../core/machine.js', import.meta.url), 'utf8');
  // ทุกหน้าที่กำหนดไว้ (ตัวละคร + ผู้เขียน) — ผู้ใช้: "ต้องแนบหน้าภาพผู้เขียนที่กำหนด ตัวละครด้วย"
  assert.match(machine, /requireRefs: refs\.length > 0,/);
  // ภาพที่มีคนเกิน 4 คนที่แนบได้ในชุด Agent → สร้างทีละรูปพร้อมภาพต้นแบบครบ
  assert.ok(machine.includes('const lacking = shots.filter((s) => s.people.some((n) => used.get(n)?.ref && !onAgent.has(n)));'));
  assert.match(machine, /if \(res\.code === 'refs_not_attached'\) \{[\s\S]*?this\.agentFallback\.add\(j\.name\)/);
  assert.match(machine, /const fromAgent = pageAgent && j\.kind === 'interior' && !this\.agentFallback\?\.has\(j\.name\);/);
});
