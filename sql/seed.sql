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
(101,1,1,'Database System Concepts','Clean pages; seventh edition.',150.00,'good','available','Main Library',NULL,'2026-11-02 10:00:00','2026-11-02 10:00:00'),
(102,3,1,'Database exercise book','Annotated practice problems.',80.00,'fair','available','Chi Wah',NULL,'2026-11-02 10:00:00','2026-11-02 10:00:00'),
(103,1,2,'Scientific calculator','Working calculator with cover.',120.00,'good','available','Main Library',NULL,'2026-11-02 10:00:00','2026-11-02 10:00:00'),
(104,3,2,'USB keyboard','Compact keyboard.',60.00,'like_new','reserved','Chi Wah',NULL,'2026-11-02 10:00:00','2026-11-03 10:00:00'),
(105,4,4,'Desk lamp','Warm and cool light settings.',45.00,'good','reserved','University Street',NULL,'2026-11-02 10:00:00','2026-11-03 10:00:00'),
(106,1,4,'Storage box','Medium transparent storage box.',25.00,'good','sold','Main Library',NULL,'2026-11-02 10:00:00','2026-11-04 10:00:00'),
(107,3,3,'Notebook set','Three unused notebooks.',20.00,'new','available','Chi Wah',NULL,'2026-11-02 10:00:00','2026-11-02 10:00:00'),
(108,4,3,'Free folders','Reusable folders; free pickup.',0.00,'fair','available','University Street',NULL,'2026-11-02 10:00:00','2026-11-02 10:00:00'),
(109,1,1,'Old course notes','Withdrawn listing.',10.00,'fair','removed','Main Library',NULL,'2026-11-02 10:00:00','2026-11-03 10:00:00'),
(110,4,2,'Mouse pad','Plain desk mouse pad.',15.00,'good','available','University Street',NULL,'2026-11-02 10:00:00','2026-11-04 10:00:00');

INSERT INTO favorites (user_id,item_id,created_at) VALUES
(2,101,'2026-11-03 09:00:00'),(3,101,'2026-11-03 09:00:00'),
(2,103,'2026-11-03 09:00:00'),(1,107,'2026-11-03 09:00:00');

INSERT INTO orders (id,buyer_id,item_id,agreed_amount,pickup_location,status,created_at,updated_at) VALUES
(1001,2,104,60.00,'Chi Wah','pending','2026-11-03 10:00:00','2026-11-03 10:00:00'),
(1002,1,105,40.00,'University Street','confirmed','2026-11-03 10:00:00','2026-11-03 11:00:00'),
(1003,3,106,25.00,'Main Library','completed','2026-11-03 10:00:00','2026-11-04 10:00:00'),
(1004,2,110,15.00,'University Street','cancelled','2026-11-03 10:00:00','2026-11-04 10:00:00'),
(1005,4,104,60.00,'Chi Wah','cancelled','2026-11-02 12:00:00','2026-11-02 13:00:00');
