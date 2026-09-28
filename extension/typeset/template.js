/**
 * ประกอบต้นฉบับเป็นเอกสาร Typst
 *
 * Typst ไม่อ่าน markdown เราจึงต้องแปลงเอง
 * ตัวแปลงนี้ตั้งใจให้เล็กและคาดเดาได้ รองรับเท่าที่ prompt อนุญาตให้โมเดลใช้จริง
 * (หัวข้อ ###, ตัวหนา, ตัวเอียง, โค้ดในบรรทัด, ลิสต์, ตาราง, คำพูดอ้าง, เส้นคั่น)
 */

import { prepareForTypeset, THAI_GAP } from '../core/thai.js';
import { frontCoverTextInImage, backCoverTextInImage } from '../core/prompts.js';
import { referenceLines, REFERENCE_STYLES } from '../core/references.js';
import { stripEchoedHeading } from '../core/extract.js';
import { itemTypeSize, ITEM_BLOCK_KINDS } from '../core/items.js';
import { readTable } from '../core/md-table.js';

const mm = (v) => `${round(v)}mm`;
const pt = (v) => `${round(v)}pt`;
const round = (v) => Math.round(v * 1000) / 1000;

// ---------- inline ----------
const INLINE = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\*[^*\n]+\*|_[^_\n]+_)|(\[[^\]\n]+\]\([^)\s]+\))/g;

