// api/chat.js — Vercel Serverless Function (รันฝั่งเซิร์ฟเวอร์ GROQ key ไม่โผล่ในเบราว์เซอร์)
// รับข้อความลูกค้า + รายการสินค้า -> ให้ AI แปลงเป็นออเดอร์ (คืน Item No. + จำนวน)
import Groq from "groq-sdk";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  if (!process.env.GROQ_API_KEY) return res.status(500).json({ error: "ยังไม่ได้ตั้ง GROQ_API_KEY บน Vercel" });

  const { message, items } = req.body || {};
  if (!message || !Array.isArray(items)) return res.status(400).json({ error: "ต้องส่ง message และ items" });

  // แคตตาล็อกที่ส่งให้ AI: เฉพาะ No./ชื่อ/คำค้น — ไม่ส่งต้นทุนหรือราคา
  const catalog = items.map(i => {
    const keys = Array.isArray(i.keys) ? i.keys : JSON.parse(i.keys || "[]");
    return `${i.no}: ${i.name} (คำค้น: ${keys.join(", ")})`;
  }).join("\n");

  const system = `คุณเป็นผู้ช่วยรับออเดอร์ร้านค้าส่ง ตอบเป็นภาษาไทย
หน้าที่: อ่านข้อความลูกค้า แล้วจับคู่กับ "สินค้าในระบบ" ด้านล่างเท่านั้น ห้ามแต่งสินค้าเอง

กติกา:
- ถ้าคำที่ลูกค้าพูดตรงกับสินค้าตัวเดียว -> ใส่ใน lines
- ถ้าตรงกับหลายตัว (กำกวม) -> ใส่ใน ambiguous ให้ระบบไปถามลูกค้า
- ถ้าไม่เจอสินค้าเลย -> lines/ambiguous ว่าง แล้วเขียน reply อธิบายสั้นๆ
- คืน Item No. เสมอ ไม่ต้องคืนราคา

ตอบเป็น JSON เท่านั้น รูปแบบ:
{"lines":[{"no":"1003","qty":10}],"ambiguous":[{"options":["FRT-01","FRT-02"],"qty":5}],"reply":""}

สินค้าในระบบ:
${catalog}`;

  try {
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const completion = await groq.chat.completions.create({
      model: "openai/gpt-oss-20b",
      temperature: 0,
      max_completion_tokens: 1024,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: message },
      ],
    });
    const raw = completion.choices[0]?.message?.content || "{}";
    let data;
    try { data = JSON.parse(raw); }
    catch { data = { lines: [], ambiguous: [], reply: raw }; }
    res.status(200).json({
      lines: data.lines || [],
      ambiguous: data.ambiguous || [],
      reply: data.reply || "",
    });
  } catch (e) {
    res.status(500).json({ error: "เรียก Groq ไม่สำเร็จ: " + e.message });
  }
}
