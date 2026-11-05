# Entity–relationship design

The approved classroom-style diagram is maintained on the separate **improve-er-diagram-layout** branch:

- [View the diagram and explanation](https://github.com/xianghancheng59-arch/3278_Final/blob/improve-er-diagram-layout/docs/er-diagram.md)
- [SVG](https://github.com/xianghancheng59-arch/3278_Final/blob/improve-er-diagram-layout/docs/diagrams/campusswap-chen.svg)
- [PNG for slides](https://github.com/xianghancheng59-arch/3278_Final/blob/improve-er-diagram-layout/docs/diagrams/campusswap-chen.png)
- [Editable drawing source](https://github.com/xianghancheng59-arch/3278_Final/blob/improve-er-diagram-layout/scripts/render_er_diagram.py)

This page summarizes the design implemented by [schema.sql](../sql/schema.sql). The diagram files have not been merged into main.

## Entities and relationships

There are four conceptual entity sets: **Users, Categories, Items and Orders**. The **favorites** relationship becomes the fifth SQL table when the ER model is converted to tables.

| Relationship | Meaning | SQL reference |
|---|---|---|
| Users sells Items | A user sells zero/many items; each item has exactly one seller. | `items.seller_id → users.id` |
| Categories classifies Items | A category contains zero/many items; each item has exactly one category. | `items.category_id → categories.id` |
| Users places Orders | A user places zero/many orders; each order has exactly one buyer. | `orders.buyer_id → users.id` |
| Orders for_item Items | Each order concerns one item; an item can have zero/many historical orders. | `orders.item_id → items.id` |
| Users favorites Items | Both sides can participate zero/many times; created_at records when the item was saved. | `favorites(user_id, item_id, created_at)` |

The same user can be both a buyer and seller. Each entity has an independent `id` primary key. Favorites uses the composite primary key `(user_id, item_id)` to prevent duplicate saves.

## Reading the approved diagram

Rectangles represent entities, diamonds relationships, and ellipses attributes. Primary keys are **bold and underlined**. An arrow toward an entity indicates at most one on that side; double relationship lines indicate total participation. For example, the arrow to Users and the double line at Items mean every item has exactly one seller.

Favorites is drawn as an M:N relationship with a timestamp, following the *like* relationship in the COMP3278 Assignment 1 suggested answer. Its SQL table does not require a separate strong entity in the conceptual diagram.

## Order history and implementation boundaries

An item may have several historical orders because cancelled orders are retained. There is no lifetime unique constraint on `orders.item_id`. **At most one active order** (pending/confirmed) is a separate backend rule; it is not guaranteed by the current DDL.

Orders preserve agreed_amount and pickup_location as snapshots. Any order history blocks hard deletion of the referenced item. Buyer/seller checks, valid status transitions and authorization require backend enforcement. See the [database guide](database.md) for details.
