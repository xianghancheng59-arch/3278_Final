CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    full_name TEXT NOT NULL,
    email TEXT COLLATE NOCASE NOT NULL,
    password_hash TEXT NOT NULL,
    contact_phone TEXT,
    avatar_url TEXT,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    CONSTRAINT uq_users_email UNIQUE (email),
    CONSTRAINT ck_users_id CHECK (id > 0),
    CONSTRAINT ck_users_name CHECK (length(TRIM(full_name)) > 0),
    CONSTRAINT ck_users_status CHECK (status IN ('active', 'suspended'))
);

CREATE TABLE categories (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    CONSTRAINT uq_categories_name UNIQUE (name),
    CONSTRAINT ck_categories_id CHECK (id > 0),
    CONSTRAINT ck_categories_name CHECK (length(TRIM(name)) > 0)
);

CREATE TABLE items (
    id INTEGER PRIMARY KEY,
    seller_id INTEGER NOT NULL,
    category_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    price NUMERIC NOT NULL,
    item_condition TEXT NOT NULL,
    status TEXT NOT NULL,
    location TEXT NOT NULL,
    image_url TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    CONSTRAINT fk_items_seller FOREIGN KEY (seller_id) REFERENCES users(id),
    CONSTRAINT fk_items_category FOREIGN KEY (category_id) REFERENCES categories(id),
    CONSTRAINT ck_items_id CHECK (id > 0),
    CONSTRAINT ck_items_title CHECK (length(TRIM(title)) > 0),
    CONSTRAINT ck_items_price CHECK (price >= 0),
    CONSTRAINT ck_items_condition CHECK (item_condition IN ('new','like_new','good','fair')),
    CONSTRAINT ck_items_status CHECK (status IN ('available','reserved','sold','removed')),
    CONSTRAINT ck_items_location CHECK (length(TRIM(location)) > 0)
);

CREATE TABLE favorites (
    user_id INTEGER NOT NULL,
    item_id INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (user_id, item_id),
    CONSTRAINT fk_favorites_user FOREIGN KEY (user_id) REFERENCES users(id),
    CONSTRAINT fk_favorites_item FOREIGN KEY (item_id) REFERENCES items(id)
);

CREATE TABLE orders (
    id INTEGER PRIMARY KEY,
    buyer_id INTEGER NOT NULL,
    item_id INTEGER NOT NULL,
    agreed_amount NUMERIC NOT NULL,
    pickup_location TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    CONSTRAINT fk_orders_buyer FOREIGN KEY (buyer_id) REFERENCES users(id),
    CONSTRAINT fk_orders_item FOREIGN KEY (item_id) REFERENCES items(id),
    CONSTRAINT ck_orders_id CHECK (id > 0),
    CONSTRAINT ck_orders_amount CHECK (agreed_amount >= 0),
    CONSTRAINT ck_orders_status CHECK (status IN ('pending','confirmed','completed','cancelled')),
    CONSTRAINT ck_orders_pickup CHECK (length(TRIM(pickup_location)) > 0)
);
