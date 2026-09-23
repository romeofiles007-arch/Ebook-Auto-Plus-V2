const ACTIVE_RUNS = new Set(['working', 'waiting']);
const SOUND_SETTING = 'ebookPlus.ceoCatSound';
let ceoAudioContext;

function emitCeoMeow(context) {
  const start = context.currentTime + 0.01;
  const voice = context.createOscillator();
  const overtone = context.createOscillator();
  const voiceGain = context.createGain();
  const overtoneGain = context.createGain();
  const output = context.createGain();
  voice.type = 'triangle';
  overtone.type = 'sine';
  for (const tone of [voice, overtone]) {
    const multiplier = tone === voice ? 1 : 2.1;
    tone.frequency.setValueAtTime(520 * multiplier, start);
    tone.frequency.linearRampToValueAtTime(810 * multiplier, start + 0.12);
    tone.frequency.exponentialRampToValueAtTime(390 * multiplier, start + 0.43);
  }
  voiceGain.gain.value = 0.8;
  overtoneGain.gain.value = 0.2;
  output.gain.setValueAtTime(0.0001, start);
  output.gain.exponentialRampToValueAtTime(0.065, start + 0.05);
  output.gain.exponentialRampToValueAtTime(0.035, start + 0.2);
  output.gain.exponentialRampToValueAtTime(0.0001, start + 0.44);
  voice.connect(voiceGain);
  overtone.connect(overtoneGain);
  voiceGain.connect(output);
  overtoneGain.connect(output);
  output.connect(context.destination);
  voice.start(start);
  overtone.start(start);
  voice.stop(start + 0.45);
  overtone.stop(start + 0.45);
}

function playCeoMeow(fromClick = false) {
  const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AudioContextClass) return;
  try {
    ceoAudioContext ||= new AudioContextClass();
    if (ceoAudioContext.state === 'suspended') {
      if (fromClick) void ceoAudioContext.resume().then(() => emitCeoMeow(ceoAudioContext)).catch(() => {});
      return;
    }
    emitCeoMeow(ceoAudioContext);
  } catch { /* Audio may be unavailable until the user interacts with the popup. */ }
}

export function ceoView(state, now = Date.now(), run = null) {
  // เมื่อถูกเรียกจริง ให้ภาพทำงานต่อครบช่วงนำเสนอ แม้ API จะตอบเสร็จเร็วกว่านั้น
  if ((state?.called || state?.working) && state.until > now) return {
    mode: 'working', working: true, title: state.working ? 'CEO แมวน้อย · กำลังตัดสินใจ' : 'CEO แมวน้อย · ส่งคำตัดสินแล้ว',
    detail: state.detail || 'กำลังตรวจสถานะและกำกับขั้นตอนถัดไป',
  };
  // ระหว่างทีมผลิตกำลังเดินงาน CEO ไม่ต้องแสร้งว่ากำลังทำงาน ถ้าไม่มีเหตุให้ถูกเรียกก็นอนที่โต๊ะ
  if (ACTIVE_RUNS.has(run?.kind)) return {
    mode: 'sleeping', working: false, title: 'CEO แมวน้อย · พักระหว่างทีมทำงาน',
    detail: 'ทีมกำลังสร้างหนังสือตามปกติ · จะตื่นเมื่อระบบกู้เองไม่ได้และเรียก CEO',
  };
  // ยังไม่มีงาน งานเสร็จ หรือส่งออกแล้ว: ตื่นอยู่เพื่อให้เห็นว่า CEO mode พร้อมรับงานครั้งใหม่
  return {
    mode: 'awake', working: false, title: 'CEO แมวน้อย · ตื่นและพร้อมรับงาน',
    detail: run?.kind === 'done' ? 'หนังสือเสร็จและส่งออกแล้ว · พร้อมรับงานเล่มถัดไป' : 'ยังไม่มีงานที่ต้องกำกับ · พร้อมรับการเรียกครั้งถัดไป',
  };
}

export function mountCeoPanel(el, onViewChange = () => {}) {
  if (!el) return () => {};
  let state = null;
  let run = null;
  let lastMode = null;
  let soundEnabled = true;
  try { soundEnabled = localStorage.getItem(SOUND_SETTING) !== 'off'; } catch { /* Storage can be unavailable in previews. */ }
  const soundButton = el.querySelector('.ceo-sound-toggle');
  const paintSoundButton = () => {
    if (!soundButton) return;
    const label = soundEnabled ? 'ปิดเสียงแมว CEO' : 'เปิดเสียงแมว CEO';
    soundButton.textContent = soundEnabled ? '🔊' : '🔇';
    soundButton.setAttribute('aria-label', label);
    soundButton.setAttribute('aria-pressed', String(soundEnabled));
    soundButton.title = label;
  };
  soundButton?.addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    try { localStorage.setItem(SOUND_SETTING, soundEnabled ? 'on' : 'off'); } catch { /* Keep the current popup preference. */ }
    paintSoundButton();
    if (soundEnabled) playCeoMeow(true);
  });
  paintSoundButton();
  const paint = () => {
    const view = ceoView(state, Date.now(), run);
    if (lastMode && view.mode === 'working' && lastMode !== 'working' && soundEnabled) playCeoMeow();
    lastMode = view.mode;
    el.classList.toggle('working', view.working);
    el.classList.toggle('awake', view.mode === 'awake');
    el.classList.toggle('sleeping', view.mode === 'sleeping');
    el.querySelector('strong').textContent = view.title;
    el.querySelector('.ceo-detail').textContent = view.detail;
    onViewChange(view.mode);
  };
  paint();
  setInterval(paint, 1000);
  return (next, nextRun) => {
    if (next && (!state || next.at >= state.at)) state = next;
    if (nextRun && (!run || nextRun.at >= run.at)) run = nextRun;
    paint();
  };
}
