/**
 * อ่าน PDF เป็นข้อความล้วน (ไทย/อังกฤษ) — ใช้กับไฟล์ต้นฉบับที่ผู้ใช้ให้มาเป็นแหล่งเขียน
 *
 * ผู้ใช้: "ถ้ามี pdf ก็ต้องแปลง แบบนี้จะฝังกับระบบเราได้ไหม"
 *
 * pdf.js (vendor/pdfjs) ให้ข้อความมาเป็นชิ้นเล็ก ๆ พร้อมพิกัด ไม่ใช่ย่อหน้า งานของไฟล์นี้มีสองอย่าง
 *   1) ต่อชิ้นกลับเป็นบรรทัดและย่อหน้า — บรรทัดไทยต่อกันไม่เว้นวรรค บรรทัดอังกฤษเว้นวรรค
 *   2) ซ่อมภาษาไทยที่ PDF เก็บมาผิดรูป: สระอำแตกเป็นสองตัว วรรณยุกต์มาก่อนสระบน
 *      ช่องว่างแทรกหน้าสระ/วรรณยุกต์ และรหัสพิเศษของฟอนต์ไทยรุ่นเก่า
 *
 * อ่านได้เฉพาะ PDF ที่มีตัวหนังสือจริง PDF ที่เป็นภาพสแกนไม่มีข้อความให้ดึง — ต้องบอกผู้ใช้ตรง ๆ
 * ไม่ใช่คืนข้อความว่างแล้วปล่อยให้เล่มเขียนจากต้นฉบับเปล่า
 */

/**
 * ฟอนต์ไทยรุ่นเก่าเก็บสระ/วรรณยุกต์ที่ "ขยับตำแหน่งแล้ว" ไว้ในช่องรหัสส่วนตัว (U+F700–F71A)
 * หน้ากระดาษดูถูก แต่ข้อความที่ดึงออกมาเป็นตัวที่ไม่มีความหมาย ต้องแปลงกลับเป็นตัวมาตรฐาน
 */
const THAI_PUA = {
  '': 'ฐ', '': 'ิ', '': 'ี', '': 'ึ', '': 'ื',
  '': '่', '': '้', '': '๊', '': '๋', '': '์',
  '': '่', '': '้', '': '๊', '': '๋', '': '์',
  '': 'ญ', '': 'ั', '': 'ํ', '': '็',
  '': '่', '': '้', '': '๊', '': '๋', '': '์',
  '': 'ุ', '': 'ู', '': 'ฺ',
};

const TONE = '่-๋'; // ่ ้ ๊ ๋
const VOWEL_MARK = 'ัิ-ฺ็ํ'; // ั ิ-ฺ ็ ํ
const ANY_MARK = 'ัิ-ฺ็-๎';

/** ซ่อมข้อความไทยที่ดึงจาก PDF — ไม่แตะข้อความที่ถูกอยู่แล้ว เรียกซ้ำได้ผลเดิม */
export function tidyThaiPdfText(text) {
  return String(text || '')
    .replace(/[-]/g, (c) => THAI_PUA[c])
    .replace(/[​-‍⁠﻿­\u0000-\u0008\u000b-\u001f]/g, '')
    // ช่องว่างที่แทรกหน้าสระ/วรรณยุกต์/สระอำ: "น ้ำ" "ที ่" — ตัวพวกนี้ยืนเองไม่ได้ จึงเป็นของแตกแน่นอน
    .replace(new RegExp(`([\\u0e01-\\u0e2e${ANY_MARK}])[ \\t]+(?=[${ANY_MARK}\\u0e33])`, 'g'), '$1')
    // สระอำแตก: นิคหิต + สระอา (มีหรือไม่มีวรรณยุกต์คั่น) → สระอำตัวเดียว
    .replace(new RegExp(`\\u0e4d([${TONE}]?)\\u0e32`, 'g'), '$1ำ')
    // วรรณยุกต์มาก่อนสระบน/ล่าง: "ท่ี" → "ที่"
    .replace(new RegExp(`([${TONE}\\u0e4c])([${VOWEL_MARK}])`, 'g'), '$2$1')
    // เครื่องหมายตัวเดียวกันซ้อนสองครั้ง (ชิ้นข้อความซ้ำใน PDF)
    .replace(new RegExp(`([${ANY_MARK}])\\1+`, 'g'), '$1')
    .replace(/[ \t]{2,}/g, ' ');
}

