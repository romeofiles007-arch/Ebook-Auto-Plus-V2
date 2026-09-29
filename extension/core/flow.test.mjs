import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { nearestFlowRatio, flowRatioFor, flowPrompt, FLOW_RATIOS } from './flow.js';

/**
 * Ebook Plus — สร้างภาพด้วย Google Flow
 *
 * สิ่งที่ผู้ใช้ขอชัด ๆ คือ "ครอปจะตัดส่วนสำคัญไป" จึงต้องสั่ง Flow ในสัดส่วนที่ตรงช่องที่สุด
 * ทดสอบกับหน้าจริงแล้ว: 3:4 → 896×1200 (1K) / 1792×2400 (2K) · 16:9 → 2752×1536 (2K)
 */

test('สัดส่วนที่เลือกได้ตรงกับที่หน้า Flow มีจริง', () => {
  assert.deepEqual(Object.keys(FLOW_RATIOS).sort(), ['16:9', '1:1', '3:4', '4:3', '9:16'].sort());
});

test('ปก A5 + ตัดตก 3 มม. ใช้ 3:4 และตัดขอบรวมไม่เกิน 7%', () => {
  const r = flowRatioFor({ widthMm: 151, heightMm: 216, kind: 'cover' });
  assert.equal(r.label, '3:4');
  assert.ok(r.loss > 0.05 && r.loss < 0.07, `loss=${r.loss}`);
});

test('ช่องภาพที่วางแผนเป็นสัดส่วน Flow อยู่แล้ว ไม่ต้องครอปเลย', () => {
  for (const [label, ratio] of Object.entries(FLOW_RATIOS)) {
    const r = flowRatioFor({ widthMm: 90, heightMm: 90 / ratio });
    assert.equal(r.label, label);
    assert.ok(r.loss < 0.002, `${label} loss=${r.loss}`);
  }
});

test('สัดส่วนเก่าของ ChatGPT (3:2 · 2:3) เกาะสัดส่วน Flow ที่ใกล้ที่สุด', () => {
  assert.equal(nearestFlowRatio(3 / 2), '4:3');
  assert.equal(nearestFlowRatio(2 / 3), '3:4');
  assert.equal(nearestFlowRatio(1.9), '16:9');
});

test('prompt บอกกรอบภาพ และปกต้องเว้นขอบให้ของสำคัญ', () => {
  const cover = flowPrompt({ prompt: 'A lighthouse', kind: 'cover' }, { label: '3:4', loss: 0.068 });
  assert.match(cover, /^THIS IMAGE IS THE FLAT PRINTED COVER SURFACE/);
  assert.match(cover, /\nA lighthouse\n/);
  assert.match(cover, /FRAME: 3:4 portrait/);
  assert.match(cover, /away from all four edges/);
  const fig = flowPrompt({ prompt: 'A boat', kind: 'interior' }, { label: '16:9', loss: 0 });
  assert.match(fig, /FRAME: 16:9 landscape/);
  assert.doesNotMatch(fig, /trimmed/);
});

const adapter = await readFile(new URL('../adapter/flow.js', import.meta.url), 'utf8');
const hook = await readFile(new URL('../adapter/flow-main.js', import.meta.url), 'utf8');
const machine = await readFile(new URL('./machine.js', import.meta.url), 'utf8');
const sw = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
const manifest = JSON.parse(await readFile(new URL('../manifest.json', import.meta.url), 'utf8'));

/** ปุ่ม "เริ่มสร้าง" ของ Flow ไม่รับคลิกของสคริปต์ (เจอกับหน้าจริง) ต้องใช้คลิกผ่าน debugger */
test('ปุ่มสร้างถูกกดด้วยคลิกที่เบราว์เซอร์เชื่อว่าเป็นคนกด', () => {
  assert.match(adapter, /await trustedClick\(btn\)/);
  assert.match(adapter, /attempt < 3 && !taken/);
  assert.match(adapter, /type: 'sw\.trustedClick'/);
  assert.match(sw, /case 'sw\.trustedClick'/);
  assert.match(sw, /isFlowUrl\(sender\.tab\.url\)/);
  assert.match(sw, /chrome\.debugger\.detach/);
});

test('ไม่กดสร้างถ้า Flow บอกว่าต้องใช้เครดิต', () => {
  assert.match(adapter, /last\.credits === 0/);
  assert.match(adapter, /err\.code = 'not_free'/);
  assert.match(machine, /res\.code === 'not_free'/);
});

