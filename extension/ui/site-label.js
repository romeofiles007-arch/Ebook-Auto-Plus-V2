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
