/**
 * Service worker = ตัวส่งต่อข้อความอย่างเดียว ห้ามเก็บสถานะสำคัญไว้ที่นี่
 * MV3 ฆ่า service worker เมื่อไม่มีงานราว 30 วินาที สมองจึงอยู่ที่ ui/studio.html
 * ทุกอย่างที่ต้องจำข้ามการตายของ worker เก็บใน chrome.storage.session
 */

const STUDIO_URL = chrome.runtime.getURL('ui/studio.html');
const CHAT_MATCH = ['https://chatgpt.com/*', 'https://chat.openai.com/*'];
let activityWrite = Promise.resolve();

// ---------- state ที่ทนต่อการตายของ worker ----------
const S = {
  async get(k, d = null) {
    const o = await chrome.storage.session.get(k);
    return k in o ? o[k] : d;
  },
  async set(k, v) {
    await chrome.storage.session.set({ [k]: v });
  },
};

// ---------- ไอคอน = เปิดแถบข้าง ----------
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  /**
   * โหลดส่วนขยายใหม่แล้ว หน้า Studio ที่เปิดค้างอยู่ยังรันโค้ดชุดเก่าต่อไป
   *
   * สมองของระบบอยู่ในหน้า Studio ไม่ใช่ใน service worker (MV3 ฆ่า worker ทุกสามสิบวินาที)
   * core/machine.js ถูก import เข้าไปในหน้านั้นตั้งแต่ตอนเปิด การกด "โหลดซ้ำ" ที่หน้าส่วนขยาย
   * เปลี่ยนแต่ไฟล์บนดิสก์ ไม่ได้แตะโมดูลที่โหลดไปแล้วในหน้าที่เปิดอยู่
   *
   * ผลคืออาการที่หลอกที่สุดเท่าที่มีมา: แก้โค้ดแล้ว โหลดซ้ำแล้ว แต่ยังเห็นข้อความผิดพลาด
   * ที่ถูกลบออกไปจากซอร์สแล้ว — เพราะหน้าที่กำลังทำงานอยู่ยังเป็นของเก่าทั้งหน้า
   * ตัวฉีด adapter ฝั่งแท็บ ChatGPT แก้ไปแล้ว เหลือหน้านี้ที่ยังต้องให้คนไปกดรีเฟรชเอง
   *
   * onInstalled ยิงทุกครั้งที่ส่วนขยายถูกติดตั้งหรือโหลดซ้ำ จึงเป็นจังหวะที่ตรงที่สุด
   * ไม่สร้างแท็บใหม่ถ้ายังไม่เคยมี — แค่ทำให้แท็บที่ค้างอยู่กลับมาเป็นโค้ดชุดปัจจุบัน
   * งานของเล่มถูกบันทึกลงฐานข้อมูลทุกขั้นอยู่แล้ว การโหลดหน้าใหม่จึงไม่ทำให้เสียงานที่ทำไปแล้ว
   */
  (async () => {
    try {
      const tab = await findTab([STUDIO_URL + '*']);
      if (tab) await chrome.tabs.reload(tab.id, { bypassCache: true });
    } catch (_) {
      /* ไม่มีแท็บ Studio หรือแท็บเพิ่งถูกปิด — ไม่มีอะไรต้องทำ */
    }
  })();
});

// ---------- หา/เปิดแท็บ ----------
const isChatUrl = (url = '') => /^https:\/\/(chatgpt\.com|chat\.openai\.com)\//.test(url);
const isGeminiUrl = (url = '') => /^https:\/\/gemini\.google\.com\//.test(url);

/**
 * เว็บแชตที่ใช้เขียนเนื้อหา — ทุกข้อความที่ไม่ระบุ site คือ ChatGPT ตามเดิมทุกประการ
 * Gemini มีแท็บ ตัวจำแท็บ และตัวขับของตัวเอง ไม่ปนกับของ ChatGPT เลยสักค่า
 */
const CHAT_SITES = {
  chatgpt: { name: 'ChatGPT', key: 'chatTabId', is: isChatUrl, match: CHAT_MATCH, home: 'https://chatgpt.com/', adapter: 'adapter/chatgpt.js' },
  gemini: { name: 'Gemini', key: 'geminiTabId', is: isGeminiUrl, match: ['https://gemini.google.com/*'], home: 'https://gemini.google.com/app', adapter: 'adapter/gemini.js' },
};
const chatSite = (site) => CHAT_SITES[site] || CHAT_SITES.chatgpt;

async function findTab(urlPatterns) {
  const tabs = await chrome.tabs.query({ url: urlPatterns });
  return tabs.find((t) => !t.discarded) || tabs[0] || null;
}

/**
 * จำแท็บ ChatGPT ที่ผู้ใช้แตะล่าสุด เพื่อให้ Phase 2 ใช้ "บัญชีที่เพิ่งสลับไป"
 * แทนการสุ่มหยิบ ChatGPT แท็บแรกใน browser profile
 */
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (isChatUrl(tab?.url)) await S.set('chatTabId', tab.id);
    else if (isGeminiUrl(tab?.url)) await S.set('geminiTabId', tab.id);
  } catch {}
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  try {
    if ((changeInfo.status === 'complete' || changeInfo.url) && tab?.active && isChatUrl(tab?.url || changeInfo.url)) {
      await S.set('chatTabId', tabId);
    } else if ((changeInfo.status === 'complete' || changeInfo.url) && tab?.active && isGeminiUrl(tab?.url || changeInfo.url)) {
      await S.set('geminiTabId', tabId);
    }
  } catch {}
});

