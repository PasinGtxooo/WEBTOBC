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

// หาเลขจำนวนใกล้ๆ ชื่อสินค้า (ดูหลังก่อน แล้วค่อยหน้า) — หยุดที่ตัวคั่น จะได้ไม่หยิบเลขของชิ้นอื่น
function qtyNear(text, endIdx, startIdx){
  // ข้างหลัง: ตั้งแต่จบคำไปจนเจอคำเชื่อม/ตัวคั่น ค่อยหยุด
  let after=text.slice(endIdx, endIdx+12);
  const cut=after.search(/[,+]|กับ|และ|กะ/);
  if(cut>=0) after=after.slice(0,cut);
  let m=after.match(/\d+/);
  if(m) return parseInt(m[0],10);
  // ข้างหน้า: เฉพาะช่วงหลังตัวคั่นสุดท้าย (เลขต้องติดกับคำนี้ เช่น "50 แพ็คน้ำดื่ม")
  let before=text.slice(Math.max(0,startIdx-12), startIdx).split(/[,+]|กับ|และ|กะ/).pop();
  const bm=before.match(/\d+/g);
  return bm ? parseInt(bm[bm.length-1],10) : null;   // null = ไม่ได้บอกจำนวน (จะไปถามทีหลัง)
}

// ระยะแก้ไข (Levenshtein) — ไว้วัดว่าคำใกล้กันแค่ไหน
function editDist(a, b){
  const m=a.length, n=b.length;
  if(!m) return n; if(!n) return m;
  let prev=Array.from({length:n+1},(_,i)=>i), cur=new Array(n+1);
  for(let i=1;i<=m;i++){
    cur[0]=i;
    for(let j=1;j<=n;j++){
      const cost=a[i-1]===b[j-1]?0:1;
      cur[j]=Math.min(cur[j-1]+1, prev[j]+1, prev[j-1]+cost);
    }
    [prev,cur]=[cur,prev];
  }
  return prev[n];
}

// หาคำค้นในข้อความ: ตรงเป๊ะก่อน ถ้าไม่เจอค่อยหา "คำใกล้เคียง" (พิมพ์ผิด/ตกวรรณยุกต์)
function findKey(text, key){
  const idx=text.indexOf(key);
  if(idx>=0) return {idx, len:key.length};        // ตรงเป๊ะ
  if(key.length<3) return null;
  const tol = key.length<=4 ? 1 : 2;              // ยอมผิดได้ 1-2 ตัว
  for(let L=Math.max(2,key.length-1); L<=key.length+1; L++){
    for(let s=0; s+L<=text.length; s++){
      if(editDist(text.substr(s,L), key) <= tol) return {idx:s, len:L};
    }
  }
  return null;
}

// หาสินค้าทุกตัวที่คำค้นตรง/ใกล้เคียงกับข้อความ (เก็บ "ทุกคำ" ที่ match + ตำแหน่ง + ความยาว)
function findMatches(text, items){
  const lower=text.toLowerCase();
  const matches=[];
  items.forEach(item=>{
    const keys = Array.isArray(item.keys) ? item.keys : JSON.parse(item.keys||"[]");
    for(const key of keys){
      const hit=findKey(lower, key.toLowerCase());
      if(hit) matches.push({item, idx:hit.idx, len:hit.len}); // เก็บทุกคำที่เจอ (ทั่วไป+ยี่ห้อ)
    }
  });
  return matches;
}

// มีตัวคั่น/คำเชื่อม/ตัวเลข อยู่ในช่องว่างไหม = คนละชิ้น (อย่ารวมกลุ่ม)
function hasSep(gap){ return /[,+]|กับ|และ|กะ|\d/.test(gap); }

// วิเคราะห์ข้อความ -> รายการที่ชัดเจน (lines) + รายการที่กำกวม (ambiguous)
function analyze(text, items){
  const matches=findMatches(text, items).sort((a,b)=>a.idx-b.idx);
  const clusters=[];
  matches.forEach(mt=>{
    const mEnd=mt.idx+mt.len;
    // จัดกลุ่ม: คำที่ทับตำแหน่งกัน หรือ อยู่ติดกัน (ช่องว่างสั้น ไม่มีตัวคั่น) = ลูกค้าพูดถึงของชิ้นเดียว
    // เช่น "เมาส์ logitech" = เมาส์(ทั่วไป)+ยี่ห้อ ติดกัน -> กลุ่มเดียว แล้วเลือกตัวเจาะจงสุด
    let c=clusters.find(c=>{
      if(mt.idx < c.end && mEnd > c.start) return true;                        // ทับกัน
      return mt.idx>=c.end && (mt.idx-c.end)<=3 && !hasSep(text.slice(c.end,mt.idx)); // ติดกัน
    });
    if(c){ c.members.push({item:mt.item,len:mt.len}); c.start=Math.min(c.start,mt.idx); c.end=Math.max(c.end,mEnd); }
    else clusters.push({members:[{item:mt.item,len:mt.len}], start:mt.idx, end:mEnd});
  });
  const lines=[], ambiguous=[], seen=new Set();
  clusters.forEach(c=>{
    const qty=qtyNear(text, c.end, c.start);
    const maxLen=Math.max(...c.members.map(m=>m.len));
    // ตัวที่ match เจาะจงสุด (คำยาวสุด) + ตัดสินค้าซ้ำในกลุ่มเดียวกัน
    const cands=[...new Map(c.members.filter(m=>m.len===maxLen).map(m=>[m.item.no,m.item])).values()];
    if(cands.length===1){ if(!seen.has(cands[0].no)){ lines.push({item:cands[0], qty}); seen.add(cands[0].no); } }
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