const isThai = (ch) => /[฀-๿]/.test(ch || '');

/**
 * ต่อชิ้นข้อความของหนึ่งหน้าเป็นย่อหน้า
 * items: [{ str, x, y, w, h, eol }] ตามลำดับที่ pdf.js ให้มา (y มากคือสูงกว่าในหน้า)
 */
export function pageTextFromItems(items) {
  const lines = [];
  const weight = new Map(); // ฟอนต์ → จำนวนอักษรในหน้า (มีเฉพาะเมื่อชิ้นข้อความบอกฟอนต์มา)
  let line = null;
  for (const it of items) {
    if (!it.str && !it.eol) continue;
    const h = it.h || line?.h || 10;
    if (line && Math.abs(it.y - line.y) > Math.max(2, h * 0.5)) {
      lines.push(line);
      line = null;
    }
    if (!line) line = { text: '', y: it.y, h, end: it.x, fonts: new Set(), first: it.f, last: it.f };
    if (it.str) {
      if (it.f) {
        line.fonts.add(it.f);
        line.last = it.f;
        weight.set(it.f, (weight.get(it.f) || 0) + it.str.length);
      }
      const gap = it.x - line.end;
      // เว้นวรรคเฉพาะเมื่อชิ้นห่างกันจริง — pdf.js หั่นคำไทยคำเดียวเป็นหลายชิ้นชิดกันได้
      if (line.text && gap > h * 0.22 && !/\s$/.test(line.text) && !/^\s/.test(it.str)) line.text += ' ';
      line.text += it.str;
      line.end = it.x + (it.w || 0);
      line.h = Math.max(line.h, h);
    }
    if (it.eol) {
      lines.push(line);
      line = null;
    }
  }
  if (line) lines.push(line);

  const paras = [];
  let cur = '';
  let prev = null;
  /**
   * หัวข้อกับเนื้อความมักห่างกันไม่ถึงเกณฑ์ขึ้นย่อหน้า แล้วถูกต่อเป็นประโยคเดียว ("สารบัญทำไมเราถึง…")
   * จับเพิ่มสองทาง: ขนาดตัวอักษรเปลี่ยน และบรรทัดที่ทั้งบรรทัดเป็นฟอนต์ที่ไม่ใช่ฟอนต์เนื้อความ (ตัวหนาของหัวข้อ)
   */
  const body = [...weight].sort((a, b) => b[1] - a[1])[0]?.[0];
  const heading = (l) => (l.fonts.size === 1 && !l.fonts.has(body) ? [...l.fonts][0] : null);
  for (const l of lines) {
    const raw = l.text.replace(/[​-‍⁠﻿]/g, '');
    const t = raw.trim();
    if (!t) continue;
    const newPara = prev && (Math.abs(prev.y - l.y) > Math.max(prev.h, l.h) * 1.9 || Math.abs(prev.h - l.h) > 0.6 ||
      (heading(prev) && l.first !== heading(prev)) || (heading(l) && prev.last !== heading(l)));
    if (cur && newPara) {
      paras.push(cur);
      cur = '';
    }
    const spaced = prev?.spaced;
    l.spaced = /\s$/.test(raw);
    if (!cur) cur = t;
    // บรรทัดก่อนจบด้วยช่องว่างจริง = ตัดบรรทัดตรงวรรค ต้องคงวรรคไว้
    else if (spaced) cur += ' ' + t;
    // ไทยต่อไทยไม่เว้นวรรค · คำอังกฤษที่ถูกตัดด้วยยัติภังค์ท้ายบรรทัดต่อกลับเป็นคำเดียว
    else if (isThai(cur.at(-1)) && isThai(t[0])) cur += t;
    else if (/[A-Za-z]-$/.test(cur) && /^[a-z]/.test(t)) cur = cur.slice(0, -1) + t;
    else cur += ' ' + t;
    prev = l;
  }
  if (cur) paras.push(cur);
  return paras;
}

