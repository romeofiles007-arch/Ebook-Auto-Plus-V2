/**
 * ด่านกวาดรูปแบบที่ตัวจัดหน้าพิมพ์ออกมาเป็นโค้ดดิบ
 *
 * เล่ม "ช่างอลูมิเนียม" หน้า 69: \[ d=\sqrt{1{,}440{,}000+2{,}250{,}000} \approx 1{,}920.9\text{ มม.} \]
 * หน้า 18: <text>ภาพตัดขวาง…</text> และแผนผังเส้น | — | ที่ถูกต่อเป็นย่อหน้าเดียว
 *
 * สั่งในพรอมต์แล้ว (core/prompts.js PLAIN_FORMAT_RULE) แต่โมเดลยังหลุดได้ และเล่มที่เขียนไว้แล้วต้องพิมพ์ได้ถูกด้วย
 * จึงกวาดที่ prepareForTypeset ซึ่งทุกเส้นทางผลิต PDF ผ่าน
 *  - สูตร LaTeX → ข้อความธรรมดาที่มีสัญลักษณ์ √ ² ≈ ×
 *  - แท็ก HTML/XML ที่รู้จัก → ถอดแท็กเหลือแต่ข้อความ
 *  - แผนผังที่วาดด้วยเส้น → กล่อง :::box รายชื่อชิ้นส่วนตามลำดับ ไม่ถูกต่อเป็นย่อหน้า
 */

