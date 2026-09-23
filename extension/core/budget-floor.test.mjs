import test from 'node:test';
import assert from 'node:assert/strict';
import { assignQuotas } from './budget.js';

/**
 * เจอจริง: นิยาย 9 บทในเป้า 10 หน้า ได้ฉากละ 73 หน่วย — ทุกบทเหลือประโยคสรุปเดียว ("เนื้อเรื่องก็ไม่ได้")
 * โหมดหน้ายืดหยุ่นต้องให้ฉากยาวพอเป็นฉากจริง (~3 หน้า) แม้เล่มจะหนากว่าเป้า
 */
const book = (pageMode, contentMode = 'fiction') => ({
  contentMode, language: 'th', targetPages: 10, pageMode,
  trim: { preset: 'a5', widthMm: 148, heightMm: 210 }, typography: { sizePt: 15, lineHeight: 1.6 }, frontMatter: [], backMatter: [],
});
const outline = () => ({ chapters: Array.from({ length: 9 }, (_, i) => ({ n: i + 1, sections: [{ id: `s${i}` }] })) });

test('นิยายโหมดยืดหยุ่น: ทุกฉากอย่างน้อย 2,700 หน่วย', () => {
  const r = assignQuotas(book('soft'), outline());
  assert.ok(r.quotaRange[0] >= 2700, String(r.quotaRange));
  assert.match(r.warnings[0], /เล่มจะหนากว่าเป้า/);
});

test('สารคดีโหมดยืดหยุ่นยังได้ขั้นต่ำของตัวเอง · โหมดเป๊ะแบ่งตามหน้าเดิม', () => {
  assert.ok(assignQuotas(book('soft', 'prose'), outline()).quotaRange[0] >= 990);
  assert.ok(assignQuotas(book('strict'), outline()).quotaRange[0] < 900);
});

/** ผู้ใช้กำหนด: "สั่ง 10 หน้า ก็นับเป็นตัวหนังสือทั้งหมด 10 หน้า รูปภาพไม่ต้องนับ · มากกว่า 10 หน้าก็ปล่อยไป" */
test('จำนวนหน้าที่ตั้ง = หน้าตัวหนังสือล้วน หัวบทและภาพไม่หักงบ', async () => {
  const { computeBudget, targetPhysicalPages } = await import('./budget.js');
  const b = { ...book('soft'), imageSource: 'flow' };
  const one = computeBudget(b, { chapters: [{ n: 1, sections: [{ id: 'a' }] }] });
  const nine = computeBudget(b, outline());
  assert.equal(one.textPages, 10);
  assert.equal(nine.textPages, 10); // บทเยอะไม่กินหน้าตัวหนังสือ
  assert.ok(targetPhysicalPages(b, outline()) > targetPhysicalPages(b, { chapters: [{ n: 1, sections: [{ id: 'a' }] }] }));
});