const PAGE_NO = /^[-–—\s]*(?:หน้า\s*|page\s*)?\d{1,4}(?:\s*\/\s*\d{1,4})?[-–—\s]*$/i;

/** รวมทุกหน้า: ตัดเลขหน้า และหัว/ท้ายกระดาษที่ซ้ำแทบทุกหน้า */
export function joinPdfPages(pages) {
  const edge = new Map();
  for (const p of pages) for (const t of new Set([p[0], p.at(-1)].filter(Boolean))) edge.set(t, (edge.get(t) || 0) + 1);
  const repeated = (t) => pages.length >= 6 && t.length < 120 && edge.get(t) >= pages.length * 0.5;
  return pages
    .map((p) => p.filter((t, i) => !((i === 0 || i === p.length - 1) && (PAGE_NO.test(t) || repeated(t)))).join('\n\n'))
    .filter(Boolean)
    .join('\n\n');
}

/**
 * ข้อความไทยที่ดึงมา "น่าจะเพี้ยน" ไหม
 *
 * ดูจากไฟล์จริง อาการของ PDF ไทยที่เสียคือสระบนกับวรรณยุกต์หายไปเฉย ๆ (PDF จาก Google Docs/Chrome บางไฟล์):
 * "เป็น" เหลือ "เปน" · "ที่" เหลือ "ที" · "หรือ" เหลือ "หร อ" — สองคำแรกมีแทบทุกหน้าของหนังสือไทย
 * จึงใช้เป็นตัววัดได้ตรง ๆ ว่าไฟล์นี้ทำเครื่องหมายหายหรือเปล่า อีกอาการคือพยัญชนะโดดเดี่ยวกระจายทั่ว
 * (นับช่องว่างหรือคำสั้นเฉย ๆ ใช้ไม่ได้ — ร้อยแก้วไทยปนอังกฤษมีคำสั้นคั่นเป็นปกติ)
 * ข้อความเพี้ยนที่ถูกใช้เป็นต้นฉบับจะไหลลงเล่มตรง ๆ โดยเฉพาะในโหมดเขียนจากเนื้อหาที่ให้เท่านั้น จึงต้องเตือน
 */
export function thaiTextSuspect(text) {
  const t = String(text || '');
  const count = (re) => (t.match(re) || []).length;
  const dropped = count(/เปน/g) + count(/ที(?![ั-๎ก-ฮ])/g);
  const kept = count(/เป็น/g) + count(/ที่/g);
  if (dropped >= 5 && dropped > kept * 0.15) return true;
  const runs = t.split(/\s+/).filter((r) => /[ก-ฮ]/.test(r));
  return runs.length >= 12 && runs.filter((r) => /^[ก-ฮ]$/.test(r)).length / runs.length > 0.1;
}

let pdfjsPromise = null;
function loadPdfjs() {
  // โหลดเมื่อมีคนเลือก PDF จริงเท่านั้น — ไฟล์ไลบรารีราว 1.8 MB ไม่ควรถ่วงการเปิดหน้าทุกครั้ง
  pdfjsPromise ||= import('../vendor/pdfjs/pdf.min.mjs').then((pdfjs) => {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;
    return pdfjs;
  });
  return pdfjsPromise;
}

/**
 * อ่านไฟล์ PDF (File/Blob หรือ Uint8Array) → { text, pages, emptyPages, suspect }
 * โยนข้อผิดพลาดเป็นภาษาคนเมื่อไฟล์ใส่รหัส เสีย หรือเป็นภาพสแกนทั้งไฟล์
 */
