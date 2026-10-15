import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('./flow.js', import.meta.url), 'utf8');
const start = source.indexOf('  async function openTileMenu(');
const method = source.slice(start, source.indexOf('  const menuItem =', start));

function harness({ syntheticOpens }) {
  const selected = [];
  let scrolled = false;
  let menuOpen = true;
  const oldButton = { getAttribute: () => 'more', owner: 'other-image' };
  const desiredButton = { getAttribute: () => 'more', owner: 'requested-image' };
  const oldTile = { scrollIntoView: () => {}, dispatchEvent() {}, buttons: [oldButton] };
  const currentTile = { dispatchEvent() {}, buttons: [desiredButton] };
  const context = vm.createContext({
    $$: (selector, root) => root ? root.buttons : (menuOpen ? [{}] : []),
    visible: () => true,
    escape: () => { menuOpen = false; },
    findTile: (id) => { assert.equal(id, 'requested-image'); return scrolled ? currentTile : oldTile; },
    waitFor: async (read) => { const value = read(); if (!value) throw new Error('timeout'); return value; },
    sleep: async () => { scrolled = true; },
    MouseEvent: class {},
    text: () => 'more_vert',
    // คลิกแบบสคริปต์ (ทางเดิม): ปุ่มเมนูของ Flow รับได้เมื่อหน้าเว็บยอม — ไม่ขึ้นเมนูค่อยใช้คลิกพิกัด
    realClick: (button) => {
      assert.equal(menuOpen, false, 'previous tile menu must be closed before opening another');
      selected.push(['synthetic', button.owner]);
      if (syntheticOpens) menuOpen = true;
    },
    trustedClick: async (resolve) => {
      assert.equal(typeof resolve, 'function');
      selected.push(['trusted', resolve().owner]);
      menuOpen = true;
    },
  });
  vm.runInContext(`${method}
globalThis.open = openTileMenu;`, context);
  return { open: context.open, selected };
}

test('virtual scroll recycles the old tile: menu click resolves the requested media id again after scrolling', async () => {
  const h = harness({ syntheticOpens: true });
  await h.open('requested-image');
  assert.deepEqual(h.selected, [['synthetic', 'requested-image']]);
});

test('ปุ่มเมนูที่ไม่รับคลิกของสคริปต์ → ถอยไปคลิกพิกัดที่ tile ของภาพที่ขอเท่านั้น', async () => {
  const h = harness({ syntheticOpens: false });
  await h.open('requested-image');
  assert.deepEqual(h.selected, [['synthetic', 'requested-image'], ['trusted', 'requested-image']]);
});
