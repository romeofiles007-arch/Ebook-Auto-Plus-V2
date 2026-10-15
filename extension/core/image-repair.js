/** วางแผนซ่อมเฉพาะภาพที่ระบุในเล่มปัจจุบัน ก่อนแก้ฐานข้อมูลหรือส่งคำสั่งให้ Flow */
export function planFlowImageRepair(book, jobs, request = {}) {
  if (!book?.id || request.bookId !== book.id) throw new Error('รหัสเล่มไม่ตรงกับเล่มที่เปิดอยู่');
  if (book.imageSource !== 'flow') throw new Error('คำสั่งนี้ใช้กับภาพจาก Google Flow เท่านั้น');
  const { regenerate = [], recapture = [] } = request;
  if (!Array.isArray(regenerate) || !Array.isArray(recapture)) throw new Error('รายการภาพต้องเป็นอาร์เรย์');
  const allowed = new Set(jobs.filter((j) => j.kind === 'interior').map((j) => j.name));
  const all = [...new Set([...regenerate, ...recapture])];
  if (!all.length) throw new Error('ยังไม่ได้ระบุภาพที่ต้องแก้');
  for (const name of all) {
    if (typeof name !== 'string' || !allowed.has(name)) throw new Error(`ภาพไม่ได้อยู่ในแผนภาพประกอบของเล่มนี้: ${String(name)}`);
  }
  const redraw = [...new Set(regenerate)];
  const redrawSet = new Set(redraw);
  const retrieve = [...new Set(recapture)].filter((name) => !redrawSet.has(name));
  for (const name of retrieve) {
    if (!book.imagePhase?.agentMediaIds?.[name]) throw new Error(`ไม่มีรหัสภาพเดิมที่ยืนยันแล้วสำหรับดึงไฟล์ใหม่: ${name}`);
  }
  return { regenerate: redraw, recapture: retrieve, all };
}
