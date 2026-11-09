import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { COVER_FONTS, COVER_GENRE_TYPE, resolveCoverTypography, coverTypographyRule } from './cover-fonts.js';
import { supportedCodepoints } from '../tools/ttf-cmap.mjs';

test('all twelve fiction genres resolve to a Thai face with a genre-specific treatment', () => {
  const expected = { romance:'Charmonman', fantasy:'Chonburi', scifi:'Chakra Petch', mystery:'Pridi', thriller:'Kanit', horror:'Chonburi', drama:'Pattaya', adventure:'Niramit', comingofage:'Sriracha', literary:'Pridi', senior:'Mitr', chinese:'SP-Kangfu' };
  assert.equal(Object.keys(COVER_GENRE_TYPE).length,12);
  for(const [genre,family] of Object.entries(expected)) {
    const book={language:'th',contentMode:'fiction',fictionGenre:genre};
    const choice=resolveCoverTypography(book);
    assert.equal(choice.family,family);
    assert.ok(choice.treatment.length>20);
    assert.match(coverTypographyRule(book),new RegExp(family));
  }
});

test('explicit supported cover face wins; invalid choices fall back to genre, not arbitrary font code', () => {
  const book={language:'th',contentMode:'fiction',fictionGenre:'chinese',typography:{coverFont:'Kanit'}};
  assert.equal(resolveCoverTypography(book).family,'Kanit');
  for(const value of ['auto','unknown','constructor','__proto__','Charm"); #panic("x']) {
    assert.equal(resolveCoverTypography({...book,typography:{coverFont:value}}).family,'SP-Kangfu');
  }
  assert.equal(coverTypographyRule({...book,language:'en'}),'');
  assert.equal(resolveCoverTypography({language:'th',genre:'how-to'}).family,'Kanit');
  assert.equal(resolveCoverTypography({...book,typography:{coverFont:'Charm'}}).family,'Charm');
});

test('bundled cover faces contain Thai letters, vowels and tone marks and carry their individual license', async () => {
  const sample='ชื่อเรื่องภาษาไทย น้ำหนึ่ง ก้าวไกล ฤดูฝัน ๑๒๓๔๕๖๗๘๙๐';
  for(const font of COVER_FONTS) {
    const path=new URL('../'+font.file,import.meta.url);
    const cps=await supportedCodepoints(path);
    for(const char of sample.replace(/\s/g,'')) assert.ok(cps.has(char.codePointAt(0)),`${font.family} misses ${char}`);
    const license=await readFile(new URL('../'+font.license,import.meta.url),'utf8');
    assert.match(license,/Copyright/i);
    if(font.licenseId==='OFL-1.1') {
      assert.match(license,/SIL OPEN FONT LICENSE Version 1\.1/);
      assert.match(license,/PERMISSION & CONDITIONS/);
    } else {
      assert.equal(font.family,'SP-Kangfu');
      assert.match(license,/https:\/\/www\.f0nt\.com\/about\/license\//);
      const binary=await readFile(path);
      assert.equal(createHash('sha256').update(binary).digest('hex'),'5581c13dbabfacfcfda95fec07c0b1427fa4dcee971dda0ff07ddb508a53a790');
    }
  }
});
