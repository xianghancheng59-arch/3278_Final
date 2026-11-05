-- CampusSwap / Member B. Apply once to a NEW, explicitly selected MySQL 8.0.16+ database.
-- No DROP, automatic cascade, triggers, routines, or generated columns.
-- IDs are supplied by the application; timestamps are supplied on INSERT/UPDATE.

CREATE TABLE users (
    id BIGINT PRIMARY KEY,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(254) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    contact_phone VARCHAR(30),
    avatar_url VARCHAR(2048),
    status VARCHAR(20) NOT NULL,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    CONSTRAINT uq_users_email UNIQUE (email),
    CONSTRAINT ck_users_id CHECK (id > 0),
    CONSTRAINT ck_users_name CHECK (CHAR_LENGTH(TRIM(full_name)) > 0),
    CONSTRAINT ck_users_status CHECK (status IN ('active', 'suspended'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE categories (
    id BIGINT PRIMARY KEY,
    name VARCHAR(80) NOT NULL,
    created_at DATETIME NOT NULL,
    CONSTRAINT uq_categories_name UNIQUE (name),
    CONSTRAINT ck_categories_id CHECK (id > 0),
    CONSTRAINT ck_categories_name CHECK (CHAR_LENGTH(TRIM(name)) > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE items (
    id BIGINT PRIMARY KEY,
    seller_id BIGINT NOT NULL,
    category_id BIGINT NOT NULL,
    title VARCHAR(160) NOT NULL,
    description TEXT NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    item_condition VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL,
    location VARCHAR(160) NOT NULL,
    image_url VARCHAR(2048),
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    CONSTRAINT fk_items_seller FOREIGN KEY (seller_id) REFERENCES users(id),
    CONSTRAINT fk_items_category FOREIGN KEY (category_id) REFERENCES categories(id),
    CONSTRAINT ck_items_id CHECK (id > 0),
    CONSTRAINT ck_items_title CHECK (CHAR_LENGTH(TRIM(title)) > 0),
    CONSTRAINT ck_items_price CHECK (price >= 0),
    CONSTRAINT ck_items_condition CHECK (item_condition IN ('new','like_new','good','fair')),
    CONSTRAINT ck_items_status CHECK (status IN ('available','reserved','sold','removed')),
    CONSTRAINT ck_items_location CHECK (CHAR_LENGTH(TRIM(location)) > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE favorites (
    user_id BIGINT NOT NULL,
    item_id BIGINT NOT NULL,
    created_at DATETIME NOT NULL,
    PRIMARY KEY (user_id, item_id),
    CONSTRAINT fk_favorites_user FOREIGN KEY (user_id) REFERENCES users(id),
    CONSTRAINT fk_favorites_item FOREIGN KEY (item_id) REFERENCES items(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE orders (
    id BIGINT PRIMARY KEY,
    buyer_id BIGINT NOT NULL,
    item_id BIGINT NOT NULL,
    agreed_amount DECIMAL(10,2) NOT NULL,
    pickup_location VARCHAR(160) NOT NULL,
    status VARCHAR(20) NOT NULL,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    CONSTRAINT fk_orders_buyer FOREIGN KEY (buyer_id) REFERENCES users(id),
    CONSTRAINT fk_orders_item FOREIGN KEY (item_id) REFERENCES items(id),
    CONSTRAINT ck_orders_id CHECK (id > 0),
    CONSTRAINT ck_orders_amount CHECK (agreed_amount >= 0),
    CONSTRAINT ck_orders_status CHECK (status IN ('pending','confirmed','completed','cancelled')),
    CONSTRAINT ck_orders_pickup CHECK (CHAR_LENGTH(TRIM(pickup_location)) > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Deliberately NO UNIQUE(item_id) on orders: cancelled orders remain as history.
-- One ACTIVE order, buyer != seller, and item/order status transitions are
-- cross-row business rules belonging to the backend, not guaranteed by this DDL.
