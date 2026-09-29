import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('./chatgpt.js', import.meta.url), 'utf8');
const start = source.indexOf('  function visibleReplyComplete(');
const end = source.indexOf('  chrome.runtime.onMessage.addListener(', start);
const complete = vm.runInNewContext(`${source.slice(start, end)}\nvisibleReplyComplete`);

test('visible chapter recovery waits for the closing section and META markers', () => {
  const prompt = '<<<SEC 1.1 END>>>\n<<<META 1.1 END>>>';
  assert.equal(complete(prompt, '<<<SEC 1.1 BEGIN>>>\nข้อความยาว'), false);
  assert.equal(complete(prompt, '<<<SEC 1.1 END>>>\n<<<META 1.1 END>>>'), true);
});

test('ordinary non-section replies can use the final action bar as completion evidence', () => {
  assert.equal(complete('เสนอชื่อเรื่อง', 'ชื่อเรื่องที่หนึ่ง'), true);
});
