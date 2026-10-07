/**
 * Content script ของหน้าเว็บ Gemini (gemini.google.com) — งานเขียนข้อความเท่านั้น
 *
 * พูดภาษาเดียวกับ adapter/chatgpt.js ทุกประการ (gpt.ping · gpt.health · gpt.run · gpt.recoverTurn
 * แล้วตอบกลับเป็น gpt.progress / gpt.result) ชั้นบนจึงไม่ต้องรู้ว่ากำลังคุยกับเว็บไหน
 * และรหัสข้อผิดพลาดก็ใช้ชุดเดียวกัน เพราะบันไดกู้ของ Studio ตัดสินจากรหัสพวกนี้:
 *   prompt_not_sent · send_action_not_accepted = ยังไม่ได้ส่ง ลองใหม่ได้
 *   outcome_unknown = อาจส่งไปแล้ว ห้ามส่งซ้ำ
 *
 * ภาพไม่ผ่านไฟล์นี้เลย โหมดนี้ให้ Google Flow วาดทั้งเล่ม
 *
 * โครงหน้าเว็บที่ตรวจกับของจริงแล้ว (ต.ค. 2026 · UI ภาษาไทย · โหมด Flash):
 *   ช่องพิมพ์   rich-textarea > div.ql-editor[contenteditable] (Quill)
 *   ปุ่มส่ง/หยุด ปุ่มเดียวกันใน input-area-v2 สลับไอคอน arrow_upward ↔ stop
 *   ข้อความเรา  user-query … p.query-text-line
 *   คำตอบ      model-response … div.markdown[aria-busy] · code-block code · div.response-footer.complete
 * แท็บที่ถูกซ่อนอยู่ หน้าเว็บไม่วาดต่อ (คำตอบค้างครึ่งทางจนกว่าจะกลับมาเห็น) — service worker จึงดึงแท็บขึ้นมาก่อนทุกเทิร์น
 */
