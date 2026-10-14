/**
 * อ่านข้อความจาก PDF ที่ Typst สร้าง — รวมถึงทุกเล่มที่ระบบนี้เรียงพิมพ์เอง
 *
 * ผู้ใช้เลือกเล่มของตัวเอง (PDF จากระบบนี้) มาเป็นต้นฉบับ แล้วถูกปฏิเสธ เพราะ pdf.js อ่านไฟล์แบบนี้ไม่เป็นภาษา
 *
 * เหตุที่ pdf.js อ่านไม่ได้: Typst ให้รูปอักษรหนึ่งตัวมีข้อความในตารางแปลงอักษรได้ค่าเดียว
 * คือทั้งพยางค์แรกที่รูปนั้นปรากฏ ("ต" → "ตั้") แล้วครอบทุกจุดที่ข้อความจริงไม่ตรงกับตารางด้วย
 *   /Span << /ActualText <FEFF…> >> BDC … EMC
 * โปรแกรมอ่านที่ใช้ ActualText (Acrobat, Chrome) ได้ข้อความถูก ส่วน pdf.js ทิ้ง ActualText ไปตอนดึงข้อความ
 *
 * ที่นี่จึงเดิน content stream เอง: ในช่วง ActualText ใช้ข้อความที่ประกาศไว้ นอกช่วงใช้ตารางแปลงอักษร
 * ข้ามหัว/ท้ายกระดาษที่ Typst ติดป้าย /Artifact ไว้ให้แล้ว และข้ามชิ้นซ้ำของวรรณยุกต์
 * ด้วยกติกาเดียวกับตัวซ่อมชั้นข้อความ (typeset/pdf-text-fix.js) — เล่มที่ยังไม่ผ่านตัวซ่อมก็อ่านได้ไม่ซ้ำ
 *
 * รองรับโครงไฟล์แบบที่ Typst เขียนเท่านั้น (ตาราง xref แบบคลาสสิก) อ่านไม่ออกตรงไหนโยนข้อผิดพลาด
 * ให้ผู้เรียกบอกผู้ใช้ ไม่คืนข้อความครึ่ง ๆ กลาง ๆ
 */
import { dec, parseObjects, streamText, zeroWidthCids, parseToUnicode, cidsOf } from '../typeset/pdf-text-fix.js';

const MARK = /[ัำ-ฺ็-๎​⁠]/;
const hasBase = (s) => [...s].some((ch) => !MARK.test(ch));
const utf16 = (hex) => {
  let s = '';
  for (let i = 0; i + 4 <= hex.length; i += 4) s += String.fromCharCode(parseInt(hex.slice(i, i + 4), 16));
  return s.replace(/^﻿/, '');
};
const refs = (text) => (text.match(/\d+(?= 0 R)/g) || []).map(Number);
const mul = (m, n) => [m[0] * n[0] + m[1] * n[2], m[0] * n[1] + m[1] * n[3], m[2] * n[0] + m[3] * n[2], m[2] * n[1] + m[3] * n[3],
  m[4] * n[0] + m[5] * n[2] + n[4], m[4] * n[1] + m[5] * n[3] + n[5]];
const ID = [1, 0, 0, 1, 0, 0];
const NUM = '(-?[\\d.]+)';
const STR = '\\((?:\\\\[\\s\\S]|[^\\\\)])*\\)';
// ลำดับสำคัญ: สตริงต้องมาก่อน ไม่งั้นตัว q/Q ที่เป็นข้อมูลในสตริงจะถูกอ่านเป็นคำสั่ง
const TOKEN = new RegExp(
  `(${STR}\\s*Tj|\\[(?:${STR}|[^\\]()])*\\]\\s*TJ)` +
  `|\\/(\\w+)\\s*<<([\\s\\S]*?)>>\\s*BDC|\\/\\w+\\s+\\/\\w+\\s+(BDC)\\b|\\/\\w+\\s+(BMC)\\b|\\b(EMC)\\b` +
  `|\\/(\\w+) ${NUM} Tf|${NUM} ${NUM} ${NUM} ${NUM} ${NUM} ${NUM} (cm|Tm)\\b|${NUM} ${NUM} (T[dD])\\b|\\b(q|Q|BT)\\b`, 'g');

