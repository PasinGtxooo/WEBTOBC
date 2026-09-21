/* ============================================================
   shared.js — เชื่อม Supabase + "สมอง" จำลอง (ใช้ร่วม 2 หน้า)
   เวอร์ชันจริง: parseOrder เปลี่ยนเป็น Claude,
   การเช็ก/สร้างออเดอร์ยิงผ่าน Python → BC (MCP) ไม่ใช่ Supabase ตรง
   ============================================================ */

/* ----- กฎธุรกิจ ----- */
const MAX_ORDERS_PER_DAY = 3;     // จำกัดออเดอร์/ลูกค้า/วัน
const APPROVAL_LIMIT     = 30000; // ยอดเกินนี้ต้องหัวหน้าอนุมัติ

/* ----- ต่อ Supabase ----- */
if (typeof supabase === "undefined") {
  alert("โหลดไลบรารี Supabase ไม่ได้ — ต้องเปิดเว็บขณะต่ออินเทอร์เน็ต");
}
if (!SUPABASE_URL || SUPABASE_URL.includes("xxxx") || !SUPABASE_ANON_KEY || SUPABASE_ANON_KEY.includes("...")) {
  alert("ยังไม่ได้ใส่ค่าใน config.js (SUPABASE_URL / SUPABASE_ANON_KEY)");
}
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ตัวช่วย: ถ้ามี error ให้โยนออกมาพร้อมข้อความชัดๆ (จะได้เห็นว่าติดอะไร) */
function check(resp, where){
  if (resp.error) {
    console.error("[DB error @ " + where + "]", resp.error);
    throw new Error(where + ": " + (resp.error.message || JSON.stringify(resp.error)));
  }
  return resp;
}

/* ----- "สมอง" จำลอง: หาสินค้า + จำนวนจากข้อความ (เวอร์ชันจริง = Claude) ----- */
function parseOrder(text, items){
  const found=[]; const lower=text.toLowerCase();
  items.forEach(item=>{
    const keys = Array.isArray(item.keys) ? item.keys : JSON.parse(item.keys||"[]");
    for(const key of keys){
      const idx=lower.indexOf(key.toLowerCase());
      if(idx===-1)continue;
      const around=text.slice(Math.max(0,idx-15),idx+key.length+15);
      const m=around.match(/\d+/);
      found.push({item,qty:m?parseInt(m[0],10):1});
      break;
    }
  });
  return found;
}

/* ----- ตัวช่วยคุยกับฐานข้อมูล (ทุกตัวโยน error ถ้าพลาด) ----- */
const DB = {
  async items(){
    const {data}=check(await sb.from("items").select("*").order("no"),"items");
    return data||[];
  },
  async customers(){
    const {data}=check(await sb.from("customers").select("*").order("no"),"customers");
    return data||[];
  },
  async customer(no){
    const {data}=check(await sb.from("customers").select("*").eq("no",no).single(),"customer");
    return data;
  },
  async addOrder(o){
    const {data}=check(await sb.from("orders").insert(o).select().single(),"addOrder");
    return data;
  },
  async draftOrders(){
    const {data}=check(await sb.from("orders").select("*").eq("status","draft").order("id",{ascending:false}),"draftOrders");
    return data||[];
  },
  async setStatus(id,status){
    check(await sb.from("orders").update({status}).eq("id",id),"setStatus");
  },
  async ordersStatus(ids){
    if(!ids.length)return [];
    const {data}=check(await sb.from("orders").select("id,status").in("id",ids),"ordersStatus");
    return data||[];
  },
  async countToday(custNo){
    const start=new Date(); start.setHours(0,0,0,0);
    const {count}=check(await sb.from("orders").select("id",{count:"exact",head:true})
      .eq("cust_no",custNo).gte("created_at",start.toISOString()),"countToday");
    return count||0;
  },
};
