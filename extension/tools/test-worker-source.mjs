import { readFile } from 'node:fs/promises';

/** โหลด dependency จริงเข้า VM ของเทสต์ ซึ่งรัน classic script และอ่าน import แบบ ESM ไม่ได้ */
export async function serviceWorkerSource() {
  const [worker, tabUpdate] = await Promise.all([
    readFile(new URL('../sw.js', import.meta.url), 'utf8'),
    readFile(new URL('../core/tab-update.js', import.meta.url), 'utf8'),
  ]);
  const dependency = "import { updateTabWhenReady } from './core/tab-update.js';";
  if (!worker.includes(dependency)) throw new Error('Service worker imports changed; update the VM fixture');
  return worker.replace(dependency, () => tabUpdate.replace(/^export /gm, ''));
}
