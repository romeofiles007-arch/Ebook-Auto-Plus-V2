/**
 * เครื่องหมายวางภาพ ![คำบรรยาย](fig:ชื่อไฟล์ กว้าง% สูงmm) ต้องไม่หายไปจากเนื้อหา
 *
 * เจอจริง: ภาพของตอน 2.1 สร้างครบสามรูปแล้ว แต่ขั้นสร้างเล่มหยุดด้วย
 *   "ภาพที่สร้างแล้วไม่ถูกวางใน PDF: fig-2.1-1.png, fig-2.1-2.png, fig-2.1-3.png"
 * เครื่องหมายถูกแทรกลงเนื้อหาตอนวางแผนภาพ แล้วขั้นถัดมา (แก้ตามผลตรวจ · ปรับความยาว · เขียนตอนใหม่)
 * ส่งทั้งตอนให้โมเดลเขียนกลับมา คำสั่งบอกให้รักษาเครื่องหมายไว้ แต่ไม่มีโค้ดตรวจ — โมเดลทิ้งเมื่อไร
 * ภาพที่รอคิวสร้างมาเป็นนาทีก็ไม่มีที่ลง และทั้งเล่มหยุดอยู่ตรงนั้น
 *
 * กันสองชั้น: เก็บเครื่องหมายคืนทุกครั้งที่เนื้อหาถูกเขียนทับ (keepFigureMarkers)
 * และก่อนเรียงพิมพ์ ภาพที่มีไฟล์แล้วแต่ยังไม่มีเครื่องหมาย ถูกวางคืนจากแผนภาพ (healFigureMarkers)
 */

/**
 * บรรทัดเครื่องหมายภาพที่ตัวเรียงพิมพ์ยอมรับ — ที่เดียว ใช้ร่วมกันทั้ง PDF (typeset/template.js) และหน้าอ่าน (core/md-html.js)
 *
 * ของเดิมรับคำบรรยายที่ไม่มี ] และความกว้างจำนวนเต็มเท่านั้น เล่ม "แต่งเพลง" มีคำบรรยายอย่าง
 * "โครงสร้าง [Verse] [Chorus]" → บรรทัดไม่เข้าแบบ → ถูกพิมพ์เป็นข้อความดิบ → ภาพที่สร้างแล้ว "ไม่ถูกวางใน PDF"
 * ทั้งที่เครื่องหมายอยู่ครบ กลุ่ม: 1 คำบรรยาย · 2 ชื่อไฟล์ · 3 กว้าง % · 4 สูง mm
 */
export const FIG_RE = /^!\[(.*)\]\(fig:([A-Za-z0-9._-]+)(?:\s+(\d{1,3}(?:\.\d+)?)\s*%)?(?:\s+(\d+(?:\.\d+)?)\s*mm)?\s*\)$/;

