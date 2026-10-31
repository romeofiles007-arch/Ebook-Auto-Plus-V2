/**
 * อัปเดตส่วนขยายจากในตัวเอง — กดปุ่มเดียว ไม่ต้องดาวน์โหลด ZIP แล้วแตกไฟล์ทับเอง
 *
 * ผู้ใช้: "ทำเป็นแบบกด update หน้า extension ให้ด้วย"
 * ส่วนขยายแบบ Load unpacked เขียนไฟล์ของตัวเองตรง ๆ ไม่ได้ แต่ผู้ใช้อนุญาตโฟลเดอร์ส่วนขยายให้ได้หนึ่งครั้ง
 * (File System Access แบบเดียวกับปุ่ม "เลือกโฟลเดอร์" ของ Studio) แล้วเราเขียนไฟล์ใหม่ลงไปเอง
 * จากนั้น chrome.runtime.reload() อ่านไฟล์ชุดใหม่จากดิสก์ทันที
 *
 * ดึงเฉพาะไฟล์ที่เปลี่ยน: เทียบลายนิ้วมือแบบ git (SHA-1 ของ "blob <ขนาด>\0" + เนื้อไฟล์) กับรายการไฟล์ของ GitHub
 * ไฟล์ที่ดาวน์โหลดต้องได้ลายนิ้วมือตรงกับ GitHub ก่อนเขียน — ไฟล์เสียระหว่างทางจะไม่ถูกเขียนทับของเดิม
 * manifest.json เขียนเป็นไฟล์สุดท้าย: อัปเดตที่ค้างครึ่งทางจะไม่อ้างว่าเป็นเวอร์ชันใหม่ และกดซ้ำแล้วทำต่อได้
 * ทั้งสองที่อยู่ (api.github.com · raw.githubusercontent.com) ตอบ CORS * จึงไม่ต้องขอสิทธิ์โฮสต์เพิ่ม
 */
import { REPO, BRANCH } from './update-check.js';

export const TREE_URL = `https://api.github.com/repos/${REPO}/git/trees/${BRANCH}?recursive=1`;
export const rawUrl = (path) =>
  `https://raw.githubusercontent.com/${REPO}/${BRANCH}/${String(path).split('/').map(encodeURIComponent).join('/')}`;

const PREFIX = 'extension/';
/** ของผู้ใช้ที่อยู่ในโฟลเดอร์ส่วนขยาย — ไม่ใช่ซอร์สโค้ด ห้ามแตะ (ตรงกับ .gitignore) */
const USER_DATA = ['Ebook Projects/'];

