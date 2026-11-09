# ฟอนต์ไทยสำหรับหน้าปก

ไฟล์ TTF ในโฟลเดอร์นี้มี 11 ชุด เป็นไฟล์ต้นฉบับที่ไม่ได้ดัดแปลง: 10 ชุดจาก [Google Fonts](https://github.com/google/fonts) ภายใต้ SIL Open Font License 1.1 และ SP-Kangfu จาก SP-Font ภายใต้ [เงื่อนไขฟอนต์.คอม](https://www.f0nt.com/about/license/) ทั้งหมดใช้ทำหน้าปกหนังสือเพื่อขายได้ตามเงื่อนไขของแต่ละชุด

| หมวดอัตโนมัติ | ฟอนต์และน้ำหนัก | สัญญาอนุญาตต้นฉบับ |
|---|---|---|
| โรแมนติก | Charmonman Bold 700 | [OFL](OFL-charmonman.txt) |
| แฟนตาซี / สยองขวัญ | Chonburi Regular 400 | [OFL](OFL-chonburi.txt) |
| ไซไฟ | Chakra Petch Bold 700 | [OFL](OFL-chakrapetch.txt) |
| สืบสวน / วรรณกรรมร่วมสมัย | Pridi Bold 700 | [OFL](OFL-pridi.txt) |
| ทริลเลอร์ | Kanit Bold 700 | [OFL](OFL-kanit.txt) |
| ดราม่า | Pattaya Regular 400 | [OFL](OFL-pattaya.txt) |
| ผจญภัย | Niramit Bold 700 | [OFL](OFL-niramit.txt) |
| Coming of Age | Sriracha Regular 400 | [OFL](OFL-sriracha.txt) |
| นิยายสำหรับผู้สูงอายุ | Mitr SemiBold 600 | [OFL](OFL-mitr.txt) |
| จีนโบราณ | SP-Kangfu Regular 400 — พู่กันจีน | [เงื่อนไข SP-Kangfu](LICENSE-SP-Kangfu.txt) |
| ตัวเลือกเพิ่มเติม — ลายมืออ่อนช้อย | Charm Bold 700 | [OFL](OFL-charm.txt) |

หมวดที่ใช้ฟอนต์ร่วมกันมีแนวทางตกแต่งชื่อเรื่องต่างกัน เช่น แฟนตาซีสง่างาม ส่วนสยองขวัญใช้หมึกเก่าหม่นโดยไม่ทำลายสระและวรรณยุกต์ หนังสือทั่วไปใช้ Kanit, ตำราใช้ Pridi, พัฒนาตัวเองใช้ Mitr, กรณีศึกษาใช้ Niramit และหนังสือรายชิ้นใช้ Charmonman สามารถเลือกฟอนต์เองแทนค่าอัตโนมัติได้

เก็บ copyright และใบอนุญาตคู่กับไฟล์ฟอนต์ทุกครั้งที่แจกจ่ายซอฟต์แวร์ ฟอนต์ OFL เก็บข้อความฉบับเต็มไว้ตามเดิม งานปกหรือหนังสือที่ใช้ฟอนต์ OFL ไม่ต้องใช้ OFL ตามฟอนต์ ดู [OFL FAQ](https://openfontlicense.org/ofl-faq/) ส่วน SP-Kangfu ใช้เงื่อนไขแยก ห้ามขายไฟล์ฟอนต์เดี่ยวหรือเปิดเป็นแหล่งดาวน์โหลดฟอนต์ และต้องขอเจ้าของก่อนดัดแปลงเชิงพาณิชย์หรือแจกฉบับดัดแปลง

แหล่งดาวน์โหลดแบบตรึง revision และ SHA-256 ของฟอนต์ OFL อยู่ใน [SOURCES.json](SOURCES.json) เครื่องมือบำรุงรักษา `extension/tools/download-cover-fonts.mjs` ดาวน์โหลดเฉพาะชุด OFL และไม่ทำงานระหว่างผู้ใช้สร้างหนังสือ ส่วน SP-Kangfu มีหลักฐานที่มาใน [SOURCES-SP-Kangfu.json](SOURCES-SP-Kangfu.json)

ระบบพิมพ์ทับภาพใช้ไฟล์ฟอนต์จริง ส่วนข้อความที่โมเดลวาดรวมในภาพใช้ชื่อฟอนต์เป็นแนวทางรูปลักษณ์ จึงไม่รับประกันว่ารูปทรงหรือการสะกดจะตรงกับไฟล์ฟอนต์ทุกตัวอักษร
