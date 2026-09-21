-- add-mango.sql — เพิ่มสินค้ามะม่วง 2 แบบ เพื่อโชว์ "การถามเมื่อกำกวม"
-- รันใน Supabase → SQL Editor → New query → วาง → Run
-- ทั้งคู่มีคำค้น "มะม่วง" → พิมพ์ "มะม่วง" เฉยๆ ระบบจะถามก่อน

insert into items (no, name, keys, price, stock) values
  ('FRT-01', 'มะม่วงสด (กล่อง 5 กก.)', '["มะม่วง","มะม่วงสด","มะม่วงดิบ","mango"]', 180, 90),
  ('FRT-02', 'มะม่วงกวน (แพ็ค 12)',    '["มะม่วงกวน","กวน","มะม่วง"]',            120, 60)
on conflict (no) do update
  set name=excluded.name, keys=excluded.keys, price=excluded.price, stock=excluded.stock;
