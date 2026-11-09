/**
 * ผู้ใช้: "คือเปิดโหมด agent จะสร้างได้" — โหมดสร้างปกติของ Flow ขึ้น "พบกิจกรรมที่ผิดปกติ" ทุกภาพ แต่ Agent ยังสร้างได้
 * ภาพต้นแบบตัวละคร/ผู้เขียน ปก และลายพื้นหลัง ต้องย้ายไปทาง Agent เอง ไม่หยุดทั้งงาน
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import * as P from './prompts.js';
import { flowPolicySafe, isFlowPolicy } from './flow.js';

const src = await readFile(new URL('./machine.js', import.meta.url), 'utf8');
const methods = src.slice(src.indexOf('  async flowMake('), src.indexOf('  async stopFlowUnusual('));
const consts = ['const FLOW_PLAIN_BLOCK_MS', 'const isFlowUnusual'].map((k) => src.slice(src.indexOf(k), src.indexOf('\n', src.indexOf(k)) + 1)).join('');

function machine(replies, imagePhase = {}) {
  const calls = [];
  const flowCall = async (op, args) => {
    calls.push({ op, args });
    const r = replies.shift();
    return typeof r === 'function' ? r(op, args) : r;
  };
  const ctx = vm.createContext({ flowCall, P, Date, flowPolicySafe, isFlowPolicy });
  vm.runInContext(`${consts}\nclass M {\n${methods}\n}\nglobalThis.M = M;`, ctx);
  const m = new ctx.M();
  m.book = { imagePhase };
  m.logs = [];
  m.log = (lvl, msg) => m.logs.push(msg);
  m.save = async () => {};
  return { m, calls };
}
const UNUSUAL = { ok: false, code: 'unusual_activity', error: 'Flow สร้างภาพไม่สำเร็จ: เราพบกิจกรรมที่ผิดปกติบางอย่าง' };
const args = { name: 'char-01', prompt: 'A 19-year-old maid, character sheet', ratio: '3:4', refs: [], models: ['m'], hires: false, reuse: true, collection: '00 ตัวละคร', refCollection: 'refs' };

test('โหมดปกติโดน "กิจกรรมที่ผิดปกติ" → วาดภาพเดียวกันผ่าน Agent แล้วดึงภาพตามรหัส', async () => {
  const { m, calls } = machine([
    UNUSUAL,
    { ok: false, code: 'not_found', error: 'ไม่พบภาพ' }, // ไม่มีภาพชื่อนี้ค้างใน project
    { ok: true, mediaIds: { 'char-01': 'media-9' } },
    { ok: true, dataUrl: 'data:image/png;base64,AA', mediaId: 'media-9' },
  ]);
  const res = await m.flowMake({ ...args }, 'ภาพต้นแบบตัวละคร ซู');
  assert.equal(res.ok, true);
  assert.equal(res.dataUrl, 'data:image/png;base64,AA');
  assert.deepEqual(calls.map((c) => c.op), ['generate', 'generate', 'agentBatch', 'generate']);
  const agent = calls[2].args;
  assert.equal(agent.shots[0].name, 'char-01');
  assert.match(agent.brief, /Create exactly ONE image/);
  assert.match(agent.brief, /A 19-year-old maid, character sheet/);
  assert.equal(agent.ratio, '3:4');
  assert.equal(calls[3].args.onlyExisting, true);
  assert.equal(calls[3].args.mediaId, 'media-9');
  assert.ok(m.book.imagePhase.flowPlainBlockedAt > 0, 'จำไว้ว่าโหมดปกติโดน');
});

test('จำได้แล้ว — ภาพถัดไปไม่ยิงโหมดปกติซ้ำ ไปทาง Agent ตรง ๆ', async () => {
  const { m, calls } = machine(
    [{ ok: true, mediaIds: { 'char-01': 'm2' } }, { ok: true, dataUrl: 'data:x' }],
    { flowPlainBlockedAt: Date.now() - 60000 },
  );
  const res = await m.flowMake({ ...args, reuse: false }, 'ปกหน้า');
  assert.equal(res.ok, true);
  assert.deepEqual(calls.map((c) => c.op), ['agentBatch', 'generate']);
});

test('ภาพที่ตั้งชื่อไว้แล้วใน project ใช้ต่อ ไม่สั่ง Agent วาดซ้ำ', async () => {
  const { m, calls } = machine([{ ok: true, dataUrl: 'data:old' }], { flowPlainBlockedAt: Date.now() });
  const res = await m.flowMake({ ...args }, 'ปกหน้า');
  assert.equal(res.dataUrl, 'data:old');
  assert.deepEqual(calls.map((c) => c.op), ['generate']);
  assert.equal(calls[0].args.onlyExisting, true);
});

test('Agent ก็โดนด้วย → คืน unusual_activity ให้ผู้เรียกหยุดงานเหมือนเดิม · โหมดปกติใช้ได้ = ไม่แตะ Agent', async () => {
  const a = machine([UNUSUAL, { ok: false, code: 'not_found' }, { ok: false, code: 'unusual_activity', error: 'Flow แจ้งว่า: เราพบกิจกรรมที่ผิดปกติบางอย่าง' }]);
  const res = await a.m.flowMake({ ...args }, 'x');
  assert.equal(res.code, 'unusual_activity');

  const b = machine([{ ok: true, dataUrl: 'data:plain' }]);
  assert.equal((await b.m.flowMake({ ...args }, 'x')).dataUrl, 'data:plain');
  assert.deepEqual(b.calls.map((c) => c.op), ['generate']);
  assert.equal(b.m.book.imagePhase.flowPlainBlockedAt, undefined);
});

test('ทุกจุดที่สร้างภาพใหม่ด้วยโหมดปกติ ผ่าน flowMake', () => {
  assert.equal((src.match(/this\.flowMake\(/g) || []).length, 3);
  assert.doesNotMatch(src, /flowCall\(\s*'generate',\s*\{\s*name,/, 'ห้ามมีการสร้างภาพตัวละครด้วยโหมดปกติตรง ๆ');
  assert.match(src, /fromAgent \? flowCall\('generate', genArgs/);
});

/** "การสร้างนี้อาจละเมิดนโยบายของเรา" — Agent ไม่วาด สั่งซ้ำก็ได้คำตอบเดิม ต้องคืนทันทีให้ไปทางสำรองถัดไป */
test('Agent ตอบ "อาจละเมิดนโยบาย" → คืน policy_blocked ทันที ไม่สั่งซ้ำ · ภาพต้นแบบตัวละครไปแบบถัดไป', async () => {
  const adapter = await readFile(new URL('../adapter/flow.js', import.meta.url), 'utf8');
  const policy = new RegExp(/policy: (\/.+\/gi),/.exec(adapter)[1].slice(1, -3), 'i');
  assert.match('การสร้างนี้อาจละเมิดนโยบายของเรา โปรดลองใช้พรอมต์อื่นหรือส่งความคิดเห็น', policy);
  assert.match('This generation might violate our policies.', policy);
  assert.doesNotMatch('Create exactly ONE image', policy);
  const loop = adapter.slice(adapter.indexOf('picks = await findAgentShots(shots, made);'));
  assert.ok(loop.indexOf("e.code = 'policy_blocked'") < loop.indexOf('await sendAgentPrompt(goInstruction(shots))'), 'ตรวจก่อนสั่ง Agent ให้เริ่มซ้ำ');

  // ภาพต้นแบบตัวละคร: ลองแบบปลอดภัยขั้น 1 อีกครั้งเดียว (ต้องมีคน — ไม่มีขั้น "ไม่มีคน")
  const POLICY = { ok: false, code: 'policy_blocked', error: 'Flow Agent ไม่รับคำขอนี้' };
  const { m, calls } = machine([POLICY, POLICY], { flowPlainBlockedAt: Date.now() });
  const res = await m.flowMake({ ...args, reuse: false }, 'ภาพต้นแบบตัวละคร ซู', { peopleOptional: false });
  assert.equal(res.code, 'policy_blocked');
  assert.deepEqual(calls.map((c) => c.op), ['agentBatch', 'agentBatch']);
  assert.match(calls[1].args.brief, /SAFE-CONTENT RULES/);
  assert.doesNotMatch(calls[1].args.brief, /NO PEOPLE AT ALL/);
  // ensureFlowCast: ไม่ใช่ "กิจกรรมผิดปกติ" = บันทึกแล้วลองแบบถัดไป (รูปถ่าย → แรงบันดาลใจ → คำบรรยายล้วน)
  const cast = src.slice(src.indexOf('  async ensureFlowCast()'), src.indexOf('  async ensureFlowCast()') + 6000);
  assert.match(cast, /const tries = photoRef \? \[photoRef, photoRef, null\] : \[null\];/);
  assert.match(cast, /continue; \/\/ รอก่อนลองแบบถัดไป/);
});

