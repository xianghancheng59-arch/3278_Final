-- Applied automatically at startup to both fresh and existing SQLite databases.
CREATE TABLE IF NOT EXISTS item_photos (
    item_id INTEGER PRIMARY KEY,
    jpeg_bytes BLOB NOT NULL,
    version TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    CONSTRAINT fk_item_photos_item FOREIGN KEY (item_id) REFERENCES items(id)
);
