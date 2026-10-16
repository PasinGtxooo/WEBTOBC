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

/* ----- จัดหมวดสินค้า (เดาจากชื่อ+คำค้น) ไว้โชว์รายการแบบคนขาย ----- */
function catOf(item){
  const keys=Array.isArray(item.keys)?item.keys.join(" "):(item.keys||"");
  const s=(item.name+" "+keys).toLowerCase();
  if(/เมาส์|เม้าส์|mouse/.test(s))               return"🖱️ เมาส์";
  if(/คีย์บอร์ด|คีบอด|keyboard|แป้นพิมพ์/.test(s)) return"⌨️ คีย์บอร์ด";
  if(/จอ|monitor|หน้าจอ/.test(s))                 return"🖥️ จอมอนิเตอร์";
  if(/หูฟัง|headphone|headset|earphone|earbud/.test(s)) return"🎧 หูฟัง";
  if(/สาย|hub|usb|adapter|อะแดปเตอร์|ชาร์จ|charger|เมมโมรี|flashdrive|แฟลชไดร/.test(s)) return"🔌 สาย/อุปกรณ์เสริม";
  if(/น้ำ|โค้ก|โคล่า|โซดา|กาแฟ|ขนม|มัน|ทิชชู|กระดาษ/.test(s)) return"🧃 ของกินของใช้";
  return"📦 อื่นๆ";
}

/* สร้างข้อความรายการสินค้าแบบคนขาย (จัดเป็นหมวด + ราคา) — บอกแค่ "มี" ไม่บอกจำนวนคงเหลือ */
function catalogText(list){
  const groups={};
  list.forEach(i=>{ const c=catOf(i); (groups[c]=groups[c]||[]).push(i); });
  let out="มีหลายอย่างเลยครับ 😊 ตอนนี้ที่ร้านมี\n";
  for(const c of Object.keys(groups)){
    out+=`\n${c}\n`;
    groups[c].forEach(i=>{
      const price=(i.price!=null)?` — ${i.price.toLocaleString()} บาท`:"";
      out+=`• ${i.name}${price}\n`;
    });
  }
  out+=`\nสนใจตัวไหน พิมพ์ชื่อหรือยี่ห้อได้เลยครับ เช่น "เอา ${list[0].name} 1"`;
  return out.trim();
}

/* ----- โหมดแอดมิน: ของไม่พอ ช่วยคิดหาทางออกให้ลูกค้า ----- */
// คืนข้อความเสนอทางเลือก: รับเท่าที่มี / รุ่นใกล้เคียงพร้อมส่ง / แอดมินช่วยจัดหาส่วนที่ขาด
function shortSuggest(item, want, items){
  const have=item.stock||0;
  const emo=catOf(item).split(" ")[0];   // ไอคอนตามหมวด (🖱️/⌨️/...)
  let msg=`ขออภัยครับ ${emo} ${item.name} ขอมา ${want} ชิ้น แต่ตอนนี้จัดให้ได้ ${have} ชิ้น`;
  const opts=[];
  if(have>0) opts.push(`รับ ${have} ชิ้นก่อนได้เลย (พิมพ์ "เอา ${item.name} ${have}")`);
  // หารุ่นใกล้เคียงหมวดเดียวกันที่สต็อกพอกับที่ขอ (เรียงของเยอะสุดก่อน)
  const cat=catOf(item);
  const alt=items.filter(i=>i.no!==item.no && catOf(i)===cat && (i.stock||0)>=want)
                 .sort((a,b)=>(b.stock||0)-(a.stock||0))
                 .slice(0,2);
  alt.forEach(a=>{
    const p=(a.price!=null)?` (${a.price.toLocaleString()} บาท)`:"";
    opts.push(`หรือรุ่นใกล้เคียงที่พร้อมส่ง ${want} ชิ้น: ${a.name}${p}`);
  });
  if(have<want) opts.push(`ส่วนที่ขาด เดี๋ยวแอดมินช่วยจัดหา/แจ้งเมื่อของเข้าให้ครับ`);
  return msg + "\n" + opts.map(o=>"• "+o).join("\n");
}

/* ----- "สมอง" จำลอง: หาสินค้า + จำนวน + ตรวจความกำกวม (เวอร์ชันจริง = Claude) ----- */

// หน่วยนับ — ใช้ชี้ว่าเลขไหนคือ "จำนวน" จริง (กันไปหยิบเลขรุ่น เช่น MX 518)
const QTY_UNIT=/(\d+)\s*(ชิ้น|อัน|ตัว|แพ็?ค|กล่อง|ลัง|โหล|ชุด|คู่|เส้น|pcs?|pack)/i;

// หาเลขจำนวนใกล้ๆ ชื่อสินค้า (ดูหลังก่อน แล้วค่อยหน้า) — เลขที่มีหน่วยนับมาก่อน, หยุดที่ตัวคั่น
function qtyNear(text, endIdx, startIdx){
  // ข้างหลัง: ตั้งแต่จบคำไปจนเจอคำเชื่อม/ตัวคั่น ค่อยหยุด
  let after=text.slice(endIdx, endIdx+16);
  const cut=after.search(/[,+]|กับ|และ|กะ/);
  if(cut>=0) after=after.slice(0,cut);
  let m=after.match(QTY_UNIT);           // "2 ชิ้น" ชนะ "518" (เลขรุ่น)
  if(m) return parseInt(m[1],10);
  m=after.match(/\d+/);
  if(m) return parseInt(m[0],10);
  // ข้างหน้า: เฉพาะช่วงหลังตัวคั่นสุดท้าย (เลขต้องติดกับคำนี้ เช่น "50 แพ็คน้ำดื่ม")
  let before=text.slice(Math.max(0,startIdx-16), startIdx).split(/[,+]|กับ|และ|กะ/).pop();
  m=before.match(QTY_UNIT);
  if(m) return parseInt(m[1],10);
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
  if(idx>=0) return {idx, len:key.length, fuzzy:false};  // ตรงเป๊ะ
  if(key.length<4) return null;                   // คำสั้น (<4) ไม่เดาใกล้เคียง กัน "rog"≈"log"
  const tol = key.length<=4 ? 1 : 2;              // ยอมผิดได้ 1-2 ตัว
  for(let L=Math.max(2,key.length-1); L<=key.length+1; L++){
    for(let s=0; s+L<=text.length; s++){
      if(editDist(text.substr(s,L), key) <= tol) return {idx:s, len:L, fuzzy:true};
    }
  }
  return null;
}

