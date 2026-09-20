-- ============================================================
-- schema.sql — รันใน Supabase (เมนู SQL Editor → New query → วาง → Run)
-- สร้างตาราง + ใส่ข้อมูลจำลอง + เปิดสิทธิ์ (สำหรับเดโม)
-- เวอร์ชันจริง: ข้อมูลมาจาก Business Central ไม่ใช่ตารางพวกนี้
-- ============================================================

-- ลบของเก่า (ถ้าเคยรันแล้ว)
drop table if exists orders;
drop table if exists items;
drop table if exists customers;

-- สินค้า
create table items (
  no    text primary key,
  name  text not null,
  keys  jsonb not null,      -- คำค้น/ชื่อเล่นภาษาไทย
  price int  not null,
  stock int  not null
);

-- ลูกค้า (credit_left ซ่อนจากลูกค้า ใช้เช็กหลังบ้านเท่านั้น)
create table customers (
  no          text primary key,
  name        text not null,
  credit_left int  not null,
  blocked     boolean not null default false
);

-- ออเดอร์ (เก็บรายการเป็น jsonb เพื่อความง่าย)
create table orders (
  id             bigint generated always as identity primary key,
  cust_no        text not null,
  cust_name      text not null,
  lines          jsonb not null,
  total          int  not null,
  need_supervisor boolean not null default false,
  status         text not null default 'draft',  -- draft | approved | rejected
  created_at     timestamptz not null default now()
);

-- ---------- ข้อมูลจำลอง ----------
insert into items (no, name, keys, price, stock) values
  ('W-600',  'น้ำดื่ม 600ml (แพ็ค 12)', '["น้ำดื่ม","น้ำเปล่า","น้ำขวดเล็ก","น้ำ600"]', 55,  800),
  ('W-1500', 'น้ำดื่ม 1500ml (แพ็ค 6)',  '["น้ำขวดใหญ่","น้ำ1500","น้ำใหญ่"]',           48,  500),
  ('S-COLA', 'น้ำอัดลม โคล่า (ลัง 24)',   '["โคล่า","โค้ก","น้ำอัดลม","cola"]',           240, 120),
  ('S-SODA', 'โซดา (ลัง 24)',             '["โซดา","soda"]',                              180, 200),
  ('SNK-01', 'มันฝรั่งทอด (กล่อง 30 ซอง)', '["มันฝรั่ง","ขนม","มันทอด"]',                 320, 60),
  ('TIS-01', 'กระดาษทิชชู่ (แพ็ค 24 ม้วน)', '["ทิชชู่","กระดาษชำระ","ทิชชู"]',            150, 300);

insert into customers (no, name, credit_left, blocked) values
  ('C001', 'ร้านสมชายมินิมาร์ท',   20000, false),
  ('C002', 'ร้านป้าแดงของชำ',       3000,  false),
  ('C003', 'บริษัท รุ่งเรือง จำกัด',  80000, false),
  ('C004', 'ร้านค้างชำระ (ถูกบล็อก)', 0,     true);

-- ---------- สิทธิ์ (เดโม: อนุญาต anon เพื่อให้เว็บใช้งานได้) ----------
-- หมายเหตุ: เวอร์ชันจริงต้องจำกัดสิทธิ์ และไม่ให้ client เห็น credit_left/ต้นทุน
alter table items     enable row level security;
alter table customers enable row level security;
alter table orders    enable row level security;

create policy demo_items_read  on items     for select using (true);
create policy demo_cust_read   on customers for select using (true);
create policy demo_ord_read    on orders    for select using (true);
create policy demo_ord_insert  on orders    for insert with check (true);
create policy demo_ord_update  on orders    for update using (true);
