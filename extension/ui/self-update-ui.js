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
 * say(ข้อความ) แสดงความคืบหน้า · คืน { cancelled } หรือ { changed, total } · โยนข้อผิดพลาดเป็นภาษาคน
 * ต้องเรียกจากการกดปุ่มโดยตรง — การขอสิทธิ์โฟลเดอร์ต้องเกิดระหว่างที่ผู้ใช้เพิ่งกด
 */
export async function runSelfUpdate({ say = () => {}, ask = (m) => window.confirm(m) } = {}) {
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
  if (!ask('อัปเดต Ebook Plus เป็นเวอร์ชันล่าสุดจาก GitHub?\n\nเสร็จแล้วส่วนขยายจะรีโหลดตัวเองและเปิด Studio ใหม่ให้ · งานที่กำลังเดินอยู่จะหยุด (กด "ทำต่อ" ได้) · เล่มที่ทำไว้อยู่ครบ'))
    return { cancelled: true };
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
