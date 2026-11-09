/**
 * บัญชี Google ของแท็บ Flow — อ่านจาก URL
 *
 * บัญชีแรกไม่มีอะไรใน path · บัญชีที่สองขึ้นไปอยู่ใน path เป็น /u/1/ /u/2/ …
 * (ตรวจกับหน้าจริง พ.ย. 2026: เปิด ?authuser=1 แล้ว Flow พาไป /u/1/ และลิงก์ project ทุกอันเป็น /u/1/project/…)
 *
 * ผู้ใช้: "ลองสลับบัญชีแล้ว แต่ไม่สลับให้" — เดิมตอนเริ่มสร้างภาพ ระบบพาแท็บไป project ที่จดไว้ของเล่ม
 * (ของบัญชีเก่า ไม่มี /u/1/) หรือไปหน้าแรก https://flow.google.com/ ซึ่งก็คือบัญชีแรก แท็บจึงเด้งกลับบัญชีเดิมทุกครั้ง
 */
const FLOW_ORIGIN = 'https://flow.google.com';

/** '0' = บัญชีแรก · '1' = บัญชีที่สอง ฯลฯ */
export const flowAccount = (url = '') => /^https:\/\/flow\.google\.com\/u\/(\d+)(?:[/?#]|$)/.exec(String(url || ''))?.[1] || '0';

export const flowHome = (account = '0') => (String(account) === '0' ? `${FLOW_ORIGIN}/` : `${FLOW_ORIGIN}/u/${account}/`);

export const flowProjectId = (url) => /flow\.google\.com\/(?:u\/\d+\/)?project\/([^/?#]+)/i.exec(String(url || ''))?.[1] || String(url || '');

/**
 * ตอนเริ่มสร้างภาพ: แท็บ Flow ควรไปไหน
 * here = URL ของแท็บตอนนี้ · want = project ของเล่มที่จดไว้ (ว่างได้)
 *
 * บัญชีที่แท็บแสดงอยู่ชนะเสมอ — ผู้ใช้สลับบัญชีในแท็บแล้ว project เดิมเป็นของบัญชีเก่า
 * จึงเปิด project ใหม่ในบัญชีนี้ (ภาพที่ทำเสร็จแล้วอยู่ในเล่ม ไม่ต้องอยู่ใน project เดิม)
 * คืน { go: URL ที่ต้องพาไป หรือ '' = อยู่ที่เดิม, switched: บัญชีต่างจาก project ที่จดไว้ }
 */
export function flowPrepareTarget(here = '', want = '') {
  here = String(here || '');
  want = String(want || '');
  const account = flowAccount(here);
  if (want && flowAccount(want) === account) return { go: here.startsWith(want) ? '' : want, switched: false };
  return { go: /\/project\//.test(here) ? flowHome(account) : '', switched: !!want };
}
