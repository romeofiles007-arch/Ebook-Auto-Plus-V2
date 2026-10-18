/**
 * Adapter ของ Google Flow (flow.google.com) — ปก/ลายพื้นหลังวาดปกติ ภาพประกอบวาดด้วย Agent
 *
 *   · ปกและลายพื้นหลังใช้ช่องพิมพ์ปกติ สร้างทีละรูปแล้วจับ tile ใหม่
 *   · ภาพประกอบในเล่มแยกชุดตามสัดส่วน ส่งให้ Agent แล้วจับคู่ภาพกับรหัส media ของแต่ละช็อต
 *   · ดึงไฟล์ด้วยเมนู ดาวน์โหลด → 2K (1792×2400 สำหรับ 3:4 ≈ 300 dpi บน A5) ไม่ใช่ภาพย่อบน tile
 *     ถ้า 2K ไม่มา ถอยไปใช้ภาพ 1K บน tile (ยังใช้ได้ แต่ dpi ต่ำกว่า)
 *
 * หน้า Flow แสดงภาษาตามบัญชี (เจอทั้งไทยและอังกฤษ) จึงจับจากชื่อไอคอน (tune, arrow_forward,
 * more_vert, edit, download) ซึ่งไม่เปลี่ยนตามภาษา และใช้ข้อความสองภาษาเป็นทางสำรองเท่านั้น
 *
 * ข้อความที่รับ (ผ่าน service worker):
 *   flow.ping                                      → { ok, url, loggedIn, busy }
 *   flow.run { jobId, op: 'prepare'|'generate'|'agentBatch'|'lookupNamed', args }  → { ok:true } ทันที
 *     แล้วส่งผลกลับเป็น runtime message { type:'flow.result', jobId, result }
 *     เพราะงานหนึ่งรูปใช้เวลาเป็นนาที นานกว่าที่ service worker จะอยู่รอถือ sendResponse ไว้ได้
 */