/** ผู้ใช้: "สร้างภาพละเมิดหรือเปล่า ไม่ลองทำให้ไม่ละเมิดหละ" */
test('ปกโดน "อาจละเมิดนโยบาย" → ขั้น 1 ไม่แนบรูปคน/ภาพวาด/ผู้ใหญ่ → ขั้น 2 ไม่มีคน · ได้ภาพที่ขั้นไหนหยุดตรงนั้น', async () => {
  const POLICY = { ok: false, code: 'policy_blocked', error: 'Flow Agent ไม่รับคำขอนี้: "การสร้างนี้อาจละเมิดนโยบายของเรา"' };
  const cover = {
    ...args,
    name: 'cover-front.png',
    reuse: false,
    refs: [{ name: 'char-a', dataUrl: 'data:a' }, { name: 'char-b', dataUrl: 'data:b' }],
    prompt: 'MOVIE POSTER\nTHE PERSON: a 19-year-old maid, หญิงสาวอายุสิบเก้าปี\nTHE HEROES — attached reference sheets: attached image 1 = A · attached image 2 = B.\nSTYLE: premium cinematic key-art — photographic realism with polish',
  };
  const { m, calls } = machine([POLICY, POLICY, { ok: true, mediaIds: { 'cover-front.png': 'm7' } }, { ok: true, dataUrl: 'data:safe' }], { flowPlainBlockedAt: Date.now() });
  const res = await m.flowMake(cover, 'ปกหน้า');
  assert.equal(res.dataUrl, 'data:safe');
  const briefs = calls.filter((c) => c.op === 'agentBatch');
  assert.equal(briefs.length, 3);
  assert.equal(briefs[0].args.refs.length, 2, 'รอบแรกเหมือนเดิม');
  for (const b of briefs.slice(1)) {
    assert.equal(b.args.refs.length, 0, 'ขั้นปลอดภัยไม่แนบรูปคน');
    assert.doesNotMatch(b.args.brief, /19-year-old|อายุสิบเก้าปี|photographic realism|attached reference sheets/);
    assert.match(b.args.brief, /fictional ADULT/);
  }
  assert.doesNotMatch(briefs[1].args.brief, /NO PEOPLE AT ALL/);
  assert.match(briefs[2].args.brief, /NO PEOPLE AT ALL/);
  assert.ok(m.logs.some((l) => /ได้ภาพจากคำขอแบบปลอดภัยขั้น 2/.test(l)));
});

