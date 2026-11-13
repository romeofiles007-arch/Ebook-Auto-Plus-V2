/**
 * ลูกค้าส่งภาพ: นิยายจีนโบราณหยุดที่ฉาก 5.1 — "ChatGPT ไม่รับข้อความเพราะยาวเกิน (37,205 ตัวอักษร)"
 * คำสั่งรอบนั้นมีฉากเดียว จึงไม่ใช่เพราะสั่งหลายฉาก ตัวที่โตคือ Story Bible ที่แนบไปทุกคำสั่ง
 * มันถูกจำกัดด้วยจำนวนรายการ (70 + 60 + 50 + 40 …) ไม่ใช่จำนวนตัวอักษร จึงยาวขึ้นราว 1,500–1,900 อักษรต่อฉาก
 * วัดจากเล่มจริง: 9 ฉากแรก Story Bible ยาว 15,000 อักษรแล้ว ทั้งที่คำสั่งเปล่ายาวแค่ 7,000
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as P from './prompts.js';
import * as B from './bible.js';

globalThis.chrome ||= { runtime: { onMessage: { addListener() {} } } };
const { Machine } = await import('./machine.js');

const CHAPTERS = 14;
const outline = {
  title: 'ชายาข้าคือหมอเทวดา', thesis: 'แกนเรื่อง', voice_card: 'นิยายจีนแปล',
  world_rules: Array.from({ length: 10 }, (_, i) => `กฎตั้งต้นข้อ ${i} ราชวงศ์ต้าเยวี่ยมียศขุนนางเก้าขั้นและใช้เงินตำลึง`),
  cast: Array.from({ length: 6 }, (_, i) => ({
    name: `ตัวเอก${i}`, role: 'บทบาท', want: 'สิ่งที่อยากได้', need: 'สิ่งที่ต้องเรียนรู้', fear: 'สิ่งที่กลัว',
    flaw: 'ข้อบกพร่อง', secret: 'ความลับ', appearance: `รูปลักษณ์เฉพาะตัวของคนที่ ${i} `.repeat(8),
  })),
  chapters: Array.from({ length: CHAPTERS }, (_, c) => ({
    n: c + 1, title: `บท ${c + 1}`, objective: 'หน้าที่ของบท', adds: 'สิ่งใหม่',
    sections: Array.from({ length: 5 }, (_, s) => ({
      id: `${c + 1}.${s + 1}`, title: `ฉาก ${c + 1}.${s + 1}`, quota: 2000, pov_character: 'ตัวเอก0',
      beats: ['beat หนึ่ง', 'beat สอง'], takeaways: ['ของที่ห้ามหาย'],
    })),
  })),
};
const book = {
  contentMode: 'fiction', fictionGenre: 'chinese', genreBrief: 'นิยายจีนโบราณ', fictionPov: 'third-limited',
  chineseStory: { world: 'fictional', entry: 'transmigrate', arenas: ['mansion'], tropes: ['revenge', 'doctor'], mood: 'shuang' },
  fictionEnding: 'happy', fictionRomance: 'main', tone: 't', audience: 'a', topic: 'หมอเทวดา', language: 'th',
  targetPages: 200, trim: { preset: 'a5' }, outline,
};

const item = (tag, k, len) => `${tag}#${k} `.padEnd(len, 'รายละเอียดที่โมเดลจดกลับมาหลังเขียนฉาก ');

/** จำลองเล่มที่เขียนไปแล้ว chapters บท บทละ 5 ฉาก — ทุกฉากส่ง META กลับมาเหมือนของจริง */
function grown(chapters, len = 150) {
  const bible = { ...B.emptyBible(), characters: [...outline.cast] };
  for (let c = 1; c <= chapters; c++) {
    for (let s = 1; s <= 5; s++) {
      const k = `${c}.${s}`;
      B.absorb(bible, k, {
        summary: item('สรุป', k, len),
        character_updates: [item('โน้ตตัวละคร', k, len)],
        world_facts: [1, 2, 3, 4].map((j) => item('โลก', `${k}.${j}`, len)),
        timeline: [1, 2, 3].map((j) => item('เวลา', `${k}.${j}`, len)),
        open_threads: [1, 2, 3].map((j) => item('ปม', `${k}.${j}`, len)),
        relationship_updates: [1, 2].map((j) => item('สัมพันธ์', `${k}.${j}`, len)),
      });
    }
    B.setChapterSummary(bible, c, item('สรุปบท', c, 480));
  }
  return bible;
}

const promptAt = (chapters, len) => {
  const ch = outline.chapters[chapters];
  return P.batchPrompt({
    book, outline, bible: grown(chapters, len), chapter: ch, sections: [ch.sections[0]],
    prevSummaries: ['สรุปฉากก่อน'], prevTail: 'ท้ายฉาก', nextSection: ch.sections[1], withContext: true,
  });
};

test('คำสั่งเขียนฉากไม่ยาวขึ้นตามจำนวนฉากที่เขียนไปแล้ว', () => {
  const at4 = promptAt(4);
  const at12 = promptAt(12);
  assert.ok(at4.length < 26000, `หลัง 20 ฉาก คำสั่งยาว ${at4.length}`);
  assert.ok(at12.length < 26000, `หลัง 60 ฉาก คำสั่งยาว ${at12.length}`);
  assert.ok(promptAt(12, 400).length < 26000, 'รายการยาวเป็นพิเศษก็ต้องไม่ดันคำสั่งให้เกิน');
});

