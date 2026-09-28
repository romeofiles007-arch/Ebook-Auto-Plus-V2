/**
 * สูตรภาพตามประเภทหนังสือ — ใช้กับโหมด Google Flow เท่านั้น
 * (ผู้เรียกทุกตัวอยู่ในเส้นทาง Flow: flowNovelCoverPrompt · characterSheetPrompt · flowFictionFigurePrompt · ปกสารคดีใน imagesViaFlow)
 *
 * ที่มา
 * - แนวทาง prompt ของ Google (Nano Banana): เรียง subject → action → location → composition → style,
 *   บอกแสง/มุมกล้องเป็นคำเฉพาะ, บรรยายสิ่งที่อยากได้แทนสิ่งที่ห้าม, ระบุบทบาทของภาพอ้างอิงแต่ละภาพ
 *   https://cloud.google.com/blog/products/ai-machine-learning/ultimate-prompting-guide-for-nano-banana
 * - ธรรมเนียมปกตามประเภท (สี ภาพ พื้นที่ชื่อเรื่อง) ที่ผู้อ่านใช้ "จำแนว" จากภาพย่อ
 *   https://www.creativindiecovers.com/how-to-design-a-thriller-mystery-book-cover/
 *   https://www.creativindiecovers.com/how-to-design-a-fantasy-book-cover/
 *   https://reedsy.com/resources/book-covers/self-help/
 *
 * แต่ละสูตร
 *   style       — สไตล์ภาพของทั้งเล่ม (นิยาย: ปก ภาพต้นแบบตัวละคร ภาพในเล่มใช้ชุดเดียวกัน)
 *   cover       — องค์ประกอบปกหน้า
 *   light       — แสงและสี
 *   titleSpace  — พื้นที่ว่างสำหรับชื่อเรื่อง (ระบบเรียงพิมพ์ทับทีหลัง)
 *   back        — ปกหลัง
 */

