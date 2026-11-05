# CampusSwap database handoff — Member B

Prepared 2026-11-05 against A's commit `9845d8c`. This is the database implementation contract for A/C/D/E. After review of B, the ER diagram was revised on a separate documentation branch; see er-diagram.md for the classroom notation and exact mapping.

## Deliverables and current status

- `sql/schema.sql`: five tables, primary/foreign keys, required fields, uniqueness and value constraints.
- `sql/seed.sql`: deterministic fictional data: 5 users, 5 categories, 10 items, 4 favorites, 5 orders.
- `sql/queries.sql`: six read-only joined/aggregate/nested-query examples.
- `tests/verify_database.py`: repeatable test on a disposable real MySQL instance; no Python third-party dependencies.
- Root README: clean database installation and verification commands.

The repository at A's commit contains requirements, architecture and ER documentation, but no authentication, server or frontend implementation. A's registration/login deliverable is therefore not yet verifiable from the repository. B does not claim the full app is runnable.

## Database contract

Use MySQL 8.0.16 or newer; tests ran on 8.0.46. Earlier 8.0 versions do not enforce CHECK constraints. Use strict SQL mode (the MySQL 8 default); the API must reject excess decimal precision rather than relying on MySQL rounding. Text uses utf8mb4; timestamps are naive DATETIME values: the application should consistently supply UTC. Seed timestamps are fixed fictional values.

| Table | Identity | References and important values |
|---|---|---|
| users | id | email unique; status active/suspended; password_hash stores library-generated hashes only |
| categories | id | name unique |
| items | id | seller_id → users; category_id → categories; price DECIMAL(10,2) |
| favorites | (user_id, item_id) | both foreign keys; composite identity prevents repeat favorites |
| orders | id | buyer_id → users; item_id → items; agreed_amount and pickup_location are snapshots |

IDs are positive BIGINT values supplied by the application. There is no AUTO_INCREMENT in this schema. Backend owners must supply collision-resistant positive IDs within signed 64-bit range and retry a primary-key collision; do not use unprotected `MAX(id)+1`. Reserved seed IDs: users/categories 1–5, items 101–110, orders 1001–1005. Pass IDs as strings across JSON if they exceed JavaScript's safe integer range, or agree on a smaller allocation scheme before building APIs.

Every INSERT supplies created_at/updated_at where those columns exist. Every relevant UPDATE supplies updated_at. No trigger silently changes timestamps.

| Domain | Allowed stored values |
|---|---|
| users.status | active, suspended |
| items.item_condition | new, like_new, good, fair |
| items.status | available, reserved, sold, removed |
| orders.status | pending, confirmed, completed, cancelled |

`price` and `agreed_amount` allow zero (free items), reject negatives, and use exact decimal storage. Nullable optional attributes are phone/avatar/image URLs. Required names, titles and pickup/item locations cannot be whitespace-only.

## What the database guarantees

- Primary keys prevent duplicate identities; the favorites composite key prevents repeat favorites.
- Foreign keys reject missing users/categories/items and prevent deleting referenced parents.
- Case-insensitive email uniqueness rejects Alice/alice duplicate accounts. The server must still trim/lowercase the stored email and validate the permitted domain.
- CHECK constraints reject invalid status/condition labels and negative prices.
- Order amount/location snapshots do not change when a listing is edited.
- Any item with ANY order history cannot be hard-deleted through this schema.

## What the backend must guarantee

The following are NOT enforced by the DDL or by a browser form. C/A must implement server-side checks:

1. Authenticate users, reject suspended accounts, and enforce seller/buyer ownership on each write.
2. Normalize/validate email; hash and verify passwords with the chosen authentication library; never store plaintext.
3. A buyer cannot order their own listing; only available listings can receive orders.
4. At most one pending/confirmed order exists per item. There is deliberately no `UNIQUE(orders.item_id)` because cancelled history must remain.
5. Order creation/cancellation/completion must keep item and order states consistent, even for concurrent requests. A's architecture proposes transaction/locking behaviour, but it is not implemented by B and is outside the supplied taught SQL implementation scope. Do not claim concurrent-order safety until C implements/tests an agreed solution and the teaching-scope question is resolved.
6. Enforce valid state transitions and prevent a normal listing edit from bypassing the order workflow.
7. Validate prices to at most two decimal places and the supported range before sending SQL.
8. Use parameter binding, not concatenated SQL, for user input.

Proposed state contract for C:

| Operation | Order state | Item state |
|---|---|---|
| Place order | new pending | available → reserved |
| Seller confirms | pending → confirmed | remains reserved |
| Buyer cancels | pending → cancelled | reserved → available |
| Seller cancels | pending/confirmed → cancelled | reserved → available |
| Seller completes handover | confirmed → completed | reserved → sold |

Completed/cancelled orders are terminal records. An item with a completed sale cannot be reopened. Only items without active orders or completed sales may be withdrawn as removed. These transitions are a backend contract proposal, not a claim that SQL CHECK validates transitions.

## Deletion policy and document discrepancies

The original design documents disagreed in three ways; the revised ER document now reflects B's choices:

