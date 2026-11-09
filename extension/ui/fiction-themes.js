import { syncChineseTheme } from './chinese-theme.js';
import { syncFictionAtmosphere } from './fiction-atmosphere.js';

/** Only the explicit fiction selection chooses a world; book keywords never change the UI. */
export const FICTION_THEMES = Object.freeze({
  romance: { label: 'โรแมนติก', sceneLabel: 'ทะเลสดใสและสายลมริมฝั่ง · โรแมนติก' },
  fantasy: { label: 'แฟนตาซี', sceneLabel: 'ป่าเวทมนตร์และปราสาทลอยฟ้า · แฟนตาซี' },
  scifi: { label: 'ไซไฟ', sceneLabel: 'หอดูดาวบนสถานีอวกาศ · ไซไฟ' },
  mystery: { label: 'สืบสวน', sceneLabel: 'ห้องนักสืบยามฝนพรำ · สืบสวน' },
  thriller: { label: 'ทริลเลอร์', sceneLabel: 'เมืองกลางสายฝนยามเที่ยงคืน · ทริลเลอร์' },
  horror: { label: 'สยองขวัญ', sceneLabel: 'คฤหาสน์ร้างใต้แสงจันทร์ · สยองขวัญ' },
  drama: { label: 'ดราม่า', sceneLabel: 'ความทรงจำข้างหน้าต่างยามเย็น · ดราม่า' },
  adventure: { label: 'ผจญภัย', sceneLabel: 'วิหารกลางป่าและสายน้ำ · ผจญภัย' },
  comingofage: { label: 'Coming of Age', sceneLabel: 'เนินเขาแห่งวันวาน · Coming of Age' },
  literary: { label: 'วรรณกรรมร่วมสมัย', sceneLabel: 'ร้านหนังสือในวันฝนพรำ · วรรณกรรมร่วมสมัย' },
  senior: { label: 'นิยายสำหรับผู้สูงอายุ', sceneLabel: 'ชานบ้านและสวนยามเช้า · นิยายสำหรับผู้สูงอายุ' },
  chinese: { label: 'จีนโบราณ', sceneLabel: 'วังหลวงยามสนธยา · นิยายจีนโบราณ' },
});

export function syncFictionTheme(contentMode, genre, doc = document) {
  const key = contentMode === 'fiction' && Object.hasOwn(FICTION_THEMES, genre) ? genre : '';
  // Palace portraits and petals stay exclusive to Chinese, including when switching directly between genres.
  syncChineseTheme(key === 'chinese', doc);
  syncFictionAtmosphere(key, doc);
  if (key) doc.documentElement.dataset.fictionTheme = key;
  return key ? FICTION_THEMES[key] : null;
}
