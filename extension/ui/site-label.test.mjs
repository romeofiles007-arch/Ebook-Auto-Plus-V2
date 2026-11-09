/**
 * ลูกค้า (โหมด Gemini + Flow): "ข้อความเมนูทุกอย่างเป็น chatgpt ทั้งหมดเลยครับ" — เข้าใจว่าระบบสั่งผิดเว็บ
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { siteLabel, chatSiteName, writesWithGemini } from './site-label.js';

const gemini = { textSource: 'gemini', imageSource: 'flow' };

test('โหมด Gemini + Flow: ข้อความบนจอบอก Gemini ไม่ใช่ ChatGPT', () => {
  assert.equal(siteLabel('รอคำตอบจาก ChatGPT 6 วินาที', gemini), 'รอคำตอบจาก Gemini 6 วินาที');
  assert.equal(siteLabel('กำลังใส่ Prompt ลงใน ChatGPT · ChatGPT ตอบแล้ว', gemini), 'กำลังใส่ Prompt ลงใน Gemini · Gemini ตอบแล้ว');
  assert.equal(chatSiteName(gemini), 'Gemini');
});

test('โหมด ChatGPT และ API ไม่เปลี่ยนข้อความ', () => {
  assert.equal(siteLabel('รอคำตอบจาก ChatGPT', { textSource: 'web', imageSource: 'flow' }), 'รอคำตอบจาก ChatGPT');
  assert.equal(siteLabel('รอคำตอบจาก ChatGPT', { textSource: 'api', imageSource: 'api' }), 'รอคำตอบจาก ChatGPT');
  assert.equal(chatSiteName({ textSource: 'web' }), 'ChatGPT');
});

test('Gemini เขียน แต่ภาพยังวาดใน ChatGPT — คำว่า ChatGPT ถูกอยู่แล้ว ไม่เปลี่ยน', () => {
  assert.equal(writesWithGemini({ textSource: 'gemini', imageSource: 'web' }), false);
  assert.equal(siteLabel('สร้างภาพใน ChatGPT', { textSource: 'gemini' }), 'สร้างภาพใน ChatGPT');
});

test('ค่าว่างผ่านได้ไม่พัง', () => {
  assert.equal(siteLabel(null, gemini), null);
  assert.equal(siteLabel('', gemini), '');
});

test('Studio และแผงข้างใช้ตัวเปลี่ยนชื่อที่จุดแสดงผลหลัก', async () => {
  const studio = await readFile(new URL('./studio.js', import.meta.url), 'utf8');
  for (const sink of ['function publishActivity', 'function addEvent', 'function runState', 'const status = ']) {
    const at = studio.indexOf(sink);
    assert.ok(at >= 0, sink);
    assert.match(studio.slice(at, at + 900), /brand\(/, `${sink} ต้องผ่าน brand()`);
  }
  const panel = await readFile(new URL('./panel.js', import.meta.url), 'utf8');
  assert.match(panel, /chatSite/);
});

test('เมนู 2 Phase บอกเครื่องมือวาดจริง: Flow ไม่พูดถึง ChatGPT', async () => {
  const { autoImageLabels } = await import('./site-label.js');
  const flow = autoImageLabels('flow');
  assert.doesNotMatch(flow.cover + flow.figure, /ChatGPT/);
  assert.match(flow.cover, /Google Flow/);
  assert.match(autoImageLabels('api').cover, /API/);
  assert.match(autoImageLabels('web').cover, /ChatGPT/);
  const studio = await readFile(new URL('./studio.js', import.meta.url), 'utf8');
  assert.match(studio, /autoImageLabels\(/, 'Studio ต้องตั้งข้อความตัวเลือกจากแหล่งภาพ');
});

// ---------- ป้ายตายตัวในหน้าตั้งค่า (ผู้ใช้: "เลือก Gemini แต่บางตัวเลือกยังเขียน ChatGPT อยู่") ----------
import { writerLabel, imageLabel, imageToolName, paintBrandLabels } from './site-label.js';

test('ป้ายงานเขียนตามเว็บที่เขียน — Gemini เปลี่ยนเสมอ แม้ภาพจะวาดใน ChatGPT', () => {
  assert.equal(writerLabel('ให้ ChatGPT คิดชื่อ', { textSource: 'gemini', imageSource: 'web' }), 'ให้ Gemini คิดชื่อ');
  assert.equal(writerLabel('ให้ ChatGPT คิดชื่อ', { textSource: 'gemini', imageSource: 'flow' }), 'ให้ Gemini คิดชื่อ');
  assert.equal(writerLabel('ให้ ChatGPT คิดชื่อ', { textSource: 'web' }), 'ให้ ChatGPT คิดชื่อ');
  assert.equal(writerLabel(null, { textSource: 'gemini' }), null);
});

test('ป้ายงานวาดตามเครื่องมือวาดภาพ', () => {
  assert.equal(imageToolName('flow'), 'Google Flow');
  assert.equal(imageLabel('ให้ ChatGPT วาดมาในภาพเลย', { imageSource: 'flow' }), 'ให้ Google Flow วาดมาในภาพเลย');
  assert.equal(imageLabel('ให้ ChatGPT วาดมาในภาพเลย', { imageSource: 'api' }), 'ให้ OpenAI API วาดมาในภาพเลย');
  assert.equal(imageLabel('ให้ ChatGPT วาดมาในภาพเลย', { imageSource: 'web' }), 'ให้ ChatGPT วาดมาในภาพเลย');
});

/** DOM จำลองขนาดเล็กพอให้ paintBrandLabels ทำงาน */
function fakeDom(items) {
  const doc = {
    createTreeWalker: (el) => {
      let i = -1;
      return { nextNode: () => el.texts[++i] || null };
    },
  };
  const els = items.map(({ brand, texts, attrs = {} }) => ({
    dataset: { brand }, ownerDocument: doc, texts: texts.map((data) => ({ data })), attrs: { ...attrs },
    hasAttribute(a) { return a in this.attrs; }, getAttribute(a) { return this.attrs[a]; }, setAttribute(a, v) { this.attrs[a] = v; },
  }));
  return { root: { querySelectorAll: () => els }, els };
}

