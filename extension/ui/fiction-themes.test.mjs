import test from 'node:test';
import assert from 'node:assert/strict';
import { FICTION_THEMES, syncFictionTheme } from './fiction-themes.js';

// Minimal DOM fixture: exercise theme/decorations lifecycle without booting Studio's writing engine.
function documentFixture() {
  const node = (tag) => ({
    tag, children: [], dataset: {}, style: { setProperty() {} },
    setAttribute() {},
    append(child) { child.parent = this; this.children.push(child); },
    prepend(child) { child.parent = this; this.children.unshift(child); },
    remove() { this.parent.children = this.parent.children.filter((n) => n !== this); },
  });
  const body = node('body');
  const find = (id, n = body) => n.id === id ? n : n.children.map((c) => find(id, c)).find(Boolean);
  return { body, documentElement: { dataset: { studioRoom: 'writer', sceneDuo: '1' } }, createElement: node, getElementById: find };
}

test('each fiction genre selects its own theme; only Chinese mounts palace decorations', () => {
  const doc = documentFixture();
  const genres = ['romance', 'fantasy', 'scifi', 'mystery', 'thriller', 'horror', 'drama', 'adventure', 'comingofage', 'literary', 'senior', 'chinese'];
  assert.deepEqual(Object.keys(FICTION_THEMES).sort(), genres.sort());
  for (const genre of ['chinese', ...genres.filter((g) => g !== 'chinese'), 'chinese']) {
    syncFictionTheme('fiction', genre, doc);
    assert.equal(doc.documentElement.dataset.fictionTheme, genre);
    assert.equal(!!doc.getElementById('chineseAtmosphere'), genre === 'chinese');
    assert.equal(!!doc.getElementById('fictionAtmosphere'), genre !== 'chinese');
    if (genre !== 'chinese') assert.equal(doc.getElementById('fictionAtmosphere').dataset.genre, genre);
    assert.equal(doc.documentElement.dataset.studioRoom, 'writer');
    assert.equal(doc.documentElement.dataset.sceneDuo, '1');
    if (genre !== 'chinese') assert.doesNotMatch(FICTION_THEMES[genre].sceneLabel, /วังหลวง|จีนโบราณ/);
  }
});

test('reselecting Chinese reuses its layer and romance replaces the palace effects', () => {
  const doc = documentFixture();
  syncFictionTheme('fiction', 'chinese', doc);
  const layer = doc.getElementById('chineseAtmosphere');
  syncFictionTheme('fiction', 'chinese', doc);
  assert.equal(doc.getElementById('chineseAtmosphere'), layer);
  assert.equal(doc.body.children.length, 1);
  syncFictionTheme('fiction', 'romance', doc);
  assert.equal(doc.getElementById('chineseAtmosphere'), undefined);
  assert.equal(doc.getElementById('fictionAtmosphere').dataset.kind, 'leaf');
});

test('every genre has appropriate ambient motion and repeated paints reuse its layer', () => {
  const doc = documentFixture();
  const expected = { romance: 'leaf', fantasy: 'firefly', scifi: 'star', mystery: 'dust', thriller: 'rain', horror: 'mist', drama: 'rain', adventure: 'leaf', comingofage: 'seed', literary: 'paper', senior: 'leaf' };
  for (const [genre, kind] of Object.entries(expected)) {
    syncFictionTheme('fiction', genre, doc);
    const layer = doc.getElementById('fictionAtmosphere');
    assert.equal(layer.dataset.kind, kind);
    const particles = layer.children.filter((n) => n.className?.startsWith('fictionParticle '));
    const characters = layer.children.filter((n) => n.className?.startsWith('fictionCharacter '));
    assert.ok(particles.length >= 22 && particles.length <= 96);
    assert.equal(characters.length, 2);
    syncFictionTheme('fiction', genre, doc);
    assert.equal(doc.getElementById('fictionAtmosphere'), layer);
    assert.equal(doc.body.children.length, 1);
  }
  syncFictionTheme('prose', 'senior', doc);
  assert.equal(doc.body.children.length, 0);
});

test('Chinese mounts two shared animated characters and a denser petal field', () => {
  const doc = documentFixture();
  syncFictionTheme('fiction', 'chinese', doc);
  const children = doc.getElementById('chineseAtmosphere').children;
  assert.equal(children.filter((n) => n.className?.startsWith('fictionCharacter ')).length, 2);
  assert.ok(children.filter((n) => n.className === 'palacePetal').length >= 48);
});

test('prose, items and unknown genres restore the base theme even with a saved Chinese genre', () => {
  for (const [mode, genre] of [['prose', 'chinese'], ['items', 'romance'], ['fiction', 'unknown'], ['fiction', 'constructor'], ['fiction', '__proto__'], [undefined, undefined]]) {
    const doc = documentFixture();
    syncFictionTheme('fiction', 'chinese', doc);
    syncFictionTheme(mode, genre, doc);
    assert.equal(doc.documentElement.dataset.fictionTheme, undefined);
    assert.equal(doc.body.children.length, 0);
    assert.equal(doc.documentElement.dataset.studioRoom, 'writer');
  }
});
