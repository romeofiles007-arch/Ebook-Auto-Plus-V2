/**
 * นิยายจีนโบราณ — แนวใหม่ในโหมดนิยาย
 * คลังข้อมูลต้องไปถึงทุกขั้นของแนวนี้ และต้องไม่โผล่ในแนวอื่นเลย
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as P from './prompts.js';
import * as B from './bible.js';
import * as C from './chinese-ancient.js';
import { flowGenreFor } from './flow-genres.js';

const outline = {
  title: 'ชายาข้าคือหมอเทวดา', thesis: 'แกน', voice_card: 'นิยายจีนแปล', world_rules: ['ราชวงศ์ต้าเยวี่ย'],
  cast: [{ name: 'ซูหว่านชิง', role: 'นางเอก' }],
  chapters: [{ n: 1, title: 'ตื่นในจวน', objective: 'เริ่ม', sections: [{ id: '1.1', title: 'ฟื้น', quota: 2000, pov_character: 'ซูหว่านชิง', beats: ['ฟื้น'], takeaways: ['แผลที่หน้าผาก'] }] }],
};
const story = { world: 'fictional', entry: 'transmigrate', arenas: ['mansion'], tropes: ['revenge', 'doctor'], mood: 'shuang' };
const book = (over = {}) => ({
  contentMode: 'fiction', fictionGenre: 'chinese', chineseStory: story, genreBrief: 'นิยายจีนโบราณ', fictionPov: 'third-limited',
  fictionEnding: 'happy', fictionRomance: 'main', tone: 't', audience: 'a', topic: 'หมอเทวดา', language: 'th', targetPages: 120,
  trim: { preset: 'a5' }, outline, bible: { ...B.emptyBible(), characters: outline.cast }, ...over,
});
const ch = outline.chapters[0];
const sec = ch.sections[0];
const KIT = 'คลังข้อมูลโลกที่ต้องใช้ให้สม่ำเสมอ';
const SCENE = 'ภาษาและยุคสมัย (ห้ามหลุดในทุกฉาก)';

test('ทุกสูตรยอดนิยมใช้คีย์ที่มีอยู่จริง และไม่เกินเพดาน', () => {
  for (const r of C.CN_POPULAR) {
    const n = C.normalizeChineseStory(r);
    assert.equal(n.world, r.world, r.name);
    assert.equal(n.entry, r.entry, r.name);
    assert.equal(n.mood, r.mood, r.name);
    assert.deepEqual(n.arenas, r.arenas, r.name);
    assert.deepEqual(n.tropes, r.tropes, r.name);
  }
});

test('ค่าที่ขาดหรือเพี้ยนได้สูตรที่ใช้ได้เสมอ และตัดส่วนเกินเพดาน', () => {
  assert.deepEqual(C.normalizeChineseStory(null), { world: 'fictional', entry: 'transmigrate', arenas: ['mansion'], tropes: [], mood: 'sweet' });
  const n = C.normalizeChineseStory({ world: 'mars', arenas: ['palace', 'farming', 'war', 'x'], tropes: ['a', 'revenge', 'doctor', 'space', 'mind', 'cook', 'revenge'] });
  assert.equal(n.world, 'fictional');
  assert.deepEqual(n.arenas, ['palace', 'farming']);
  assert.deepEqual(n.tropes, ['revenge', 'doctor', 'space', 'mind']);
});

test('สุ่มชุดยอดนิยมได้ชื่อชุดและสูตรที่ใช้ได้', () => {
  const first = C.randomPopular(() => 0);
  assert.equal(first.name, C.CN_POPULAR[0].name);
  const last = C.randomPopular(() => 0.9999);
  assert.equal(last.name, C.CN_POPULAR.at(-1).name);
});

test('คู่ที่ชนกันถูกเตือน คู่ปกติไม่เตือน', () => {
  assert.ok(C.chineseClashes({ arenas: ['farming', 'palace'] }).some((c) => c.includes('ทำไร่ทำนา')));
  assert.ok(C.chineseClashes({ world: 'qing', arenas: ['palace'] }).some((c) => c.includes('บุคคลจริง')));
  assert.deepEqual(C.chineseClashes(story), []);
});

test('วางโครงได้คลังข้อมูลเต็ม: สูตร คำเรียกขาน เงิน เวลา ชื่อ และสิ่งที่ world_rules ต้องมี', () => {
  const p = P.outlinePrompt(book());
  for (const s of [KIT, 'ทะลุมิติเข้าร่าง', 'หมอเทวดา', 'ฝ่าบาท', 'ตำลึงเงิน', 'อีแปะ', 'ยามจื่อ', 'ลี้', 'แซ่มาก่อนชื่อ', 'สิ่งที่ world_rules ต้องมีครบ'])
    assert.ok(p.includes(s), s);
  assert.ok(!p.includes('หินวิญญาณ'), 'โลกมนุษย์ไม่ใช้หินวิญญาณ');
  assert.ok(!p.includes('ลำดับวังหลัง'), 'ไม่ได้เลือกวังหลัง ไม่ต้องแนบลำดับสนม');
});

test('โลกเซียนใช้หินวิญญาณ · วังหลังได้ลำดับสนม · ราชสำนักได้ระบบสอบ', () => {
  assert.ok(P.outlinePrompt(book({ chineseStory: { world: 'xianxia' } })).includes('หินวิญญาณ'));
  assert.ok(P.outlinePrompt(book({ chineseStory: { arenas: ['palace'] } })).includes('กุ้ยเฟย'));
  assert.ok(P.outlinePrompt(book({ chineseStory: { arenas: ['court'] } })).includes('จอหงวน'));
});

test('เขียนฉาก แก้ฉาก ยืด/หด และตรวจ ได้กติกายุคสมัยทุกขั้น', () => {
  const b = book();
  const batch = P.batchPrompt({ book: b, outline, bible: b.bible, chapter: ch, sections: [sec], prevSummaries: [], withContext: true });
  const repair = P.repairPrompt({ book: b, section: { id: '1.1', title: 'ฟื้น' }, currentText: 'x', issues: [] });
  const rewrite = P.rewritePrompt({ book: b, section: { ...sec, chars: 1000 }, currentText: 'x', targetChars: 2000 });
  for (const [name, p] of Object.entries({ batch, repair, rewrite })) {
    assert.ok(p.includes(SCENE), name);
    assert.ok(p.includes('ห้าม นาที ชั่วโมง'), name);
  }
  assert.ok(P.consistencyPrompt(ch, [{ id: '1.1', title: 'ฟื้น', md: 'x' }], b.bible, b).includes('ยุคสมัยจีนโบราณ'));
});

test('ฉบับย่อที่แนบทุกเทิร์นสั้นกว่าฉบับเต็มมาก', () => {
  const full = C.chineseOutlineKit(story).length;
  const scene = C.chineseSceneKit(story).length;
  assert.ok(scene < full / 3, `scene ${scene} vs full ${full}`);
  assert.ok(scene < 1200, `scene kit ${scene} chars`);
});

test('ขั้นตั้งชื่อ หัวข้อ เสนอโครง และตกแต่งสารบัญ รู้สูตรที่เลือก', () => {
  const args = { title: 'x', topic: 'x', contentMode: 'fiction', fictionGenre: 'chinese', chineseStory: story, userOutline: [{ n: 1, title: 'a' }] };
  for (const [name, p] of Object.entries({
    title: P.titleIdeasPrompt(args), trend: P.trendIdeasPrompt(args), dirs: P.outlineDirectionsPrompt(args), polish: P.outlinePolishPrompt(args),
  })) assert.ok(p.includes('ทะลุมิติเข้าร่าง'), name);
});

test('แนวอื่นไม่เห็นคลังข้อมูลจีนเลย แม้เล่มจะมี chineseStory ค้างอยู่', () => {
  const b = book({ fictionGenre: 'fantasy' });
  const ps = [
    P.outlinePrompt(b),
    P.batchPrompt({ book: b, outline, bible: b.bible, chapter: ch, sections: [sec], prevSummaries: [], withContext: true }),
    P.rewritePrompt({ book: b, section: { ...sec, chars: 1000 }, currentText: 'x', targetChars: 2000 }),
    P.consistencyPrompt(ch, [{ id: '1.1', title: 'ฟื้น', md: 'x' }], b.bible, b),
    P.titleIdeasPrompt({ topic: 'x', contentMode: 'fiction', fictionGenre: 'fantasy', chineseStory: story }),
  ];
  for (const p of ps) {
    assert.ok(!p.includes(KIT) && !p.includes(SCENE) && !p.includes('ยุคสมัยจีนโบราณ') && !p.includes('สูตรเรื่องจีนโบราณ'));
  }
});

test('ภาพปก/ภาพในเล่มใช้สไตล์จีนโบราณ', () => {
  assert.equal(flowGenreFor(book())?.key, 'chinese');
  assert.match(flowGenreFor(book()).style, /hanfu/);
  // เลือกโรแมนติกแต่เรื่องเป็นท่านอ๋อง → ปกจีนโบราณ
  assert.equal(flowGenreFor({ contentMode: 'fiction', fictionGenre: 'romance', topic: 'พระชายาของท่านอ๋อง' })?.key, 'chinese');
  // แฟนตาซีปกติยังเป็นแฟนตาซี
  assert.equal(flowGenreFor({ contentMode: 'fiction', fictionGenre: 'fantasy', topic: 'จอมเวทแห่งหุบเขา' })?.key, 'fantasy');
});