const NAMED = /\(fig:([A-Za-z0-9._-]+)/;
const paragraphs = (md) => String(md || '').trim().split(/\n{2,}/);
const oneLine = (p) => String(p).replace(/\s*\n\s*/g, ' ').trim();

/** ชื่อไฟล์ภาพที่เนื้อหานี้มีเครื่องหมาย "ที่ตัวเรียงพิมพ์อ่านออก" — เครื่องหมายที่เสียรูปไม่นับว่ามี */
export function figureNamesIn(md) {
  const names = new Set();
  for (const line of String(md || '').split('\n')) {
    const m = FIG_RE.exec(line.trim());
    if (m) names.add(m[2]);
  }
  return names;
}

/** เครื่องหมายของภาพหนึ่งรูปจากแผนภาพ (book.figures) — รูปที่ตัวเรียงพิมพ์อ่านออกเสมอ */
export function markerFor(f) {
  const pct = Number(f.widthPct);
  const mm = Number(f.heightMm);
  const size = [pct > 0 ? `${Math.round(pct)}%` : '', mm > 0 ? `${Math.round(mm * 10) / 10}mm` : ''].filter(Boolean).join(' ');
  return `![${String(f.caption || '').replace(/\s+/g, ' ').trim()}](fig:${f.name}${size ? ' ' + size : ''})`;
}

/**
 * เนื้อหาใหม่ที่โมเดลเขียนกลับมา → คืนเครื่องหมายภาพที่ฉบับเดิมมีแต่ฉบับใหม่ทำหาย
 * วางที่ตำแหน่งสัดส่วนเดียวกับของเดิม (ภาพที่อยู่ราวกลางตอนก็กลับไปอยู่ราวกลางตอน)
 * คืน { md, restored: [ชื่อไฟล์] } — ไม่มีอะไรหายก็คืนเนื้อหาใหม่ตามเดิมทุกตัวอักษร
 */
export function keepFigureMarkers(oldMd, newMd) {
  const have = new Set([...String(newMd || '').matchAll(new RegExp(NAMED.source, 'g'))].map((m) => m[1]));
  const old = paragraphs(oldMd);
  const lost = [];
  old.forEach((p, i) => {
    const line = oneLine(p);
    const name = line.startsWith('![') ? NAMED.exec(line)?.[1] : null;
    if (name && !have.has(name)) lost.push({ name, marker: line, ratio: i / old.length });
  });
  if (!lost.length) return { md: newMd, restored: [] };
  const parts = paragraphs(newMd);
  const size = parts.length;
  lost.forEach((l, k) => {
    // ไม่วางก่อนย่อหน้าแรก — ภาพที่ขึ้นก่อนเนื้อหาอ่านเหมือนภาพของตอนก่อนหน้า
    const at = Math.min(size, Math.max(1, Math.round(l.ratio * size))) + k;
    parts.splice(at, 0, l.marker);
  });
  return { md: parts.join('\n\n'), restored: lost.map((l) => l.name) };
}

/**
 * ทำให้ภาพทุกรูปในแผนของตอนนี้มีเครื่องหมายที่อ่านออกอยู่ในเนื้อหา
 *   - เครื่องหมายที่อยู่แล้วแต่เสียรูป (คำบรรยายขึ้นบรรทัดใหม่ · ขนาดเขียนผิดแบบ) → เขียนทับด้วยรูปมาตรฐาน ณ ที่เดิม
 *   - เครื่องหมายที่หายไปเลย → วางคืนโดยกระจายให้ทั่วตอน
 * figures: ภาพของตอนนี้จาก book.figures
 */
export function healFigureMarkers(md, figures = []) {
  const want = new Map(figures.filter((f) => f?.kind === 'image' && f.name).map((f) => [f.name, f]));
  if (!want.size || !String(md || '').trim()) return { md, restored: [] };
  const restored = [];
  const removed = [];
  const parts = paragraphs(md).map((p) => {
    const line = oneLine(p);
    const name = line.startsWith('![') ? NAMED.exec(line)?.[1] : null;
    // แผนภาพของตอนนี้เป็นรายการจริง; ชื่อชั่วคราวที่โมเดลเขียนเองไม่ใช่ไฟล์อีกใบ
    // เก็บข้อความอื่นไว้ และไม่เดาว่าชื่อเก่านั้นควรจับคู่กับภาพใด
    if (name && !want.has(name) && FIG_RE.test(line)) {
      removed.push(name);
      return null;
    }
    if (!name || !want.has(name) || (p.trim() === line && FIG_RE.test(line))) return p;
    restored.push(name);
    return markerFor(want.get(name));
  }).filter((p) => p !== null);
  const have = figureNamesIn(parts.join('\n\n'));
  const lost = [...want.values()].filter((f) => !have.has(f.name));
  const size = parts.length;
  lost.forEach((f, k) => {
    const at = Math.min(size, Math.max(1, Math.round(((k + 1) / (lost.length + 1)) * size))) + k;
    parts.splice(at, 0, markerFor(f));
  });
  restored.push(...lost.map((f) => f.name));
  if (removed.length) return { md: parts.join('\n\n'), restored, removed };
  return restored.length ? { md: parts.join('\n\n'), restored } : { md, restored: [] };
}

/** ภาพในแผนของตอนหนึ่ง — ชุดเดียวกันที่ PDF · DOCX · EPUB ใช้ซ่อมเครื่องหมายก่อนประกอบเล่ม */
export const figuresOf = (book, sectionId) =>
  (book?.figures || []).filter((f) => f?.kind === 'image' && f.name && !f.itemFigure && String(f.section) === String(sectionId));

/** เนื้อหาของตอนที่พร้อมประกอบเล่ม: เครื่องหมายภาพของตอนนั้นครบและอ่านออก */
export const withFigureMarkers = (book, sectionId, md) => healFigureMarkers(md, figuresOf(book, sectionId)).md;