async function ensureStudioTab(focus = false) {
  let tab = await findTab([STUDIO_URL + '*']);
  if (!tab) {
    tab = await chrome.tabs.create({ url: STUDIO_URL, pinned: true, active: focus });
  } else {
    // A failed navigation can retain the Studio URL without a live extension
    // document. Focusing that tab alone leaves Chrome's error page in place.
    // Do not navigate a healthy Studio: it may be generating a book.
    let needsNavigation = !!tab.discarded;
    if (!needsNavigation && tab.status === 'complete' && chrome.runtime.getContexts) {
      const contexts = await chrome.runtime.getContexts({ contextTypes: ['TAB'], tabIds: [tab.id] });
      needsNavigation = contexts.length === 0;
    }
    if (needsNavigation) {
      tab = await chrome.tabs.update(tab.id, { url: STUDIO_URL, ...(focus ? { active: true } : {}) });
    } else if (focus) {
      await chrome.tabs.update(tab.id, { active: true });
    }
    if (focus) await chrome.windows.update(tab.windowId, { focused: true });
  }
  await S.set('studioTabId', tab.id);
  return tab;
}

/**
 * รีโหลดส่วนขยายด้วยตัวเอง = ฆ่าหน้า Studio ที่เปิดค้างอยู่ไปด้วย
 *
 * หน้า Studio คือสมองของทั้งระบบ (MV3 ฆ่า service worker ทุกสามสิบวินาที) ถ้าไม่มีใครเปิดคืน
 * งานจะนอนค้างอยู่อย่างนั้นจนกว่าคนจะมาเปิดเอง ซึ่งพังจุดประสงค์ของการสั่งรีโหลดจากระยะไกลทั้งหมด
 * ฝั่งที่สั่งจึงฝากธงไว้ก่อนเสมอ แล้วเราเปิดคืนให้ทันทีที่ฟื้น — ธงถูกล้างทิ้งหลังใช้ครั้งเดียว
 * และหมดอายุเองถ้าค้างข้ามวัน เพื่อไม่ให้การเปิด Chrome ครั้งหน้าเด้งหน้านี้ขึ้นมาโดยไม่มีเหตุ
 */
(async () => {
  try {
    const { reopenStudioAfterReload: at } = await chrome.storage.local.get('reopenStudioAfterReload');
    if (!at) return;
    await chrome.storage.local.remove('reopenStudioAfterReload');
    if (Date.now() - at > 300000) return;
    await ensureStudioTab(false);
  } catch (_) {}
})();

async function ensureChatTab(siteName) {
  const site = chatSite(siteName);
  let tab = null;

  // 1) ใช้แท็บ ChatGPT ที่ผู้ใช้แตะล่าสุดก่อน — สำคัญมากสำหรับ Phase 2 ที่ผู้ใช้สลับบัญชี
  const rememberedId = await S.get(site.key);
  if (rememberedId != null) {
    try {
      const remembered = await chrome.tabs.get(rememberedId);
      if (!remembered.discarded && site.is(remembered.url)) tab = remembered;
    } catch {}
  }

  // 2) ถ้าแท็บเดิมหาย ให้เลือกแท็บ ChatGPT ที่ active ล่าสุดก่อน แล้วค่อย fallback ไปแท็บแรก
  if (!tab) {
    const tabs = await chrome.tabs.query({ url: site.match });
    tab = tabs.find((t) => t.active && !t.discarded) ||
      tabs.filter((t) => !t.discarded).sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0))[0] ||
      tabs[0] || null;
  }

  if (!tab) {
    /**
     * ไม่มีแท็บ ChatGPT = เปิดเป็นแท็บใหม่ในหน้าต่างเดิม ไม่เปิดหน้าต่างใหม่ (ผู้ใช้สั่ง)
     * เลือกหน้าต่างของ Studio ก่อน แล้วค่อยหน้าต่างที่ใช้ล่าสุด · ทุกเทิร์นสลับมาที่แท็บนี้เองอยู่แล้ว (sw.runTurn)
     */
    let windowId;
    try {
      const studioId = await S.get('studioTabId');
      if (studioId != null) windowId = (await chrome.tabs.get(studioId)).windowId;
    } catch {}
    if (windowId == null) {
      try {
        windowId = (await chrome.windows.getLastFocused({ windowTypes: ['normal'] })).id;
      } catch {}
    }
    tab = site !== CHAT_SITES.chatgpt
      ? await chrome.tabs.create({ url: site.home, active: false, ...(windowId != null ? { windowId } : {}) })
      : await chrome.tabs.create({ url: 'https://chatgpt.com/', active: false, ...(windowId != null ? { windowId } : {}) });
    await waitForComplete(tab.id);
  }
  // แท็บที่ถูกพักไว้ (discarded) หรือยังโหลดไม่จบ ยังฉีด content script ลงไปไม่ได้จริง
  // ถ้าคืนแท็บแบบนั้นออกไป เทิร์นแรกจะล้มทุกครั้งจนผู้ใช้ต้องกดปุ่มซ้ำหลายรอบ
  try {
    let fresh = await chrome.tabs.get(tab.id);
    if (fresh.discarded) {
      await chrome.tabs.reload(tab.id);
      fresh = await waitForComplete(tab.id);
    } else if (fresh.status !== 'complete') {
      fresh = await waitForComplete(tab.id);
    }
    if (fresh) tab = fresh;
  } catch (_) {
    /* โหลดไม่ทันก็ปล่อยผ่าน ชั้น adapter มีนาฬิการอของตัวเองอีกชั้น */
  }

  await S.set(site.key, tab.id);
  return tab;
}

