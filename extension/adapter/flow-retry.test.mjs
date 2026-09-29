/** ผู้ใช้: "บางทีกดสร้างภาพใน google flow จะเจอปุ่ม ลองใหม่อีกครั้ง ก็ให้กดลองใหม่อีกครั้งไปเลย" */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const src = await readFile(new URL('./flow.js', import.meta.url), 'utf8');
const machine = await readFile(new URL('../core/machine.js', import.meta.url), 'utf8');

test('เจอปุ่ม "ลองใหม่อีกครั้ง" บนภาพที่ล้ม = กดให้เอง (คลิกแบบคนกดจริง) ไม่เกิน 2 ครั้งต่อภาพ', () => {
  assert.match(src, /const RETRY_TEXT = \/ลองใหม่\|ลองอีกครั้ง\|try again\|retry\/i;/);
  assert.match(src, /const FLOW_RETRY_CLICKS = 2;/);
  assert.match(src, /await trustedClick\(res\.retry\);/);
  // ทั้งบน tile ที่ล้ม และในกล่องแจ้งเตือนของหน้า
  assert.match(src, /const again = canRetry && !UNUSUAL_TEXT\.test\(why\) \? retryButton\(mine\) : null;/);
  assert.match(src, /const again = canRetry && !UNUSUAL_TEXT\.test\(text\(alert\)\) \? retryButton\(alert\) : null;/);
  // จำนวนครั้งที่กดส่งกลับไปให้ Studio บันทึก
  assert.match(src, /return \{ \.\.\.\(await finishTile\(id, \{ \.\.\.args, cfg, attached, attachError \}\)\), retried \};/);
  assert.match(machine, /Flow ขึ้นปุ่ม "ลองใหม่อีกครั้ง" — กดให้แล้ว \$\{res\.retried\} ครั้ง/);
});

test('"พบกิจกรรมที่ผิดปกติ" ห้ามกดลองใหม่ — ยังหยุดทั้งคิวเหมือนเดิม', () => {
  assert.match(src, /e\.code = UNUSUAL_TEXT\.test\(why\) \? 'unusual_activity' : 'generation_failed';/);
});