(() => {
  if (globalThis.__ebookPlusFlow) return; // ฉีดซ้ำ → ไม่เพิ่ม listener ซ้ำ
  /**
   * รุ่นของตัวขับ — ต้องตรงกับ FLOW_ADAPTER_REV ใน sw.js
   * แท็บ Flow ที่เปิดค้างไว้ก่อนรีโหลดส่วนขยายยังรันตัวขับรุ่นเก่าต่อ (เจอจริง: แก้แล้วยังขึ้นข้อความแบบเก่า)
   * service worker เห็นรุ่นไม่ตรงจะโหลดแท็บใหม่ให้เอง
   */
  const ADAPTER_REV = 6;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const text = (el) => (el?.innerText ?? el?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const visible = (el) => !!el && el.isConnected && el.getBoundingClientRect().width > 0;
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  /**
   * รอด้วย MutationObserver ไม่ใช่วนนับเวลาอย่างเดียว
   *
   * แท็บ Flow มักอยู่เบื้องหลังระหว่างทำเล่ม Chrome ชะลอ setTimeout ของแท็บที่มองไม่เห็น
   * จนการวนเช็คทุก 250ms กลายเป็นนาทีละครั้ง แต่ callback ของ MutationObserver ไม่ถูกชะลอ
   * tile ใหม่โผล่เมื่อไรจึงรู้ทันที ส่วนตัวจับเวลายังมีไว้กันกรณีหน้าไม่เปลี่ยนอะไรเลย
   */
  function waitFor(fn, { timeout = 20000, interval = 400, label = 'หน้าเว็บ' } = {}) {
    return new Promise((resolve, reject) => {
      let done = false;
      let obs = null;
      let timer = null;
      let tick = null;
      const finish = (err, value) => {
        if (done) return;
        done = true;
        obs?.disconnect();
        clearTimeout(timer);
        clearTimeout(tick);
        err ? reject(err) : resolve(value);
      };
      const check = () => {
        if (done) return;
        let v = null;
        try {
          v = fn();
        } catch (e) {
          return finish(e);
        }
        if (v) finish(null, v);
      };
      const loop = () => {
        check();
        if (!done) tick = setTimeout(loop, interval);
      };
      obs = new MutationObserver(check);
      obs.observe(document.documentElement, { childList: true, subtree: true, attributes: true, characterData: true });
      timer = setTimeout(
        () => finish(new Error(`รอ ${label} ไม่เจอ (${Math.round(timeout / 1000)} วิ) — หน้า Google Flow อาจเปลี่ยน`)),
        timeout,
      );
      loop();
    });
  }

  /** คลิกแบบคนจริง — ปุ่ม Material บางตัวไม่รับ .click() เปล่า ๆ (บทเรียนจากโปรเจกต์ Youtube) */
  function realClick(el, point) {
    if (!point) el.scrollIntoView?.({ block: 'center' });
    const r = el.getBoundingClientRect();
    const o = { bubbles: true, cancelable: true, composed: true, clientX: point?.x ?? r.left + r.width / 2, clientY: point?.y ?? r.top + r.height / 2, button: 0 };
    el.dispatchEvent(new PointerEvent('pointerdown', o));
    el.dispatchEvent(new MouseEvent('mousedown', o));
    el.dispatchEvent(new PointerEvent('pointerup', o));
    el.dispatchEvent(new MouseEvent('mouseup', o));
    el.dispatchEvent(new MouseEvent('click', o));
  }

  /**
   * คลิกที่เบราว์เซอร์นับว่าเป็นคนกดจริง (isTrusted) — ผ่าน chrome.debugger ของ service worker
   *
   * ปุ่ม "เริ่มสร้าง" ของ Flow ไม่รับคลิกที่สคริปต์สร้างขึ้นเลย ทั้ง .click() และชุด pointer/mouse event
   * (ทดสอบกับหน้าจริง ก.ย. 2026: ข้อความอยู่ครบ ปุ่มไม่ disabled แต่กดแล้วเงียบ ส่วนเมาส์จริงส่งได้ทันที)
   * ส่วนเมนูและช่องอื่น ๆ ยังรับคลิกของสคริปต์ตามปกติ จึงใช้ทางนี้เฉพาะจุดที่จำเป็น
   * ถ้าเรียก debugger ไม่ได้ (เช่นฉีดทดสอบในหน้าเว็บตรง ๆ) ถอยไปใช้ realClick
   */
  // ปุ่มอาจถูกตัดขอบ viewport หรือมี tooltip บังเฉพาะตรงกลาง: รับเฉพาะจุดที่ hit เป็นปุ่มนี้จริง
  function clickPoint(el) {
    if (!el?.isConnected || el.disabled || el.getAttribute('aria-disabled') === 'true') return null;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    const left = Math.max(0, r.left);
    const top = Math.max(0, r.top);
    const right = Math.min(innerWidth, r.left + r.width);
    const bottom = Math.min(innerHeight, r.top + r.height);
    if (right - left < 2 || bottom - top < 2) return null;
    for (const [fx, fy] of [[0.5, 0.5], [0.25, 0.5], [0.75, 0.5], [0.5, 0.25], [0.5, 0.75]]) {
      const x = Math.round(left + (right - left - 1) * fx);
      const y = Math.round(top + (bottom - top - 1) * fy);
      const hit = document.elementFromPoint(x, y);
      if (hit && (hit === el || el.contains(hit))) return { x, y };
    }
    return null;
  }

  /**
   * เล็งก่อนคลิก — พิกัดที่หน้าเว็บวัดได้ (CSS px) กับพิกัดที่ตัวดีบักของ Chrome ใช้ไม่ตรงกันเมื่อแท็บถูกซูม
   *
   * ผู้ใช้: "อาการเหมือนมันกดปุ่มไม่ถูก และบางครั้งก็ดึงภาพพลาด" — หน้า Flow ของผู้ใช้ถูกซูมเล็กกว่า 100%
   * คลิกทุกครั้ง (ปุ่มสร้าง · แผงตั้งค่า · เมนูดาวน์โหลด 2K) จึงตกห่างจากปุ่มจริงตามสัดส่วนซูม
   * แล้วระบบก็ลองซ้ำ รอ และถอยไปภาพความละเอียดต่ำ — เห็นเป็นช้ามาก กดไม่ถูก และดึงภาพพลาด
   *
   * ไม่เดาค่าซูม: เลื่อนเมาส์จริงไปชี้ก่อน (ยังไม่กด) แล้วดูว่าเหตุการณ์ mousemove ไปตกที่ไหนในหน้า
   * ตกคลาด = ได้อัตราส่วนที่ถูกจากของจริง ปรับแล้วชี้ใหม่ · ชี้โดนปุ่มที่ตั้งใจแล้วจึงกด · ไม่โดน = ไม่กด
   * อัตราส่วนที่ได้จำไว้ใช้กับคลิกถัดไป ไม่ต้องเล็งใหม่ทุกครั้ง
   */
  let lastMove = null;
  /** ความสัมพันธ์ของพิกัด: จุดที่ตกในหน้า = a × จุดที่ส่งให้ตัวดีบัก + b (แต่ละแกน) — จำไว้ใช้กับคลิกถัดไป */
  let aim = { ax: 1, bx: 0, ay: 1, by: 0 };
  document.addEventListener('mousemove', (e) => {
    if (e.isTrusted) lastMove = { x: e.clientX, y: e.clientY, target: e.target };
  }, true);
  const describe = (node) => {
    const el = node?.nodeType === 1 ? node : node?.parentElement;
    return el ? (text(el.closest('button') || el).slice(0, 30) || el.tagName.toLowerCase()) : 'ไม่มีอะไร';
  };

  async function aimTrusted(el, x, y) {
    /** เลื่อนเมาส์จริงไปที่พิกัดของตัวดีบัก (ยังไม่กด) แล้วคืนจุดที่เหตุการณ์ mousemove ตกจริงในหน้า */
    const probe = async (sx, sy) => {
      lastMove = null;
      const res = await chrome.runtime.sendMessage({ type: 'sw.trustedClick', x: sx, y: sy, moveOnly: true }).catch(() => null);
      if (!res?.ok) return { legacy: true }; // service worker รุ่นเก่ายังไม่รู้จัก moveOnly — คลิกแบบเดิม
      const t0 = performance.now();
      while (!lastMove && performance.now() - t0 < 700) await sleep(30);
      return lastMove ? { ...lastMove } : null;
    };
    const inverse = () => ({ x: (x - aim.bx) / aim.ax, y: (y - aim.by) / aim.ay });
    // จุดที่ตกตรงที่ตั้งใจ = พิกัดถูกแล้ว · ใต้เมาส์เป็นปุ่มที่ตั้งใจ หรือเป็นของที่โผล่เพราะเมาส์ผ่าน (ภาพตัวอย่าง ฯลฯ) ก็กดได้
    const onTarget = (m) => m && (m.target === el || el.contains(m.target) || (Math.abs(m.x - x) <= 3 && Math.abs(m.y - y) <= 3));

    const s0 = inverse();
    const m0 = await probe(s0.x, s0.y);
    // แท็บที่ไม่ได้แสดงอยู่บางครั้งไม่ส่ง mousemove ให้ตรวจ — ไม่มีหลักฐานว่าคลาด จึงคลิกแบบเดิม
    if (!m0 || m0.legacy || onTarget(m0)) return s0;

    /**
     * ตกคลาด: วัดจุดที่สองแล้วหาความสัมพันธ์ "จุดที่ส่ง → จุดที่ตก" ของแต่ละแกน (สัดส่วน + ระยะเลื่อน)
     * ครอบทั้งซูมของแท็บ (สัดส่วน) และพิกัดที่เลื่อนไปทั้งหน้า (ระยะเลื่อนคงที่) — เจอจริง: ซูม 100% แล้วยังชี้โดน "favorite"
     */
    const s1 = { x: s0.x > 120 ? s0.x - 80 : s0.x + 80, y: s0.y > 120 ? s0.y - 60 : s0.y + 60 };
    const m1 = await probe(s1.x, s1.y);
    if (m1 && !m1.legacy) {
      const fit = (sa, sb, la, lb, old) => {
        const k = (lb - la) / (sb - sa);
        return k > 0.2 && k < 5 ? { k, b: la - k * sa } : old;
      };
      const fx = fit(s0.x, s1.x, m0.x, m1.x, { k: aim.ax, b: aim.bx });
      const fy = fit(s0.y, s1.y, m0.y, m1.y, { k: aim.ay, b: aim.by });
      aim = { ax: fx.k, bx: fx.b, ay: fy.k, by: fy.b };
      const s2 = inverse();
      const m2 = await probe(s2.x, s2.y);
      if (!m2 || m2.legacy || onTarget(m2)) return s2;
    }
    /**
     * วัดแล้วยังไม่ลงตัว = การวัดเองไม่น่าเชื่อ (เจอจริง: ซูม 100% แต่ค่าที่วัดได้กระโดด "ตั้งใจ (1333,880) ตกที่ (1267,732)")
     * ตัวเล็งไม่ใช่ด่านกั้น — คืนค่าความสัมพันธ์เดิมแล้วกดที่พิกัดที่หน้าเว็บวัดได้ตามที่ทำมาก่อนมีตัวเล็ง
     * ด่านที่ตรวจว่ากดได้ผลจริงอยู่ที่ผู้เรียก (เช่น ข้อความหายจากช่องพิมพ์ · เมนูเปิด)
     */
    aim = { ax: 1, bx: 0, ay: 1, by: 0 };
    return { x, y };
  }

  async function trustedClick(target) {
    const resolve = typeof target === 'function' ? target : () => target;
    let el = null;
    let point = null;
    // Flow วาด composer ใหม่หลังปิดแผง/เปลี่ยนโมเดล: หา node และวัดใหม่โดยยังไม่ส่งคลิก
    for (let attempt = 0; attempt < 8; attempt++) {
      el = resolve();
      el?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
      await sleep(150);
      if (el !== resolve()) continue;
      point = clickPoint(el);
      if (point) break;
    }
    if (!point) {
      // บอกด้วยว่าอะไรทับปุ่มอยู่ — "มีแผงบัง" เฉย ๆ ไม่พอให้แก้ต่อได้จากบันทึก
      let why = '';
      if (el?.isConnected) {
        const r = el.getBoundingClientRect();
        if (el.disabled || el.getAttribute('aria-disabled') === 'true') why = 'ปุ่มยังกดไม่ได้ (disabled)';
        else if (!r.width || !r.height) why = 'ปุ่มไม่มีขนาด';
        else if (r.bottom <= 0 || r.top >= innerHeight || r.right <= 0 || r.left >= innerWidth) why = 'ปุ่มอยู่นอกจอ';
        else why = `ชี้แล้วโดน "${describe(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2))}"`;
      } else why = 'หาปุ่มไม่เจอ';
      const error = new Error(`ตำแหน่งปุ่มใน Flow เปลี่ยนหรือมีแผงบัง (${why}) — หยุดก่อนคลิกเพื่อไม่ให้กดผิดปุ่ม`);
      error.code = 'wrong_place';
      throw error;
    }
    const { x, y } = point;
    if (typeof chrome !== 'undefined' && chrome.runtime?.id) {
      const aim = await aimTrusted(el, x, y);
      if (aim.miss) {
        const error = new Error(`เมาส์ไปไม่ถึงปุ่มใน Flow (ชี้โดน "${aim.miss}") — หยุดก่อนคลิกเพื่อไม่ให้กดผิดปุ่ม`);
        error.code = 'wrong_place';
        throw error;
      }
      const res = await chrome.runtime.sendMessage({ type: 'sw.trustedClick', x: aim.x, y: aim.y }).catch((e) => ({ ok: false, error: e?.message }));
      if (res?.ok) return true;
    }
    // debugger อาจใช้เวลาจนหน้าเปลี่ยน: ห้าม fallback ไปคลิก node/พิกัดเดิมโดยไม่ตรวจซ้ำ
    const fallbackPoint = el === resolve() ? clickPoint(el) : null;
    if (!fallbackPoint) {
      const error = new Error('ปุ่มใน Flow เปลี่ยนระหว่างเตรียมคลิก — หยุดรอให้ตรวจหน้า Flow ก่อน');
      error.code = 'wrong_place';
      throw error;
    }
    realClick(el, fallbackPoint);
    return false;
  }

  const escape = () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }));
    document.querySelector('.cdk-overlay-backdrop')?.click();
  };

  /** ปุ่มที่ข้อความขึ้นต้นด้วยชื่อไอคอน — ชื่อไอคอนไม่เปลี่ยนตามภาษาของบัญชี */
  const iconButton = (icon, root = document) =>
    $$('button', root).find((b) => visible(b) && (text(b) === icon || text(b).startsWith(`${icon} `)));

  const SEL = {
    newProject: () =>
      $$('button').find((b) => visible(b) && /new project|โปรเจ็กต์ใหม่|โปรเจกต์ใหม่/i.test(text(b))),
    agentChip: () => $$('button.agent-mode-chip').find(visible),
    settingsTrigger: () =>
      $$('button.settings-trigger-button').find(visible) ||
      $$('button[aria-label="Settings trigger"], button[aria-label="ทริกเกอร์การตั้งค่า"]').find(visible),
    editor: () =>
      $$('flow-prompt-box .ProseMirror, flow-base-prompt-box .ProseMirror').find(visible) ??
      $$('.ProseMirror[contenteditable="true"]').find(visible),
    /**
     * prompt ยาวทำให้ Flow กางช่องพิมพ์เป็นแผงใหญ่ (มีปุ่ม × และ ⤢) ที่มีปุ่มส่งของตัวเอง
     * ปุ่มส่งตัวเดิมยังนับว่า "มองเห็น" แต่ถูกแผงนั้นทับอยู่ — เลือกตัวแรกจึงได้ปุ่มที่กดไม่ได้
     * แล้วหยุดด้วย "มีแผงบัง" ทุกรอบ (เจอจริง ต.ค. 2026 ที่ปกหน้า) จึงเลือกตัวที่จุดคลิกโดนตัวมันจริงก่อน
     */
    send: () => {
      const all = [
        ...$$('button[aria-label="Start generation"], button[aria-label="เริ่มสร้าง"]').filter(visible),
        ...$$('button').filter((b) => visible(b) && (text(b) === 'arrow_forward' || text(b).startsWith('arrow_forward '))),
      ];
      return all.find((b) => clickPoint(b)) || all[0] || null;
    },
    tiles: () => $$('flow-grid-tile-container'),
  };

  // Flow บางรอบไม่อัปเดต aria-pressed ของ chip แต่เปลี่ยนปุ่มตั้งค่าใน composer เป็น Settings ของ Agent แล้ว
  const scopedAgentSettings = (allowClass = false) => {
    const chip = SEL.agentChip();
    if (!chip) return null;
    const editor = SEL.editor();
    for (let root = chip.parentElement; root && root !== document.body; root = root.parentElement) {
      const settings = $$('button', root).filter((button) => visible(button) && (
        ['Settings', 'การตั้งค่า'].includes(button.getAttribute('aria-label')) ||
        ['Settings', 'การตั้งค่า'].includes(button.getAttribute('title')) ||
        ['Settings', 'การตั้งค่า'].includes(text(button)) ||
        (allowClass && button.matches('button.settings-trigger-button'))
      ));
      if (settings.length === 1) return settings[0];
      if (settings.length > 1) return null;
      // ไม่ไต่ไปถึง Settings ส่วนหัวของเว็บ
      if (root.matches('flow-prompt-box, flow-base-prompt-box') || (editor && root.contains(editor))) break;
    }
    return null;
  };
  const agentOn = () => {
    const chip = SEL.agentChip();
    return !!chip && (
      chip.getAttribute('aria-pressed') === 'true' ||
      chip.getAttribute('aria-checked') === 'true' ||
      !!scopedAgentSettings()
    );
  };
  const inProject = () => /\/project\//.test(location.pathname);

  async function openProject() {
    if (inProject()) return;
    const btn = await waitFor(SEL.newProject, { timeout: 30000, label: 'ปุ่มโปรเจ็กต์ใหม่' });
    realClick(btn);
    await waitFor(inProject, { timeout: 30000, label: 'project ใหม่' });
    await waitFor(SEL.editor, { timeout: 30000, label: 'ช่องพิมพ์ของ project' });
    await sleep(800);
  }

  /** ตั้งชื่อ project เป็นชื่อหนังสือ — หาเจอง่ายในรายการ project · ไม่สำเร็จไม่ถือว่างานพัง */
  async function renameProject(title) {
    const name = String(title ?? '').replace(/\s+/g, ' ').trim().slice(0, 100);
    if (!name) return;
    const input = await waitFor(
      () => $$('input.editable-text-input, input[aria-label="Editable text"], input[aria-label="ข้อความที่แก้ไขได้"]').find(visible),
      { timeout: 10000, label: 'ช่องชื่อ project' },
    ).catch(() => null);
    if (!input || input.value === name || input.closest('flow-grid-tile-container')) return;
    await typeIntoInput(input, name);
  }

  async function typeIntoInput(input, value) {
    input.focus();
    input.select?.();
    // Angular อ่านค่าจาก event — ตั้งผ่าน setter ของ input จริง แล้วยิง input/Enter ให้ครบ
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    for (const type of ['keydown', 'keyup'])
      input.dispatchEvent(new KeyboardEvent(type, { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
    await sleep(600);
    input.blur?.();
    input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    await sleep(600);
  }

  /**
   * ปิดโหมด Agent — ภาพต้องมาจากช่องพิมพ์ปกติทีละรูป
   * project ใหม่ของ Flow (ก.ย. 2026) เปิด Agent ไว้ให้เป็นค่าเริ่มต้น (เห็นกับหน้าจริง)
   */
  /**
   * project ใหม่ของ Flow เปิดแผงแชต Agent ค้างไว้ทางขวา ("เซสชันที่ไม่มีชื่อ") และซ่อนช่องพิมพ์ปกติ
   * ซึ่งมีปุ่ม Agent กับปุ่มตั้งค่าโมเดลที่เราต้องใช้ — ต้องปิดแผงนี้ก่อนทุกอย่าง
   * (โปรเจกต์ Youtube เจอก่อนแล้ว และเล่มจริงของผู้ใช้เจอซ้ำ: หาปุ่มตั้งค่าไม่เจอจนสร้างภาพไม่ได้สักรูป)
   */
  const chatPanel = () =>
    $$('flow-agent-panel').find(visible) ||
    $$('aside, [role="complementary"], section, div').find(
      (el) =>
        visible(el) &&
        el.getBoundingClientRect().left > innerWidth * 0.55 &&
        el.getBoundingClientRect().height > innerHeight * 0.5 &&
        /เซสชัน|session|คุณต้องการสร้างอะไร|what do you want to create/i.test(text(el).slice(0, 200)) &&
        $$('button', el).some((b) => text(b) === 'close'),
    );

  async function closeAgentChat() {
    for (let i = 0; i < 3; i++) {
      if (SEL.settingsTrigger() && SEL.agentChip()) return; // ช่องพิมพ์ปกติโผล่แล้ว
      const panel = chatPanel();
      if (!panel) return;
      const close =
        $$('button', panel).find((b) => visible(b) && /^(close|ปิด)$/i.test(b.getAttribute('aria-label') || '')) ||
        $$('button', panel).find((b) => visible(b) && text(b) === 'close');
      if (!close) return;
      realClick(close);
      await waitFor(() => (SEL.settingsTrigger() && SEL.agentChip()) || !chatPanel(), { timeout: 8000, label: 'ช่องพิมพ์หลังปิดแชต Agent' }).catch(() => null);
      await sleep(500);
    }
  }

  async function agentOff() {
    await closeAgentChat();
    // เมนูโมเดลที่ค้างจากชุด Agent บังปุ่ม Agent; ปิดก่อนสลับกลับไปวาดปก
    if (settingsPane()) await closePane();
    /**
     * ทางเดิมที่เคยใช้ได้จริงก่อน: คลิกแบบสคริปต์สลับสองแบบ ลองได้หลายครั้ง
     * (เจอจริง: เปลี่ยนเป็นคลิกพิกัดครั้งเดียวแล้วหยุดด้วย "Flow ไม่ยอมปิด Agent เพื่อสลับไปสร้างปก")
     * ไม่ดับค่อยใช้คลิกพิกัดเป็นทางสุดท้าย
     */
    for (let i = 0; i < 4 && agentOn(); i++) {
      const chip = await waitFor(SEL.agentChip, { label: 'ปุ่ม Agent' });
      i % 2 === 0 ? chip.click() : realClick(chip);
      await waitFor(() => !agentOn(), { timeout: 2500, label: 'ปิด Agent' }).catch(() => null);
      await sleep(300);
    }
    if (agentOn()) {
      const chip = await waitFor(SEL.agentChip, { label: 'ปุ่ม Agent' });
      await trustedClick(chip);
      try {
        await waitFor(() => !agentOn(), { timeout: 5000, label: 'ปิด Agent' });
      } catch (cause) {
        const error = new Error('Flow ไม่ยอมปิด Agent เพื่อสลับไปสร้างปก — หยุดรอให้ตรวจหน้า Flow ก่อน');
        error.code = 'wrong_place';
        error.cause = cause;
        throw error;
      }
    }
    if (agentOn()) {
      const error = new Error('ปิดโหมด Agent ของ Flow ไม่สำเร็จ — กดปุ่ม Agent ในช่องพิมพ์ให้ดับเองแล้วสั่งใหม่');
      error.code = 'wrong_place';
      throw error;
    }
    /**
     * แผงตั้งค่า Agent อาจเปิดค้างอยู่ด้านขวา — ปิดทิ้ง ไม่ต้องบันทึกอะไร
     * ต้องกดเฉพาะปุ่ม ← ที่อยู่ในแผงนั้นเท่านั้น: ในคอลเล็กชัน ปุ่ม ← มุมซ้ายบนคือ "กลับหน้าหลักของ project"
     * เคยกดตัวนั้นพลาด ภาพจึงไปเกิดที่หน้าหลักแทนในคอลเล็กชัน แล้วระบบรอไม่เจอจนสั่งวาดปกซ้ำหลายรอบ
     */
    const panel = $$('flow-agent-panel, .cdk-overlay-pane, aside').find(
      (p) => visible(p) && /Agent settings|การตั้งค่า Agent/i.test(text(p).slice(0, 80)),
    );
    const back = panel && iconButton('arrow_back', panel);
    if (back) {
      back.click();
      await sleep(300);
    }
  }

  // ── แผงตั้งค่าของช่องพิมพ์ (Image · สัดส่วน · โมเดล · x1 · ตัวบอกเครดิต) ──

  const settingsPane = () =>
    $$('.cdk-overlay-pane').find((p) => visible(p) && $$('[role="radio"]', p).length && /credit|เครดิต/i.test(text(p)));

  const radioIn = (p, test) => $$('[role="radio"]', p).find((b) => test(text(b)));
  const isOn = (b) => b?.getAttribute('aria-checked') === 'true';

  function readPane() {
    const p = settingsPane();
    if (!p) return null;
    const modelBtn =
      p.querySelector('button[aria-label="Select model family"], button[aria-label="เลือกกลุ่มผลิตภัณฑ์โมเดล"]') ||
      $$('button', p).find((b) => /arrow_drop_down/.test(text(b)));
    const m = /(\d+)\s*(credits?|เครดิต)/i.exec(text(p));
    const checked = $$('[role="radio"]', p).filter(isOn).map((b) => text(b));
    return {
      pane: p,
      modelBtn,
      image: isOn(radioIn(p, (t) => /^image\b/i.test(t))),
      ratio: checked.map((t) => t.split(' ').pop()).find((t) => /^\d+:\d+$/.test(t)) || '',
      count: checked.find((t) => /^x\d$/.test(t)) || '',
      model: text(modelBtn).replace(/arrow_drop_down/, '').replace(/^\S+\s/, '').trim(),
      credits: m ? Number(m[1]) : NaN,
    };
  }

  /** ปิดแผงตั้งค่าให้แน่ — บางครั้ง Esc และคลิกฉากหลังไม่ปิด (เห็นกับหน้าจริง) ต้องกดปุ่มเดิมซ้ำเพื่อพับ */
  async function closePane() {
    if (!settingsPane()) return;
    const modelOptions = () => $$('[role="menuitem"], [role="option"]').filter(visible);
    if (modelOptions().length) {
      // เมนูมี backdrop ทับปุ่มรุ่นภาพอยู่: การกดปุ่มนั้นด้วยพิกัดจริงจะชน backdrop
      // เลือกรุ่นที่ใช้อยู่ซ้ำจากรายการที่มองเห็นเพื่อพับเมนูโดยไม่เปลี่ยนค่า
      const current = readPane()?.model;
      const selected = modelOptions().find((m) => text(m).replace(/^\S+\s/, '') === current);
      if (!selected) throw new Error('เมนูโมเดลของ Flow เปิดอยู่ แต่ไม่พบรุ่นที่เลือกไว้สำหรับปิดเมนู');
      realClick(selected);
      await waitFor(() => !modelOptions().length, { timeout: 3000, label: 'ปิดรายการโมเดล' });
    }
    escape();
    const closed = await waitFor(() => !settingsPane(), { timeout: 1500, label: 'ปิดแผงตั้งค่า' }).catch(() => false);
    if (closed) return;
    const trigger = await waitFor(SEL.settingsTrigger, { timeout: 3000, label: 'ปุ่มตั้งค่าโมเดล' });
    await trustedClick(trigger);
    await waitFor(() => !settingsPane(), { timeout: 3000, label: 'ปิดแผงตั้งค่า' });
  }

  async function openPane() {
    // ปล่อยให้ closePane ปิดเมนูรุ่นภาพเมื่อเสร็จ; ระหว่างตั้งค่ายังอ่านค่าปัจจุบันได้
    if (settingsPane()) return;
    if (!SEL.settingsTrigger()) await closeAgentChat();
    const trigger = await waitFor(SEL.settingsTrigger, { timeout: 15000, label: 'ปุ่มตั้งค่าโมเดลของช่องพิมพ์' }).catch(() => null);
    if (!trigger) {
      throw new Error(
        'ไม่พบปุ่มตั้งค่าโมเดลของช่องพิมพ์ใน Flow — ถ้ามีแผงแชต Agent เปิดอยู่ทางขวา ให้กด ✕ ปิดแผงนั้นเองหนึ่งครั้ง แล้วกดทำต่อ',
      );
    }
    realClick(trigger);
    await waitFor(settingsPane, { label: 'แผงตั้งค่าโมเดล' });
    await sleep(400);
  }

  async function chooseRadio(test) {
    const btn = radioIn(settingsPane() ?? document, test);
    if (btn && !isOn(btn)) {
      realClick(btn);
      await sleep(600); // Image/Video สลับแล้วแผงวาดตัวเลือกใหม่ — ต้อง query ใหม่ทุกครั้ง
    }
    return !!btn;
  }

  async function chooseModel(model) {
    const cur = readPane();
    if (!cur?.modelBtn || cur.model === model) return cur?.model === model;
    const modelOptions = () => $$('[role="menuitem"], [role="option"]').filter(visible);
    if (!modelOptions().length) realClick(cur.modelBtn);
    const item = await waitFor(
      () => modelOptions().length && modelOptions(),
      { timeout: 3000, label: 'รายการโมเดล' },
    ).catch(() => null);
    const choice = item?.find((m) => text(m).replace(/^\S+\s/, '') === model);
    if (!choice) {
      // รุ่นที่ขอไม่มีในเมนูปัจจุบัน: ปิดเมนูให้เรียบร้อยก่อนลองรุ่นถัดไป ไม่เปิด/ปิดวน
      if (modelOptions().length) {
        escape();
        await waitFor(() => !modelOptions().length, { timeout: 3000, label: 'ปิดรายการโมเดล' });
      }
      return null;
    }
    realClick(choice);
    await sleep(800);
    return readPane()?.model === model;
  }

  /**
   * ตั้งช่องพิมพ์เป็น Image · สัดส่วนที่ต้องการ · x1 · โมเดลที่ใช้ 0 เครดิต
   *
   * ลองโมเดลตามลำดับที่ส่งมา แล้วหยุดที่ตัวแรกที่ Flow บอกว่า "0 เครดิต"
   * ถ้าไม่มีตัวไหนฟรีเลย → หยุดทันที ไม่กดสร้าง (ห้ามเผาเครดิตของผู้ใช้เงียบ ๆ)
   */
  async function configure({ ratio = '3:4', models = ['Nano Banana 2 Lite', 'Nano Banana 2', 'Nano Banana Pro'], agentOnly = false } = {}) {
    await agentOff();
    await openPane();
    // Agent ตั้งสัดส่วนและจำนวนภาพในแผงของตนเอง ภาพปกติที่เลือกไว้เป็น 0 เครดิตอยู่แล้วไม่ต้องเปิดเมนูโมเดลอีก
    if (agentOnly) {
      const current = readPane();
      if (current?.credits === 0 && current.model && (models.includes(current.model) || /^Nano Banana\b/i.test(current.model))) {
        await closePane();
        return { model: current.model, ratio, credits: 0 };
      }
    }
    let last = null;
    for (const model of models) {
      let previous = '';
      for (let attempt = 1; attempt <= 3; attempt++) {
        if (!settingsPane()) await openPane();
        await chooseRadio((t) => /^image\b/i.test(t));
        await chooseRadio((t) => t.split(' ').pop() === ratio);
        await chooseRadio((t) => t === 'x1');
        const okModel = await chooseModel(model);
        if (okModel === null) break;
        await sleep(400);
        last = readPane();
        if (last && okModel && last.image && last.ratio === ratio && last.count === 'x1') break;
        const now = last && `${last.image}|${last.ratio}|${last.count}|${last.model}|${last.credits}`;
        if (now === previous) break;
        previous = now;
      }
      if (last?.model === model && last.credits === 0) {
        await closePane();
        await sleep(300);
        return { model, ratio, credits: 0 };
      }
    }
    escape();
    await sleep(300);
    if (last && last.image && last.ratio === ratio && Number.isFinite(last.credits) && last.credits > 0) {
      const err = new Error(`Flow แจ้งว่าการสร้างครั้งนี้ใช้ ${last.credits} เครดิต (โมเดล ${last.model}) ไม่ใช่ 0 — หยุดไว้ก่อน ไม่กดสร้าง`);
      err.code = 'not_free';
      throw err;
    }
    throw new Error(
      `ตั้งช่องพิมพ์ของ Flow ไม่สำเร็จ (ตอนนี้: ${last?.image ? 'Image' : 'ไม่ใช่ Image'} · ${last?.ratio || '?'} · ${last?.count || '?'} · ${last?.model || '?'}) — ` +
        `เปิดปุ่มตั้งค่าข้างปุ่มสร้างแล้วเลือก รูปภาพ · ${ratio} · x1 · ${models[0]} เองหนึ่งครั้ง แล้วสั่งใหม่`,
    );
  }

  // ── แนบรูปอ้างอิง (ปกของเล่ม / รูปผู้เขียน) ──

  const dataUrlToFile = (dataUrl, name) => {
    const [head, b64] = String(dataUrl).split(',');
    const type = /data:([^;]+)/.exec(head)?.[1] || 'image/jpeg';
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new File([bytes], name || 'reference.jpg', { type });
  };

  /**
   * ตัว chip เป็น display:contents กว้าง 0 เสมอ (เห็นกับหน้าจริง) ต้องวัดจากปุ่มข้างในแทน
   * ปุ่มนั้นมี aria-busy="true" ระหว่างอัปโหลด
   */
  const chipButton = (c) => c.querySelector('button.chip-container') || c.querySelector('button');
  const chips = () => $$('flow-ingredient-chip').filter((c) => visible(chipButton(c)));
  const chipsBusy = () => chips().some((c) => chipButton(c)?.getAttribute('aria-busy') === 'true');

  /**
   * ใช้ภาพที่อยู่ใน project อยู่แล้วเป็นรูปอ้างอิงผ่านเมนู "เพิ่มไปยังพรอมต์"
   * ปกหน้าถูกสร้างใน project เดียวกันก่อนเสมอ การอัปโหลดซ้ำทุกรูปทำให้ project รกด้วยสำเนาปกเป็นสิบใบ
   */
  async function attachFromTile(name) {
    const tile = SEL.tiles().find((t) => t.getAttribute('aria-label') === name && tileId(t));
    if (!tile) return false;
    const before = chips().length;
    await openTileMenu(tileId(tile));
    const add = menuItem('add_2') || menuItem('add ');
    if (!add) {
      escape();
      return false;
    }
    realClick(add);
    await waitFor(() => chips().length > before && !chipsBusy(), { timeout: 20000, label: 'เพิ่มภาพเข้าช่องพิมพ์' });
    await sleep(500);
    return true;
  }

  // ── คอลเล็กชัน (โฟลเดอร์ใน project ของ Flow) ──
  /**
   * ภาพของเล่มแยกเป็นคอลเล็กชันตามตำแหน่งในเล่ม: 00 รูปอ้างอิง · 01 ปก · 02 ลวดลายพื้นหลัง · 03 บทที่ 1 …
   * ภาพที่สร้างขณะเปิดคอลเล็กชันอยู่จะไปอยู่ในคอลเล็กชันนั้นเลย ไม่โผล่ปนที่หน้าหลักของ project (ตรวจกับหน้าจริงแล้ว)
   * หน้าหลักจึงเหลือแค่แฟ้มเรียงเลข เปิดดูทีละหมวดได้ และค้นด้วยชื่อไฟล์ได้จากช่องค้นหาของ Flow
   */
  const inCollection = () => /\/collection\//.test(location.pathname);
  const nameInput = () =>
    $$('input.editable-text-input, input[aria-label="Editable text"], input[aria-label="ข้อความที่แก้ไขได้"]').find(visible);
  const collectionTiles = () => SEL.tiles().filter((t) => t.querySelector('flow-collection-tile'));
  const UNTITLED = /ไม่มีชื่อ|untitled/i;

  async function goRoot() {
    if (!inCollection()) return;
    const back = iconButton('arrow_back');
    if (back) realClick(back);
    else history.back();
    try {
      await waitFor(() => !inCollection() && SEL.editor(), { timeout: 15000, label: 'หน้าหลักของ project' });
    } catch (e) {
      e.code = 'wrong_place';
      throw e;
    }
    await sleep(600);
  }

  async function openCollection(name) {
    if (!name) return goRoot();
    if (inCollection() && nameInput()?.value === name) return;
    await goRoot();
    scrollGridTop();
    await sleep(400);
    let tile = collectionTiles().find((t) => t.getAttribute('aria-label') === name);
    if (!tile) {
      const untitledBefore = collectionTiles().filter((t) => UNTITLED.test(t.getAttribute('aria-label') || '')).length;
      const editorTop = SEL.editor()?.getBoundingClientRect().top ?? Infinity;
      // ปุ่ม + มุมขวาบน (เพิ่มสื่อ) — คนละตัวกับ + ในช่องพิมพ์ ซึ่งอยู่ต่ำกว่าช่องพิมพ์
      const add = $$('button').find((b) => visible(b) && text(b) === 'add' && b.getBoundingClientRect().top < Math.min(120, editorTop));
      if (!add) throw new Error('ไม่พบปุ่ม + สำหรับสร้างคอลเล็กชันใน Flow');
      realClick(add);
      const item = await waitFor(() => menuItem('folder'), { timeout: 6000, label: 'เมนูคอลเล็กชันใหม่' });
      realClick(item);
      tile = await waitFor(
        () => {
          const u = collectionTiles().filter((t) => UNTITLED.test(t.getAttribute('aria-label') || ''));
          return u.length > untitledBefore ? u[0] : null;
        },
        { timeout: 15000, label: 'คอลเล็กชันใหม่' },
      );
    }
    const target = tile.querySelector('flow-collection-tile') || tile;
    target.click();
    const opened = await waitFor(inCollection, { timeout: 8000, label: 'เปิดคอลเล็กชัน' }).catch(() => false);
    if (!opened) {
      realClick(target);
      await waitFor(inCollection, { timeout: 10000, label: 'เปิดคอลเล็กชัน' });
    }
    await waitFor(SEL.editor, { timeout: 15000, label: 'ช่องพิมพ์ในคอลเล็กชัน' });
    await sleep(500);
    const input = nameInput();
    if (input && input.value !== name) await typeIntoInput(input, name);
  }

  /**
   * เลือกรูปอ้างอิงด้วยชื่อ จากตัวเลือกสื่อของช่องพิมพ์ (ปุ่ม + ในช่องพิมพ์)
   * ตัวเลือกนี้เห็นภาพทุกใบใน project รวมที่อยู่ในคอลเล็กชันอื่น และมีช่องค้นหา — ไม่ต้องอัปโหลดซ้ำ
   */
  async function attachFromPicker(name) {
    const before = chips().length;
    const editorTop = SEL.editor()?.getBoundingClientRect().top ?? 0;
    const add =
      $$('button[aria-label="เพิ่มองค์ประกอบลงในช่องพรอมต์"], button[aria-label="Add ingredient to prompt"]').find(visible) ||
      $$('button').find((b) => visible(b) && text(b) === 'add' && b.getBoundingClientRect().top > editorTop - 40);
    if (!add) return false;
    realClick(add);
    const pane = await waitFor(() => $$('.cdk-overlay-pane').find((p) => visible(p) && p.querySelector('[role="listbox"]')), {
      timeout: 8000,
      label: 'ตัวเลือกสื่อ',
    }).catch(() => null);
    if (!pane) {
      escape();
      return false;
    }
    const search = pane.querySelector('input');
    if (search) {
      search.focus();
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(search, name.replace(/\.[a-z]+$/i, ''));
      search.dispatchEvent(new Event('input', { bubbles: true }));
    }
    const optionName = (b) => text(b).replace(/\s+(รูปภาพ|image|photo|วิดีโอ|video)$/i, '');
    const opt = await waitFor(() => $$('button[role="option"]', pane).find((b) => visible(b) && optionName(b) === name), {
      timeout: 8000,
      label: `รูป ${name} ในตัวเลือกสื่อ`,
    }).catch(() => null);
    if (!opt) {
      escape();
      await sleep(300);
      return false;
    }
    opt.click();
    await sleep(600);
    // บางครั้งการคลิกรายการคือการเพิ่มเข้าช่องพิมพ์ทันทีและปิดตัวเลือกไปเอง — นับ chip ก่อนหาปุ่มเพิ่ม
    if (chips().length > before) {
      await waitFor(() => !chipsBusy(), { timeout: 20000, label: 'เพิ่มรูปอ้างอิงเข้าช่องพิมพ์' });
      if (pane.isConnected && visible(pane)) escape();
      return true;
    }
    const addBtn = $$('button', pane).find((b) => /เพิ่มไปยังพรอมต์|add to prompt/i.test(text(b)));
    if (!addBtn) {
      escape();
      return chips().length > before;
    }
    addBtn.click();
    await waitFor(() => chips().length > before && !chipsBusy(), { timeout: 20000, label: 'เพิ่มรูปอ้างอิงเข้าช่องพิมพ์' });
    await sleep(400);
    return true;
  }

  /**
   * รูปอ้างอิงที่ยังไม่เคยอยู่ใน project (เช่นรูปผู้เขียน) อัปโหลดครั้งเดียวเข้าคอลเล็กชัน "00 รูปอ้างอิง"
   * แล้วตั้งชื่อ tile ตามชื่อไฟล์ — ครั้งต่อไปทุกรูปเลือกจากตัวเลือกสื่อด้วยชื่อนี้
   */
  async function ensureRefUploaded(r, refCollection) {
    if (!r?.dataUrl || !r.name) return;
    await openCollection(refCollection);
    if (SEL.tiles().some((t) => t.getAttribute('aria-label') === r.name && tileId(t))) return;
    const before = knownIds();
    const dt = new DataTransfer();
    dt.items.add(dataUrlToFile(r.dataUrl, r.name));
    const editor = await waitFor(SEL.editor, { label: 'ช่องพิมพ์' });
    editor.focus();
    editor.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    const up = await waitFor(
      () => {
        const t = SEL.tiles().find((x) => tileId(x) && !before.has(tileId(x)) && tileImg(x).naturalWidth > 0);
        return t && !chipsBusy() ? t : null;
      },
      { timeout: 60000, interval: 500, label: 'Flow อัปโหลดรูปอ้างอิง' },
    );
    if ((up.getAttribute('aria-label') || '') !== r.name) await renameTile(tileId(up), r.name).catch(() => false);
    await clearRefs();
  }

  /** วางรูปลงช่องพิมพ์ด้วย paste แบบเดียวกับ Ctrl+V (วิธีเดียวกับโปรเจกต์ Youtube ที่ใช้แนบรูปตัวละคร) */
  async function attachRefs(refs) {
    if (!refs?.length) return 0;
    const start = chips().length;
    const upload = [];
    for (const r of refs) {
      /**
       * รูปที่อัปโหลดแล้วกลายเป็น tile ชื่อเดียวกับไฟล์ (เช่น author-photo.jpg) — ตรวจกับหน้าจริงแล้ว
       * เดิมวางไฟล์ใหม่ทุกรูปทุกรอบ project หนึ่งเล่มจึงมีรูปผู้เขียนซ้ำสิบกว่าใบ
       * ตอนนี้หา tile เดิมก่อนเสมอ อัปโหลดเฉพาะครั้งแรกที่ยังไม่มี
       */
      if (r.tile && (await attachFromPicker(r.tile).catch(() => false))) continue;
      if (r.name && r.name !== r.tile && (await attachFromPicker(r.name).catch(() => false))) continue;
      if (r.tile && (await attachFromTile(r.tile).catch(() => false))) continue;
      if (r.dataUrl) upload.push(r);
    }
    if (!upload.length) return chips().length - start;
    const before = chips().length;
    const dt = new DataTransfer();
    for (const r of upload) dt.items.add(dataUrlToFile(r.dataUrl, r.name));
    const editor = await waitFor(SEL.editor, { label: 'ช่องพิมพ์' });
    editor.focus();
    editor.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    await waitFor(
      () =>
        chips().length >= before + upload.length &&
        !chipsBusy() &&
        !document.querySelector('flow-ingredient-chip mat-progress-spinner, flow-ingredient-chip [role="progressbar"]'),
      { timeout: 60000, interval: 500, label: 'Flow อัปโหลดรูปอ้างอิง' },
    );
    await sleep(800);
    return chips().length - start;
  }

  /** ล้างรูปอ้างอิงที่ค้างจากรอบก่อน — รูปที่ไม่ได้ตั้งใจแนบจะลากภาพไปผิดทาง */
  async function clearRefs() {
    // คลิกที่ chip = เอาออก (ไอคอน cancel ที่โผล่ตอนชี้คือตัวบอก) — ตรวจกับหน้าจริงแล้ว
    for (let guard = 0; guard < 10 && chips().length; guard++) {
      const before = chips().length;
      chipButton(chips()[0]).click();
      await waitFor(() => chips().length < before, { timeout: 3000, label: 'เอารูปอ้างอิงเก่าออก' }).catch(() => null);
    }
  }

  async function typePrompt(prompt) {
    const paste = async () => {
      const editor = await waitFor(SEL.editor, { label: 'ช่องพิมพ์' });
      editor.focus();
      // ล้างข้อความที่ค้างอยู่ก่อน ไม่งั้น prompt ใหม่ไปต่อท้ายของเก่า
      document.execCommand('selectAll', false);
      document.execCommand('delete', false);
      const data = new DataTransfer();
      data.setData('text/plain', prompt);
      editor.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
      await sleep(500);
      if (!text(SEL.editor())) {
        SEL.editor()?.focus();
        document.execCommand('insertText', false, prompt);
        await sleep(400);
      }
      return text(SEL.editor()).length > Math.min(20, prompt.length / 2);
    };
    for (let attempt = 0; attempt < 3; attempt++) {
      if (await paste()) return;
      await sleep(1200);
    }
    throw new Error('วาง prompt ลงช่องพิมพ์ของ Flow ไม่ได้');
  }

  // ── tile ของภาพใน project ──

  const tileImg = (tile) => tile.querySelector('img[data-media-id]');
  const tileId = (tile) => tileImg(tile)?.dataset.mediaId || null;
  const knownIds = () => new Set(SEL.tiles().map(tileId).filter(Boolean));

  /** กล่องที่เลื่อนได้จริงของ grid — ภาพใหม่โผล่บนสุด ต้องเลื่อนขึ้นไว้ให้ virtual scroll วาดมัน */
  function scrollGridTop() {
    const viewport = document.querySelector('cdk-virtual-scroll-viewport');
    for (let el = viewport; el; el = el.parentElement) {
      if (/(auto|scroll)/.test(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight + 10) {
        el.scrollTop = 0;
        return;
      }
    }
  }

  /**
   * "เราพบกิจกรรมที่ผิดปกติบางอย่าง" — Google เห็นว่าบัญชีนี้สั่งสร้างถี่/ผิดปกติ (ผู้ใช้เจอเต็มจอหลายใบ)
   * ต่างจากภาพล้มธรรมดา: ลองซ้ำคือยิ่งสั่งถี่ ยิ่งโดน · ต้องหยุดทั้งคิวแล้วเว้นระยะ (machine.js)
   */
  const UNUSUAL_TEXT = /unusual activity|กิจกรรมที่ผิดปกติ|ผิดปกติบางอย่าง|suspicious activity/i;
  const FAIL_TEXT = /fail|couldn.?t|unable|policy|violat|ไม่สำเร็จ|ล้มเหลว|ไม่สามารถ|นโยบาย|ละเมิด|ผิดพลาด/i;

  /**
   * รอภาพใหม่หนึ่งใบหลังกดสร้าง
   * สำเร็จ = มี tile ที่ media id ไม่เคยเห็นมาก่อน และภาพโหลดเสร็จแล้ว
   * ล้ม = tile ใหม่ที่ไม่มีภาพแต่มีข้อความบอกความผิดพลาด หรือกล่องแจ้งเตือนของหน้า
   */
  const RATIO = { '16:9': 16 / 9, '4:3': 4 / 3, '1:1': 1, '3:4': 3 / 4, '9:16': 9 / 16 };
  const ratioOk = (w, h, ratio) => !RATIO[ratio] || (w > 0 && h > 0 && Math.abs(Math.log(w / h / RATIO[ratio])) < 0.04);

  /**
   * tile ใหม่ที่ "ใช่" ต้องผ่านสามข้อ: media id ไม่เคยเห็น · ไม่ใช่ไฟล์ที่เราอัปโหลดเป็นรูปอ้างอิง ·
   * ภาพตรงสัดส่วนที่สั่ง — เดิมเช็คแค่ข้อแรก รูปผู้เขียนที่เพิ่งอัปโหลดโผล่ช้ากว่าการจดรายการ
   * จึงถูกหยิบไปเป็น "ภาพที่วาดได้" แล้วระบบสั่งวาดซ้ำจนภาพซ้ำเต็ม project
   */
  /**
   * tile ที่กำลังวาดมี <flow-pending-tile> และแสดง "image 47% <prompt>" — element เดียวกันนี้
   * กลายเป็นภาพที่เสร็จแล้ว (ตรวจกับหน้าจริงแล้ว) จึงตามตัว tile ของเราเองได้ตรง ๆ ไม่ต้องเดา
   */
  const isPending = (tile) => !!tile?.querySelector('flow-pending-tile');
  const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  const promptKey = (prompt) => norm(prompt).slice(0, 60);
  /** ข้อความบน tile โดยตัด prompt ของเราออก — prompt มีคำอย่าง "failed output" ที่ห้ามนับเป็นความผิดพลาด */
  const statusText = (tile, prompt) => {
    const t = text(tile);
    const k = promptKey(prompt).slice(0, 30);
    const i = k ? t.indexOf(k) : -1;
    return i >= 0 ? t.slice(0, i) : t;
  };

  /**
   * ปุ่ม "ลองใหม่อีกครั้ง" ที่ Flow แสดงบนภาพที่ล้ม (หรือในกล่องแจ้งเตือน)
   * ผู้ใช้: "บางทีกดสร้างภาพใน google flow จะเจอปุ่ม ลองใหม่อีกครั้ง ก็ให้กดลองใหม่อีกครั้งไปเลย"
   */
  const RETRY_TEXT = /ลองใหม่|ลองอีกครั้ง|try again|retry/i;
  const retryButton = (root) =>
    root ? $('button, [role="button"]', root).find((b) => visible(b) && !b.disabled && RETRY_TEXT.test(`${text(b)} ${b.getAttribute('aria-label') || ''}`)) : null;
  const FLOW_RETRY_CLICKS = 2;

  async function waitNewTile(before, beforeEls, opts = {}) {
    const deadline = Date.now() + (opts.timeout || 5 * 60000);
    for (let clicks = 0; ; clicks++) {
      const res = await waitNewTileOnce(before, beforeEls, { ...opts, timeout: Math.max(30000, deadline - Date.now()), canRetry: clicks < FLOW_RETRY_CLICKS });
      if (!res.retry) return { ...res, retried: clicks };
      // กดแบบคนกดจริง — ปุ่มของ Flow บางปุ่มไม่รับคลิกจากสคริปต์ (ดู trustedClick)
      at(`Flow ขึ้นปุ่ม "ลองใหม่อีกครั้ง" — กดให้ (ครั้งที่ ${clicks + 1}/${FLOW_RETRY_CLICKS})`);
      await trustedClick(res.retry);
      await sleep(3000);
    }
  }

  function waitNewTileOnce(before, beforeEls, { timeout = 5 * 60000, ratio = '', skipNames = [], prompt = '', canRetry = false } = {}) {
    const skip = new Set(skipNames.filter(Boolean));
    const key = promptKey(prompt);
    let mine = null; // tile กำลังวาดที่แสดง prompt ของเรา
    return waitFor(
      () => {
        scrollGridTop();
        if (!mine?.isConnected) {
          mine = key ? SEL.tiles().find((t) => isPending(t) && norm(text(t)).includes(key.slice(0, 40))) || null : null;
        }
        if (mine) {
          const id = tileId(mine);
          const img = tileImg(mine);
          if (id && img.complete && img.naturalWidth > 0) return { tile: mine, id };
          if (!id && !isPending(mine) && FAIL_TEXT.test(statusText(mine, prompt))) {
            const why = statusText(mine, prompt);
            // ล้มธรรมดาและมีปุ่มลองใหม่ = กดลองใหม่ · "กิจกรรมที่ผิดปกติ" ห้ามกดซ้ำ (ยิ่งสั่งถี่ยิ่งโดน) ต้องหยุดทั้งคิว
            const again = canRetry && !UNUSUAL_TEXT.test(why) ? retryButton(mine) : null;
            if (again) return { retry: again };
            const e = new Error(`Flow สร้างภาพไม่สำเร็จ: ${why.slice(0, 200) || 'ไม่ทราบสาเหตุ'}`);
            e.code = UNUSUAL_TEXT.test(why) ? 'unusual_activity' : 'generation_failed';
            throw e;
          }
          return null;
        }
        // ทางสำรองเมื่อหา tile ของเราด้วยข้อความไม่เจอ: ต้องเป็น tile ที่เกิดหลังส่งงานนี้จริง ๆ
        // ภาพรอบก่อนที่ยัง pending ตอนจด before จะเพิ่งได้ media id ภายหลังและมีสัดส่วนเดียวกัน
        // จึงห้ามใช้แค่ !before.has(id) มิฉะนั้นปกหน้าจะถูกบันทึกเป็นปกหลัง
        for (const tile of SEL.tiles()) {
          const id = tileId(tile);
          const img = tileImg(tile);
          if (
            id &&
            !before.has(id) &&
            !beforeEls.has(tile) &&
            img.complete &&
            img.naturalWidth > 0 &&
            !skip.has(tile.getAttribute('aria-label') || '') &&
            ratioOk(img.naturalWidth, img.naturalHeight, ratio)
          )
            return { tile, id };
        }
        const alert = $$('[role="alert"], mat-snack-bar-container, .mat-mdc-snack-bar-container').find(
          (a) => visible(a) && FAIL_TEXT.test(text(a)),
        );
        if (alert) {
          const again = canRetry && !UNUSUAL_TEXT.test(text(alert)) ? retryButton(alert) : null;
          if (again) return { retry: again };
          const e = new Error(`Flow แจ้งว่า: ${text(alert).slice(0, 200)}`);
          e.code = UNUSUAL_TEXT.test(text(alert)) ? 'unusual_activity' : 'generation_failed';
          throw e;
        }
        return null;
      },
      { timeout, interval: 1500, label: 'ภาพใหม่จาก Flow' },
    );
  }

  const findTile = (id) => SEL.tiles().find((t) => tileId(t) === id);

  async function openTileMenu(id) {
    // เมนูจาก tile ก่อนหน้าห้ามหลงเหลือ ไม่เช่นนั้นจะเลือกดาวน์โหลดจากเจ้าของเมนูเก่า
    if ($$('[role="menuitem"]').some(visible)) {
      escape();
      await waitFor(() => !$$('[role="menuitem"]').some(visible), { timeout: 2000, label: 'ปิดเมนูภาพก่อนหน้า' });
    }
    const tile = await waitFor(() => findTile(id), { timeout: 10000, label: 'tile ของภาพ' });
    tile.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    tile.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    tile.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    await sleep(300);
    /**
     * ปุ่มเมนู (more_vert) ของภาพโผล่เฉพาะตอนเมาส์จริงชี้ tile อยู่ — คลิกด้วยพิกัดจึงหาจุดคลิกไม่เจอ ("ตำแหน่งปุ่มใน Flow เปลี่ยนหรือมีแผงบัง")
     * แล้วขอไฟล์ 2K/1K ไม่ได้ ต้องถอยไปใช้ภาพย่อบนการ์ด (ปกได้ราว 145 dpi) — เจอจริงกับปกหน้า ปกหลัง และลายพื้นหลัง
     * เมนูนี้รับคลิกของสคริปต์ได้ (ทางเดิมก่อนเปลี่ยน) จึงลองทางนั้นก่อน ไม่ขึ้นเมนูค่อยใช้คลิกพิกัด
     */
    {
      const current = findTile(id);
      const buttons = current ? $$('button', current) : [];
      const more = buttons.find((b) => /more|เพิ่มเติม/i.test(b.getAttribute('aria-label') || '') || text(b) === 'more_vert') || buttons.at(-1);
      if (more) {
        realClick(more);
        const opened = await waitFor(() => $$('[role="menuitem"]').filter(visible).length && $$('[role="menuitem"]').filter(visible), {
          timeout: 1500,
          label: 'เมนูของภาพ',
        }).catch(() => null);
        if (opened) return opened;
      }
    }
    // virtual scroll เปลี่ยนเจ้าของ DOM node หลังเลื่อนได้: หา tile ด้วย media id ใหม่ทุกครั้งก่อนกด
    await trustedClick(() => {
      const current = findTile(id);
      if (!current) return null;
      current.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      const buttons = $$('button', current);
      return buttons.find((b) => /more|เพิ่มเติม/i.test(b.getAttribute('aria-label') || '') || text(b) === 'more_vert') || buttons.at(-1);
    });
    return waitFor(() => $$('[role="menuitem"]').filter(visible).length && $$('[role="menuitem"]').filter(visible), {
      timeout: 5000,
      label: 'เมนูของภาพ',
    });
  }

  const menuItem = (icon) => $$('[role="menuitem"]').find((m) => visible(m) && text(m).startsWith(icon));

  /** เปลี่ยนชื่อภาพใน Flow เป็นชื่อไฟล์ที่วางแผนไว้ — ให้คนเปิด project ดูแล้วรู้ว่ารูปไหนไปหน้าไหน */
  async function renameTile(id, name) {
    const tile = findTile(id);
    const old = tile?.getAttribute('aria-label') || '';
    if (!name || old === name) return true;
    await openTileMenu(id);
    const item = menuItem('edit');
    if (!item) {
      escape();
      return false;
    }
    realClick(item);
    const input = await waitFor(
      () => $$('input').find((i) => visible(i) && i.value === old && !i.closest('header')) || null,
      { timeout: 5000, label: 'ช่องเปลี่ยนชื่อภาพ' },
    ).catch(() => null);
    if (!input) {
      escape();
      return false;
    }
    await typeIntoInput(input, name);
    return (findTile(id)?.getAttribute('aria-label') || '') === name;
  }

  const blobToDataUrl = (blob) =>
    new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = () => reject(fr.error || new Error('อ่านไฟล์ภาพไม่สำเร็จ'));
      fr.readAsDataURL(blob);
    });

  /** ลายนิ้วมือภาพ 8×8 ระดับเทา — ทนการย่อ/บีบอัด ใช้บอกว่า "ภาพเดียวกันไหม" */
  async function aHash(blob) {
    const bmp = await createImageBitmap(blob);
    const c = new OffscreenCanvas(8, 8);
    const x = c.getContext('2d');
    x.drawImage(bmp, 0, 0, 8, 8);
    bmp.close?.();
    const d = x.getImageData(0, 0, 8, 8).data;
    const g = [];
    for (let i = 0; i < d.length; i += 4) g.push(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
    const avg = g.reduce((m, v) => m + v, 0) / g.length;
    return g.map((v) => (v > avg ? 1 : 0));
  }
  const hamming = (a, b) => a.reduce((n, v, i) => n + (v !== b[i] ? 1 : 0), 0);

  async function imageSize(blob) {
    const bmp = await createImageBitmap(blob);
    const out = { width: bmp.width, height: bmp.height };
    bmp.close?.();
    return out;
  }

  /**
   * ดาวน์โหลด 2K ผ่านเมนูของ Flow แล้วดักไฟล์ไว้ก่อนลงโฟลเดอร์ Downloads (ดู adapter/flow-main.js)
   * ขยาย 2K ใช้เวลาราว 5–20 วินาทีและไม่กินเครดิต (ตรวจกับบัญชีจริงแล้ว)
   */
  /** ง้างตัวดักไฟล์ดาวน์โหลดหนึ่งไฟล์ (adapter/flow-main.js) — คืน { token, got } */
  function armCapture(ms, size) {
    const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const got = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        window.removeEventListener('message', onMsg);
        reject(new Error(`Flow ไม่ส่งไฟล์ ${size} มาภายในเวลา`));
      }, ms);
      function onMsg(e) {
        const d = e.data;
        if (e.source !== window || d?.source !== 'ebookplus-main' || d.token !== token) return;
        clearTimeout(timer);
        window.removeEventListener('message', onMsg);
        d.type === 'captured' ? resolve(d.blob) : reject(new Error(d.error || 'ดักไฟล์ไม่สำเร็จ'));
      }
      window.addEventListener('message', onMsg);
    });
    window.postMessage({ source: 'ebookplus-iso', type: 'arm', token, ms }, '*');
    return { token, got };
  }

  /**
   * verify(blob) → '' ถ้าเป็นภาพของ tile นี้ หรือข้อความบอกว่าไม่ตรงเพราะอะไร
   *
   * ไฟล์ 2K ทำช้า (Flow ขยายภาพก่อนแล้วค่อยดาวน์โหลดเอง) ไฟล์ของรูปก่อนหน้าจึงมาถึงตอนที่เรารอรูปนี้ได้
   * เดิมเจอไฟล์ไม่ตรงก็ยอมแพ้ทันทีแล้วใช้ภาพย่อ — ไฟล์ของรูปนี้เองจึงไปตกที่รูปถัดไปอีก เลื่อนกันไปทั้งเล่ม
   * (เจอจริง: 35 จาก 37 รูปได้แค่ภาพย่อ ต่างกัน 13–29/64 ทุกรูป)
   * ตอนนี้ทิ้งไฟล์ที่ไม่ตรงแล้วรอไฟล์ถัดไปต่ออีกระยะ ไฟล์ของรูปนี้มักตามมาไม่กี่วินาที
   */
  async function download2k(id, size = '2K', verify = null) {
    const waitMs = size === '1K' ? 20000 : 150000;
    const strayWaitMs = size === '1K' ? 15000 : 60000;
    let cap = armCapture(waitMs, size);
    try {
      await openTileMenu(id);
      const dl = menuItem('download');
      if (!dl) throw new Error('ไม่พบเมนูดาวน์โหลดของภาพ');
      realClick(dl);
      const pick = await waitFor(() => $$('[role="menuitem"]').find((m) => visible(m) && text(m).startsWith(size)), {
        timeout: 5000,
        label: `ตัวเลือก ${size}`,
      });
      realClick(pick);
      let mismatch = '';
      for (let stray = 0; stray < 4; stray++) {
        let blob;
        try {
          blob = await cap.got;
        } catch (e) {
          throw mismatch ? new Error(mismatch) : e;
        }
        const why = verify ? await verify(blob) : '';
        if (!why) {
          escape();
          return blob;
        }
        mismatch = why;
        if (stray === 3) break;
        cap = armCapture(strayWaitMs, size); // ไฟล์ที่มาถึงเป็นของรูปอื่น — รอไฟล์ถัดไป
      }
      throw new Error(mismatch);
    } catch (e) {
      window.postMessage({ source: 'ebookplus-iso', type: 'disarm', token: cap.token }, '*');
      escape();
      cap.got.catch(() => {});
      throw e;
    }
  }

  async function fetchTileImage(id) {
    const img = tileImg(findTile(id));
    const src = img?.currentSrc || img?.src;
    if (!src) throw new Error('ไม่พบไฟล์ภาพบน tile');
    /**
     * ภาพที่เพิ่งวาดเสร็จอยู่บน flow-content.google ซึ่งตอบ CORS แบบไม่รับ cookie
     * ขอพร้อม credentials แล้วโดนปฏิเสธ ("Failed to fetch") — ลองแบบไม่แนบก่อน (ตรวจกับหน้าจริงแล้ว)
     * ถ้ายังไม่ได้ ให้ service worker ดึงแทนด้วยสิทธิ์ของส่วนขยาย
     */
    const errors = [];
    for (const opts of [{}, { credentials: 'include' }]) {
      try {
        const r = await fetch(src, opts);
        if (r.ok) return r.blob();
        errors.push(`HTTP ${r.status}`);
      } catch (e) {
        errors.push(e?.message || String(e));
      }
    }
    if (typeof chrome !== 'undefined' && chrome.runtime?.id) {
      const res = await chrome.runtime.sendMessage({ type: 'sw.fetchImage', url: src }).catch((e) => ({ ok: false, error: e?.message }));
      if (res?.ok && res.dataUrl) return fetch(res.dataUrl).then((r) => r.blob());
      errors.push(res?.error || 'service worker ดึงไม่ได้');
    }
    throw new Error(`โหลดภาพจาก Flow ไม่ได้ (${errors.join(' · ')})`);
  }

  // ── Flow Agent: ภาพชุดใหญ่ด้วยคำสั่งเดียว ──
  /**
   * ภาพโหมด "1 หน้า 1 ภาพ" หลายสิบรูปต่อเล่ม — สั่งทีละรูปดูผิดปกติในสายตา Google (ผู้ใช้เจอ "พบกิจกรรมที่ผิดปกติ")
   * ผู้ใช้เลือกให้ส่งเป็นชุดผ่าน Agent แบบโปรเจกต์ Youtube Free animation Auto (content-flow-agent.js ตรวจกับหน้าจริง ก.ย. 2026)
   * ลำดับ: ตรวจ 0 เครดิตที่ช่องพิมพ์ปกติ → ตั้ง Agent (Image · สัดส่วน · x1 · โมเดลเดียวกัน · ไม่ต้องยืนยัน) →
   *        แนบภาพต้นแบบตัวละคร → ส่ง brief ทั้งชุด → รอ agent นิ่ง → สั่งตั้งชื่อ/สั่งช็อตที่ขาด → คืนรายชื่อภาพที่ได้
   * ตัวภาพดึงทีหลังด้วย generate (onlyExisting) ทีละชื่อ — ไม่สร้างภาพใหม่
   */
  const AL = {
    settings: ['Settings', 'การตั้งค่า'],
    save: ['Save', 'บันทึก'],
    stop: ['Stop', 'หยุด', 'หยุดสร้าง'],
    back: ['Back', 'กลับ'],
    imageModel: ['Image generation default model', 'โมเดลเริ่มต้นของการสร้างรูปภาพ'],
    imageDefault: /Image generation default|ค่าเริ่มต้นสำหรับการสร้างรูปภาพ/,
    videoDefault: /Video generation default|ค่าเริ่มต้นของการสร้างวิดีโอ/,
    never: /^(Never|ไม่เลย)/,
    highDemand: /experiencing high demand|มีผู้ใช้งานจำนวนมาก|มีความต้องการสูง/gi,
  };
  const byAria = (labels, root = document, tag = 'button') => $$(tag, root).filter((b) => labels.includes(b.getAttribute('aria-label')));
  const agentPanel = () => document.querySelector('flow-agent-panel');
  const agentBusy = () => !!byAria(AL.stop).find(visible);
  const agentSettingsTrigger = () => {
    if (!agentOn()) return null;
    return scopedAgentSettings() || scopedAgentSettings(true);
  };
  const AGENT_GAP_MS = 2 * 60000; // เว้นอย่างน้อย 2 นาทีระหว่างข้อความที่ส่งให้ Agent (ค่าเดียวกับโปรเจกต์ Youtube)
  let lastAgentPromptAt = 0;

  async function agentOn_() {
    await closeAgentChat();
    for (let attempt = 0; attempt < 2 && !agentOn(); attempt++) {
      const chip = await waitFor(SEL.agentChip, { label: 'ปุ่ม Agent' });
      await trustedClick(chip);
      if (await waitFor(agentOn, { timeout: 8000, label: 'เปิด Agent' }).catch(() => false)) break;
    }
    if (!agentOn()) throw new Error('เปิดโหมด Agent ของ Flow ไม่สำเร็จ — กดปุ่ม Agent ในช่องพิมพ์เองแล้วสั่งใหม่');
  }

  /** รอจนแผงหยุดวาดใหม่ — แผง Agent settings โหลดค่าที่บันทึกไว้แล้ววาดทับหลังเปิดไม่กี่ร้อยมิลลิวินาที */
  async function waitSettled(getRoot, { quietMs = 1200, timeout = 15000 } = {}) {
    const deadline = Date.now() + timeout;
    let last = '';
    let since = Date.now();
    while (Date.now() < deadline) {
      const root = getRoot();
      const snap = root ? `${root.innerHTML.length}|${$$('[aria-checked="true"], input:checked', root).length}|${text(root)}` : '';
      if (snap !== last) {
        last = snap;
        since = Date.now();
      } else if (root && Date.now() - since >= quietMs) return root;
      await sleep(200);
    }
    return getRoot();
  }

  async function configureAgent(model, ratio) {
    await agentOn_();
    const openPanel = () => {
      const panel = agentPanel();
      return visible(panel) && /Agent settings|การตั้งค่า Agent/i.test(text(panel).slice(0, 120)) ? panel : null;
    };
    if (!openPanel()) {
      const settings = await waitFor(agentSettingsTrigger, { label: 'ปุ่ม Settings ข้าง Agent' });
      await trustedClick(settings);
    }
    await waitFor(openPanel, { label: 'Agent settings' });
    await waitSettled(openPanel);
    // query ใหม่ทุกครั้ง — แผงวาดใหม่แล้ว element เดิมหลุดจากหน้า
    const read = () => {
      const panel = openPanel();
      if (!panel) return null;
      const labels = $$('.settings-section-label', panel);
      const imageLabel = labels.find((l) => AL.imageDefault.test(text(l)));
      const videoLabel = labels.find((l) => AL.videoDefault.test(text(l)));
      const inImage = (el) =>
        imageLabel && imageLabel.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING &&
        (!videoLabel || videoLabel.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_PRECEDING);
      const buttons = $$('button[role="radio"]', panel).filter(inImage);
      const never = $$('mat-radio-button', panel).find((r) => AL.never.test(text(r)));
      const modelBtn = byAria(AL.imageModel, panel)[0];
      const checked = (re) => text(buttons.find((b) => b.getAttribute('aria-checked') === 'true' && re.test(text(b)))).split(' ').pop();
      return {
        panel, buttons, modelBtn,
        neverInput: never?.querySelector('input[type="radio"]'),
        state: {
          confirm: never?.querySelector('input')?.checked ? 'Never' : 'Always',
          ratio: checked(/:/),
          count: checked(/(^|\s)x\d$/),
          model: text(modelBtn).replace(/arrow_drop_down/, '').replace(/^\S+\s/, '').trim(),
        },
      };
    };
    const ok = (st) => st.confirm === 'Never' && st.ratio === ratio && st.count === 'x1' && st.model === model;
    for (let attempt = 1; attempt <= 4; attempt++) {
      let cur = read();
      if (!cur) throw new Error('แผง Agent settings ปิดไปเอง');
      if (ok(cur.state)) break;
      // ไม่ต้องยืนยันก่อนสร้าง → agent วาดต่อเนื่องเองทั้งชุด
      if (cur.state.confirm !== 'Never' && cur.neverInput) {
        realClick(cur.neverInput);
        await sleep(400);
      }
      for (const label of [ratio, 'x1']) {
        cur = read();
        const btn = cur?.buttons.find((b) => text(b).split(' ').pop() === label);
        if (!btn) throw new Error(`ไม่พบตัวเลือก ${label} ใน Agent settings`);
        if (btn.getAttribute('aria-checked') !== 'true') {
          realClick(btn);
          await sleep(400);
        }
      }
      cur = read();
      if (cur && cur.state.model !== model) {
        realClick(cur.modelBtn);
        const item = await waitFor(() => $$('[role="menuitem"]').find((m) => visible(m) && text(m).replace(/^\S+\s/, '') === model), {
          timeout: 5000,
          label: `เมนูโมเดล ${model}`,
        }).catch(() => null);
        if (item) realClick(item);
        else escape();
        await sleep(700);
      }
      await waitSettled(openPanel, { quietMs: 600, timeout: 5000 });
      if (attempt === 4 && !ok(read()?.state ?? {})) {
        const st = read()?.state ?? {};
        throw new Error(`ตั้ง Agent settings ไม่สำเร็จ (ตอนนี้: ${st.confirm} · ${st.ratio} · ${st.count} · ${st.model}) — ตั้งเองในแผง Agent settings เป็น ไม่เลย · ${ratio} · x1 · ${model} แล้วกดบันทึก แล้วสั่งใหม่`);
      }
    }
    // Flow ไม่ตอบสนองต่อ click แบบสังเคราะห์ของปุ่มนี้ แม้ตัวเลือกในแผงจะเปลี่ยนแล้ว
    // กดจริงและตรวจว่าปุ่มไม่ถูก Side Panel บัง ก่อนถือว่าบันทึกสำเร็จ
    await trustedClick(await waitFor(() => $$('button', openPanel() ?? document).find((b) => AL.save.includes(text(b))), { label: 'ปุ่มบันทึกของ Agent settings' }));
    await waitFor(() => !openPanel(), { timeout: 10000, label: 'บันทึก Agent settings' });
    await sleep(800);
  }

  // grid เป็น virtual scroll (วาดเฉพาะที่อยู่บนจอ) — จำทุก tile ที่เคยโผล่ ชื่อภาพคือ aria-label ของ tile
  const seenTiles = new Map(); // media id → ชื่อ
  const seenTileText = new Map(); // media id → ข้อความ prompt/รายละเอียดที่อยู่บน tile
  function collectTiles() {
    for (const t of SEL.tiles()) {
      const id = tileId(t);
      if (id) {
        seenTiles.set(id, t.getAttribute('aria-label') || '');
        const detail = [text(t), tileImg(t)?.alt, tileImg(t)?.title, t.title].filter(Boolean).join(' ');
        if (detail && !seenTileText.get(id)?.includes(detail)) seenTileText.set(id, `${seenTileText.get(id) || ''} ${detail}`.slice(-4000));
      }
    }
    return seenTiles;
  }
  new MutationObserver(() => collectTiles()).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-label', 'src'] });

  function gridScroller() {
    const viewport = document.querySelector('cdk-virtual-scroll-viewport');
    if (!viewport) return null;
    for (let el = viewport; el; el = el.parentElement) {
      if (/(auto|scroll)/.test(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight + 10) return el;
    }
    return viewport;
  }

  /** ให้ tile ทุกใบถูกวาดอย่างน้อยหนึ่งครั้ง: ย่อหน้าจอชั่วคราว (วาดทุกใบพร้อมกัน) แล้วเลื่อนไล่อีกรอบเป็นทางสำรอง */
  async function scanAllTiles() {
    collectTiles();
    const html = document.documentElement;
    const old = html.style.zoom;
    html.style.zoom = '0.06';
    window.dispatchEvent(new Event('resize'));
    let last = -1;
    for (let i = 0; i < 20; i++) {
      await sleep(700);
      collectTiles();
      const loaded = SEL.tiles().filter(tileId).length;
      if (loaded === last && i >= 3) break;
      last = loaded;
    }
    html.style.zoom = old;
    window.dispatchEvent(new Event('resize'));
    await sleep(500);
    const scroller = gridScroller();
    if (scroller) {
      scroller.scrollTop = 0;
      await sleep(400);
      for (let guard = 0; guard < 600; guard++) {
        collectTiles();
        const before = scroller.scrollTop;
        scroller.scrollTop += Math.max(200, scroller.clientHeight * 0.7);
        await sleep(400);
        if (scroller.scrollTop === before) break;
      }
      collectTiles();
      scroller.scrollTop = 0;
    }
    return seenTiles;
  }

  /** เลื่อน grid จน tile ของภาพนี้ถูกวาด — เมนูดาวน์โหลด 2K ต้องกดจากตัว tile จริง */
  async function revealTile(id) {
    if (findTile(id)) return true;
    const scroller = gridScroller();
    if (!scroller) return false;
    scroller.scrollTop = 0;
    await sleep(400);
    for (let guard = 0; guard < 600 && !findTile(id); guard++) {
      const before = scroller.scrollTop;
      scroller.scrollTop += Math.max(200, scroller.clientHeight * 0.7);
      await sleep(350);
      if (scroller.scrollTop === before) break;
    }
    return !!findTile(id);
  }

  /** รหัสภาพที่ Agent รายงานอาจเปลี่ยนหลัง Flow จัด grid ใหม่ แต่ชื่อที่ตั้งไว้ยังอยู่ใน project */
  async function recoverTileByName(name) {
    const matches = () => [...seenTiles].filter(([, label]) => label === name).map(([id]) => id);
    await scanAllTiles();
    const ids = matches();
    if (ids.length !== 1 || !(await revealTile(ids[0]))) return null;
    return findTile(ids[0])?.getAttribute('aria-label') === name ? ids[0] : null;
  }

  /** กู้ภาพที่ Agent ตั้งชื่อไว้แล้วก่อนสั่งวาดใหม่เมื่อกลับมาทำเล่มต่อ */
  async function opLookupNamed({ names = [] } = {}) {
    await openProject();
    await goRoot();
    await scanAllTiles();
    const mediaIds = {};
    for (const name of [...new Set(names)]) {
      const ids = [...seenTiles].filter(([, label]) => label === name).map(([id]) => id);
      if (ids.length === 1 && await revealTile(ids[0]) && findTile(ids[0])?.getAttribute('aria-label') === name) {
        mediaIds[name] = ids[0];
      }
    }
    return { mediaIds, projectUrl: location.href };
  }

  /** Agent เห็นรหัสช็อตชั่วคราวเท่านั้น; ชื่อไฟล์จริงใช้หลังวาดเสร็จ */
  const nameMatches = (label, name) => label === name || label.startsWith(`${name} `);
  function namedIds(shots, made) {
    const out = new Map();
    for (const [id, label] of collectTiles()) {
      if (!made.includes(id)) continue;
      for (const s of shots) {
        if (!out.has(s.name) && (nameMatches(label, s.key) || nameMatches(label, s.name))) out.set(s.name, id);
      }
    }
    return out;
  }

  /** จับคู่จากรหัสช็อตบน tile; ห้ามเดาจากลำดับภาพใน grid */
  async function findAgentShots(shots, made) {
    const picks = namedIds(shots, made);
    const used = new Set(picks.values());
    for (const id of made) {
      if (used.has(id)) continue;
      const detail = `${seenTiles.get(id) || ''} ${seenTileText.get(id) || ''}`;
      const hits = shots.filter((s) => {
        const at = detail.indexOf(s.key);
        if (at < 0) return false;
        const prev = detail[at - 1] || '';
        const next = detail[at + s.key.length] || '';
        return !/[\w.-]/.test(prev) && !/[\w.-]/.test(next);
      }).map((s) => s.name);
      // หนึ่ง tile กล่าวถึงหลายชื่อไฟล์ = บอกไม่ได้ว่าเป็นภาพไหน จึงไม่แตะ
      if (hits.length !== 1 || picks.has(hits[0])) continue;
      picks.set(hits[0], id);
      used.add(id);
    }
    // ขอเพียงช็อตเดียวและมีภาพใหม่ใบเดียวใน session นี้: รู้ที่มาแน่ แม้ Agent ไม่ระบุชื่อใน tile
    if (shots.length === 1 && made.length === 1 && !picks.has(shots[0].name)) {
      picks.set(shots[0].name, made[0]);
    }
    return picks;
  }

  async function sendAgentPrompt(prompt) {
    const wait = lastAgentPromptAt + AGENT_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    if (agentBusy()) await waitFor(() => !agentBusy(), { timeout: 15 * 60000, interval: 2000, label: 'Agent ว่าง' });
    await typePrompt(prompt);
    const send = await waitFor(() => (SEL.send() && !SEL.send().disabled ? SEL.send() : null), { label: 'ปุ่มส่งของ Agent' });
    lastAgentPromptAt = Date.now();
    let taken = false;
    for (let attempt = 0; attempt < 3 && !taken; attempt++) {
      const btn = attempt === 0 ? send : SEL.send();
      if (btn && !btn.disabled) await trustedClick(SEL.send);
      taken = !!(await waitFor(() => agentBusy() || text(SEL.editor()).length < 5, { timeout: 15000, label: 'Agent รับข้อความ' }).catch(() => false));
    }
    if (!taken) throw new Error('ส่งข้อความให้ Flow Agent ไม่สำเร็จ (ข้อความยังค้างในช่องพิมพ์)');
  }

  /** agent นิ่ง = ไม่มีปุ่มหยุดนาน 75 วินาที (ระหว่างวาดปุ่มหยุดอาจหายแวบ ๆ) · เพดานรอบละ 45 นาที */
  async function waitAgentIdle(maxMs = 45 * 60000) {
    const started = Date.now();
    let idleSince = null;
    for (;;) {
      await sleep(5000);
      collectTiles();
      if (unusualShown()) return 'unusual';
      if (agentBusy()) idleSince = null;
      else {
        idleSince ??= Date.now();
        if (Date.now() - idleSince > 75000) return 'idle';
      }
      if (Date.now() - started > maxMs) return 'timeout';
    }
  }

  const unusualShown = () =>
    SEL.tiles().some((t) => !tileId(t) && UNUSUAL_TEXT.test(text(t))) || UNUSUAL_TEXT.test(text(agentPanel()));
  const highDemandCount = () => (text(agentPanel()).match(AL.highDemand) || []).length;

  const shotList = (shots) => shots.map((s) => s.line).join('\n\n');
  const goInstruction = (shots) =>
    `เริ่มสร้างภาพได้เลยทุกช็อตตาม shot list ที่ส่งไป ไม่ต้องถามยืนยันและไม่ต้องสรุปแผน ใช้ STYLE BIBLE และ CHARACTER LOCK เดิม\nตั้งชื่อการ์ดภาพด้วยรหัสช็อตหน้าบรรทัด เช่น "${shots[0].key}" (ชื่อการ์ดเท่านั้น ห้ามวาดลงในภาพ)`;
  const renameInstruction = (shots) =>
    `เปลี่ยนชื่อการ์ดภาพที่สร้างแล้วให้ตรงกับรหัสช็อตชั่วคราว เช่น ภาพของ\n\n${shots[0].line}\n\nให้ชื่อการ์ดว่า ${shots[0].key}\n\nห้ามสร้างภาพใหม่ และห้ามวาดรหัสลงในภาพ`;
  const continueInstruction = (batch, remaining) =>
    `ยังขาดภาพอีก ${remaining} ช็อต — รอบนี้สร้าง ${batch.length} ช็อตนี้ ใช้ STYLE BIBLE และ CHARACTER LOCK เดิมทุกอย่าง (ตัวละครหน้าตาเหมือนภาพที่ทำไปแล้ว)\nตั้งชื่อการ์ดภาพด้วยรหัสช็อตหน้าบรรทัด (ห้ามวาดรหัสหรือชื่อภาพลงในภาพ) ข้อความอธิบายที่จำเป็นในฉากต้องเป็นภาษาของหนังสือตาม brief เดิม\n\n${shotList(batch)}`;

  async function agentBaseline() {
    at('นับภาพเดิมใน project');
    await scanAllTiles();
    // งานเก่าที่ยังวาดอยู่จะได้ media id หลังจด baseline และอาจถูกจับเป็นภาพใหม่
    try {
      await waitFor(() => !agentBusy() && !SEL.tiles().some(isPending), { timeout: 6 * 60000, interval: 2000, label: 'ภาพ Agent ก่อนหน้า' });
    } catch {
      const e = new Error('Flow Agent ยังวาดภาพก่อนหน้าไม่เสร็จ — หยุดก่อนเพื่อไม่ให้ภาพนั้นถูกจับเป็นภาพถัดไป');
      e.code = 'flow_pending';
      throw e;
    }
    await scanAllTiles();
    return new Set(collectTiles().keys());
  }

  async function opAgentBatch(args = {}) {
    const shots = args.shots || [];
    if (!shots.length) return { named: [], missing: [] };
    const wanted = shots.map((s) => s.name);
    at('เปิด project');
    await openProject();
    await goRoot();
    if (args.refCollection) {
      for (const r of args.refs || []) {
        if (!r.dataUrl || r.tile) continue;
        at(`เตรียมภาพต้นแบบ ${r.name}`);
        await ensureRefUploaded(r, args.refCollection).catch(() => {});
      }
      await goRoot();
    }
    at(`ตรวจ 0 เครดิต ${args.ratio}`);
    const cfg = await configure({ ratio: args.ratio, models: args.models, agentOnly: true }); // Agent ตั้งสัดส่วนเอง; ตรวจว่าโมเดลที่ใช้เป็น 0 เครดิต
    at('ตั้งค่า Agent');
    await configureAgent(cfg.model, args.ratio);
    at('ภาพต้นแบบตัวละคร');
    await clearRefs();
    let attachError = '';
    let attached = 0;
    if (args.refs?.length) {
      await attachRefs(args.refs)
        .then(() => {
          attached = chips().length;
        })
        .catch((e) => {
          attachError = e?.message || String(e);
        });
      /**
       * นับว่าแนบภาพต้นแบบได้ครบจริง — เดิมแนบไม่ครบแบบไม่มี error ก็เงียบ ภาพออกมาหน้าตาเพี้ยนโดยไม่มีใครรู้
       * (ผู้ใช้: "ทำไมภาพนิยายไม่แนบหน้าตัวละครไปด้วยหละ")
       */
      if (!attachError && attached < args.refs.length) attachError = `แนบภาพต้นแบบได้ ${attached}/${args.refs.length} ภาพ`;
      // ตัวละครต้องถูกคน — แนบไม่ครบ = ไม่ให้ Agent วาดชุดนี้ ให้ Studio แจ้งปัญหา
      if (attachError && args.requireRefs) {
        const e = new Error(`แนบภาพต้นแบบตัวละครไม่ครบ (${attachError}) — ไม่ส่งชุดนี้ให้ Agent`);
        e.code = 'refs_not_attached';
        throw e;
      }
    }
    const base = await agentBaseline();
    const seenDemandAtStart = highDemandCount();
    at('ส่ง brief ให้ Agent');
    await sendAgentPrompt(args.brief);

    let nudges = 0;
    let stalls = 0;
    let busyWaits = 0;
    let seenDemand = seenDemandAtStart;
    let picks = new Map();
    // ถ้า Agent ไม่ตั้งชื่อหลังสั่งซ้ำไม่กี่ครั้ง ให้เครื่องกู้ทีละช็อตโดยอ้างอิง media id แทน
    for (let round = 1; round <= (shots.length === 1 ? 3 : 4); round++) {
      at(`Agent กำลังวาด (รอบ ${round})`);
      const before = collectTiles().size;
      const how = await waitAgentIdle();
      if (how === 'unusual') {
        const e = new Error('Flow แจ้งว่า: เราพบกิจกรรมที่ผิดปกติบางอย่าง');
        e.code = 'unusual_activity';
        throw e;
      }
      if (how === 'timeout') {
        const e = new Error('Flow Agent ยังทำงานเกิน 45 นาที — หยุดรอ ไม่ส่งคำสั่งซ้ำขณะงานเดิมยังไม่จบ');
        e.code = 'agent_timeout';
        throw e;
      }
      await scanAllTiles();
      const made = [...collectTiles().keys()].filter((id) => !base.has(id));
      picks = await findAgentShots(shots, made);
      // ยังไม่มีภาพใหม่เลย = agent ถามยืนยัน/สรุปแผนแทนการวาด → สั่งให้เริ่ม
      if (!made.length && !picks.size && nudges < 3) {
        nudges++;
        await sendAgentPrompt(goInstruction(shots));
        continue;
      }
      // มีภาพใหม่ที่ยังไม่ได้ตั้งชื่อ → ให้ agent ตั้งชื่อก่อน
      const unnamed = made.filter((id) => !shots.some((s) => nameMatches(seenTiles.get(id) || '', s.key) || nameMatches(seenTiles.get(id) || '', s.name))).length;
      if (unnamed > 0 && picks.size < wanted.length) {
        at('ให้ Agent ตั้งชื่อภาพ');
        await sendAgentPrompt(renameInstruction(shots.filter((s) => !picks.has(s.name))));
        await waitAgentIdle();
        await scanAllTiles();
        picks = await findAgentShots(shots, made);
      }
      const missing = shots.filter((s) => !picks.has(s.name));
      if (!missing.length) break;
      // Flow คิวเต็ม → ไม่นับเป็นรอบที่ล้ม รอนานขึ้นเรื่อย ๆ แล้วสั่งช็อตที่ขาด
      if (highDemandCount() > seenDemand) {
        seenDemand = highDemandCount();
        const wait = [2, 4, 8][Math.min(busyWaits++, 2)] * 60000;
        if (busyWaits > 4) break;
        at(`Flow คิวเต็ม รอ ${wait / 60000} นาที`);
        await sleep(wait);
      } else {
        busyWaits = 0;
        stalls = collectTiles().size > before ? 0 : stalls + 1;
        if (stalls >= 3) break;
      }
      await sendAgentPrompt(continueInstruction(missing.slice(0, 10), missing.length));
    }
    // ตั้งชื่อไฟล์จริงหลังสร้างภาพทั้งหมดเสร็จแล้วเท่านั้น ชื่อไฟล์จึงไม่อยู่ในคำสั่งวาด
    for (const [name, id] of picks) {
      if (await revealTile(id)) await renameTile(id, name).catch(() => false);
    }
    return {
      model: cfg.model,
      credits: cfg.credits,
      attachError,
      named: [...picks.keys()],
      mediaIds: Object.fromEntries(picks),
      created: [...collectTiles().keys()].filter((id) => !base.has(id)).length,
      missing: wanted.filter((n) => !picks.has(n)),
      projectUrl: location.href,
    };
  }

  // ── งานที่ Studio สั่ง ──

  let busy = false;
  /** ขั้นที่กำลังทำ — ติดไปกับข้อความผิดพลาด จะได้รู้ว่าค้างตรงไหนของหน้า Flow */
  let stage = '';
  const at = (s) => {
    stage = s;
  };

  async function opPrepare(args = {}) {
    await openProject();
    await goRoot();
    await renameProject(args.title).catch(() => {});
    // เตรียม project แค่ยืนยันว่าโมเดลปัจจุบันฟรี ภาพปกติแต่ละใบและ Agent จะตั้งสัดส่วนของตัวเองตอนวาด
    const cfg = await configure({ ratio: args.ratio || '3:4', models: args.models, agentOnly: true });
    return { ...cfg, projectUrl: location.href };
  }

  async function opGenerate(args = {}) {
    at('เปิด project');
    await openProject();
    if (args.refCollection) {
      for (const r of args.refs || []) {
        if (!r.dataUrl || r.tile) continue;
        at(`เตรียมรูปอ้างอิง ${r.name}`);
        await ensureRefUploaded(r, args.refCollection).catch(() => {});
      }
    }
    if (args.collection) {
      at(`เปิดคอลเล็กชัน ${args.collection}`);
      await openCollection(args.collection);
    }

    /**
     * รอบก่อนวาดเสร็จและตั้งชื่อไว้แล้ว แต่ขั้นหลังจากนั้นพลาด (เช่นดึงไฟล์ไม่สำเร็จ)
     * ห้ามสั่งวาดใหม่ — ใช้ภาพเดิมที่อยู่ใน project ต่อเลย ไม่ให้เกิดภาพซ้ำ
     */
    const done = SEL.tiles().find((t) => t.getAttribute('aria-label') === args.name && tileId(t));
    if (done && !args.onlyExisting && args.reuse !== false) {
      at('ใช้ภาพเดิมที่ตั้งชื่อไว้แล้ว');
      return finishTile(tileId(done), args, { reused: true });
    }
    /** ภาพที่ Flow Agent วาดไว้แล้ว — หยิบตามรหัสภาพที่ยืนยันจากชุด Agent เท่านั้น */
    if (args.onlyExisting) {
      at('หาภาพที่ Agent วาดไว้');
      await goRoot();
      let id = args.mediaId;
      // รหัสนี้มาจากการจับคู่ของชุด Agent ใน project เดียวกัน; เปลี่ยนชื่อการ์ดไม่สำเร็จไม่ใช่ภาพหาย
      if (!id || !(await revealTile(id))) {
        at('ค้นภาพที่ตั้งชื่อไว้ใน Flow');
        id = await recoverTileByName(args.name);
      }
      if (!id) {
        const e = new Error(`ไม่พบภาพ ${args.name} ตามรหัสที่ Flow Agent จับคู่ไว้ — ไม่ดึงภาพอื่นมาแทน`);
        e.code = 'not_found';
        throw e;
      }
      return finishTile(id, args, { reused: true });
    }

    at(`ตั้งค่า ${args.ratio || ''}`);
    const cfg = await configure({ ratio: args.ratio, models: args.models });
    at('ล้างรูปอ้างอิงเก่า');
    await clearRefs();
    let attached = 0;
    let attachError = '';
    if (args.refs?.length) {
      at('แนบรูปอ้างอิง');
      try {
        attached = await attachRefs(args.refs);
      } catch (e) {
        attachError = e?.message || String(e);
        await clearRefs();
      }
    }
    at('วาง prompt');
    await typePrompt(args.prompt);

    /**
     * ห้ามส่งงานใหม่ขณะที่ในหน้านี้ยังมีภาพกำลังวาดอยู่
     * ภาพของรูปก่อนหน้าที่เสร็จช้าเคยถูกหยิบไปเป็นภาพของรูปถัดไป (ปกหลังได้ภาพปกหน้า)
     */
    at('รอภาพก่อนหน้าให้เสร็จ');
    scrollGridTop();
    try {
      await waitFor(() => !SEL.tiles().some(isPending), { timeout: 6 * 60000, interval: 2000, label: 'ภาพที่กำลังวาดอยู่ก่อนหน้า' });
    } catch {
      const e = new Error('Flow ยังวาดภาพก่อนหน้าไม่เสร็จ — หยุดก่อนเพื่อไม่ให้ภาพนั้นถูกบันทึกผิดช่อง');
      e.code = 'flow_pending';
      throw e;
    }

    await closePane(); // แผงตั้งค่าที่ค้างอยู่บังปุ่มสร้างได้
    // ด่านสุดท้ายก่อนกด: ต้องยังอยู่ในคอลเล็กชันของรูปนี้ ไม่งั้นภาพจะไปเกิดผิดที่ — หยุดแล้วให้รอบใหม่เปิดให้ถูก
    if (args.collection && (!inCollection() || nameInput()?.value !== args.collection)) {
      const e = new Error(`ไม่ได้อยู่ในคอลเล็กชัน "${args.collection}" ตอนจะกดสร้าง — ยังไม่ได้ส่งงาน`);
      e.code = 'wrong_place';
      throw e;
    }

    at('กดสร้าง');
    scrollGridTop();
    const before = knownIds();
    const beforeEls = new Set(SEL.tiles());
    const send = await waitFor(() => (SEL.send() && !SEL.send().disabled ? SEL.send() : null), { label: 'ปุ่มสร้าง' });
    /**
     * ข้อความในช่องพิมพ์ถูกล้างเมื่อ Flow รับงานแล้ว — ถ้ายังอยู่ครบ แปลว่าการกดไม่ถึง
     * เห็นกับหน้าจริง: คลิกแรกหลังหน้าต่างเพิ่งถูกดึงขึ้นมาบางครั้งเป็นแค่การโฟกัส คลิกที่สองจึงส่งจริง
     * กดซ้ำได้ปลอดภัยเพราะเช็คก่อนทุกครั้งว่าข้อความยังค้างอยู่ (ถ้ารับไปแล้วจะไม่มีอะไรให้ส่งซ้ำ)
     */
    // รับงานแล้ว = มี tile ใหม่โผล่ (กล่องเทากำลังวาด) หรือช่องพิมพ์ถูกล้าง — ข้อไหนก่อนก็ได้
    const accepted = () => text(SEL.editor()).length < 5 || SEL.tiles().some((t) => !beforeEls.has(t));
    let taken = false;
    for (let attempt = 0; attempt < 3 && !taken; attempt++) {
      if (attempt > 0 && accepted()) {
        taken = true;
        break;
      }
      const btn = attempt === 0 ? send : SEL.send();
      if (btn && !btn.disabled) await trustedClick(SEL.send);
      taken = !!(await waitFor(accepted, { timeout: 12000, label: 'Flow รับ prompt' }).catch(() => false));
    }
    if (!taken) throw new Error('กดปุ่มสร้างของ Flow แล้วแต่ Flow ไม่รับ prompt (ข้อความยังค้างในช่องพิมพ์)');
    at('รอภาพใหม่');
    const { id, retried } = await waitNewTile(before, beforeEls, {
      timeout: args.timeoutMs || 5 * 60000,
      ratio: args.ratio,
      skipNames: (args.refs || []).flatMap((r) => [r.name, r.tile]),
      prompt: args.prompt,
    });
    return { ...(await finishTile(id, { ...args, cfg, attached, attachError })), retried };
  }

  /** ไฟล์ที่ดักได้เป็นภาพเดียวกับภาพบน tile ไหม — คืน '' ถ้าใช่ หรือเหตุผลที่ไม่ใช่ */
  async function matchesTile(blob, thumb) {
    const [a, b] = await Promise.all([imageSize(blob), imageSize(thumb)]);
    if (Math.abs(Math.log(a.width / a.height / (b.width / b.height))) > 0.03) return 'ไฟล์ที่ได้สัดส่วนไม่ตรงกับภาพนี้';
    const dist = hamming(await aHash(blob), await aHash(thumb));
    return dist > 12 ? `ไฟล์ที่ได้ไม่ใช่ภาพเดียวกับ tile นี้ (ต่างกัน ${dist}/64)` : '';
  }

  /** ตั้งชื่อ · ดึงไฟล์ 2K ที่ตรวจแล้วว่าเป็นภาพของ tile นี้จริง · ถอยไป 1K ถ้าไม่ใช่ */
  async function finishTile(id, args, { reused = false } = {}) {
    const { cfg = {}, attached = 0, attachError = '' } = args;
    at('เปลี่ยนชื่อภาพ');
    const renamed = await renameTile(id, args.name).catch(() => false);

    let blob = null;
    let via = '2k';
    let hiresError = '';
    let originalError = '';
    if (args.hires !== false) {
      at('ดาวน์โหลด 2K');
      try {
        const thumbFor2k = await fetchTileImage(id);
        blob = await download2k(id, '2K', (got) => matchesTile(got, thumbFor2k));
        /**
         * ไฟล์ 2K ของรูปก่อนหน้าที่มาช้าอาจหลุดเข้ามาตอนที่เรากำลังรอรูปนี้ (เจอจริง: ลวดลายพื้นหลังได้ภาพปก)
         * เทียบกับภาพบน tile ที่รู้แน่ว่าเป็นของรูปนี้ ทั้งสัดส่วนและหน้าตา ไม่ผ่านข้อใดข้อหนึ่ง = ไม่รับ
         */
        const thumb = await fetchTileImage(id);
        const [a, b] = await Promise.all([imageSize(blob), imageSize(thumb)]);
        if (Math.abs(Math.log(a.width / a.height / (b.width / b.height))) > 0.03) throw new Error('ไฟล์ 2K ที่ได้สัดส่วนไม่ตรงกับภาพนี้');
        const dist = hamming(await aHash(blob), await aHash(thumb));
        if (dist > 12) throw new Error(`ไฟล์ 2K ที่ได้ไม่ใช่ภาพเดียวกับ tile นี้ (ต่างกัน ${dist}/64)`);
      } catch (e) {
        blob = null;
        hiresError = e?.message || String(e);
      }
    }
    if (!blob) {
      // thumbnail ของ Flow บางใบมีแค่ 512px: ขอไฟล์ต้นฉบับก่อน ไม่เรียกภาพย่อว่า 1K
      const thumb = await fetchTileImage(id);
      at('ดาวน์โหลดต้นฉบับ 1K');
      try {
        const original = await download2k(id, '1K', (got) => matchesTile(got, thumb));
        const [a, b] = await Promise.all([imageSize(original), imageSize(thumb)]);
        if (Math.abs(Math.log(a.width / a.height / (b.width / b.height))) > 0.03 ||
            hamming(await aHash(original), await aHash(thumb)) > 12) {
          throw new Error('ไฟล์ต้นฉบับ 1K ไม่ตรงกับภาพบน tile นี้');
        }
        if (a.width < b.width || a.height < b.height) throw new Error('ไฟล์ต้นฉบับ 1K เล็กกว่าภาพบน tile');
        blob = original;
        via = '1k';
      } catch (e) {
        originalError = e?.message || String(e);
        at('ดึงภาพย่อบน tile');
        blob = thumb;
        via = 'thumbnail';
      }
    }
    const size = await imageSize(blob);
    return {
      ...cfg,
      reused,
      mediaId: id,
      renamed,
      via,
      hiresError,
      originalError,
      attached,
      attachError,
      bytes: blob.size,
      width: size.width,
      height: size.height,
      dataUrl: await blobToDataUrl(blob),
      projectUrl: location.href,
    };
  }

  const OPS = { prepare: opPrepare, generate: opGenerate, agentBatch: opAgentBatch, lookupNamed: opLookupNamed };

  async function run(op, args) {
    if (!OPS[op]) throw new Error(`ไม่รู้จักคำสั่ง ${op}`);
    if (busy) {
      const e = new Error('Flow กำลังทำงานของรูปก่อนหน้าอยู่');
      e.code = 'busy';
      throw e;
    }
    busy = true;
    at('');
    try {
      return await OPS[op](args);
    } catch (e) {
      if (stage) e.message = `${e.message} (ขั้น: ${stage})`;
      throw e;
    } finally {
      busy = false;
    }
  }

  globalThis.__ebookPlusFlow = { run, configure, readPane, renameTile, download2k, knownIds, attachRefs, clearRefs, openCollection, attachFromPicker, stage: () => stage };

  if (typeof chrome === 'undefined' || !chrome.runtime?.id) return; // ฉีดทดสอบในหน้าเว็บตรง ๆ

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === 'flow.ping') {
      const signIn = $$('a, button').some((el) => visible(el) && /^\s*sign in\s*$|^\s*เข้าสู่ระบบ\s*$/i.test(text(el)));
      const looksIn = inProject() || !!SEL.newProject();
      sendResponse({ ok: true, rev: ADAPTER_REV, url: location.href, loggedIn: signIn ? false : looksIn ? true : null, busy, stage });
      return;
    }
    if (msg?.type !== 'flow.run') return;
    sendResponse({ ok: true, accepted: true });
    run(msg.op, msg.args || {})
      .then((result) => ({ ok: true, ...result }))
      .catch((e) => ({ ok: false, error: e?.message || String(e), code: e?.code || '' }))
      .then((result) => chrome.runtime.sendMessage({ type: 'flow.result', jobId: msg.jobId, result }).catch(() => {}));
  });
})();
