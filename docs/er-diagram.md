# CampusSwap ER diagram

The MVP uses six entities. A user may sell many items, buy many items, and favorite many items. A category groups many items. Each item may have zero or one order because the MVP treats each listing as a single physical item.

```mermaid
erDiagram
    USERS ||--o{ ITEMS : sells
    CATEGORIES ||--o{ ITEMS : contains
    USERS ||--o{ FAVORITES : creates
    ITEMS ||--o{ FAVORITES : receives
    USERS ||--o{ ORDERS : places
    ITEMS ||--o| ORDERS : "is ordered in"

    USERS {
        bigint id PK
        varchar full_name
        varchar email UK
        varchar password_hash
        varchar contact_phone
        varchar avatar_url
        varchar status
        datetime created_at
        datetime updated_at
    }

    CATEGORIES {
        bigint id PK
        varchar name UK
        datetime created_at
    }

    ITEMS {
        bigint id PK
        bigint seller_id FK
        bigint category_id FK
        varchar title
        text description
        decimal price
        varchar item_condition
        varchar status
        varchar location
        varchar image_url
        datetime created_at
        datetime updated_at
    }

    FAVORITES {
        bigint user_id FK
        bigint item_id FK
        datetime created_at
    }

    ORDERS {
        bigint id PK
        bigint buyer_id FK
        bigint item_id FK
        decimal agreed_amount
        varchar pickup_location
        varchar status
        datetime created_at
        datetime updated_at
    }
```

## Relationship explanation

- `USERS` to `ITEMS`: one user can publish many items; every item has exactly one seller.
- `CATEGORIES` to `ITEMS`: one category can contain many items; every item has one category.
- `USERS` to `ITEMS` through `FAVORITES`: this is a many-to-many relationship resolved by the junction table. The composite primary key prevents duplicate favorites.
- `USERS` to `ORDERS`: one user can place many orders; every order has one buyer.
- `ITEMS` to `ORDERS`: an item can have zero or one order. A unique constraint on `orders.item_id` enforces the single-item rule.

## Why the model is normalized

Seller and buyer data are stored once in `USERS`, category names are stored once in `CATEGORIES`, and many-to-many favorites are separated into `FAVORITES`. The order keeps transaction-time values such as `agreed_amount` and `pickup_location`, so later listing edits do not rewrite the transaction record.
