/** Chrome ปฏิเสธการแก้แท็บชั่วคราวขณะผู้ใช้กำลังลากแท็บ */
export function tabEditBusy(error) {
  return /Tabs cannot be edited right now|user may be dragging a tab/i.test(String(error?.message || error || ''));
}

/** รอให้ Chrome ปล่อยแท็บ แล้วค่อยเปลี่ยน URL หรือเลือกแท็บ โดยไม่วนลองเป็นนาที */
export async function updateTabWhenReady(tabId, changes, {
  update = (id, next) => chrome.tabs.update(id, next),
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
} = {}) {
  const delays = [300, 700, 1500];
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      return { ok: true, tab: await update(tabId, changes) };
    } catch (error) {
      if (!tabEditBusy(error)) throw error;
      if (attempt === delays.length) {
        return {
          ok: false,
          code: 'tab_busy',
          error: 'Chrome ยังไม่อนุญาตให้จัดแท็บ Flow (อาจกำลังลากแท็บอยู่) — ปล่อยแท็บแล้วกดเริ่มสร้างภาพต่อ',
        };
      }
      await wait(delays[attempt]);
    }
  }
}