(() => {
  // ตัวเก่าที่ถูกตัดขาดจากส่วนขยาย (โหลดส่วนขยายซ้ำ) ต้องไม่กันตัวใหม่ — เหตุผลเดียวกับ adapter/chatgpt.js
  const adapterAlive = () => {
    try {
      return !!chrome.runtime?.id;
    } catch (_) {
      return false;
    }
  };
  if (window.__ebookGeminiAdapter && window.__ebookGeminiAdapterAlive?.()) return;
  window.__ebookGeminiAdapter = true;
  window.__ebookGeminiAdapterAlive = adapterAlive;

  const S = {
    composer: 'rich-textarea .ql-editor[contenteditable="true"], .ql-editor[contenteditable="true"][role="textbox"]',
    inputArea: 'input-area-v2, .input-area-container, .input-area',
    userTurn: 'user-query',
    userLine: '.query-text-line',
    userText: '.query-text',
    assistantTurn: 'model-response',
    answerBody: '.markdown',
    codeBlock: 'code-block code',
    codeFallback: 'pre code',
    footerDone: '.response-footer.complete',
    newChat:
      '[data-test-id="new-chat-button"] a, a[data-test-id="side-nav-sparkle-button"], a[aria-label="แชทใหม่"], a[aria-label="New chat" i]',
    modelBadge: '[data-test-id="bard-mode-menu-button"]',
    notice: '[role="alert"], [aria-live="assertive"], mat-snack-bar-container, [class*="snack" i], [class*="banner" i]',
  };

  // วลีที่แปลว่าโควตาของบัญชีหมด — อ่านจากแถบแจ้งเตือนหรือคำตอบสั้น ๆ เท่านั้น ไม่อ่านเนื้อหนังสือ
  const LIMIT =
    /ถึงขีดจำกัด|ถึงขีดจํากัด|ใช้ครบ(?:โควตา|ขีดจำกัด)|ขีดจำกัดจะรีเซ็ต|reached (?:your|the) (?:\w+ )?limit|limit (?:resets|will reset)|usage limit|quota (?:exceeded|reached)/i;

  // root ที่ยังไม่มี (เช่นคำตอบยังไม่ขึ้น) ต้องได้ "ไม่เจอ" ไม่ใช่โยนข้อผิดพลาดกลางลูปรอ
  const $ = (sel, root = document) => (root ? root.querySelector(sel) : null);
  const $$ = (sel, root = document) => (root ? [...root.querySelectorAll(sel)] : []);
  const napMs = (ms) => new Promise((r) => setTimeout(r, ms));
  const visible = (el) => {
    const r = el?.getBoundingClientRect?.();
    return !!r && r.width > 0 && r.height > 0;
  };

  function report(turnId, phase, detail, note) {
    chrome.runtime.sendMessage({ type: 'gpt.progress', turnId, phase, detail, note }).catch(() => {});
  }

  /** รอแบบขับด้วยเหตุการณ์ — ตรวจทุกครั้งที่ DOM ขยับ timeout มีไว้กันค้างอย่างเดียว */
  function waitForDom(fn, { timeoutMs = 45000 } = {}) {
    return new Promise((resolve) => {
      let done = false;
      const finish = (v) => {
        if (done) return;
        done = true;
        obs.disconnect();
        clearTimeout(timer);
        resolve(v);
      };
      const check = () => {
        let v = null;
        try {
          v = fn();
        } catch (_) {
          v = null;
        }
        if (v) finish(v);
      };
      const obs = new MutationObserver(check);
      const timer = setTimeout(() => finish(null), timeoutMs);
      obs.observe(document.documentElement, { childList: true, subtree: true, attributes: true, characterData: true });
      check();
    });
  }

  // ---------- ช่องพิมพ์และปุ่ม ----------
  const composer = () => $$(S.composer).find(visible) || null;
  const composerText = () => composer()?.innerText || '';

  const iconOf = (b) => {
    const i = b.querySelector('mat-icon');
    return i?.getAttribute('fonticon') || i?.getAttribute('data-mat-icon-name') || (i?.textContent || '').trim();
  };
  const inputButtons = () => $$('button', $(S.inputArea) || document).filter(visible);
  const usable = (b) => !b.disabled && b.getAttribute('aria-disabled') !== 'true';
  const sendButton = () =>
    inputButtons().find(
      (b) => /^(arrow_upward|send)$/.test(iconOf(b)) || /ส่งข้อความ|send message/i.test(b.getAttribute('aria-label') || ''),
    ) || null;
  const stopButton = () =>
    inputButtons().find(
      (b) => iconOf(b) === 'stop' || /หยุดคำตอบ|stop (?:response|generating)/i.test(b.getAttribute('aria-label') || ''),
    ) || null;

  /**
   * เทียบแบบหลวม — Quill แตกบรรทัดเป็น <p> และเติมบรรทัดว่างเอง ข้อความจึงไม่ตรงตัวอักษร
   * เทียบเฉพาะตัวอักษรกับตัวเลข แล้วดูหัว ท้าย และความยาว (เกณฑ์เดียวกับ composerMatches ของ ChatGPT)
   */
  const loose = (v) => String(v || '').replace(/```[\w-]*/g, '').replace(/[^\p{L}\p{N}\p{M}]+/gu, '');
  const sameText = (got, want) => {
    const g = loose(got);
    const w = loose(want);
    if (!g || !w) return false;
    if (g === w) return true;
    const n = Math.min(40, w.length);
    return g.length >= w.length * 0.85 && g.length <= w.length * 1.15 && g.includes(w.slice(0, n)) && g.includes(w.slice(-n));
  };
  const composerMatches = (prompt) => sameText(composerText(), prompt);

  async function clearComposer() {
    const box = composer();
    if (!box || !loose(box.innerText)) return;
    box.focus();
    document.execCommand('selectAll');
    document.execCommand('delete');
    await napMs(120);
  }

  async function injectText(text) {
    const box = composer();
    if (!box) throw new Error('composer_not_found');
    await clearComposer();
    box.focus();
    document.execCommand('insertText', false, text);
    await napMs(250);
    if (composerMatches(text)) return box;
    // ทางสำรอง: ให้ Quill รับเป็นการวาง ซึ่งเป็นช่องทางที่มันออกแบบมาให้รับข้อความยาว
    await clearComposer();
    box.focus();
    const data = new DataTransfer();
    data.setData('text/plain', text);
    box.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
    await napMs(400);
    if (composerMatches(text)) return box;
    await clearComposer();
    throw new Error('composer_write_failed');
  }

  // ---------- บทสนทนา ----------
  const userTurns = () => $$(S.userTurn);
  const userTextOf = (node) => {
    const lines = $$(S.userLine, node);
    if (lines.length) return lines.map((p) => p.innerText).join('\n');
    return $(S.userText, node)?.innerText || '';
  };

  /**
   * ใบเสร็จ = ข้อความของเราขึ้นเป็นรายการล่าสุดของบทสนทนาจริง
   * ต้องเป็นรายการสุดท้ายและไม่ใช่ของที่มีอยู่ก่อนกดส่ง — กันการสั่งซ้ำด้วย Prompt เดิมในห้องเดิมไปจับของรอบก่อน
   * หน้าเว็บย่อข้อความยาวได้ จึงยอมรับกรณีที่สิ่งที่เห็นเป็นส่วนหัวของ Prompt ด้วย
   */
  function findReceipt(prompt, before) {
    const last = userTurns().pop();
    if (!last || before?.has(last)) return null;
    const got = userTextOf(last);
    if (sameText(got, prompt)) return last;
    const g = loose(got);
    const w = loose(prompt);
    return g.length >= Math.min(w.length, 200) && w.startsWith(g) ? last : null;
  }

  /**
   * ข้อความแรกของห้องใหม่ทำให้ที่อยู่หน้าเปลี่ยนจาก /app เป็น /app/<id> แล้วหน้าเว็บวาดบทสนทนาใหม่ทั้งชุด
   * ตัวที่เราจับไว้ตอนยืนยันการส่งจึงหลุดจากหน้าได้ — ตามไปที่ข้อความล่าสุดของเราที่ตรงกับ Prompt เดิม
   */
  function liveAnchor(anchor, prompt) {
    if (anchor?.isConnected) return anchor;
    return findReceipt(prompt, null);
  }

  const follows = (anchor, el) => !!(anchor.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING);

  /**
   * คำตอบ = กล่องเนื้อหา (.markdown) กล่องแรกที่ตามหลังข้อความของเรา ไม่ใช่ทั้ง model-response
   *
   * Gemini สุ่มตอบเป็น "สองฉบับเทียบกัน" พร้อมปุ่ม "คำตอบนี้มีประโยชน์กว่า" ใต้แต่ละฉบับ (ผู้ใช้เจอจริงที่ขั้นดูกระแส)
   * ถ้าอ่านทั้งก้อน บล็อกโค้ดของสองฉบับจะถูกต่อกันเป็น JSON ที่อ่านไม่ได้ และเครื่องหมาย "ตอบจบ" แบบปกติก็ไม่ขึ้น
   * การยึดกล่องเนื้อหากล่องแรกใช้ได้ทั้งสองหน้าตา โดยไม่ต้องรู้ว่าหน้าเว็บห่อสองฉบับนั้นไว้ด้วยอะไร
   */
  function assistantAfter(anchor) {
    if (!anchor?.isConnected) return null;
    return (
      $$(S.answerBody).find((m) => follows(anchor, m) && !m.closest(S.userTurn) && !m.parentElement?.closest(S.answerBody)) ||
      // หน้าตาที่ไม่มีกล่องเนื้อหาแบบที่รู้จัก — ยึดบล็อกโค้ดแรกหลังข้อความของเราแทน
      $$('code-block').find((c) => follows(anchor, c) && !c.closest(S.userTurn)) ||
      null
    );
  }

  function readAnswer(resp) {
    if (!resp) return { text: '', blocks: 0 };
    let codes = $$(S.codeBlock, resp);
    if (!codes.length) codes = $$(S.codeFallback, resp);
    // ใช้บล็อกโค้ดทั้งหมดต่อกัน เผื่อโมเดลแตกเป็นหลายบล็อก (สัญญาเดียวกับฝั่ง ChatGPT)
    if (codes.length) return { text: codes.map((c) => c.textContent).join('\n'), blocks: codes.length };
    return { text: resp.innerText || '', blocks: 0 };
  }

  const answerBusy = (resp) => !!stopButton() || resp?.getAttribute('aria-busy') === 'true';

  /** ปุ่มเลือกฉบับของโหมดสองฉบับเทียบกัน — โผล่เมื่อทั้งสองฉบับพิมพ์จบแล้วเท่านั้น */
  const CHOICE = /มีประโยชน์กว่า|ดีกว่า|more helpful|is better|prefer this/i;
  const choiceButtons = (resp) =>
    resp ? $$('button').filter((b) => visible(b) && follows(resp, b) && !b.closest(S.inputArea) && CHOICE.test(b.innerText || '')) : [];

  /** หน้าเว็บบอกเองว่าตอบจบ: แถบท้ายคำตอบแบบปกติ หรือปุ่มเลือกฉบับของโหมดสองฉบับ */
  const answerDone = (resp) => !!resp && (!!$(S.footerDone, resp.closest(S.assistantTurn)) || choiceButtons(resp).length > 0);

  /** ตัวปิดทุกตัวที่ Prompt นี้ขอ ต้องมาครบ — ช่องว่างกลางบล็อกโค้ดยาว ๆ ไม่ใช่บทที่เขียนจบ */
  function visibleReplyComplete(prompt, text) {
    const ends = [...String(prompt || '').matchAll(/<<<(?:SEC|META) [\w.]+ END>>>/g)].map((m) => m[0]);
    return ends.every((marker) => text.includes(marker));
  }

  function limitNotice(resp) {
    for (const el of $$(S.notice)) {
      if (!visible(el) || el.closest(S.assistantTurn) || el.closest(S.userTurn) || el.closest(S.inputArea)) continue;
      const t = (el.innerText || '').trim();
      if (t && t.length < 400 && LIMIT.test(t)) return t.replace(/\s+/g, ' ');
    }
    // Gemini บอกลิมิตเป็นคำตอบสั้น ๆ ก็ได้ — เนื้อหนังสือจริงยาวกว่านี้มากและอยู่ในบล็อกโค้ด
    if (!resp) return '';
    const said = (resp.innerText || '').trim();
    return said && said.length < 500 && !$(S.codeBlock, resp) && LIMIT.test(said) ? said.replace(/\s+/g, ' ') : '';
  }

  const currentModel = () => ($(S.modelBadge)?.innerText || '').replace(/\s+/g, ' ').trim();

  async function newThread() {
    const empty = () => userTurns().length === 0 && !!composer();
    if (empty()) return { ok: true };
    const link = $$(S.newChat).find(visible) || $(S.newChat);
    if (!link) return { ok: false, reason: 'ไม่พบปุ่ม "แชทใหม่" บนหน้า Gemini' };
    link.click();
    if (await waitForDom(empty, { timeoutMs: 20000 })) {
      await napMs(400);
      return { ok: true };
    }
    return { ok: false, reason: 'กด "แชทใหม่" แล้ว แต่ห้องยังไม่ว่างใน 20 วินาที' };
  }

  /**
   * Gemini ไม่ทำงานตอนแท็บไม่ได้อยู่หน้าจอ — ต่างจาก ChatGPT ที่ตอบต่อในเบื้องหลังได้
   *
   * ตรวจกับของจริงแล้วสองข้อ: กดส่งตอนแท็บถูกซ่อน ข้อความไม่ออก · สลับแท็บหนีกลางคำตอบ หน้าเว็บหยุดวาด
   * (ผู้ใช้เจอจริง: เทิร์นที่ 10 หมดเวลา 343 วินาที ทั้งที่คำตอบครบอยู่บนเซิร์ฟเวอร์ตั้งนานแล้ว)
   * หลอกหน้าเว็บว่ายังมองเห็นอยู่ก็ไม่ช่วย จึงเหลือทางเดียวคือดึงแท็บกลับมาหน้าจอจริง ๆ
   * ครั้งแรกดึงทันที หลังจากนั้นเว้น 20 วินาที เพื่อไม่ให้แย่งหน้าจอรัว ๆ ตอนผู้ใช้ตั้งใจไปทำอย่างอื่น
   */
  let lastSurfaceAt = 0;
  function surfaceIfHidden(turnId) {
    if (document.visibilityState === 'visible') {
      lastSurfaceAt = 0;
      return false;
    }
    const now = Date.now();
    if (now - lastSurfaceAt >= 20000) {
      lastSurfaceAt = now;
      chrome.runtime.sendMessage({ type: 'sw.focusChat', site: 'gemini' }).catch(() => {});
      report(turnId, 'tab_hidden', 'แท็บ Gemini ถูกสลับไปเบื้องหลัง — ดึงกลับมาหน้าจอ เพราะ Gemini ไม่ส่งและไม่วาดคำตอบตอนมองไม่เห็น · ดูความคืบหน้าได้จากแถบข้าง');
    }
    return true;
  }
  const waitVisible = (turnId, timeoutMs = 15000) => {
    surfaceIfHidden(turnId);
    return waitForVisible(timeoutMs);
  };
  function waitForVisible(timeoutMs) {
    if (document.visibilityState === 'visible') return Promise.resolve(true);
    return new Promise((resolve) => {
      const done = (v) => {
        document.removeEventListener('visibilitychange', on);
        clearTimeout(timer);
        resolve(v);
      };
      const on = () => document.visibilityState === 'visible' && done(true);
      const timer = setTimeout(() => done(false), timeoutMs);
      document.addEventListener('visibilitychange', on);
    });
  }

  // ---------- รอคำตอบ ----------
  function waitForAnswer(turnId, anchor, prompt, { timeoutMs = 300000, startMs = 120000, quietMs = 1800 } = {}) {
    return new Promise((resolve) => {
      const t0 = Date.now();
      let lastText = null;
      let stableSince = 0;
      const finish = (status, extra = {}) => {
        clearInterval(hb);
        resolve({ status, ...extra });
      };
      const hb = setInterval(() => {
        const now = Date.now();
        surfaceIfHidden(turnId);
        anchor = liveAnchor(anchor, prompt);
        const resp = assistantAfter(anchor);
        const limit = limitNotice(resp);
        if (limit && !answerBusy(resp)) return finish('rate_limited', { limit });

        const text = resp ? readAnswer(resp).text : '';
        if (text !== lastText) {
          lastText = text;
          stableSince = now;
        }
        const quiet = now - stableSince;
        const busy = answerBusy(resp);
        const footer = answerDone(resp);
        if (resp && !busy && quiet >= quietMs) {
          if (footer) return finish(text.trim() ? 'ok' : 'empty');
          /**
           * ไม่เจอเครื่องหมาย "ตอบจบ" ของหน้าเว็บ (เผื่อวันที่ Gemini เปลี่ยนชื่อคลาส)
           * ยังจบได้ถ้านิ่งนานพอ มองเห็นแท็บอยู่จริง และตัวปิดที่ Prompt ขอมาครบทุกตัว
           */
          if (text.trim() && quiet >= 8000 && document.visibilityState === 'visible' && visibleReplyComplete(prompt, text))
            return finish('ok');
        }
        if (!resp && now - t0 > startMs) return finish('no_response');
        if (now - t0 > timeoutMs) return finish('timeout');
        report(
          turnId,
          'waiting',
          Math.round((now - t0) / 1000),
          [
            resp ? `ได้ ${text.length.toLocaleString()} ตัวอักษร` : 'ยังไม่เริ่มตอบ',
            busy ? 'กำลังพิมพ์' : `นิ่งมา ${Math.round(quiet / 1000)} วินาที`,
            document.visibilityState === 'visible' ? '' : 'แท็บ Gemini ไม่ได้อยู่หน้าจอ หน้าเว็บจะไม่วาดคำตอบต่อจนกว่าจะมองเห็น — กำลังดึงกลับมา',
          ]
            .filter(Boolean)
            .join(' · '),
        );
      }, 500);
    });
  }

  /** หน้าเว็บเป็นอย่างไรตอนยืนยันการส่งไม่ได้ — ไม่มีข้อมูลนี้ก็ได้แต่เดาว่าพังเพราะอะไร */
  function sendDiag(prompt, before) {
    const turns = userTurns();
    const last = turns[turns.length - 1];
    const g = loose(userTextOf(last));
    const w = loose(prompt);
    let at = 0;
    while (at < g.length && at < w.length && g[at] === w[at]) at++;
    const notes = $$('[role="dialog"], [role="alert"], mat-dialog-container, mat-snack-bar-container, [class*="snack" i]')
      .filter(visible)
      .map((el) => (el.innerText || '').replace(/s+/g, ' ').trim().slice(0, 120))
      .filter(Boolean);
    return [
      `ข้อความผู้ใช้ ${before?.size ?? '?'}→${turns.length}`,
      `ใบล่าสุดเป็นของใหม่=${!!last && !before?.has(last)}`,
      `ยาว ${g.length}/${w.length}`,
      `ตรงกันถึงตัวที่ ${at} (เห็น "${g.slice(at, at + 24)}" · ต้องการ "${w.slice(at, at + 24)}")`,
      `ช่องพิมพ์เหลือ ${loose(composerText()).length}`,
      `กำลังตอบ=${!!stopButton()}`,
      `ที่อยู่ ${location.pathname}`,
      notes.length ? `แจ้งเตือนบนหน้า: ${notes.join(' | ')}` : 'ไม่มีแจ้งเตือนบนหน้า',
    ].join(' · ');
  }

  // ---------- หนึ่งเทิร์น ----------
  let activeTurnId = null;
  let activeTurnAnchor = null;
  let recoveryCandidate = null;
  const completedTurns = new Map();

  async function runTurn(turnId, prompt, opts = {}) {
    const t0 = Date.now();
    const fail = (error, detail, extra = {}) => ({ turnId, status: 'error', text: '', meta: { error, detail, ...extra } });
    try {
      report(turnId, 'waiting_ready', 'รอให้หน้า Gemini วาดช่องพิมพ์เสร็จก่อนส่งงาน');
      if (!(await waitForDom(composer, { timeoutMs: opts.readyTimeoutMs ?? 60000 })))
        return fail('chat_page_not_ready', 'ไม่พบช่องพิมพ์ของ Gemini — ตรวจว่าล็อกอินที่ gemini.google.com แล้ว', { url: location.href });
      // รูปแนบเป็นงานของสายภาพ โหมดนี้ไม่มี — ปฏิเสธก่อนส่ง ดีกว่าส่งไปโดยไม่มีรูปแล้วให้โมเดลแต่งเอง
      if (opts.attachments?.length || opts.wantImages)
        return fail('attachment_failed', 'ตัวขับ Gemini รับเฉพาะงานข้อความ ไม่รับรูปแนบหรืองานสร้างภาพ — ยังไม่ได้ส่งคำสั่ง');

      report(turnId, 'waiting_idle', 'รอให้ Gemini ตอบเทิร์นก่อนหน้าจบก่อนส่งงานถัดไป');
      if (!(await waitForDom(() => !stopButton(), { timeoutMs: opts.imageTimeoutMs ?? 240000 })))
        return fail('previous_turn_running', 'Gemini ยังตอบเทิร์นก่อนหน้าไม่จบ');

      if (opts.newThread) {
        report(turnId, 'new_thread');
        const nt = await newThread();
        if (!nt.ok) {
          report(turnId, 'new_thread_failed', nt.reason);
          return fail('new_thread_not_ready', nt.reason, { url: location.href });
        }
      }
      const limitAtStart = limitNotice(null);
      if (limitAtStart) return { turnId, status: 'rate_limited', text: limitAtStart, meta: { limit: limitAtStart } };

      const modelBefore = currentModel();
      if (opts.expectModel && modelBefore && !modelBefore.includes(opts.expectModel))
        return { turnId, status: 'wrong_model', text: '', meta: { model: modelBefore } };

      const before = new Set(userTurns());

      report(turnId, 'typing', `กำลังส่ง Prompt ไป Gemini:\n${String(prompt).slice(0, 4000)}`);
      try {
        await injectText(prompt);
      } catch (e) {
        return fail('prompt_not_sent', `เขียนลงช่องพิมพ์ของ Gemini ไม่สำเร็จ (${e?.message || e}) — ยังไม่ได้ส่งคำสั่ง`);
      }

      // ปุ่มส่งไม่ทำงานตอนแท็บถูกซ่อน — ต้องอยู่หน้าจอจริงก่อนกด ยังไม่ได้ส่งอะไรจึงยอมแพ้ได้โดยไม่มีงานซ้อน
      if (!(await waitVisible(turnId))) {
        await clearComposer();
        return fail('prompt_not_sent', 'แท็บ Gemini ไม่ได้อยู่หน้าจอ จึงยังไม่ได้กดส่ง — เปิดแท็บ Gemini ค้างไว้ให้มองเห็นแล้วลองใหม่');
      }
      report(turnId, 'sending', 'กำลังกดส่ง และรอยืนยันข้อความในบทสนทนา');
      const sendStartedAt = Date.now();
      const sent = () => findReceipt(prompt, before);
      const nothingSent = () => composerMatches(prompt) && !stopButton() && !sent();
      const btn = await waitForDom(() => {
        const b = sendButton();
        return b && usable(b) ? b : null;
      }, { timeoutMs: 12000 });
      if (btn) btn.click();
      let fresh = await waitForDom(sent, { timeoutMs: btn ? 8000 : 500 });
      if (!fresh && nothingSent()) {
        // ปุ่มไม่รับ — Quill ผูก Enter ไว้กับการส่ง ลองทางนั้นหนึ่งครั้ง ช่องพิมพ์ยังเต็มจึงไม่มีทางส่งซ้อน
        const box = composer();
        box?.focus();
        for (const type of ['keydown', 'keyup'])
          box?.dispatchEvent(new KeyboardEvent(type, { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
        fresh = await waitForDom(sent, { timeoutMs: 8000 });
      }
      if (!fresh && nothingSent()) {
        await clearComposer();
        return fail(
          'send_action_not_accepted',
          'ส่งไม่ออกและ Prompt ยังอยู่ในช่องพิมพ์ครบ ไม่มีการตอบ — คำสั่งไม่ได้ถูกส่ง ลองใหม่ได้',
          { sendMs: Date.now() - sendStartedAt },
        );
      }
      // ช่องพิมพ์เปลี่ยนไปแล้วหรือเริ่มตอบแล้ว = อาจส่งไปแล้ว ให้เวลาใบเสร็จขึ้นอีกช่วงก่อนตัดสิน
      fresh ||= await waitForDom(sent, { timeoutMs: 20000 });
      if (!fresh)
        return fail('outcome_unknown', `ช่องพิมพ์เปลี่ยนหรือเริ่มตอบแล้ว แต่ยังจับข้อความที่ส่งไม่ได้ — ไม่ส่งซ้ำเพื่อป้องกันงานซ้อน · ${sendDiag(prompt, before)}`, {
          sendMs: Date.now() - sendStartedAt,
        });
      const submittedAt = Date.now();
      const sendMs = submittedAt - sendStartedAt;
      report(turnId, 'submitted', `ยืนยันข้อความตรงกับ Prompt แล้ว · ${(sendMs / 1000).toFixed(1)} วินาที`);
      if (activeTurnId === turnId) activeTurnAnchor = fresh;

      report(turnId, 'waiting', 0);
      const res = await waitForAnswer(turnId, fresh, prompt, {
        quietMs: opts.quietMs ?? 1800,
        timeoutMs: opts.timeoutMs ?? 300000,
        startMs: opts.startMs ?? 120000,
      });
      const resp = assistantAfter(liveAnchor(fresh, prompt));
      const timing = { model: modelBefore, sendMs, answerMs: Date.now() - submittedAt };
      if (res.status === 'rate_limited') return { turnId, status: 'rate_limited', text: res.limit, meta: { ...timing, limit: res.limit } };
      if (res.status !== 'ok') {
        const seen = res.status === 'empty' ? String(resp?.innerText || '').trim().slice(0, 120) : '';
        return {
          turnId,
          status: res.status,
          text: '',
          meta: {
            ...timing,
            ...(res.status === 'empty'
              ? { note: seen ? `หน้าเว็บมีแต่ "${seen}" ซึ่งไม่ใช่คำตอบ` : 'ช่องคำตอบว่างเปล่า ไม่มีข้อความเลย' }
              : {}),
            ...(['timeout', 'no_response'].includes(res.status)
              ? { error: 'outcome_unknown', detail: 'ข้อความส่งถึงบทสนทนาแล้ว แต่ยังไม่ได้คำตอบที่ยืนยันได้ จึงไม่ส่งข้อความซ้ำ' }
              : {}),
          },
        };
      }

      const { text, blocks } = readAnswer(resp);
      /**
       * โหมดสองฉบับ: กดเลือกฉบับแรก ซึ่งคือฉบับที่เราเพิ่งอ่านไป
       * ไม่งั้นบทสนทนาค้างอยู่ที่หน้าจอให้เลือก และเทิร์นถัดไปในห้องเดิมจะต่อจากฉบับไหนก็ไม่มีใครรู้
       */
      const choice = choiceButtons(resp)[0];
      if (choice) {
        choice.click();
        report(turnId, 'received', 'Gemini ตอบมาสองฉบับให้เลือก — ใช้ฉบับแรกและกดเลือกฉบับนั้นให้แล้ว');
        await napMs(600);
      }
      report(turnId, 'received', `ได้รับคำตอบจาก Gemini แล้ว (${text.length.toLocaleString()} ตัวอักษร):\n${String(text).slice(0, 5000)}`);
      return {
        turnId,
        status: text.trim() ? 'ok' : 'empty',
        text,
        images: [],
        imageDataUrl: '',
        meta: { ...timing, model: currentModel() || modelBefore, blocks, ms: Date.now() - t0 },
      };
    } catch (e) {
      const code = String(e?.message || e);
      return { turnId, status: 'error', text: '', meta: { error: code, detail: code, url: location.href } };
    }
  }

  function healthcheck() {
    const found = { composer: !!composer(), newChat: !!$(S.newChat), modelBadge: !!$(S.modelBadge) };
    const missing = ['composer'].filter((k) => !found[k]);
    return { ok: missing.length === 0, found, missing, model: currentModel(), url: location.href };
  }

  // ---------- รับคำสั่ง ----------
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === 'gpt.ping') {
      sendResponse({ ok: true, url: location.href });
      return false;
    }
    if (msg?.type === 'gpt.health') {
      sendResponse(healthcheck());
      return false;
    }

    // เทิร์นหายไปเฉย ๆ — ตอบจากสิ่งที่หน้าเว็บรู้แน่นอน (ความหมายของแต่ละสถานะดูที่ adapter/chatgpt.js)
    if (msg?.type === 'gpt.recoverTurn') {
      const done = completedTurns.get(msg.turnId);
      if (done) {
        sendResponse({ state: 'done', result: done });
        return false;
      }
      if (activeTurnId && activeTurnId === msg.turnId) {
        const resp = assistantAfter(liveAnchor(activeTurnAnchor, msg.prompt));
        const text = resp && !answerBusy(resp) && answerDone(resp) ? readAnswer(resp).text.trim() : '';
        if (text && visibleReplyComplete(msg.prompt, text)) {
          const now = Date.now();
          // ต้องเห็นข้อความเดิมสองครั้งห่างกันอย่างน้อย 1.5 วินาที จึงนับว่าหยุดเปลี่ยนแล้วจริง
          if (recoveryCandidate?.turnId === msg.turnId && recoveryCandidate.text === text && now - recoveryCandidate.at >= 1500) {
            const result = { turnId: msg.turnId, status: 'ok', text, meta: { recoveredFromVisibleAnswer: true } };
            completedTurns.set(msg.turnId, result);
            activeTurnId = null;
            activeTurnAnchor = null;
            recoveryCandidate = null;
            sendResponse({ state: 'done', result });
            return false;
          }
          if (recoveryCandidate?.turnId !== msg.turnId || recoveryCandidate.text !== text)
            recoveryCandidate = { turnId: msg.turnId, text, at: now };
        } else recoveryCandidate = null;
        sendResponse({ state: 'running' });
        return false;
      }
      let posted = false;
      try {
        posted = !!findReceipt(msg.prompt || '', null);
      } catch (_) {
        posted = true; // อ่านหน้าไม่ได้ = ตอบไม่ได้ ต้องถือว่าอาจส่งไปแล้ว
      }
      sendResponse({ state: posted ? 'sent_unknown' : 'not_sent' });
      return false;
    }

    if (msg?.type === 'gpt.run') {
      if (completedTurns.has(msg.turnId)) {
        sendResponse({ ok: true, accepted: msg.turnId });
        chrome.runtime.sendMessage({ type: 'gpt.result', ...completedTurns.get(msg.turnId) }).catch(() => {});
        return false;
      }
      if (activeTurnId) {
        sendResponse(activeTurnId === msg.turnId ? { ok: true, accepted: msg.turnId } : { ok: false, error: 'previous_turn_running' });
        return false;
      }
      activeTurnId = msg.turnId;
      activeTurnAnchor = null;
      recoveryCandidate = null;
      // ตอบรับทันที แล้วส่งผลกลับทีหลังเป็น gpt.result
      sendResponse({ ok: true, accepted: msg.turnId });
      runTurn(msg.turnId, msg.prompt, msg.opts).then((res) => {
        const alreadyRecovered = completedTurns.has(msg.turnId);
        if (!alreadyRecovered) completedTurns.set(msg.turnId, res);
        if (completedTurns.size > 10) completedTurns.delete(completedTurns.keys().next().value);
        if (activeTurnId === msg.turnId) {
          activeTurnId = null;
          activeTurnAnchor = null;
        }
        if (!alreadyRecovered) chrome.runtime.sendMessage({ type: 'gpt.result', ...res }).catch(() => {});
      });
      return false;
    }
    return false;
  });
})();
