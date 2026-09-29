/**
 * ซ่อมชั้นข้อความ (text layer) ของ PDF ภาษาไทยที่ Typst สร้าง — คัดลอก/ค้นหาแล้วได้ตัวซ้ำ
 *
 * เจอจริง (7 วันจัดการหวัดทีละขั้น · Typst 0.14.2): คัดลอกออกมาได้ "ดีขึ้ขึ้้น", "สิ่สิ่ง", "นั้นั้น" ราว 500 จุดทั้งเล่ม
 * ทั้งที่บนหน้ากระดาษสะกดถูก
 *
 * สาเหตุ: วรรณยุกต์ที่ถูกขยับตำแหน่ง (เช่น ้ ของ "ขึ้น") Typst แยกไปวาดเป็นชิ้นต่างหาก
 * แต่ติดข้อความของทั้งพยางค์ ("ขึ้") ไปกับชิ้นนั้นอีกรอบ — ทั้งแบบ /ActualText และแบบแผนที่ ToUnicode
 * โปรแกรมอ่าน PDF ที่ทำตามมาตรฐาน (Acrobat, Chrome, MuPDF) จึงอ่านพยางค์นั้นสองครั้ง
 *
 * วิธีซ่อม: ชิ้นที่มีแต่ glyph ความกว้างศูนย์ (เครื่องหมายที่ลอยอยู่บนตัวอื่น) แต่ติดข้อความที่มีพยัญชนะ/สระเต็มตัว
 * คือชิ้นซ้ำแน่นอน — ข้อความของพยางค์นั้นถูกอ่านไปแล้วจากชิ้นที่มีตัวพยัญชนะ จึงตั้งข้อความของชิ้นซ้ำให้ว่าง
 * ไม่แตะรูปที่วาด (หน้ากระดาษเหมือนเดิมทุกจุด) แตะเฉพาะข้อความที่ใช้คัดลอก/ค้นหา
 *
 * ทำงานกับ PDF ที่ Typst เขียนเท่านั้น (ตาราง xref แบบคลาสสิก · stream บีบด้วย FlateDecode)
 * อ่านไม่ออกหรือไม่แน่ใจตรงไหน = คืนไฟล์เดิม ไม่ยอมทำให้ไฟล์เสีย
 */

const enc = (s) => Uint8Array.from(s, (c) => c.charCodeAt(0) & 0xff);
const dec = (u8) => {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return s;
};

async function pipe(u8, stream) {
  const w = stream.writable.getWriter();
  w.write(u8);
  w.close();
  return new Uint8Array(await new Response(stream.readable).arrayBuffer());
}
const inflate = (u8) => pipe(u8, new DecompressionStream('deflate'));
const deflate = (u8) => pipe(u8, new CompressionStream('deflate'));

// อักษรไทยที่เป็นเครื่องหมายลอย/ต่อท้าย (ไม่ใช่ตัวเต็ม) — สระบน/ล่าง วรรณยุกต์ ไม้ไต่คู้ การันต์ สระอำ
const MARK = /[ัำ-ฺ็-๎​⁠]/;
const hasBase = (s) => [...s].some((ch) => !MARK.test(ch));

/** แยกไฟล์เป็นอ็อบเจกต์ (เลข · หัว dict · stream ดิบ) ตามลำดับในไฟล์ */
function parseObjects(s) {
  const objs = [];
  const re = /(\d+) 0 obj\n/g;
  let m;
  while ((m = re.exec(s))) {
    const start = m.index;
    const bodyStart = re.lastIndex;
    const streamAt = s.indexOf('stream\n', bodyStart);
    const endobjAt = s.indexOf('\nendobj', bodyStart);
    if (endobjAt < 0) throw new Error('endobj');
    if (streamAt > 0 && streamAt < endobjAt) {
      const dict = s.slice(bodyStart, streamAt);
      const len = Number(/\/Length (\d+)/.exec(dict)?.[1]);
      if (!Number.isFinite(len)) throw new Error('length');
      const dataStart = streamAt + 7;
      const after = s.indexOf('\nendobj', dataStart + len);
      objs.push({ num: Number(m[1]), start, dict, data: s.slice(dataStart, dataStart + len), end: after + 7, stream: true });
      re.lastIndex = after + 7;
    } else {
      objs.push({ num: Number(m[1]), start, dict: s.slice(bodyStart, endobjAt), end: endobjAt + 7, stream: false });
      re.lastIndex = endobjAt + 7;
    }
  }
  return objs;
}

const ref = (dict, key) => Number(new RegExp(`/${key} (\\d+) 0 R`).exec(dict)?.[1]);

async function streamText(o) {
  const raw = enc(o.data);
  return /\/FlateDecode/.test(o.dict) ? dec(await inflate(raw)) : o.data;
}