function esc(s) {
  return String(s)
    .replace(/\\/g, '\\\\')
    .replace(/([#$@<>*_`~\[\]])/g, '\\$1');
}

function inline(text) {
  let out = '';
  let last = 0;
  for (const m of String(text).matchAll(INLINE)) {
    out += esc(text.slice(last, m.index));
    const [tok] = m;
    if (m[1]) out += '`' + tok.slice(1, -1) + '`';
    else if (m[2]) out += '*' + esc(tok.slice(2, -2)) + '*';
    else if (m[3]) out += '_' + esc(tok.slice(1, -1)) + '_';
    else if (m[4]) {
      const label = tok.slice(1, tok.indexOf(']'));
      const url = tok.slice(tok.indexOf('(') + 1, -1);
      out += `#link("${url}")[${esc(label)}]`;
    }
    last = m.index + tok.length;
  }
  out += esc(text.slice(last));
  // ช่องว่างคั่นวรรคไทย → ระยะแบบ weak ที่ Typst ยุบทิ้งเองเมื่ออยู่ต้น/ท้ายบรรทัด
  return out.split(THAI_GAP).join('#h(0.42em, weak: true)');
}

/**
 * ภาพประกอบ — เขียนในต้นฉบับเป็น ![คำบรรยาย](fig:ชื่อภาพ)
 *
 * เก็บภาพไว้ในต้นฉบับแบบนี้เพราะย้ายตำแหน่งได้ด้วยการแก้ข้อความธรรมดา
 * ผู้ใช้จึงเลื่อนภาพขึ้นลงเองได้ในโหมดแก้ไข โดยไม่ต้องมีตัวจัดการภาพแยก
 *
 * ถ้ายังไม่มีไฟล์ภาพ จะวาดเป็นกรอบว่างที่กินพื้นที่เท่าของจริง
 * เพื่อให้จำนวนหน้าที่นับได้ตรงกับตอนที่ใส่ภาพจริงแล้ว
 */
const FIG_RE = /^!\[([^\]]*)\]\(fig:([A-Za-z0-9._-]+)(?:\s+(\d{1,3})%)?(?:\s+(\d+(?:\.\d+)?)mm)?\)$/;

function figureToTypst(m, have, prompts = new Map()) {
  const [, rawCaption, name, pct, heightRaw] = m;
  // เผื่อกรณีที่โมเดลเขียน "รูปที่ 2:" มาในคำบรรยายเอง ใต้ภาพต้องเหลือแต่คำบรรยายจริง
  const caption = (rawCaption || '').replace(/^\s*(?:รูป|ภาพ|แผนภาพ|Fig(?:ure)?)\s*(?:ที่)?\s*\d+\s*[:.\-–]\s*/i, '').trim();
  const width = `${Math.min(100, Number(pct) || 80)}%`;
  // งานเก่าไม่มีค่าความสูง ให้ fallback 45mm เพื่อ backward compatible
  const heightMm = Math.max(20, Math.min(120, Number(heightRaw) || 45));
  const prompt = prompts.get(name) || '';
  const inner = have.has(name)
    ? `image("/img/${name}", width: ${width}, height: ${heightMm}mm, fit: "cover")`
    : `box(width: ${width}, height: ${heightMm}mm, stroke: 0.7pt + luma(145), inset: 8pt, clip: true)[
        #align(center + horizon)[
          #text(size: 7pt, fill: luma(95))[
            ${prompt ? `<Prompt : ${esc(prompt)}>` : `ยังไม่ได้ใส่ภาพ: ${esc(name)}`}
          ]
        ]
      ]`;
  // ภาพที่ไม่มีคำบรรยาย ต้องไม่เหลือช่องคำบรรยายว่าง ๆ ใต้ภาพ
  return `#figure(
  ${inner},${caption ? `\n  caption: [${inline(caption)}],` : ''}
) <fig-${name}>`;
}

/**
 * กล่องสรุปที่ Typst วาดเอง เขียนในต้นฉบับเป็น
 *   :::box หัวข้อกล่อง
 *   - บรรทัด
 *   :::
 * คมทุกความละเอียด ไม่ต้องสร้างภาพ ไม่มีปัญหา dpi
 * เป็นคำตอบที่ถูกกว่าสำหรับ "ภาพ" ที่จริง ๆ เป็นขั้นตอนหรือตารางเทียบ
 */
function boxToTypst(title, lines, t) {
  const items = lines.map((l) => `  #text[${inline(l.replace(/^\s*[-*+]\s*/, ''))}]`).join('\n  #v(0.35em)\n');
  // กล่องสั้นควรอยู่เป็นชิ้นเดียว แต่กล่องแบบปฏิทิน/เวิร์กชีตอาจยาวเกินพื้นที่พิมพ์ทั้งหน้า
  // ถ้าบังคับ breakable: false Typst จะดันหรือวาดล้นจนบรรทัดท้ายกับเลขหน้าทับกัน และข้อมูลท้ายกล่องหาย
  // ใช้จำนวนบรรทัดเป็นสัญญาณที่คาดเดาได้: กล่องเกิน 6 บรรทัดยอมแบ่งหน้า ส่วนกล่องสรุปสั้นยังไม่แตก
  const breakable = lines.length > 6 ? 'true' : 'false';
  return `#block(
  width: 100%, inset: 10pt, radius: 3pt,
  stroke: 0.6pt + luma(150), fill: luma(247),
  breakable: ${breakable},
)[
  ${title ? `#text(weight: 600, size: ${pt(t.sizePt * 0.98)})[${inline(title)}] #v(0.5em)` : ''}
  #set par(first-line-indent: 0pt)
${items}
]`;
}

function tableToTypst(rows, align, t) {
  const cols = Math.max(1, ...rows.map((r) => r.length));
  const columnSpec = Array.from({ length: cols }, () => '1fr').join(', ');
  const normalized = rows.map((r) => Array.from({ length: cols }, (_, i) => r[i] || ''));
  const header = normalized[0]
    .map((cell) => `    [#text(weight: 600)[${inline(cell)}]]`)
    .join(',\n');
  const body = normalized
    .slice(1)
    .flatMap((row) => row.map((cell) => `  [${inline(cell)}]`))
    .join(',\n');
  const fontSize = Math.max(7, Math.min(10, (t.sizePt || 14) * (cols >= 6 ? 0.58 : cols >= 4 ? 0.68 : 0.78)));
  /**
   * คอลัมน์ตัวเลขที่เขียน ---: ไว้ ต้องชิดขวาจริงในเล่ม
   * ของเดิมชิดซ้ายหมดทุกคอลัมน์ ตัวเลขคนละหลักจึงเรียงไม่ตรงกันจนเทียบด้วยตายาก
   */
  const alignSpec = Array.from({ length: cols }, (_, i) => `${align?.[i] || 'left'} + top`).join(', ');
  return `#block(width: 100%)[
  #set text(size: ${pt(fontSize)})
  #set par(first-line-indent: 0pt, leading: 0.3em)
  #table(
    columns: (${columnSpec}),
    inset: 3.5pt,
    align: (${alignSpec}),
    stroke: 0.4pt + luma(175),
    table.header(
${header}
    )${body ? `,\n${body}` : ''}
  )
]`;
}

// ---------- block ----------
const MD_LIST_RE = /^(\s*)(?:[-*+]|\d+[.)])\s+\S/;

/**
 * ระดับการซ้อนของรายการต้องคำนวณเป็นขั้น ไม่ใช่ลอกช่องว่างจากต้นฉบับมาทั้งดุ้น
 *
 * ใน Typst ช่องว่างหน้ารายการคือโครงสร้าง ไม่ใช่การจัดหน้า ข้อที่โมเดลเผลอเคาะเว้นวรรคนำ
 * หนึ่งหรือสามที จึงกลายเป็นรายการซ้อนชั้น เห็นเป็นข้อ 2 เยื้องไม่ตรงกับข้อ 1 (เล่มจริงหน้า 54)
 * เว้นวรรคนำสี่ช่องขึ้นไปคือการย่อหน้าที่คนตั้งใจแน่นอน นับเป็นชั้นตามจำนวนช่อง
 * ส่วนหนึ่งถึงสามช่องกำกวม ต้องดูว่ามันเป็นลูกหรือเป็นพี่น้องที่เผลอเคาะเว้นวรรคมา
 * ตัวชี้ขาดคือชนิดของรายการ: "- ลูก" ใต้ "1. แม่" เป็นคนละชนิด = ลูกจริง
 * ส่วน "2." ใต้ "1." เป็นชนิดเดียวกัน = พี่น้องที่เยื้องมาเฉย ๆ (เล่มจริงหน้า 54)
 * ไม่ให้ลึกเกินสามชั้น ซึ่งลึกกว่านั้นก็อ่านไม่รู้เรื่องอยู่ดี
 */
function listLevel(raw, ordered, ctx) {
  const width = String(raw).replace(/\t/g, '    ').length;
  if (width >= 4) return Math.min(3, Math.floor(width / 4));
  if (!width || !ctx) return 0;
  return ordered === ctx.ordered ? ctx.level : Math.min(3, ctx.level + 1);
}

/** บรรทัดว่างนี้คั่นกลางระหว่างข้อของรายการเดียวกันหรือไม่ */
function betweenListItems(out, lines, idx) {
  const prev = [...out].reverse().find((x) => x.trim());
  if (!prev || !/^\s*[-+]\s+\S/.test(prev)) return false;
  for (let j = idx + 1; j < lines.length; j++) {
    if (!lines[j].trim()) continue; // เว้นหลายบรรทัดติดกันก็ยังนับเป็นช่องว่างเดียว
    return MD_LIST_RE.test(lines[j]);
  }
  return false;
}

export function mdToTypst(md, baseLevel = 3, have = new Set(), t = { sizePt: 15 }, prompts = new Map()) {
  const lines = String(md).replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let inFence = false;
  let fenceBuf = [];
  // รายการที่ยังเปิดอยู่ ณ บรรทัดนี้ (null = ไม่ได้อยู่ในรายการ) ใช้ตัดสินชั้นของข้อถัดไป
  let listCtx = null;

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx].replace(/\s+$/, '');

    if (/^\s*```/.test(line)) {
      if (inFence) {
        out.push('#raw(block: true, "' + fenceBuf.join('\\n').replace(/"/g, '\\"') + '")', '');
        fenceBuf = [];
        inFence = false;
      } else {
        inFence = true;
      }
      continue;
    }
    if (inFence) {
      fenceBuf.push(line.replace(/\\/g, '\\\\'));
      continue;
    }

    if (!line.trim()) {
      /**
       * บรรทัดว่างระหว่างข้อของรายการเดียวกัน ต้องไม่ถูกส่งต่อไปให้ Typst
       *
       * Typst ตัดรายการขาดจากกันทันทีที่เจอบรรทัดว่าง แล้วเริ่มนับใหม่จาก 1 ทุกก้อน
       * โมเดลชอบเว้นบรรทัดระหว่างข้อ ผลคือ "4 ข้อ" ในหนังสือจริงขึ้นเป็น 1. 1. 1. 1. ทั้งหมด
       * (เห็นในเล่มจริงหน้า 9) — บรรทัดว่างตรงนี้เป็นแค่การจัดหน้าใน markdown ไม่ใช่โครงสร้าง
       */
      if (betweenListItems(out, lines, idx)) continue;
      listCtx = null; // บรรทัดว่างที่รอดมาถึงตรงนี้คือย่อหน้าใหม่จริง รายการก่อนหน้าจบแล้ว
      out.push('');
      continue;
    }

    // ต้องตรวจตารางก่อนตรวจเส้นคั่น มิฉะนั้นแถว |---|---| จะถูกมองเป็นข้อความธรรมดา
    const table = readTable(lines, idx);
    if (table) {
      idx = table.next - 1; // คืนหนึ่งตำแหน่งให้ for-loop
      listCtx = null;
      out.push(tableToTypst(table.rows, table.align, t), '');
      continue;
    }

    const boxOpen = line.match(/^:::box\s*(.*)$/);
    if (boxOpen) {
      const title = boxOpen[1].trim();
      const buf = [];
      // อ่านต่อจนเจอ ::: ปิด
      while (++idx < lines.length && !/^:::\s*$/.test(lines[idx].trim())) buf.push(lines[idx]);
      listCtx = null;
      out.push(boxToTypst(title, buf.filter((x) => x.trim()), t), '');
      continue;
    }

    const fig = line.trim().match(FIG_RE);
    if (fig) {
      listCtx = null;
      out.push(figureToTypst(fig, have, prompts), '');
      continue;
    }

    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      const level = Math.min(6, baseLevel + h[1].length - 3 > 0 ? baseLevel + h[1].length - 3 : baseLevel);
      listCtx = null;
      out.push('='.repeat(level) + ' ' + inline(h[2]), '');
      continue;
    }

    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      listCtx = null;
      out.push('#align(center)[#v(0.6em) --- #v(0.6em)]', '');
      continue;
    }

    const q = line.match(/^\s*>\s?(.*)$/);
    if (q) {
      listCtx = null;
      out.push('#quote(block: true)[' + inline(q[1]) + ']');
      continue;
    }

    const ul = line.match(/^(\s*)[-*+]\s+(.*)$/);
    const ol = !ul && line.match(/^(\s*)\d+[.)]\s+(.*)$/);
    if (ul || ol) {
      const [, raw, text] = ul || ol;
      const level = listLevel(raw, !!ol, listCtx);
      listCtx = { level, ordered: !!ol };
      out.push('  '.repeat(level) + (ol ? '+ ' : '- ') + inline(text));
      continue;
    }

    /**
     * บรรทัดที่ต่อจากข้อโดยไม่เว้นบรรทัด คือเนื้อของข้อนั้น ไม่ใช่ย่อหน้าใหม่
     *
     * ถ้าปล่อยไว้ที่คอลัมน์ศูนย์ Typst จะถือว่ารายการจบแล้ว ข้อถัดไปจึงเริ่มนับหนึ่งใหม่
     * ย่อหน้าจริงจะมีบรรทัดว่างคั่นเสมอ ซึ่งล้าง listCtx ทิ้งไปแล้วตั้งแต่ตรงนั้น
     */
    if (listCtx) {
      out.push('  '.repeat(listCtx.level + 1) + inline(line.trim()));
      continue;
    }

    out.push(inline(line));
  }

  if (inFence && fenceBuf.length) {
    out.push('#raw(block: true, "' + fenceBuf.join('\\n').replace(/"/g, '\\"') + '")');
  }

  return out.join('\n');
}

// ---------- เอกสารทั้งเล่ม ----------
export function buildDocument({ book, outline, sections, opts = {} }) {
  // ชื่อภาพที่มีไฟล์จริงแล้ว ใช้ตัดสินว่าจะวาดภาพหรือวาดกรอบว่างแทน
  const have = new Set(opts.assetNames || []);
  // ในโหมด prompt ให้พิมพ์คำสั่งสร้างภาพลงในกรอบว่าง ณ ตำแหน่งที่ AI เลือกไว้
  // เมื่อมีไฟล์ภาพชื่อเดียวกัน กรอบและ prompt จะถูกแทนด้วยภาพจริงโดยอัตโนมัติ
  const figurePrompts = new Map(
    book.figureMode === 'prompt'
      ? (book.figures || []).filter((f) => f.kind === 'image' && f.name).map((f) => [f.name, f.prompt || f.subject || f.caption || ''])
      : [],
  );
  const t = book.typography;
  const trim = book.trim;
  const lang = book.language || 'th';
  const bleed = opts.withBleed ? trim.bleedMm || 0 : 0;

  // Typst leading คือระยะ "ระหว่าง" บรรทัด ไม่ใช่ line-height ทั้งก้อน
  // ค่าปริยาย 0.65em ให้ผลราว 1.65 เท่า จึงประมาณด้วย (lineHeight - 1)
  const leading = Math.max(0.35, (t.lineHeight || 1.6) - 1);

  const secById = new Map(sections.map((s) => [s.id, s]));
  const body = [];
  const isFiction = book.contentMode === 'fiction';
  // หน้าเปิดบทแบบโปสเตอร์ — เล่มเก่าที่ไม่มีค่านี้ใช้แบบเรียบตามเดิม
  const poster = !!chapterOpenerKey(book);
  const TT = (v) => inline(prepareForTypeset(v || '', lang));

  for (const ch of outline.chapters) {
    // เล่มสารคดีเคยขึ้นบทด้วยชื่อบทเปล่า ๆ ไม่มีเลข สารบัญจึงเป็นรายการชื่อยาว ๆ ที่ไล่ลำดับไม่ได้
    // และผู้อ่านที่เปิดกลางเล่มไม่มีทางรู้ว่าตัวเองอยู่บทไหนของกี่บท
    const chapterTitle = `${lang === 'th' ? 'บทที่' : 'Chapter'} ${ch.n}${ch.title ? ` · ${ch.title}` : ''}`;
    if (poster) {
      // เลข ชื่อ และคำคมของบทนี้ ให้กฎแสดงหัวบทอ่าน (หัวบทยังเป็น "บทที่ N · ชื่อ" สำหรับสารบัญและหัวกระดาษ)
      const ep = book.chapterEpigraphs?.[ch.n] || {};
      body.push(`#chapter-meta.update((n: "${ch.n}", nt: "${String(ch.n).replace(/[0-9]/g, (d) => "๐๑๒๓๔๕๖๗๘๙"[d])}", title: [${TT(ch.title || chapterTitle)}], quote: ${ep.text ? `[${TT(ep.text)}]` : 'none'}, by: ${ep.text && ep.by ? `[${TT(ep.by)}]` : 'none'}))`);
    }
    body.push(`= ${inline(prepareForTypeset(chapterTitle, lang))}`, '');
    for (let sceneIndex = 0; sceneIndex < ch.sections.length; sceneIndex++) {
      const s = ch.sections[sceneIndex];
      const rec = secById.get(s.id);
      // ตัวเรียงพิมพ์พิมพ์ชื่อตอนให้อยู่แล้ว เนื้อหาไม่ต้องทวนชื่อตัวเองอีกบรรทัด
      const md = stripEchoedHeading(rec?.md, s).trim();
      if (!isFiction) body.push(`== ${inline(prepareForTypeset(s.title, lang))}`, '');
      else if (sceneIndex > 0) body.push('#align(center)[• • •]', '');
      if (md) {
        body.push(mdToTypst(prepareForTypeset(md, lang), 3, have, t, figurePrompts), '');
      } else {
        body.push(`#text(fill: rgb("#999999"))[(ยังไม่มีเนื้อหาของ${isFiction ? 'ฉาก' : 'ตอน'} ${s.id})]`, '');
      }
    }
  }

  const fm = frontMatter(book, outline, opts);
  const bm = backMatter(book, outline);

  return `
#set document(title: ${str(outline.title)}, author: ${str(book.author || '')})

${poster ? openerPreamble() : ''}${patternPreamble(opts)}#set page(
  width: ${mm(trim.widthMm + bleed * 2)},
  height: ${mm(trim.heightMm + bleed * 2)},
  margin: (
    inside: ${mm(t.marginsMm.inner + bleed)},
    outside: ${mm(t.marginsMm.outer + bleed)},
    top: ${mm(t.marginsMm.top + bleed)},
    bottom: ${mm(t.marginsMm.bottom + bleed)},
  ),
  binding: left,
  numbering: none,${pageBackground(opts)}
)

#set text(
  font: ${str(t.bodyFont)},
  size: ${pt(t.sizePt)},
  lang: ${str(lang)},
  // ใช้ขอบ ascender/descender ของฟอนต์จริงเพื่อเผื่อสระและวรรณยุกต์ไทย
  top-edge: "ascender",
  bottom-edge: "descender",
)
#set par(
  justify: ${t.justify ? 'true' : 'false'},
  leading: ${round(leading)}em,
  spacing: ${round(leading)}em,
  first-line-indent: 1.5em,
  // ไล่หาจุดตัดบรรทัดที่ดีที่สุดของทั้งย่อหน้า ไม่ใช่ตัดไปเรื่อย ๆ ทีละบรรทัด
  // ทำให้ขอบขวาสม่ำเสมอขึ้นมากโดยไม่ต้องจัดชิดสองข้าง ซึ่งภาษาไทยทำแล้วเกิดช่องว่างพาดกลางหน้า
  linebreaks: "optimized",
)
#show heading: set text(font: ${str(t.headFont || t.bodyFont)})
#show heading: set block(above: 1.4em, below: 0.8em)

// ภาพประกอบ: คำบรรยายอยู่ใต้ภาพและห้ามพรากจากกัน
#show figure: set block(breakable: false, above: 1.4em, below: 1.4em)
#show figure.caption: set text(size: ${pt(t.sizePt * 0.82)}, fill: luma(90))
// คำบรรยายใต้ภาพชิดซ้าย ไม่ใช่จัดกลางตามค่าเริ่มต้นของ Typst
// คำบรรยายภาษาไทยมักยาวเกินหนึ่งบรรทัด พอจัดกลางแล้วบรรทัดสุดท้ายจะเหลือคำสองสามคำลอยอยู่กลางหน้า
#show figure.caption: set align(left)
// ไม่มีเลข "รูปที่ N" — ในเล่มไม่มีข้อความอ้างถึงเลขรูปอยู่แล้ว
// เลขที่ไม่มีใครอ้างถึงจึงเป็นแค่คำรกหน้ากระดาษ ใต้ภาพเหลือเฉพาะคำบรรยายจริงถ้ามี
#set figure(numbering: none, supplement: none, gap: 0.8em)

// บทใหม่ขึ้นหน้าใหม่ (ขึ้นหน้าขวาเฉพาะเมื่อตั้ง chapterStartRight สำหรับงานพิมพ์) และเว้นช่วงนำสายตา
// เดิมบังคับหน้าขวาเสมอ นิยายที่บทสั้นจึงมีหน้าว่างทุกหน้าคู่ ครึ่งเล่มเป็นกระดาษเปล่า (ผู้ใช้เจอจริง)
${poster ? chapterOpenerRule(book, t, book.chapterStartRight === true, opts) : `#show heading.where(level: 1): it => {
  pagebreak(${book.chapterStartRight === true ? 'to: "odd", ' : ''}weak: true)${markPatternPage(opts)}
  v(${round((trim.heightMm - t.marginsMm.top - t.marginsMm.bottom) * 0.16)}mm)
  block(text(size: ${pt(t.sizePt * 1.6)}, weight: 600, it.body))
  v(1em)
}`}
#show heading.where(level: 2): it => block(text(size: ${pt(t.sizePt * 1.2)}, weight: 600, it.body))
#show heading.where(level: 3): it => block(text(size: ${pt(t.sizePt * 1.08)}, weight: 600, it.body))

// ---------- หน้าต้นเล่ม ----------
${fm}

// ---------- เนื้อหา ----------
#set page(
  numbering: "1",
  number-align: center,${poster ? `
  // หน้าเปิดบทแบบโปสเตอร์ไม่มีเลขหน้าบนพื้นสี
  footer: context {
    if opener-pages.final().contains(here().page()) { return }
    align(center, counter(page).display("1"))
  },` : ''}
  header: context {
    let p = counter(page).get().first()
    let opens = query(heading.where(level: 1)).any(h => h.location().page() == p)
    if opens { return }
    let here = query(selector(heading.where(level: 1)).before(here()))
    let ch = if here.len() > 0 { here.last().body } else { [] }
    set text(size: ${pt(t.sizePt * 0.72)}, fill: luma(90))
    if calc.odd(p) [#h(1fr) #ch] else [${str(outline.title)} #h(1fr)]
  },
)
#counter(page).update(1)

${body.join('\n')}

${bm}

${backCoverPage(book, outline, opts)}

${'#pagebreak()\n'.repeat(opts.padPages || 0)}
// ป้ายบอกจำนวนหน้า — ระบบอ่านค่านี้ด้วย query แทนการเดา
// ต้องแยกสองค่าให้ชัด เพราะเรารีเซ็ตเลขหน้าหลังหน้าต้นเล่ม
//   physical = จำนวนแผ่นที่โรงพิมพ์ต้องพิมพ์จริง  ← ลูปนับหน้าใช้ค่านี้
//   numbered = เลขหน้าที่พิมพ์อยู่บนหน้าสุดท้าย
#context [#metadata((physical: here().page(), numbered: counter(page).final().first())) <pagecount>]
`.trim();
}