// นับว่าคำค้นแต่ละคำ "ของกี่ชิ้นมี" — คำที่ของน้อยชิ้นมี = เจาะจง (เช่น ยี่ห้อ/รุ่น)
function keyCounts(items){
  const cnt={};
  items.forEach(it=>{
    const keys = Array.isArray(it.keys) ? it.keys : JSON.parse(it.keys||"[]");
    new Set(keys.map(k=>k.toLowerCase())).forEach(k=>cnt[k]=(cnt[k]||0)+1);
  });
  return cnt;
}

// หาสินค้าทุกตัวที่คำค้นตรง/ใกล้เคียงกับข้อความ (เก็บ "ทุกคำ" ที่ match + ตำแหน่ง + คำ)
function findMatches(text, items){
  const lower=text.toLowerCase();
  const matches=[];
  items.forEach(item=>{
    const keys = Array.isArray(item.keys) ? item.keys : JSON.parse(item.keys||"[]");
    for(const key of keys){
      const k=key.toLowerCase();
      const hit=findKey(lower, k);
      if(hit) matches.push({item, idx:hit.idx, len:hit.len, key:k, fuzzy:hit.fuzzy}); // เก็บทุกคำที่เจอ
    }
  });
  return matches;
}

// มีตัวคั่น/คำเชื่อม/ตัวเลข อยู่ในช่องว่างไหม = คนละชิ้น (อย่ารวมกลุ่ม)
function hasSep(gap){ return /[,+]|กับ|และ|กะ|\d/.test(gap); }

// วิเคราะห์ข้อความ -> รายการที่ชัดเจน (lines) + รายการที่กำกวม (ambiguous)
function analyze(text, items){
  const cnt=keyCounts(items);
  const matches=findMatches(text, items).sort((a,b)=>a.idx-b.idx);
  const clusters=[];
  matches.forEach(mt=>{
    const mEnd=mt.idx+mt.len;
    // จัดกลุ่ม: คำที่ทับตำแหน่งกัน หรือ อยู่ติดกัน (ช่องว่างสั้น ไม่มีตัวคั่น) = ลูกค้าพูดถึงของชิ้นเดียว
    // เช่น "คีย์บอร์ด razer" = คำทั่วไป+ยี่ห้อ ติดกัน -> กลุ่มเดียว แล้วเลือกตัวเจาะจงสุด
    let c=clusters.find(c=>{
      if(mt.idx < c.end && mEnd > c.start) return true;                        // ทับกัน
      return mt.idx>=c.end && (mt.idx-c.end)<=3 && !hasSep(text.slice(c.end,mt.idx)); // ติดกัน
    });
    if(c){ c.members.push(mt); c.start=Math.min(c.start,mt.idx); c.end=Math.max(c.end,mEnd); }
    else clusters.push({members:[mt], start:mt.idx, end:mEnd});
  });
  const lines=[], ambiguous=[], seen=new Set();
  clusters.forEach(c=>{
    const qty=qtyNear(text, c.end, c.start);
    // รวม match ตามสินค้า: นับจำนวน "คำ" ที่ครอบได้ + ความเจาะจงสูงสุด (ยี่ห้อ/รุ่น)
    const agg=new Map();
    c.members.forEach(m=>{
      let a=agg.get(m.item.no);
      if(!a){ a={item:m.item, spans:new Set(), spec:0, exact:0}; agg.set(m.item.no,a); }
      a.spans.add(m.idx);
      a.spec=Math.max(a.spec, 1/(cnt[m.key]||1));   // คำที่ของชิ้นเดียวมี = spec 1 (เจาะจงสุด)
      if(!m.fuzzy) a.exact=1;                        // มี match ที่ตรงเป๊ะ
    });
    // จัดอันดับ: ตรงเป๊ะ > ครอบคำได้มากสุด > เจาะจงสุด (ยี่ห้อ/รุ่น)
    let arr=[...agg.values()];
    const maxExact=Math.max(...arr.map(a=>a.exact));
    arr=arr.filter(a=>a.exact===maxExact);          // ตรงเป๊ะชนะใกล้เคียงเสมอ
    const maxCover=Math.max(...arr.map(a=>a.spans.size));
    arr=arr.filter(a=>a.spans.size===maxCover);
    const maxSpec=Math.max(...arr.map(a=>a.spec));
    const cands=arr.filter(a=>a.spec===maxSpec).map(a=>a.item);
    if(cands.length===1){ if(!seen.has(cands[0].no)){ lines.push({item:cands[0], qty}); seen.add(cands[0].no); } }
    else ambiguous.push({options:cands, qty});   // เจาะจงเท่ากันหลายตัว = กำกวม ต้องถาม
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
