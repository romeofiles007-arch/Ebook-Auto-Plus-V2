import { appendFictionCharacters } from './fiction-characters.js';

/** Ambient palace decorations exist only while the Chinese fiction form is selected. */
export function syncChineseTheme(active, doc = document) {
  const root = doc.documentElement;
  if (!active) {
    delete root.dataset.fictionTheme;
    doc.getElementById('chineseAtmosphere')?.remove();
    return;
  }
  root.dataset.fictionTheme = 'chinese';
  if (doc.getElementById('chineseAtmosphere')) return;

  const layer = doc.createElement('div');
  layer.id = 'chineseAtmosphere';
  layer.setAttribute('aria-hidden', 'true');
  appendFictionCharacters(layer, doc);
  for (let i = 0; i < 56; i++) {
    const petal = doc.createElement('span');
    petal.className = 'palacePetal';
    petal.style.setProperty('--petal-x', `${(i * 37) % 100}%`);
    petal.style.setProperty('--petal-size', `${12 + (i % 5) * 3}px`);
    petal.style.setProperty('--petal-time', `${16 + (i % 7) * 2}s`);
    petal.style.setProperty('--petal-delay', `${-i * 2.7}s`);
    petal.style.setProperty('--petal-drift', `${i % 2 ? -100 : 130}px`);
    layer.append(petal);
  }
  doc.body.prepend(layer);
}