/** content stream ของหนึ่งหน้า → ชิ้นข้อความ [{ str, x, y, h }] ตามลำดับในไฟล์ */
export function typstPageItems(content, fonts) {
  const items = [];
  const stack = []; // ช่วง marked content ที่เปิดอยู่: { kind: 'artifact' | 'span' | '', text, cids, at }
  const saved = [];
  let ctm = ID;
  let tm = ID;
  let font = null;
  let fname = '';
  let size = 10;
  const here = () => { const p = mul(tm, ctm); return { x: p[4], y: p[5], h: size, f: fname }; };
  const push = (str, at, w) => { if (str) items.push({ str, ...at, w }); };
  // ความกว้างของชิ้น — ต้องรู้ เพราะบรรทัดที่จัดเต็มแนว Typst ไม่วาดช่องว่างเป็นตัวอักษร แต่เลื่อนตำแหน่งชิ้นถัดไปแทน
  const widthOf = (cids, f) => (f ? cids.reduce((n, c) => n + f.width(c), 0) / 1000 * size * Math.abs(mul(tm, ctm)[0]) : 0);
  let m;
  TOKEN.lastIndex = 0;
  while ((m = TOKEN.exec(content))) {
    if (m[1]) {
      const cids = [...m[1].matchAll(new RegExp(STR, 'g'))].flatMap((s) => cidsOf(s[0].slice(1, -1)));
      const span = stack.findLast((s) => s.kind === 'span');
      if (stack.some((s) => s.kind === 'artifact')) continue;
      if (span) {
        span.at ||= here();
        span.cids.push(...cids);
        span.font ||= font;
        span.w = (span.w || 0) + widthOf(cids, font);
      } else if (font && !(cids.length && cids.every(font.zero) && cids.some((c) => hasBase(font.uni.get(c) || ''))))
        push(cids.map((c) => font.uni.get(c) ?? '').join(''), here(), widthOf(cids, font));
    } else if (m[2]) {
      const actual = /\/ActualText\s*<([0-9A-Fa-f]*)>/.exec(m[3]);
      stack.push(m[2] === 'Artifact' ? { kind: 'artifact' } : actual ? { kind: 'span', text: utf16(actual[1]), cids: [] } : { kind: '' });
    } else if (m[4] || m[5]) stack.push({ kind: '' });
    else if (m[6]) {
      const done = stack.pop();
      // ชิ้นที่มีแต่รูปอักษรกว้างศูนย์ = เศษของพยางค์ที่ชิ้นพยัญชนะอ่านไปครบแล้ว (ดู fixContent)
      if (done?.kind === 'span' && !stack.some((s) => s.kind === 'artifact') &&
          !(done.font && done.cids.length && done.cids.every(done.font.zero)))
        push(done.text, done.at || here(), done.w || 0);
    } else if (m[7]) {
      font = fonts[m[7]] || null;
      fname = m[7];
      size = Number(m[8]) || size;
    } else if (m[15]) {
      const mat = m.slice(9, 15).map(Number);
      if (m[15] === 'cm') ctm = mul(mat, ctm);
      else tm = mat;
    } else if (m[18]) tm = mul([1, 0, 0, 1, Number(m[16]), Number(m[17])], tm);
    else if (m[19] === 'q') saved.push(ctm);
    else if (m[19] === 'Q') ctm = saved.pop() || ID;
    else if (m[19] === 'BT') tm = ID;
  }
  return items;
}

/** ความกว้างของรูปอักษร (หน่วย 1/1000 ของขนาดฟอนต์) จาก /W และ /DW ของ CIDFont */
export function cidWidths(dict = '') {
  const dw = Number(/\/DW (\d+)/.exec(dict)?.[1] ?? 1000);
  const W = new Map();
  const t = /\/W \[([\s\S]*?)\]\s*(?:\n|$)/.exec(dict)?.[1].match(/\[|\]|[\d.]+/g) || [];
  for (let i = 0; i < t.length; ) {
    const a = Number(t[i]);
    if (t[i + 1] === '[') {
      let j = i + 2;
      for (let k = a; j < t.length && t[j] !== ']'; ) W.set(k++, Number(t[j++]));
      i = j + 1;
    } else {
      for (let c = a; c <= Number(t[i + 1]); c++) W.set(c, Number(t[i + 2]));
      i += 3;
    }
  }
  return (cid) => W.get(cid) ?? dw;
}

/** ไฟล์ PDF จาก Typst → รายการหน้า แต่ละหน้าเป็นชิ้นข้อความ */
export async function typstPdfPages(bytes) {
  const s = dec(bytes);
  if (!s.startsWith('%PDF-') || !/\nxref\n/.test(s)) throw new Error('โครงไฟล์ไม่ใช่แบบที่ Typst เขียน');
  const objs = new Map(parseObjects(s).map((o) => [o.num, o]));
  const dictOf = (n) => objs.get(n)?.dict || '';

  const fontCache = new Map();
  const fontOf = async (n) => {
    if (fontCache.has(n)) return fontCache.get(n);
    const d = dictOf(n);
    const tu = objs.get(Number(/\/ToUnicode (\d+) 0 R/.exec(d)?.[1]));
    const desc = dictOf(Number(/\/DescendantFonts \[\s*(\d+) 0 R/.exec(d)?.[1]));
    const f = tu ? { uni: parseToUnicode(await streamText(tu)), zero: desc ? zeroWidthCids(desc) : () => false, width: cidWidths(desc) } : null;
    fontCache.set(n, f);
    return f;
  };

  const pageNums = [];
  const walk = (n, depth = 0) => {
    const d = dictOf(n);
    if (/\/Type \/Pages\b/.test(d) && depth < 12) for (const k of refs(/\/Kids \[([^\]]*)\]/.exec(d)?.[1] || '')) walk(k, depth + 1);
    else if (/\/Type \/Page\b/.test(d)) pageNums.push(n);
  };
  const root = [...objs.values()].find((o) => /\/Type \/Pages\b/.test(o.dict) && !/\/Parent /.test(o.dict));
  if (!root) throw new Error('หาโครงหน้าของ PDF ไม่เจอ');
  walk(root.num);

  const pages = [];
  for (const n of pageNums) {
    const d = dictOf(n);
    const res = /\/Resources (\d+) 0 R/.exec(d) ? dictOf(Number(/\/Resources (\d+) 0 R/.exec(d)[1])) : d;
    const fontDict = /\/Font (\d+) 0 R/.exec(res) ? dictOf(Number(/\/Font (\d+) 0 R/.exec(res)[1])) : /\/Font <<([\s\S]*?)>>/.exec(res)?.[1] || '';
    const fonts = {};
    for (const f of fontDict.matchAll(/\/(\w+) (\d+) 0 R/g)) fonts[f[1]] = await fontOf(Number(f[2]));
    const contents = /\/Contents \[([^\]]*)\]/.exec(d) ? refs(/\/Contents \[([^\]]*)\]/.exec(d)[1]) : refs(/\/Contents \d+ 0 R/.exec(d)?.[0] || '');
    let stream = '';
    for (const c of contents) if (objs.get(c)?.stream) stream += (await streamText(objs.get(c))) + '\n';
    pages.push(typstPageItems(stream, fonts));
  }
  return pages;
}
