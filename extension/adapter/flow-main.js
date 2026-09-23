/**
 * ตัวดักไฟล์ 2K ของ Google Flow — รันใน MAIN world ของหน้า flow.google.com
 *
 * ปุ่ม ดาวน์โหลด → 2K ของ Flow ขอภาพขยายจากเซิร์ฟเวอร์ แล้วสร้าง blob: URL ในหน้า
 * ตามด้วย a.click() ที่มี attribute download (ตรวจกับหน้าจริงแล้ว ก.ย. 2026)
 * content script อยู่คนละ world มองไม่เห็นการเรียกนั้น จึงต้องมีตัวดักฝั่งนี้หนึ่งตัว
 *
 * ดักเฉพาะตอนที่ content script "ง้าง" ไว้ก่อนกดเท่านั้น และครั้งละหนึ่งไฟล์
 * ผู้ใช้ที่กดดาวน์โหลดเองในเวลาอื่นได้ไฟล์ลงเครื่องตามปกติทุกครั้ง
 *
 * เก็บ Blob จาก createObjectURL ไว้เองตั้งแต่ตอนสร้าง ไม่ fetch จาก URL ทีหลัง
 * เพราะหน้าเว็บมัก revoke URL ทันทีหลังคลิก ถ้าไปอ่านช้ากว่านั้นจะได้แต่ error
 */
(() => {
  if (window.__ebookPlusFlowHook) return;
  window.__ebookPlusFlowHook = true;

  let armed = null; // { token, until }
  const blobs = new Map(); // blob: URL → Blob (เฉพาะตอนง้างไว้)

  window.addEventListener('message', (e) => {
    if (e.source !== window) return;
    const d = e.data;
    if (d?.source !== 'ebookplus-iso') return;
    if (d.type === 'arm') armed = { token: d.token, until: Date.now() + (d.ms || 120000) };
    if (d.type === 'disarm' && armed?.token === d.token) {
      armed = null;
      blobs.clear();
    }
  });

  const live = () => armed && Date.now() < armed.until;

  const createObjectURL = URL.createObjectURL;
  URL.createObjectURL = function (obj) {
    const url = createObjectURL.call(URL, obj);
    if (live() && obj instanceof Blob && /^image\//.test(obj.type || '')) blobs.set(url, obj);
    return url;
  };

  const click = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    if (live() && this.hasAttribute('download') && /^blob:/.test(this.href)) {
      const blob = blobs.get(this.href);
      if (blob) {
        const token = armed.token;
        armed = null;
        blobs.clear();
        window.postMessage({ source: 'ebookplus-main', type: 'captured', token, name: this.download || '', blob }, '*');
        return; // ไม่ต้องลงโฟลเดอร์ Downloads — ระบบเก็บเข้าเล่มและโฟลเดอร์ของเล่มเอง
      }
    }
    return click.call(this);
  };
})();