export const FLOW_GENRES = [
  // ---------- นิยาย ----------
  {
    key: 'horror',
    fiction: true,
    match: /สยองขวัญ|ผี|หลอน|horror|ghost|haunt/i,
    style: 'dark atmospheric digital painting, semi-realistic, heavy shadows, subtle film grain',
    cover: 'one eerie focal point — a figure half-lost in darkness, a doorway, a reflection that is wrong — small against a large empty dark space',
    light: 'desaturated cold greens and greys with one sickly warm light source; deep blacks',
    titleSpace: 'the whole top half is dark empty space for a large title',
    back: 'the same haunted place, empty, with a faint unsettling detail; calm dark middle area',
  },
  {
    key: 'thriller',
    fiction: true,
    match: /ระทึก|สืบสวน|ฆาตกรรม|อาชญากรรม|ลึกลับ|ปริศนา|สายลับ|thriller|crime|suspense|mystery|detective|spy/i,
    style: 'cinematic semi-realistic digital painting, film-noir lighting, crisp detail',
    cover: 'a lone figure seen from behind or in silhouette, small in the frame, or one symbolic clue object; a vast moody setting (night city, rain-soaked street, fog) that implies danger without showing it',
    light: 'cold blues and dark greys with a single amber or red accent light; strong contrast',
    titleSpace: 'the top half stays open atmospheric sky or dark wall for a big bold title',
    back: 'an empty street, window or corridor from the same night; calm dark middle area',
  },
  {
    key: 'fantasy',
    fiction: true,
    match: /แฟนตาซี|เวทมนตร์|เวทย์|มังกร|ต่างโลก|จอมเวท|romantasy|fantasy|magic|dragon|isekai/i,
    style: 'richly detailed fantasy digital painting, epic and luminous, fine texture in costumes and materials',
    cover: 'the hero or one story-specific magical relic with dramatic scale contrast against a vast world (castle, sky, forest); one specific symbol from the story, not a generic hooded figure',
    light: 'deep saturated jewel tones (violet, teal, gold) with one dominant magical light source and glowing particles',
    titleSpace: 'open luminous sky across the top third for an ornate title',
    back: 'a wide view of the same world at a quieter moment; calm soft middle area',
  },
  {
    key: 'scifi',
    fiction: true,
    match: /ไซไฟ|อนาคต|อวกาศ|หุ่นยนต์|sci-?fi|science fiction|space|cyberpunk|robot/i,
    style: 'cinematic sci-fi concept-art painting, clean hard-surface detail',
    cover: 'a small human figure facing an enormous structure, ship or city; strong perspective and scale',
    light: 'cool blues and cyan with neon magenta or orange accents, volumetric light beams',
    titleSpace: 'dark open space or sky across the top third for the title',
    back: 'the same world seen from far away, quiet; calm middle area',
  },
  {
    key: 'adventure',
    fiction: true,
    match: /ผจญภัย|เดินทาง|ล่าสมบัติ|adventure|quest|treasure/i,
    style: 'vivid cinematic adventure illustration, painterly, sweeping and energetic',
    cover: 'the hero in motion at the edge of a vast landscape or on the brink of the journey, small against huge scale, the destination visible far away',
    light: 'bold warm sunlight against deep blue shadows, clear atmosphere, dust or spray catching the light',
    titleSpace: 'open sky across the top third for a bold title',
    back: 'the path or landscape ahead, empty; calm middle area',
  },
  {
    key: 'historical',
    fiction: true,
    match: /ย้อนยุค|พีเรียด|ประวัติศาสตร์|โบราณ|ราชวงศ์|historical|period|regency|ancient/i,
    style: 'classical painterly illustration with visible brushwork, period-accurate costume and architecture',
    cover: 'the main characters in period costume in a meaningful place of the era, waist-up, an intimate or fateful moment',
    light: 'warm antique palette — gold, deep red, ivory — soft window or candle light',
    titleSpace: 'calm painted sky or wall in the top third for an elegant title',
    back: 'an object or place of the era (a letter, a courtyard, lanterns); calm middle area',
  },
  {
    key: 'children',
    fiction: true,
    match: /เด็ก|นิทาน|เยาวชน|children|kids|picture book|fairy tale/i,
    style: 'bright friendly picture-book illustration, soft rounded shapes, gentle textures',
    cover: 'the young hero mid-adventure with a companion, full body, expressive and joyful',
    light: 'clear cheerful colours, soft daylight',
    titleSpace: 'open sky across the top third for a big playful title',
    back: 'a small cheerful detail from the story on a soft plain background',
  },
  {
    key: 'romcom',
    fiction: true,
    match: /คอมเมดี้|ตลก|rom-?com|comedy/i,
    style: 'modern flat-colour romance illustration, clean lines, playful and bright',
    cover: 'the couple full body in a funny, charged moment from the story, simple bold background shape',
    light: 'bright saturated pastels with one bold accent colour',
    titleSpace: 'a clean flat area across the top third for the title',
    back: 'a small playful object from the story on a flat colour background',
  },
  {
    key: 'romance',
    fiction: true,
    match: /โรแมนซ์|โรแมนติก|ความรัก|รักหวาน|วาย|ยูริ|\bbl\b|\bgl\b|romance|romantic|love/i,
    style: 'modern romance illustration in a polished webtoon / graphic-novel style: clean confident linework, soft painterly shading, luminous skin tones, expressive eyes',
    cover: 'the couple large and close, waist-up, positioned centre-lower, caught in the story\'s central feeling — a charged glance, a near-touch, one turning away',
    light: 'warm sunset, coral, rose and gold tones with a soft glow and rim light on the faces; city bokeh or open sky behind',
    titleSpace: 'open softly lit sky or bokeh across the top third for the title',
    back: 'an evocative quiet detail of their world (two cups, a rainy window, a street at dusk); calm middle area',
  },
  // ผู้ใช้ขอ: นิยายสำหรับผู้สูงอายุ — ภาพอบอุ่น ชัด อ่านง่าย ตัวละครหลักเป็นผู้สูงวัยจริง ไม่ทำให้ดูหนุ่มสาว
  {
    key: 'senior',
    fiction: true,
    match: /ผู้สูงอายุ|สูงวัย|วัยเกษียณ|คุณตา|คุณยาย|senior|elderly|retire/i,
    style: 'warm, gentle hand-painted storybook illustration with clear shapes, soft texture and natural colours; older characters drawn with dignity, real age and kind expressions',
    cover: 'the older main character (or an older couple / friends) large and close, in a warm meaningful everyday place from the story, sharing a heartfelt moment — a smile, a held hand, a remembered photo',
    light: 'soft warm afternoon or morning light, gentle high-key colours, clear contrast so faces read easily',
    titleSpace: 'calm sky, wall or soft blur across the top third for a large, easy-to-read title',
    back: 'a cosy quiet detail of their world (a garden bench, tea cups, an old photo album); calm middle area',
  },
  {
    key: 'drama',
    fiction: true,
    match: /ดราม่า|ชีวิต|ครอบครัว|ฟีลกู๊ด|drama|slice of life|family|literary/i,
    style: 'soft cinematic painterly illustration, natural and intimate, gentle texture',
    cover: 'the main character (or two) in a quiet, meaningful everyday place, a moment of feeling shown through posture and light',
    light: 'soft natural light — golden hour or window light — harmonious muted-warm palette with one clear highlight',
    titleSpace: 'calm sky, wall or soft blur across the top third for the title',
    back: 'the same place, empty and quiet; calm middle area',
  },
  // ---------- สารคดี ----------
  {
    key: 'selfhelp',
    fiction: false,
    match: /พัฒนาตัวเอง|จิตวิทยา|แรงบันดาลใจ|นิสัย|ความสุข|self-?help|habit|mindset|motivation|psychology/i,
    style: 'clean modern conceptual illustration, bold simple shapes',
    cover: 'ONE simple symbolic object or gesture that captures the book\'s single idea, centred on a strong plain colour background with lots of empty space',
    light: 'bright clean background colour with high contrast; one accent colour',
    titleSpace: 'the top half is plain colour for a very large title',
    back: 'the same background colour with a tiny echo of the symbol; plain middle area',
  },
  {
    key: 'business',
    fiction: false,
    match: /ธุรกิจ|การเงิน|ลงทุน|การตลาด|เศรษฐ|ผู้นำ|business|finance|invest|marketing|leadership|startup/i,
    style: 'sharp modern editorial illustration, confident geometric forms, premium finish',
    cover: 'one strong visual metaphor for the book\'s promise (growth, direction, leverage) built from a real object, centred with generous space',
    light: 'deep navy, charcoal or white base with gold or one vivid accent; crisp even light',
    titleSpace: 'the top half is clean negative space for a bold title',
    back: 'a minimal continuation of the metaphor; plain middle area',
  },
  {
    key: 'spiritual',
    fiction: false,
    match: /ธรรมะ|สมาธิ|ศาสนา|จิตใจ|เยียวยา|ความเศร้า|spiritual|meditation|healing|grief|wellness|mindful/i,
    style: 'soft watercolour-and-gouache painting, gentle textures, calm and warm',
    cover: 'a quiet natural motif (a single leaf, still water, soft light through a window) with lots of breathing space',
    light: 'gentle warm pastels, soft diffuse light',
    titleSpace: 'soft open wash across the top third for the title',
    back: 'the same gentle wash with a small motif; calm middle area',
  },
  {
    key: 'food',
    fiction: false,
    match: /อาหาร|ทำอาหาร|สูตร|เบเกอรี่|ขนม|cook|recipe|food|baking/i,
    style: 'appetising bright food photography look, overhead or 45° angle, natural textures',
    cover: 'one hero dish or ingredient beautifully styled on a real surface, fresh and inviting',
    light: 'soft bright daylight from the side, fresh natural colours',
    titleSpace: 'clean surface or background across the top third for the title',
    back: 'a few ingredients on the same surface; clear middle area',
  },
  {
    key: 'explainer',
    fiction: false,
    match: /อธิบาย|ตำรา|วิชาการ|กรณีศึกษา|explainer|textbook|case study|science/i,
    style: 'clean modern conceptual illustration, precise and intelligent, subtle texture',
    cover: 'one clever visual that makes the core idea of the book instantly understandable — a real object or simple scene that reveals how the thing works',
    light: 'calm confident palette (deep blue, white, one warm accent), clear even light',
    titleSpace: 'the top half is clean space for the title',
    back: 'a small detail of the same visual on the same background; plain middle area',
  },
  {
    key: 'howto',
    fiction: false,
    match: /คู่มือ|วิธี|สอน|เทคนิค|เริ่มต้น|how to|guide|beginner|tutorial|handbook/i,
    style: 'clean friendly modern illustration, clear readable forms',
    cover: 'hands actually doing the core skill of the book with the key tool, and the visible good result',
    light: 'bright even light, fresh clear colours with one accent',
    titleSpace: 'plain background across the top third for the title',
    back: 'the tool or result alone on the same background; plain middle area',
  },
];