test('isFlowPolicy แยกจาก "กิจกรรมที่ผิดปกติ" · ลูปปกเลิกส่งซ้ำเมื่อบันไดปลอดภัยไม่ผ่าน', () => {
  assert.equal(isFlowPolicy({ ok: false, code: 'policy_blocked' }), true);
  assert.equal(isFlowPolicy({ ok: false, code: 'generation_failed', error: 'Flow สร้างภาพไม่สำเร็จ: การสร้างนี้อาจละเมิดนโยบายของเรา' }), true);
  assert.equal(isFlowPolicy({ ok: false, code: 'unusual_activity', error: 'เราพบกิจกรรมที่ผิดปกติบางอย่าง' }), false);
  assert.equal(isFlowPolicy({ ok: true }), false);
  assert.match(src, /if \(!fromAgent && isFlowPolicy\(res\)\) \{[\s\S]{0,300}break;/);
});

/** ผู้ใช้: "พักอยู่นั่น ไม่สร้างสักที" — แท็บ Flow ยังวาดงานของรอบที่ถูกหยุด รอบใหม่ชน "กำลังทำงานของรูปก่อนหน้าอยู่" วนพัก 60 วินาที */
test('รอแท็บ Flow ว่างก่อนเตรียมงาน · ภาพทาง Agent ที่ตั้งชื่อไว้แล้วหยิบมาใช้', async () => {
  const body = src.slice(src.indexOf('  async imagesViaFlow('), src.indexOf('  async imagesViaFlow(') + 2500);
  assert.ok(body.indexOf('await this.waitFlowIdle();') < body.indexOf('let prep = await prepare();'));
  assert.match(body, /if \(!prep\.ok && prep\.code === 'busy'\) \{\s*await this\.waitFlowIdle\(\);\s*prep = await prepare\(\);/);
  assert.match(src, /reuseNamed: !rejected && !plain,/);

  // flowViaAgent: reuse=false แต่ reuseNamed=true → ลองหยิบภาพชื่อเดิมก่อน
  const { m, calls } = machine([{ ok: true, dataUrl: 'data:done-by-old-run' }], { flowPlainBlockedAt: Date.now() });
  const res = await m.flowMake({ ...args, name: 'page-pattern.png', reuse: false, reuseNamed: true }, 'ลายพื้นหลัง');
  assert.equal(res.dataUrl, 'data:done-by-old-run');
  assert.deepEqual(calls.map((c) => c.op), ['generate']);
  assert.equal(calls[0].args.onlyExisting, true);
});
