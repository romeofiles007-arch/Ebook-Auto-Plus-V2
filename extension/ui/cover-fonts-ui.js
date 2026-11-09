import { COVER_FONTS, resolveCoverTypography } from '../core/cover-fonts.js';

export function paintCoverFontPicker(doc = document) {
  const select=doc.getElementById('coverFont');
  const sample=doc.getElementById('coverFontSample');
  const name=doc.getElementById('coverFontName');
  if(!select||!sample||!name) return;
  const value=(id,fallback)=>doc.getElementById(id)?.value||fallback;
  const draft={language:value('lang','th'),contentMode:value('contentMode','prose'),fictionGenre:value('fictionGenre','fantasy'),genre:value('genre','how-to'),typography:{coverFont:select.value,headFont:value('headFont','IBM Plex Sans Thai'),bodyFont:value('bodyFont','Sarabun')}};
  const font=resolveCoverTypography(draft);
  sample.textContent=value('title','ชื่อเรื่องภาษาไทย');
  sample.style.fontFamily=`${JSON.stringify(font.family)}, Sarabun, sans-serif`;
  sample.style.fontWeight=String(font.weight);
  sample.style.setProperty('--cover-font-scale',String(font.sizeScale));
  select.disabled=draft.language!=='th';
  name.textContent=select.disabled?'ชื่อเรื่องภาษาอังกฤษใช้ฟอนต์หัวเรื่องของเล่ม':`${select.value==='auto'?'เลือกตามหมวด: ':''}${font.family} · ${font.label}`;
  const license=doc.getElementById('coverFontLicense');
  if(license) license.textContent=select.disabled?'ชื่อเรื่องบนปกจะใช้ฟอนต์หัวเรื่องของเล่ม':`ใช้ทำปกเชิงพาณิชย์ได้ตามเงื่อนไข ${font.licenseId} · แบบพิมพ์ทับใช้ฟอนต์จริง ส่วนข้อความที่ AI วาดในภาพจะอิงสไตล์นี้`;
}

export function mountCoverFontPicker(doc = document) {
  const select=doc.getElementById('coverFont');
  if(!select) return;
  const previous=select.value||'auto';
  select.replaceChildren();
  for(const [value,label] of [['auto','อัตโนมัติตามหมวดหนังสือ'],...COVER_FONTS.map(font=>[font.family,font.label])]) {
    const option=doc.createElement('option');option.value=value;option.textContent=label;select.append(option);
  }
  select.value=COVER_FONTS.some(font=>font.family===previous)?previous:'auto';
  for(const id of ['coverFont','contentMode','fictionGenre','genre','lang','headFont','bodyFont']) doc.getElementById(id)?.addEventListener('change',()=>paintCoverFontPicker(doc));
  doc.getElementById('title')?.addEventListener('input',()=>paintCoverFontPicker(doc));
  paintCoverFontPicker(doc);
}
