/** Each genre supplies a two-column transparent sprite sheet through its CSS palette. */
export function appendFictionCharacters(layer, doc = document) {
  for (const side of ['first', 'second']) {
    const portrait = doc.createElement('div');
    portrait.className = `fictionCharacter fictionCharacter--${side}`;
    layer.append(portrait);
  }
}
