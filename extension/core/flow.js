/**
 * ฝั่ง Studio ของการสร้างภาพด้วย Google Flow (Ebook Plus)
 *
 * ตัวขับในหน้า Flow อยู่ที่ adapter/flow.js — ไฟล์นี้เลือกสัดส่วน และส่งงาน/รอผลผ่าน service worker
 * ส่วนการตรวจ ครอป ย่อเป็น 300 dpi และบันทึกลงเล่ม ใช้สายพานเดิมของระบบทั้งหมด (core/machine.js)
 */

/**
 * สัดส่วนที่ช่องสร้างภาพของ Flow มีให้เลือกจริง (ตรวจกับหน้าเว็บ ก.ย. 2026)
 * ภาพที่ได้ตรงสัดส่วนเป๊ะ เช่น 3:4 → 896×1200 (1K) / 1792×2400 (2K)
 */
export const FLOW_RATIOS = { '16:9': 16 / 9, '4:3': 4 / 3, '1:1': 1, '3:4': 3 / 4, '9:16': 9 / 16 };

/**
 * ผู้ใช้กำหนด: รุ่นไหนก็ได้ที่ Flow บอกว่า "0 เครดิต" — Nano Banana 2 ก่อน (วาดสวยกว่า Lite ชัดเจน ผู้ใช้ขอเปลี่ยน) แล้วค่อย Lite
 * ตัวขับลองตามลำดับนี้และหยุดที่รุ่นแรกที่เป็น 0 เครดิต — รุ่นที่ต้องใช้เครดิตจะไม่ถูกกดสร้างเด็ดขาด
 */
export const FLOW_MODELS = ['Nano Banana 2', 'Nano Banana 2 Lite', 'Nano Banana Pro'];

/** สัดส่วนของ Flow ที่ใกล้ช่องภาพที่สุด (เทียบแบบ log ให้แนวตั้งกับแนวนอนมีน้ำหนักเท่ากัน) */
export function nearestFlowRatio(ratio) {
  const want = Number(ratio) > 0 ? Number(ratio) : 4 / 3;
  let best = '4:3';
  let dist = Infinity;
  for (const [label, r] of Object.entries(FLOW_RATIOS)) {
    const d = Math.abs(Math.log(r / want));
    if (d < dist) {
      dist = d;
      best = label;
    }
  }
  return best;
}

/** สัดส่วนที่จะสั่ง Flow สำหรับงานภาพหนึ่งชิ้น พร้อมส่วนที่ต้องตัดทิ้งเพื่อลงช่อง (0 = ไม่ต้องครอปเลย) */
export function flowRatioFor(job) {
  const w = Number(job?.widthMm);
  const h = Number(job?.heightMm);
  const want = w > 0 && h > 0 ? w / h : parseRatio(job?.aspect) || 4 / 3;
  const label = nearestFlowRatio(want);
  const got = FLOW_RATIOS[label];
  const loss = 1 - Math.min(got, want) / Math.max(got, want);
  return { label, loss: Math.round(loss * 1000) / 1000 };
}

function parseRatio(value) {
  const m = /^(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)$/.exec(String(value || '').trim());
  return m && Number(m[2]) ? Number(m[1]) / Number(m[2]) : 0;
}

/**
 * บอก Flow ตรง ๆ ว่ากรอบภาพคืออะไร และขอบภาพส่วนไหนอาจถูกตัด
 * ปกต้องเผื่อตัดตกขอบ (bleed) และครอปเล็กน้อยเพื่อลงหน้ากระดาษ ของสำคัญจึงต้องอยู่ห่างขอบ
 */
