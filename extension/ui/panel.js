import './panel-activity.js';
import { checkForUpdate, DOWNLOAD_ZIP, CHANGES_URL } from '../core/update-check.js';
const $ = (id) => document.getElementById(id);
async function openPage(buttonId, type, label, extra = {}) {
  const button = $(buttonId);
  button.disabled = true;
  $('live').textContent = `กำลังเปิด ${label}...`;
  try {
    const result = await chrome.runtime.sendMessage({ type, ...extra });
    if (!result?.ok) throw new Error(result?.error || `เปิด ${label} ไม่สำเร็จ`);
    $('live').textContent = `เปิด ${label} แล้ว`;
  } catch (error) {
    $('live').textContent = `เปิด ${label} ไม่สำเร็จ: ${error.message}`;
  } finally { button.disabled = false; }
}
$('studio').onclick = () => openPage('studio', 'sw.openStudio', 'Studio');
/**
 * เว็บที่เล่มปัจจุบันใช้เขียน — Studio ฝากไว้ใน storage (chatSite) เพราะแผงนี้ไม่รู้ว่าเปิดเล่มไหนอยู่
 * โหมด Gemini เคยขึ้นปุ่ม "เปิด ChatGPT" แล้วกดไปเปิด ChatGPT จริง ทั้งที่งานวิ่งอยู่ใน Gemini (ลูกค้าแจ้งมา)
 */
let chatSite = 'chatgpt';
/**
 * ปุ่ม "เปิด Google Flow" — แสดงเมื่อเล่มวาดภาพด้วย Flow (ไม่รู้ = แสดงไว้ก่อน เพราะเป็นโหมดหลักของ Ebook Plus)
 * กดแล้วดึงแท็บ Flow ที่ใช้อยู่ขึ้นมา หรือเปิดที่ project ของเล่มถ้ายังไม่มีแท็บ
 */
let flowInfo = { imageSource: '', flowProjectUrl: '' };
const chatName = () => (chatSite === 'gemini' ? 'Gemini' : 'ChatGPT');
const paintChatButton = () => {
  $('chat').textContent = `เปิด ${chatName()}`;
  $('flow').hidden = !!flowInfo.imageSource && flowInfo.imageSource !== 'flow';
};
chrome.storage.local.get(['chatSite', 'flowInfo']).then(({ chatSite: s, flowInfo: f }) => {
  chatSite = s === 'gemini' ? 'gemini' : 'chatgpt';
  if (f) flowInfo = f;
  paintChatButton();
}).catch(() => {});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || (!changes.chatSite && !changes.flowInfo)) return;
  if (changes.chatSite) chatSite = changes.chatSite.newValue === 'gemini' ? 'gemini' : 'chatgpt';
  if (changes.flowInfo) flowInfo = changes.flowInfo.newValue || flowInfo;
  paintChatButton();
});
$('chat').onclick = () =>
  openPage('chat', 'sw.focusChat', chatName(), chatSite === 'gemini' ? { site: 'gemini' } : {});
$('flow').onclick = () =>
  openPage('flow', 'sw.focusFlow', 'Google Flow', flowInfo.flowProjectUrl ? { url: flowInfo.flowProjectUrl } : {});

/**
 * สั่งหยุด/ทำต่อจากแผงข้างได้โดยไม่ต้องสลับไปหน้า Studio
 *
 * งานเดินเป็นสิบนาทีและคนเฝ้าอยู่ที่แผงนี้ ไม่ใช่ที่ Studio การจะหยุดสักครั้ง
 * ไม่ควรต้องหาแท็บให้เจอก่อน — ยิ่งตอนที่อยากหยุด มักเป็นตอนที่เห็นอะไรผิดใน log พอดี
 *
 * คำสั่งวิ่งผ่าน service worker ไปหาหน้า Studio ถ้าไม่มีหน้าไหนรับ ต้องบอกตรง ๆ
 * ไม่ใช่ขึ้นว่าส่งแล้วทั้งที่ไม่มีใครฟัง
 */
async function command(buttonId, name, label) {
  const button = $(buttonId);
  button.disabled = true;
  $('live').textContent = `กำลังสั่ง${label}...`;
  try {
    const result = await chrome.runtime.sendMessage({ type: 'ui.command', command: name });
    if (!result?.ok) throw new Error(result?.error || 'ไม่มีหน้า Studio รับคำสั่ง');
    $('live').textContent = `สั่ง${label}แล้ว — ดูผลในบันทึกด้านล่าง`;
  } catch (error) {
    $('live').textContent = `สั่ง${label}ไม่สำเร็จ: ${error.message} · เปิด Studio ค้างไว้แล้วลองใหม่`;
  } finally {
    button.disabled = false;
  }
}
/**
 * ตรวจเวอร์ชันจากแผงข้าง — ตัวเดียวกับปุ่มบนหัว Studio
 * ตรวจเฉพาะตอนกดเอง ส่วนการตรวจเงียบ ๆ ตอนเปิดเป็นหน้าที่ของ Studio ไม่ต้องยิงซ้ำสองที่
 */
$('updateDownload').href = DOWNLOAD_ZIP;
$('updateChanges').href = CHANGES_URL;
$('checkUpdate').onclick = async () => {
  const button = $('checkUpdate');
  const current = chrome.runtime.getManifest?.().version || '0';
  const show = (text, newer = false) => {
    $('updateText').textContent = text;
    $('updateActions').classList.toggle('hidden', !newer);
    $('updateSteps').classList.toggle('hidden', !newer);
    $('updateBox').classList.toggle('newer', newer);
    $('updateBox').classList.remove('hidden');
  };
  button.disabled = true;
  show('กำลังตรวจเวอร์ชันบน GitHub...');
  try {
    const r = await checkForUpdate(current);
    show(r.newer ? `มีเวอร์ชันใหม่ ${r.latest} แล้ว — เครื่องนี้ยังเป็น ${current}` : `ใช้เวอร์ชันล่าสุดอยู่แล้ว (${current})`, r.newer);
  } catch (error) {
    show(error.message);
  } finally {
    button.disabled = false;
  }
};

$('jobStop').onclick = () => command('jobStop', 'stopJob', 'หยุดงาน');
$('jobResume').onclick = () => command('jobResume', 'resumeJob', 'ทำต่อ');
chrome.runtime.onMessage.addListener((m) => {
  if (m?.type === 'ui.status') $('live').textContent = m.message || 'กำลังทำงาน...';
});