export async function pdfPlainText(file, { onProgress } = {}) {
  const pdfjs = await loadPdfjs();
  const data = file instanceof Uint8Array ? file : new Uint8Array(await file.arrayBuffer());
  let doc;
  try {
    // isEvalSupported: false — หน้าส่วนขยายห้าม eval (CSP) · ฟอนต์ระบบไม่เกี่ยวกับการดึงข้อความ
    // pdf.js ย้ายบัฟเฟอร์ไปให้ worker — ส่งสำเนาไป เก็บตัวจริงไว้ให้ตัวอ่าน PDF ของ Typst
    doc = await pdfjs.getDocument({ data: data.slice(),isEvalSupported: false, useSystemFonts: false, disableFontFace: true, verbosity: 0 }).promise;
  } catch (e) {
    if (e?.name === 'PasswordException') throw new Error('PDF นี้ใส่รหัสผ่านไว้ — ปลดรหัสก่อนแล้วเลือกใหม่');
    throw new Error(`เปิด PDF ไม่ได้ (${e?.message || e})`);
  }
  try {
    /**
     * PDF จาก Typst (รวมถึงเล่มที่ระบบนี้เรียงพิมพ์เอง): pdf.js อ่านกลับมาไม่เป็นภาษา เพราะทิ้ง /ActualText
     * ("ต" กลายเป็น "ตั้" ทุกที่) จึงส่งให้ตัวอ่านเฉพาะของ Typst แทน (core/pdf-typst-text.js)
     * ถ้าตัวนั้นอ่านไม่ออก ให้ปฏิเสธพร้อมทางออก ดีกว่ารับของเพี้ยนจาก pdf.js เข้ามาเป็นต้นฉบับ
     */
    const info = (await doc.getMetadata().catch(() => null))?.info || {};
    const typst = /typst/i.test(`${info.Creator || ''} ${info.Producer || ''}`);
    const pages = [];
    let emptyPages = 0;
    if (typst) {
      try {
        const { typstPdfPages } = await import('./pdf-typst-text.js');
        for (const items of await typstPdfPages(data)) {
          const paras = pageTextFromItems(items).map(tidyThaiPdfText).filter((t) => t.trim());
          if (!paras.length) emptyPages++;
          pages.push(paras);
        }
      } catch (e) {
        throw new Error(`PDF นี้สร้างด้วย Typst แต่อ่านข้อความออกมาไม่ได้ (${e?.message || e}) — ถ้าเป็นเล่มจากระบบนี้ ให้เปิดเล่มนั้นแล้วกด "ส่งออก .docx" จากนั้นเลือกไฟล์ .docx แทน`);
      }
    }
    for (let n = 1; !typst && n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      const paras = pageTextFromItems(content.items.map((it) => ({
        str: it.str, x: it.transform[4], y: it.transform[5], w: it.width, h: it.height || Math.abs(it.transform[3]), eol: it.hasEOL,
      }))).map(tidyThaiPdfText).filter((t) => t.trim());
      if (!paras.length) emptyPages++;
      pages.push(paras);
      page.cleanup();
      onProgress?.(n, doc.numPages);
    }
    const text = joinPdfPages(pages);
    // เฉลี่ยไม่ถึง 20 อักษรต่อหน้า = ไม่มีชั้นข้อความ ทั้งไฟล์เป็นรูปของหน้ากระดาษ
    if (text.replace(/\s/g, '').length < Math.max(20, doc.numPages * 20))
      throw new Error(`PDF นี้เป็นภาพสแกน ไม่มีตัวหนังสือให้ดึง (${doc.numPages} หน้า) — ต้องทำ OCR ก่อน เช่น อัปโหลดขึ้น Google Drive แล้วเปิดด้วย Google เอกสาร จากนั้นบันทึกเป็น .docx มาใส่`);
    return { text, pages: doc.numPages, emptyPages, suspect: thaiTextSuspect(text) };
  } finally {
    await doc.destroy();
  }
}