/** ความกว้างของ glyph จาก /W และ /DW ของ CIDFont */
function zeroWidthCids(dict) {
  const dw = Number(/\/DW (\d+)/.exec(dict)?.[1] ?? 1000);
  const W = new Map();
  const w = /\/W \[([\s\S]*?)\]\s*(?:\n|$)/.exec(dict);
  if (w) {
    const t = w[1].match(/\[|\]|[\d.]+/g) || [];
    for (let i = 0; i < t.length; ) {
      const a = Number(t[i]);
      if (t[i + 1] === '[') {
        let j = i + 2;
        let k = a;
        while (t[j] !== ']') W.set(k++, Number(t[j++]));
        i = j + 1;
      } else {
        for (let c = a; c <= Number(t[i + 1]); c++) W.set(c, Number(t[i + 2]));
        i += 3;
      }
    }
  }
  return (cid) => (W.has(cid) ? W.get(cid) : dw) === 0;
}

function parseToUnicode(text) {
  const map = new Map();
  for (const m of text.matchAll(/<([0-9A-Fa-f]{4})>\s*<([0-9A-Fa-f]*)>/g)) {
    const hex = m[2];
    let str = '';
    for (let i = 0; i + 4 <= hex.length; i += 4) str += String.fromCharCode(parseInt(hex.slice(i, i + 4), 16));
    map.set(parseInt(m[1], 16), str);
  }
  return map;
}

/** literal string ของ PDF → รหัส glyph 2 ไบต์ */
function cidsOf(lit) {
  const bytes = [];
  for (let i = 0; i < lit.length; i++) {
    const c = lit[i];
    if (c !== '\\') {
      bytes.push(c.charCodeAt(0));
      continue;
    }
    const n = lit[++i];
    if (/[0-7]/.test(n)) {
      let oct = n;
      while (oct.length < 3 && /[0-7]/.test(lit[i + 1])) oct += lit[++i];
      bytes.push(parseInt(oct, 8));
    } else bytes.push({ n: 10, r: 13, t: 9, b: 8, f: 12 }[n] ?? n.charCodeAt(0));
  }
  const cids = [];
  for (let i = 0; i + 1 < bytes.length; i += 2) cids.push(bytes[i] * 256 + bytes[i + 1]);
  return cids;
}

const SHOW = /\((?:\\[\s\S]|[^\\)])*\)\s*Tj|\[(?:\((?:\\[\s\S]|[^\\)])*\)|[^\]()])*\]\s*TJ/g;
const litsIn = (op) => [...op.matchAll(/\((?:\\[\s\S]|[^\\)])*\)/g)].map((m) => m[0].slice(1, -1));

/**
 * ซ่อม content stream หนึ่งหน้า
 * fonts: ชื่อทรัพยากร (f0) → { zero(cid), uni: Map }
 */
export function fixContent(content, fonts) {
  let changed = 0;
  let font = null;
  const out = content.replace(
    /\/Span <<\s*\/ActualText <([0-9A-Fa-f]*)>\s*>> BDC([\s\S]*?)EMC|\/(\w+) [\d.]+ Tf|\((?:\\[\s\S]|[^\\)])*\)\s*Tj|\[(?:\((?:\\[\s\S]|[^\\)])*\)|[^\]()])*\]\s*TJ/g,
    (m, hex, body, fname) => {
      if (fname) {
        font = fonts[fname] || null;
        return m;
      }
      if (hex !== undefined) {
        // ชิ้นที่มี ActualText แต่ glyph ทั้งหมดกว้างศูนย์ = เศษของพยางค์ที่ชิ้นตัวพยัญชนะอ่านไปครบแล้ว
        // (ทั้งแบบติดทั้งพยางค์ "ขึ้" และแบบติดแค่วรรณยุกต์ "้" — ทดสอบแล้วทั้งสองแบบเป็นของซ้ำ)
        const f = /\/(\w+) [\d.]+ Tf/g;
        let fm;
        let spanFont = font;
        while ((fm = f.exec(body))) spanFont = fonts[fm[1]] || spanFont;
        font = spanFont;
        const cids = (body.match(SHOW) || []).flatMap((op) => litsIn(op).flatMap(cidsOf));
        let text = '';
        for (let i = 0; i + 4 <= hex.length; i += 4) text += String.fromCharCode(parseInt(hex.slice(i, i + 4), 16));
        text = text.replace(/^﻿/, '');
        if (spanFont && cids.length && cids.every(spanFont.zero) && text) {
          changed++;
          return m.replace(`<${hex}>`, '<FEFF>');
        }
        return m;
      }
      // ชิ้นที่ไม่มี ActualText: อ่านจาก ToUnicode — glyph กว้างศูนย์ที่แผนที่ติดตัวเต็มมาด้วย = พยางค์ซ้ำ
      // (ชิ้นใน /ActualText ถูกจับทั้งก้อนที่กิ่งบนแล้ว มาถึงตรงนี้คือชิ้นที่อยู่นอก ActualText เท่านั้น)
      if (!font) return m;
      const cids = litsIn(m).flatMap(cidsOf);
      if (cids.length && cids.every(font.zero) && cids.some((c) => hasBase(font.uni.get(c) || ''))) {
        changed++;
        return `/Span <<\n  /ActualText <FEFF>\n>> BDC\n${m}\nEMC`;
      }
      return m;
    },
  );
  return { out, changed };
}

