# สัญญาอนุญาตของไลบรารีและฟอนต์ที่แจกมาด้วย

โค้ดของโปรเจกต์นี้อยู่ภายใต้ MIT (ดู [LICENSE](LICENSE))
ส่วนไฟล์ต่อไปนี้เป็นของผู้อื่นและมีสัญญาอนุญาตของตัวเอง

ไฟล์ในโฟลเดอร์ต่อไปนี้มีสัญญาอนุญาตของตัวเอง ไม่ได้อยู่ภายใต้ MIT ข้างบน

- extension/fonts/     ฟอนต์ Sarabun และ IBM Plex Sans Thai — SIL Open Font License 1.1
                       ดูรายละเอียดที่ extension/fonts/NOTICE.md
- extension/fonts/cover/  ฟอนต์ไทยสำหรับหน้าปกจาก Google Fonts 10 ชุด — SIL Open Font License 1.1
                         ไฟล์ต้นฉบับไม่ได้ดัดแปลง เก็บสิทธิ์แต่ละชุดและแหล่งที่มาพร้อม SHA-256 ไว้ในโฟลเดอร์เดียวกัน
- extension/fonts/cover/SP-Kangfu.ttf  พู่กันจีนภาษาไทย โดย SP-Font — เงื่อนไขฟอนต์.คอม (ไม่ใช่ OFL)
                                     ดู extension/fonts/cover/LICENSE-SP-Kangfu.txt และ SOURCES-SP-Kangfu.json
- extension/vendor/    typst.ts และ Typst compiler (WASM), PDF.js — Apache License 2.0
                       ดูรายละเอียดที่ extension/vendor/NOTICE.md

ไฟล์ทั้งหมดถูกแจกมาในคลังโดยตรงเพื่อให้ส่วนขยายทำงานได้ทันทีหลัง Load unpacked
โดยไม่ต้องดาวน์โหลดเพิ่มและไม่ต้องพึ่ง CDN ระหว่างใช้งาน
