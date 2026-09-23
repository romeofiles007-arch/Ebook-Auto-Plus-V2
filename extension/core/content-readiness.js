import { extractSection } from './extract.js';
import { contentRecoveryPrompt } from './prompts.js';

export function parseContentDraft(raw, id) {
  const ex = extractSection(raw, id, { minChars: 1 });
  if (ex.status !== 'ok' || !Array.isArray(ex.meta?.missing_information) ||
      ex.meta.missing_information.some(item => typeof item !== 'string' || !item.trim()) ||
      (!ex.meta.missing_information.length && ex.body.length < 200)) return null;
  return ex;
}

/**
 * เก็บสาระดิบจากคำตอบที่ "มีเนื้อหาแต่รูปแบบไม่ครบ" แทนการทิ้งทั้งก้อนแล้วหยุดทั้งเล่ม
 *
 * สาระดิบเป็นวัตถุดิบภายใน ไม่ได้พิมพ์ลงเล่มตรง ๆ (ขั้นเรียบเรียงเขียนตอนจริงจากมันอีกที)
 * การบังคับรูปแบบเป๊ะจึงไม่คุ้มกับการที่งานทั้งเล่มค้างรอคน — เจอจริง: ตอน 2.1 อ่านไม่ได้สองรอบ
 * ระบบกดทำต่อเองสามครั้งแล้วหยุด ทั้งที่ ChatGPT เขียนเนื้อหามาให้แล้ว
 *
 * คืน { body, meta, salvaged: เหตุผล } หรือ null ถ้าเนื้อหาน้อยเกินกว่าจะใช้ได้จริง
 */
export function salvageContentDraft(raw, id) {
  const text = String(raw || '');
  const ex = extractSection(text, id, { minChars: 1 });
  const okMeta = (m) => Array.isArray(m?.missing_information) && m.missing_information.every((x) => typeof x === 'string');
  const meta = (m) => ({ ...(m && typeof m === 'object' ? m : {}), missing_information: okMeta(m) ? m.missing_information.filter((x) => x.trim()) : [] });
  if (ex.status === 'ok' && ex.body.length >= 200) return { body: ex.body, meta: meta(ex.meta), salvaged: okMeta(ex.meta) ? 'meta_empty' : 'meta_missing' };
  if (ex.status === 'short' && ex.body.length >= 200) return { body: ex.body, meta: meta(ex.meta), salvaged: 'short' };
  if (ex.status === 'truncated' && String(ex.partial || '').length >= 400) return { body: ex.partial, meta: meta(null), salvaged: 'truncated' };
  if (ex.status === 'no_sentinel') {
    // ตอบเป็นเนื้อหาล้วนไม่มีเครื่องหมาย — ตัดบล็อกโค้ด/JSON ทิ้ง เหลือแต่ข้อความ
    const body = text.replace(/```[\s\S]*?```/g, ' ').replace(/<<<[^>]*>>>/g, ' ').trim();
    if (body.length >= 600) return { body, meta: meta(null), salvaged: 'no_sentinel' };
  }
  return null;
}

/** บอกเป็นคำว่าคำตอบผิดตรงไหน — ใส่ลงบันทึกงานให้รู้ว่า ChatGPT ทำอะไรพลาด */
export function describeDraftProblem(raw, id) {
  const ex = extractSection(String(raw || ''), id, { minChars: 1 });
  return {
    ok: 'มีเนื้อหาครบแต่ข้อมูลกำกับท้ายตอน (META) ไม่ครบ',
    short: 'เนื้อหาสั้นเกินไป',
    truncated: 'คำตอบถูกตัดกลางคัน ไม่มีเครื่องหมายปิดตอน',
    wrong_section: `ตอบเป็นตอนอื่น (${ex.gotId || '?'})`,
    refused: 'ไม่ได้เขียนเนื้อหาให้ (ตอบสั้นหรือปฏิเสธ)',
    no_sentinel: 'ตอบมาแต่ไม่มีเครื่องหมายเปิด-ปิดตอน',
  }[ex.status] || ex.status;
}

// One autonomous recovery per unchanged assignment. Persist before sending so
// resuming an uncertain turn cannot silently spend another request.
export async function recoverContentDraft({ book, chapter, section, draft, request, persist }) {
  if (!draft.meta.missing_information.length || draft.recoveryAttempted) return draft;
  const attempted = { ...draft, recoveryAttempted: true };
  await persist(attempted);
  const response = await request(contentRecoveryPrompt({ book, outline: book.outline,
    bible: book.bible, chapter, sections: [section], withContext: true, draft }));
  const ex = response?.data || parseContentDraft(response?.text || '', section.id);
  if (!ex) return attempted;
  const recovered = { ...attempted, md: ex.body, meta: ex.meta, recoveredAt: Date.now() };
  await persist(recovered);
  return recovered;
}

export function contentInputRequests(sections, drafts) {
  return sections.filter(s => drafts.get(s.id)?.meta.missing_information.length)
    .map(s => ({ id: s.id, title: s.title,
      missing: [...drafts.get(s.id).meta.missing_information] }));
}