export function flowPrompt(job, ratio) {
  const parts = [String(job?.prompt || '').trim()];
  const lossPct = Math.round((ratio?.loss || 0) * 100);
  /**
   * ปก = ภาพผิวหน้าปกเอง แบนเต็มกรอบ ไม่ใช่ "รูปถ่ายหนังสือ"
   * เจอจริง: สั่ง "ปกหลังของหนังสือ" แล้ว Flow วาดหนังสือทั้งเล่มวางบนโต๊ะ ถ่ายจากมือถือ เห็นขอบโต๊ะและกางเกงคนถ่าย
   */
  if (job?.kind === 'cover') {
    parts.unshift(
      'THIS IMAGE IS THE FLAT PRINTED COVER SURFACE ITSELF, filling the frame edge to edge. It is NOT a photograph of a book, NOT a 3D mockup: no table, no desk, no hands holding it, no book edges or spine, no perspective, no shadow around it, no background around the cover. ' +
        'ARTWORK ONLY: absolutely no title, no author name, no letters of any kind — the real title is typeset on top later. Shop signs, screens, papers and labels in the scene are blank or show only abstract shapes. Leave calm, uncluttered space in the top third for the title.',
    );
  }
  const edge =
    job?.kind === 'cover'
      ? 'This is a printed book cover: keep every important subject and face well away from all four edges (about 8% margin), because the edges are trimmed.'
      : lossPct >= 2
        ? `About ${lossPct}% of the frame will be trimmed from the edges to fit the page: keep important content away from the edges.`
        : '';
  parts.push(`FRAME: ${ratio?.label || '4:3'} ${FLOW_RATIOS[ratio?.label] >= 1 ? 'landscape' : 'portrait'} image, fill the whole frame edge to edge.${edge ? ` ${edge}` : ''}`);
  return parts.filter(Boolean).join('\n\n');
}

/** คอลเล็กชันของภาพต้นแบบตัวละคร (นิยาย) — ทุกภาพในเล่มอ้างอิงหน้าตาตัวละครจากที่นี่ */
export const FLOW_CAST_COLLECTION = '00 ตัวละคร';

/**
 * ตัวละครหลักของนิยายที่ต้องมีภาพต้นแบบ — รวมจากสารบัญ (cast) และ Story Bible ไม่ซ้ำชื่อ
 * เอาเฉพาะที่มีชื่อจริง และให้ตัวที่บอกรูปลักษณ์ไว้มาก่อน เพราะคือตัวที่ต้องหน้าตาคงเดิมทั้งเล่ม
 */
export function fictionCast(book, max = 8) {
  const seen = new Map();
  for (const c of [...(book?.outline?.cast || []), ...(book?.bible?.characters || [])]) {
    const name = typeof c === 'object' ? String(c?.name || '').trim() : '';
    if (!name) continue;
    seen.set(name, { ...(seen.get(name) || {}), ...c, name });
  }
  /**
   * ผูกกับช่องตัวละครที่ผู้ใช้กำหนด (พระเอก · นางเอก · ตัวละครอื่น) ด้วย seed ที่ ChatGPT ใส่มา หรือชื่อที่ตรงกัน
   * ช่องที่แนบรูปไว้ → ใช้รูปนั้นเป็นต้นแบบ ไม่ต้องวาดใหม่ · ตัวละครจากช่องของผู้ใช้มาก่อนเสมอ
   */
  const seeds = book?.castSeeds || [];
  const list = [...seen.values()].map((c) => {
    const s = seeds.find((x) => (c.seed && x.slot === c.seed) || (x.name && x.name === c.name));
    return s ? { ...c, seedSlot: s.slot, photo: !!s.photo, fromLibrary: !!s.fromLibrary } : c;
  });
  /**
   * ช่องที่ผู้ใช้กรอกเอง (มีชื่อหรือแนบรูป) ต้องมีภาพต้นแบบเสมอ แม้โครงเรื่องจะไม่ได้ใส่ seed กลับมา
   * เจอจริง: คอลเล็กชัน "00 ตัวละคร" มีแค่ 2 ตัว ตัวละครที่ผู้ใช้ตั้งไว้หายไปเฉย ๆ
   */
  for (const s of seeds) {
    if (!s?.slot || !(s.name || s.photo) || list.some((c) => c.seedSlot === s.slot)) continue;
    const name = String(s.name || s.label || s.slot).trim();
    const same = list.find((c) => c.name === name);
    if (same) Object.assign(same, { seedSlot: s.slot, photo: !!s.photo, fromLibrary: !!s.fromLibrary });
    else list.push({ name, role: s.label || '', appearance: s.appearance || '', seedSlot: s.slot, photo: !!s.photo, fromLibrary: !!s.fromLibrary });
  }
  const rank = (c) => (c.seedSlot ? 2 : 0) + (c.appearance ? 1 : 0);
  return list.sort((a, b) => rank(b) - rank(a)).slice(0, max);
}

/** ชื่อไฟล์รูปตัวละครที่ผู้ใช้แนบไว้ในหน้าตั้งค่า */
export const castPhotoName = (slot) => `cast-${slot}.png`;

/** ชื่อไฟล์/ชื่อภาพใน Flow ของภาพต้นแบบตัวละครลำดับที่ i */
export const charRefName = (i, v = 1) => `char-${String(i + 1).padStart(2, '0')}${v > 1 ? `-v${v}` : ''}.png`;

