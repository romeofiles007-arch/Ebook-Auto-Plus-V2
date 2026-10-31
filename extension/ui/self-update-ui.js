/**
 * ปุ่ม "อัปเดตเลย" — ใช้ร่วมกันทั้งแผงข้างและ Studio (ตรรกะอยู่ที่ core/self-update.js)
 *
 * ครั้งแรกขอให้เลือกโฟลเดอร์ของส่วนขยาย (โฟลเดอร์ที่ใช้ตอน Load unpacked) แล้วจำไว้
 * ครั้งต่อไปกดแล้วอัปเดตเลย — Chrome อาจถามยืนยันสิทธิ์เขียนโฟลเดอร์อีกครั้งหลังปิดเปิดเบราว์เซอร์
 * เขียนไฟล์เสร็จแล้วรีโหลดส่วนขยาย และเปิด Studio คืนให้ (ธง reopenStudioAfterReload ที่ sw.js อ่านตอนฟื้น)
 */
import * as db from '../core/db.js';
import { applyUpdate, resolveExtensionDir } from '../core/self-update.js';

const KEY = 'extensionDirectory';

async function grantedDir() {
  let dir = null;
  try {
    dir = await db.setting(KEY);
  } catch {
    return null;
  }
  if (!dir || typeof dir.queryPermission !== 'function') return null;
  try {
    let p = await dir.queryPermission({ mode: 'readwrite' });
    if (p !== 'granted') p = await dir.requestPermission({ mode: 'readwrite' });
    return p === 'granted' ? dir : null;
  } catch {
    return null;
  }
}

/**
 * say(ข้อความ) แสดงความคืบหน้า · คืน { cancelled } (ปิดหน้าต่างเลือกโฟลเดอร์) หรือ { changed, total } · โยนข้อผิดพลาดเป็นภาษาคน
 * ต้องเรียกจากการกดปุ่มโดยตรง — การขอสิทธิ์โฟลเดอร์ต้องเกิดระหว่างที่ผู้ใช้เพิ่งกด
 */
export async function runSelfUpdate({ say = () => {} } = {}) {
  if (typeof window.showDirectoryPicker !== 'function')
    throw new Error('เบราว์เซอร์นี้ให้เลือกโฟลเดอร์ไม่ได้ — ใช้ปุ่มดาวน์โหลด ZIP แล้วแตกไฟล์ทับแทน');
  const name = chrome.runtime.getManifest?.().name || 'Ebook Plus';
  let dir = await grantedDir();
  if (!dir) {
    say('เลือกโฟลเดอร์ของส่วนขยาย — โฟลเดอร์เดียวกับที่เลือกตอน Load unpacked (มีไฟล์ manifest.json อยู่ข้างใน) · เลือกครั้งเดียว ครั้งต่อไปจำไว้ให้');
    try {
      dir = await window.showDirectoryPicker({ id: 'ebookplus-extension', mode: 'readwrite' });
    } catch (e) {
      if (e?.name === 'AbortError') return { cancelled: true };
      throw e;
    }
  }
  dir = await resolveExtensionDir(dir, name);
  await db.setting(KEY, dir);
  /**
   * ไม่ถามยืนยันซ้ำ — การกดปุ่ม "อัปเดตเลย" คือการยืนยันแล้ว (แบบเดียวกับโปรเจกต์ Youtube)
   * เดิมใช้กล่องยืนยันของเบราว์เซอร์ ซึ่งไม่ขึ้นในแผงข้างของ Chrome และตอบ "ไม่" ทันที ผู้ใช้จึงเห็น "ยกเลิกการอัปเดต" ทุกครั้ง
   * ผู้เรียกต้องกันไม่ให้กดระหว่างมีงานเดินอยู่เอง (Studio ปิดปุ่มด้วย machineBusy)
   */
  const r = await applyUpdate({ dir, onProgress: say });
  say(r.changed ? `อัปเดตแล้ว ${r.changed} ไฟล์ — กำลังรีโหลด Ebook Plus...` : 'ไฟล์ตรงกับบน GitHub อยู่แล้ว — กำลังรีโหลด Ebook Plus...');
  try {
    await chrome.storage.local.set({ reopenStudioAfterReload: Date.now() });
  } catch {
    /* ไม่มีธงก็แค่ต้องเปิด Studio เอง */
  }
  setTimeout(() => chrome.runtime.reload(), 800);
  return r;
}
