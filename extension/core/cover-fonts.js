/** Unmodified Thai faces; each face ships with its own license and source record. */
export const COVER_FONTS = Object.freeze([
  { family:'Charmonman', weight:700, folder:'charmonman', filename:'Charmonman-Bold.ttf', label:'Charmonman — ลายมืออ่อนหวาน' },
  { family:'Chonburi', weight:400, folder:'chonburi', filename:'Chonburi-Regular.ttf', label:'Chonburi — ตัวแสดงหัวเรื่องสง่างาม' },
  { family:'Chakra Petch', weight:700, folder:'chakrapetch', filename:'ChakraPetch-Bold.ttf', label:'Chakra Petch — เหลี่ยมล้ำสมัย' },
  { family:'Pridi', weight:700, folder:'pridi', filename:'Pridi-Bold.ttf', label:'Pridi — มีเชิง หนักแน่น' },
  { family:'Kanit', weight:700, folder:'kanit', filename:'Kanit-Bold.ttf', label:'Kanit — หนา กระชับ ร่วมสมัย' },
  { family:'Pattaya', weight:400, folder:'pattaya', filename:'Pattaya-Regular.ttf', label:'Pattaya — โค้งต่อเนื่อง มีอารมณ์' },
  { family:'Niramit', weight:700, folder:'niramit', filename:'Niramit-Bold.ttf', label:'Niramit — แข็งแรง มีชีวิตชีวา' },
  { family:'Sriracha', weight:400, folder:'sriracha', filename:'Sriracha-Regular.ttf', label:'Sriracha — ลายมือเป็นกันเอง' },
  { family:'Mitr', weight:600, folder:'mitr', filename:'Mitr-SemiBold.ttf', label:'Mitr — อบอุ่น อ่านง่าย' },
  { family:'Charm', weight:700, folder:'charm', filename:'Charm-Bold.ttf', label:'Charm — ลายเส้นไทยเชิงพู่กัน' },
  { family:'SP-Kangfu', weight:400, sizeScale:1.5, filename:'SP-Kangfu.ttf', label:'SP-Kangfu — พู่กันจีน ลายฝีแปรง', licenseId:'f0nt.com', license:'fonts/cover/LICENSE-SP-Kangfu.txt' },
].map((font)=>Object.freeze({...font,sizeScale:font.sizeScale||1,file:`fonts/cover/${font.filename}`,licenseId:font.licenseId||'OFL-1.1',license:font.license||`fonts/cover/OFL-${font.folder}.txt`})));

export const COVER_GENRE_TYPE = Object.freeze({
  romance: {family:'Charmonman',label:'โรแมนติก',treatment:'graceful flowing Thai calligraphy, airy composition and soft pearl or warm ink accents, tender rather than heavy metallic blockbuster lettering'},
  fantasy: {family:'Chonburi',label:'แฟนตาซี',treatment:'majestic high-contrast Thai display forms, balanced ornamental flourishes around the title and restrained antique-gold or magical-light accents'},
  scifi: {family:'Chakra Petch',label:'ไซไฟ',treatment:'angular geometric Thai display forms, crisp cut corners and restrained cool light or brushed-metal accents, precise and futuristic'},
  mystery: {family:'Pridi',label:'สืบสวน',treatment:'firm looped Thai slab-serif forms, precise editorial hierarchy and ink-and-parchment contrast, an intriguing evidence-file atmosphere'},
  thriller: {family:'Kanit',label:'ทริลเลอร์',treatment:'compact heavy contemporary Thai display forms, strong light-dark tension and one sharp colour accent, urgent and readable'},
  horror: {family:'Chonburi',label:'สยองขวัญ',treatment:'ominous high-contrast Thai display forms with restrained weathered-ink texture around the edges; preserve the full readable letter interiors, vowels and tone marks'},
  drama: {family:'Pattaya',label:'ดราม่า',treatment:'expressive curved Thai display forms with a warm reflective ink treatment, emotionally intimate and clear'},
  adventure: {family:'Niramit',label:'ผจญภัย',treatment:'bold energetic Thai letterforms with expedition-poster confidence, warm stone or bronze accents and a strong adventurous silhouette'},
  comingofage: {family:'Sriracha',label:'Coming of Age',treatment:'natural handwritten Thai forms with youthful diary-like warmth, an open hopeful composition and fresh light accents'},
  literary: {family:'Pridi',label:'วรรณกรรมร่วมสมัย',treatment:'refined looped Thai slab-serif forms, restrained editorial composition and honest ink texture, quiet confidence without decorative clutter'},
  senior: {family:'Mitr',label:'นิยายสำหรับผู้สูงอายุ',treatment:'warm generous rounded Thai forms, clear loops and comfortable spacing, calm high contrast and an easily recognisable large title'},
  chinese: {family:'SP-Kangfu',label:'จีนโบราณ',treatment:'expressive Thai lettering written with a Chinese ink brush: decisive thick-to-thin strokes, tapered sweeping terminals and natural dry-brush texture; restrained gold ink, jade and ivory accents suited to an ancient Chinese novel; preserve readable Thai letters, vowels and tone marks, not Chinese characters'},
});

const findFont = (family)=>COVER_FONTS.find((font)=>font.family===family);

export function resolveCoverTypography(book = {}) {
  if ((book.language || 'th') !== 'th') return {family:book.typography?.headFont||book.typography?.bodyFont||'IBM Plex Sans Thai',weight:700,sizeScale:1,treatment:'',label:''};
  const genre = book.contentMode === 'fiction' && Object.hasOwn(COVER_GENRE_TYPE,book.fictionGenre) ? COVER_GENRE_TYPE[book.fictionGenre] : null;
  const generalFamily = book.contentMode === 'items' ? 'Charmonman' : book.genre === 'textbook' ? 'Pridi' : book.genre === 'self' ? 'Mitr' : book.genre === 'case' ? 'Niramit' : 'Kanit';
  const font = findFont(book.typography?.coverFont) || findFont(genre?.family || generalFamily);
  return {...font,label:genre?.label||'หนังสือทั่วไป',treatment:genre?.treatment||'clear premium Thai book-cover lettering with strong hierarchy and readable Thai loops and marks'};
}

/** An image generator receives art direction; real font files are used by the native overlay path. */
export function coverTypographyRule(book = {}) {
  if ((book.language || 'th') !== 'th') return '';
  const font=resolveCoverTypography(book);
  return `THAI GENRE COVER LETTERING — ${font.label}. Typeface reference: ${font.family}, weight ${font.weight}. Title treatment: ${font.treatment}. This specific letterform direction overrides a generic request to use the same heavy cinematic face for every genre. Preserve every Thai consonant, leading/trailing vowel and stacked tone mark; never stretch, scatter or crop marks to imitate another writing system. Keep subtitle and author in clean readable Thai companion lettering such as Sarabun. The typeface name and these style notes are instructions only: never print them on the cover.`;
}