| Existing statement | Issue | B's explicit choice |
|---|---|---|
| ER says six entities but draws five | Counting mismatch | Implement the five named tables |
| ER says zero/one order per item; requirements allow cancelled orders and one ACTIVE order | Lifetime uniqueness would block reordering after cancellation | One item can have multiple historical orders; C enforces at most one active order |
| Architecture only blocks deletion after a completed order | A restrictive item FK also protects pending/cancelled history | Preserve ALL order history; mark such listings removed where workflow permits |

For an item with no order history, C first validates ownership and state, then removes favorites and the item as one coordinated backend operation. Foreign keys provide a last barrier against partial/orphaned deletion. B does not use automatic cascading deletion. Do not hide an ordinary UPDATE behind a DELETE label.

For a clear CRUD video, create a new test item, read it, update its price, then actually DELETE it. Use a new item without order history. Use another seeded item to demonstrate order history.

The user has authorized the ER revision after B. The diagram now follows the Assignment 1 answer's conceptual notation and maps to this schema, with four entity sets and a favorites relationship producing five tables. No SQL was changed by the ER revision.

## Seed data guide

| Data | Purpose |
|---|---|
| Alice (1), Bob (2), Cathy (3), David (4) | Buyer/seller scenarios |
| Eva (5), suspended | Backend account-status scenario |
| Item 101, textbook, HK$150 | Read/edit/search; two favorites |
| Item 108, folders, HK$0 | Free item boundary |
| Items 104/105 | Pending/confirmed orders, reserved status |
| Item 106 | Completed order, sold status |
| Item 109 | Removed status |
| Item 110 | Cancelled history; available again, but cannot hard-delete |
| Category Sports | Zero available items; LEFT JOIN / COUNT example |
| Item 104 orders 1005 and 1001 | Cancelled historical order followed by current pending order |

All seed password hashes are `!`, an intentionally unusable marker. There are NO working demo login passwords yet. A must generate real hashes through the selected login library or create demo users through registration. Do not modify login code to accept `!`. Seed IDs can be used in database-only examples before authentication is implemented.

Expected report results: 6 available items; Bob has 2 favorites and 2 historical/current orders; category available counts are 2, 2, 2, 0, 0; popular item is 101. Seller 1's no-order-history listings are 101, 103, 109.

## Taught scope and presentation

Course-facing explanation should focus on table definitions, primary/composite keys, foreign keys, INSERT/SELECT/UPDATE/DELETE, joins, GROUP BY/HAVING, and NOT EXISTS. These were found in the supplied notes (DDL p23, modification pp24–26, aggregation pp27–29, nested queries/joins pp30–33 and exercises pp36–41).

A already requested unique emails and non-negative prices. `UNIQUE` and table-level `CHECK` are used here as explicit implementation constraints, but their exact DDL forms were not confirmed as taught in the supplied notes (p35 discusses assertions). Treat them as a small scope item to clear with the teaching team before presenting them as taught knowledge. MySQL engine/charset/collation settings are setup details, not claimed advanced features. No transaction/locking SQL, triggers, stored procedures or other advanced mechanisms are added by B.

The current repository scope has orders/favorites, not the earlier proposed wishlist feature. B follows the repository's agreed tables; adding new product features requires the team's design decision.

## Validation

On 2026-11-05, schema, seed and every report executed successfully on isolated MySQL 8.0.46. The automated script passed 37 checks, including counts, foreign keys, duplicates, invalid prices/statuses, retained order history, CRUD persistence across connections and unchanged order snapshots. It starts a fresh temporary server bound only to loopback on a random port, shuts it down, and deletes only its own temporary data directory.

This is database verification, not an end-to-end app test, authentication test, or concurrent-order test. C/E must add endpoint and concurrent-order checks when their implementation exists. A/C/E should also rehearse the README installation on their own machines.

## B's 35-second presentation draft

“Our database has five tables: users, categories, items, favorites and orders. Each item references an existing seller and category. Favorites uses a composite primary key, so a user cannot save the same item twice. Orders keep the agreed price and pickup location as historical values. Foreign keys protect these records from accidental deletion. We provide reproducible schema and seed scripts, and verified the constraints and CRUD operations with 37 checks on a fresh MySQL instance.”

Time this aloud at the presenter's own pace. Keep SQL and schema legible; B explains data/constraints while C explains write endpoints and order workflows.

## Why this supports high marks

- Reproducibility (30 marks total): source SQL, a deterministic dataset, exact setup commands and repeatable verification reduce installation ambiguity. Full application run instructions remain A/C/D/E's integration work.
- ER explanation (10): the schema provides concrete identities and relationships for the later corrected diagram.
- SQL explanation (15): actual runnable CRUD/join/aggregate/nested queries support specific explanations.
- CRUD video (25): the documented new-item scenario distinguishes physical DELETE from status UPDATE and demonstrates saved values.
- Functionality/design and delivery (20 combined): explicit contracts and a short B script support consistent group explanations.

These are opportunities to satisfy the rubric, not a guarantee of 98–100. Backend, frontend, full-app reproduction and final presentation are still outstanding group work; the revised ER diagram remains subject to team review.
