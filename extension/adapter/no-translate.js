/**
 * ห้าม Chrome แปลหน้าเว็บที่ส่วนขยายขับอยู่ (Google Flow · ChatGPT · Gemini) — ใส่ตั้งแต่หน้าเริ่มโหลด
 *
 * ผู้ใช้: "รู้แล้วว่าบางเครื่องมันติดแปล" — เครื่องที่ตั้ง Chrome ให้แปลอังกฤษเป็นไทยอัตโนมัติ
 * หน้า Flow ถูกแปลทั้งหน้า: "Nano Banana" กลายเป็น "นาโน บานานา" ชื่อเมนูและชื่อไอคอนเปลี่ยน
 * ส่วนขยายจึงหาปุ่ม/เมนูไม่เจอ (เช่น "ไม่พบรุ่นที่เลือกไว้สำหรับปิดเมนู") แล้วหยุดงาน
 *
 * Chrome ไม่แปลหน้าที่ประกาศ translate="no" หรือ <meta name="google" content="notranslate">
 * ใส่ทั้งสองแบบ และเฝ้าดูไว้ เผื่อหน้าเว็บวาด <html> ใหม่แล้วลบออก
 * หน้าที่ถูกแปลไปก่อนแล้ว — ตัวขับ Flow รายงาน translated ให้ service worker โหลดแท็บใหม่ (sw.js)
 */
(() => {
  const html = document.documentElement;
  if (!html) return;
  const mark = () => {
    if (html.getAttribute('translate') !== 'no') html.setAttribute('translate', 'no');
    if (!html.classList.contains('notranslate')) html.classList.add('notranslate');
    if (!document.querySelector('meta[name="google"][content="notranslate"]')) {
      const meta = document.createElement('meta');
      meta.name = 'google';
      meta.content = 'notranslate';
      (document.head || html).appendChild(meta);
    }
  };
  mark();
  document.addEventListener('DOMContentLoaded', mark, { once: true });
  try {
    new MutationObserver(mark).observe(html, { attributes: true, attributeFilter: ['translate', 'class'] });
  } catch {
    /* ไม่มีตัวเฝ้าก็ยังกันได้จากการใส่ครั้งแรก */
  }
})();
