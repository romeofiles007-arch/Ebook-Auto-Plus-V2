/**
 * ตัวดักไฟล์ 2K ของ Google Flow — รันใน MAIN world ของหน้า flow.google.com
 *
 * ปุ่ม ดาวน์โหลด → 2K ของ Flow ขอภาพขยายจากเซิร์ฟเวอร์ แล้วสร้าง blob: URL ในหน้า
 * ตามด้วย a.click() ที่มี attribute download (ตรวจกับหน้าจริงแล้ว ก.ย. 2026)
 * content script อยู่คนละ world มองไม่เห็นการเรียกนั้น จึงต้องมีตัวดักฝั่งนี้หนึ่งตัว
 *
 * Flow แจ้ง "เราพบกิจกรรมที่ผิดปกติบางอย่าง … ส่วนขยายของเบราว์เซอร์ที่แก้ไขหน้าเว็บอาจทำให้เกิดปัญหา" (พ.ย. 2026)
 * เดิมเปลี่ยน URL.createObjectURL และ HTMLAnchorElement.prototype.click ค้างไว้ตั้งแต่เปิดหน้าจนปิด
 * ตอนนี้เปลี่ยนเฉพาะช่วงที่ content script "ง้าง" ไว้รอไฟล์ แล้วคืนของเดิมทันทีที่ได้ไฟล์ / ยกเลิก / หมดเวลา
 * เวลาที่เหลือ (รวมตอนกดสร้างภาพ) หน้า Flow ใช้ฟังก์ชันของเบราว์เซอร์ตัวจริง ไม่มีอะไรของเราติดอยู่
 *
 * ดักครั้งละหนึ่งไฟล์ ผู้ใช้ที่กดดาวน์โหลดเองในเวลาอื่นได้ไฟล์ลงเครื่องตามปกติทุกครั้ง
 * เก็บ Blob จาก createObjectURL ไว้เองตั้งแต่ตอนสร้าง ไม่ fetch จาก URL ทีหลัง
 * เพราะหน้าเว็บมัก revoke URL ทันทีหลังคลิก ถ้าไปอ่านช้ากว่านั้นจะได้แต่ error
 */
(() => {
  // กันโหลดซ้ำ (manifest + sw ฉีดซ้ำ) ด้วย Symbol ที่ไม่โผล่ใน Object.keys(window) — ไม่ทิ้งชื่อของเราไว้บนหน้า
  const GUARD = Symbol.for('ebookplus.flow2k');
  if (window[GUARD]) return;
  Object.defineProperty(window, GUARD, { value: true });

  const native = { createObjectURL: URL.createObjectURL, click: HTMLAnchorElement.prototype.click };
  let armed = null; // { token, until }
  let timer = 0;
  const blobs = new Map(); // blob: URL → Blob (เฉพาะตอนง้างไว้)

  const live = () => armed && Date.now() < armed.until;

  function createObjectURL(obj) {
    const url = native.createObjectURL.call(URL, obj);
    if (live() && obj instanceof Blob && /^image\//.test(obj.type || '')) blobs.set(url, obj);
    return url;
  }

  function click() {
    if (live() && this.hasAttribute('download') && /^blob:/.test(this.href)) {
      const blob = blobs.get(this.href);
      if (blob) {
        const token = armed.token;
        disarm();
        window.postMessage({ source: 'ebookplus-main', type: 'captured', token, name: this.download || '', blob }, '*');
        return; // ไม่ต้องลงโฟลเดอร์ Downloads — ระบบเก็บเข้าเล่มและโฟลเดอร์ของเล่มเอง
      }
    }
    return native.click.call(this);
  }

  function install() {
    if (URL.createObjectURL !== createObjectURL) URL.createObjectURL = createObjectURL;
    if (HTMLAnchorElement.prototype.click !== click) HTMLAnchorElement.prototype.click = click;
  }

  /** คืนของเดิม — แต่ถ้ามีใครเปลี่ยนทับเราไปแล้ว ไม่ไปรื้อของเขา */
  function restore() {
    if (URL.createObjectURL === createObjectURL) URL.createObjectURL = native.createObjectURL;
    if (HTMLAnchorElement.prototype.click === click) HTMLAnchorElement.prototype.click = native.click;
  }

  function disarm() {
    armed = null;
    blobs.clear();
    clearTimeout(timer);
    restore();
  }

  window.addEventListener('message', (e) => {
    if (e.source !== window) return;
    const d = e.data;
    if (d?.source !== 'ebookplus-iso') return;
    if (d.type === 'arm') {
      const ms = d.ms || 120000;
      armed = { token: d.token, until: Date.now() + ms };
      install();
      clearTimeout(timer);
      timer = setTimeout(disarm, ms + 1000);
    }
    if (d.type === 'disarm' && armed?.token === d.token) disarm();
  });
})();
