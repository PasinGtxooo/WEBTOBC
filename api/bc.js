// api/bc.js — ตัวกลางฝั่งเซิร์ฟเวอร์ Vercel: ขอ token + เรียก codeunit ของ BC
// ความลับ (client secret) อยู่ที่นี่ ไม่โผล่ในเบราว์เซอร์
// ตั้งค่าใน Vercel Environment Variables: BC_TENANT_ID, BC_ENVIRONMENT, BC_COMPANY, BC_CLIENT_ID, BC_CLIENT_SECRET

let cachedToken = { value: "", exp: 0 };

async function getToken() {
  const now = Date.now();
  if (cachedToken.value && now < cachedToken.exp) return cachedToken.value;

  const tenant = process.env.BC_TENANT_ID;
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: process.env.BC_CLIENT_ID,
    client_secret: process.env.BC_CLIENT_SECRET,
    scope: "https://api.businesscentral.dynamics.com/.default",
  });
  const res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = await res.json();
  if (!json.access_token) throw new Error("ขอ token ไม่ได้: " + JSON.stringify(json));
  cachedToken = { value: json.access_token, exp: now + (json.expires_in - 60) * 1000 };
  return cachedToken.value;
}

// เรียก unbound action ของ codeunit (คืนค่า value ที่ parse แล้ว)
// noInput = true สำหรับ action ที่ไม่มีพารามิเตอร์ (เช่น TestConnect)
async function callBC(action, inputObj, noInput) {
  const tenant = process.env.BC_TENANT_ID;
  const env = process.env.BC_ENVIRONMENT;
  const company = process.env.BC_COMPANY;
  const token = await getToken();

  const url = `https://api.businesscentral.dynamics.com/v2.0/${tenant}/${env}/ODataV4/QUICKWebAgent_${action}?company=${encodeURIComponent(company)}`;
  const body = noInput ? {} : { input: inputObj === undefined ? "" : JSON.stringify(inputObj) };
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message || JSON.stringify(json.error));
  // codeunit คืน value เป็น JSON string -> parse ให้เป็น object/array
  try { return JSON.parse(json.value); } catch { return json.value; }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const { action, payload } = req.body || {};
  try {
    if (action === "getItems") {
      return res.status(200).json({ items: await callBC("getItems") });
    }
    if (action === "getCustomerCheck") {
      return res.status(200).json(await callBC("getCustomerCheck", payload));
    }
    if (action === "createOrder") {
      return res.status(200).json(await callBC("createOrder", payload));
    }
    if (action === "test") {
      return res.status(200).json(await callBC("TestConnect", undefined, true));
    }
    return res.status(400).json({ error: "action ไม่ถูกต้อง" });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
