/* ============================================================
   env.js — ค่า config สำหรับเบราว์เซอร์ (แก้ค่าที่ไฟล์นี้ที่เดียว)
   เว็บ static อ่าน .env ไม่ได้ จึงใช้ไฟล์นี้แทน
   (.env ตัวจริงเก็บไว้สำหรับ Python backend ในอนาคต)
   ============================================================ */
const ENV = {
  SUPABASE_URL: "https://temptotylhldctaspkdp.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRlbXB0b3R5bGhsZGN0YXNwa2RwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk5MDY1ODUsImV4cCI6MjEwNTQ4MjU4NX0.n50XQWPe4c4to0RFfqIO6FXKBo2Mo2VgG-Ms4iJie1o",
};

// เปิด/ปิด AI (Groq ผ่าน /api/chat)
//   false = ใช้ตัวจับคำในเครื่อง (เปิดเว็บดับเบิลคลิกได้ ไม่ต้องมีเซิร์ฟเวอร์)
//   true  = ใช้ AI จริง — ต้อง deploy บน Vercel และตั้ง GROQ_API_KEY ใน Vercel Environment Variables
//   (GROQ key อยู่ฝั่งเซิร์ฟเวอร์เท่านั้น ห้ามใส่ในไฟล์นี้)
const USE_AI = false;
