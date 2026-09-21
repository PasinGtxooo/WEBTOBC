/* ============================================================
   config.js — ค่าที่เบราว์เซอร์ใช้ (ก๊อปมาจาก .env)
   เว็บ static อ่าน .env เองไม่ได้ จึงต้องใส่ที่นี่ด้วย
   หาค่าได้จาก: Supabase → Project Settings → API
   ไฟล์นี้อยู่ใน .gitignore แล้ว (ไม่ขึ้น Git)
   ============================================================ */
const SUPABASE_URL      = ENV.SUPABASE_URL;   // <-- แก้เป็นของคุณ
const SUPABASE_ANON_KEY = ENV.SUPABASE_ANON_KEY;                       // <-- แก้เป็นของคุณ (anon public key)
