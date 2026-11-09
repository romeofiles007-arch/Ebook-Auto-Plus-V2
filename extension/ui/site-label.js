/**
 * ชื่อเว็บที่ใช้เขียนจริง สำหรับข้อความบนหน้าจอ
 *
 * ข้อความสถานะ บันทึก และป้ายทีมงานเขียนคำว่า "ChatGPT" ไว้ตายตัวกว่าสองร้อยจุด
 * ลูกค้าเลือกการ์ด Gemini + Google Flow แล้วเห็น "รอคำตอบจาก ChatGPT" ทั้งที่งานวิ่งไป Gemini
 * จึงเข้าใจว่าระบบสั่งผิดเว็บ (ผู้ใช้แจ้งมา) — แก้ที่จุดแสดงผลจุดเดียว แทนการไล่แก้ทุกข้อความ
 *
 * เปลี่ยนเฉพาะเล่มที่เขียนด้วย Gemini และไม่ได้วาดภาพในแท็บ ChatGPT
 * (ภาพแบบ 'web' ยังวาดใน ChatGPT จริง คำว่า ChatGPT ตอนนั้นจึงถูกอยู่แล้ว)
 */
export function writesWithGemini(book) {
  return book?.textSource === 'gemini' && (book?.imageSource || 'web') !== 'web';
}

export function siteLabel(text, book) {
  if (text == null || !writesWithGemini(book)) return text;
  return String(text).replace(/ChatGPT/g, 'Gemini');
}

/** ชื่อเว็บสำหรับปุ่ม "เปิด …" และค่า site ที่ส่งให้ service worker */
export const chatSiteName = (book) => (book?.textSource === 'gemini' ? 'Gemini' : 'ChatGPT');

/**
 * ป้ายและคำอธิบายที่เขียนไว้ตายตัวในหน้าตั้งค่า (ผู้ใช้แจ้ง: เลือก Gemini แล้วหลายตัวเลือกยังเขียน ChatGPT จนสับสน)
 *
 * siteLabel ข้างบนคุมข้อความสถานะ ซึ่งอาจพูดถึงแท็บวาดภาพของ ChatGPT ได้ด้วย จึงเปลี่ยนเฉพาะเมื่อภาพไม่ได้วาดที่ ChatGPT
 * ป้ายบนหน้าตั้งค่ารู้อยู่แล้วว่าพูดถึงงานไหน จึงแยกเป็นสองชนิด
 *   writer — งานเขียน (คิดชื่อ วางสารบัญ เรียบเรียง กรอกตัวละคร) → ตามเว็บที่ใช้เขียน
 *   image  — งานวาด (ปก ลายพื้นหลัง บัญชีที่สร้างภาพได้)        → ตามเครื่องมือวาดภาพ
 * ป้ายที่บรรยายตัวเลือก ChatGPT เอง (การ์ดโหมด ตัวเลือกใน dropdown) ไม่ติดป้าย จึงคงคำว่า ChatGPT ไว้
 */
export const imageToolName = (imageSource) => ({ flow: 'Google Flow', api: 'OpenAI API' })[imageSource] || 'ChatGPT';

export function writerLabel(text, book) {
  if (text == null || book?.textSource !== 'gemini') return text;
  return String(text).replace(/ChatGPT/g, 'Gemini');
}

export function imageLabel(text, book) {
  const name = imageToolName(book?.imageSource || 'web');
  if (text == null || name === 'ChatGPT') return text;
  return String(text).replace(/ChatGPT/g, name);
}

// ข้อความต้นฉบับของแต่ละจุด — เปลี่ยนกลับเป็น ChatGPT ได้เมื่อผู้ใช้สลับเว็บกลับ
const ORIGINAL_TEXT = new WeakMap();
const ORIGINAL_ATTRS = new WeakMap();
const BRAND_ATTRS = ['title', 'placeholder', 'aria-label'];

/** ทาป้ายทุกจุดที่ติด data-brand="writer|image" ใหม่ตามเล่ม/ตัวเลือกปัจจุบัน — เรียกซ้ำได้ ไม่สะสมผล */
export function paintBrandLabels(root, book) {
  if (!root?.querySelectorAll) return;
  // เรียงตามลำดับในหน้า ตัวในสุดถูกทาทีหลังจึงชนะ (เช่น ปุ่มภาพที่อยู่ในกล่องงานเขียน)
  for (const el of root.querySelectorAll('[data-brand]')) {
    const swap = el.dataset.brand === 'image' ? (t) => imageLabel(t, book) : (t) => writerLabel(t, book);
    const walker = el.ownerDocument.createTreeWalker(el, 4 /* NodeFilter.SHOW_TEXT */);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!ORIGINAL_TEXT.has(n)) ORIGINAL_TEXT.set(n, n.data);
      const next = swap(ORIGINAL_TEXT.get(n));
      if (n.data !== next) n.data = next;
    }
    if (!ORIGINAL_ATTRS.has(el)) {
      ORIGINAL_ATTRS.set(el, Object.fromEntries(BRAND_ATTRS.filter((a) => el.hasAttribute(a)).map((a) => [a, el.getAttribute(a)])));
    }
    for (const [attr, value] of Object.entries(ORIGINAL_ATTRS.get(el))) {
      const next = swap(value);
      if (el.getAttribute(attr) !== next) el.setAttribute(attr, next);
    }
  }
}

/**
 * ตัวเลือก "2 Phase" ของปกและภาพในเล่มต้องบอกเครื่องมือที่จะวาดจริง
 * ลูกค้าเลือกการ์ด Flow แล้วเห็นเมนูปกเขียนว่า "เปลี่ยนบัญชีให้ ChatGPT สร้างให้" — เข้าใจว่าจะไปวาดที่ ChatGPT
 */
export function autoImageLabels(imageSource) {
  const src = imageSource || 'web';
  if (src === 'flow')
    return {
      cover: '2 Phase — เตรียม Prompt ตอนนี้ แล้วให้ Google Flow วาดให้ (ฟรี 0 เครดิต)',
      figure: '2 Phase — วาง Prompt ตอนนี้ แล้วให้ Google Flow วาดและแทรกอัตโนมัติ (ฟรี 0 เครดิต)',
    };
  if (src === 'api')
    return {
      cover: '2 Phase — เตรียม Prompt ตอนนี้ แล้วให้ OpenAI API สร้างให้',
      figure: '2 Phase — วาง Prompt ตอนนี้ แล้วให้ OpenAI API สร้างและแทรกอัตโนมัติ',
    };
  return {
    cover: '2 Phase — เตรียม Prompt ตอนนี้ แล้วเปลี่ยนบัญชีให้ ChatGPT สร้างให้',
    figure: '2 Phase — วาง Prompt ตอนนี้ แล้วเปลี่ยนบัญชีให้ระบบสร้างและแทรกอัตโนมัติ',
  };
}