export async function gitBlobSha(bytes) {
  const head = new TextEncoder().encode(`blob ${bytes.length}\0`);
  const all = new Uint8Array(head.length + bytes.length);
  all.set(head);
  all.set(bytes, head.length);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-1', all));
  return [...digest].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** ไฟล์ของโฟลเดอร์ extension จากรายการไฟล์ของ GitHub — path ไม่มีคำนำหน้า extension/ */
export function extensionEntries(treeJson) {
  return (treeJson?.tree || [])
    .filter((e) => e.type === 'blob' && e.path.startsWith(PREFIX))
    .map((e) => ({ path: e.path.slice(PREFIX.length), sha: e.sha, size: e.size }))
    .filter((e) => e.path && !USER_DATA.some((p) => e.path.startsWith(p)));
}

const notFound = (e) => e?.name === 'NotFoundError' || e?.name === 'TypeMismatchError';

async function hasEntry(dir, name) {
  for await (const key of dir.keys()) if (key === name) return true;
  return false;
}

async function readManifest(dir) {
  try {
    const file = await (await dir.getFileHandle('manifest.json')).getFile();
    return JSON.parse(new TextDecoder().decode(new Uint8Array(await file.arrayBuffer())));
  } catch {
    return null;
  }
}

/**
 * โฟลเดอร์ที่ผู้ใช้เลือกต้องเป็นโฟลเดอร์ของ Ebook Plus จริง (มี manifest.json ชื่อเดียวกับตัวที่รันอยู่)
 * เลือกโฟลเดอร์แม่ที่แตกจาก ZIP (มี extension/ อยู่ข้างใน) ก็ใช้ได้ · โฟลเดอร์ซอร์สที่มี .git ปฏิเสธ
 * เพราะเครื่องพัฒนาอาจมีงานที่ยังไม่ commit ซึ่งการเขียนทับจะลบทิ้งเงียบ ๆ
 */
export async function resolveExtensionDir(dir, expectedName) {
  if (await hasEntry(dir, '.git'))
    throw new Error('โฟลเดอร์นี้เป็นซอร์สโค้ดที่ใช้ git — อัปเดตด้วย git pull แทน ปุ่มนี้สำหรับเครื่องที่ติดตั้งจาก ZIP');
  let m = await readManifest(dir);
  if (!m) {
    try {
      const inner = await dir.getDirectoryHandle('extension');
      if ((await readManifest(inner))?.name === expectedName) return inner;
    } catch (e) {
      if (!notFound(e)) throw e;
    }
  }
  if (m?.name !== expectedName)
    throw new Error(`โฟลเดอร์ที่เลือกไม่ใช่โฟลเดอร์ของ ${expectedName} — เลือกโฟลเดอร์ที่ใช้ตอน Load unpacked (มีไฟล์ manifest.json อยู่ข้างใน)`);
  return dir;
}

async function fileAt(root, path, { create = false } = {}) {
  const parts = path.split('/');
  let dir = root;
  for (const part of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(part, { create });
  return dir.getFileHandle(parts.at(-1), { create });
}

async function localSha(root, entry) {
  try {
    const file = await (await fileAt(root, entry.path)).getFile();
    // ขนาดไม่เท่า = เปลี่ยนแน่นอน ไม่ต้องอ่านทั้งไฟล์ (ไฟล์ใหญ่สุดราว 27 MB)
    if (typeof entry.size === 'number' && file.size !== entry.size) return '';
    return gitBlobSha(new Uint8Array(await file.arrayBuffer()));
  } catch (e) {
    if (notFound(e)) return '';
    throw e;
  }
}

/**
 * @returns {Promise<{changed:number,total:number,files:string[]}>}
 * onProgress(ข้อความ) ใช้บอกความคืบหน้าบนจอ
 */
export async function applyUpdate({ dir, fetcher = fetch, onProgress = () => {} }) {
  onProgress('กำลังอ่านรายการไฟล์จาก GitHub...');
  const res = await fetcher(`${TREE_URL}&t=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`อ่านรายการไฟล์จาก GitHub ไม่ได้ (HTTP ${res.status}) — ลองใหม่ภายหลัง`);
  const tree = await res.json();
  if (tree.truncated) throw new Error('รายการไฟล์บน GitHub ยาวเกินกว่าจะอ่านครบ — ใช้วิธีดาวน์โหลด ZIP แทน');
  const entries = extensionEntries(tree);
  if (!entries.some((e) => e.path === 'manifest.json')) throw new Error('ไม่พบ manifest.json บน GitHub — ยกเลิกการอัปเดต');

  onProgress(`กำลังเทียบไฟล์ ${entries.length} ไฟล์...`);
  const changed = [];
  for (const e of entries) if ((await localSha(dir, e)) !== e.sha) changed.push(e);
  // manifest ท้ายสุดเสมอ — ดูหัวไฟล์
  changed.sort((a, b) => (a.path === 'manifest.json') - (b.path === 'manifest.json'));

  // ดาวน์โหลดและตรวจครบทุกไฟล์ก่อน แล้วค่อยเขียน — ไฟล์ไหนเสีย จะไม่มีอะไรถูกเขียนทับเลย
  const ready = [];
  for (let i = 0; i < changed.length; i++) {
    const e = changed[i];
    onProgress(`กำลังดาวน์โหลด ${i + 1}/${changed.length} · ${e.path}`);
    const r = await fetcher(`${rawUrl(PREFIX + e.path)}?t=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) throw new Error(`ดาวน์โหลด ${e.path} ไม่ได้ (HTTP ${r.status}) — ยังไม่ได้เขียนทับอะไร`);
    const bytes = new Uint8Array(await r.arrayBuffer());
    if ((await gitBlobSha(bytes)) !== e.sha)
      throw new Error(`ไฟล์ ${e.path} ที่ดาวน์โหลดมาไม่ตรงกับบน GitHub (อาจกำลังอัปโหลดอยู่) — ยังไม่ได้เขียนทับอะไร ลองใหม่อีกครั้ง`);
    ready.push({ e, bytes });
  }

  for (let i = 0; i < ready.length; i++) {
    const { e, bytes } = ready[i];
    onProgress(`กำลังเขียนไฟล์ ${i + 1}/${ready.length} · ${e.path}`);
    const w = await (await fileAt(dir, e.path, { create: true })).createWritable();
    await w.write(bytes);
    await w.close();
  }
  return { changed: ready.length, total: entries.length, files: ready.map((x) => x.e.path) };
}
