/* ============================================================
   shared.js — เชื่อม Supabase + "สมอง" จำลอง (ใช้ร่วม 2 หน้า)
   เวอร์ชันจริง: parseOrder เปลี่ยนเป็น Claude,
   การเช็ก/สร้างออเดอร์ยิงผ่าน Python → BC (MCP) ไม่ใช่ Supabase ตรง
   ============================================================ */

/* ----- กฎธุรกิจ ----- */
const MAX_ORDERS_PER_DAY = 3;     // จำกัดออเดอร์/ลูกค้า/วัน
const APPROVAL_LIMIT     = 30000; // ยอดเกินนี้ต้องหัวหน้าอนุมัติ

/* ----- ต่อ Supabase (แบบไม่พังแม้ config หาย) ----- */
// อ่านค่าแบบปลอดภัย: ถ้าไม่มี config.js ก็จะไม่ throw ทั้งไฟล์
const CFG_URL = (typeof SUPABASE_URL     !== "undefined") ? SUPABASE_URL     : "";
const CFG_KEY = (typeof SUPABASE_ANON_KEY !== "undefined") ? SUPABASE_ANON_KEY : "";

let sb = null;
let sbReason = "";
if (typeof supabase === "undefined") {
  sbReason = "โหลดไลบรารี Supabase ไม่ได้ (ต้องต่ออินเทอร์เน็ต)";
} else if (!CFG_URL || CFG_URL.includes("xxxx") || !CFG_KEY || CFG_KEY.includes("...")) {
  sbReason = "ยังไม่ได้ตั้งค่า SUPABASE_URL / SUPABASE_ANON_KEY (config.js หาย หรือค่ายังเป็น placeholder)";
} else {
  try { sb = supabase.createClient(CFG_URL, CFG_KEY); }
  catch (e) { sbReason = "createClient ล้มเหลว: " + e.message; }
}
if (sbReason) console.error("[Supabase] " + sbReason);

/* คืน client ถ้าพร้อม ไม่งั้นโยน error พร้อมสาเหตุ */
function client(){
  if (!sb) throw new Error(sbReason || "Supabase ไม่พร้อม");
  return sb;
}

/* ตัวช่วย: ถ้ามี error ให้โยนออกมาพร้อมข้อความชัดๆ (จะได้เห็นว่าติดอะไร) */
function check(resp, where){
  if (resp.error) {
    console.error("[DB error @ " + where + "]", resp.error);
    throw new Error(where + ": " + (resp.error.message || JSON.stringify(resp.error)));
  }
  return resp;
}

/* ----- อิโมจิสินค้า (เดาจากชื่อ ใช้ได้ทั้ง 2 หน้า) ----- */
function nameEmoji(name){
  if(name.includes("น้ำอัดลม")||name.includes("โคล่า")||name.includes("โค้ก"))return"🥤";
  if(name.includes("โซดา"))return"🫧";
  if(name.includes("น้ำ"))return"💧";
  if(name.includes("มัน")||name.includes("ขนม"))return"🍟";
  if(name.includes("ทิชชู")||name.includes("กระดาษ"))return"🧻";
  return"📦";
}

/* ----- "สมอง" จำลอง: หาสินค้า + จำนวน + ตรวจความกำกวม (เวอร์ชันจริง = Claude) ----- */

// หาเลขจำนวนใกล้ๆ ชื่อสินค้า (ดูหลังก่อน แล้วค่อยหน้า)
function qtyNear(text, endIdx, startIdx){
  let m=text.slice(endIdx, endIdx+12).match(/\d+/);
  if(!m){ const bm=text.slice(Math.max(0,startIdx-12),startIdx).match(/\d+/g); if(bm) m=[bm[bm.length-1]]; }
  return m ? parseInt(m[0],10) : 1;
}

