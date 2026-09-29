/**
 * ตรวจสัมผัสกลอนไทยแบบประมาณ — เทียบ "สระ + มาตราตัวสะกด" ของพยางค์ท้าย
 * ผู้ใช้: "กลอนที่ออกมายังไม่คล้องจองเลย ยังมั่ว" — เดิมไม่มีใครตรวจ เชื่อคำตอบของโมเดลอย่างเดียว
 *
 * ไม่ใช่ตัวแยกพยางค์เต็มรูปแบบ แต่ครอบกรณีที่พบบ่อยในกลอน: สระหน้า (เ แ โ ใ ไ) สระบน/ล่าง สระประสม
 * (เ-ีย เ-ือ -ัว เ-า -ำ) สระ อ ที่เป็นสระ สระเสียงแฝง (คด = โ-ะ + ด) และการันต์ ( ์ )
 * เสียงวรรณยุกต์ไม่นับ (สัมผัสไม่บังคับวรรณยุกต์) · สระเสียงสั้น/ยาวคู่กันถือว่าต่างกัน ตามหลักสัมผัส
 */

const CONS = 'กขฃคฅฆงจฉชซฌญฎฏฐฑฒณดตถทธนบปผฝพฟภมยรลวศษสหฬอฮ';
const isCons = (c) => CONS.includes(c);
const TONE = /[่้๊๋]/g;
const LEAD = 'เแโใไ';

/** มาตราตัวสะกด */
const FINAL = {
  k: 'กขคฆ',
  t: 'ดจชซฎฏฐฑฒตถทธศษส',
  p: 'บปพฟภ',
  ng: 'ง',
  n: 'นญณรลฬ',
  m: 'ม',
  y: 'ย',
  w: 'ว',
};
const finalOf = (c) => Object.keys(FINAL).find((k) => FINAL[k].includes(c)) || '';

/** ตัดตัวการันต์ (พยัญชนะ + ์ และตัวที่อยู่หน้า ิ์ / ุ์) ออก */
function stripSilent(s) {
  return s.replace(/[ก-ฮ][ิุ]?์/g, '');
}

/**
 * คืน { vowel, final } ของพยางค์ท้ายในคำ — วิเคราะห์จากท้ายคำย้อนขึ้นไป
 * vowel เป็นรหัสรูปสระแบบย่อ (เช่น 'u', 'o', 'ia', 'ai') ใช้เทียบกันเองเท่านั้น
 */