/**
 * เอกสารโหมดรายชิ้น — คำคม กลอน บทกวีสั้น
 *
 * ต่างจากร้อยแก้วทั้งหมด: ไม่มีย่อหน้าไหล ไม่มีหัวข้อย่อย
 * แต่ละชิ้นวางกลางหน้าในกรอบของตัวเอง จำนวนหน้าจึงเป็นเลขคณิตตรง ๆ
 * ชิ้นต่อหน้า x จำนวนหน้า = จำนวนชิ้น ไม่ต้องมีลูปปรับความยาว
 */
export function buildItemsDocument({ book, outline, items, opts = {} }) {
  const t = book.typography;
  const trim = book.trim;
  const lang = book.language || 'th';
  const bleed = opts.withBleed ? trim.bleedMm || 0 : 0;
  const perPage = Math.max(1, book.itemsPerPage || 1);
  /**
   * จัดหน้าแบบหนังสือรวมบทกวีจริง
   *
   * เดิมตัวอักษร 20-26pt และจัดกลางทีละบรรทัด กลอนจึงหักกลางวรรคแล้วไหลไปทับเลขหน้า
   * ขอบซ้ายขวาของแต่ละบรรทัดก็ไม่ตรงกัน อ่านแล้วเหมือนป้ายประกาศ ไม่ใช่หนังสือ
   * ตอนนี้: ตัวเล็กขนาดหนังสือ · บทกลอนเป็นก้อนชิดซ้ายวางกลางหน้า · คำคมสั้นจัดกลาง
   * · ถ้าวรรคไหนยาวเกินความกว้างจริง ย่อทั้งชิ้นลงเล็กน้อยแทนการหักบรรทัด
   */
  const size = itemTypeSize(book);
  const pieceAlign = ITEM_BLOCK_KINDS.has(book.itemKind) ? 'left' : 'center';
  const top = book.itemAlign === 'top';
  const leading = round(Math.max(0.55, Math.min(0.8, (t.lineHeight || 1.7) - 1)));
  const textW = trim.widthMm - t.marginsMm.inner - t.marginsMm.outer;

  // ภาพของโหมดรายชิ้นผูกกับรหัสชิ้น (1.12) หรือหน้าคั่นหมวด (theme-1) — วางแผนใน Machine.itemFigures
  const have = new Set(opts.assetNames || []);
  const figOf = new Map(
    (book.figures || []).filter((f) => f.kind === 'image' && f.name && f.itemFigure).map((f) => [String(f.section), f]),
  );
  const figMarkup = (f, circle) => {
    const w = circle ? Math.min(50, textW * 0.52) : round(textW * 0.8);
    const h = circle ? w : Math.max(36, Math.min(72, Number(f.heightMm) || 58));
    const inner = have.has(f.name)
      ? `#image("/img/${f.name}", width: 100%, height: 100%, fit: "cover")`
      : `#align(center + horizon)[#text(size: 6.5pt, fill: luma(105))[${
          esc(book.figureMode === 'prompt' && f.prompt ? `<Prompt : ${f.prompt}>` : `ยังไม่ได้ใส่ภาพ: ${f.name}`)
        }]]`;
    return `#box(width: ${mm(w)}, height: ${mm(h)}, radius: ${circle ? mm(w / 2) : '2pt'}, clip: true${
      have.has(f.name) ? '' : ', stroke: 0.6pt + luma(165), inset: 7pt'
    })[${inner}]`;
  };

  const byTheme = new Map();
  for (const it of items) {
    const n = String(it.id).split('.')[0];
    if (!byTheme.has(n)) byTheme.set(n, []);
    byTheme.get(n).push(it);
  }

  const one = (it) =>
    `#item-piece(${pieceAlign}, by: ${it.attribution ? `[${inline(prepareForTypeset(it.attribution, lang))}]` : 'none'})[${itemText(it.md ?? it.text ?? '', lang)}]`;

  // จัดตำแหน่งแนวตั้งด้วยสัดส่วน — ล่างมากกว่าบนเล็กน้อย ให้ก้อนข้อความอยู่ที่กึ่งกลางทางสายตา
  const pageOf = (inner) => `#page[
  ${top ? '#v(12mm)' : '#v(1fr)'}
  ${inner}
  ${top ? '#v(1fr)' : '#v(1.3fr)'}
]`;

  const body = [];
  const multiTheme = byTheme.size > 1;

  for (const [n, list] of byTheme) {
    const theme = (outline.themes || []).find((x) => String(x.n) === String(n));
    if (multiTheme && theme) {
      const tf = figOf.get(`theme-${n}`);
      // ไม่บังคับให้หน้าคั่นหมวดขึ้นหน้าขวา — #page ขึ้นหน้าใหม่ให้อยู่แล้ว
      // การดันไปหน้าคี่เคยทิ้งหน้าเปล่าที่มีแต่เลขหน้าไว้ก่อนหมวด (เห็นจริงในเล่ม "หมดไฟ แต่ยังไม่หมดทาง" หน้า 1 และ 19)
      body.push(`#page(numbering: none)[${markPatternPage(opts, { markup: true })}
  #v(1fr)
  #align(center)[
    ${tf ? `${figMarkup(tf, true)}\n    #v(2.2em)` : ''}
    #text(size: ${pt(size * 0.72)}, fill: luma(125), tracking: 0.06em)[หมวดที่ ${esc(n)}]
    #v(0.8em)
    #heading(level: 1)[${inline(prepareForTypeset(theme.title, lang))}]
  ]
  #v(1.4fr)
]`);
    }

    let group = [];
    const flush = () => {
      if (!group.length) return;
      body.push(pageOf(group.map(one).join(`\n  ${top ? '#v(2.4em)' : '#v(1fr)'}\n  #item-rule\n  ${top ? '#v(2.4em)' : '#v(1fr)'}\n  `)));
      group = [];
    };
    for (const it of list) {
      const f = figOf.get(String(it.id));
      if (f) {
        // ชิ้นที่มีภาพได้หน้าของตัวเอง: ภาพก่อน ตามด้วยข้อความ
        flush();
        body.push(pageOf(`#align(center)[${figMarkup(f, false)}]\n  #v(2em)\n  ${one(it)}`));
        continue;
      }
      group.push(it);
      if (group.length >= perPage) flush();
    }
    flush();
  }

  /**
   * หน้าต้นเล่มที่ไม่มีของจริงให้ใส่ ต้องไม่ถูกพิมพ์ออกมา
   * - สารบัญ: เล่มหมวดเดียวไม่มีหน้าคั่นหมวด จึงไม่มีหัวข้อ — หน้าสารบัญเปล่าดูเหมือนเล่มพัง
   * - คำนำ: ถ้าไม่มีคำนำที่เขียนจริง ตัวสำรองของหน้าต้นเล่มเป็นประโยคของหนังสือสารคดี
   *   ("จัดทำขึ้นเพื่อช่วยให้ผู้อ่านเข้าใจ ... อย่างเป็นขั้นตอนและนำไปใช้ได้จริง") ซึ่งผิดประเภทกับหนังสือคำคม/กลอน
   */
  const front = {
    ...book,
    frontMatter: (book.frontMatter || []).filter((k) =>
      !(k === 'toc' && !multiTheme) && !(k === 'foreword' && !String(outline.foreword || '').trim())),
  };

  return `
#set document(title: ${str(outline.title)}, author: ${str(book.author || '')})

${patternPreamble(opts)}#set page(
  width: ${mm(trim.widthMm + bleed * 2)},
  height: ${mm(trim.heightMm + bleed * 2)},
  margin: (
    inside: ${mm(t.marginsMm.inner + bleed)},
    outside: ${mm(t.marginsMm.outer + bleed)},
    top: ${mm(t.marginsMm.top + bleed)},
    bottom: ${mm(t.marginsMm.bottom + bleed)},
  ),
  binding: left,
  numbering: none,${pageBackground(opts)}
)
#set text(
  font: ${str(t.bodyFont)}, size: ${pt(size)}, lang: ${str(lang)},
  top-edge: "ascender", bottom-edge: "descender",
)
#set par(justify: false, leading: ${leading}em, spacing: ${leading}em, first-line-indent: 0pt)
#set heading(numbering: none)
#show heading.where(level: 1): it => block(text(size: ${pt(Math.max(16, size * 1.45))}, weight: 600, it.body))

#let item-size = ${pt(size)}
#let item-stanza = v(${round(leading * 1.4)}em)
// บทกลอน: ย่อทั้งชิ้นเมื่อวรรคที่ยาวที่สุดกว้างเกินหน้า ดีกว่าหักวรรคกลางคำ (ย่อได้ไม่ต่ำกว่า 82%)
// ถ้ายังไม่พอ วรรคนั้นห้อยบรรทัดต่อเข้าไป ไม่ตกลงมาเหมือนวรรคใหม่
#let item-fit(body) = layout(area => {
  let natural = measure(text(size: item-size, body)).width
  let s = item-size
  if natural > area.width {
    s = item-size * (area.width / natural) * 0.98
    if s < item-size * 0.82 { s = item-size * 0.82 }
  }
  text(size: s, body)
})
#let item-piece(al, by: none, body) = align(center, block(breakable: false, {
  set par(spacing: ${leading}em, hanging-indent: if al == left { 1.6em } else { 0pt })
  set align(al)
  // คำคม/ข้อคิดสั้นจัดกลาง ตัดบรรทัดตามธรรมชาติในความกว้างราว 80% ของหน้า ไม่ย่อตัวอักษร
  if al == left { item-fit(body) } else { block(width: 80%, body) }
  if by != none {
    v(0.9em)
    align(if al == left { right } else { center }, text(size: item-size * 0.72, fill: luma(115), [— #by]))
  }
}))
#let item-rule = align(center, line(length: 16pt, stroke: 0.5pt + luma(180)))

${frontMatter(front, outline, opts)}

#set page(numbering: ${book.itemPageNumbers === false ? 'none' : '(..n) => text(size: 8pt, fill: luma(130), numbering("1", ..n))'}, number-align: center)
#counter(page).update(1)

${body.join('\n\n')}

${backMatter(book, outline)}

${backCoverPage(book, outline, opts)}

${'#pagebreak()\n'.repeat(opts.padPages || 0)}
#context [#metadata((physical: here().page(), numbered: counter(page).final().first())) <pagecount>]
`.trim();
}

