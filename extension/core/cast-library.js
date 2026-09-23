/**
 * คลังตัวละคร — เก็บภาพต้นแบบ + ข้อมูลตัวละครไว้ใช้ซ้ำในเล่มต่อไป (ผู้ใช้ขอ: "บันทึกอ้างอิงของตัวละครไว้ใช้")
 *
 * เก็บใน IndexedDB ตาราง assets ภายใต้ bookId พิเศษ ไม่ผูกกับเล่มใด ลบเล่มแล้วตัวละครยังอยู่
 * และเขียนสำเนาไฟล์ไว้ที่ _EbookPlus/characters/ ด้วย
 *
 * ตัวละครหนึ่งตัว = ชื่อ + ภาพต้นแบบ (sheet) + บทบาท + รูปลักษณ์ + มาจากเล่มไหน
 * ชื่อซ้ำจากเล่มเดียวกัน = อัปเดตตัวเดิม · ชื่อซ้ำจากคนละเล่ม = คนละตัว (ตัวละครชื่อเหมือนกันได้)
 */
import * as db from './db.js';
import * as W from './workspace.js';
import { safeFolderName } from './workspace.js';

export const CAST_LIBRARY = '__cast_library__';

const idOf = (name, fromBookId) =>
  `lib-${safeFolderName(name).replace(/\s+/g, '-')}-${String(fromBookId || 'x').replace(/[^a-zA-Z0-9]/g, '').slice(0, 6)}.png`;

/** บันทึก/อัปเดตตัวละครในคลัง · คืนชื่อไฟล์ในคลัง หรือ '' ถ้าบันทึกไม่ได้ */
export async function saveToLibrary({ name, role = '', appearance = '', blob, book = null, style = '' }) {
  const clean = String(name || '').trim();
  if (!clean || !blob?.size) return '';
  const file = idOf(clean, book?.id);
  const meta = {
    kind: 'cast-library',
    name: clean,
    role: String(role || ''),
    appearance: String(appearance || ''),
    style: String(style || ''),
    fromBookId: book?.id || '',
    fromTitle: book?.outline?.title || book?.title || '',
    savedAt: Date.now(),
  };
  try {
    await db.saveAsset(CAST_LIBRARY, file, blob, meta);
  } catch {
    return '';
  }
  await W.saveCharacterFile(file, blob, meta).catch(() => '');
  return file;
}

/** ตัวละครทั้งหมดในคลัง ใหม่สุดก่อน */
export async function listLibrary() {
  const rows = await db.loadAssets(CAST_LIBRARY).catch(() => []);
  return (rows || [])
    .filter((r) => r?.blob && r.meta?.kind === 'cast-library')
    .map((r) => ({ file: r.name, blob: r.blob, ...r.meta }))
    .sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
}

export async function removeFromLibrary(file) {
  if (file) await db.deleteAsset(CAST_LIBRARY, file).catch(() => {});
}
