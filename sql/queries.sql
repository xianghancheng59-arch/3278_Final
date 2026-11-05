-- Read-only examples using taught joins, filtering, aggregation and nested queries.
-- Replace literal demo values with bound parameters in application code.

-- Available listings with seller and category. Seed: 6 rows.
SELECT i.id, i.title, i.price, i.item_condition, u.full_name AS seller, c.name AS category
FROM items AS i JOIN users AS u ON u.id=i.seller_id
JOIN categories AS c ON c.id=i.category_id
WHERE i.status='available' ORDER BY i.price, i.id;

-- Bob's favorites. Seed: 2 rows.
SELECT i.id, i.title, i.price, i.status
FROM favorites AS f JOIN items AS i ON i.id=f.item_id
WHERE f.user_id=2 ORDER BY i.id;

-- Include categories with zero available items. Count the matched item, not '*'.
SELECT c.id, c.name, COUNT(i.id) AS available_count, AVG(i.price) AS average_asking_price
FROM categories AS c
LEFT JOIN items AS i ON i.category_id=c.id AND i.status='available'
GROUP BY c.id,c.name ORDER BY c.id;

-- Popular listings. Seed: only item 101 has at least two favorites.
SELECT i.id, i.title, COUNT(f.user_id) AS favorite_count
FROM items AS i JOIN favorites AS f ON f.item_id=i.id
GROUP BY i.id,i.title HAVING COUNT(f.user_id)>=2 ORDER BY i.id;

-- Buyer/seller order history. Seed: Bob has orders 1001 and 1004.
SELECT o.id, i.title, buyer.full_name AS buyer, seller.full_name AS seller,
       o.agreed_amount, o.pickup_location, o.status
FROM orders AS o JOIN items AS i ON i.id=o.item_id
JOIN users AS buyer ON buyer.id=o.buyer_id
JOIN users AS seller ON seller.id=i.seller_id
WHERE o.buyer_id=2 ORDER BY o.id;

-- Items with no order history: useful for the hard-delete demonstration.
SELECT i.id,i.title FROM items AS i
WHERE i.seller_id=1 AND NOT EXISTS (SELECT 1 FROM orders AS o WHERE o.item_id=i.id)
ORDER BY i.id;
