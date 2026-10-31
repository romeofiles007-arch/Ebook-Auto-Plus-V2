/**
 * ตรวจว่ามีเวอร์ชันใหม่บน GitHub หรือยัง — ตรวจแล้วแจ้งเท่านั้น ไม่เขียนทับไฟล์
 *
 * ผู้ใช้: "ทำปุ่ม update version ได้ไหม คือจะวิ่งไปตรวจสอบในลิ้ง git" → เลือกแบบตรวจแล้วแจ้ง
 * ส่วนขยายแบบ Load unpacked เขียนทับไฟล์ของตัวเองไม่ได้ ลูกค้าจึงต้องดาวน์โหลดแล้วแตกไฟล์ทับเอง
 *
 * อ่าน manifest.json บน branch master ผ่าน raw.githubusercontent.com ซึ่งตอบ Access-Control-Allow-Origin: *
 * จึงไม่ต้องขอสิทธิ์โฮสต์เพิ่ม และ repo ต้องเป็นสาธารณะ (private ต้องมี token ซึ่งไม่ควรฝังในส่วนขยาย)
 */

export const REPO = 'romeofiles007-arch/Ebook-Auto-Plus-V2';
export const BRANCH = 'master';
export const REMOTE_MANIFEST = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/extension/manifest.json`;
export const DOWNLOAD_ZIP = `https://github.com/${REPO}/archive/refs/heads/${BRANCH}.zip`;
export const CHANGES_URL = `https://github.com/${REPO}/commits/${BRANCH}`;

/** เทียบเลขเวอร์ชันแบบ Chrome (ตัวเลขคั่นจุด สูงสุดสี่ช่อง) — คืน 1 ถ้า a ใหม่กว่า, -1 ถ้าเก่ากว่า, 0 ถ้าเท่ากัน */
export function compareVersions(a, b) {
  const pa = String(a || '0').split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b || '0').split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}

/**
 * คืน { current, latest, newer, latestName } หรือโยนข้อผิดพลาดเป็นภาษาคน
 * ตั้งเวลา 10 วินาที — เน็ตช้าหรือ GitHub ไม่ตอบต้องไม่ทำให้หน้า Studio ค้าง
 */
export async function checkForUpdate(current, fetcher = fetch) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  let remote;
  try {
    // ใส่เวลาต่อท้ายกันแคชของเบราว์เซอร์ — GitHub เองแคช 5 นาทีอยู่แล้ว
    const res = await fetcher(`${REMOTE_MANIFEST}?t=${Date.now()}`, { cache: 'no-store', signal: controller.signal });
    if (!res.ok) throw new Error(`GitHub ตอบ HTTP ${res.status}`);
    remote = await res.json();
  } catch (e) {
    if (e?.name === 'AbortError') throw new Error('GitHub ไม่ตอบภายใน 10 วินาที — ลองใหม่ภายหลัง');
    throw new Error(`ตรวจเวอร์ชันไม่ได้ (${e?.message || e})`);
  } finally {
    clearTimeout(timer);
  }
  const latest = String(remote?.version || '');
  if (!/^\d+(\.\d+){0,3}$/.test(latest)) throw new Error('ไฟล์เวอร์ชันบน GitHub อ่านไม่ออก');
  return { current, latest, newer: compareVersions(latest, current) > 0, latestName: String(remote.version_name || latest) };
}

/**
 * "มีอะไรใหม่" บนแบนเนอร์อัปเดต (แบบเดียวกับโปรเจกต์ Youtube) — หัวข้อ commit ล่าสุดที่แตะโฟลเดอร์ extension
 * api.github.com ตอบ CORS * ไม่ต้องขอสิทธิ์เพิ่ม · ต่อไม่ได้หรือโดนจำกัดจำนวนครั้ง = รายการว่าง ไม่ทำให้แบนเนอร์พัง
 */
export const COMMITS_URL = `https://api.github.com/repos/${REPO}/commits?sha=${BRANCH}&path=extension&per_page=8`;
export async function recentChanges(fetcher = fetch) {
  try {
    const res = await fetcher(COMMITS_URL, { cache: 'no-store' });
    if (!res.ok) return [];
    const list = await res.json();
    return (Array.isArray(list) ? list : [])
      .map((c) => ({ subject: String(c?.commit?.message || '').split('\n')[0].trim(), date: String(c?.commit?.committer?.date || '') }))
      .filter((c) => c.subject);
  } catch {
    return [];
  }
}
