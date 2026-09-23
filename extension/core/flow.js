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

/** โมเดลที่ลองตามลำดับ — ตัวขับหยุดที่ตัวแรกที่หน้า Flow บอกว่า "0 เครดิต" เท่านั้น */
export const FLOW_MODELS = ['Nano Banana 2', 'Nano Banana 2 Lite'];

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
  const edge =
    job?.kind === 'cover'
      ? 'This is a printed book cover: keep every important subject and face well away from all four edges (about 8% margin), because the edges are trimmed.'
      : lossPct >= 2
        ? `About ${lossPct}% of the frame will be trimmed from the edges to fit the page: keep important content away from the edges.`
        : '';
  parts.push(`FRAME: ${ratio?.label || '4:3'} ${FLOW_RATIOS[ratio?.label] >= 1 ? 'landscape' : 'portrait'} image, fill the whole frame edge to edge.${edge ? ` ${edge}` : ''}`);
  return parts.filter(Boolean).join('\n\n');
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