/**
 * ข้อความของชิ้น — ขึ้นบรรทัดใหม่ตามฉันทลักษณ์ ห้ามให้ไหลรวมกัน
 *
 * หนึ่งวรรคหนึ่งย่อหน้า เพื่อให้วรรคที่ยาวเกินหน้าจริง ๆ ห้อยบรรทัดต่อเข้าไป (hanging indent)
 * แบบหนังสือกลอนที่พิมพ์กัน แทนที่จะตกลงมาชิดซ้ายจนดูเหมือนเป็นวรรคใหม่
 * บรรทัดว่างคือช่องไฟระหว่างบท
 */
function itemText(text, lang) {
  return String(text)
    .split('\n')
    .map((l) => l.trim())
    .reduce((out, l) => {
      if (!l) { if (out.length && out.at(-1) !== '#item-stanza') out.push('#item-stanza'); }
      else out.push(inline(prepareForTypeset(l, lang)));
      return out;
    }, [])
    .filter((l, i, all) => !(l === '#item-stanza' && i === all.length - 1))
    .join('\n\n');
}

/**
 * เอกสาร calibration — เนื้อความล้วน ไม่มีหน้าต้นเล่ม ไม่มีหัวบท
 * ใช้หาว่าโปรไฟล์นี้จุได้กี่อักษรต่อหน้า ต้องใช้ค่าจากงานจริง ไม่ใช่ lorem ละติน
 * เพราะความยาวคำและความถี่ของช่องว่างมีผลต่อการตัดบรรทัด
 */
