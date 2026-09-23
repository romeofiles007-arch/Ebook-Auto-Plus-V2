/**
 * Adapter ของ Google Flow (flow.google.com) — สร้างภาพให้ Ebook Plus ทีละรูป
 *
 * ต่อยอดจากตัวขับ Flow ของโปรเจกต์ Youtube Free animation Auto แต่เลือกทางต่างกันหนึ่งเรื่อง:
 * ที่นั่นส่งทั้งชุดให้ Flow Agent แล้วสั่งให้ agent ตั้งชื่อภาพเอง ที่นี่ใช้ช่องพิมพ์ปกติทีละรูป
 *
 *   · หนังสือหนึ่งเล่มมีหลายสัดส่วนในงานเดียว (ปก 3:4 · ภาพประกอบ 4:3 / 16:9)
 *     Agent ตั้งค่าเริ่มต้นได้สัดส่วนเดียว ช่องพิมพ์ปกติเลือกได้ทุกรูป — ภาพจึงไม่ต้องถูกครอป
 *   · ส่งทีละรูปแล้วรอ tile ใหม่ = รู้แน่ว่า tile ไหนคือรูปไหน ไม่ต้องพึ่งให้ agent ตั้งชื่อถูก
 *     แล้วเราเปลี่ยนชื่อ tile ใน Flow เป็นชื่อไฟล์ที่ ChatGPT วางแผนไว้เองผ่านเมนู "เปลี่ยนชื่อ"
 *   · ดึงไฟล์ด้วยเมนู ดาวน์โหลด → 2K (1792×2400 สำหรับ 3:4 ≈ 300 dpi บน A5) ไม่ใช่ภาพย่อบน tile
 *     ถ้า 2K ไม่มา ถอยไปใช้ภาพ 1K บน tile (ยังใช้ได้ แต่ dpi ต่ำกว่า)
 *
 * หน้า Flow แสดงภาษาตามบัญชี (เจอทั้งไทยและอังกฤษ) จึงจับจากชื่อไอคอน (tune, arrow_forward,
 * more_vert, edit, download) ซึ่งไม่เปลี่ยนตามภาษา และใช้ข้อความสองภาษาเป็นทางสำรองเท่านั้น
 *
 * ข้อความที่รับ (ผ่าน service worker):
 *   flow.ping                                      → { ok, url, loggedIn, busy }
 *   flow.run { jobId, op: 'prepare'|'generate', args }  → { ok:true } ทันที
 *     แล้วส่งผลกลับเป็น runtime message { type:'flow.result', jobId, result }
 *     เพราะงานหนึ่งรูปใช้เวลาเป็นนาที นานกว่าที่ service worker จะอยู่รอถือ sendResponse ไว้ได้
 */
