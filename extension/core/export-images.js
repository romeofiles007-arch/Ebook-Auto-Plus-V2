/** ตรวจไฟล์สดก่อนส่งออกจริง ไม่เชื่อสถานะ complete ที่อาจค้างจากรอบก่อน */
export function assertExportImages(book, assets, { covers = false } = {}) {
  const names = (book.figures || []).filter((f) => f.kind === 'image' && f.name).map((f) => f.name);
  if (book.pagePattern && book.pagePattern !== 'none') names.push('page-pattern.png');
  if (book.contentMode === 'items' && ['auto', 'prompt'].includes(book.figureMode)) {
    const themes = book.outline?.themes?.length ? book.outline.themes : [{ n: 1 }];
    for (const theme of themes) names.push(`bg-theme-${theme.n}.png`);
  }
  if (covers && book.coverMode && book.coverMode !== 'none') names.push('cover-front.png', 'cover-back.png');
  const have = new Set(assets.filter((a) => a?.blob?.size > 0).map((a) => a.name));
  const rejected = new Set(book.imagePhase?.rejectedImageNames || []);
  const missing = [...new Set(names)].filter((name) => !have.has(name) || rejected.has(name));
  if (missing.length) throw new Error(`ยังส่งออกเล่มไม่ได้ — ภาพยังไม่ครบหรือรอแก้ไข: ${missing.join(', ')} · กลับไปสร้างภาพที่เหลือก่อน`);
  return [...new Set(names)];
}

/** มีไฟล์ครบอย่างเดียวไม่พอ: ต้องมีคำสั่งวางภาพในเอกสารที่กำลังส่งออกด้วย */
export function assertPdfImagesPlaced(src, names) {
  const missing = names.filter((name) => !src.includes(`image("/img/${name}"`));
  if (missing.length) throw new Error(`ยังส่งออกเล่มไม่ได้ — ภาพไม่ได้วางใน PDF: ${missing.join(', ')}`);
  if (src.includes('ยังไม่ได้ใส่ภาพ:')) throw new Error('ยังส่งออกเล่มไม่ได้ — ยังมีช่องภาพว่างใน PDF');
}
