/**
 * เล่ม "ช่างอลูมิเนียม": PDF หน้า 69 พิมพ์สูตร LaTeX ดิบ และหน้า 18 พิมพ์ <text>…</text> กับเส้นแผนผังปนในย่อหน้า
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { plainMath, texToPlain } from './plain-math.js';
import { prepareForTypeset } from './thai.js';
import { mdToTypst } from '../typeset/template.js';

test('สูตรจากหน้า 69 → ข้อความธรรมดาที่อ่านได้', () => {
  assert.equal(plainMath('\\[ d=\\sqrt{1200^2+1500^2} \\]'), 'd = √(1200² + 1500²)');
  assert.equal(
    plainMath('\\[\nd=\\sqrt{1{,}440{,}000+2{,}250{,}000}\n=\\sqrt{3{,}690{,}000}\n\\approx 1{,}920.9\\text{ มม.}\n\\]'),
    'd = √(1,440,000 + 2,250,000) = √3,690,000 ≈ 1,920.9 มม.',
  );
});

test('รูปแบบสูตรอื่นที่พบบ่อย', () => {
  assert.equal(texToPlain('\\frac{a+b}{2}'), '(a + b)/2');
  assert.equal(texToPlain('90^\\circ'), '90°');
  assert.equal(texToPlain('A = \\pi r^2'), 'A = π r²');
  assert.equal(texToPlain('x_{1} \\times 3 \\leq 10'), 'x₁ × 3 ≤ 10');
  assert.equal(plainMath('ระยะ \\( a^2 \\) เมตร'), 'ระยะ a² เมตร');
  assert.equal(plainMath('ความยาว $L = 2\\times 600$ มม.'), 'ความยาว L = 2 × 600 มม.');
  assert.equal(plainMath('ราคา $5 และ $10'), 'ราคา $5 และ $10');
  assert.equal(plainMath('ผลรวม 1{,}920.9\\text{ มม.} พอดี'), 'ผลรวม 1,920.9 มม. พอดี');
});

test('แท็ก <text> ถูกถอด เหลือข้อความ · เครื่องหมายเปรียบเทียบในเนื้อความไม่ถูกแตะ', () => {
  assert.equal(plainMath('<text>ภาพตัดขวางของกรอบหน้าต่าง</text>'), 'ภาพตัดขวางของกรอบหน้าต่าง');
  assert.equal(plainMath('ม<sup>2</sup> และ H<sub>2</sub>O'), 'ม² และ H₂O');
  assert.equal(plainMath('ถ้า a < b และ b > c'), 'ถ้า a < b และ b > c');
});

test('แผนผังที่วาดด้วยเส้น → บล็อกโค้ด คงแนวบรรทัด · ตาราง markdown ไม่แตะ', () => {
  const diagram = ['ด้านนอกของกรอบ', '| โปรไฟล์กรอบ |', '|   |  ยางกด  |', 'กระจก', '|---+----|---|'].join('\n');
  const out = plainMath(diagram).split('\n');
  assert.equal(out[0], 'ด้านนอกของกรอบ');
  assert.equal(out[1], '```');
  assert.equal(out.at(-1), '```');
  assert.ok(out.includes('กระจก'));

  const table = '| ชนิด | ความหนา |\n|---|---|\n| 6063 | 1.2 มม. |';
  assert.equal(plainMath(table), table);
  const list = '- ขนาด 10-20 มม.\n- หนา 1.2 มม.';
  assert.equal(plainMath(list), list);
});

test('บล็อกโค้ดเดิมไม่ถูกแปลง', () => {
  const code = '```\n\\sqrt{2} <text>x</text>\n```';
  assert.equal(plainMath(code), code);
});

test('ผ่านเส้นทางจัดหน้าจริง: ไม่มี \\sqrt หรือ <text> หลุดถึง Typst', () => {
  const md = 'ระยะทแยง\n\n\\[ d=\\sqrt{1200^2+1500^2} \\]\n\n<text>ภาพตัดขวาง</text>';
  const typ = mdToTypst(prepareForTypeset(md, 'th'));
  assert.ok(!/sqrt|<text>|\\\[/.test(typ), typ);
  assert.match(typ, /√/);
});
