-- MySQL 8: run against the intended CampusSwap database before enabling uploads.
-- Additive and safe to rerun; does not change existing listings or image URLs.
CREATE TABLE IF NOT EXISTS item_photos (
    item_id BIGINT PRIMARY KEY,
    jpeg_bytes MEDIUMBLOB NOT NULL,
    version CHAR(32) NOT NULL,
    updated_at DATETIME NOT NULL,
    CONSTRAINT fk_item_photos_item FOREIGN KEY (item_id) REFERENCES items(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