/** ซ่อมทั้งไฟล์ · คืน { bytes, changed } — พังตรงไหนคืนของเดิม */
export async function fixThaiTextLayer(input) {
  const src = input instanceof Uint8Array ? input : new Uint8Array(input);
  try {
    const s = dec(src);
    if (!s.startsWith('%PDF-') || !/\nxref\n/.test(s)) return { bytes: src, changed: 0 };
    const objs = parseObjects(s);
    const byNum = new Map(objs.map((o) => [o.num, o]));

    // ฟอนต์ Type0: ชื่อ glyph ความกว้างศูนย์ + แผนที่ ToUnicode
    const fontInfo = new Map();
    for (const o of objs) {
      if (!/\/Subtype \/Type0/.test(o.dict)) continue;
      const desc = byNum.get(Number(/\/DescendantFonts \[(\d+) 0 R/.exec(o.dict)?.[1]));
      const tu = byNum.get(ref(o.dict, 'ToUnicode'));
      if (!desc || !tu) continue;
      fontInfo.set(o.num, { zero: zeroWidthCids(desc.dict), uni: parseToUnicode(await streamText(tu)) });
    }
    if (!fontInfo.size) return { bytes: src, changed: 0 };

    const replaced = new Map();
    let changed = 0;
    const rewrite = async (o, text) => {
      const data = /\/FlateDecode/.test(o.dict) ? dec(await deflate(enc(text))) : text;
      const dict = o.dict.replace(/\/Length \d+/, `/Length ${data.length}`);
      replaced.set(o.num, `${o.num} 0 obj\n${dict}stream\n${data}\nendstream\nendobj`);
    };

    /**
     * แผนที่ ToUnicode: glyph กว้างศูนย์ที่ติดข้อความตัวเต็มมา (เช่น ้ ถูกแมปเป็น "นี้") คือของซ้ำ
     * ข้อความของพยางค์ถูกอ่านจาก glyph ตัวพยัญชนะไปแล้ว — ให้ glyph นี้ไม่มีข้อความ (<>) จำนวนรายการคงเดิม
     */
    for (const o of objs) {
      if (!/\/Subtype \/Type0/.test(o.dict)) continue;
      const info = fontInfo.get(o.num);
      const tu = byNum.get(ref(o.dict, 'ToUnicode'));
      if (!info || !tu) continue;
      const text = await streamText(tu);
      let n = 0;
      const fixed = text.replace(/<([0-9A-Fa-f]{4})>(\s*)<([0-9A-Fa-f]+)>/g, (m, cid, sp) => {
        const c = parseInt(cid, 16);
        if (!info.zero(c) || !hasBase(info.uni.get(c) || '')) return m;
        n++;
        return `<${cid}>${sp}<>`;
      });
      if (n) {
        changed += n;
        await rewrite(tu, fixed);
      }
    }

    // หน้าไหนใช้ฟอนต์ชื่ออะไร แล้วซ่อม content stream ของหน้านั้น
    for (const o of objs) {
      if (!/\/Type \/Page\b/.test(o.dict)) continue;
      const fontDict = /\/Font <<([\s\S]*?)>>/.exec(o.dict)?.[1] || '';
      const fonts = {};
      for (const fm of fontDict.matchAll(/\/(\w+) (\d+) 0 R/g)) if (fontInfo.has(Number(fm[2]))) fonts[fm[1]] = fontInfo.get(Number(fm[2]));
      const c = byNum.get(ref(o.dict, 'Contents'));
      if (!c?.stream || !Object.keys(fonts).length) continue;
      const res = fixContent(await streamText(c), fonts);
      if (!res.changed) continue;
      changed += res.changed;
      await rewrite(c, res.out);
    }
    if (!changed) return { bytes: src, changed: 0 };

    // เขียนไฟล์ใหม่: หัวไฟล์ · อ็อบเจกต์ (ที่แก้ใช้ของใหม่) · xref · trailer
    const head = s.slice(0, objs[0].start);
    let body = head;
    const offsets = new Map();
    for (const o of objs) {
      offsets.set(o.num, body.length);
      body += (replaced.get(o.num) ?? s.slice(o.start, o.end)) + '\n\n';
    }
    const trailer = /trailer\n([\s\S]*?)\nstartxref/.exec(s)?.[1];
    const size = Number(/\/Size (\d+)/.exec(trailer || '')?.[1]);
    if (!trailer || !size) return { bytes: src, changed: 0 };
    const xrefAt = body.length;
    let xref = `xref\n0 ${size}\n0000000000 65535 f\r\n`;
    for (let n = 1; n < size; n++) {
      const off = offsets.get(n);
      xref += off === undefined ? '0000000000 65535 f\r\n' : `${String(off).padStart(10, '0')} 00000 n\r\n`;
    }
    body += `${xref}trailer\n${trailer}\nstartxref\n${xrefAt}\n%%EOF`;
    return { bytes: enc(body), changed };
  } catch {
    return { bytes: src, changed: 0 };
  }
}