export function buildCalibrationDoc({ book, sampleText }) {
  const t = book.typography;
  const trim = book.trim;
  const lang = book.language || 'th';
  const leading = Math.max(0.35, (t.lineHeight || 1.6) - 1);

  return `
#set page(
  width: ${mm(trim.widthMm)},
  height: ${mm(trim.heightMm)},
  margin: (
    inside: ${mm(t.marginsMm.inner)},
    outside: ${mm(t.marginsMm.outer)},
    top: ${mm(t.marginsMm.top)},
    bottom: ${mm(t.marginsMm.bottom)},
  ),
  binding: left,
  numbering: "1",
)
#set text(
  font: ${str(t.bodyFont)}, size: ${pt(t.sizePt)}, lang: ${str(lang)},
  top-edge: "ascender", bottom-edge: "descender",
)
#set par(
  justify: ${t.justify ? 'true' : 'false'},
  leading: ${round(leading)}em,
  spacing: ${round(leading)}em,
  first-line-indent: 1.5em,
  // ไล่หาจุดตัดบรรทัดที่ดีที่สุดของทั้งย่อหน้า ไม่ใช่ตัดไปเรื่อย ๆ ทีละบรรทัด
  // ทำให้ขอบขวาสม่ำเสมอขึ้นมากโดยไม่ต้องจัดชิดสองข้าง ซึ่งภาษาไทยทำแล้วเกิดช่องว่างพาดกลางหน้า
  linebreaks: "optimized",
)

${mdToTypst(prepareForTypeset(sampleText, lang))}

#context [#metadata((physical: here().page(), numbered: counter(page).final().first())) <pagecount>]
`.trim();
}

/**
 * ลวดลายพื้นหลัง — ลงเฉพาะหน้าที่ขึ้นหัวข้อ ไม่ใช่ทุกหน้า
 *
 * เดิมปูทั้งเล่ม ซึ่งทำให้หน้าเนื้อหาธรรมดามีลายวิ่งอยู่ใต้ตัวหนังสือตลอดเวลา
 * ลายที่ตั้งใจให้เป็นจุดเปลี่ยนบท กลายเป็นพื้นผิวประจำของทุกหน้าแล้วหมดความหมาย
 * ตอนนี้ลายทำหน้าที่บอกว่า "ตรงนี้เริ่มของใหม่" หน้าเนื้อหาจึงสะอาดและอ่านง่ายขึ้น
 *
 * วิธีทำ: จดเลขหน้าที่หัวข้อไปตกไว้ใน state แล้วพื้นหลังของแต่ละหน้าค่อยถามว่า
 * หน้านี้อยู่ในรายการนั้นไหม — พื้นหลังไม่ดันเนื้อหา การวนคำนวณของ Typst จึงลงตัวเสมอ
 */
const PATTERN_FILE = 'page-pattern.png';
const hasPattern = (opts) => (opts?.assetNames || []).includes(PATTERN_FILE);

/** ประกาศที่ต้องอยู่ก่อน #set page — ไม่มีไฟล์ลายก็ไม่ต้องประกาศอะไรเลย */
function patternPreamble(opts) {
  return hasPattern(opts) ? `#let chapter-pages = state("chapter-pages", ())\n` : '';
}

/**
 * ตัวจดว่าหัวข้อนี้ไปตกอยู่หน้าไหน
 * ในกฎแสดงผลของหัวข้อเป็นโค้ดอยู่แล้ว แต่ในบล็อก markup ต้องมี # นำหน้า
 */
function markPatternPage(opts, { markup = false } = {}) {
  return hasPattern(opts)
    ? `
  ${markup ? '#' : ''}context {
    let p = here().page()
    chapter-pages.update(pages => if pages.contains(p) { pages } else { pages + (p,) })
  }`
    : '';
}

function pageBackground(opts) {
  return hasPattern(opts)
    ? `
  background: context {
    if chapter-pages.final().contains(here().page()) {
      image("/img/${PATTERN_FILE}", width: 100%, height: 100%, fit: "cover")
    }
  },`
    : '';
}

/**
 * หน้าเปิดบทแบบเต็มหน้า — ชุดแบบให้ผู้ใช้เลือก หรือสุ่ม (ผู้ใช้: "เราเลือกแบบเองได้มั้ย เดี๋ยวจะหามาให้ และมีแบบสุ่มด้วย")
 * ทุกแบบใช้โครงเดียวกัน: ขึ้นหน้าใหม่ · ทั้งหน้าเป็นก้อนเดียวแยกหน้าไม่ได้ · หน้านี้ไม่มีเลขหน้า · เนื้อหาเริ่มหน้าถัดไป
 * แต่ละแบบเขียนเฉพาะ "เนื้อในก้อน" (ตัวแปร m = เลข ชื่อ คำคม ผู้พูด ของบทนั้น)
 * ไม่มีพื้นสี (ผู้ใช้: "สีไม่ต้อง") — ตัวหนังสือสีเข้มบนพื้นกระดาษ ใช้ได้ทั้งพิมพ์ขาวดำและ ebook
 *
 * เพิ่มแบบใหม่: ใส่ในตารางนี้ + ตัวเลือกใน studio.html (#chapterOpener) — ตัวสุ่มเห็นแบบใหม่เอง
 */