(() => {
  if (globalThis.__ebookPlusFlow) return; // ฉีดซ้ำ → ไม่เพิ่ม listener ซ้ำ

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
  function realClick(el) {
    el.scrollIntoView?.({ block: 'center' });
    const r = el.getBoundingClientRect();
    const o = { bubbles: true, cancelable: true, composed: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, button: 0 };
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
  async function trustedClick(el) {
    el.scrollIntoView?.({ block: 'center' });
    await sleep(150);
    const r = el.getBoundingClientRect();
    const x = Math.round(r.left + r.width / 2);
    const y = Math.round(r.top + r.height / 2);
    if (typeof chrome !== 'undefined' && chrome.runtime?.id) {
      const res = await chrome.runtime.sendMessage({ type: 'sw.trustedClick', x, y }).catch((e) => ({ ok: false, error: e?.message }));
      if (res?.ok) return true;
    }
    realClick(el);
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
    send: () =>
      $$('button[aria-label="Start generation"], button[aria-label="เริ่มสร้าง"]').find(visible) || iconButton('arrow_forward'),
    tiles: () => $$('flow-grid-tile-container'),
  };

  const agentOn = () => SEL.agentChip()?.getAttribute('aria-pressed') === 'true';
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
  async function agentOff() {
    for (let i = 0; i < 6 && agentOn(); i++) {
      const chip = await waitFor(SEL.agentChip, { label: 'ปุ่ม Agent' });
      i % 2 === 0 ? chip.click() : realClick(chip);
      await waitFor(() => !agentOn(), { timeout: 2500, label: 'ปิด Agent' }).catch(() => null);
      await sleep(300);
    }
    if (agentOn()) throw new Error('ปิดโหมด Agent ของ Flow ไม่สำเร็จ — กดปุ่ม Agent ในช่องพิมพ์ให้ดับเองแล้วสั่งใหม่');
    // แผงตั้งค่า Agent อาจเปิดค้างอยู่ด้านขวา — ปิดทิ้ง ไม่ต้องบันทึกอะไร
    iconButton('arrow_back')?.click();
    await sleep(300);
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

  async function openPane() {
    if (settingsPane()) return;
    realClick(await waitFor(SEL.settingsTrigger, { label: 'ปุ่มตั้งค่าโมเดลของช่องพิมพ์' }));
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
    realClick(cur.modelBtn);
    const item = await waitFor(
      () => $$('[role="menuitem"], [role="option"]').find((m) => visible(m) && text(m).replace(/^\S+\s/, '') === model),
      { timeout: 5000, label: `เมนูโมเดล ${model}` },
    ).catch(() => null);
    if (!item) {
      escape();
      await sleep(500);
      return false;
    }
    realClick(item);
    await sleep(800);
    return readPane()?.model === model;
  }

  /**
   * ตั้งช่องพิมพ์เป็น Image · สัดส่วนที่ต้องการ · x1 · โมเดลที่ใช้ 0 เครดิต
   *
   * ลองโมเดลตามลำดับที่ส่งมา แล้วหยุดที่ตัวแรกที่ Flow บอกว่า "0 เครดิต"
   * ถ้าไม่มีตัวไหนฟรีเลย → หยุดทันที ไม่กดสร้าง (ห้ามเผาเครดิตของผู้ใช้เงียบ ๆ)
   */
  async function configure({ ratio = '3:4', models = ['Nano Banana 2', 'Nano Banana 2 Lite'] } = {}) {
    await agentOff();
    await openPane();
    let last = null;
    for (const model of models) {
      for (let attempt = 1; attempt <= 3; attempt++) {
        if (!settingsPane()) await openPane();
        await chooseRadio((t) => /^image\b/i.test(t));
        await chooseRadio((t) => t.split(' ').pop() === ratio);
        await chooseRadio((t) => t === 'x1');
        const okModel = await chooseModel(model);
        await sleep(400);
        last = readPane();
        if (last && okModel && last.image && last.ratio === ratio && last.count === 'x1') break;
      }
      if (last?.model === model && last.credits === 0) {
        escape();
        await sleep(400);
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

  /** วางรูปลงช่องพิมพ์ด้วย paste แบบเดียวกับ Ctrl+V (วิธีเดียวกับโปรเจกต์ Youtube ที่ใช้แนบรูปตัวละคร) */
  async function attachRefs(refs) {
    if (!refs?.length) return 0;
    const start = chips().length;
    const upload = [];
    for (const r of refs) {
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

  const FAIL_TEXT = /fail|couldn.?t|unable|policy|violat|ไม่สำเร็จ|ล้มเหลว|ไม่สามารถ|นโยบาย|ละเมิด|ผิดพลาด/i;

  /**
   * รอภาพใหม่หนึ่งใบหลังกดสร้าง
   * สำเร็จ = มี tile ที่ media id ไม่เคยเห็นมาก่อน และภาพโหลดเสร็จแล้ว
   * ล้ม = tile ใหม่ที่ไม่มีภาพแต่มีข้อความบอกความผิดพลาด หรือกล่องแจ้งเตือนของหน้า
   */
  async function waitNewTile(before, beforeEls, { timeout = 5 * 60000 } = {}) {
    return waitFor(
      () => {
        scrollGridTop();
        for (const tile of SEL.tiles()) {
          const id = tileId(tile);
          const img = tileImg(tile);
          if (id && !before.has(id) && img.complete && img.naturalWidth > 0) return { tile, id };
          if (!id && !beforeEls.has(tile) && FAIL_TEXT.test(text(tile))) {
            const e = new Error(`Flow สร้างภาพไม่สำเร็จ: ${text(tile).slice(0, 200)}`);
            e.code = 'generation_failed';
            throw e;
          }
        }
        const alert = $$('[role="alert"], mat-snack-bar-container, .mat-mdc-snack-bar-container').find(
          (a) => visible(a) && FAIL_TEXT.test(text(a)),
        );
        if (alert) {
          const e = new Error(`Flow แจ้งว่า: ${text(alert).slice(0, 200)}`);
          e.code = 'generation_failed';
          throw e;
        }
        return null;
      },
      { timeout, interval: 1500, label: 'ภาพใหม่จาก Flow' },
    );
  }

  const findTile = (id) => SEL.tiles().find((t) => tileId(t) === id);

  async function openTileMenu(id) {
    const tile = await waitFor(() => findTile(id), { timeout: 10000, label: 'tile ของภาพ' });
    tile.scrollIntoView({ block: 'center' });
    tile.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    tile.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    await sleep(300);
    const more =
      $$('button', tile).find((b) => /more|เพิ่มเติม/i.test(b.getAttribute('aria-label') || '') || text(b) === 'more_vert') ||
      $$('button', tile).pop();
    if (!more) throw new Error('ไม่พบปุ่มเมนูของภาพใน Flow');
    realClick(more);
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
  async function download2k(id, size = '2K') {
    const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const got = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        window.removeEventListener('message', onMsg);
        reject(new Error(`Flow ไม่ส่งไฟล์ ${size} มาภายในเวลา`));
      }, 150000);
      function onMsg(e) {
        const d = e.data;
        if (e.source !== window || d?.source !== 'ebookplus-main' || d.token !== token) return;
        clearTimeout(timer);
        window.removeEventListener('message', onMsg);
        d.type === 'captured' ? resolve(d.blob) : reject(new Error(d.error || 'ดักไฟล์ไม่สำเร็จ'));
      }
      window.addEventListener('message', onMsg);
    });
    window.postMessage({ source: 'ebookplus-iso', type: 'arm', token, ms: 150000 }, '*');
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
      const blob = await got;
      escape();
      return blob;
    } catch (e) {
      window.postMessage({ source: 'ebookplus-iso', type: 'disarm', token }, '*');
      escape();
      got.catch(() => {});
      throw e;
    }
  }

  async function fetchTileImage(id) {
    const img = tileImg(findTile(id));
    const src = img?.currentSrc || img?.src;
    if (!src) throw new Error('ไม่พบไฟล์ภาพบน tile');
    const r = await fetch(src, { credentials: 'include' });
    if (!r.ok) throw new Error(`โหลดภาพจาก Flow ไม่ได้ (HTTP ${r.status})`);
    return r.blob();
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
    await renameProject(args.title).catch(() => {});
    const cfg = await configure({ ratio: args.ratio || '3:4', models: args.models });
    return { ...cfg, projectUrl: location.href };
  }

  async function opGenerate(args = {}) {
    at('เปิด project');
    await openProject();
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
    let taken = false;
    for (let attempt = 0; attempt < 3 && !taken; attempt++) {
      const btn = attempt === 0 ? send : SEL.send();
      if (btn && !btn.disabled) await trustedClick(btn);
      taken = !!(await waitFor(() => text(SEL.editor()).length < 5, { timeout: 7000, label: 'Flow รับ prompt' }).catch(() => false));
    }
    if (!taken) throw new Error('กดปุ่มสร้างของ Flow แล้วแต่ Flow ไม่รับ prompt (ข้อความยังค้างในช่องพิมพ์)');
    at('รอภาพใหม่');
    const { id } = await waitNewTile(before, beforeEls, { timeout: args.timeoutMs || 5 * 60000 });

    at('เปลี่ยนชื่อภาพ');
    const renamed = await renameTile(id, args.name).catch(() => false);

    let blob = null;
    let via = '2k';
    let hiresError = '';
    if (args.hires !== false) {
      at('ดาวน์โหลด 2K');
      try {
        blob = await download2k(id, '2K');
      } catch (e) {
        hiresError = e?.message || String(e);
      }
    }
    if (!blob) {
      at('ดึงภาพ 1K');
      via = '1k';
      blob = await fetchTileImage(id);
    }
    const size = await imageSize(blob);
    return {
      ...cfg,
      mediaId: id,
      renamed,
      via,
      hiresError,
      attached,
      attachError,
      bytes: blob.size,
      width: size.width,
      height: size.height,
      dataUrl: await blobToDataUrl(blob),
      projectUrl: location.href,
    };
  }

  const OPS = { prepare: opPrepare, generate: opGenerate };

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

  globalThis.__ebookPlusFlow = { run, configure, readPane, renameTile, download2k, knownIds, attachRefs, clearRefs, stage: () => stage };

  if (typeof chrome === 'undefined' || !chrome.runtime?.id) return; // ฉีดทดสอบในหน้าเว็บตรง ๆ

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === 'flow.ping') {
      const signIn = $$('a, button').some((el) => visible(el) && /^\s*sign in\s*$|^\s*เข้าสู่ระบบ\s*$/i.test(text(el)));
      const looksIn = inProject() || !!SEL.newProject();
      sendResponse({ ok: true, url: location.href, loggedIn: signIn ? false : looksIn ? true : null, busy, stage });
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
