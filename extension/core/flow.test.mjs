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
  assert.match(machine, /name: j\.name,\s+prompt,\s+ratio: ratio\.label/);
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

test('โมเดล: Nano Banana 2 Lite ก่อน แล้วรุ่นไหนก็ได้ที่ 0 เครดิต', async () => {
  const { FLOW_MODELS } = await import('./flow.js');
  assert.equal(FLOW_MODELS[0], 'Nano Banana 2 Lite');
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