const OPENER_INK = '#1A1A1A';
const OPENER_SOFT = '#4A4A4A';
export const CHAPTER_OPENERS = {
  // แบบจากหนังสือตัวอย่างที่ผู้ใช้ส่งมา: เลขใหญ่ · เส้นหนา · ชื่อบท · เส้นหนา · คำคมตัวห่าง · –ผู้พูด
  lines: {
    label: 'เส้นคู่ — เลขบทใหญ่ ชื่อบทระหว่างเส้นหนา คำคมตัวห่าง',
    body: (t, ink, soft) => `
      set align(center)
      v(6%)
      // กล่องตัวเลขเอาแค่ความสูงตัวเลขจริง (cap-height ถึง baseline) ให้เส้นแนบใต้เลขแบบตัวอย่าง
      text(size: ${pt(t.sizePt * 6.4)}, weight: 900, fill: rgb("${ink}"), top-edge: "cap-height", bottom-edge: "baseline", m.n)
      v(${pt(t.sizePt * 0.55)})
      line(length: 100%, stroke: 3pt + rgb("${ink}"))
      v(${pt(t.sizePt * 1.1)})
      text(size: ${pt(t.sizePt * 2.1)}, weight: 700, fill: rgb("${ink}"), m.title)
      v(${pt(t.sizePt * 1.1)})
      line(length: 100%, stroke: 3pt + rgb("${ink}"))
      if m.quote != none {
        v(${pt(t.sizePt * 2.2)})
        block(width: 90%, text(size: ${pt(t.sizePt * 1.02)}, tracking: 0.26em, fill: rgb("${soft}"), m.quote))
        if m.by != none {
          v(${pt(t.sizePt * 1.4)})
          text(size: ${pt(t.sizePt * 1.02)}, fill: rgb("${soft}"))[–#m.by]
        }
      }`,
  },
  // ชิดซ้าย: เลขใหญ่ชิดซ้าย · เส้นสั้น · ชื่อบทชิดซ้าย · คำคมมีเส้นตั้งนำหน้า
  left: {
    label: 'ชิดซ้าย — เลขบทใหญ่ชิดซ้าย เส้นสั้น คำคมมีเส้นตั้งนำ',
    body: (t, ink, soft) => `
      set align(left)
      v(14%)
      text(size: ${pt(t.sizePt * 7)}, weight: 900, fill: rgb("${ink}"), top-edge: "cap-height", bottom-edge: "baseline", m.n)
      v(${pt(t.sizePt * 0.9)})
      line(length: 28%, stroke: 4pt + rgb("${ink}"))
      v(${pt(t.sizePt * 1.2)})
      block(width: 92%, text(size: ${pt(t.sizePt * 2.2)}, weight: 700, fill: rgb("${ink}"), m.title))
      if m.quote != none {
        v(${pt(t.sizePt * 3)})
        block(width: 88%, inset: (left: ${pt(t.sizePt * 0.9)}), stroke: (left: 2pt + rgb("${soft}")), {
          text(size: ${pt(t.sizePt * 1.02)}, fill: rgb("${soft}"), m.quote)
          if m.by != none {
            v(${pt(t.sizePt * 0.9)})
            text(size: ${pt(t.sizePt * 0.92)}, weight: 600, fill: rgb("${soft}"))[–#m.by]
          }
        })
      }`,
  },
  // มินิมอล: "บทที่ 11" ตัวเล็กตัวห่าง · ชื่อบทกลางหน้า · เส้นบางสั้น · คำคมตัวเล็ก
  minimal: {
    label: 'มินิมอล — "บทที่" ตัวเล็กตัวห่าง ชื่อบทกลางหน้า เส้นบางสั้น',
    body: (t, ink, soft, lang) => `
      set align(center)
      v(26%)
      text(size: ${pt(t.sizePt * 0.95)}, tracking: 0.35em, fill: rgb("${soft}"))[${lang === 'th' ? 'บทที่' : 'CHAPTER'} #m.n]
      v(${pt(t.sizePt * 1.3)})
      block(width: 86%, text(size: ${pt(t.sizePt * 2)}, weight: 600, fill: rgb("${ink}"), m.title))
      v(${pt(t.sizePt * 1.4)})
      line(length: 16%, stroke: 0.8pt + rgb("${ink}"))
      if m.quote != none {
        v(${pt(t.sizePt * 1.8)})
        block(width: 78%, text(size: ${pt(t.sizePt * 0.95)}, fill: rgb("${soft}"), m.quote))
        if m.by != none {
          v(${pt(t.sizePt * 1)})
          text(size: ${pt(t.sizePt * 0.88)}, tracking: 0.12em, fill: rgb("${soft}"))[–#m.by]
        }
      }`,
  },
  // เลขจาง: เลขบทยักษ์สีจางเป็นฉากหลัง ชื่อบทตัวใหญ่วางทับกลางหน้า
  watermark: {
    label: 'เลขจาง — เลขบทยักษ์สีจางเป็นฉากหลัง ชื่อบทวางทับ',
    body: (t, ink, soft) => `
      set align(center)
      v(10%)
      box(width: 100%, height: ${pt(t.sizePt * 15 * 0.72)}, {
        place(center + top, text(size: ${pt(t.sizePt * 15)}, weight: 900, fill: rgb("#E4E4E4"), top-edge: "cap-height", bottom-edge: "baseline", m.n))
        place(center + horizon, block(width: 90%, text(size: ${pt(t.sizePt * 2.2)}, weight: 700, fill: rgb("${ink}"), m.title)))
      })
      if m.quote != none {
        v(${pt(t.sizePt * 2.4)})
        block(width: 82%, text(size: ${pt(t.sizePt * 1)}, fill: rgb("${soft}"), m.quote))
        if m.by != none {
          v(${pt(t.sizePt * 1)})
          text(size: ${pt(t.sizePt * 0.92)}, fill: rgb("${soft}"))[–#m.by]
        }
      }`,
  },
  // คลาสสิก: "บทที่ ๑๑" เลขไทย · ลายประดับ · ชื่อบท · ลายประดับ · คำคม
  classic: {
    label: 'คลาสสิก — "บทที่ ๑๑" เลขไทย มีลายประดับคั่น',
    body: (t, ink, soft, lang) => `
      set align(center)
      v(20%)
      text(size: ${pt(t.sizePt * 1.3)}, tracking: 0.2em, fill: rgb("${soft}"))[${lang === 'th' ? 'บทที่ #m.nt' : 'Chapter #m.n'}]
      v(${pt(t.sizePt * 0.9)})
      // ลายประดับวาดด้วยรูปทรง — ฟอนต์ไทยที่ฝังไว้ไม่มีอักขระลายดอกไม้ (เคยออกมาเป็นกล่องว่าง)
      stack(dir: ltr, spacing: 6pt, line(length: 22pt, stroke: 0.6pt + rgb("${soft}")), move(dy: -2.5pt, rotate(45deg, square(size: 5pt, fill: rgb("${soft}")))), line(length: 22pt, stroke: 0.6pt + rgb("${soft}")))
      v(${pt(t.sizePt * 0.9)})
      block(width: 100%, text(size: ${pt(t.sizePt * 2)}, weight: 600, fill: rgb("${ink}"), m.title))
      v(${pt(t.sizePt * 1)})
      text(size: ${pt(t.sizePt * 1)}, tracking: 0.6em, fill: rgb("${soft}"))[• • •]
      if m.quote != none {
        v(${pt(t.sizePt * 1.8)})
        block(width: 76%, text(size: ${pt(t.sizePt * 0.98)}, fill: rgb("${soft}"), m.quote))
        if m.by != none {
          v(${pt(t.sizePt * 0.9)})
          text(size: ${pt(t.sizePt * 0.9)}, fill: rgb("${soft}"))[–#m.by]
        }
      }`,
  },
  // กรอบ: ชื่อบทอยู่ในกรอบเส้นคู่ เลขบทวางบนขอบกรอบ
  frame: {
    label: 'กรอบ — ชื่อบทอยู่ในกรอบเส้นคู่ เลขบทบนขอบกรอบ',
    body: (t, ink, soft) => `
      set align(center)
      v(16%)
      block(width: 92%, stroke: 1.2pt + rgb("${ink}"), inset: 4pt,
        block(width: 100%, stroke: 0.5pt + rgb("${ink}"), inset: (x: ${pt(t.sizePt * 1.2)}, y: ${pt(t.sizePt * 2)}), {
          text(size: ${pt(t.sizePt * 3.2)}, weight: 900, fill: rgb("${ink}"), top-edge: "cap-height", bottom-edge: "baseline", m.n)
          v(${pt(t.sizePt * 1.3)})
          text(size: ${pt(t.sizePt * 1.9)}, weight: 700, fill: rgb("${ink}"), m.title)
        }))
      if m.quote != none {
        v(${pt(t.sizePt * 2.2)})
        block(width: 80%, text(size: ${pt(t.sizePt * 0.98)}, fill: rgb("${soft}"), m.quote))
        if m.by != none {
          v(${pt(t.sizePt * 0.9)})
          text(size: ${pt(t.sizePt * 0.9)}, fill: rgb("${soft}"))[–#m.by]
        }
      }`,
  },
  // นิตยสาร: เลขเล็กมุมบนพร้อมเส้นยาว · คำคมกลางหน้า · ชื่อบทตัวใหญ่ชิดขวาค่อนลงล่าง
  editorial: {
    label: 'นิตยสาร — เลขเล็กมุมบน ชื่อบทตัวใหญ่ชิดขวาค่อนล่าง',
    body: (t, ink, soft) => `
      set align(left)
      grid(columns: (auto, 1fr), column-gutter: ${pt(t.sizePt * 0.7)}, align: horizon,
        text(size: ${pt(t.sizePt * 1.6)}, weight: 700, fill: rgb("${ink}"), m.n),
        line(length: 100%, stroke: 1pt + rgb("${ink}")))
      if m.quote != none {
        v(${pt(t.sizePt * 4.5)})
        block(width: 80%, text(size: ${pt(t.sizePt * 1)}, fill: rgb("${soft}"), m.quote))
        if m.by != none {
          v(${pt(t.sizePt * 0.8)})
          text(size: ${pt(t.sizePt * 0.9)}, fill: rgb("${soft}"))[–#m.by]
        }
        v(${pt(t.sizePt * 3.5)})
      } else {
        v(${pt(t.sizePt * 13)})
      }
      align(right, block(width: 100%, align(right, text(size: ${pt(t.sizePt * 2.2)}, weight: 800, fill: rgb("${ink}"), m.title))))
      v(${pt(t.sizePt * 0.8)})
      align(right, line(length: 40%, stroke: 3pt + rgb("${ink}")))`,
  },
};

/** แบบที่ใช้จริงของเล่มนี้ · 'simple'/ไม่ตั้ง = หัวบทแบบเรียบเดิม · 'poster' (รุ่นแรก) = เส้นคู่ */
export function chapterOpenerKey(book) {
  const v = book?.chapterOpener;
  if (!v || v === 'simple') return '';
  if (v === 'poster') return 'lines';
  return CHAPTER_OPENERS[v] ? v : 'lines';
}

/** ตัวสุ่ม: เลือกหนึ่งแบบต่อเล่ม (ทั้งเล่มแบบเดียวกัน ไม่สลับไปมาระหว่างบท) */
export function pickRandomOpener(rand = Math.random) {
  const keys = Object.keys(CHAPTER_OPENERS);
  return keys[Math.floor(rand() * keys.length) % keys.length];
}

/** ประกาศ state ของหน้าเปิดบท — ต้องอยู่ก่อน #set page เพราะส่วนท้ายหน้าอ่านค่านี้ */
function openerPreamble() {
  return `#let chapter-meta = state("chapter-meta", (n: "", nt: "", title: [], quote: none, by: none))
#let opener-pages = state("opener-pages", ())
`;
}

function chapterOpenerRule(book, t, startRight, opts) {
  const style = CHAPTER_OPENERS[chapterOpenerKey(book)] || CHAPTER_OPENERS.lines;
  return `#show heading.where(level: 1): it => {
  pagebreak(${startRight ? 'to: "odd", ' : ''}weak: true)${markPatternPage(opts)}
  // อ่านเลขหน้าก่อน แล้วค่อยส่งค่าเข้า update — here() ในฟังก์ชันของ update ถูกเรียกทีหลังตอน .final() ซึ่งไม่มีบริบทหน้า (Typst ฟ้อง)
  context { let pg = here().page(); opener-pages.update(pages => pages + (pg,)) }
  context {
    let m = chapter-meta.get()
    // ทั้งหน้าเปิดบทเป็นก้อนเดียวที่แยกหน้าไม่ได้ — เจอในตัวอย่าง: เลขบทค้างหน้าหนึ่ง ที่เหลือล้นไปอีกหน้า
    // บรรทัดของฟอนต์ไทยสูงกว่าที่ตาเห็นมาก (ขอบ ascender/descender) จึงบีบระยะบรรทัดของชื่อบทและคำคมเอง
    set par(first-line-indent: 0pt, justify: false, leading: 0.35em, spacing: 0pt)
    block(breakable: false, width: 100%, {${style.body(t, OPENER_INK, OPENER_SOFT, book.language || 'th')}
    })
  }
  pagebreak()
}`;
}

