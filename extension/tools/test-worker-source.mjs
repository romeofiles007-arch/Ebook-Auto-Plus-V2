import { readFile } from 'node:fs/promises';

/** โหลด dependency จริงเข้า VM ของเทสต์ ซึ่งรัน classic script และอ่าน import แบบ ESM ไม่ได้ */
export async function serviceWorkerSource() {
  const deps = [
    ["import { updateTabWhenReady } from './core/tab-update.js';", '../core/tab-update.js'],
    ["import { flowPrepareTarget } from './core/flow-account.js';", '../core/flow-account.js'],
  ];
  let worker = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
  for (const [line, file] of deps) {
    if (!worker.includes(line)) throw new Error('Service worker imports changed; update the VM fixture');
    const src = await readFile(new URL(file, import.meta.url), 'utf8');
    worker = worker.replace(line, () => src.replace(/^export /gm, ''));
  }
  return worker;
}