/** ค่าในช่อง "ประเภท" ของหน้าตั้งค่า (studio.html #fictionGenre / #genre) → สูตร */
const FICTION_SELECT = { romance: 'romance', fantasy: 'fantasy', scifi: 'scifi', mystery: 'thriller', thriller: 'thriller', horror: 'horror', drama: 'drama', adventure: 'adventure', comingofage: 'drama', literary: 'drama', senior: 'senior' };
const NONFICTION_SELECT = { 'how-to': 'howto', workbook: 'howto', self: 'selfhelp', business: 'business', explainer: 'explainer', textbook: 'explainer', case: 'explainer' };
// หัวเรื่องบอกชัดกว่าช่องประเภทกว้าง ๆ (หนังสือทำอาหารที่เลือก "How-to" ควรได้ปกแบบหนังสืออาหาร)
const SUBJECT_FIRST = ['food', 'spiritual'];
// ประเภทย่อยที่ละเอียดกว่าช่องที่เลือก (โรแมนติก → โรมคอม/ย้อนยุค)
const REFINES = { romance: ['romcom', 'historical'], drama: ['historical', 'children'] };

/**
 * สูตรของเล่มนี้ · ไม่เข้าสูตรไหน = null
 * ช่องนิยายตั้งต้นเป็น "แฟนตาซี" — ถ้าเรื่องจริงบอกประเภทอื่นชัด ๆ (โครงเรื่อง/หัวเรื่อง) เชื่อเรื่องจริง
 */
export function flowGenreFor(book = {}) {
  const fiction = book.contentMode === 'fiction';
  const pool = FLOW_GENRES.filter((g) => g.fiction === fiction);
  const byKey = (k) => pool.find((g) => g.key === k) || null;
  const free = (v, map) => (v && !(v in map) ? v : '');
  const loose = [free(book.fictionGenre, FICTION_SELECT), free(book.genre, NONFICTION_SELECT), book.genreBrief, book.topic, book.title, book.outline?.title, book.outline?.thesis].filter(Boolean).join(' ');
  const fromText = pool.find((g) => g.match.test(loose)) || null;
  const selected = byKey((fiction ? FICTION_SELECT[book.fictionGenre] : NONFICTION_SELECT[book.genre]) || '');
  if (!fiction) {
    if (fromText && SUBJECT_FIRST.includes(fromText.key)) return fromText;
    return selected || fromText;
  }
  if (!selected) return fromText;
  if (selected.key === 'fantasy' && fromText && fromText.key !== 'fantasy' && !selected.match.test(loose)) return fromText;
  if (fromText && (REFINES[selected.key] || []).includes(fromText.key)) return fromText;
  return selected;
}
