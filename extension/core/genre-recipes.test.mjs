/**
 * ผู้ใช้: "นิยายจีนโบราณมีตัวเลือกเยอะดี ให้สร้างตัวเลือกที่เกี่ยวข้องกับหมวดอื่นด้วย"
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as G from './genre-recipes.js';
import * as P from './prompts.js';

const GENRES = ['romance', 'fantasy', 'scifi', 'mystery', 'thriller', 'horror', 'drama', 'adventure', 'comingofage', 'literary', 'senior'];

test('ทุกแนวในหน้าตั้งค่า (ยกเว้นจีนโบราณ) มีสูตร ครบทุกชั้น และชุดยอดนิยมใช้ค่าที่มีจริง', async () => {
  const html = await readFile(new URL('../ui/studio.html', import.meta.url), 'utf8');
  const select = html.slice(html.indexOf('<select id="fictionGenre">'), html.indexOf('</select>', html.indexOf('<select id="fictionGenre">')));
  const keys = [...select.matchAll(/value="([^"]+)"/g)].map((m) => m[1]).filter((k) => k !== 'chinese');
  assert.deepEqual(keys.sort(), [...GENRES].sort());
  assert.equal(G.hasGenreRecipe('chinese'), false, 'จีนโบราณใช้โมดูลของตัวเอง');
  for (const g of GENRES) {
    const r = G.GENRE_RECIPES[g];
    for (const layer of ['sub', 'setting', 'tropes', 'mood']) {
      assert.ok(r[layer].length >= 4, `${g}.${layer}`);
      assert.equal(new Set(r[layer].map((x) => x.key)).size, r[layer].length, `${g}.${layer} key ซ้ำ`);
      for (const x of r[layer]) assert.ok(x.label && x.rule.length > 10, `${g}.${layer}.${x.key}`);
    }
    assert.ok(r.popular.length >= 3, g);
    for (const p of r.popular) {
      const n = G.normalizeGenreStory(g, p);
      assert.equal(n.sub, p.sub, `${g} ${p.name}`);
      assert.equal(n.setting, p.setting, `${g} ${p.name}`);
      assert.equal(n.mood, p.mood, `${g} ${p.name}`);
      assert.deepEqual(n.tropes, p.tropes, `${g} ${p.name}`);
    }
  }
});

test('normalize ตัดค่าที่ไม่มีในแนว ตัดไม้เด็ดซ้ำ และไม่เกินเพดาน', () => {
  const n = G.normalizeGenreStory('horror', { sub: 'ceo', setting: 'village', mood: 'nope', tropes: ['rulelist', 'rulelist', 'cursed', 'vow', 'ritual', 'enemies'] });
  assert.equal(n.sub, '');
  assert.equal(n.setting, 'village');
  assert.equal(n.mood, '');
  assert.deepEqual(n.tropes, ['rulelist', 'cursed', 'vow']);
  assert.equal(G.normalizeGenreStory('chinese', { sub: 'x' }).genre, '');
  assert.equal(G.normalizeGenreStory('__proto__', {}).genre, '');
});

test('ไม่เลือกอะไร = ไม่มีข้อความเพิ่มเลย', () => {
  for (const g of GENRES) {
    assert.equal(G.genreStoryPicked(g, {}), false);
    for (const fn of [G.genreRecipeText, G.genreOutlineKit, G.genreSceneKit, G.genreIdeaNote, G.genreReviewCheck]) assert.equal(fn(g, {}), '');
  }
});

test('สุ่มชุดยอดนิยมได้ชื่อและค่าครบ', () => {
  const p = G.randomGenrePopular('horror', () => 0);
  assert.equal(p.name, G.GENRE_RECIPES.horror.popular[0].name);
  assert.equal(p.sub, 'rules');
  assert.equal(G.randomGenrePopular('chinese'), null);
});

import * as B from './bible.js';
const story = { sub: 'rules', setting: 'school', tropes: ['rulelist', 'amongus'], mood: 'dread' };
const outline = {
  title: 'กฎหอพัก', thesis: 'แกน', voice_card: 'หลอน', world_rules: ['กฎ 9 ข้อ'], cast: [{ name: 'มายด์', role: 'ตัวเอก' }],
  chapters: [{ n: 1, title: 'คืนแรก', objective: 'เริ่ม', sections: [{ id: '1.1', title: 'ย้ายเข้า', quota: 2000, pov_character: 'มายด์', beats: ['เจอกฎ'], takeaways: ['กฎข้อ 1'] }] }],
};
const book = (over = {}) => ({
  contentMode: 'fiction', fictionGenre: 'horror', genreStory: story, genreBrief: 'สยองขวัญ', fictionPov: 'third-limited',
  fictionEnding: 'open', fictionRomance: 'none', tone: 't', audience: 'a', topic: 'หอพัก', language: 'th', targetPages: 120,
  trim: { preset: 'a5' }, outline, bible: { ...B.emptyBible(), characters: outline.cast }, ...over,
});
const ch = outline.chapters[0];
const sec = ch.sections[0];

test('สูตรไปถึงขั้นวางโครง เขียนฉาก แก้ฉาก และตรวจ', () => {
  const p = P.outlinePrompt(book());
  assert.match(p, /สูตรนิยายสยองขวัญที่ผู้ใช้เลือก/);
  assert.match(p, /สยองแบบกฎข้อห้าม: มีรายการกฎ/);
  assert.match(p, /ไม้เด็ด — มีคนตายแล้วปนอยู่ในกลุ่ม/);
  const b = book();
  const batch = P.batchPrompt({ book: b, outline, bible: b.bible, chapter: ch, sections: [sec], prevSummaries: [], withContext: true });
  const repair = P.repairPrompt({ book: b, section: { id: '1.1', title: 'ย้ายเข้า' }, currentText: 'x', issues: [] });
  const rewrite = P.rewritePrompt({ book: b, section: { ...sec, chars: 1000 }, currentText: 'x', targetChars: 2000 });
  for (const [name, x] of Object.entries({ batch, repair, rewrite })) assert.match(x, /สูตรเรื่องที่ผู้ใช้เลือก: แนวย่อย: สยองแบบกฎข้อห้าม/, name);
  assert.match(P.consistencyPrompt(ch, [{ ...sec, md: 'x' }], b.bible, b), /8. ตรงสูตรที่ผู้ใช้เลือก/);
  const kit = G.genreSceneKit('horror', story);
  assert.ok(kit.length < 400, 'ฉบับย่อแนบทุกเทิร์นต้องสั้น');
  assert.match(kit, /อารมณ์: ความผิดปกติเล็ก ๆ/);
});

test('สูตรไปถึงขั้นตั้งชื่อ ดูกระแส เสนอทิศทาง และขัดเกลาสารบัญ', () => {
  const base = { audience: 'วัยรุ่น', tone: 'หลอน', contentMode: 'fiction', fictionGenre: 'horror', genreStory: story };
  assert.match(P.titleIdeasPrompt({ ...base, topic: 'หอพัก' }), /สูตรเรื่องที่ผู้ใช้เลือก: แนวย่อย: สยองแบบกฎข้อห้าม/);
  assert.match(P.trendIdeasPrompt(base), /นิยายแนว สยองขวัญ — แนวย่อย: สยองแบบกฎข้อห้าม/);
  assert.match(P.outlineDirectionsPrompt({ ...base, title: 'กฎหอพัก' }), /ไม้เด็ด: กฎห้ามฝ่าฝืน, มีคนตายแล้วปนอยู่ในกลุ่ม/);
  assert.match(P.outlinePolishPrompt({ ...base, title: 'กฎหอพัก', userOutline: [{ n: 1, title: 'คืนแรก' }] }), /สูตรเรื่องที่ผู้ใช้เลือก/);
});

test('ไม่เลือกสูตร หรือเป็นหนังสือร้อยแก้ว — prompt เหมือนไม่มีฟีเจอร์นี้ทุกตัวอักษร', () => {
  const none = book({ genreStory: null });
  const empty = book({ genreStory: { sub: '', setting: '', tropes: [], mood: '' } });
  assert.equal(P.outlinePrompt(empty), P.outlinePrompt(none));
  const args = (b) => ({ book: b, outline, bible: b.bible, chapter: ch, sections: [sec], prevSummaries: [], withContext: true });
  assert.equal(P.batchPrompt(args(empty)), P.batchPrompt(args(none)));
  assert.equal(P.consistencyPrompt(ch, [{ ...sec, md: 'x' }], empty.bible, empty), P.consistencyPrompt(ch, [{ ...sec, md: 'x' }], none.bible, none));
  const base = { audience: 'a', tone: 't', contentMode: 'fiction', fictionGenre: 'horror' };
  assert.equal(P.titleIdeasPrompt({ ...base, topic: 'x', genreStory: {} }), P.titleIdeasPrompt({ ...base, topic: 'x' }));
  assert.equal(P.trendIdeasPrompt({ ...base, genreStory: {} }), P.trendIdeasPrompt(base));
  const prose = { audience: 'a', tone: 't', contentMode: 'prose', title: 'x', genreStory: story, fictionGenre: 'horror' };
  assert.doesNotMatch(P.outlineDirectionsPrompt(prose), /สูตรเรื่อง/);
});

test('สูตรของแนวหนึ่งไม่หลุดไปอีกแนว และจีนโบราณไม่ได้สูตรนี้', () => {
  assert.doesNotMatch(P.outlinePrompt(book({ fictionGenre: 'romance' })), /สูตรนิยาย|ไม้เด็ด — /);
  assert.doesNotMatch(P.outlinePrompt(book({ fictionGenre: 'chinese' })), /สูตรนิยายสยองขวัญ/);
});

test('Studio ส่งสูตรเข้าทุก prompt ที่ส่งสูตรจีน และเก็บลงเล่ม', async () => {
  const studio = await readFile(new URL('../ui/studio.js', import.meta.url), 'utf8');
  assert.equal(studio.match(/genreStory: formGenreStory\(\)/g).length, studio.match(/chineseStory: formChineseStory\(\)/g).length);
  assert.match(studio.slice(studio.indexOf('function paintChinese')), /paintGenre\(\)/);
  assert.match(studio, /mountGenreOpts\(\);/);
});

test('ชื่อนิยายที่เสนอต้องสั้นแบบชื่อบนปก ไม่ใช่ประโยคบทพูด (ผู้ใช้: "ชื่อประหลาดมาก")', () => {
  for (const g of ['chinese', 'romance', 'horror']) {
    const p = P.titleIdeasPrompt({ topic: 'x', audience: 'a', tone: 't', contentMode: 'fiction', fictionGenre: g });
    assert.match(p, /สั้นแบบชื่อบนปกนิยาย 2–6 คำ/);
    assert.match(p, /ห้ามลงท้ายด้วยคำพูดอย่าง เจ้าค่ะ/);
  }
  assert.doesNotMatch(P.titleIdeasPrompt({ topic: 'x', audience: 'a', tone: 't', contentMode: 'prose' }), /ชื่อบนปกนิยาย/);
});
