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
