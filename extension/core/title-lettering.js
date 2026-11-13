/**
 * ต้นแบบตัวอักษรชื่อเรื่อง — เขียนชื่อเรื่องด้วยไฟล์ฟอนต์จริงลงภาพ แล้วแนบให้ Google Flow ลอกลายตัวอักษร
 *
 * ผู้ใช้: "ไม่สวยเลย เราบอกไปทาง prompt ได้ไหมว่าใช้เป็นแบบพู่กันจีน"
 * - บอกด้วยคำบรรยายอย่างเดียว ("Thai lettering written with a Chinese ink brush") → Flow วาดฟอนต์ไทยหนาธรรมดา
 * - พิมพ์ทับด้วย Typst → ได้ฟอนต์จริง แต่บาง เล็ก และไม่กลืนกับภาพแบบโปสเตอร์
 * โมเดลภาพลอกตัวอักษรจากภาพแนบได้ดีกว่าอ่านคำบรรยายมาก จึงให้ Flow วาดชื่อเองโดยมีลายพู่กันจริงเป็นต้นแบบ
 */
import { resolveCoverTypography } from './cover-fonts.js';

/** ฟอนต์ที่โมเดลภาพวาดตามคำบรรยายไม่ได้ — ต้องแนบต้นแบบตัวอักษร */
export const LETTERING_REF_FAMILIES = new Set(['SP-Kangfu']);

export const wantsLetteringRef = (book) => (book?.language || 'th') === 'th' && LETTERING_REF_FAMILIES.has(resolveCoverTypography(book).family);

/** แบ่งชื่อยาวเป็น 1–3 บรรทัดที่ช่องว่าง ให้แต่ละบรรทัดยาวใกล้กัน (ชื่อไทยไม่มีช่องว่าง = บรรทัดเดียว) */
export function splitTitleLines(title, max = 3) {
  const words = String(title || '').trim().split(/\s+/).filter(Boolean);
  if (words.length <= 1) return words.length ? [words[0]] : [];
  const total = words.reduce((n, w) => n + [...w].length, 0);
  const count = Math.min(max, words.length, Math.max(1, Math.ceil(total / 12)));
  const target = total / count;
  const lines = [];
  let cur = [];
  let len = 0;
  for (const w of words) {
    const wl = [...w].length;
    if (cur.length && lines.length < count - 1 && len + wl / 2 > target) {
      lines.push(cur.join(' '));
      cur = [];
      len = 0;
    }
    cur.push(w);
    len += wl;
  }
  if (cur.length) lines.push(cur.join(' '));
  return lines;
}

const hash = (s) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(36);
};

/** ชื่อไฟล์ต้นแบบเปลี่ยนตามชื่อเรื่อง — Flow ใช้ภาพอ้างอิงซ้ำตามชื่อไฟล์ ชื่อเรื่องใหม่ต้องได้ภาพใหม่ */
export const letteringRefName = (book, title) => `title-lettering-${hash(`${resolveCoverTypography(book).family}|${title}`)}.png`;

/**
 * วาดชื่อเรื่องสีดำบนพื้นขาวด้วยไฟล์ฟอนต์จริง · คืน { name, dataUrl } หรือ null ถ้าเบราว์เซอร์ทำไม่ได้ (เช่นในเทสต์)
 * ตัวดำบนพื้นขาวอ่านรูปทรงตัวอักษรได้ชัดที่สุด — สีและแสงให้ Flow ออกแบบเองตามปก
 */
export async function renderTitleLettering(book, title) {
  const text = String(title || '').trim();
  if (!text || typeof OffscreenCanvas === 'undefined' || typeof FontFace === 'undefined') return null;
  const font = resolveCoverTypography(book);
  const family = `EbookLettering-${font.family.replace(/\W+/g, '')}`;
  const face = new FontFace(family, `url(${new URL(`../${font.file}`, import.meta.url).href})`, { weight: String(font.weight || 400) });
  await face.load();
  (globalThis.document?.fonts || globalThis.fonts)?.add(face);
  const lines = splitTitleLines(text);
  const size = 260;
  const measure = new OffscreenCanvas(10, 10).getContext('2d');
  measure.font = `${font.weight || 400} ${size}px "${family}"`;
  const widest = Math.max(...lines.map((l) => measure.measureText(l).width));
  // ตัดภาพให้พอดีข้อความ — พื้นขาวเหลือเยอะ ตัวอักษรเล็กในสายตาโมเดล ลายเส้นพู่กันอ่านไม่ชัด
  const width = Math.round(Math.min(2400, Math.max(900, widest + 240)));
  const scale = Math.min(1, (width - 160) / Math.max(1, widest));
  const px = Math.round(size * scale);
  const lineH = Math.round(px * 1.45);
  const height = lineH * lines.length + Math.round(px * 0.9);
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#111111';
  ctx.font = `${font.weight || 400} ${px}px "${family}"`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  lines.forEach((l, i) => ctx.fillText(l, width / 2, Math.round(px * 0.45 + lineH * (i + 0.5))));
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  const dataUrl = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
  return { name: letteringRefName(book, text), dataUrl, lines };
}

/** คำสั่งแนบกับปก — ไม่อ้างเลขภาพ (ลำดับรูปแนบเปลี่ยนได้เมื่อรอบสุดท้ายตัดรูปตัวละครออก) */
export const LETTERING_REF_RULE =
  'TITLE LETTERING REFERENCE: one attached image shows ONLY black brush lettering on a plain white background — that is the exact title written in the required Chinese-ink-brush Thai typeface. Draw the cover title with exactly these letterforms: the same brush strokes, thick-to-thin weight, tapered terminals and the same Thai consonants, vowels and tone marks in the same order and the same line breaks. Do not substitute another font, do not change, add or drop any letter. Make it big and design it into the poster (ink, gold or light on the strokes, a subtle glow or shadow so it reads over the art). Ignore the reference\'s white background and black colour — it is only the letter shapes; never paste the white box onto the cover. This reference is not a character or a scene.';