// หาสินค้าทุกตัวที่คำค้นตรงกับข้อความ (เก็บตำแหน่ง + ความยาวคำที่ match)
function findMatches(text, items){
  const lower=text.toLowerCase();
  const matches=[];
  items.forEach(item=>{
    const keys = Array.isArray(item.keys) ? item.keys : JSON.parse(item.keys||"[]");
    let best=null;
    for(const key of keys){
      const idx=lower.indexOf(key.toLowerCase());
      if(idx===-1)continue;
      if(!best || key.length>best.len) best={idx, len:key.length}; // เอาคำที่ยาวสุด = เจาะจงสุด
    }
    if(best) matches.push({item, idx:best.idx, len:best.len});
  });
  return matches;
}

// วิเคราะห์ข้อความ -> รายการที่ชัดเจน (lines) + รายการที่กำกวม (ambiguous)
function analyze(text, items){
  const matches=findMatches(text, items).sort((a,b)=>a.idx-b.idx);
  const clusters=[];
  matches.forEach(mt=>{
    // จัดกลุ่มคำที่ทับตำแหน่งเดียวกัน (= ลูกค้าพูดถึงของชิ้นเดียว)
    let c=clusters.find(c=> mt.idx < c.end && (mt.idx+mt.len) > c.start);
    if(c){ c.members.push({item:mt.item,len:mt.len}); c.start=Math.min(c.start,mt.idx); c.end=Math.max(c.end,mt.idx+mt.len); }
    else clusters.push({members:[{item:mt.item,len:mt.len}], start:mt.idx, end:mt.idx+mt.len});
  });
  const lines=[], ambiguous=[];
  clusters.forEach(c=>{
    const qty=qtyNear(text, c.end, c.start);
    const maxLen=Math.max(...c.members.map(m=>m.len));
    const cands=c.members.filter(m=>m.len===maxLen).map(m=>m.item); // ตัวที่ match เจาะจงสุด
    if(cands.length===1) lines.push({item:cands[0], qty});
    else ambiguous.push({options:cands, qty});   // เจอหลายตัวเท่ากัน = กำกวม ต้องถาม
  });
  return {lines, ambiguous};
}

// เลือกจากตัวเลือก (พิมพ์เลข หรือพิมพ์ชื่อ)
function resolveChoice(text, options){
  const n=parseInt(text.trim(),10);
  if(n>=1 && n<=options.length) return options[n-1];
  const t=text.toLowerCase().trim();
  if(t) return options.find(o=> o.name.toLowerCase().includes(t) || t.includes(o.name.toLowerCase())) || null;
  return null;
}

/* ----- ตัวช่วยคุยกับฐานข้อมูล (ทุกตัวโยน error ถ้าพลาด) ----- */
const DB = {
  async items(){
    const {data}=check(await client().from("items").select("*").order("no"),"items");
    return data||[];
  },
  async customers(){
    const {data}=check(await client().from("customers").select("*").order("no"),"customers");
    return data||[];
  },
  async customer(no){
    const {data}=check(await client().from("customers").select("*").eq("no",no).single(),"customer");
    return data;
  },
  async addOrder(o){
    const {data}=check(await client().from("orders").insert(o).select().single(),"addOrder");
    return data;
  },
  async draftOrders(){
    const {data}=check(await client().from("orders").select("*").eq("status","draft").order("id",{ascending:false}),"draftOrders");
    return data||[];
  },
  async setStatus(id,status){
    check(await client().from("orders").update({status}).eq("id",id),"setStatus");
  },
  async ordersStatus(ids){
    if(!ids.length)return [];
    const {data}=check(await client().from("orders").select("id,status").in("id",ids),"ordersStatus");
    return data||[];
  },
  async countToday(custNo){
    const start=new Date(); start.setHours(0,0,0,0);
    const {count}=check(await client().from("orders").select("id",{count:"exact",head:true})
      .eq("cust_no",custNo).gte("created_at",start.toISOString()),"countToday");
    return count||0;
  },
};