function waitForComplete(tabId, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    let done = false;
    const stop = () => {
      done = true;
      chrome.tabs.onUpdated.removeListener(onUpdated);
      chrome.tabs.onRemoved.removeListener(onRemoved);
      clearTimeout(timer);
    };
    const ok = (tab) => {
      if (done) return;
      stop();
      resolve(tab);
    };
    const bad = (why) => {
      if (done) return;
      stop();
      reject(new Error(why));
    };
    // โหลดจบเมื่อไร Chrome บอกเมื่อนั้น ไม่ต้องคอยถามเป็นระยะ
    const onUpdated = (id, info, tab) => {
      if (id === tabId && info.status === 'complete') ok(tab);
    };
    const onRemoved = (id) => {
      if (id === tabId) bad('tab_gone');
    };
    const timer = setTimeout(() => bad('tab_load_timeout'), timeoutMs);
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.onRemoved.addListener(onRemoved);
    chrome.tabs
      .get(tabId)
      .then((tab) => {
        if (tab.status === 'complete') ok(tab); // จบไปแล้วตั้งแต่ก่อนเริ่มฟัง
      })
      .catch(() => bad('tab_gone'));
  });
}

/** ฉีด content script ซ้ำ เผื่อแท็บเปิดอยู่ก่อนติดตั้งส่วนขยาย */
async function ensureAdapter(tabId, timeoutMs = 20000, siteName) {
  const until = Date.now() + timeoutMs;
  const ping = async () => {
    try {
      const pong = await chrome.tabs.sendMessage(tabId, { type: 'gpt.ping' });
      return !!pong?.ok;
    } catch (_) {
      return false; /* ยังไม่มี adapter หรือหน้ายังไม่รับข้อความ */
    }
  };

  // executeScript คืนค่าหลังสคริปต์รันจบ แปลว่า listener ติดตั้งเรียบร้อยแล้ว
  // จึง ping ต่อได้ทันที ไม่ต้องหน่วงเผื่อ
  for (;;) {
    if (await ping()) return true;
    let injected = false;
    try {
      await chrome.scripting.executeScript({ target: { tabId }, files: [chatSite(siteName).adapter] });
      injected = true;
    } catch (_) {
      /* แท็บกำลังเปลี่ยนหน้าอยู่ ฉีดยังไม่ได้ */
    }
    if (injected && (await ping())) return true;
    if (Date.now() >= until) return false;
    // ฉีดไม่ติด = แท็บกำลังโหลด รอเหตุการณ์ "โหลดจบ" แล้วลองใหม่ทันที ไม่ใช่นับเวลาเอา
    if (!injected) {
      await waitForComplete(tabId, Math.max(0, until - Date.now())).catch(() => {});
      if (await ping()) return true;
    }
    if (Date.now() >= until) return false;
    await new Promise((r) => setTimeout(r, 100)); // กันวนรัวเมื่อฉีดได้แต่ยังไม่ตอบ
  }
}

// ---------- Google Flow (Ebook Plus) ----------
const FLOW_MATCH = ['https://flow.google.com/*'];
const isFlowUrl = (url = '') => /^https:\/\/flow\.google\.com\//.test(url);

/**
 * แท็บ Flow ที่ใช้สร้างภาพ — ใช้แท็บเดิมของงานนี้ก่อน เพราะ project ของเล่มเปิดค้างอยู่ในแท็บนั้น
 * ถ้าไม่มีเลยค่อยเปิดหน้าต่างใหม่ที่ไม่ย่อ (แท็บที่มองไม่เห็นถูก Chrome ชะลอจนงานช้าลงหลายเท่า)
 */
