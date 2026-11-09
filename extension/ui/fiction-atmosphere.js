import { appendFictionCharacters } from './fiction-characters.js';

/** Ambient details and genre portraits remain visible above the background scrim. */
export const FICTION_ATMOSPHERES = Object.freeze({
  romance: { kind: 'leaf', count: 64 },
  fantasy: { kind: 'firefly', count: 80 },
  scifi: { kind: 'star', count: 90 },
  mystery: { kind: 'dust', count: 76 },
  thriller: { kind: 'rain', count: 96 },
  horror: { kind: 'mist', count: 22 },
  drama: { kind: 'rain', count: 80 },
  adventure: { kind: 'leaf', count: 64 },
  comingofage: { kind: 'seed', count: 54 },
  literary: { kind: 'paper', count: 48 },
  senior: { kind: 'leaf', count: 54 },
});

export function syncFictionAtmosphere(genre, doc = document) {
  const effect = Object.hasOwn(FICTION_ATMOSPHERES, genre) ? FICTION_ATMOSPHERES[genre] : null;
  const old = doc.getElementById('fictionAtmosphere');
  if (effect && old?.dataset.genre === genre) return;
  old?.remove();
  if (!effect) return;

  const layer = doc.createElement('div');
  layer.id = 'fictionAtmosphere';
  layer.dataset.genre = genre;
  layer.dataset.kind = effect.kind;
  layer.setAttribute('aria-hidden', 'true');
  appendFictionCharacters(layer, doc);
  for (let i = 0; i < effect.count; i++) {
    const particle = doc.createElement('span');
    particle.className = `fictionParticle fictionParticle--${effect.kind}`;
    const duration = effect.kind === 'rain' ? 4 + i % 3 : 18 + i % 7 * 3;
    for (const [name, value] of Object.entries({
      x: `${i * 37 % 100}%`, y: `${i * 23 % 90}%`, size: `${18 + i % 5 * 4}px`,
      time: `${duration}s`, delay: `${-i * 3.7}s`,
      drift: `${effect.kind === 'rain' ? -120 : i % 2 ? -100 : 150}px`, turn: `${i % 2 ? -280 : 330}deg`,
    })) particle.style.setProperty(`--float-${name}`, value);
    layer.append(particle);
  }
  doc.body.prepend(layer);
}
