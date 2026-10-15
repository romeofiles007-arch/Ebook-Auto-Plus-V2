import test from 'node:test';
import assert from 'node:assert/strict';
import { tabEditBusy, updateTabWhenReady } from './tab-update.js';

const busy = new Error('Tabs cannot be edited right now (user may be dragging a tab).');

test('Chrome กำลังลากแท็บ: รอสั้น ๆ แล้วส่งงานได้เมื่อแท็บพร้อม', async () => {
  let calls = 0;
  const delays = [];
  const result = await updateTabWhenReady(42, { active: true }, {
    update: async () => {
      calls++;
      if (calls < 3) throw busy;
      return { id: 42, active: true };
    },
    wait: async (ms) => delays.push(ms),
  });
  assert.equal(result.ok, true);
  assert.equal(calls, 3);
  assert.deepEqual(delays, [300, 700]);
});

test('แท็บยังถูกลากอยู่: คืน tab_busy หลังลองจำกัด ไม่สั่ง Flow ซ้ำไม่จบ', async () => {
  let calls = 0;
  const result = await updateTabWhenReady(42, { url: 'https://flow.google.com/' }, {
    update: async () => { calls++; throw busy; },
    wait: async () => {},
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'tab_busy');
  assert.equal(calls, 4);
});

test('ข้อผิดพลาดแท็บชนิดอื่นส่งกลับให้ผู้เรียกจัดการ', async () => {
  assert.equal(tabEditBusy(busy), true);
  assert.equal(tabEditBusy(new Error('No tab with id 42')), false);
  await assert.rejects(updateTabWhenReady(42, { active: true }, {
    update: async () => { throw new Error('No tab with id 42'); },
    wait: async () => {},
  }), /No tab/);
});

test('รหัส tab_busy จาก service worker ส่งถึงขั้นสร้างภาพโดยไม่ถูกแปลงเป็น Flow ล้ม', async () => {
  globalThis.chrome = {
    runtime: {
      onMessage: { addListener() {} },
      sendMessage: async () => ({ ok: false, code: 'tab_busy', error: 'Chrome กำลังย้ายแท็บ Flow' }),
    },
  };
  const { flowCall } = await import('./flow.js');
  const result = await flowCall('generate', { name: 'cover-front.png' }, { timeoutMs: 1000 });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'tab_busy');
});

test('แท็บยังไม่พร้อม: พัก Phase 2 ที่ภาพเดิมและบันทึกเหตุผล ไม่เดินไปภาพถัดไป', async () => {
  const { Machine } = await import('./machine.js');
  const events = [];
  const machine = Object.create(Machine.prototype);
  machine.book = { job: { step: 'images', status: 'running' }, imagePhase: {} };
  machine.log = () => {};
  machine.emit = (event) => events.push(event);
  machine.save = async () => {};
  const jobs = [{ name: 'cover-front.png', what: 'ปกหน้า' }, { name: 'cover-back.png', what: 'ปกหลัง' }];
  const halted = await machine.stopFlowTabBusy(jobs[0], 'Chrome กำลังย้ายแท็บ Flow', jobs, 0, new Map());
  assert.equal(halted, true);
  assert.equal(machine.job.step, 'gate_images');
  assert.equal(machine.job.status, 'waiting_human');
  assert.equal(machine.book.imagePhase.blockedCode, 'tab_busy');
  assert.deepEqual(machine.book.imagePhase.remaining, ['cover-front.png', 'cover-back.png']);
  assert.equal(events.at(-1).name, 'cover-front.png');
});
