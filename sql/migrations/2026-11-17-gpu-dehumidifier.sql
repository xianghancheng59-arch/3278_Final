-- Replace only the two disposable review listings identified in the screenshot.
-- Keep their IDs, sellers and cancelled order history; never rewrite order snapshots.
UPDATE items SET title='NVIDIA GeForce RTX 5090', category_id=2,
    description='Demo listing for a GeForce RTX 5090 graphics card. Manufacturer reference photo; arrange inspection before purchase.',
    price=18000.00, item_condition='like_new', image_url='/images/products/rtx-5090.jpg', updated_at=CURRENT_TIMESTAMP
WHERE id=4180913857791983399 AND title='Order history demo 1794921141629'
    AND seller_id=5610531857098493 AND status='available';

UPDATE items SET title='Dehumidifier', category_id=4,
    description='Demo listing for a MeacoDry Arete One 12L dehumidifier. Manufacturer reference photo; arrange inspection before purchase.',
    price=600.00, item_condition='good', image_url='/images/products/dehumidifier.jpg', updated_at=CURRENT_TIMESTAMP
WHERE id=3488032717800414752 AND title='Order history demo 1794919362095'
    AND seller_id=5257175130396802 AND status='available';

-- Other existing databases may not contain the review listings. Add fixtures once.
INSERT INTO items (id,seller_id,category_id,title,description,price,item_condition,status,location,image_url,created_at,updated_at)
SELECT 7000000000000000201,1,2,'NVIDIA GeForce RTX 5090',
    'Demo listing for a GeForce RTX 5090 graphics card. Manufacturer reference photo; arrange inspection before purchase.',
    18000.00,'like_new','available','Main Library','/images/products/rtx-5090.jpg',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM items WHERE title='NVIDIA GeForce RTX 5090' OR id=7000000000000000201);

INSERT INTO items (id,seller_id,category_id,title,description,price,item_condition,status,location,image_url,created_at,updated_at)
SELECT 7000000000000000202,4,4,'Dehumidifier',
    'Demo listing for a MeacoDry Arete One 12L dehumidifier. Manufacturer reference photo; arrange inspection before purchase.',
    600.00,'good','available','Jockey Club Student Village','/images/products/dehumidifier.jpg',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM items WHERE title='Dehumidifier' OR id=7000000000000000202);
