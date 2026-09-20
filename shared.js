/* ============================================================
   shared.js — เชื่อม Supabase + "สมอง" จำลอง (ใช้ร่วม 2 หน้า)
   เวอร์ชันจริง: parseOrder เปลี่ยนเป็น Claude,
   การเช็ก/สร้างออเดอร์ยิงผ่าน Python → BC (MCP) ไม่ใช่ Supabase ตรง
   ============================================================ */

/* ----- กฎธุรกิจ ----- */
const MAX_ORDERS_PER_DAY = 3;     // จำกัดออเดอร์/ลูกค้า/วัน
const APPROVAL_LIMIT     = 30000; // ยอดเกินนี้ต้องหัวหน้าอนุมัติ

/* ----- ต่อ Supabase ----- */
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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

/* ----- ตัวช่วยคุยกับฐานข้อมูล ----- */
const DB = {
  async items(){ const {data}=await sb.from("items").select("*").order("no"); return data||[]; },
  async customers(){ const {data}=await sb.from("customers").select("*").order("no"); return data||[]; },
  async customer(no){ const {data}=await sb.from("customers").select("*").eq("no",no).single(); return data; },

  async addOrder(o){
    const {data}=await sb.from("orders").insert(o).select().single();
    return data;
  },
  async draftOrders(){
    const {data}=await sb.from("orders").select("*").eq("status","draft").order("id",{ascending:false});
    return data||[];
  },
  async setStatus(id,status){ await sb.from("orders").update({status}).eq("id",id); },
  async ordersStatus(ids){
    if(!ids.length)return [];
    const {data}=await sb.from("orders").select("id,status").in("id",ids);
    return data||[];
  },
  async countToday(custNo){
    const start=new Date(); start.setHours(0,0,0,0);
    const {count}=await sb.from("orders").select("id",{count:"exact",head:true})
      .eq("cust_no",custNo).gte("created_at",start.toISOString());
    return count||0;
  },
};
