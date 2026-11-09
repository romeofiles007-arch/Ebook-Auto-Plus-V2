/**
 * Flow แจ้ง "เราพบกิจกรรมที่ผิดปกติบางอย่าง … ส่วนขยายของเบราว์เซอร์ที่แก้ไขหน้าเว็บอาจทำให้เกิดปัญหา"
 * ตัวดักไฟล์ 2K ต้องไม่แตะฟังก์ชันของหน้าเว็บนอกช่วงที่ง้างรอไฟล์
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('./flow-main.js', import.meta.url), 'utf8');

function page() {
  const listeners = [];
  const posted = [];
  const timers = [];
  class HTMLAnchorElement {
    constructor(href, download) {
      this.href = href;
      this.download = download;
      this.clicked = 0;
    }
    hasAttribute(n) {
      return n === 'download' && this.download != null;
    }
  }
  const nativeClick = function () {
    this.clicked++;
  };
  HTMLAnchorElement.prototype.click = nativeClick;
  let n = 0;
  const nativeCreate = () => `blob:https://flow.google.com/${++n}`;
  const URL = { createObjectURL: nativeCreate };
  const window = {
    addEventListener: (t, fn) => listeners.push(fn),
    postMessage: (data) => posted.push(data),
  };
  const ctx = vm.createContext({
    window, URL, HTMLAnchorElement, Blob, Symbol, Object, Map, Date,
    setTimeout: (fn, ms) => timers.push({ fn, ms }) && timers.length,
    clearTimeout: () => {},
  });
  vm.runInContext(source, ctx);
  const send = (data) => listeners.forEach((fn) => fn({ source: window, data }));
  const untouched = () => URL.createObjectURL === nativeCreate && HTMLAnchorElement.prototype.click === nativeClick;
  return { ctx, window, URL, HTMLAnchorElement, send, posted, timers, untouched, nativeClick };
}

test('ไม่ได้ง้าง = ฟังก์ชันของหน้าเว็บเป็นของเดิมทุกตัว และไม่ทิ้งชื่อไว้บน window', () => {
  const p = page();
  assert.ok(p.untouched());
  assert.deepEqual(Object.keys(p.window).sort(), ['addEventListener', 'postMessage']);
  const a = new p.HTMLAnchorElement(p.URL.createObjectURL(new Blob(['x'], { type: 'image/png' })), 'a.png');
  a.click();
  assert.equal(a.clicked, 1, 'ผู้ใช้กดดาวน์โหลดเองได้ไฟล์ตามปกติ');
});

test('ง้างแล้วดักได้หนึ่งไฟล์ แล้วคืนฟังก์ชันเดิมทันที', () => {
  const p = page();
  p.send({ source: 'ebookplus-iso', type: 'arm', token: 't1', ms: 60000 });
  assert.ok(!p.untouched(), 'ช่วงง้างต้องดักได้');
  const blob = new Blob(['x'], { type: 'image/png' });
  const a = new p.HTMLAnchorElement(p.URL.createObjectURL(blob), 'img.png');
  a.click();
  assert.equal(a.clicked, 0, 'ไฟล์ที่ดักได้ไม่ลง Downloads');
  assert.equal(p.posted.length, 1);
  assert.equal(p.posted[0].token, 't1');
  assert.equal(p.posted[0].blob, blob);
  assert.ok(p.untouched(), 'ได้ไฟล์แล้วต้องคืนของเดิม');
});

test('ยกเลิกหรือหมดเวลา = คืนของเดิม', () => {
  const p = page();
  p.send({ source: 'ebookplus-iso', type: 'arm', token: 't1', ms: 1000 });
  p.send({ source: 'ebookplus-iso', type: 'disarm', token: 'other' });
  assert.ok(!p.untouched(), 'token อื่นยกเลิกของเราไม่ได้');
  p.send({ source: 'ebookplus-iso', type: 'disarm', token: 't1' });
  assert.ok(p.untouched());

  p.send({ source: 'ebookplus-iso', type: 'arm', token: 't2', ms: 1000 });
  assert.ok(!p.untouched());
  p.timers.at(-1).fn();
  assert.ok(p.untouched(), 'หมดเวลาแล้วไม่มีใครยกเลิก ก็ต้องคืนเอง');
});

test('มีใครเปลี่ยนทับระหว่างง้าง — ไม่ไปรื้อของเขา · ฉีดซ้ำไม่ซ้อนสองชั้น', () => {
  const p = page();
  p.send({ source: 'ebookplus-iso', type: 'arm', token: 't1', ms: 1000 });
  const theirs = function () {};
  p.HTMLAnchorElement.prototype.click = theirs;
  p.send({ source: 'ebookplus-iso', type: 'disarm', token: 't1' });
  assert.equal(p.HTMLAnchorElement.prototype.click, theirs);

  const q = page();
  vm.runInContext(source, q.ctx);
  q.send({ source: 'ebookplus-iso', type: 'arm', token: 't1', ms: 1000 });
  q.send({ source: 'ebookplus-iso', type: 'disarm', token: 't1' });
  assert.ok(q.untouched());
});
