-- Deterministic fictional fixtures; run once after schema.sql on an empty database.
-- '!' is an unusable password marker, NOT a working hash or a plaintext password.
-- A must replace these markers with hashes from the chosen authentication library
-- before demo login is available. No authentication implementation exists yet.

INSERT INTO users (id,full_name,email,password_hash,contact_phone,avatar_url,status,created_at,updated_at) VALUES
(1,'Alice Chan','alice@connect.hku.hk','!',NULL,NULL,'active','2026-11-01 09:00:00','2026-11-01 09:00:00'),
(2,'Bob Lee','bob@connect.hku.hk','!',NULL,NULL,'active','2026-11-01 09:00:00','2026-11-01 09:00:00'),
(3,'Cathy Wong','cathy@connect.hku.hk','!',NULL,NULL,'active','2026-11-01 09:00:00','2026-11-01 09:00:00'),
(4,'David Ho','david@connect.hku.hk','!',NULL,NULL,'active','2026-11-01 09:00:00','2026-11-01 09:00:00'),
(5,'Eva Lam','eva@connect.hku.hk','!',NULL,NULL,'suspended','2026-11-01 09:00:00','2026-11-01 09:00:00');

INSERT INTO categories (id,name,created_at) VALUES
(1,'Textbooks','2026-11-01 09:00:00'),(2,'Electronics','2026-11-01 09:00:00'),
(3,'Stationery','2026-11-01 09:00:00'),(4,'Dorm supplies','2026-11-01 09:00:00'),
(5,'Sports','2026-11-01 09:00:00');

INSERT INTO items (id,seller_id,category_id,title,description,price,item_condition,status,location,image_url,created_at,updated_at) VALUES
(101,1,1,'Database System Concepts','Clean pages; seventh edition.',150.00,'good','available','Main Library','https://down-th.img.susercontent.com/file/sg-11134201-22100-yt74adnqpvivc9','2026-11-02 10:00:00','2026-11-02 10:00:00'),
(102,3,1,'Database exercise book','Annotated practice problems.',80.00,'fair','available','Chi Wah','https://images.unsplash.com/photo-1544947950-fa07a98d237f?auto=format&fit=crop&w=1200&q=80','2026-11-02 10:00:00','2026-11-02 10:00:00'),
(103,1,2,'Scientific calculator','Working calculator with cover.',120.00,'good','available','Main Library','https://casiomall.co.kr/web/upload/appfiles/ZaReJam3QiELznoZeGGkMG/7631022462937a2a28670b4c797ed979.jpg','2026-11-02 10:00:00','2026-11-02 10:00:00'),
(104,3,2,'USB keyboard','Compact keyboard.',60.00,'like_new','reserved','Chi Wah','/images/products/mechanical-keyboard.jpg','2026-11-02 10:00:00','2026-11-03 10:00:00'),
(105,4,4,'Desk lamp','Warm and cool light settings.',45.00,'good','reserved','University Street','/images/products/desk-lamp.jpg','2026-11-02 10:00:00','2026-11-03 10:00:00'),
(106,1,4,'Storage box','Medium transparent storage box.',25.00,'good','sold','Main Library','https://fataco.com/uploads/photos/zoom_1713951984_2459_eb5000d5d730a76f3b1d263147480131.jpg','2026-11-02 10:00:00','2026-11-04 10:00:00'),
(107,3,3,'Notebook set','Three unused notebooks.',20.00,'new','available','Chi Wah','https://cdn11.bigcommerce.com/s-aweq463/images/stencil/1280x1280/products/62845/157394/31143_1-set-of-2-pinks-s5-notebooks__13087.1771321303.png?c=2','2026-11-02 10:00:00','2026-11-02 10:00:00'),
(108,4,3,'Free folders','Reusable folders; free pickup.',0.00,'fair','available','University Street','https://inrorwxhrpqjlq5p.ldycdn.com/cloud/liBpmKolljSRmkmnmjnkjm/H4e7bb570577f4ed5943b04a1b0b049f2c.jpg','2026-11-02 10:00:00','2026-11-02 10:00:00'),
(109,1,1,'Old course notes','Withdrawn listing.',10.00,'fair','removed','Main Library',NULL,'2026-11-02 10:00:00','2026-11-03 10:00:00'),
(110,4,2,'Mouse pad','Plain desk mouse pad.',15.00,'good','available','University Street','https://images.unsplash.com/photo-1656071830624-06aa347f99a7?auto=format&fit=crop&w=1200&q=80','2026-11-02 10:00:00','2026-11-04 10:00:00'),
(111, 3, 4, 'Non-stick pan & saucepan set', 'A clean frying pan and lidded saucepan.', 160, 'good', 'available', 'Jockey Club Student Village', '/images/products/cookware-set.jpg', '2026-11-09 10:00:00', '2026-11-09 10:00:00'),
(112, 4, 4, 'Ceramic bowls & dinner plates', 'Four bowls and matching dinner plates without chips.', 120, 'like_new', 'available', 'Centennial Campus', '/images/products/dinnerware-set.jpg', '2026-11-09 10:00:00', '2026-11-09 10:00:00'),
(113, 3, 4, 'Foldable clothes drying rack', 'A lightweight indoor rack that folds flat.', 95, 'good', 'available', 'Main Building', '/images/products/drying-rack.jpg', '2026-11-09 10:00:00', '2026-11-09 10:00:00'),
(114, 4, 4, 'Two-tier dish drying rack', 'Stainless steel rack with a drip tray.', 75, 'like_new', 'available', 'Jockey Club Student Village', '/images/products/dish-rack.jpg', '2026-11-09 10:00:00', '2026-11-09 10:00:00');

INSERT INTO favorites (user_id,item_id,created_at) VALUES
(2,101,'2026-11-03 09:00:00'),(3,101,'2026-11-03 09:00:00'),
(2,103,'2026-11-03 09:00:00'),(1,107,'2026-11-03 09:00:00');

INSERT INTO orders (id,buyer_id,item_id,agreed_amount,pickup_location,status,created_at,updated_at) VALUES
(1001,2,104,60.00,'Chi Wah','pending','2026-11-03 10:00:00','2026-11-03 10:00:00'),
(1002,1,105,40.00,'University Street','confirmed','2026-11-03 10:00:00','2026-11-03 11:00:00'),
(1003,3,106,25.00,'Main Library','completed','2026-11-03 10:00:00','2026-11-04 10:00:00'),
(1004,2,110,15.00,'University Street','cancelled','2026-11-03 10:00:00','2026-11-04 10:00:00'),
(1005,4,104,60.00,'Chi Wah','cancelled','2026-11-02 12:00:00','2026-11-02 13:00:00');