const SYMBOLS = {
  approx: '≈', times: '×', cdot: '·', div: '÷', pm: '±', mp: '∓',
  le: '≤', leq: '≤', ge: '≥', geq: '≥', ne: '≠', neq: '≠', equiv: '≡', sim: '~',
  to: '→', rightarrow: '→', Rightarrow: '⇒', leftarrow: '←', implies: '⇒',
  infty: '∞', degree: '°', circ: '°', pi: 'π', theta: 'θ', alpha: 'α', beta: 'β', gamma: 'γ',
  delta: 'δ', Delta: 'Δ', lambda: 'λ', mu: 'μ', sigma: 'σ', Sigma: 'Σ', sum: 'Σ', rho: 'ρ',
  omega: 'ω', Omega: 'Ω', phi: 'φ', eta: 'η', epsilon: 'ε', varepsilon: 'ε', tau: 'τ',
  angle: '∠', perp: '⊥', parallel: '∥', therefore: '∴', because: '∵', ldots: '…', dots: '…', cdots: '⋯',
  '%': '%', '$': '$', '&': '&', '#': '#', '_': '_', '{': '{', '}': '}',
  ',': ' ', ';': ' ', ':': ' ', '!': '', quad: ' ', qquad: ' ', ' ': ' ',
  left: '', right: '', big: '', Big: '', bigl: '', bigr: '', displaystyle: '',
};
const TEXT_CMDS = new Set(['text', 'mathrm', 'textrm', 'mathbf', 'textbf', 'mathit', 'textit', 'operatorname', 'mbox', 'mathsf', 'boxed']);
const SUP = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', '+': '⁺', '-': '⁻', '−': '⁻', n: 'ⁿ' };
const SUB = { 0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉', '+': '₊', '-': '₋' };

/** อ่านอาร์กิวเมนต์หนึ่งตัวที่ตำแหน่ง i: {…} ทั้งก้อน หรืออักษรเดียว */
function readArg(s, i) {
  while (s[i] === ' ') i++;
  if (s[i] !== '{') {
    if (s[i] === '\\') {
      const m = /^\\([A-Za-z]+|.)/.exec(s.slice(i));
      return m ? { body: m[0], end: i + m[0].length } : { body: '', end: i };
    }
    return { body: s[i] ?? '', end: i + 1 };
  }
  let depth = 0;
  for (let j = i; j < s.length; j++) {
    if (s[j] === '{') depth++;
    else if (s[j] === '}' && --depth === 0) return { body: s.slice(i + 1, j), end: j + 1 };
  }
  return { body: s.slice(i + 1), end: s.length };
}

// ไม่ต้องใส่วงเล็บถ้าเป็นตัวเลขหรือชื่อเดียว
const simple = (x) => /^[\p{L}\p{N}.,]+$/u.test(x);
const group = (x) => (simple(x) ? x : `(${x})`);

function script(body, table, mark) {
  const chars = [...body];
  if (chars.length && chars.every((c) => table[c])) return chars.map((c) => table[c]).join('');
  if (mark === '^' && (body === '\\circ' || body === '°')) return '°';
  return `${mark}${group(body)}`;
}

/** สูตร LaTeX หนึ่งก้อน (ไม่รวมตัวคั่น) → ข้อความธรรมดา */
export function texToPlain(tex) {
  const s = String(tex).replace(/\{,\}/g, ',').replace(/\s+/g, ' ');
  let out = '';
  for (let i = 0; i < s.length; ) {
    const c = s[i];
    if (c === '\\') {
      const m = /^\\([A-Za-z]+|.)/.exec(s.slice(i));
      if (!m) { i++; continue; }
      const name = m[1];
      i += m[0].length;
      if (name === 'sqrt') {
        let n = '';
        if (s[i] === '[') { const k = s.indexOf(']', i); n = s.slice(i + 1, k); i = k + 1; }
        const a = readArg(s, i);
        i = a.end;
        out += `${n === '3' ? '∛' : n ? `${n}√` : '√'}${group(texToPlain(a.body))}`;
      } else if (name === 'frac' || name === 'dfrac' || name === 'tfrac') {
        const a = readArg(s, i);
        const b = readArg(s, a.end);
        i = b.end;
        out += `${group(texToPlain(a.body))}/${group(texToPlain(b.body))}`;
      } else if (TEXT_CMDS.has(name)) {
        const a = readArg(s, i);
        i = a.end;
        out += name === 'text' || name === 'mbox' ? a.body : texToPlain(a.body);
      } else if (name in SYMBOLS) {
        out += SYMBOLS[name];
      } else {
        out += name; // คำสั่งที่ไม่รู้จัก เหลือชื่อไว้ดีกว่าหายเงียบ
      }
    } else if (c === '^' || c === '_') {
      const a = readArg(s, i + 1);
      i = a.end;
      out += script(texToPlain(a.body).trim(), c === '^' ? SUP : SUB, c);
    } else if (c === '{' || c === '}') {
      i++;
    } else {
      out += c;
      i++;
    }
  }
  return out
    .replace(/\s*([=≈×÷±≤≥≠→+])\s*/g, ' $1 ')
    .replace(/(\d) - (\d)/g, '$1 − $2')
    .replace(/ {2,}/g, ' ')
    .replace(/\( /g, '(')
    .replace(/ \)/g, ')')
    .trim();
}

// แท็กที่โมเดลชอบหลุดมา — จำกัดชื่อไว้ เพื่อไม่ไปกิน "a <b" หรือ "<5 มม.>" ในเนื้อความ
const TAGS = 'text|tspan|span|div|p|br|hr|b|i|u|em|strong|small|sup|sub|svg|g|rect|line|path|circle|polyline|polygon|label|caption|figure|figcaption|center|font|mark|code|pre';
const TAG_RE = new RegExp(`<\\/?(?:${TAGS})(?:\\s[^<>\\n]*)?\\/?>`, 'gi');

function stripTags(s) {
  return s
    .replace(/<sup>\s*([0-9+\-]+)\s*<\/sup>/gi, (m, d) => [...d].map((c) => SUP[c] || c).join(''))
    .replace(/<sub>\s*([0-9+\-]+)\s*<\/sub>/gi, (m, d) => [...d].map((c) => SUB[c] || c).join(''))
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(TAG_RE, '');
}

const TEX_CMD = /\\(?:sqrt|frac|dfrac|text|mathrm|approx|times|cdot|div|pm|le|leq|ge|geq|neq|ne|infty|pi|theta|alpha|beta|Delta|degree|circ|quad|left|right)(?![A-Za-z])/;

function mathSpans(s) {
  return s
    // $$…$$ และ \[…\] = สูตรแยกบรรทัด
    .replace(/\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]/g, (m, a, b) => texToPlain(a ?? b))
    .replace(/\\\(([\s\S]+?)\\\)/g, (m, a) => texToPlain(a))
    // $…$ ในบรรทัด เฉพาะที่เห็นชัดว่าเป็นสูตร ไม่ใช่ราคา "$5 และ $10"
    .replace(/\$([^$\n]+?)\$/g, (m, a) => (/[\\^_{}]/.test(a) ? texToPlain(a) : m))
    // คำสั่ง LaTeX ที่หลุดมาโดยไม่มีตัวคั่น
    .split('\n')
    .map((line) => (TEX_CMD.test(line) || /\d\{,\}\d/.test(line) ? bareTex(line) : line))
    .join('\n');
}

