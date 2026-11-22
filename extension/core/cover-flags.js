/**
 * ภาพปกที่มีอยู่จริงมีตัวหนังสือวาดอยู่แล้วไหม — อ่านจากบันทึกของภาพเอง ไม่ใช่สำเนาบนตัวเล่ม
 *
 * โหมด Flow ตัดสินจากธง book.frontCoverTextBaked / book.backCoverTextBaked (frontCoverTextInImage /
 * backCoverTextInImage) ซึ่งเครื่องผลิตปักไว้ตอนบันทึกภาพปก แต่ Studio โหลดเล่มจากฐานข้อมูลใหม่หลายจุด
 * ขณะที่เครื่องผลิตถือออบเจกต์ของตัวเองอยู่ ใครบันทึกทีหลังคนนั้นชนะ ธงจึงหายไปได้ทั้งที่ภาพมีตัวหนังสือ
 * เห็นจริง (เล่ม "90 วันเดิมพันรัก"): ปกหน้า/หลังบันทึกไว้ว่า meta.textBaked = true แต่ตัวเล่มไม่มีธงเลย
 * → ปกกางเต็มพิมพ์ชื่อเรื่อง ชื่อรอง ชื่อผู้เขียน และคำโปรยทับซ้ำลงบนตัวหนังสือที่อยู่ในภาพแล้ว (ปกซ้อน)
 *
 * meta.textBaked ถูกบันทึกพร้อมภาพในคราวเดียว จึงตรงกับภาพที่มีจริงเสมอ — ให้มันเป็นตัวตัดสิน
 * ภาพที่ไม่มีค่านี้ (ภาพเก่า/ผู้ใช้อัปโหลดเอง) ไม่แตะธงเดิม
 */
import * as db from './db.js';

const COVERS = [
  ['cover-front.png', 'frontCoverTextBaked'],
  ['cover-back.png', 'backCoverTextBaked'],
];

export async function syncCoverTextFlags(book, loadAsset = db.loadAsset) {
  if (!book?.id || book.imageSource !== 'flow') return book;
  for (const [name, key] of COVERS) {
    const asset = await Promise.resolve()
      .then(() => loadAsset(book.id, name))
      .catch(() => null);
    if (typeof asset?.meta?.textBaked === 'boolean') book[key] = asset.meta.textBaked;
  }
  return book;
}