async function ensureFlowTab() {
  let tab = null;
  const rememberedId = await S.get('flowTabId');
  if (rememberedId != null) {
    try {
      const t = await chrome.tabs.get(rememberedId);
      if (isFlowUrl(t.url)) tab = t;
    } catch {}
  }
  if (!tab) {
    const tabs = await chrome.tabs.query({ url: FLOW_MATCH });
    tab = tabs.find((t) => /\/project\//.test(t.url || '')) || tabs.find((t) => !t.discarded) || tabs[0] || null;
  }
  if (!tab) {
    /**
     * เปิดเป็นแท็บในหน้าต่างเดิม ไม่ใช่หน้าต่างใหม่ (ผู้ใช้ไม่อยากให้มีหน้าต่างเด้งขึ้นมา)
     * เลือกหน้าต่างของแท็บ ChatGPT ก่อน เพราะตอนสร้างภาพแท็บนั้นว่างอยู่ สลับไปมาได้ไม่เสียงาน
     */
    let windowId;
    try {
      const chatId = await S.get('chatTabId');
      if (chatId != null) windowId = (await chrome.tabs.get(chatId)).windowId;
    } catch {}
    if (windowId == null) {
      try {
        windowId = (await chrome.windows.getLastFocused({ windowTypes: ['normal'] })).id;
      } catch {}
    }
    tab = await chrome.tabs.create({ url: 'https://flow.google.com/', active: false, ...(windowId != null ? { windowId } : {}) });
  }
  try {
    let fresh = await chrome.tabs.get(tab.id);
    if (fresh.discarded) {
      await chrome.tabs.reload(tab.id);
      fresh = await waitForComplete(tab.id);
    } else if (fresh.status !== 'complete') {
      fresh = await waitForComplete(tab.id);
    }
    if (fresh) tab = fresh;
  } catch (_) {}
  await S.set('flowTabId', tab.id);
  return tab;
}

async function ensureFlowAdapter(tabId, timeoutMs = 30000) {
  const until = Date.now() + timeoutMs;
  const ping = async () => {
    try {
      return !!(await chrome.tabs.sendMessage(tabId, { type: 'flow.ping' }))?.ok;
    } catch (_) {
      return false;
    }
  };
  for (;;) {
    if (await ping()) return true;
    try {
      // ตัวดักไฟล์ 2K ต้องอยู่ใน MAIN world ส่วนตัวขับอยู่ใน isolated world ตามปกติ
      await chrome.scripting.executeScript({ target: { tabId }, files: ['adapter/flow-main.js'], world: 'MAIN' });
      await chrome.scripting.executeScript({ target: { tabId }, files: ['adapter/flow.js'] });
    } catch (_) {
      await waitForComplete(tabId, Math.max(0, until - Date.now())).catch(() => {});
    }
    if (await ping()) return true;
    if (Date.now() >= until) return false;
    await new Promise((r) => setTimeout(r, 500));
  }
}

// ---------- เส้นทางข้อความ ----------
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    switch (msg?.type) {
      case 'ui.activity': {
        const event = msg.event;
        if (!event?.id || sender.id !== chrome.runtime.id) return sendResponse({ ok: false });
        activityWrite = activityWrite.catch(() => {}).then(async () => {
          const snapshot = await S.get('activitySnapshot', { events: [], crew: null });
          if (event.crew) snapshot.crew = event.crew;
          if (event.run) snapshot.run = event.run;
          if (event.ceo) snapshot.ceo = event.ceo;
          if (event.message) snapshot.events = [...snapshot.events, event].slice(-200);
          snapshot.at = event.at;
          await S.set('activitySnapshot', snapshot);
        });
        await activityWrite;
        return sendResponse({ ok: true });
      }
      case 'ui.activitySnapshot': {
        await activityWrite.catch(() => {});
        return sendResponse(await S.get('activitySnapshot', { events: [], crew: null }));
      }
      // Studio ขอให้เริ่มหนึ่งเทิร์น — ไม่รอผล ผลจะกลับมาเป็น gpt.result
      case 'sw.runTurn': {
        await S.set('studioTabId', sender.tab?.id ?? (await S.get('studioTabId')));
        const chat = await ensureChatTab(msg.site);
        const turnTabs = await S.get('turnTabs', {});
        turnTabs[msg.turnId] = chat.id;
        for (const id of Object.keys(turnTabs).slice(0, -40)) delete turnTabs[id];
        await S.set('turnTabs', turnTabs);
        if (msg.opts?.wantImages) {
          const sources = await S.get('imageTurnTabs', {});
          sources[msg.turnId] = chat.id;
          for (const id of Object.keys(sources).slice(0, -40)) delete sources[id];
          await S.set('imageTurnTabs', sources);
        }
        await chrome.tabs.update(chat.id, { active: true });
        if (chat.windowId != null) await chrome.windows.update(chat.windowId, { focused: true });
        const ok = await ensureAdapter(chat.id, 20000, msg.site);
        if (!ok) return sendResponse({ ok: false, error: 'adapter_unavailable' });
        const accepted = await chrome.tabs.sendMessage(chat.id, {
          type: 'gpt.run',
          turnId: msg.turnId,
          prompt: msg.prompt,
          opts: msg.opts || {},
        });
        return sendResponse(accepted?.ok ? {ok:true} : {ok:false,error:accepted?.error || 'adapter_unavailable'});
      }

      /**
       * Studio สั่งงานภาพให้แท็บ Flow — ตอบรับทันที ผลจริงมาทีหลังเป็น flow.result
       * งานหนึ่งรูปกินเวลาเป็นนาที นานกว่าอายุของ service worker ที่จะถือ sendResponse รอไว้ได้
       */
      case 'sw.flow': {
        await S.set('studioTabId', sender.tab?.id ?? (await S.get('studioTabId')));
        let flow = await ensureFlowTab();
        /**
         * หนึ่งเล่ม = หนึ่ง project ใน Flow
         * แท็บที่ค้างอยู่ใน project ของเล่มก่อน จะทำให้ภาพของเล่มใหม่ไปปนกับของเก่า
         * และตัวหา "ปกหน้า" ด้วยชื่อ tile จะไปหยิบปกของเล่มก่อนมาเป็นรูปอ้างอิง
         * ตอนเริ่มงานจึงพาแท็บไปที่ project ของเล่มนี้ (ถ้าเคยมี) หรือหน้าแรกเพื่อเปิด project ใหม่
         * ต้องทำที่นี่ ไม่ใช่ใน content script เพราะการเปลี่ยนหน้าฆ่าสคริปต์ที่กำลังทำงานอยู่
         */
        if (msg.op === 'prepare') {
          const want = String(msg.args?.projectUrl || '');
          const here = String(flow.url || '');
          const go = want ? (here.startsWith(want) ? '' : want) : /\/project\//.test(here) ? 'https://flow.google.com/' : '';
          if (go) {
            await chrome.tabs.update(flow.id, { url: go });
            await new Promise((r) => setTimeout(r, 500));
            flow = (await waitForComplete(flow.id).catch(() => null)) || flow;
          }
        }
        // ให้แท็บ Flow เป็นแท็บที่เปิดอยู่ในหน้าต่างของมัน (แท็บเบื้องหลังถูก Chrome ชะลอ timer)
        // แต่ไม่ดึงหน้าต่างขึ้นมาทับงานที่ผู้ใช้ทำอยู่ — ตัวขับรอด้วย MutationObserver ซึ่งไม่ถูกชะลออยู่แล้ว
        await chrome.tabs.update(flow.id, { active: true });
        if (!(await ensureFlowAdapter(flow.id))) return sendResponse({ ok: false, error: 'ติดตั้งตัวขับของ Google Flow ในแท็บไม่สำเร็จ' });
        const accepted = await chrome.tabs
          .sendMessage(flow.id, { type: 'flow.run', jobId: msg.jobId, op: msg.op, args: msg.args || {} })
          .catch((e) => ({ ok: false, error: e?.message || String(e) }));
        return sendResponse(accepted?.ok ? { ok: true, tabId: flow.id } : { ok: false, error: accepted?.error || 'แท็บ Flow ไม่รับงาน' });
      }

      case 'sw.flowPing': {
        const flow = await ensureFlowTab();
        if (!(await ensureFlowAdapter(flow.id))) return sendResponse({ ok: false, error: 'ติดตั้งตัวขับของ Google Flow ในแท็บไม่สำเร็จ' });
        const r = await chrome.tabs.sendMessage(flow.id, { type: 'flow.ping' }).catch(() => null);
        return sendResponse(r || { ok: false, error: 'แท็บ Flow ไม่ตอบ' });
      }

      /**
       * คลิกที่นับเป็นคนกดจริง — ปุ่ม "เริ่มสร้าง" ของ Flow ไม่รับคลิกที่สคริปต์สร้าง
       * รับเฉพาะคำขอจากแท็บ Flow เอง และกดได้ที่พิกัดเดียวในแท็บนั้นเท่านั้น
       */
      case 'sw.trustedClick': {
        if (!sender.tab?.id || !isFlowUrl(sender.tab.url)) return sendResponse({ ok: false, error: 'invalid_tab' });
        const target = { tabId: sender.tab.id };
        const x = Number(msg.x);
        const y = Number(msg.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return sendResponse({ ok: false, error: 'bad_point' });
        const cmd = (method, params) =>
          new Promise((resolve, reject) => {
            chrome.debugger.sendCommand(target, method, params, (r) =>
              chrome.runtime.lastError ? reject(new Error(chrome.runtime.lastError.message)) : resolve(r),
            );
          });
        let attached = false;
        try {
          await new Promise((resolve, reject) => {
            chrome.debugger.attach(target, '1.3', () =>
              chrome.runtime.lastError ? reject(new Error(chrome.runtime.lastError.message)) : resolve(),
            );
          });
          attached = true;
          await cmd('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
          await cmd('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
          await cmd('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
          return sendResponse({ ok: true });
        } catch (e) {
          return sendResponse({ ok: false, error: String(e?.message || e) });
        } finally {
          // ต้องถอนตัวเสมอ ไม่งั้นแถบเตือนจะค้างอยู่ทั้งวัน
          if (attached) chrome.debugger.detach(target, () => void chrome.runtime.lastError);
        }
      }

      // Content script ส่งผลกลับ → กระจายให้ extension pages
      // สำคัญ: studio.html เป็น extension page ไม่ใช่ content script
      // จึงห้ามใช้ chrome.tabs.sendMessage() กับ Studio
      case 'flow.result':
      case 'gpt.result':
      case 'gpt.progress': {
        chrome.runtime.sendMessage({ ...msg, _relayed: true }).catch(() => {});
        return sendResponse({ ok: true });
      }

      // Studio รายงานสถานะ → กระจายให้แถบข้าง
      case 'ui.status': {
        chrome.runtime.sendMessage({ ...msg, _relayed: true }).catch(() => {});
        return sendResponse({ ok: true });
      }

      // Side Panel สั่งงาน → กระจายให้ extension pages
      // Studio จะรับเฉพาะ command ที่ตัวเองรู้จัก
      case 'ui.command': {
        if (msg.command === 'createBook' || msg.command === 'titleIdeas' || msg.command === 'trendRandom') {
          await S.set('pendingUiCommand', msg);
          const studio = await ensureStudioTab(true);
          return sendResponse({ ok: true, tabId: studio.id });
        }
        /**
         * "เปิดเล่มนี้เพื่อแก้ไข" จากหน้าอ่าน — ต้องถึงทั้งหน้าที่เปิดค้างอยู่และหน้าที่เพิ่งเปิด
         *
         * หน้า Studio ที่เปิดค้างอยู่แล้วจะไม่อ่าน pendingUiCommand อีก เพราะมันอ่านตอนลงทะเบียนครั้งเดียว
         * ถ้าฝากไว้อย่างเดียว คำสั่งจะเงียบหายทุกครั้งที่ Studio เปิดค้างอยู่ — ซึ่งเป็นกรณีปกติที่สุด
         * จึงต้องกระจายก่อน แล้วค่อยฝากไว้เฉพาะตอนที่ไม่มีใครรับ
         */
        if (msg.command === 'openProject' && msg.bookId) {
          const live = await chrome.runtime.sendMessage({ ...msg, _relayed: true }).catch(() => null);
          if (!live?.ok) await S.set('pendingUiCommand', msg);
          const studio = await ensureStudioTab(true);
          return sendResponse({ ok: true, tabId: studio.id });
        }
        /**
         * หยุด/ทำต่อ สั่งงานที่กำลังเดินอยู่ในหน้า Studio ที่เปิดค้างไว้เท่านั้น
         *
         * ห้ามเปิดแท็บใหม่ให้เหมือนคำสั่งข้างบน เพราะหน้าที่เพิ่งเปิดไม่มีงานเดินอยู่
         * แล้วคำสั่งจะเงียบหายไปทั้งที่ผู้ใช้เห็นว่า "สั่งแล้ว"
         * ถ้าไม่มีหน้าไหนรับ ต้องตอบกลับไปให้แผงข้างบอกผู้ใช้ได้ตรง ๆ
         */
        if (msg.command === 'stopJob' || msg.command === 'resumeJob') {
          const reply = await chrome.runtime.sendMessage({ ...msg, _relayed: true }).catch(() => null);
          return sendResponse(
            reply?.ok ? reply : { ok: false, error: 'ไม่มีหน้า Studio ที่เปิดค้างอยู่' },
          );
        }
        chrome.runtime.sendMessage({ ...msg, _relayed: true }).catch(() => {});
        return sendResponse({ ok: true });
      }

      /**
       * รีเฟรชแท็บ ChatGPT — ทางออกสุดท้ายของสถานะค้างที่ปลดด้วยวิธีอื่นไม่ได้
       *
       * หลังเทิร์นสร้างภาพ ปุ่มส่งกลายเป็นวงกลมหมุนค้างได้เป็นชั่วโมง ไม่มีปุ่มหยุดให้กด
       * และไม่มีอะไรในหน้าที่สั่งให้มันคืนสภาพได้ การโหลดหน้าใหม่ล้างสถานะนั้นทิ้งทั้งหมด
       * ปลอดภัยเมื่อ "ยังไม่ได้ส่งอะไรออกไป" เท่านั้น — ผู้เรียกต้องรับผิดชอบเงื่อนไขนั้นเอง
       * บทสนทนาเดิมไม่หาย เพราะมันอยู่ที่ฝั่งเซิร์ฟเวอร์ ไม่ใช่ในหน้า
       */
      case 'sw.reloadChat': {
        const chat = await ensureChatTab(msg.site);
        await chrome.tabs.reload(chat.id);
        const ready = await waitForComplete(chat.id, 60000).catch(() => null);
        if (!ready) return sendResponse({ ok: false, error: `โหลดแท็บ ${chatSite(msg.site).name} ใหม่ไม่สำเร็จ` });
        const ok = await ensureAdapter(chat.id, 20000, msg.site);
        return sendResponse(ok ? { ok: true, tabId: chat.id } : { ok: false, error: 'adapter_unavailable' });
      }

      case 'sw.openStudio': {
        const t = await ensureStudioTab(true);
        return sendResponse({ ok: true, tabId: t.id });
      }

      case 'sw.focusChat': {
        // แท็บแชตที่ขอเอง (ตัวขับ Gemini ดึงตัวเองกลับมาหน้าจอ) ต้องได้ตัวมันเอง ไม่ใช่แท็บที่จำไว้ล่าสุด
        const own = sender.tab?.id != null && chatSite(msg.site).is(sender.tab.url) ? sender.tab : null;
        const t = own || (await ensureChatTab(msg.site));
        await chrome.tabs.update(t.id, { active: true });
        await chrome.windows.update(t.windowId, { focused: true });
        return sendResponse({ ok: true });
      }

      /**
       * ทางสุดท้ายของการส่ง Prompt — ใช้ช่องทาง input จริงของเบราว์เซอร์
       *
       * ช่องพิมพ์ของ ChatGPT เป็น ProseMirror ที่เก็บสถานะของตัวเองแยกจาก DOM
       * ทุกวิธีที่สคริปต์ในหน้าเว็บทำได้ (execCommand, เหตุการณ์สังเคราะห์, คลิปบอร์ด)
       * ล้วนมีโอกาสไม่ commit เข้าสถานะ แล้วจบที่ "ข้อความเต็มช่อง แต่ปุ่มส่งเทา"
       *
       * ช่องทางนี้ต่างออกไปโดยสิ้นเชิง: เบราว์เซอร์เป็นคนป้อนข้อความและกดปุ่มให้เอง
       * เหตุการณ์ที่ออกมาจึงเป็นของจริงทุกประการ เหมือนคนพิมพ์และกด Enter
       * แลกกับแถบเตือน "กำลังดีบัก" ที่จะโผล่ขึ้นระหว่างใช้ — จึงใช้เฉพาะตอนวิธีปกติแพ้แล้วเท่านั้น
       * และถอนตัวออกทันทีที่เสร็จ เพื่อให้แถบหายไป
       */
      case 'sw.forceSend': {
        // The content script requesting recovery owns the composer. Never
        // redirect its text to whichever ChatGPT tab was activated last.
        if (!sender.tab?.id || !isChatUrl(sender.tab.url)) {
          return sendResponse({ ok: false, error: 'invalid_composer_tab' });
        }
        const chat = sender.tab;
        const target = { tabId: chat.id };
        const text = String(msg.text || '');
        if (!text) return sendResponse({ ok: false, error: 'ไม่มีข้อความให้ส่ง' });

        /**
         * ทุกขั้นมีเพดานเวลา — chrome.debugger / scripting ไม่มีเพดานของตัวเอง
         * เจอจริง (นิยาย · เทิร์นแก้ส่วนซ้ำ): ข้อความพิมพ์ลงช่องครบแล้ว แต่ขั้นถัดไปไม่ตอบ แถบ debugger ค้าง
         * งานเงียบที่ "พิมพ์ Prompt ลงช่อง" · เกินเวลา = โยนข้อผิดพลาด → finally ถอด debugger ทันที
         */
        const within = (p, ms, what) =>
          Promise.race([p, new Promise((_, reject) => setTimeout(() => reject(new Error(`debugger_timeout:${what}`)), ms))]);
        const cmd = (method, params) =>
          within(
            new Promise((resolve, reject) => {
              chrome.debugger.sendCommand(target, method, params, (r) =>
                chrome.runtime.lastError ? reject(new Error(chrome.runtime.lastError.message)) : resolve(r),
              );
            }),
            15000,
            method,
          );

        let attached = false;
        let enterAttempted = false;
        try {
          await within(
            new Promise((resolve, reject) => {
              chrome.debugger.attach(target, '1.3', () =>
                chrome.runtime.lastError ? reject(new Error(chrome.runtime.lastError.message)) : resolve(),
              );
            }),
            15000,
            'attach',
          );
          attached = true;

          const [focused] = await within(chrome.scripting.executeScript({
            target,
            args: [text, !!msg.requireDraft || !!msg.enterOnly],
            func: (expected, requireDraft) => {
              const box = document.querySelector('#prompt-textarea, form[data-chatgpt-composer] div.ProseMirror[contenteditable="true"], div.ProseMirror[contenteditable="true"][role="textbox"]');
              if (!box) return false;
              if (requireDraft) {
                /**
                 * เทียบแบบหลวม (ต้องตรงกับ composerMatches ใน adapter/chatgpt.js) — ช่องพิมพ์แปลง markdown สด
                 * ข้อความจึงไม่ตรงตัวอักษร เทียบเป๊ะแล้วไม่ยอมกด Enter เลย งานค้างซ้ำที่ขั้นคิดสารบัญ (เจอจริง)
                 */
                const loose = (v) => String(v || '').replace(/```[\w-]*/g, '').replace(/[^\p{L}\p{N}\p{M}]+/gu, '');
                const same = (a, b) => { const g = loose(a), w = loose(b); if (!g || !w) return false; if (g === w) return true; const n = Math.min(40, w.length); return g.length >= w.length * 0.85 && g.length <= w.length * 1.15 && g.includes(w.slice(0, n)) && g.includes(w.slice(-n)); };
                if (!same(box.innerText, expected)) return false;
                const busy = [...document.querySelectorAll('[data-testid="stop-button"]')].some(b => {
                  // ChatGPT ค้างปุ่มวงกลมชื่อ Stop answering ไว้ได้แม้ภาพเสร็จแล้ว แต่ปุ่มนั้น disabled
                  // ผู้ใช้กด Enter เองส่งต่อได้ตามปกติ จึงนับว่า busy เฉพาะปุ่ม Stop ที่กดได้จริง
                  if (b.disabled || b.getAttribute?.('aria-disabled') === 'true') return false;
                  const r=b.getBoundingClientRect(); return r.width>0 && r.height>0;
                });
                if (busy) return false;
              }
              box.focus();
              return document.activeElement === box;
            },
          }), 15000, 'focus');
          if (!focused?.result) throw new Error(msg.requireDraft ? 'composer_changed_or_busy' : 'composer_not_found');
          // Image jobs already have a verified draft: focus it and press Enter,
          // without selecting/reinserting the prompt a second time.
          // Typing/recovery still replaces the editor through browser input.
          if (!msg.enterOnly) {
            await cmd('Input.dispatchKeyEvent', {
              type: 'keyDown', key: 'a', code: 'KeyA', modifiers: 2, windowsVirtualKeyCode: 65,
            });
            await cmd('Input.dispatchKeyEvent', {
              type: 'keyUp', key: 'a', code: 'KeyA', modifiers: 2, windowsVirtualKeyCode: 65,
            });
            await cmd('Input.insertText', { text });
          }
          await new Promise((r) => setTimeout(r, 400));

          const [verified] = await within(chrome.scripting.executeScript({
            target,
            args: [text, msg.enterOnly ? Number(msg.expectedAttachments || 0) : null],
            func: (expected, expectedAttachments) => {
              const box = document.querySelector('#prompt-textarea, form[data-chatgpt-composer] div.ProseMirror[contenteditable="true"], div.ProseMirror[contenteditable="true"][role="textbox"]');
              const loose = (v) => String(v || '').replace(/```[\w-]*/g, '').replace(/[^\p{L}\p{N}\p{M}]+/gu, '');
              const same = (a, b) => { const g = loose(a), w = loose(b); if (!g || !w) return false; if (g === w) return true; const n = Math.min(40, w.length); return g.length >= w.length * 0.85 && g.length <= w.length * 1.15 && g.includes(w.slice(0, n)) && g.includes(w.slice(-n)); };
              if (expectedAttachments !== null) {
                const form = box?.closest('form');
                if (!form) return false;
                const thumbs = [...form.querySelectorAll('img[src^="blob:"]')];
                if (thumbs.length !== expectedAttachments || thumbs.some(img => !img.complete || !img.naturalWidth)) return false;
                if (form.querySelector('[data-testid*="upload" i][aria-busy="true"], [data-testid*="upload" i] [role="progressbar"]')) return false;
              }
              return !!box && document.activeElement === box && same(box.innerText, expected);
            },
          }), 15000, 'verify');
          if (!verified?.result) throw new Error('composer_text_mismatch');

          if (msg.send !== false) {
            enterAttempted = true;
            for (const type of ['keyDown', 'char', 'keyUp']) {
              await cmd('Input.dispatchKeyEvent', {
                type,
                key: 'Enter',
                code: 'Enter',
                text: type === 'char' ? '\r' : undefined,
                unmodifiedText: type === 'char' ? '\r' : undefined,
                windowsVirtualKeyCode: 13,
                nativeVirtualKeyCode: 13,
              });
            }
          }
          return sendResponse({ ok: true, enterAttempted });
        } catch (e) {
          return sendResponse({ ok: false, error: String(e?.message || e), enterAttempted });
        } finally {
          // ต้องถอนตัวเสมอ ไม่งั้นแถบเตือนจะค้างอยู่ทั้งวัน
          if (attached) chrome.debugger.detach(target, () => void chrome.runtime.lastError);
        }
      }

      /**
       * ถามแท็บว่าเทิร์นที่หายไปนั้นเกิดอะไรขึ้น — ใช้ตอนนาฬิกาของฝั่ง Studio หมดเวลา
       * ห้ามสร้างแท็บใหม่ที่นี่ ถ้าแท็บเดิมไม่อยู่แล้วก็คือตอบไม่ได้ ไม่ใช่ตอบว่ายังไม่ส่ง
       */
      case 'sw.recoverTurn': {
        const tabId = (await S.get('turnTabs', {}))[msg.turnId];
        if (tabId != null) {
          try {
            return sendResponse(await chrome.tabs.sendMessage(tabId, {
              type: 'gpt.recoverTurn', turnId: msg.turnId, prompt: msg.prompt,
            }));
          } catch {
            return sendResponse({ state: 'unreachable' });
          }
        }
        // เทิร์นของ Gemini ถามเฉพาะแท็บ Gemini — แท็บของอีกเว็บตอบ not_sent เสมอ จะทำให้นับผิดว่ายังไม่ได้ส่ง
        const tabs = await chrome.tabs.query({ url: msg.site === 'gemini' ? ['https://gemini.google.com/*'] : ['https://chatgpt.com/*', 'https://chat.openai.com/*'] });
        let notSent = 0;
        for (const t of tabs) {
          try {
            const r = await chrome.tabs.sendMessage(t.id, { type: 'gpt.recoverTurn', turnId: msg.turnId, prompt: msg.prompt });
            if (r?.state && r.state !== 'not_sent') return sendResponse(r);
            if (r?.state === 'not_sent') notSent++;
          } catch {}
        }
        return sendResponse({ state: tabs.length === 1 && notSent === 1 ? 'not_sent' : 'unreachable' });
      }

      // ผู้ใช้กด "ภาพเสร็จแล้ว" ที่หน้า Studio — ไปคว้าภาพล่าสุดจากแท็บ ChatGPT มาเลย
      /**
       * ดึงไฟล์ภาพให้ด้วยสิทธิ์ของส่วนขยาย — ทางสำรองเมื่อหน้าเว็บดึงเองไม่ได้
       *
       * content script อยู่ใต้กฎของหน้า ChatGPT (CSP, CORS, blob ที่หมดอายุ)
       * ส่วน service worker มี host_permissions ของตัวเอง จึงยิงตรงไปที่ที่เก็บไฟล์ได้
       * นี่คือทางที่สามของการเอาไฟล์ออกมา ต่อจาก fetch ในหน้า และการวาดลงผ้าใบ
       */
      case 'sw.fetchImage': {
        const url = String(msg.url || '');
        if (!/^https?:\/\//i.test(url)) return sendResponse({ ok: false, error: 'ไม่ใช่ URL ที่ดึงได้' });
        try {
          const r = await fetch(url, { credentials: 'include', cache: 'no-store' });
          if (!r.ok) return sendResponse({ ok: false, error: `HTTP ${r.status}` });
          const blob = await r.blob();
          if (!blob.size) return sendResponse({ ok: false, error: 'ไฟล์ว่าง' });
          const dataUrl = await new Promise((res, rej) => {
            const fr = new FileReader();
            fr.onload = () => res(fr.result);
            fr.onerror = () => rej(fr.error || new Error('อ่านไฟล์ไม่สำเร็จ'));
            fr.readAsDataURL(blob);
          });
          return sendResponse({ ok: true, dataUrl, bytes: blob.size, type: blob.type || '' });
        } catch (e) {
          return sendResponse({ ok: false, error: e?.message || String(e) });
        }
      }

      case 'sw.grabImage': {
        const pinnedId = msg.turnId ? (await S.get('imageTurnTabs', {}))[msg.turnId] : null;
        if (msg.turnId && pinnedId == null) {
          return sendResponse({ ok: false, error: 'image_turn_not_available' });
        }
        const chat = pinnedId != null ? await chrome.tabs.get(pinnedId) : await ensureChatTab();
        const ok = await ensureAdapter(chat.id);
        if (!ok) return sendResponse({ ok: false, error: 'ติดตั้ง content script ของ ChatGPT ไม่สำเร็จ' });
        try {
          const result = await chrome.tabs.sendMessage(chat.id, { type: 'gpt.grabImage', turnId: msg.turnId });
          return sendResponse(result || { ok: false, error: 'หน้า ChatGPT ไม่ตอบ' });
        } catch (e) {
          return sendResponse({ ok: false, error: `content script ไม่ตอบ: ${e?.message || e}` });
        }
      }

      case 'sw.healthChat': {
        const chat = await ensureChatTab(msg.site);
        await chrome.tabs.update(chat.id, { active: true });
        if (chat.windowId != null) await chrome.windows.update(chat.windowId, { focused: true });
        const ok = await ensureAdapter(chat.id, 20000, msg.site);
        if (!ok) return sendResponse({ ok: false, error: `ติดตั้ง content script ของ ${chatSite(msg.site).name} ไม่สำเร็จ` });
        try {
          const result = await chrome.tabs.sendMessage(chat.id, { type: 'gpt.health' });
          return sendResponse(result || { ok: false, error: `${chatSite(msg.site).name} ไม่ตอบ healthcheck` });
        } catch (e) {
          return sendResponse({ ok: false, error: `content script ไม่ตอบ: ${e?.message || e}` });
        }
      }

      case 'sw.registerStudio': {
        await S.set('studioTabId', sender.tab?.id);
        await S.set('watchdog', msg.watchdog ? 1 : 0);
        const pending = await S.get('pendingUiCommand');
        if (pending) await S.set('pendingUiCommand', null);
        return sendResponse({ ok: true, pending });
      }

      case 'sw.download': {
        const id = await chrome.downloads.download({
          url: msg.url,
          filename: msg.filename,
          saveAs: !!msg.saveAs,
        });
        return sendResponse({ ok: true, id });
      }

      default:
        return sendResponse({ ok: false, error: 'unknown_message' });
    }
  })().catch((e) => sendResponse({ ok: false, error: String(e?.message || e) }));

  return true; // async
});

// ---------- watchdog: ถ้า Studio หายไปกลางงาน ให้เปิดคืน ----------
chrome.alarms.create('studio-watchdog', { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener(async (a) => {
  if (a.name !== 'studio-watchdog') return;
  if (!(await S.get('watchdog'))) return;
  const id = await S.get('studioTabId');
  let alive = false;
  if (id != null) {
    try {
      const t = await chrome.tabs.get(id);
      alive = !!t && !t.discarded;
    } catch (_) {
      alive = false;
    }
  }
  if (!alive) await ensureStudioTab(false);
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  if (tabId === (await S.get('studioTabId'))) await S.set('studioTabId', null);
  if (tabId === (await S.get('chatTabId'))) await S.set('chatTabId', null);
  if (tabId === (await S.get('geminiTabId'))) await S.set('geminiTabId', null);
  if (tabId === (await S.get('flowTabId'))) await S.set('flowTabId', null);
});