function frontMatter(book, outline, opts = {}) {
  const has = (k) => (book.frontMatter || []).includes(k);
  const lang = book.language || 'th';
  const T = (v) => inline(prepareForTypeset(v || '', lang));
  const parts = [];

  const coverName = opts.coverFrontName || 'cover-front.png';
  const haveCover = !!opts.includeFrontCover && (opts.assetNames || []).includes(coverName);
  if (haveCover) {
    const coverPalette = book.style?.palette || [];
    const coverText = coverPalette?.[2]?.hex || '#F6F1E7';
    const coverLayout = book.coverLayout || book.style?.typography || {};
    const clampCover = (v, lo, hi, fallback) => {
      const n = Number(v);
      return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
    };
    const coverZone = (name, fallback) => {
      const z = coverLayout?.[name] || {};
      const x = clampCover(z.x_pct, 4, 92, fallback.x);
      const y = clampCover(z.y_pct, 4, 94, fallback.y);
      const width = Math.min(clampCover(z.width_pct, 30, 92, fallback.width), 96 - x);
      const align = ['left', 'center', 'right'].includes(z.align) ? z.align : fallback.align;
      const size = clampCover(z.size_scale, fallback.min, fallback.max, fallback.size);
      const roleIndex = { palette_1: 0, palette_2: 1, palette_3: 2 }[z.color_role];
      const color = coverPalette?.[roleIndex]?.hex || fallback.color || coverText;
      return { x, y, width, align, size, color };
    };
    const czTitle = coverZone('title', { x: 8, y: 10, width: 84, align: 'center', min: 2.0, max: 3.6, size: 2.5, color: coverText });
    const czSubtitle = coverZone('subtitle', { x: 12, y: 26, width: 76, align: 'center', min: 0.8, max: 1.4, size: 1.0, color: coverText });
    const czAuthor = coverZone('author', { x: 10, y: 88, width: 80, align: 'center', min: 0.9, max: 1.5, size: 1.05, color: coverText });
    const coverW = book.trim?.widthMm || 148;
    const coverH = book.trim?.heightMm || 210;

    // ปกที่ ChatGPT วาดตัวหนังสือมาให้แล้ว ห้ามพิมพ์ทับซ้ำ ไม่งั้นจะได้ชื่อเรื่องสองชั้น
    if (frontCoverTextInImage(book)) {
      parts.push(`#page(margin: 0pt)[
  #image("/img/${coverName}", width: 100%, height: 100%, fit: "cover")
]`);
    } else {
    /**
     * ชื่อเรื่องกับชื่อรองต้องซ้อนกันเป็นก้อนเดียว ไม่ใช่วางคนละตำแหน่งตายตัว
     * เจอจริง: ชื่อไทยยาวตัดสองบรรทัด บรรทัดที่สองไปทับชื่อรองที่วางไว้ 26% ของความสูง
     * ชื่อยาวย่อขนาดลงตามความยาว · มีแถบเงาไล่จางด้านบน/ล่าง และตัวอักษรสีอ่อน จึงอ่านออกบนภาพทุกโทน
     * (เจอจริง: ชื่อผู้เขียนสีเข้มบนพื้นภาพมืด มองแทบไม่เห็น)
     */
    const titleLen = [...String(outline.title || '')].length;
    const titleScale = titleLen > 14 ? Math.max(2.0, Math.min(czTitle.size, (czTitle.size * 14) / titleLen)) : czTitle.size;
    const light = '#FFFDF7';
    parts.push(`#page(margin: 0pt)[
  #image("/img/${coverName}", width: 100%, height: 100%, fit: "cover")
  #place(top + left)[#rect(width: 100%, height: 42%, fill: gradient.linear(rgb("#0000009E"), rgb("#00000000"), angle: 90deg))]
  ${book.author ? `#place(bottom + left)[#rect(width: 100%, height: 20%, fill: gradient.linear(rgb("#00000000"), rgb("#00000099"), angle: 90deg))]` : ''}
  #place(top + left, dx: ${round(coverW * czTitle.x / 100)}mm, dy: ${round(coverH * Math.min(czTitle.y, 14) / 100)}mm)[
    #box(width: ${round(coverW * czTitle.width / 100)}mm)[
      #align(${czTitle.align})[
        #text(font: ${str(book.typography.headFont || book.typography.bodyFont)}, size: ${pt(book.typography.sizePt * titleScale)}, weight: 700, fill: rgb("${light}"))[${T(outline.title)}]
        ${outline.subtitle ? `#v(0.5em)
        #text(size: ${pt(book.typography.sizePt * czSubtitle.size)}, fill: rgb("${light}"))[${T(outline.subtitle)}]` : ''}
      ]
    ]
  ]
  ${book.author ? `#place(bottom + left, dx: ${round(coverW * czAuthor.x / 100)}mm, dy: -${round(coverH * 0.05)}mm)[
    #box(width: ${round(coverW * czAuthor.width / 100)}mm)[
      #align(${czAuthor.align})[#text(size: ${pt(book.typography.sizePt * czAuthor.size)}, weight: 600, fill: rgb("${light}"))[${T(book.author)}]]
    ]
  ]` : ''}
]`);
    }
  }

  parts.push(`#page[
  #v(1fr)
  #align(center)[#text(size: ${pt(book.typography.sizePt * 2.4)}, weight: 600)[${T(outline.title)}]]
  ${outline.subtitle ? `#align(center)[#v(0.8em) #text(size: ${pt(book.typography.sizePt * 1.1)}, fill: luma(80))[${T(outline.subtitle)}]]` : ''}
  #v(2fr)
  ${book.author ? `#align(center)[#text(size: ${pt(book.typography.sizePt)})[${inline(book.author)}]]` : ''}
  #v(1fr)
]`);

  if (has('copyright')) {
    parts.push(`#page[
  #v(1fr)
  #text(size: ${pt(book.typography.sizePt * 0.82)}, fill: luma(70))[
    ${inline(outline.title)} \\
    ${book.author ? inline(book.author) + ' \\\\' : ''}
    พิมพ์ครั้งแรก ${new Date().getFullYear() + 543} \\\\
    สงวนลิขสิทธิ์ตามพระราชบัญญัติ
  ]
]`);
  }

  if (has('foreword') && (book.contentMode !== 'fiction' || String(outline.foreword || '').trim())) {
    const foreword = outline.foreword ||
      `หนังสือเล่มนี้จัดทำขึ้นเพื่อช่วยให้ผู้อ่านเข้าใจ ${outline.title} อย่างเป็นขั้นตอนและนำไปใช้ได้จริง\n\n${outline.subtitle || outline.thesis || ''}`;
    parts.push(`#page[
  #text(size: ${pt(book.typography.sizePt * 1.6)}, weight: 600)[คำนำ]
  #v(1.2em)
  ${mdToTypst(prepareForTypeset(foreword, lang), 2, new Set(), book.typography)}
]`);
  }

  if (has('toc')) {
    parts.push(`#page[
  #text(size: ${pt(book.typography.sizePt * 1.6)}, weight: 600)[สารบัญ]
  #v(0.7em)
  #block[
    #set text(size: ${pt(book.typography.sizePt * 0.82)})
    #set par(leading: 0.42em, spacing: 0.42em, first-line-indent: 0pt)
    // ไม่ใส่จุดไข่ปลาลากไปหาเลขหน้า และไม่ใส่จุดนำหน้าชื่อตอน
    // เลขบทที่ขึ้นต้นว่า "บทที่ N ·" กับการเยื้องของตอนย่อย แยกลำดับชั้นได้ชัดพออยู่แล้ว
    // จุดเต็มหน้าเป็นลวดลายที่ดังกว่าเนื้อหาที่มันพาไปหา
    #set outline.entry(fill: none)
    #outline(title: none, depth: ${book.contentMode === 'fiction' ? 1 : 2}, indent: auto)
  ]
]`);
  }

  return parts.join('\n\n');
}

function backCoverPage(book, outline, opts = {}) {
  const backName = opts.coverBackName || 'cover-back.png';
  const haveBack = !!opts.includeBackCover && (opts.assetNames || []).includes(backName);
  if (!haveBack) return '';

  const lang = book.language || 'th';
  const T = (v) => inline(prepareForTypeset(v || '', lang));
  const palette = book.style?.palette || [];

  /**
   * ข้อความบนปกหลังต้องมีกรอบรองเสมอ
   *
   * ภาพปกหลังเป็นงานออกแบบที่มีลาย เงา และบ่อยครั้งมีตัวอักษรที่โมเดลวาดเองอยู่ด้วย
   * การวางคำโปรยทับลงไปตรง ๆ ทำให้สองชั้นตัวอักษรซ้อนกันจนอ่านไม่ออกทั้งคู่
   * (เห็นในเล่มจริง: คำโปรยทับกับป้ายกระดาษบนผนังที่เขียนว่า "ทำสไลด์รายงาน")
   * ต่อให้เลือกสีตัวอักษรเก่งแค่ไหนก็ไม่ชนะพื้นหลังที่คุมไม่ได้ ต้องมีพื้นทึบรองเท่านั้น
   */
  /**
   * สีจาก palette ใช้ได้ก็ต่อเมื่ออ่านออกจริง
   * เจอจริง: palette ของนิยายโทนแดงให้ตัวอักษรแดงบนกรอบแดงเข้ม อ่านไม่ออกทั้งหน้า
   * กรอบต้องสว่าง ตัวอักษรต้องเข้ม และต่างกันพอ (contrast ≥ 7) ไม่งั้นถอยไปคู่สีปลอดภัย
   */
  const lum = (hex) => {
    const m = /^#?([0-9a-f]{6})/i.exec(String(hex || ''));
    if (!m) return null;
    const c = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const contrast = (a, b) => { const x = lum(a), y = lum(b); return x == null || y == null ? 0 : (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const pickPaper = palette?.[2]?.hex;
  const paperColor = pickPaper && lum(pickPaper) >= 0.75 ? pickPaper.slice(0, 7) : '#F6F1E7';
  const pickInk = palette?.[0]?.hex;
  const inkColor = pickInk && contrast(pickInk, paperColor) >= 7 ? pickInk.slice(0, 7) : '#1B1B1F';
  const textColor = inkColor;
  const panelFill = `${paperColor}F0`; // ทึบ 94% พอให้เห็นเนื้อภาพจาง ๆ แต่อ่านออกแน่นอน
  const coverW = book.trim?.widthMm || 148;
  const coverH = book.trim?.heightMm || 210;
  const authorPhotoName = opts.authorPhotoName || 'author-photo.png';
  // โหมด Flow: รูปผู้เขียนที่เลือกไว้สำหรับปกหลังถูกวางโดยเครื่องเรียงพิมพ์เสมอ (ไม่ส่งให้ Flow วาดลงในภาพ)
  const wantsPhoto = !!book.authorPhotoOnCover || (book.imageSource === 'flow' && (book.authorRefTargets || []).includes('cover-back'));
  const showAuthorPhoto = wantsPhoto && (opts.assetNames || []).includes(authorPhotoName);

  /**
   * ถามด้วยเกณฑ์เดียวกับตอนเขียน prompt ไม่ใช่เชื่อธงที่ตั้งไว้ตอนบันทึกไฟล์อย่างเดียว
   *
   * ธง backCoverTextBaked ถูกตั้งที่จุดเดียวในทั้งระบบ คือตอนที่เครื่องบันทึกภาพผ่านเส้นทางปกติ
   * แต่ไฟล์ปกหลังเข้าระบบได้อีกอย่างน้อยสามทาง — ใช้ไฟล์เดิมที่มีอยู่แล้ว กู้ภาพจากห้องแชต
   * และผู้ใช้อัปโหลดเอง ทั้งสามทางไม่เคยตั้งธงนี้ ธงจึงเป็นเท็จทั้งที่ prompt สั่งวาดตัวอักษรลงไปแล้ว
   * ผลคือเครื่องเรียงพิมพ์วางคำโปรยกับชื่อผู้เขียนทับลงบนข้อความชุดเดียวกันที่อยู่ในภาพอยู่แล้ว
   *
   * ตัวตัดสินที่ถูกต้องคือ "เล่มนี้สั่งให้วาดตัวอักษรลงภาพหรือเปล่า" ซึ่งเป็นคำถามเดียว
   * กับที่ใช้ตอนประกอบ prompt — ไม่ใช่ "ไฟล์เดินทางเข้ามาทางไหน"
   */
  const textInImage = backCoverTextInImage(book);

  const photoBlock = showAuthorPhoto
    ? `#place(top + left, dx: 12mm, dy: 14mm)[
      #image("/img/${authorPhotoName}", width: 30mm, height: 38mm, fit: "cover")
    ]`
    : '';
  const authorBlock = book.author && !textInImage
    ? `#place(bottom + left, dx: 12mm, dy: -12mm)[
      #block(fill: rgb("${panelFill}"), inset: (x: 5mm, y: 3mm), radius: 2mm)[
        #text(size: ${pt(book.typography.sizePt * 0.95)}, fill: rgb("${textColor}"))[${T(book.author)}]
      ]
    ]`
    : '';
  /**
   * ปกหลังที่ ChatGPT วาดตัวอักษรมาในภาพแล้ว ห้ามวางคำโปรยทับซ้ำ
   * ไม่งั้นจะได้ข้อความสองชุดซ้อนกันบนปกเดียว ซึ่งแย่กว่าไม่มีเลย
   */
  /**
   * คำโปรยจัดเป็นลำดับชั้น: ย่อหน้าแรก (hook) ตัวหนาใหญ่ ที่เหลือตัวปกติ — เดิมเป็นก้อนข้อความขนาดเท่ากันหมด
   * นิยายตัด bullet ทิ้ง (คำโปรยเก่าที่เขียนแบบหนังสือพัฒนาตัวเอง)
   */
  const blurbParas = String(book.blurb || '')
    .split(/\n\s*\n/)
    .map((p) => (book.contentMode === 'fiction' ? p.split('\n').filter((l) => !/^\s*[•*-]\s/.test(l)).join('\n') : p).trim())
    .filter(Boolean);
  const blurbBlock = blurbParas.length && !textInImage
    ? `#place(top + left, dx: ${round(coverW * 0.1)}mm, dy: ${round(coverH * (showAuthorPhoto ? 0.3 : 0.14))}mm)[
      #block(width: ${round(coverW * 0.8)}mm, fill: rgb("${panelFill}"), inset: (x: 7mm, y: 6mm), radius: 3mm)[
        #set par(leading: 0.62em, spacing: 0.9em, first-line-indent: 0pt)
        #text(size: ${pt(book.typography.sizePt * 1.12)}, weight: 700, fill: rgb("${textColor}"))[${T(blurbParas[0])}]
