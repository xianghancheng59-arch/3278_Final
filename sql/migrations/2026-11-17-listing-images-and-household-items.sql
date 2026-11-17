-- Apply once to the CampusSwap database after backing it up.
-- This migration only fills missing image URLs on the original demo fixtures
-- and adds the four household listings. It does not change user-created rows.

UPDATE items SET image_url = CASE id
    WHEN 101 THEN 'https://down-th.img.susercontent.com/file/sg-11134201-22100-yt74adnqpvivc9'
    WHEN 102 THEN 'https://images.unsplash.com/photo-1544947950-fa07a98d237f?auto=format&fit=crop&w=1200&q=80'
    WHEN 103 THEN 'https://casiomall.co.kr/web/upload/appfiles/ZaReJam3QiELznoZeGGkMG/7631022462937a2a28670b4c797ed979.jpg'
    WHEN 104 THEN '/images/products/mechanical-keyboard.jpg'
    WHEN 105 THEN '/images/products/desk-lamp.jpg'
    WHEN 106 THEN 'https://fataco.com/uploads/photos/zoom_1713951984_2459_eb5000d5d730a76f3b1d263147480131.jpg'
    WHEN 107 THEN 'https://cdn11.bigcommerce.com/s-aweq463/images/stencil/1280x1280/products/62845/157394/31143_1-set-of-2-pinks-s5-notebooks__13087.1771321303.png?c=2'
    WHEN 108 THEN 'https://inrorwxhrpqjlq5p.ldycdn.com/cloud/liBpmKolljSRmkmnmjnkjm/H4e7bb570577f4ed5943b04a1b0b049f2c.jpg'
    WHEN 110 THEN 'https://images.unsplash.com/photo-1656071830624-06aa347f99a7?auto=format&fit=crop&w=1200&q=80'
    ELSE image_url
END
WHERE image_url IS NULL AND (
    (id = 101 AND title = 'Database System Concepts') OR
    (id = 102 AND title = 'Database exercise book') OR
    (id = 103 AND title = 'Scientific calculator') OR
    (id = 104 AND title = 'USB keyboard') OR
    (id = 105 AND title = 'Desk lamp') OR
    (id = 106 AND title = 'Storage box') OR
    (id = 107 AND title = 'Notebook set') OR
    (id = 108 AND title = 'Free folders') OR
    (id = 110 AND title = 'Mouse pad')
);

INSERT INTO items
    (id,seller_id,category_id,title,description,price,item_condition,status,location,image_url,created_at,updated_at)
SELECT source.id,source.seller_id,source.category_id,source.title,source.description,source.price,
       source.item_condition,source.status,source.location,source.image_url,source.created_at,source.updated_at
FROM (
    SELECT 7000000000000000101 AS id,3 AS seller_id,4 AS category_id,
      'Non-stick pan & saucepan set' AS title,
      'A clean frying pan and lidded saucepan.' AS description,
      160.00 AS price,'good' AS item_condition,'available' AS status,
      'Jockey Club Student Village' AS location,'/images/products/cookware-set.jpg' AS image_url,
      '2026-11-09 10:00:00' AS created_at,'2026-11-09 10:00:00' AS updated_at
    UNION ALL SELECT 7000000000000000102,4,4,
      'Ceramic bowls & dinner plates',
      'Four bowls and matching dinner plates without chips.',
      120.00,'like_new','available','Centennial Campus','/images/products/dinnerware-set.jpg',
      '2026-11-09 10:00:00','2026-11-09 10:00:00'
    UNION ALL SELECT 7000000000000000103,3,4,
      'Foldable clothes drying rack',
      'A lightweight indoor rack that folds flat.',
      95.00,'good','available','Main Building','/images/products/drying-rack.jpg',
      '2026-11-09 10:00:00','2026-11-09 10:00:00'
    UNION ALL SELECT 7000000000000000104,1,4,
      'Two-tier dish drying rack',
      'Stainless steel rack with a drip tray.',
      75.00,'like_new','available','Jockey Club Student Village','/images/products/dish-rack.jpg',
      '2026-11-09 10:00:00','2026-11-09 10:00:00'
) AS source
WHERE NOT EXISTS (SELECT 1 FROM items WHERE items.title = source.title)
  AND NOT EXISTS (SELECT 1 FROM items WHERE items.id = source.id);