/** ไฟล์ 2K ถูกดักก่อนลง Downloads และดักเฉพาะตอนที่ง้างไว้ — การดาวน์โหลดเองของผู้ใช้ไม่โดน */
test('ตัวดัก 2K ทำงานเฉพาะตอนง้าง และครั้งละไฟล์', () => {
  assert.match(hook, /if \(live\(\) && this\.hasAttribute\('download'\)/);
  assert.match(hook, /armed = null;/);
  assert.match(hook, /return click\.call\(this\)/);
  const cs = manifest.content_scripts.find((c) => c.js.includes('adapter/flow-main.js'));
  assert.equal(cs.world, 'MAIN');
  assert.equal(cs.run_at, 'document_start');
});

test('ภาพใหม่ถูกตั้งชื่อใน Flow ตามชื่อไฟล์ที่วางแผนไว้', () => {
  assert.match(adapter, /renameTile\(id, args\.name\)/);
  assert.match(machine, /name: j\.name,\s+prompt: sendPrompt,\s+ratio: ratio\.label/);
});

test('โหมด flow ข้ามลูปของ ChatGPT ทั้งลูป ไม่มีการสั่งวาดซ้ำสองที่', () => {
  assert.match(machine, /const viaFlow = this\.book\.imageSource === 'flow';/);
  assert.match(machine, /for \(let index = 0; !viaFlow && index < jobs\.length; index\+\+\)/);
});

test('ช่องภาพในเล่มของโหมด flow ใช้สัดส่วนของ Flow และไม่บิดสัดส่วนเพราะเพดานความสูง', () => {
  assert.match(machine, /const table = book\?\.imageSource === 'flow' \? FLOW_RATIOS : NATIVE_ASPECTS;/);
  assert.match(machine, /normalizeFigureAspect\(f\.aspect, this\.book\)/);
  assert.match(machine, /this\.book\.imageSource === 'flow' && widthMm \/ aspect\.ratio > 72/);
});

test('manifest ขอสิทธิ์ Flow ครบ และชื่อเป็น Ebook Plus', () => {
  assert.equal(manifest.name, 'Ebook Plus');
  assert.ok(manifest.host_permissions.includes('https://flow.google.com/*'));
  assert.ok(manifest.host_permissions.includes('https://flow-content.google/*'));
  assert.ok(manifest.permissions.includes('debugger'));
});

/** ผู้ใช้ขอ: "ถ้าเป็น Google Flow สร้างมากที่สุดเท่าที่ควรจะเป็นภาพ" */
test('ระดับภาพ max: ทุกตอนอย่างน้อย 1 รูป และเป็นค่าเริ่มต้นของโหมด Flow', async () => {
  const P = await import('./prompts.js');
  const outline = { title: 't', chapters: [{ n: 1, title: 'a', sections: [{ id: '1.1', title: 'x' }, { id: '1.2', title: 'y' }] }] };
  const s = P.figurePlanPrompt({ audience: 'x', illustrationLevel: 'max', outline }, outline, outline.chapters, 'line');
  assert.match(s, /อย่างน้อย 2 รูป \(ทุกตอนอย่างน้อย 1 รูป\)/);
  assert.match(s, /มากที่สุดเท่าที่ควรจะเป็นภาพ/);
  assert.doesNotMatch(s, /ไม่ใช่ใส่ให้ครบจำนวน/);
  const studio = await readFile(new URL('../ui/studio.js', import.meta.url), 'utf8');
  assert.match(studio, /flow: \{ textSource: 'web', imageSource: 'flow', coverMode: 'auto', figureMode: 'auto', illus: 'max' \}/);
  assert.match(machine, /this\.book\.illustrationLevel === 'max' && style !== 'box'/);
});

/** เจอจริงในเล่มแรก: รูปผู้เขียนถูกอัปโหลดซ้ำ 15 ใบ · ภาพซ้ำ 2–3 ชุด · ลวดลายได้ไฟล์ 2K ของปก */
test('รูปอ้างอิงอัปโหลดครั้งเดียว แล้วใช้ tile เดิมตลอด', () => {
  assert.match(adapter, /r\.name && r\.name !== r\.tile && \(await attachFromPicker\(r\.name\)/);
});

test('tile ใหม่ต้องไม่ใช่ไฟล์ที่อัปโหลด และต้องตรงสัดส่วนที่สั่ง', () => {
  assert.match(adapter, /!skip\.has\(tile\.getAttribute\('aria-label'\) \|\| ''\)/);
  assert.match(adapter, /ratioOk\(img\.naturalWidth, img\.naturalHeight, ratio\)/);
});

test('ไม่สั่งวาดซ้ำ: รอบลองใหม่ใช้ภาพที่ตั้งชื่อไว้แล้ว และนับว่ารับงานเมื่อมี tile ใหม่โผล่', () => {
  assert.match(adapter, /if \(done && args\.reuse !== false\)/);
  assert.match(machine, /reuse: attempt > 1/);
  assert.match(adapter, /SEL\.tiles\(\)\.some\(\(t\) => !beforeEls\.has\(t\)\)/);
});

test('ไฟล์ 2K ต้องเป็นภาพเดียวกับ tile (สัดส่วน + ลายนิ้วมือภาพ) ไม่งั้นใช้ 1K ของ tile นั้นแทน', () => {
  assert.match(adapter, /hamming\(await aHash\(blob\), await aHash\(thumb\)\)/);
  assert.match(adapter, /if \(dist > 12\)/);
});

test('โมเดล: Nano Banana 2 ก่อน แล้วรุ่นไหนก็ได้ที่ 0 เครดิต', async () => {
  const { FLOW_MODELS } = await import('./flow.js');
  assert.equal(FLOW_MODELS[0], 'Nano Banana 2');
  assert.match(adapter, /last\.credits === 0/);
});

/** ผู้ใช้ขอ: ภาพประกอบต้องมีสาระ แสดงวิธีทำ ไม่ใช่เก็กท่าเฉย ๆ */
test('ภาพในโหมด Flow เป็นภาพสอนวิธีทำ ส่วนโหมดอื่นคงกติกาเดิม', async () => {
  const P = await import('./prompts.js');
  const outline = { title: 't', chapters: [{ n: 1, title: 'a', sections: [{ id: '1.1', title: 'x' }] }] };
  const flow = P.figurePlanPrompt({ audience: 'x', illustrationLevel: 'max', imageSource: 'flow', outline }, outline, outline.chapters, 'line');
  assert.match(flow, /ต้อง "สอน"/);
  assert.match(flow, /ห้ามภาพคนยืนหรือนั่งโพสท่า/);
  const web = P.figurePlanPrompt({ audience: 'x', illustrationLevel: 'light', imageSource: 'web', outline }, outline, outline.chapters, 'line');
  assert.doesNotMatch(web, /ต้อง "สอน"/);
  const fig = P.interiorFigurePrompt('line', 'hands folding paper', 90, 67.5, '4:3', { instructive: true });
  assert.match(fig, /TEACHING FIGURE/);
  assert.match(fig, /never posing/);
});

/** ผู้ใช้ขอ: สร้างโฟลเดอร์ใน project ของ Flow ให้เป็นสัดส่วน ค้นหาง่าย ไม่ใช่สร้างมั่ว */
test('ภาพแต่ละใบไปอยู่ในคอลเล็กชันตามตำแหน่งในเล่ม', async () => {
  const { flowCollectionFor, FLOW_REF_COLLECTION } = await import('./flow.js');
  const b = { outline: { chapters: [{ n: 1, title: 'เริ่ม', sections: [{ id: '1.1' }] }, { n: 2, title: 'ลงมือ', sections: [{ id: '2.1' }] }] } };
  assert.equal(flowCollectionFor(b, { kind: 'cover', name: 'cover-front.png' }), '01 ปก');
  assert.equal(flowCollectionFor(b, { kind: 'pattern', name: 'page-pattern.png' }), '02 ลวดลายพื้นหลัง');
  assert.equal(flowCollectionFor(b, { kind: 'interior', name: 'fig-2.1-1.png' }), '04 บทที่ 2 · ลงมือ');
  assert.equal(FLOW_REF_COLLECTION, '00 รูปอ้างอิง');
  // ภาพจาก Flow Agent อยู่หน้าหลักของ project (ไม่มีคอลเล็กชัน) · ภาพอื่นไปคอลเล็กชันตามเดิม
  assert.ok(machine.includes("collection: fromAgent ? '' : flowCollectionFor(this.book, j)"));
  assert.match(adapter, /await openCollection\(args\.collection\)/);
  // รูปอ้างอิงเลือกจากตัวเลือกสื่อของทั้ง project ไม่อัปโหลดซ้ำเข้าคอลเล็กชันของบท
  assert.match(adapter, /attachFromPicker\(r\.tile\)/);
  assert.match(adapter, /ensureRefUploaded\(r, args\.refCollection\)/);
});

/** เล่มจริงรอบที่สอง: ปกถูกวาดซ้ำที่หน้าหลัก · ปกหน้าถูกตัดสินว่าล้มทั้งที่ยังวาดอยู่ · ปกหลังได้ภาพปกหน้า */
test('ปิด Agent ไม่กดปุ่ม ← ที่พาออกจากคอลเล็กชัน', () => {
  assert.match(adapter, /const back = panel && iconButton\('arrow_back', panel\)/);
  assert.match(adapter, /e\.code = 'wrong_place'/);
});

test('ตามตัว tile ของตัวเองจาก prompt และไม่เอาคำใน prompt มาตัดสินว่าล้ม', () => {
  assert.match(adapter, /const isPending = \(tile\) => !!tile\?\.querySelector\('flow-pending-tile'\)/);
  assert.match(adapter, /FAIL_TEXT\.test\(statusText\(mine, prompt\)\)/);
  assert.doesNotMatch(adapter, /!beforeEls\.has\(tile\) && FAIL_TEXT\.test\(text\(tile\)\)/);
});

test('ไม่ส่งงานใหม่ขณะที่ยังมีภาพกำลังวาดอยู่ในหน้า', () => {
  assert.match(adapter, /await waitFor\(\(\) => !SEL\.tiles\(\)\.some\(isPending\)/);
});

test('ดึงภาพบน tile แบบไม่แนบ cookie ก่อน แล้วค่อยให้ service worker ดึงแทน', () => {
  assert.match(adapter, /for \(const opts of \[\{\}, \{ credentials: 'include' \}\]\)/);
  assert.match(adapter, /type: 'sw\.fetchImage', url: src/);
});

test('ไม่เขียนไฟล์ลง Downloads เอง', () => {
  assert.doesNotMatch(machine, /downloadBookImage|Downloads\/Ebook Plus|sw\.download', url: dataUrl/);
});

/** ผู้ใช้ส่ง PDF เล่มจริงมา: เนื้อหาน้อย · ภาพไม่เกี่ยวกับเนื้อหา · หน้าผู้เขียนเกือบทุกภาพ · ปกหลังเป็นรูปถ่ายหนังสือบนโต๊ะ */
test('ภาพเป็นหน้าเพิ่ม ไม่หักงบเนื้อหา', async () => {
  const budget = await readFile(new URL('./budget.js', import.meta.url), 'utf8');
  assert.match(budget, /if \(book\.imageSource === 'flow'\) return 0;/);
  assert.match(machine, /const target = targetPhysicalPages\(this\.book, this\.book\.outline\) \+ imagePages;/);
});

test('prompt ภาพในเล่มสร้างใหม่ตอนส่ง จากแผน + เนื้อหารอบภาพ สั้นและไม่ขัดกันเอง', async () => {
  const P = await import('./prompts.js');
  const md = 'ก่อนเริ่มให้จดคะแนนสามช่อง\n\n![c](fig:fig-1.1-1.png 80% 60mm)\n\nแล้วค่อยเริ่มจับเวลา';
  const ctx = P.figureContextText(md, 'fig-1.1-1.png');
  assert.match(ctx, /จดคะแนนสามช่อง/);
  assert.match(ctx, /เริ่มจับเวลา/);
  const p = P.flowFigurePrompt({ book: { title: 't' }, fig: { caption: 'จดคะแนน', subject: 'Hands writing three scores on a card' }, passage: ctx });
  assert.ok(p.length < 2000, `ยาว ${p.length}`);
  assert.match(p, /WHAT THE READER MUST LEARN/);
  assert.match(p, /NO numbers/); // ภาพฉากเดียวห้ามมีเลขลอย ๆ
  assert.match(p, /never the book's author/);
  const steps = P.flowFigurePrompt({ book: {}, fig: { subject: 'Step 1 close the book; step 2 write from memory' } });
  assert.match(steps, /one large step number per panel/);
  assert.match(machine, /prompt = P\.flowFigurePrompt\(/);
});

test('ภาพในเล่มโหมด Flow ไม่แนบรูปผู้เขียนและไม่แนบปก', () => {
  assert.match(machine, /j\.kind !== 'interior' && \(backFace \|\| wantsAuthorRef/);
  assert.match(machine, /\['cover', 'pattern'\]\.includes\(j\.kind\)/);
});

test('ปกคือผิวหน้าปกแบนเต็มกรอบ ไม่ใช่รูปถ่ายหนังสือ', async () => {
  const { flowPrompt } = await import('./flow.js');
  const p = flowPrompt({ kind: 'cover', prompt: 'x' }, { label: '3:4', loss: 0.07 });
  assert.match(p, /NOT a photograph of a book, NOT a 3D mockup/);
});

/** ผู้ใช้ขอ: ให้กดทำต่อเองจนสำเร็จ ไม่หยุดรอคนกลางเล่ม */
test('กดทำต่อเองนับตามจุดที่ติด ไม่ใช่ทั้งขั้นเขียน', async () => {
  const studio = await readFile(new URL('../ui/studio.js', import.meta.url), 'utf8');
  assert.match(studio, /const stuckAt = `\$\{book\.job\.step\}\|\$\{String\(book\.job\.error \|\| ''\)\.slice\(0, 160\)\}`;/);
  assert.match(machine, /const MAX_DRAFT_ATTEMPTS = 4;/);
  assert.match(machine, /const oneByOne = attempt >= 2;/);
});

/** เล่มจริง: project ใหม่เปิดแผงแชต Agent ค้างไว้ ช่องพิมพ์ปกติถูกซ่อน สร้างภาพไม่ได้สักรูป */
test('ปิดแผงแชต Agent ก่อนตั้งค่าโมเดล', () => {
  assert.match(adapter, /async function agentOff\(\) \{\n    await closeAgentChat\(\);/);
  assert.match(adapter, /if \(!SEL\.settingsTrigger\(\)\) await closeAgentChat\(\);/);
});

/** ผู้ใช้ถาม: ทำไมนิยายไม่มีการอ้างอิงตัวละคร — และปกนิยายชื่อเรื่องภาษาไทยเพี้ยน */
test('นิยาย: ภาพต้นแบบตัวละคร แล้วแนบให้ทุกภาพที่ตัวละครนั้นอยู่', async () => {
  const { fictionCast, castInText, charRefName } = await import('./flow.js');
  const book = { outline: { cast: [{ name: 'เอมมี่', appearance: 'ผมยาวมัดหาง' }, { name: 'ต้น' }] }, bible: { characters: [{ name: 'เอมมี่', role: 'นางเอก' }] } };
  const cast = fictionCast(book);
  assert.equal(cast.length, 2);
  assert.equal(cast[0].name, 'เอมมี่');
  assert.equal(cast[0].role, 'นางเอก');
  assert.deepEqual(castInText(cast, 'เอมมี่ยืนมองโทรศัพท์').map((c) => c.name), ['เอมมี่']);
  assert.equal(charRefName(0), 'char-01.png');
  const P = await import('./prompts.js');
  const p = P.flowFictionFigurePrompt({ book: { title: 't' }, fig: { subject: 'Emmy looks at her phone' }, people: [{ name: 'เอมมี่', appearance: 'ผมยาว', ref: { name: 'char-01.png' } }] });
  assert.match(p, /- เอมมี่ = attached image 1/);
  assert.doesNotMatch(p, /how-to|anonymous ordinary learner/);
  assert.match(machine, /const castRefs = fiction \? await this\.ensureFlowCast\(\) : \[\];/);
  assert.match(machine, /collection: FLOW_CAST_COLLECTION/);
});

/** ผู้ใช้สั่ง: ปกทุกประเภทหนังสือในโหมด Flow สร้างพร้อมตัวหนังสือ และปกหน้าต้องน่าตื่นเต้น (เดิมสารคดีได้ภาพเปล่า) */
test('โหมด Flow ทุกประเภท: ปกหน้า-หลังมีตัวหนังสือในภาพ · ปกหน้าสั่งให้น่าตื่นเต้น', async () => {
  const P = await import('./prompts.js');
  assert.equal(P.coverTextBaked({ imageSource: 'flow', contentMode: 'prose' }), true);
  assert.equal(P.coverTextBaked({ imageSource: 'web', coverTextMode: 'baked' }), true);
  assert.equal(P.backCoverTextBaked({ imageSource: 'flow', contentMode: 'prose', backCoverCopy: { hook: 'x' } }), true);
  assert.equal(P.backCoverTextBaked({ imageSource: 'flow', contentMode: 'prose' }), false, 'ยังไม่มีคำโปรย = ยังวาดคำโปรยไม่ได้');
  assert.match(P.FLOW_COVER_PUNCH, /never a person standing still holding an object/);
  // ภาพที่ไม่ได้สั่งให้มีตัวหนังสือ ยังห้ามตัวอักษรเหมือนเดิม
  const { flowPrompt } = await import('./flow.js');
  assert.match(flowPrompt({ kind: 'cover', prompt: 'x' }, { label: '3:4' }), /ARTWORK ONLY: absolutely no title/);
});

/** ผู้ใช้สั่ง: ปกหน้า-หลังนิยายเป็นแนวโปสเตอร์หนัง ตัวหนังสือสร้างไปพร้อมภาพ ไม่ต้องวางทับทีหลัง */
test('นิยายโหมด Flow: ปกหน้า-หลังแนวโปสเตอร์หนัง ตัวหนังสืออยู่ในภาพ ไม่พิมพ์ทับ', async () => {
  const P = await import('./prompts.js');
  const novel = { imageSource: 'flow', contentMode: 'fiction', author: 'ฟ้าใส', backCoverCopy: { hook: 'คืนนั้นเปลี่ยนทุกอย่าง', body: 'เนื้อเรื่อง', closing: 'ปิดท้าย' } };
  assert.equal(P.coverTextBaked(novel), true);
  assert.equal(P.backCoverTextBaked(novel), true);
  const front = P.flowNovelCoverPrompt({ book: novel, outline: { title: 'คืนวันศุกร์ถึงเช้าวันจันทร์', thesis: 'x' }, textBaked: true });
  assert.match(front, /MOVIE-POSTER-STYLE FRONT COVER/);
  assert.match(front, /TITLE: "คืนวันศุกร์ถึงเช้าวันจันทร์"/);
  assert.match(front, /AUTHOR .*"ฟ้าใส"/);
  assert.doesNotMatch(front, /title is typeset there/);
  const back = P.flowNovelCoverPrompt({ book: novel, outline: {}, back: true, textBaked: true, authorPhotoSpot: true });
  assert.match(back, /HEADLINE \(large, bold\): "คืนนั้นเปลี่ยนทุกอย่าง"/);
  assert.match(back, /PARAGRAPH .*"เนื้อเรื่อง"/);
  assert.match(back, /upper-left corner/);
  // ไม่มีคำสั่ง "ห้ามมีตัวอักษร" มาขัด
  const { flowPrompt } = await import('./flow.js');
  const sent = flowPrompt({ kind: 'cover', prompt: front, textBaked: true }, { label: '3:4' });
  assert.doesNotMatch(sent, /ARTWORK ONLY|no letters of any kind/);
  // เรียงพิมพ์: เชื่อธงของภาพที่มีจริง — เล่มเก่าที่ปกยังเป็นภาพเปล่าต้องได้ชื่อพิมพ์ทับเหมือนเดิม
  assert.equal(P.frontCoverTextInImage(novel), false);
  assert.equal(P.frontCoverTextInImage({ ...novel, frontCoverTextBaked: true }), true);
  assert.equal(P.backCoverTextInImage(novel), false);
  assert.equal(P.backCoverTextInImage({ ...novel, backCoverTextBaked: true }), true);
  // ปกเปล่ารุ่นก่อนวาดใหม่ · บันทึกธงตามภาพที่ได้จริง
  assert.match(machine, /const coverNeedsText = existing && textIn && !existing\.meta\?\.textBaked;/);
  assert.match(machine, /if \(j\.name === 'cover-front\.png'\) this\.book\.frontCoverTextBaked = textIn;/);
  assert.match(machine, /prompt = flowPrompt\(\{ \.\.\.j, prompt, textBaked: textIn \}, ratio\);/);
});

/** ผู้ใช้สั่ง: ตัวเอกในรูปที่แนบต้องได้ภาพต้นแบบใน "00 ตัวละคร" ก่อนสร้างภาพจริง — ห้ามแนบรูปถ่ายดิบไปกับฉาก */
test('ตัวเอกจากรูปที่แนบ: วาดภาพต้นแบบก่อนเสมอ ลองสามแบบ ไม่ถอยไปใช้รูปถ่ายดิบ', async () => {
  assert.match(machine, /const tries = photoRef \? \[photoRef, photoRef, null\] : \[null\];/);
  assert.match(machine, /const inspired = !!from && t > 0;/);
  assert.match(machine, /out\.push\(\{ \.\.\.c, ref: null \}\);/);
  assert.doesNotMatch(machine, /ref: photoRef \? \{ \.\.\.photoRef, upload: true \} : null/);
  const P = await import('./prompts.js');
  const sheet = P.characterSheetPrompt({}, { name: 'เอมมี่' }, { styleKey: 'novel', fromPhoto: true, photoAsInspiration: true });
  assert.match(sheet, /USE THE ATTACHED PHOTO AS INSPIRATION/);
  assert.doesNotMatch(sheet, /keep the face, facial features/);
});

/** ผู้ใช้ขอ: นิยายเลือกภาพประกอบทุกหน้า ตามเหตุการณ์เด่นของหน้านั้น · ตัวละครต้องถูกต้องเคร่งครัด */
test('ภาพตามความเหมาะสม: วางแผนจากข้อความจริง เลือกเฉพาะหน้าที่ควรมีภาพ และตัวละครในภาพตรงตามแผน', async () => {
  const P = await import('./prompts.js');
  const pages = [{ key: '1.1-1', section: '1.1', page: 1, of: 2, text: 'เอมมี่เปิดประตูเจอต้น' }, { key: '1.1-2', section: '1.1', page: 2, of: 2, text: 'ต้นยื่นจดหมาย' }];
  const plan = P.fictionPagePlanPrompt({ topic: 't' }, { title: 't', cast: [{ name: 'เอมมี่' }, { name: 'ต้น' }] }, pages);
  assert.match(plan, /\[1\.1-1\] ตอน 1\.1 · หน้า 1\/2\nเอมมี่เปิดประตูเจอต้น/);
  // ผู้ใช้เปลี่ยนจาก 1 หน้า 1 ภาพ เป็นตามความเหมาะสม — เลือกเฉพาะหน้าที่ควรมีภาพ ไม่ใช่ทุกหน้า
  assert.match(plan, /ประมาณ 1 ภาพ \(ไม่เกิน 1 ภาพ\)/);
  assert.doesNotMatch(plan, /หน้าละหนึ่งภาพพอดี/);
  assert.deepEqual(P.pagePickQuota(Array(12).fill({})), { target: 3, max: 6 });
  assert.match(plan, /สะกดตรงตามรายชื่อ canon/);
  // แผนภาพนิยายแบบเดิมก็ต้องบอกชื่อคนในภาพ
  assert.match(P.figurePlanPrompt({ contentMode: 'fiction', illustrationLevel: 'rich' }, { title: 't' }, [], 'novel'), /"characters": \[/);
  // สร้างภาพ: จำนวนคนแน่นอน · คนที่ไม่มีภาพต้นแบบก็บอกรูปลักษณ์
  const img = P.flowFictionFigurePrompt({ book: {}, fig: { subject: 'x' }, people: [{ name: 'เอมมี่', ref: { name: 'r' } }, { name: 'ต้น', appearance: 'ผมสั้น' }] });
  assert.match(img, /exactly 2 named characters/);
  assert.match(img, /- เอมมี่ = attached image 1/);
  assert.match(img, /- ต้น \(ผมสั้น\)/);
  assert.match(img, /Never swap faces between characters/);
  // เครื่อง: ตัดหน้าตาม calibration · แทรกภาพท้ายช่วงหน้า · แนบภาพต้นแบบตามรายชื่อในแผน
  assert.match(machine, /const perPage = this\.book\.illustrationLevel === 'page';/);
  assert.match(machine, /P\.prosePagePlanPrompt\(this\.book, this\.book\.outline, todo\)/);
  // หน้าที่ไม่ถูกเลือกคือข้ามโดยตั้งใจ ไม่ใช่ขาด — ไม่หยุดงาน และไม่รับเกินเพดาน
  assert.doesNotMatch(machine, /วางแผนภาพรายหน้ายังขาด/);
  assert.ok(machine.includes('const chosen = todo.filter((p) => byKey.get(p.key)?.subject).slice(0, max);'));
  assert.match(machine, /insertFigureAfter\(rec\.md, marker, f\.paraAt \+ \(n - 1\)\)/);
  assert.match(machine, /const planned = Array\.isArray\(fig\.characters\) \? fig\.characters : null;/);
  // prompt แผนทั้งเล่มยังมี fallback แต่เครื่องใช้แผนรายหน้ากับทั้งนิยายและสารคดี
  assert.match(P.figurePlanPrompt({ illustrationLevel: 'page', audience: 'x' }, { title: 't', chapters: [] }, [], 'line'), /มากที่สุดเท่าที่ควรจะเป็นภาพ/);
  const nonfiction = P.prosePagePlanPrompt({ topic: 't', genre: 'how-to' }, { title: 't' }, pages);
  assert.match(nonfiction, /\[1\.1-1\] ตอน 1\.1 · หน้า 1\/2\nเอมมี่เปิดประตูเจอต้น/);
  assert.match(nonfiction, /เฉพาะหน้าที่ภาพช่วยผู้อ่านได้จริง/);
});

test('นิยายสำหรับผู้สูงอายุ: มีในตัวเลือก และมีสูตรภาพของตัวเอง', async () => {
  const studioHtml = await readFile(new URL('../ui/studio.html', import.meta.url), 'utf8');
  const studioJs = await readFile(new URL('../ui/studio.js', import.meta.url), 'utf8');
  assert.match(studioHtml, /<option value="senior">นิยายสำหรับผู้สูงอายุ<\/option>/);
  assert.match(studioHtml, /<option value="page">ตามความเหมาะสม/);
  assert.match(studioHtml, /id="phase2ReplanPage"/);
  assert.doesNotMatch(studioJs, /option\.fictionOnly/);
  assert.match(studioJs, /await machine\.figures\(\);\s+await machine\.save\(\);/);
  const { plannedImageCount } = await import('./pricing.js');
  // ตามความเหมาะสม: ราว 1 ภาพต่อ 3–4 หน้า (เดิม 1 หน้า 1 ภาพ ได้ 120 ภาพจากเล่ม 60 หน้า)
  assert.equal(plannedImageCount({ figureMode: 'auto', illustrationLevel: 'page', targetPages: 60 }).figures, 17);
  const { flowGenreFor } = await import('./flow-genres.js');
  assert.equal(flowGenreFor({ contentMode: 'fiction', fictionGenre: 'senior' }).key, 'senior');
  const P = await import('./prompts.js');
  assert.match(P.titleIdeasPrompt({ topic: 't', audience: 'a', tone: 't', contentMode: 'fiction', fictionGenre: 'senior' }), /นิยายสำหรับผู้สูงอายุ/);
});

/** ผู้ใช้ทัก: "ปกหน้าทำไม่สำเร็จแล้ว ปล่อยผ่านเลยหรอ" — Flow ปัดตกครบสามรอบด้วยคำขอเดิม แล้วคิวเดินต่อ */
test('Flow ปัดตกภาพ: รอบสุดท้ายเปลี่ยนคำขอ และย้อนกลับมาลองอีกรอบเมื่อคิวจบ', () => {
  // รอบสุดท้ายไม่แนบภาพต้นแบบตัวละคร (ไม่ส่งคำขอเดิมซ้ำ)
  assert.match(machine, /const plain = !!flowError && attempt === MAX_FLOW_ATTEMPTS && plainRefs\.length < refs\.length;/);
  assert.match(machine, /prompt: sendPrompt,\n\s+ratio: ratio\.label,\n\s+refs: sendRefs,/);
  assert.match(machine, /reuse: attempt > 1 && !plain,/);
  // จบคิวแล้วย้อนไปลองภาพที่ตกอีกหนึ่งรอบ (รอบเดียว ไม่วนไม่รู้จบ)
  assert.match(machine, /if \(!retryPass && failed\.length && !this\.stopRequested\) \{/);
  assert.match(machine, /return this\.imagesViaFlow\(failed, genErrors, \{ retryPass: true \}\);/);
  // ได้ภาพแล้วล้างความผิดพลาดเดิม ไม่ให้ Final Check อ้างเหตุเก่า
  assert.match(machine, /genErrors\.delete\(j\.name\);/);
});

/** ผู้ใช้ขอ: นิยายแนบตัวละครได้ — พระเอก นางเอก และคนอื่น ๆ · แนบหรือไม่แนบ ChatGPT กรอกส่วนที่ว่างให้ */
test('ช่องตัวละครของผู้ใช้: ใส่ในโครงเรื่อง · แนบรูปใช้รูปนั้นเป็นต้นแบบ', async () => {
  const P = await import('./prompts.js');
  assert.deepEqual(P.CAST_SLOTS.map((s) => s.slot), ['hero', 'heroine', 'other1', 'other2']);
  const book = { topic: 't', contentMode: 'fiction', language: 'th', targetPages: 80,
    castSeeds: [{ slot: 'hero', label: 'พระเอก', use: true }, { slot: 'heroine', label: 'นางเอก', name: 'เอมมี่', photo: true, appearance: 'ผมยาว', use: true }] };
  const outline = P.outlinePrompt(book);
  assert.match(outline, /seed="hero" · บทบาท: พระเอก · ชื่อ: \(คิดให้\)/);
  assert.match(outline, /ห้ามเปลี่ยน/);
  const { fictionCast, castPhotoName } = await import('./flow.js');
  const cast = fictionCast({ ...book, outline: { cast: [{ name: 'ต้น', seed: 'hero' }, { name: 'เอมมี่', seed: 'heroine' }, { name: 'ป้า' }] } });
  assert.deepEqual(cast.slice(0, 2).map((c) => c.seedSlot).sort(), ['hero', 'heroine']);
  assert.equal(cast.find((c) => c.name === 'เอมมี่').photo, true);
  assert.equal(castPhotoName('heroine'), 'cast-heroine.png');
  assert.match(machine, /if \(c\.photo && c\.seedSlot\)/);
  assert.match(machine, /if \(this\.book\.contentMode === 'fiction'\) await this\.describeCastPhotos\(\);/);
  const studio = await readFile(new URL('../ui/studio.js', import.meta.url), 'utf8');
  assert.match(studio, /castSeeds: contentMode === 'fiction' \? readCastSeeds\(\) : \[\]/);
  assert.match(studio, /await saveSetupCastPhotos\(\);/);
});

/** ผู้ใช้ทัก: "ตัวละครอ้างอิงไม่ครบ" + "มั่วสไตล์ จืดชืดไม่น่าดู" (ปกภาพถ่าย · ในเล่มสเก็ตช์ย้อมแดง) */
test('นิยาย: ตัวละครครบทุกช่องที่ผู้ใช้ตั้ง และทั้งเล่มสไตล์เดียวกันสีเต็ม', async () => {
  const { fictionCast, charRefName } = await import('./flow.js');
  const cast = fictionCast({
    outline: { cast: [{ name: 'ต้น' }] },
    castSeeds: [{ slot: 'hero', label: 'พระเอก', name: 'ภูมิ', photo: true }, { slot: 'other1', label: 'ตัวละครอื่น 1', name: 'ต้น' }, { slot: 'other2', label: 'ตัวละครอื่น 2' }],
  });
  assert.deepEqual(cast.map((c) => c.name).sort(), ['ต้น', 'ภูมิ']);
  assert.equal(cast.find((c) => c.name === 'ภูมิ').photo, true);
  assert.equal(cast.find((c) => c.name === 'ต้น').seedSlot, 'other1');
  assert.equal(charRefName(0, 2), 'char-01-v2.png');
  const P = await import('./prompts.js');
  assert.equal(P.novelStyleKey('box'), 'novel');
  assert.equal(P.novelStyleKey('sketch'), 'novel');
  assert.equal(P.novelStyleKey('riso'), 'riso');
  const fig = P.flowFictionFigurePrompt({ book: {}, fig: { subject: 'x' }, styleKey: 'novel', palette: [{ hex: '#C0392B' }] });
  assert.match(fig, /full-colour digital illustration/);
  assert.match(fig, /never a monochrome or single-tint wash/);
  assert.doesNotMatch(fig, /colours in the family of/);
  const sheet = P.characterSheetPrompt({}, { name: 'ภูมิ' }, { styleKey: 'novel', fromPhoto: true });
  assert.match(sheet, /THE ATTACHED PHOTO IS THIS CHARACTER/);
  assert.match(machine, /refs: from \? \[from\] : \[\]/);
  const cover = P.flowNovelCoverPrompt({ book: { title: 'ค', fictionGenre: 'โรแมนซ์' }, outline: { thesis: 'x' }, people: [{ name: 'ฟ้า' }] });
  assert.match(cover, /attached image 1 = ฟ้า/);
  assert.match(cover, /not a generic stock photo, not people posing at a table/);
  assert.match(cover, /romance cover convention/);
  assert.match(P.flowNovelCoverPrompt({ book: {}, back: true }), /no main character faces/);
  // ปกนิยายไม่ส่งรูปผู้เขียนให้ Flow (เคยถูกแปะรูปดิบลงปกหลัง) ให้ Typst วางแทน
  assert.match(machine, /!novelCover && j.kind !== 'interior'/);
  assert.match(P.backCoverCopyPrompt({ contentMode: 'fiction' }, {}), /ห้ามมี bullet/);
  assert.match(machine, /existing\.meta\?\.novelStyle !== P\.NOVEL_STYLE_V/);
});

/** ผู้ใช้ขอ: วิธีสร้างปกตามประเภทหนังสือสำหรับ Google Flow — ใช้เฉพาะโหมดนี้ */
test('สูตรปกตามประเภทหนังสือ: ใช้เฉพาะเส้นทาง Flow และเดาประเภทถูก', async () => {
  const { flowGenreFor, FLOW_GENRES } = await import('./flow-genres.js');
  assert.equal(flowGenreFor({ contentMode: 'fiction', fictionGenre: 'fantasy', topic: 'นิยายรัก', outline: { thesis: 'ความรักของคนแปลกหน้า' } }).key, 'romance');
  assert.equal(flowGenreFor({ contentMode: 'fiction', fictionGenre: 'fantasy', topic: 'จอมเวทกับมังกร ความรัก' }).key, 'fantasy');
  assert.equal(flowGenreFor({ contentMode: 'fiction', fictionGenre: 'mystery' }).key, 'thriller');
  assert.equal(flowGenreFor({ contentMode: 'prose', genre: 'how-to', topic: 'ทำอาหารไทย' }).key, 'food');
  assert.equal(flowGenreFor({ contentMode: 'prose', genre: 'self' }).key, 'selfhelp');
  for (const g of FLOW_GENRES) for (const k of ['style', 'cover', 'light', 'titleSpace', 'back']) assert.ok(g[k], `${g.key}.${k}`);
  const P = await import('./prompts.js');
  const thriller = { contentMode: 'fiction', fictionGenre: 'thriller', title: 't' };
  assert.match(P.flowNovelCoverPrompt({ book: thriller }), /thriller cover convention/);
  assert.match(P.characterSheetPrompt(thriller, { name: 'a' }, { styleKey: 'novel' }), /film-noir/);
  assert.match(P.flowGenreCoverDirection({ contentMode: 'prose', genre: 'business' }), /GENRE COVER CONVENTION \(business\)/);
  // โหมดอื่นไม่เรียกของพวกนี้เลย — ผู้เรียกมีแค่ ensureFlowCast / imagesViaFlow
  for (const src of [await readFile(new URL('./export.js', import.meta.url), 'utf8'), await readFile(new URL('../ui/studio.js', import.meta.url), 'utf8')]) {
    assert.doesNotMatch(src, /flowGenreFor|flowGenreCoverDirection|flowNovelCoverPrompt/);
  }
});

/** ผู้ใช้ขอ: บันทึกอ้างอิงของตัวละครไว้ใช้ (คลังตัวละครข้ามเล่ม) */
test('คลังตัวละคร: เก็บภาพต้นแบบทุกตัว และเลือกจากคลังแล้วใช้ภาพเดิมไม่วาดใหม่', async () => {
  const lib = await readFile(new URL('./cast-library.js', import.meta.url), 'utf8');
  assert.match(lib, /export const CAST_LIBRARY = '__cast_library__'/);
  assert.match(lib, /W\.saveCharacterFile\(file, blob, meta\)/);
  assert.match(machine, /if \(c\.fromLibrary && photoRef\) \{/);
  assert.match(machine, /if \(!asset\.meta\?\.inLibrary\) \{\n        const saved = await saveToLibrary\(/);
  const { fictionCast } = await import('./flow.js');
  const cast = fictionCast({ castSeeds: [{ slot: 'heroine', name: 'ฟ้า', photo: true, fromLibrary: true }] });
  assert.equal(cast[0].fromLibrary, true);
  const studio = await readFile(new URL('../ui/studio.js', import.meta.url), 'utf8');
  assert.match(studio, /fromLibrary: photo && row\?\.dataset\.lib === '1'/);
  assert.match(studio, /data-cast-lib/);
});

/** ผู้ใช้ทัก: "ไม่เห็นบันทึกตัวละครให้เลย" — ภาพต้นแบบที่วาดไว้ก่อนมีคลัง/เล่มที่ภาพครบแล้ว ไม่เคยเข้าคลัง */
test('คลังตัวละคร: เปิดคลังแล้วเก็บภาพต้นแบบที่มีอยู่ในทุกเล่มเข้าคลังก่อน', async () => {
  const lib = await readFile(new URL('./cast-library.js', import.meta.url), 'utf8');
  assert.match(lib, /export async function listLibrary\(\) \{\n  await backfillLibrary\(\);/);
  assert.match(lib, /if \(m\.kind !== 'character' \|\| m\.inLibrary \|\| !r\.blob\?\.size \|\| !m\.character\) continue;/);
  assert.match(lib, /inLibrary: saved/);
});

/** ผู้ใช้สั่ง: ไม่มีหน้า ChatGPT เปิดอยู่ = เปิดแท็บใหม่ ไม่เปิดหน้าต่างใหม่ */
test('เปิด ChatGPT เป็นแท็บใหม่ในหน้าต่างเดิม ไม่เปิดหน้าต่างใหม่', () => {
  const fn = sw.slice(sw.indexOf('async function ensureChatTab'), sw.indexOf('function waitForComplete'));
  assert.doesNotMatch(fn, /chrome\.windows\.create/);
  assert.match(fn, /chrome\.tabs\.create\(\{ url: 'https:\/\/chatgpt\.com\/', active: false/);
  assert.match(fn, /await S\.get\('studioTabId'\)/);
});

/** ผู้ใช้ขอ: Flow แจ้ง "เราพบกิจกรรมที่ผิดปกติ" (ล้มเต็มจอหลายใบ) → หยุดก่อน ไม่ลองซ้ำ */
test('Flow พบกิจกรรมที่ผิดปกติ: หยุดทั้งคิวภาพทันที และตัวกดทำต่อให้เองพัก 45 นาที', async () => {
  const flowAdapter = await readFile(new URL('../adapter/flow.js', import.meta.url), 'utf8');
  const m = /const UNUSUAL_TEXT = (\/.*\/i);/.exec(flowAdapter);
  const UNUSUAL = eval(m[1]);
  assert.ok(UNUSUAL.test('ล้มเหลว เราพบกิจกรรมที่ผิดปกติบางอย่าง โปรดไปที่ศูนย์ช่วยเหลือ'));
  assert.ok(UNUSUAL.test('We noticed some unusual activity'));
  assert.ok(!UNUSUAL.test('Flow สร้างภาพไม่สำเร็จ: policy'));
  assert.match(flowAdapter, /e\.code = UNUSUAL_TEXT\.test\(why\) \? 'unusual_activity' : 'generation_failed';/);
  // เครื่อง: ภาพในเล่มและภาพตัวละคร หยุดทันที ไม่ลองซ้ำ
  assert.match(machine, /if \(res\.code === 'unusual_activity' \|\| \/กิจกรรมที่ผิดปกติ\|unusual activity\/i\.test\(flowError\)\) \{\n\s+return await this\.stopFlowUnusual\(/);
  assert.match(machine, /throw new Halt\('Google Flow แจ้ง "พบกิจกรรมที่ผิดปกติ" ตอนวาดภาพต้นแบบตัวละคร/);
  assert.match(machine, /this\.job\.cooldownUntil = Date\.now\(\) \+ FLOW_UNUSUAL_COOLDOWN_MS;/);
  // ตัวกดทำต่อให้เองเคารพช่วงพัก
  const studio = await readFile(new URL('../ui/studio.js', import.meta.url), 'utf8');
  const src = studio.slice(studio.indexOf('function shouldAutoContinue'), studio.indexOf('\n}\n', studio.indexOf('function shouldAutoContinue')) + 2);
  const shouldAutoContinue = new Function('AUTO_CONTINUE_QUIET_MS', `${src}; return shouldAutoContinue;`)(1000);
  const job = { step: 'gate_images', status: 'waiting_human' };
  assert.equal(shouldAutoContinue({ unattended: true, busy: false, job: { ...job, cooldownUntil: Date.now() + 60000 }, quietMs: 5000 }), false);
  assert.equal(shouldAutoContinue({ unattended: true, busy: false, job: { ...job, cooldownUntil: Date.now() - 1 }, quietMs: 5000 }), true);
});

/** ผู้ใช้ตกลง: สั่ง Flow เป็นจังหวะ ไม่รัว — เว้น 20–45 วิ · ล้มรอ 1 แล้ว 3 นาที · ไม่เกิน 22 คำขอ/ชั่วโมง */
test('จังหวะการสั่ง Flow: เว้นระยะ รอนานขึ้นเมื่อล้ม และพักเมื่อครบโควตาชั่วโมง', async () => {
  const start = machine.indexOf('  async flowPace(');
  let depth = 0, end = machine.indexOf(') {', start) + 2;
  for (let k = end; k < machine.length; k++) { if (machine[k] === '{') depth++; else if (machine[k] === '}' && !--depth) { end = k + 1; break; } }
  const body = machine.slice(start, end).replace('async flowPace(', 'async function flowPace(');
  const consts = ['FLOW_GAP_MS', 'FLOW_RETRY_WAIT_MS', 'FLOW_HOURLY_CAP'].map((n) => /const (\w+) = [^;]+;/.exec(machine.slice(machine.indexOf(`const ${n} =`)))[0]).join('\n');
  const run = async ({ recent = [], retryWait = 0 }) => {
    let clock = 10_000_000;
    const waits = [];
    const Date = { now: () => clock };
    const sleep = async (ms) => { waits.push(ms); clock += ms; };
    const fn = new Function('Date', 'sleep', 'Halt', 'Math', `${consts}\nreturn ${body};`)(Date, sleep, Error, Object.assign(Object.create(Math), { random: () => 0 }));
    const self = { book: { imagePhase: { flowRecent: recent.map((d) => clock - d) } }, stopRequested: false, logs: [], log(l, m) { this.logs.push(m); }, emit() {} };
    await fn.call(self, { name: 'x.png', what: 'ภาพ' }, 0, 1, { retryWait });
    return { waited: waits.reduce((a, b) => a + b, 0), logs: self.logs, stamps: self.book.imagePhase.flowRecent.length };
  };
  assert.equal((await run({})).waited, 0, 'คำขอแรกไม่ต้องรอ');
  assert.equal((await run({ recent: [5000] })).waited, 15000, 'เพิ่งสั่งไป 5 วิ → รอให้ครบ 20 วิ');
  assert.equal((await run({ recent: [5000], retryWait: 60000 })).waited, 60000, 'ล้มแล้วรอ 1 นาที');
  const capped = await run({ recent: Array.from({ length: 22 }, (_, i) => 3_000_000 - i * 100_000) });
  assert.ok(capped.waited >= 500_000, 'ครบ 22 คำขอในชั่วโมง → พักจนคำขอแรกพ้นหนึ่งชั่วโมง');
  assert.match(capped.logs[0], /ครบ 22 คำขอในหนึ่งชั่วโมง/);
  assert.equal(capped.stamps, 23);
});

/** ผู้ใช้สั่ง: ภาพประกอบโหมด 1 หน้า 1 ภาพ เป็นการ์ตูนลายเส้นแบบโปรเจกต์ Youtube Free animation Auto (เฉพาะภาพในเล่ม) */
test('โหมด 1 หน้า 1 ภาพ: ภาพในเล่มเป็นการ์ตูนลายเส้น doodle เสมอ · ปกไม่เกี่ยว', async () => {
  const P = await import('./prompts.js');
  assert.match(P.FIGURE_STYLES.doodle.brief, /2D doodle cartoon/);
  assert.match(P.FIGURE_STYLES.doodle.brief, /never photographic/);
  assert.match(machine, /const interiorStyle = pageAgent \? 'doodle' : this\.book\.figureStyle \|\| 'box';/);
  assert.match(machine, /const requested = interiorStyle;/);
  const fig = P.flowFictionFigurePrompt({ book: {}, fig: { subject: 'x' }, styleKey: 'doodle', people: [{ name: 'ก', ref: { name: 'r' } }] });
  assert.match(fig, /doodle cartoon/);
  assert.match(fig, /draw each character from their reference sheet in this doodle style/);
  assert.match(P.flowFigurePrompt({ book: {}, fig: { subject: 'x' }, styleKey: 'doodle' }), /doodle cartoon/);
  // ปกยังใช้สูตรปกของตัวเอง ไม่ถูกบังคับเป็น doodle
  assert.doesNotMatch(P.flowNovelCoverPrompt({ book: { illustrationLevel: 'page' }, outline: {} }), /doodle cartoon|STYLE BIBLE/);
});

/** ผู้ใช้เลือก: ภาพ 1 หน้า 1 ภาพ ส่งเป็นชุดผ่าน Flow Agent แบบโปรเจกต์ Youtube — ไม่สั่งทีละรูป */
test('Flow Agent: ภาพ 1 หน้า 1 ภาพ วาดเป็นชุด แล้วหยิบตามชื่อ ไม่สร้างทีละรูป', async () => {
  const flowAdapter = await readFile(new URL('../adapter/flow.js', import.meta.url), 'utf8');
  const P = await import('./prompts.js');
  // brief: STYLE BIBLE (doodle) · CHARACTER LOCK · RULES (ตั้งชื่อตามไฟล์ ห้ามตัวหนังสือ) · บรรทัดช็อตขึ้นต้นด้วยชื่อไฟล์
  const shots = [{ name: 'fig-1.1-1.png', subject: 'Emmy opens the door', people: ['เอมมี่'], passage: 'เอมมี่เปิดประตู' }];
  const brief = P.flowAgentBrief({ book: { contentMode: 'fiction' }, shots, cast: [{ name: 'เอมมี่', attached: 1 }], ratio: '4:3' });
  assert.match(brief, /\[STYLE BIBLE\]\nhand-drawn 2D doodle cartoon/);
  assert.match(brief, /- เอมมี่ = attached image 1/);
  assert.match(brief, /Name each image EXACTLY as the filename/);
  assert.match(brief, /Absolutely NO text in any image/);
  assert.match(brief, /\nfig-1\.1-1\.png SHOT 01 \| Chars: เอมมี่ \| Scene: Emmy opens the door \| Story: เอมมี่เปิดประตู$/);
  assert.equal(P.flowAgentShotLine(shots[0], 0), 'fig-1.1-1.png SHOT 01 | Chars: เอมมี่ | Scene: Emmy opens the door | Story: เอมมี่เปิดประตู');
  // adapter: ตรวจ 0 เครดิตก่อน · ตั้ง Agent ไม่ต้องยืนยัน · เว้น 2 นาทีระหว่างข้อความ · หยุดเมื่อกิจกรรมผิดปกติ · หยิบตามชื่อไม่สร้างใหม่
  assert.match(flowAdapter, /const OPS = \{ prepare: opPrepare, generate: opGenerate, agentBatch: opAgentBatch \};/);
  assert.match(flowAdapter, /const cfg = await configure\(\{ ratio: args\.ratio, models: args\.models \}\);/);
  assert.match(flowAdapter, /const AGENT_GAP_MS = 2 \* 60000;/);
  assert.match(flowAdapter, /e\.code = 'unusual_activity';/);
  assert.match(flowAdapter, /if \(args\.onlyExisting\) \{/);
  assert.match(flowAdapter, /e\.code = 'not_found';/);
  // เครื่อง: ชุดละไม่เกิน 10 · ภาพในเล่มหยิบอย่างเดียว ไม่เว้นจังหวะ ไม่ลองสร้างซ้ำ
  assert.match(machine, /const AGENT_BATCH = 10;/);
  assert.match(machine, /if \(pageAgent && \(await this\.flowAgentBatches\(jobs, castRefs, genErrors, authorFig\)\)\) return true;/);
  assert.match(machine, /onlyExisting: fromAgent,/);
  assert.match(machine, /if \(fromAgent && res\.code === 'not_found'\) break;/);
  assert.match(machine, /if \(!fromAgent\) await this\.flowPace\(/);
});

/** ผู้ใช้สั่ง: ปกสร้าง prompt แบบ Ebook Auto to GPT Free (GPT Art Director) แต่ส่งไปวาดใน Google Flow */
test('ปกโหมด Flow: ใช้ prompt ของ GPT Art Director ตรง ๆ ไม่ทับด้วยสูตร Flow', async () => {
  const P = await import('./prompts.js');
  assert.ok(!machine.includes('prompt = P.flowNovelCoverPrompt('));
  assert.ok(!machine.includes('P.flowGenreCoverDirection('));
  assert.ok(!machine.includes('${P.FLOW_COVER_PUNCH}'));
  assert.ok(machine.includes('const frontPrompt = book.style ? P.frontCoverPrompt(book.style, book, book.outline || {})'));
  assert.ok(machine.includes('CHARACTER REFERENCES: '));
  assert.ok(machine.includes("unwrapped.replace(castNote, '')"));
  assert.equal(P.FLOW_COVER_V, 6);
  assert.ok(machine.includes('const needCoverV = P.FLOW_COVER_V;'));
  assert.ok(machine.includes("coverPromptV: j.kind === 'cover' ? P.FLOW_COVER_V : null"));
});

/** ผู้ใช้: "ภาพแบบ doodle ก็จริง แต่ถ้าเลือกให้เป็นหน้าเรา ก็ต้องเป็นหน้าเราด้วยนะ ทั้งหมดเลย" */
test('เลือกหน้าผู้เขียนในภาพประกอบ: ทุกรูปใน Flow เป็นหน้าผู้เขียน รวม doodle และชุด Agent', async () => {
  const P = await import('./prompts.js');
  const withAuthor = P.flowFigurePrompt({ book: {}, fig: { subject: 'x' }, styleKey: 'doodle', author: { name: 'ก', attached: 1 } });
  assert.match(withAuthor, /THE PERSON IN THIS PICTURE IS THE AUTHOR \(attached image 1\)/);
  assert.match(withAuthor, /2D doodle cartoon/);
  assert.doesNotMatch(withAuthor, /anonymous ordinary learner/);
  assert.match(P.flowFigurePrompt({ book: {}, fig: { subject: 'x' } }), /never the book's author/);
  const brief = P.flowAgentBrief({ book: {}, shots: [{ name: 'a.png', subject: 's', people: ['ก'] }], cast: [{ name: 'ก', attached: 1, author: true }] });
  assert.match(brief, /ก = attached image 1/);
  assert.match(brief, /ก is the book's author and appears in EVERY shot/);
  assert.doesNotMatch(P.flowAgentBrief({ book: { contentMode: 'fiction' }, shots: [], cast: [{ name: 'ก', attached: 1, author: true }] }), /appears in EVERY shot/);
  const sheet = P.characterSheetPrompt({}, { name: 'ก' }, { styleText: P.flowFigureStyle('doodle'), fromPhoto: true, author: true });
  assert.match(sheet, /Reference sheet of the author/);
  assert.match(sheet, /THE ATTACHED PHOTO IS THIS CHARACTER/);
  assert.match(sheet, /2D doodle cartoon/);
  // ต่อสายครบ: วาดภาพต้นแบบก่อน · แนบทั้งทางทีละรูปและทางชุด Agent · ภาพเก่าที่ไม่มีหน้าผู้เขียนวาดใหม่
  assert.ok(machine.includes('await this.ensureFlowAuthorSheet(interiorStyle'));
  assert.ok(machine.includes('this.flowAgentBatches(jobs, castRefs, genErrors, authorFig)'));
  assert.ok(machine.includes("authorFig ? [{ ...authorFig, name: 'THE AUTHOR' }] : []"));
  assert.ok(machine.includes("author: authorFig?.ref ? { name: authorFig.name, attached: refs.length } : null"));
  assert.ok(machine.includes("authorFace: j.kind === 'interior' && !!authorFig?.ref"));
  assert.ok(machine.includes('!!authorFig && existing?.meta?.from === \'flow\' && !existing.meta?.authorFace'));
});

/** ผู้ใช้: "ปกหลังทุเรศมาก ปกหน้าเชยมาก ให้ทำเป็นแนว poster หนังสิ" (ส่งภาพปกคู่มือรับมือหวัดมา) */
test('ปกโหมด Flow แนวโปสเตอร์หนัง · ปกหลังไม่มีหน้าผู้เขียนซ้อนสองรูป', async () => {
  const P = await import('./prompts.js');
  assert.match(P.FLOW_POSTER_FRONT, /MOVIE-POSTER KEY ART/);
  assert.match(P.FLOW_POSTER_FRONT, /never a flat front-on shot of someone sitting at a desk writing/i);
  assert.match(P.FLOW_POSTER_BACK, /NEVER put the text on a sheet of paper/);
  assert.match(P.FLOW_POSTER_BACK, /NEVER show a book, a desk, a table/);
  // ปกทั้งใบใช้คำสั่งโปสเตอร์ของตัวเอง (ผู้ใช้: "เอาปกเป็นแนวแบบ poster หนังไม่ได้หรอ")
  assert.ok(machine.includes('P.flowPosterCoverPrompt({'));
  assert.ok(machine.includes('prompt = build(onCover);'));
  // ปกหลัง (ผู้ใช้: "ยกเลิกการแนบภาพตรงๆ แบบนี้"): ไม่แปะรูปถ่าย · Flow วาดผู้เขียนเป็นคนในภาพจากรูปต้นแบบ — หน้าเดียว ไม่ซ้อน
  assert.ok(machine.includes("const backFace = j.name === 'cover-back.png' && !!this.book.authorPhotoOnCover;"));
  const style = { style: 's', texture: 't', lighting: 'l', background_element: 'b', palette: [] };
  // ทุกโหมด (ผู้ใช้: "ยกเลิกทุกโหมดเลย") — Flow และ ChatGPT เหมือนกัน
  for (const book of [
    { imageSource: 'flow', authorRefTargets: ['cover-back'] },
    { imageSource: 'flow', authorPhotoOnCover: true },
    { authorRefTargets: ['cover-back'] },
    { authorPhotoOnCover: true },
  ]) {
    const back = P.backCoverPrompt(style, book);
    assert.match(back, /appears as a person INSIDE this back-cover scene/);
    assert.match(back, /Never a rectangular photo inset, never a pasted headshot/);
    assert.doesNotMatch(back, /will be overlaid there later|Include a small author portrait/);
  }
  assert.doesNotMatch(P.backCoverPrompt(style, {}), /author/i, 'ไม่เลือก = ไม่มีผู้เขียนบนปกหลัง');
  // เครื่องเรียงพิมพ์และปกกางเต็มไม่แปะรูปถ่ายเลย
  const tpl = await readFile(new URL('../typeset/template.js', import.meta.url), 'utf8');
  assert.match(tpl, /const wantsPhoto = false;/);
  const exp = await readFile(new URL('./export.js', import.meta.url), 'utf8');
  assert.match(exp, /const showAuthorPhoto = false;/);
  // โหมด ChatGPT ก็แนบรูปให้โมเดลดูหน้าตาเมื่อเลือกผู้เขียนบนปกหลัง
  assert.ok(machine.includes("const needsRef = (j.name === 'cover-back.png' && !!this.book.authorPhotoOnCover) || wantsAuthorRef(this.book, j)"));
});

/** ผู้ใช้: "อยากให้คิดเครื่องแต่งกายตัวละครให้เหมาะสมกับเนื้อเรื่องในทุกภาพ ไม่ใช่ใช้แต่ชุดในภาพที่แนบไป" */
test('ชุดตามฉาก: ภาพต้นแบบล็อกแค่หน้าตา · แผนภาพกำหนดชุดต่อภาพ · ทุกจุดที่แนบภาพไม่สั่งให้ใส่ชุดเดิม', async () => {
  const P = await import('./prompts.js');
  globalThis.chrome ||= { runtime: { onMessage: { addListener() {} } } };
  const { cleanWardrobe } = await import('./machine.js');
  const people = [{ name: 'มีรา', ref: { name: 'char-01.png' } }];
  const fig = { subject: 'Mira reads a letter at night', wardrobe: { มีรา: 'faded cotton pyjamas and a cardigan' } };
  const p = P.flowFictionFigurePrompt({ book: {}, fig, people, styleKey: 'doodle' });
  assert.match(p, /They do NOT fix what they wear/);
  assert.match(p, /- มีรา: faded cotton pyjamas and a cardigan/);
  assert.doesNotMatch(p, /body type and outfit|same face, hair, outfit/);
  // แผนภาพเก่าที่ไม่มีช่อง wardrobe ยังได้กติกาชุดตามฉาก
  assert.match(P.flowFictionFigurePrompt({ book: {}, fig: { subject: 'x' }, people }), /Dress every person for THIS moment/);
  // Flow Agent: ไม่ล็อกชุด · บรรทัดช็อตบอกชุดของช็อตนั้น
  const brief = P.flowAgentBrief({ book: { contentMode: 'fiction' }, shots: [{ name: 'a.png', subject: 's', people: ['มีรา'], wardrobe: fig.wardrobe }], cast: [{ name: 'มีรา', attached: 1 }] });
  assert.doesNotMatch(brief, /glasses, outfit and colours/);
  assert.match(brief, /a\.png SHOT 01 \| Chars: มีรา \| Wear: มีรา: faded cotton pyjamas/);
  // ภาพต้นแบบ: ชุดเป็นแค่ค่าตั้งต้น
  assert.match(P.characterSheetPrompt({}, { name: 'มีรา' }), /only a neutral everyday default/);
  // ผู้เขียนในภาพประกอบ / ปกหลัง / รูปแนบ
  assert.match(P.flowAuthorFigureRule({ attached: 1 }), /not in the clothes from the reference/);
  assert.match(P.backCoverPrompt({ style: 's', texture: 't', lighting: 'l', background_element: 'b', palette: [] }, { authorPhotoOnCover: true }), /dressed for this scene \(not in the clothes from the photo\)/);
  const { AUTHOR_REF_RULE } = await import('./imageRef.js');
  assert.match(AUTHOR_REF_RULE, /not in the clothes from the photo/);
  // แผนภาพนิยายขอช่อง wardrobe · machine เก็บและส่งต่อ
  assert.match(P.fictionPagePlanPrompt({ bible: {} }, { cast: [] }, [{ key: '1.1-1', text: 'x' }]), /- wardrobe: ชุดที่ตัวละครแต่ละคนใส่/);
  assert.deepEqual(cleanWardrobe({ มีรา: ' raincoat ', ต้น: '' }), { มีรา: 'raincoat' });
  assert.equal(cleanWardrobe(['x']), undefined);
  assert.match(machine, /wardrobe: cleanWardrobe\(f\.wardrobe\),/);
  assert.match(machine, /people: people\.map\(\(c\) => c\.name\), wardrobe: fig\.wardrobe, layout: /);
  assert.doesNotMatch(machine, /keep their face, hair and outfit identity/);
});

/** ผู้ใช้: "ชอบภาพที่แสดงเป็นขั้นตอนแบบนี้ … เล่มล่าสุดดูไม่มีอะไรเลย เหมือนภาพซ้ำ ๆ เดิม ๆ" */
test('ภาพไม่ซ้ำเดิม: แผนภาพเลือก layout · ผู้เขียนไม่ต้องนั่งโต๊ะทุกรูป · ภาพต้นแบบพื้นขาวล้วน', async () => {
  const P = await import('./prompts.js');
  assert.deepEqual(P.FIGURE_LAYOUT_KEYS, ['steps', 'compare', 'flow', 'thought', 'closeup', 'scene']);
  // แผนภาพสารคดีขอ layout และบังคับความหลากหลาย
  const plan = P.prosePagePlanPrompt({}, {}, [{ key: '1.1-1', section: '1.1', page: 1, of: 1, text: 'x' }]);
  assert.match(plan, /ห้ามใช้ layout เดียวกันเกิน 2 ภาพติดกัน/);
  assert.match(plan, /ห้ามให้ทุกภาพอยู่ที่โต๊ะทำงานหรือห้องเดิม/);
  assert.match(plan, /"layout":"steps"/);
  // layout จากแผนภาพถูกใช้จริง · แผนเก่าเดาจากคำ
  assert.match(P.flowFigurePrompt({ book: {}, fig: { subject: 'x', layout: 'thought' } }), /thought bubbles/);
  assert.match(P.flowFigurePrompt({ book: {}, fig: { subject: 'x', layout: 'compare' } }), /split picture/);
  assert.match(P.flowFigurePrompt({ book: {}, fig: { subject: 'three steps to plan' } }), /step number 1, 2, 3, 4/);
  // ผู้เขียน: ไม่ลอกห้องของภาพต้นแบบ ไม่ต้องนั่งโต๊ะ
  const a = P.flowAuthorFigureRule({ attached: 1 });
  assert.match(a, /ignore its background, room, desk, furniture, props and pose/);
  assert.match(a, /they do not have to sit at a desk/);
  // Flow Agent: บรรทัดช็อตบอก Layout · กติกาความหลากหลาย
  const brief = P.flowAgentBrief({ book: {}, shots: [{ name: 'a.png', subject: 's', people: ['ก'], layout: 'steps' }], cast: [{ name: 'ก', attached: 1, author: true }] });
  assert.match(brief, /\| Layout: steps \|/);
  assert.match(brief, /VARIETY: consecutive images must differ in place, layout and camera distance/);
  assert.match(brief, /never copy its room, desk, bookshelf, lamp or pose/);
  // ภาพต้นแบบพื้นขาวล้วน แม้สไตล์จะสั่งให้มีสถานที่
  const sheet = P.characterSheetPrompt({}, { name: 'ก' }, { styleText: P.flowFigureStyle('doodle'), fromPhoto: true, author: true });
  assert.match(sheet, /SHEET RULE \(overrides any location or props in the style\): plain flat white background only/);
  // machine เก็บ layout จากแผนภาพ · ภาพต้นแบบผู้เขียนรุ่นใหม่ถูกวาดใหม่
  assert.match(machine, /layout: P\.FIGURE_LAYOUTS\[f\.layout\] \? f\.layout : undefined,/);
  assert.match(machine, /author-sheet-\$\{styleKey \|\| 'plain'\}-v2\.png/);
});

/** ผู้ใช้ส่งภาพหน้า 101 และ 45: ใต้ภาพมีชื่อไฟล์ "fig-4.3-3.png" และ "Fig-3.1-1: คฑาวุฐ สุมาลี applies …" ที่ Flow วาดลงในภาพ */
test('ภาพประกอบไม่มีชื่อไฟล์/คำบรรยาย/ชื่อคนวาดอยู่ในภาพ', async () => {
  const P = await import('./prompts.js');
  const { flowPrompt } = await import('./flow.js');
  const brief = P.flowAgentBrief({ book: {}, shots: [{ name: 'fig-4.3-3.png', subject: 's', people: ['THE AUTHOR'] }], cast: [{ name: 'THE AUTHOR', attached: 1, author: true }] });
  assert.match(brief, /NEVER DRAW THE FILENAME OR ANY LABEL INTO THE PICTURE/);
  assert.match(brief, /Names after "Chars:" only tell you who is in the shot — never write any name in the image/);
  assert.match(machine, /authorFig \? \[\{ \.\.\.authorFig, name: 'THE AUTHOR' \}\] : \[\]/);
  assert.match(flowPrompt({ kind: 'interior', prompt: 'x' }, { label: '4:3' }), /NO LABELS IN THE PICTURE/);
  assert.doesNotMatch(flowPrompt({ kind: 'cover', prompt: 'x', textBaked: true }, { label: '3:4' }), /NO LABELS IN THE PICTURE/, 'ปกยังมีตัวหนังสือตามที่สั่ง');
});

/** ผู้ใช้: "หน้าปกยังเชยมาก" — ได้ผู้เขียนยืนเท้าโต๊ะในออฟฟิศ มีโทรศัพท์บนโต๊ะ ชื่อเรื่องตัวขาวธรรมดา ชื่อรองยาว 4 บรรทัด */
test('ปกหน้าโปสเตอร์: ภาพเปรียบเทียบใหญ่ ห้ามฉากออฟฟิศ · ตัวชื่อเรื่องแบบโปสเตอร์ · ชื่อรองยาวไม่ใส่ · ย้ำท้ายคำสั่ง', async () => {
  const P = await import('./prompts.js');
  assert.match(P.FLOW_POSTER_FRONT, /ONE big, surprising visual metaphor/);
  assert.match(P.FLOW_POSTER_FRONT, /NEVER a literal office, meeting room, desk, laptop, notebook or phone on a table/);
  assert.match(P.FLOW_POSTER_FRONT, /designed display lettering, not plain white type/);
  assert.match(P.FLOW_POSTER_REMINDER, /FINAL CHECK — this must be a MOVIE POSTER, not a stock photo/);
  const style = { style: 's', texture: 't', lighting: 'l', mood: 'm', palette: [], typography: {} };
  const longSub = 'คู่มือเริ่มต้นฝึกธรรมะจากเรื่องที่เกิดขึ้นจริงในแต่ละวัน ตั้งแต่รู้ทันความคิดและอารมณ์ ไปจนถึงรับมือความทุกข์';
  const flowFront = P.frontCoverPrompt(style, { imageSource: 'flow', topic: 't' }, { title: 'ธรรมะทีละขั้น', subtitle: longSub });
  assert.doesNotMatch(flowFront, /SUBTITLE/);
  assert.match(P.frontCoverPrompt(style, { imageSource: 'flow', topic: 't' }, { title: 'ก', subtitle: 'ใจสงบใน 7 วัน' }), /SUBTITLE \(exact characters\): "ใจสงบใน 7 วัน"/);
  assert.match(P.frontCoverPrompt(style, { topic: 't' }, { title: 'ก', subtitle: longSub }), /SUBTITLE/, 'โหมดอื่นยังใส่ชื่อรองเต็มตามเดิม');
});

/** ผู้ใช้: "เอาปกเป็นแนวแบบ poster หนังไม่ได้หรอ" — ปกทั้งใบเป็นคำสั่งโปสเตอร์ ไม่ใช่คำสั่ง Art Director ที่ต่อท้ายด้วยโปสเตอร์ */
test('ปกโปสเตอร์หนัง: คำสั่งของตัวเอง สั้น ใช้ความคิดของ Art Director เป็นวัตถุดิบ', async () => {
  const P = await import('./prompts.js');
  const book = { imageSource: 'flow', language: 'th', genre: 'self', author: 'คฑาวุฐ สุมาลี', coverDigest: { one_line: 'ฝึกธรรมะจากเรื่องจริงในแต่ละวัน' },
    backCoverCopy: { hook: 'ใจวุ่นได้ แต่ไม่ต้องจมอยู่ตรงนั้น', body: 'b', bullets: ['x', 'y'] } };
  const outline = { title: 'ธรรมะทีละขั้น', subtitle: 'คู่มือเริ่มต้นฝึกธรรมะจากเรื่องที่เกิดขึ้นจริงในแต่ละวัน ตั้งแต่รู้ทันความคิดและอารมณ์' };
  const style = { visual_metaphor: 'a storm of thoughts swirling around a calm person', lighting: 'dawn light', palette: [{ name: 'teal' }], mood: 'hopeful' };
  const front = P.flowPosterCoverPrompt({ book, outline, style, authorAttached: true });
  assert.match(front, /^MOVIE POSTER — design this FRONT COVER exactly like the key art of a theatrical film poster/);
  assert.match(front, /KEY ART CONCEPT .*a storm of thoughts swirling around a calm person/);
  assert.match(front, /THE HERO IS THE AUTHOR/);
  assert.match(front, /- TITLE \(huge display lettering/);
  assert.match(front, /- AUTHOR \(small, like a film credit, ONCE only — at the bottom edge\): "คฑาวุฐ สุมาลี"/);
  assert.match(front, /Each text item appears exactly once/);
  assert.doesNotMatch(front, /TAGLINE/, 'ชื่อรองยาวเกิน tagline ไม่ใส่บนปกหน้า');
  assert.match(front, /NEVER: an office, meeting room, desk, computer screen, laptop, notebook or phone on a table; background crowds or silhouettes of office workers/);
  // ทดสอบจริง: Flow เติมออฟฟิศและเงาคนไว้ด้านหลังตัวเอก — พื้นหลังต้องเป็นตัวคอนเซปต์เอง
  assert.match(front, /BACKGROUND: the concept itself is the world behind the hero/);
  assert.ok(front.length < 3500, `คำสั่งปกต้องสั้น (${front.length})`);
  const back = P.flowPosterCoverPrompt({ book, outline, style, back: true, authorInBack: true });
  assert.match(back, /BACK COVER of the same/);
  assert.match(back, /- HEADLINE \(large, bold\): "ใจวุ่นได้ แต่ไม่ต้องจมอยู่ตรงนั้น"/);
  assert.match(back, /- BULLET: "x"/);
  assert.match(back, /The author \(face from the attached photo\) appears as a person inside this scene/);
  // นิยาย: ตัวละครหลักเป็นพระเอกของโปสเตอร์
  const novel = P.flowPosterCoverPrompt({ book: { ...book, contentMode: 'fiction', fictionGenre: 'โรแมนซ์' }, outline, style, people: [{ name: 'ฟ้า' }] });
  assert.match(novel, /THE HEROES — attached reference sheets.*attached image 1 = ฟ้า/);
});

/** ผู้ใช้: "อยากปรับโทนสี มูทให้ตรงกับเนื้อเรื่องด้วย" */
test('ปกโปสเตอร์: โทนสีและอารมณ์มาจากเนื้อเรื่อง ไม่ใช่โทนหนังมืดตายตัว', async () => {
  const P = await import('./prompts.js');
  const calm = { imageSource: 'flow', genre: 'self', coverDigest: { one_line: 'x', energy: { label: 'สงบ อบอุ่น มีความหวัง', level: 2 }, emotional_arc: 'จากใจวุ่นวายสู่ความสงบ', palette_brief: { temperature: 'warm', saturation: 'medium', value_key: 'light', must_feel: 'สงบ โปร่ง', must_not_feel: 'มืด ตึงเครียด' } } };
  const p = P.flowPosterCoverPrompt({ book: calm, outline: { title: 't' }, style: { palette: [{ name: 'soft gold' }] } });
  assert.match(p, /not a default dark blockbuster grade: it feels สงบ อบอุ่น มีความหวัง, and its emotional journey goes จากใจวุ่นวายสู่ความสงบ/);
  assert.match(p, /COLOUR GRADE: warm, natural, medium saturation, high-key — bright, luminous and airy; built around soft gold; the colours must feel สงบ โปร่ง; they must NOT feel มืด ตึงเครียด/);
  assert.match(p, /\(quiet, gentle, soft light\)/);
  assert.doesNotMatch(p, /strong rim light, glowing highlights, deep shadows, haze/, 'เลิกโทนมืดตายตัว');
  const dark = P.flowPosterCoverPrompt({ book: { ...calm, coverDigest: { energy: { level: 5 }, palette_brief: { value_key: 'dark', saturation: 'high' } } }, outline: { title: 't' } });
  assert.match(dark, /low-key — deep, dark and moody/);
  assert.match(dark, /\(bright, energetic light\)/);
  // ปกหลังใช้โทนเดียวกับปกหน้า
  assert.match(P.flowPosterCoverPrompt({ book: calm, outline: { title: 't' }, back: true }), /Use exactly the same colour grade and mood as the front cover/);
});

/** ผู้ใช้: "ทำไมสีถึงเหลืองทุกภาพเลย" */
test('สีไม่ย้อมเหลือง: ทุกภาพของ Flow ขอสีจริง · ปกต้องมีสีที่ไม่ใช่โทนอุ่นเป็นพื้นที่ใหญ่ · doodle ไม่ยึดส้ม/เหลือง', async () => {
  const P = await import('./prompts.js');
  const { flowPrompt } = await import('./flow.js');
  for (const kind of ['cover', 'interior', 'character'])
    assert.match(flowPrompt({ kind, prompt: 'x', textBaked: true }, { label: '3:4' }), /COLOUR ACCURACY: clean, true colours — no overall yellow, orange, amber, sepia or golden-hour cast/);
  assert.match(P.flowPosterCoverPrompt({ book: {}, outline: { title: 't' } }), /COLOUR BALANCE: no single yellow, gold or sepia wash/);
  assert.match(P.FIGURE_STYLES.doodle.brief, /orange and yellow are accents, never a yellow or orange wash/);
  assert.doesNotMatch(P.FIGURE_STYLES.doodle.brief, /warm lively palette built on orange/);
});
