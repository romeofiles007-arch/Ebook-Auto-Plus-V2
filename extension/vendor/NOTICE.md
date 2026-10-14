# ไลบรารีภายนอกที่แจกมาพร้อมโปรเจกต์นี้

| ไฟล์ | คืออะไร | ที่มา | สัญญาอนุญาต |
|---|---|---|---|
| `typst/typst.mjs` | typst.ts — ตัวเชื่อม JavaScript ของ Typst | https://github.com/Myriad-Dreamin/typst.ts | Apache-2.0 |
| `typst/compiler.wasm` | ตัวคอมไพล์ Typst คอมไพล์เป็น WebAssembly | https://github.com/typst/typst | Apache-2.0 |
| `typst/renderer.wasm` | ตัวเรนเดอร์ของ typst.ts | https://github.com/Myriad-Dreamin/typst.ts | Apache-2.0 |
| `pdfjs/pdf.min.mjs` · `pdfjs/pdf.worker.min.mjs` | PDF.js 4.10.38 (legacy build จากแพ็กเกจ npm `pdfjs-dist`) — ใช้ดึงข้อความจาก PDF ต้นฉบับของผู้ใช้ | https://github.com/mozilla/pdf.js | Apache-2.0 (`pdfjs/LICENSE`) |

ไฟล์เหล่านี้ถูกแจกมาในคลังโดยตรงเพื่อให้ส่วนขยายทำงานได้ทันทีหลัง Load unpacked
โดยไม่ต้องดาวน์โหลดอะไรเพิ่ม และไม่ต้องพึ่ง CDN ระหว่างใช้งาน
