/**
 * ตรวจเนื้อหาที่ซ้ำกันเองภายในตอนเดียว
 *
 * เจอจริง (คู่มือรับมือหวัด 7 วัน บทที่ 4): เกณฑ์ "ไข้นานเกิน 4 วัน · อาการนานเกิน 10 วันโดยไม่ดีขึ้น"
 * ถูกพูดซ้ำสามรอบในตอนเดียว คนละถ้อยคำ — มาจากการสั่งขยายตอนที่สั้น แล้วโมเดลเติมด้วยการเล่าซ้ำ
 * คำสั่ง "ห้ามขยายความซ้ำ" ใน prompt มีอยู่แล้ว แต่ไม่มีใครตรวจผลจริง
 *
 * วิธีตรวจ: ตัดช่องว่าง เครื่องหมาย และ markdown ทิ้ง แล้วแบ่งเป็นชิ้นละ 6 ตัวอักษร (ภาษาไทยไม่มีเว้นวรรคคั่นคำ)
 * ย่อหน้าหลังที่ชิ้นส่วนเกิน 35% เคยโผล่ในย่อหน้าก่อนหน้า (และร่วมกันอย่างน้อย 20 ชิ้น) = พูดเรื่องเดิมซ้ำ
 * จับได้ทั้งการลอกซ้ำตรง ๆ และการเล่าใหม่ที่ยังใช้วลีหลักชุดเดิม
 */

const N = 6;
const MIN_SHARED = 20;
const RATIO = 0.35;

function clean(s) {
  return String(s || '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '') // ภาพ
    .replace(/[`*_>#|]/g, '')
    .replace(/[\s​.,;:!?()[\]{}"'“”‘’\-–—•·/\\]+/g, '')
    .toLowerCase();
}

function grams(s) {
  const out = new Set();
  const chars = [...s];
  for (let i = 0; i + N <= chars.length; i++) out.add(chars.slice(i, i + N).join(''));
  return out;
}

/** ย่อหน้าที่นับได้ — ข้ามหัวข้อ ตาราง กล่องสรุป และภาพ เพราะไม่ใช่เนื้อความที่พูดซ้ำได้ */
function paragraphs(md) {
  return String(md || '')
    .split(/\n{2,}/)
    .map((raw, index) => ({ raw: raw.trim(), index }))
    .filter((p) => p.raw && !/^(#{1,6}\s|\||:::|!\[)/.test(p.raw));
}

/**
 * คู่ย่อหน้าที่ซ้ำกัน: [{ later, earlier, ratio, laterText, earlierText }]
 * later/earlier เป็นลำดับย่อหน้าในต้นฉบับ (แบ่งด้วยบรรทัดว่าง)
 */
export function findRepeats(md) {
  const paras = paragraphs(md).map((p) => ({ ...p, g: grams(clean(p.raw)) }));
  const out = [];
  for (let j = 1; j < paras.length; j++) {
    const b = paras[j];
    if (b.g.size < MIN_SHARED) continue;
    let best = null;
    for (let i = 0; i < j; i++) {
      const a = paras[i];
      let shared = 0;
      for (const x of b.g) if (a.g.has(x)) shared++;
      const ratio = shared / b.g.size;
      if (shared >= MIN_SHARED && ratio >= RATIO && (!best || ratio > best.ratio)) best = { earlier: a, ratio };
    }
    if (best) {
      out.push({
        later: b.index,
        earlier: best.earlier.index,
        ratio: Math.round(best.ratio * 100) / 100,
        laterText: b.raw,
        earlierText: best.earlier.raw,
      });
    }
  }
  return out;
}

/**
 * ลบย่อหน้าที่ซ้ำเกือบทุกคำ (ย่อหน้าหลัง) เองในเครื่อง — ไม่ต้องส่งเทิร์นให้ ChatGPT
 * เจอจริง (นิยาย): ฉากยาว 34,452 ตัวอักษร ถูกส่งไปทั้งฉากเพื่อให้ตัดส่วนซ้ำ — หน้า ChatGPT ค้าง "หน้าไม่ตอบสนอง" ทุกรอบ
 * ลบเฉพาะที่ชิ้นส่วนตรงกันตั้งแต่ 85% (ลอกซ้ำจริง) · ส่วนที่แค่พูดเรื่องเดียวกันด้วยคำอื่นไม่แตะ
 */
export const NEAR_DUPLICATE = 0.85;
export function removeNearDuplicates(md) {
  const parts = String(md || '').split(/\n{2,}/);
  const drop = new Set(findRepeats(md).filter((r) => r.ratio >= NEAR_DUPLICATE).map((r) => r.later));
  if (!drop.size) return { md: String(md || ''), removed: 0 };
  return { md: parts.filter((_, i) => !drop.has(i)).join('\n\n'), removed: drop.size };
}

/** คำสั่งให้ตัดส่วนซ้ำ — ระบุเจาะจงว่าย่อหน้าไหนซ้ำกับย่อหน้าไหน โมเดลจะได้ไม่เดาเอง */
export function repeatInstruction(repeats) {
  const clip = (s) => {
    // ตัดเครื่องหมาย markdown ออกก่อนยกมา — ช่องพิมพ์ของ ChatGPT แปลง **…** และ "- " ทิ้ง ข้อความในช่องจึงไม่ตรงกับที่ส่ง (งานเคยค้างที่ขั้นพิมพ์)
    const t = String(s)
      .replace(/^\s*(?:[-*+]|\d+[.)])\s+/gm, '')
      .replace(/[*_`#>|]+/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    return t.length > 140 ? `${t.slice(0, 140)}…` : t;
  };
  return (
    'ตอนนี้พูดเรื่องเดิมซ้ำหลายรอบ ให้แก้โดย "ตัดส่วนที่ซ้ำ" ให้แต่ละประเด็นเหลือครั้งเดียวในตำแหน่งที่เหมาะที่สุด ' +
    'ห้ามเติมเนื้อหาใหม่มาแทน ห้ามเล่าประเด็นเดิมด้วยถ้อยคำใหม่ ความยาวสั้นลงได้ตามจริง\nส่วนที่ซ้ำ:\n' +
    repeats
      .slice(0, 6)
      .map((r) => `- "${clip(r.laterText)}"\n  ซ้ำกับที่พูดไปแล้ว: "${clip(r.earlierText)}"`)
      .join('\n')
  );
}
