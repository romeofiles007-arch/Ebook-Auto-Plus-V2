/**
 * ขับ Gemini ผ่านแท็บจริง (gemini.google.com) — งานเขียนข้อความ
 *
 * ตัวขับในแท็บ (adapter/gemini.js) พูดโปรโตคอลเดียวกับของ ChatGPT ทุกข้อความ
 * นาฬิกาจับตาย การถามแท็บตอนเทิร์นเงียบ และการต่อเวลา จึงใช้ของ ChatGptTabTransport ได้ทั้งชุด
 * ต่างกันอย่างเดียวคือ service worker ต้องรู้ว่าให้ไปหาแท็บของเว็บไหน
 */

import { ChatGptTabTransport } from './chatgpt-tab.js';

export class GeminiTabTransport extends ChatGptTabTransport {
  constructor(opts = {}) {
    super({ ...opts, site: 'gemini' });
  }

  /**
   * kind ยังเป็น 'chatgpt_tab' โดยตั้งใจ — ทั้งระบบใช้ค่านี้ในความหมายว่า "สายที่ขับแท็บแชตจริง"
   * (หน่วงจังหวะระหว่างเทิร์น · บันไดกู้ห้องใหม่/โหลดแท็บ) ซึ่ง Gemini ต้องได้ครบทุกข้อเหมือนกัน
   * สิ่งที่แยกสองเว็บออกจากกันคือ this.site ที่ส่งไปกับทุกข้อความถึง service worker
   */
}