${blurbParas.slice(1).map((p) => `        #parbreak()\n        #text(size: ${pt(book.typography.sizePt * 0.92)}, fill: rgb("${textColor}"))[${T(p)}]`).join('\n')}
      ]
    ]`
    : '';

  return `#page(margin: 0pt)[
  #image("/img/${backName}", width: 100%, height: 100%, fit: "cover")
  ${photoBlock}
  ${blurbBlock}
  ${authorBlock}
]`;
}

function backMatter(book, outline) {
  const has = (k) => (book.backMatter || []).includes(k);
  const lang = book.language || 'th';
  const T = (v) => inline(prepareForTypeset(v || '', lang));
  const parts = [];

  /**
   * อภิธานศัพท์ — ประกอบจากศัพท์ที่ Book Bible เก็บไว้ระหว่างเขียน
   *
   * ช่องนี้ติ๊กแล้วไม่เคยมีอะไรโผล่ในเล่มเลย เพราะไม่มีใครเขียนส่วนที่พิมพ์มันออกมา
   * ทั้งที่ทุกตอนส่ง new_terms กลับมาใน META และ absorb() เก็บ term/def ไว้ให้ครบตลอดทั้งเล่ม
   * ข้อมูลมีอยู่แล้ว ขาดแค่หน้าที่พิมพ์มัน — ส่วน budget ก็กันหน้าไว้ให้ 2 หน้ามาตลอดด้วย
   *
   * เอาเฉพาะศัพท์ที่มีนิยามจริง รายการศัพท์เปล่าที่ไม่มีคำอธิบายไม่ใช่อภิธานศัพท์
   */
  if (has('glossary')) {
    const seen = new Set();
    const terms = (book.bible?.glossary || [])
      .map((g) => ({ term: String(g?.term || '').trim(), def: String(g?.def || '').trim() }))
      .filter((g) => {
        if (!g.term || !g.def) return false;
        const key = g.term.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => a.term.localeCompare(b.term, lang === 'th' ? 'th' : undefined));
    if (terms.length) {
      const body = terms.map((g) => `*${T(g.term)}* — ${T(g.def)}`).join('\n\n');
      parts.push(`#pagebreak(to: "odd", weak: true)
= อภิธานศัพท์

${body}`);
    }
  }

  if (has('references')) {
    /**
     * รับเฉพาะบรรทัดที่ผู้ใช้พิมพ์เอง (โหมดดูกระแสไม่เก็บแหล่งให้แล้ว)
     * ระบบไม่แต่งบรรณานุกรมขึ้นเอง ด้วยเหตุผลเดียวกับหน้าเกี่ยวกับผู้เขียน —
     * โมเดลที่ถูกสั่งว่า "ใส่แหล่งอ้างอิงมาด้วย" จะแต่งสำนักพิมพ์ ปี และ URL ที่ไม่มีอยู่จริงมาให้ครบชุด
     */
    const refs = referenceLines(book);
    const seen = new Set();
    const unique = refs.filter((r) => {
      const key = String(typeof r === 'string' ? r : r?.url || r?.title || '').trim();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (unique.length) {
      /**
       * หัวหน้าบรรณานุกรมไม่ต้องประกาศว่าใช้รูปแบบอ้างอิงอะไร
       * ชื่อสไตล์ในวงเล็บเป็นข้อมูลของคนทำเล่ม ไม่ใช่ของคนอ่าน — คนอ่านต้องการรู้แค่ว่า
       * นี่คือรายการแหล่งที่มา ส่วนรูปแบบดูออกเองจากตัวรายการอยู่แล้ว
       * ค่า book.referenceStyle ยังใช้จัดรูปแบบตัวรายการตามเดิม แค่ไม่ต้องพิมพ์ชื่อมันออกมา
       */
      const title = 'บรรณานุกรม';
      const lines = unique.map((r) => {
        if (typeof r === 'string') return T(r);
        const label = [r.publisher, r.title, r.date].filter(Boolean).join(' · ');
        const url = r.url ? ` \\\ ${T(r.url)}` : '';
        return `- ${T(label || r.url || 'แหล่งข้อมูล')}${url}`;
      }).join('\n\n');
      /**
       * ตัวอักษรเล็กลงและบรรทัดชิดขึ้น ให้อ่านเป็นรายการอ้างอิง ไม่ใช่เนื้อหาอีกบทหนึ่ง
       * ใช้หน่วย em เพื่อให้ย่อตามขนาดตัวอักษรของเล่มนั้นเอง ไม่ใช่ผูกกับตัวเลขตายตัว
       * ครอบไว้ใน #block เพื่อไม่ให้ขนาดนี้รั่วไปถึงหน้าเกี่ยวกับผู้เขียนที่ต่อท้ายกัน
       */
      const indent = (t) => String(t).split('\n').map((l) => (l ? `  ${l}` : l)).join('\n');
      const seed = book.trendSeed?.trend ? `${T(`หัวข้อตั้งต้น: ${book.trendSeed.trend}`)}\n\n` : '';
      parts.push(`#pagebreak(to: "odd", weak: true)
= ${title}

#block(breakable: true)[
  #set text(size: 0.82em)
  #set par(leading: 0.5em, spacing: 0.8em, first-line-indent: 0pt)
${indent(seed + lines)}
]`);
    }
  }

  /**
   * เดิมด่านนี้เช็ค book.author ทั้งที่เนื้อหาที่พิมพ์จริงคือ book.aboutAuthor
   * คนที่พิมพ์ประวัติมาเต็มหน้าแต่เว้นช่อง "ชื่อผู้เขียน" ไว้ จึงไม่ได้หน้านี้เลยโดยไม่มีใครทัก
   */
  const bio = String(book.aboutAuthor || '').trim();
  if (has('about_author') && bio) {
    parts.push(`#pagebreak(to: "odd", weak: true)
= เกี่ยวกับผู้เขียน

${T(bio)}`);
  }
  return parts.join('\n\n');
}

function str(s) {
  return JSON.stringify(String(s ?? ''));
}
