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
  assert.match(machine, /collection: flowCollectionFor\(this\.book, j\)/);
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
  assert.match(machine, /j\.kind !== 'interior' && \(wantsAuthorRef/);
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

test('โหมด Flow สารคดี: ปกเป็นภาพล้วน ชื่อเรื่องให้ Typst เรียงพิมพ์ (Flow วาดตัวอักษรไทยเพี้ยน)', async () => {
  const P = await import('./prompts.js');
  assert.equal(P.coverTextBaked({ imageSource: 'flow', coverTextMode: 'baked' }), false);
  assert.equal(P.coverTextBaked({ imageSource: 'web', coverTextMode: 'baked' }), true);
  assert.equal(P.backCoverTextBaked({ imageSource: 'flow', coverMode: 'auto', backCoverCopy: { hook: 'x' } }), false);
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
test('นิยายภาพทุกหน้า: วางแผนจากข้อความจริงหน้าละหนึ่งภาพ และตัวละครในภาพตรงตามแผน', async () => {
  const P = await import('./prompts.js');
  const pages = [{ key: '1.1-1', section: '1.1', page: 1, of: 2, text: 'เอมมี่เปิดประตูเจอต้น' }, { key: '1.1-2', section: '1.1', page: 2, of: 2, text: 'ต้นยื่นจดหมาย' }];
  const plan = P.fictionPagePlanPrompt({ topic: 't' }, { title: 't', cast: [{ name: 'เอมมี่' }, { name: 'ต้น' }] }, pages);
  assert.match(plan, /\[1\.1-1\] ตอน 1\.1 · หน้า 1\/2\nเอมมี่เปิดประตูเจอต้น/);
  assert.match(plan, /หน้าละหนึ่งภาพพอดี/);
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
  assert.match(machine, /if \(todo\.length\) throw new Halt/);
  assert.match(machine, /insertFigureAfter\(rec\.md, marker, f\.paraAt \+ \(n - 1\)\)/);
  assert.match(machine, /const planned = Array\.isArray\(fig\.characters\) \? fig\.characters : null;/);
  // prompt แผนทั้งเล่มยังมี fallback แต่เครื่องใช้แผนรายหน้ากับทั้งนิยายและสารคดี
  assert.match(P.figurePlanPrompt({ illustrationLevel: 'page', audience: 'x' }, { title: 't', chapters: [] }, [], 'line'), /มากที่สุดเท่าที่ควรจะเป็นภาพ/);
  const nonfiction = P.prosePagePlanPrompt({ topic: 't', genre: 'how-to' }, { title: 't' }, pages);
  assert.match(nonfiction, /\[1\.1-1\] ตอน 1\.1 · หน้า 1\/2\nเอมมี่เปิดประตูเจอต้น/);
  assert.match(nonfiction, /หน้าละหนึ่งภาพพอดี/);
});

test('นิยายสำหรับผู้สูงอายุ: มีในตัวเลือก และมีสูตรภาพของตัวเอง', async () => {
  const studioHtml = await readFile(new URL('../ui/studio.html', import.meta.url), 'utf8');
  const studioJs = await readFile(new URL('../ui/studio.js', import.meta.url), 'utf8');
  assert.match(studioHtml, /<option value="senior">นิยายสำหรับผู้สูงอายุ<\/option>/);
  assert.match(studioHtml, /<option value="page">1 หน้าเนื้อหา 1 ภาพ/);
  assert.match(studioHtml, /id="phase2ReplanPage"/);
  assert.doesNotMatch(studioJs, /option\.fictionOnly/);
  assert.match(studioJs, /await machine\.figures\(\);\s+await machine\.save\(\);/);
  const { plannedImageCount } = await import('./pricing.js');
  assert.equal(plannedImageCount({ figureMode: 'auto', illustrationLevel: 'page', targetPages: 60 }).figures, 120);
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
  assert.ok(machine.includes("prompt = P.flowNovelCoverPrompt("));
  const cover = P.flowNovelCoverPrompt({ book: { title: 'ค', fictionGenre: 'โรแมนซ์' }, outline: { thesis: 'x' }, people: [{ name: 'ฟ้า' }] });
  assert.match(cover, /attached image 1 = ฟ้า/);
  assert.match(cover, /not a stock photo, not people posing at a table/);
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
  assert.match(machine, /if \(!fiction && j\.kind === 'cover'\) \{\n        const direction = P\.flowGenreCoverDirection/);
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
