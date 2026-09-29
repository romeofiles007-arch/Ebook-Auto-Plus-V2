import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('./studio.js', import.meta.url), 'utf8');
const start = source.indexOf('async function resumeGo()');
const fn = source.slice(start, source.indexOf('\n}', start) + 2);

/**
 * สั่ง "ทำต่อ" ระหว่างที่งานยังวิ่งอยู่ = มี Machine สองตัวทำเล่มเดียวกันพร้อมกัน
 * ทั้งคู่สลับกันส่งงานให้ ChatGPT และเขียนทับสถานะของกันและกัน
 * อาการที่เห็นในบันทึกคือข้อความเดิมซ้ำเป็นชุด ๆ ทุกยี่สิบวินาที และงานดูเหมือนไม่คืบ
 */
function fixture(overrides = {}) {
  let runs = 0;
  const nodes = {
    resume: { classList: { add() {}, remove() {} }, dataset: { bookId: 'b1' } },
    start: { classList: { add() {} } },
    progress: { classList: { remove() {} } },
    projectList: { scrollIntoView() {} },
  };
  const book = { id: 'b1', job: { step: 'write' } };
  const scope = {
    machineBusy: false,
    clearImageGiveUp: async () => {},
    hasPendingTurn: () => false,
    book,
    $: (id) => nodes[id],
    status: () => {},
    db: { loadBook: async () => book, saveBook: async () => {} },
    loadProjectHistory: async () => {},
    openImagePhaseGate: async () => {},
    renderSteps: () => {},
    setMacroStage: () => {},
    macroStageForJobStep: () => 'write',
    STEP_NAMES: {},
    addEvent: () => {},
    focusChat: async () => {},
    showRunningCost: () => {},
    makeMachine: () => {},
    runMachine: async () => { runs++; },
    fail: (e) => { throw e; },
    ...overrides,
  };
  return { run: vm.runInNewContext('(' + fn + ')', scope), runs: () => runs, book };
}

test('งานที่ยังวิ่งอยู่ ต้องสั่งทำต่อซ้อนไม่ได้', async () => {
  const busy = fixture({ machineBusy: true });
  assert.equal(await busy.run(), false);
  assert.equal(busy.runs(), 0, 'ห้ามเดินเครื่องตัวที่สอง');

  const sending = fixture({ hasPendingTurn: () => true });
  assert.equal(await sending.run(), false);
  assert.equal(sending.runs(), 0, 'ระหว่างรอคำตอบจาก ChatGPT ก็นับว่ายังทำงานอยู่');
});

test('ไม่มีงานวิ่งอยู่ ทำต่อได้ตามปกติ', async () => {
  const f = fixture();
  await f.run();
  assert.equal(f.runs(), 1);
});

test('งานเก่าที่รอข้อมูลกู้เป็นโหมดอัตโนมัติและเดินต่อจากตอนเดิม', async () => {
  const f = fixture();
  f.book.job = { step: 'write', cursor: 4, status: 'waiting_content_input',
    contentInput: [{ id: '2.3', missing: ['ข้อมูลจริง'] }] };
  f.book.coverMode = 'prompt';
  f.book.figureMode = 'upload';
  await f.run();
  assert.equal(f.runs(), 1);
  assert.equal(f.book.job.cursor, 4);
  assert.equal(f.book.job.contentInput, undefined);
  assert.equal(f.book.automation.mode, 'full');
  assert.equal(f.book.coverMode, 'auto');
  assert.equal(f.book.figureMode, 'auto');
});

test('ไม่มีงานค้างให้ทำต่อ ต้องบอกว่าไม่ได้เริ่ม', async () => {
  const f = fixture({ book: null, db: { loadBook: async () => null, saveBook: async () => {} } });
  assert.equal(await f.run(), false);
  assert.equal(f.runs(), 0);
});