/** บรรทัดที่มีคำสั่ง LaTeX ปนข้อความ: แปลงเฉพาะช่วงที่เป็นสูตร ข้อความรอบ ๆ คงเดิม */
function bareTex(line) {
  return line
    .replace(/(\d)\{,\}(?=\d)/g, '$1,')
    .replace(/\\(?:text|mbox|mathrm|textrm|textbf|mathbf)\{([^{}]*)\}/g, '$1')
    .replace(/[^\s฀-๿]*\\[A-Za-z]+[^\s฀-๿]*(?:\s*[=+\-×≈][^\s฀-๿]*)*/g, (m) => texToPlain(m));
}

const BOX = /[│┃┌┐└┘├┤┬┴┼─━═║╔╗╚╝╠╣╦╩╬]/g;
const TABLE_SEP = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/;

/** บรรทัดนี้หน้าตาเป็นเส้นของแผนผังหรือไม่ */
function drawn(line) {
  if (!line.trim() || /^\s*(#|!\[|>|```)/.test(line)) return false;
  const box = (line.match(BOX) || []).length;
  const pipes = (line.match(/\|/g) || []).length;
  const rule = /[-_=]{3,}|[-=]+>|<[-=]+/.test(line.trim().replace(/^[-*+]\s+/, ''));
  return box >= 2 || pipes >= 2 || (rule && (pipes >= 1 || /[+\/\\]/.test(line)));
}

// เส้นล้วนที่ไม่มีข้อความ ("-----", "═════") — เป็นเส้นของแผนผังเมื่ออยู่ติดบรรทัดที่วาด
const RULE_ONLY = /^\s*[-_=—–─━═+]{3,}\s*$/;
// ป้ายชื่อสั้น ๆ ที่ไม่ใช่ประโยค หัวข้อ หรือรายการ
const isLabel = (l) => !!l && !!l.trim() && l.trim().length < 40 && !/^\s*(#|!\[|>|```|:::|[-*+]\s|\d+[.)]\s)/.test(l) && !drawn(l) && !RULE_ONLY.test(l);
// เส้นเชื่อมแนวตั้งที่อยู่บรรทัดเดียว ("|", "v", "↓") ระหว่างขั้นของผังลำดับ
const CONNECTOR = /^\s*(?:[|│┃↓▼↑▲]|[vV])\s*$/;
const stroke = (l) => drawn(l) || CONNECTOR.test(l);
const partOf = (l, next) => stroke(l) || (RULE_ONLY.test(l) && drawn(next || ''));

// ทุกอย่างที่เป็น "เส้น" ในแผนผัง — เหลือไว้แต่ข้อความระหว่างเส้น
const STROKES = /[│┃┌┐└┘├┤┬┴┼─━═║╔╗╚╝╠╣╦╩╬|+]+|[-_=—–]{2,}>?|<?[-=]{2,}|->|<-|=>|[→←↑↓▲▼►◄]|^\s*[-—–]\s*$/g;
const ARROW_H = /->|=>|→|►|<-|←|◄/;
const ARROW_V = /[↓▼↑▲]|^\s*[vV]\s*$/;

/** แต่ละบรรทัดของแผนผัง → ข้อความที่อยู่ในบรรทัดนั้น */
function diagramItems(run) {
  const rows = [];
  let flow = false;
  for (const line of run) {
    if (CONNECTOR.test(line)) { flow = true; continue; }
    const labels = line.split(STROKES).map((s) => s.replace(/^[\s\/\\:.]+|[\s\/\\:]+$/g, '').replace(/\s+/g, ' ')).filter((s) => /[\p{L}\p{N}]/u.test(s));
    if (!labels.length) { if (ARROW_V.test(line)) flow = true; continue; }
    const row = labels.join(ARROW_H.test(line) ? (/<-|←|◄/.test(line) && !/->|=>|→|►/.test(line) ? ' ← ' : ' → ') : ' · ');
    if (rows.at(-1) !== row) rows.push(row);
  }
  return flow && rows.length > 1 ? [rows.join(' → ')] : rows;
}

/**
 * แผนผังที่วาดด้วยเส้น (2 บรรทัดขึ้นไปติดกัน) → กล่อง :::box รายชื่อชิ้นส่วนตามลำดับ
 *
 * เคยห่อเป็นบล็อกโค้ดให้คงแนวบรรทัด แต่ข้อความที่ดึงจาก ChatGPT ถูกยุบช่องว่างไปแล้ว
 * (แผนผังที่ไม่อยู่ในบล็อกโค้ดถูกแสดงเป็นย่อหน้า) เส้นจึงไม่ตรงกันอีก หน้า 18 ได้ "|| ยางกดกระจก ||" "|||" ซึ่งอ่านไม่ออก
 * อักษรไทยในฟอนต์ความกว้างคงที่ก็ไม่ตรงแนวอยู่ดี และ .docx / EPUB ไม่รู้จัก ``` จึงพิมพ์ออกมาตรง ๆ
 * กล่องเป็นรูปแบบเดียวที่ทั้ง PDF, Word และ EPUB วาดได้ และสิ่งที่ผู้อ่านต้องการจากแผนผังคือชื่อชิ้นส่วนกับลำดับ
 * ตารางที่มีแถวคั่น |---| ไม่แตะ
 */
function boxDiagrams(lines) {
  const out = [];
  for (let i = 0; i < lines.length; ) {
    if (!partOf(lines[i], lines[i + 1])) { out.push(lines[i++]); continue; }
    let j = i;
    // ป้ายชื่อสั้น ๆ ที่คั่นกลางระหว่างเส้นของแผนผังเดียวกัน ("กระจก") ไปด้วยกัน
    while (j < lines.length && (partOf(lines[j], lines[j + 1]) || (isLabel(lines[j]) && partOf(lines[j + 1] || '', lines[j + 2])))) j++;
    const run = lines.slice(i, j);
    const sep = run.findIndex((l) => TABLE_SEP.test(l));
    const table = sep >= 0 && /^\s*\|/.test(lines[i + sep - 1] || '');
    const listOnly = run.every((l) => /^\s*([-*+]|\d+[.)])\s/.test(l));
    const drawnCount = run.filter(stroke).length;
    if (drawnCount < 2 || table || listOnly) { out.push(...run); i = j; continue; }

    // ป้ายที่ติดอยู่บนสุด ("ด้านนอกของกรอบ") เป็นหัวกล่อง ป้ายท้ายที่ปิดย่อหน้า ("ด้านในของกรอบ") เป็นรายการสุดท้าย
    // ผังลำดับที่เริ่มด้วยเส้นเชื่อม ป้ายบนสุดคือขั้นแรก ไม่ใช่หัวกล่อง
    let title = '';
    if (isLabel(out.at(-1)) && !(out.at(-2) || '').trim()) title = out.pop().trim();
    if (title && CONNECTOR.test(run[0])) { run.unshift(title); title = ''; }
    if (isLabel(lines[j]) && lines[j].trim().length < 25 && !(lines[j + 1] || '').trim()) run.push(lines[j++]);
    const items = diagramItems(run);
    if (items.length) {
      if (out.length && out.at(-1).trim()) out.push('');
      out.push(`:::box ${title}`.trimEnd(), ...items.map((x) => `- ${x}`), ':::');
      if (j < lines.length && lines[j].trim()) out.push('');
    } else if (title) out.push(title); // เส้นล้วนไม่มีข้อความ — ไม่มีอะไรให้อ่าน ทิ้งไป
    i = j;
  }
  return out;
}

export function plainMath(md) {
  const text = String(md ?? '');
  if (!/[\\<$|│┃┌└├─═║{+→↓]/.test(text)) return text;
  // บล็อกโค้ดเดิมไม่แตะ — ตั้งใจให้พิมพ์ตามตัวอักษร
  const parts = text.split(/(^```[^\n]*\n[\s\S]*?^```[ \t]*$)/m);
  return parts
    .map((part, k) => (k % 2 ? part : boxDiagrams(mathSpans(stripTags(part)).split('\n')).join('\n')))
    .join('');
}