export function rime(word) {
  let s = stripSilent(String(word || '').trim().replace(/[\s​.,!?"“”'‘’()ๆฯ-]+$/g, '')).replace(TONE, '');
  if (!s) return null;
  s = s.replace(/ใ/g, 'ไ'); // ใ ไ เสียงเดียวกัน

  // พยางค์ท้าย: ตัดจากตำแหน่งสระหน้าตัวสุดท้าย หรือพยัญชนะต้นที่ใกล้ท้ายที่สุดแบบคร่าว ๆ
  const leadAt = Math.max(...[...LEAD].map((l) => s.lastIndexOf(l)));
  let syl = s;
  if (leadAt >= 0 && s.length - leadAt <= 7) syl = s.slice(leadAt);
  else {
    // ไม่มีสระหน้า: พยางค์ท้าย = พยัญชนะต้น + (สระบน/ล่าง) + (ตัวสะกด) → หาพยัญชนะตัวก่อนสระ/ตัวสะกดท้าย
    const chars = [...s];
    let i = chars.length - 1;
    // ตัวสะกดท้าย (พยัญชนะที่ไม่มีสระตามหลัง) ข้ามไป 1 ตัว
    if (isCons(chars[i]) && i > 0) i--;
    // สระ/เครื่องหมายระหว่างต้นกับสะกด
    while (i > 0 && !isCons(chars[i])) i--;
    // ตัวควบ/อักษรนำ (ร ล ว หลังพยัญชนะ, ห นำ) รวมเป็นพยัญชนะต้น
    if (i > 0 && 'รลว'.includes(chars[i]) && isCons(chars[i - 1])) i--;
    if (i > 0 && chars[i - 1] === 'ห' && 'งญนมยรลว'.includes(chars[i])) i--;
    syl = chars.slice(Math.max(0, i)).join('');
  }

  // ถอดพยางค์: [สระหน้า] ต้น [ควบ] [สระบน/ล่าง/ตาม] [ตัวสะกด]
  const c = [...syl];
  let lead = '';
  if (LEAD.includes(c[0])) lead = c.shift();
  // พยัญชนะต้น (+ห นำ / ตัวควบ)
  let k = 0;
  if (isCons(c[k])) k++;
  if (c[0] === 'ห' && 'งญนมยรลว'.includes(c[k])) k++;
  else if ('รลว'.includes(c[k]) && isCons(c[k + 1] || '') === false && c.length > k + 1 && !'ะาิีึืุูั็ำ'.includes(c[k + 1] || '')) {
    // ควบกล้ำตามด้วยสระ เช่น กราบ (ก ร า บ) — ร เป็นตัวควบ
  }
  if ('รลว'.includes(c[k]) && 'ะาิีึืุูั็ำ'.includes(c[k + 1] || '')) k++;
  const rest = c.slice(k).join('');

  let vowel;
  let fin = '';
  const m = rest.match(/^([ะาิีึืุูั็ำ]*)(.*)$/);
  let marks = m[1];
  let tail = m[2];
  // สระประสม/สระที่ใช้พยัญชนะเป็นรูป
  if (lead === 'เ' && marks.includes('ี') && tail.startsWith('ย')) { vowel = 'ia'; tail = tail.slice(1); }
  else if (lead === 'เ' && marks.includes('ื') && tail.startsWith('อ')) { vowel = 'uea'; tail = tail.slice(1); }
  else if (lead === 'เ' && tail.startsWith('า')) { vowel = 'ao'; tail = tail.slice(1); marks = ''; }
  else if (lead === 'เ' && marks === 'ิ') vowel = 'oe'; // เดิน
  else if (lead === 'เ' && tail.startsWith('อ')) { vowel = 'oe'; tail = tail.slice(1); } // เธอ
  else if (lead === 'เ' && marks === '็') vowel = 'e_s';
  else if (lead === 'แ' && marks === '็') vowel = 'ae_s';
  else if (lead) vowel = { เ: 'e', แ: 'ae', โ: 'o_l', ไ: 'ai' }[lead] + (marks.includes('ะ') ? '_s' : '');
  else if (marks === 'ั' && tail.startsWith('ว')) { vowel = 'ua'; tail = tail.slice(1); }
  else if (marks === 'ำ') vowel = 'am';
  else if (marks.includes('า')) vowel = 'aa';
  else if (marks === 'ั' || marks === 'ะ') vowel = 'a';
  else if (marks === 'ิ') vowel = 'i';
  else if (marks === 'ี') vowel = 'ii';
  else if (marks === 'ึ') vowel = 'ue';
  else if (marks === 'ื') vowel = 'uue';
  else if (marks === 'ุ') vowel = 'u';
  else if (marks === 'ู') vowel = 'uu';
  else if (marks === '็' && tail.startsWith('อ')) { vowel = 'o_l_s'; tail = tail.slice(1); } // ล็อก
  else if (tail.startsWith('อ') && tail.length <= 2) { vowel = 'or'; tail = tail.slice(1); } // ขอ บอก
  else if (tail.startsWith('ร') && tail.length === 2 && tail[1] !== 'ร') { vowel = 'o_r'; } // พร (ออน) — ประมาณ
  else if (tail === 'รร') { vowel = 'a'; tail = 'น'; } // กรร = กัน
  else vowel = tail ? 'o' : 'o'; // สระเสียงแฝง โ-ะ (คด ลด) / อะ ท้ายคำ

  if (vowel === 'o_r') { fin = 'n'; }
  else {
    const f = [...tail].filter(isCons);
    fin = f.length ? finalOf(f[f.length - 1]) : '';
  }
  if (vowel === 'am') fin = 'm';
  if (vowel === 'ai' && !fin) fin = '';
  return { vowel, final: fin };
}

/** สองคำนี้สัมผัสกันไหม (สระเดียวกัน + มาตราตัวสะกดเดียวกัน) — วิเคราะห์ไม่ออก = ถือว่าไม่รู้ (null) */
export function rhymes(a, b) {
  const x = rime(a);
  const y = rime(b);
  if (!x || !y) return null;
  const norm = (v) => v.replace(/_s$/, '');
  // ไม/ใม, อำ/อัม ถือว่าเสียงเดียวกัน
  const vx = x.vowel === 'am' ? 'a' : x.vowel;
  const vy = y.vowel === 'am' ? 'a' : y.vowel;
  return (vx === vy || norm(vx) === norm(vy)) && x.final === y.final;
}

const wordSeg = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter('th', { granularity: 'word' }) : null;
const wordsOf = (line) =>
  wordSeg
    ? [...wordSeg.segment(line)].filter((s) => s.isWordLike).map((s) => s.segment)
    : line.split(/\s+/).filter(Boolean);

/**
 * ตรวจสัมผัสนอกของกลอนแปด (หนึ่งบรรทัด = หนึ่งวรรค · หนึ่งบท = สี่วรรค: สดับ รับ รอง ส่ง)
 *   1) คำท้ายวรรคสดับ ↔ คำใดคำหนึ่งช่วงต้น-กลางวรรครับ (ตำแหน่ง 3 หรือ 5)
 *   2) คำท้ายวรรครับ ↔ คำท้ายวรรครอง
 *   3) คำท้ายวรรครอง ↔ คำช่วงต้น-กลางวรรคส่ง
 *   4) ข้ามบท: คำท้ายวรรคส่ง ↔ คำท้ายวรรครับของบทถัดไป
 * ตรวจแบบผ่อน (คำไม่ใช่พยางค์) เพื่อไม่ให้ตีตกกลอนที่ถูก · คำซ้ำตัวเดียวกันไม่นับเป็นสัมผัส
 * คืน { ok, problems[] } — problems เป็นภาษาไทยพร้อมคำที่เกี่ยว ใช้ส่งกลับไปให้แต่งใหม่
 */
export function checkKlon(text) {
  const lines = String(text || '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('~'));
  const problems = [];
  if (lines.length < 4 || lines.length % 4) {
    return { ok: false, problems: [`ต้องเขียนหนึ่งบรรทัดต่อหนึ่งวรรค บทละ 4 บรรทัด (ได้ ${lines.length} บรรทัด)`] };
  }
  const W = lines.map(wordsOf);
  const last = (i) => W[i][W[i].length - 1] || '';
  const inner = (i, from, to) => W[i].slice(0, -1).filter((_, k) => k >= from && k <= to);
  const good = (a, b) => a && b && a !== b && rhymes(a, b) === true;
  const somewhere = (word, i) => inner(i, 0, 5).some((w) => good(word, w));
  for (let b = 0; b < lines.length; b += 4) {
    const n = b / 4 + 1;
    if (!somewhere(last(b), b + 1)) problems.push(`บทที่ ${n}: "${last(b)}" ท้ายวรรคสดับ ไม่มีคำสัมผัสในวรรครับ (คำที่ 3 หรือ 5)`);
    if (!good(last(b + 1), last(b + 2))) problems.push(`บทที่ ${n}: "${last(b + 1)}" ท้ายวรรครับ ไม่สัมผัสกับ "${last(b + 2)}" ท้ายวรรครอง`);
    if (!somewhere(last(b + 2), b + 3)) problems.push(`บทที่ ${n}: "${last(b + 2)}" ท้ายวรรครอง ไม่มีคำสัมผัสในวรรคส่ง (คำที่ 3 หรือ 5)`);
    if (b + 4 < lines.length && !good(last(b + 3), last(b + 5))) problems.push(`รอยต่อบทที่ ${n}→${n + 1}: "${last(b + 3)}" ท้ายวรรคส่ง ไม่สัมผัสกับ "${last(b + 5)}" ท้ายวรรครับของบทถัดไป`);
  }
  return { ok: !problems.length, problems };
}