/** ตัวละครที่ถูกเอ่ยชื่อในข้อความนี้ (ฉาก คำบรรยาย หรือเนื้อเรื่องรอบภาพ) เรียงตามลำดับใน cast */
export function castInText(cast, textToSearch, max = 3) {
  const t = String(textToSearch || '');
  return cast
    .map((c, i) => ({ ...c, index: i }))
    .filter((c) => {
      const name = String(c.name);
      const first = name.split(/\s+/)[0];
      return t.includes(name) || (first.length >= 2 && t.includes(first));
    })
    .slice(0, max);
}

/** คอลเล็กชันสำหรับรูปที่อัปโหลดไปเป็นตัวอ้างอิง (เช่นรูปผู้เขียน) */
export const FLOW_REF_COLLECTION = '00 รูปอ้างอิง';

/**
 * คอลเล็กชัน (โฟลเดอร์) ใน project ของ Flow ที่ภาพนี้ต้องไปอยู่ — จัดตามตำแหน่งในเล่ม ค้นหาง่าย
 *   01 ปก · 02 ลวดลายพื้นหลัง · 03 บทที่ 1 · <ชื่อบท> · 04 บทที่ 2 · … · 99 ภาพอื่น ๆ
 * เลขนำหน้าทำให้เรียงตามลำดับเล่มเมื่อเรียงตามชื่อ และเห็นทันทีว่าเป็นหมวดไหน
 */
export function flowCollectionFor(book, job) {
  if (job?.kind === 'cover') return '01 ปก';
  if (job?.kind === 'pattern') return '02 ลวดลายพื้นหลัง';
  const m = /^fig-(.+)-\d+\.png$/i.exec(String(job?.name || ''));
  const chapters = book?.outline?.chapters || [];
  if (m) {
    const section = m[1];
    const idx = chapters.findIndex((c) => (c.sections || []).some((s) => String(s.id) === section));
    if (idx >= 0) {
      const c = chapters[idx];
      const title = String(c.title || '').replace(/\s+/g, ' ').trim().slice(0, 40);
      return `${String(idx + 3).padStart(2, '0')} บทที่ ${c.n ?? idx + 1}${title ? ` · ${title}` : ''}`;
    }
  }
  return '99 ภาพอื่น ๆ';
}

let seq = 0;
const waiting = new Map(); // jobId → { resolve, timer }
let listening = false;

function listen() {
  if (listening || typeof chrome === 'undefined' || !chrome.runtime?.onMessage) return;
  listening = true;
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type !== 'flow.result') return;
    const w = waiting.get(msg.jobId);
    if (!w) return; // ได้ซ้ำสองทาง (ตรงจาก content script + ที่ service worker ส่งต่อ) — รับครั้งแรกพอ
    waiting.delete(msg.jobId);
    clearTimeout(w.timer);
    w.resolve(msg.result || { ok: false, error: 'แท็บ Flow ส่งผลว่างกลับมา' });
  });
}

/**
 * สั่งงานหนึ่งชิ้นให้แท็บ Flow แล้วรอผล
 * คืน { ok:true, ... } หรือ { ok:false, error, code } เสมอ ไม่โยน — ผู้เรียกตัดสินใจเองว่าจะลองใหม่ไหม
 */
export async function flowCall(op, args = {}, { timeoutMs = 8 * 60000 } = {}) {
  listen();
  const jobId = `flow-${Date.now()}-${++seq}`;
  const result = new Promise((resolve) => {
    const timer = setTimeout(() => {
      waiting.delete(jobId);
      resolve({ ok: false, code: 'timeout', error: `แท็บ Flow ไม่ส่งผลกลับมาภายใน ${Math.round(timeoutMs / 60000)} นาที` });
    }, timeoutMs);
    waiting.set(jobId, { resolve, timer });
  });
  let accepted;
  try {
    accepted = await chrome.runtime.sendMessage({ type: 'sw.flow', jobId, op, args });
  } catch (e) {
    accepted = { ok: false, error: e?.message || String(e) };
  }
  if (!accepted?.ok) {
    const w = waiting.get(jobId);
    if (w) {
      waiting.delete(jobId);
      clearTimeout(w.timer);
    }
    return { ok: false, code: 'not_accepted', error: accepted?.error || 'ส่งงานให้แท็บ Flow ไม่สำเร็จ' };
  }
  return result;
}