test('ทาป้ายใหม่ได้ทั้งไปและกลับ ไม่สะสมผล และเปลี่ยน title ด้วย', () => {
  const { root, els } = fakeDom([
    { brand: 'writer', texts: ['ให้ ChatGPT คิดชื่อ'], attrs: { title: 'โหลดหน้า ChatGPT ใหม่' } },
    { brand: 'image', texts: ['ภาพที่ ChatGPT สร้าง'] },
  ]);
  paintBrandLabels(root, { textSource: 'gemini', imageSource: 'flow' });
  assert.equal(els[0].texts[0].data, 'ให้ Gemini คิดชื่อ');
  assert.equal(els[0].attrs.title, 'โหลดหน้า Gemini ใหม่');
  assert.equal(els[1].texts[0].data, 'ภาพที่ Google Flow สร้าง');
  paintBrandLabels(root, { textSource: 'web', imageSource: 'web' });
  assert.equal(els[0].texts[0].data, 'ให้ ChatGPT คิดชื่อ');
  assert.equal(els[0].attrs.title, 'โหลดหน้า ChatGPT ใหม่');
  assert.equal(els[1].texts[0].data, 'ภาพที่ ChatGPT สร้าง');
});

test('ทุกคำว่า ChatGPT ในหน้าตั้งค่า ติดป้าย data-brand หรือเป็นของที่บรรยายตัวเลือก ChatGPT เอง', async () => {
  const html = (await readFile(new URL('./studio.html', import.meta.url), 'utf8')).split('\n');
  // ป้ายที่ต้องคงคำว่า ChatGPT: การ์ดโหมด/ตัวเลือก ChatGPT · จุดที่ studio.js ตั้งข้อความเองตามแหล่ง
  const KEEP = [
    /class="modeCard"/, /alt="ChatGPT"/, /<b>ChatGPT \+ Google Flow<\/b>/, /<b>ChatGPT Plus<\/b>/, /ใช้บัญชี ChatGPT Plus/,
    /<option value="web"[^>]*>หน้าเว็บ ChatGPT/, /id="textSourceNote"/, /<button id="chat">/, /2 Phase — เตรียม Prompt/,
  ];
  const bad = [];
  html.forEach((line, i) => {
    if (!line.includes('ChatGPT')) return;
    if (line.includes('data-brand=') || KEEP.some((re) => re.test(line))) return;
    // บรรทัดต่อของข้อความหลายบรรทัด (ไม่ได้ขึ้นต้นด้วยแท็กของตัวเอง): ป้ายอยู่ที่แท็กเปิดไม่กี่บรรทัดก่อนหน้า หรืออยู่ในคอมเมนต์ HTML
    // บรรทัดที่ขึ้นต้นด้วยแท็กคือ element ใหม่ ต้องติดป้ายของตัวเอง — ไม่ให้ยืมป้ายของพี่น้องข้างบน
    const before = html.slice(Math.max(0, i - 5), i).join('\n');
    const continuation = !line.trim().startsWith('<');
    if ((continuation && /data-brand=/.test(before)) || /<!--(?![\s\S]*-->)/.test(before)) return;
    bad.push(`${i + 1}: ${line.trim().slice(0, 80)}`);
  });
  assert.deepEqual(bad, [], 'ป้ายที่ยังเขียน ChatGPT ตายตัว — เติม data-brand="writer" หรือ "image"');
});

test('Studio ทาป้ายใหม่ทุกครั้งที่เปลี่ยนเว็บเขียน/แหล่งภาพ และไม่เขียน ChatGPT ตรง ๆ ลงกล่องข้อความ', async () => {
  const studio = await readFile(new URL('./studio.js', import.meta.url), 'utf8');
  const sync = studio.slice(studio.indexOf('function syncChatSiteLabel'), studio.indexOf('function syncChatSiteLabel') + 800);
  assert.match(sync, /paintBrandLabels\(document/);
  const api = studio.slice(studio.indexOf('function syncApiSources'));
  assert.match(api.slice(0, api.indexOf('\n}\n')), /renderSteps\(\)/);
  assert.match(studio.slice(studio.indexOf('const renderSteps'), studio.indexOf('function syncChatSiteLabel')), /syncChatSiteLabel\(\)/);
  assert.deepEqual(studio.match(/(textContent|innerHTML) = ['`][^'`\n]*ChatGPT/g) || [], []);
  assert.match(studio, /function turnErrorMessage\(res\) \{\n  return say\(/);
});