test('ของที่ตัดคือของเก่า — โปรไฟล์ตัวเอก กฎตั้งต้นของโลก และรายการล่าสุดต้องอยู่ครบ', () => {
  const p = promptAt(12);
  for (const c of outline.cast) assert.ok(p.includes(`- ${c.name}: role=`), `โปรไฟล์ ${c.name} หาย`);
  assert.ok(p.includes(outline.cast[0].appearance), 'รูปลักษณ์ตัวเอกถูกตัด');
  for (const rule of outline.world_rules) assert.ok(p.includes(rule), `กฎตั้งต้นหาย: ${rule}`);
  for (const tag of ['โลก#12.5.4', 'เวลา#12.5.3', 'ปม#12.5.3', 'สัมพันธ์#12.5.2', 'โน้ตตัวละคร#12.5'])
    assert.ok(p.includes(tag), `รายการล่าสุดหาย: ${tag}`);
  for (const tag of ['โลก#1.1.1 ', 'เวลา#1.1.1 ', 'ปม#1.1.1 '])
    assert.ok(!p.includes(tag), `รายการเก่าสุดยังอยู่: ${tag}`);
  // สรุปบทคือกระดูกสันหลังของเรื่อง — ย่อได้ แต่ห้ามหายทั้งบท
  for (let n = 1; n <= 12; n++) assert.ok(p.includes(`บทที่ ${n}: สรุปบท#${n} `), `สรุปบทที่ ${n} หาย`);
  assert.match(p, /<<<SEC 13\.1 BEGIN>>>/);
});

test('เล่มที่เพิ่งเริ่ม Story Bible ยังสั้น — ไม่มีอะไรถูกตัด', () => {
  const p = promptAt(1, 90);
  for (let s = 1; s <= 5; s++) {
    for (const tag of [`โลก#1.${s}.1 `, `โลก#1.${s}.4 `, `เวลา#1.${s}.1 `, `ปม#1.${s}.3 `, `สัมพันธ์#1.${s}.2 `, `โน้ตตัวละคร#1.${s} `])
      assert.ok(p.includes(tag), `หาย: ${tag}`);
  }
  assert.ok(p.includes(item('สรุปบท', 1, 480)), 'สรุปบทต้องอยู่เต็ม');
});

test('ChatGPT ยังไม่รับ → ย่อ Story Bible ในคำสั่งลงอีกครึ่ง โดยไม่แตะตัวเอก กฎตั้งต้น ใบสั่งฉาก และรูปแบบคำตอบ', () => {
  const full = promptAt(12);
  const half = P.shrinkStoryBibleInPrompt(full);
  assert.ok(half && half.length < full.length - 3000, `ย่อได้แค่ ${full.length - (half?.length || 0)}`);
  for (const c of outline.cast) assert.ok(half.includes(`- ${c.name}: role=`));
  for (const rule of outline.world_rules) assert.ok(half.includes(rule));
  for (const tag of ['โลก#12.5.4', 'เวลา#12.5.3', 'ปม#12.5.3', 'สัมพันธ์#12.5.2']) assert.ok(half.includes(tag), tag);
  assert.ok(half.includes('ฉาก 13.1 — ฉาก 13.1'));
  assert.ok(half.endsWith(full.slice(full.indexOf('กติกาการเขียนนิยาย'))), 'กติกาและรูปแบบคำตอบต้องเหมือนเดิมทุกตัวอักษร');
  assert.equal(P.shrinkStoryBibleInPrompt('คำสั่งสารคดีที่ไม่มี Story Bible'), null);
  // ย่อซ้ำไปเรื่อย ๆ ต้องมีวันสุด ไม่วนไม่จบ
  let cur = full, rounds = 0;
  for (let next; (next = P.shrinkStoryBibleInPrompt(cur)); cur = next) assert.ok(++rounds < 12 && next.length < cur.length);
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

test('นิยายที่ ChatGPT ไม่รับเพราะยาว → ย่อ Story Bible แล้วส่งใหม่เอง ไม่หยุดเล่ม', async () => {
  const { m, sent } = machine([tooLong, tooLong, { status: 'ok', text: 'ฉากที่เขียนแล้ว' }]);
  const res = await m.turnWithRetry(promptAt(12), { label: 'เขียนฉาก' });
  assert.equal(res.text, 'ฉากที่เขียนแล้ว');
  assert.equal(sent.length, 3);
  assert.ok(sent[1].length < sent[0].length && sent[2].length < sent[1].length);
  assert.ok(m.logs.some(([, msg]) => /ย่อ Story Bible/.test(msg)));
});

test('ย่อ Story Bible จนสุดแล้วยังไม่รับ → หยุดพร้อมบอกเหตุจริง ไม่แนะให้ไปตั้งค่าที่ไม่เกี่ยว', async () => {
  const { m } = machine([tooLong, tooLong, tooLong, tooLong, tooLong]);
  await assert.rejects(m.turnWithRetry(promptAt(12)), /ยาวเกิน.*Story Bible/s);
});
