import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('./export.js', import.meta.url), 'utf8');
const start = source.indexOf('export function coverTypst(');
const end = source.indexOf('\n/**', start + 1);
const scope = { frontCoverTextInImage: () => true, backCoverTextInImage: () => true };
vm.createContext(scope);
vm.runInContext(source.slice(start, end).replace('export function', 'function'), scope);
const book = { trim: { widthMm: 148, heightMm: 210, bleedMm: 3 }, typography: { sizePt: 16, headFont: 'Sarabun' },
  outline: { title: 'คุยให้สนุกขึ้น: คู่มือฝึกเป็นคนตลกในแบบของตัวเอง' }, author: 'คฑาวุฐ สุมาลี' };
const geo = { widthMm: 304, heightMm: 216, spineMm: 2, spineTextAllowed: true };
const paths = { frontPath: '/img/front.png', backPath: '/img/back.png' };

test('สันบางของชื่อไทยยาวใช้กล่องยาวก่อนหมุน ไม่จัดตัวหนังสือบนความกว้างสัน', () => {
  const src = scope.coverTypst(book, geo, paths);
  assert.match(src, /rotate\(-90deg, reflow: true\)/);
  assert.match(src, /box\(width: 190mm, height: 1mm\)/);
  assert.doesNotMatch(src, /place\(center \+ horizon\)/);
  assert.match(src, /text\(size: 5pt/);
  assert.ok(src.includes(JSON.stringify(`${book.outline.title} · ${book.author}`)));
});

test('เล่มไม่มี ISBN ไม่วางสี่เหลี่ยมบาร์โค้ดว่างทับชื่อผู้เขียน', () => {
  assert.doesNotMatch(scope.coverTypst(book, geo, paths), /rect\(width: 50mm, height: 30mm/);
  assert.match(scope.coverTypst({ ...book, isbn: '9780000000000' }, geo, paths), /rect\(width: 50mm, height: 30mm/);
  assert.doesNotMatch(scope.coverTypst(book, { ...geo, spineTextAllowed: false }, paths), /rotate\(-90deg/);
});
