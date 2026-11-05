# Entity–relationship diagram

![CampusSwap ER diagram](diagrams/campusswap-chen.svg)

[SVG](diagrams/campusswap-chen.svg) · [PNG for slides](diagrams/campusswap-chen.png) · [Drawing source](../scripts/render_er_diagram.py)

## Notation

The diagram follows the notation in **COMP3278 Assignment 1, Question 1 and its suggested answer**. It uses four entity sets and five relationship sets, which map to the five tables in [schema.sql](../sql/schema.sql).

| Symbol | Meaning |
|---|---|
| Rectangle | Entity set |
| Diamond | Relationship set |
| Ellipse | Attribute |
| Bold, underlined attribute | Selected primary key |
| Arrow toward an entity | At most one on that side |
| Double relationship line | Total participation |
| Single relationship line | Partial participation |

Attribute connectors do not indicate participation. The same user can act as a seller and a buyer.

## Relationships

| Relationship | Meaning | Table mapping |
|---|---|---|
| Users **sells** Items | A user sells zero/many items; each item has exactly one seller. | `items.seller_id → users.id` |
| Categories **classifies** Items | A category contains zero/many items; each item has exactly one category. | `items.category_id → categories.id` |
| Users **places** Orders | A user places zero/many orders; each order has exactly one buyer. | `orders.buyer_id → users.id` |
| Orders **for_item** Items | Each order concerns exactly one item; an item can have zero/many historical orders. | `orders.item_id → items.id` |
| Users **favorites** Items | Both sides can participate zero/many times. `created_at` records when the item was saved. | `favorites(user_id, item_id, created_at)` |

**Why favorites is a diamond:** it is an M:N relationship with its own timestamp, like the reference answer's *like* relationship. Reducing it to tables produces `favorites`, whose composite primary key is `(user_id, item_id)`. The other four tables represent independently identified entities; none is a weak entity.

## Schema coverage and business rules

The figure covers all **35 schema columns**: 29 drawn attributes plus six foreign-key columns represented by relationships. Foreign keys are introduced when converting the conceptual model into tables. Each entity's `id` is its primary key; the SQL also requires unique user emails and category names.

An item may have multiple historical orders because cancelled orders are retained. **At most one active order** (pending/confirmed) is a separate backend rule, not a 1:1 cardinality or a guarantee of the current DDL. Buyer/seller checks and valid status transitions also require backend enforcement.

`agreed_amount` and `pickup_location` are stored order snapshots. Any order history prevents hard deletion of its item. See the [database guide](database.md) for the full implementation contract.

## Regenerate the diagram

Python 3.9+, from the repository root:

```sh
python scripts/render_er_diagram.py
```

This generates the SVG using the standard library. For the PNG as well:

```sh
python -m pip install Pillow
python scripts/render_er_diagram.py --png
```

Edit labels/layout in the Python source, then regenerate. PNG output uses Arial Bold on Windows or DejaVu Sans Bold on Linux and 3× rendering for smooth edges. The committed SVG and PNG can be viewed without running the script.

The output has been visually checked; all four entity keys are bold and underlined. Regeneration produces identical files in the tested environment. Database SQL is unchanged by the diagram work.
