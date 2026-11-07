# Member C backend implementation and handoff

Implemented against main commit 07ebd7705ad6950736c8d7f85a6fc31cab21cbbd. Python 3.10+ / Flask / PyMySQL. B's schema is unchanged. This is the C module, not a complete frontend/auth application.

## Run

From repository root:

```sh
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements-c.txt
export DB_HOST=127.0.0.1
export DB_PORT=3306
export DB_NAME=campusswap
export DB_USER=your_mysql_user
export DB_PASSWORD='your_local_password'
export SESSION_SECRET='replace-with-a-long-random-secret'
python -m backend.app
```

Initialize a fresh database using docs/database-setup.md first. The server listens at http://127.0.0.1:5000. Environment variables must be set in the shell; .env is not automatically loaded. On Windows use `.venv\Scripts\Activate.ps1` and `$env:DB_NAME="campusswap"` etc. Do not commit credentials. The PyMySQL RSA extra is included for MySQL caching_sha2_password authentication.

## Authentication integration for A

Register A's authentication routes on the app returned by create_app. After verifying a password hash, clear the old session and set `session['user_id']=user_id`. Logout clears the session. Never accept user IDs from request headers/body as authentication. Seed `!` password markers cannot authenticate. No insecure development-login endpoint is provided.

Before any write, the browser calls GET /api/csrf and sends the returned csrf_token as X-CSRF-Token with its session cookie. Fetch a new token after login clears the session. This applies to A's login/register/logout routes too. Serve UI and API on one origin (or use a frontend dev proxy). For HTTPS deployment set SESSION_COOKIE_SECURE=True. No CORS is enabled.

## API contract for D and E

IDs and monetary amounts in responses are strings. Timestamps are UTC ISO strings. Single-resource responses are objects; lists are arrays. Errors are `{"error":"message"}`. Success: reads/patch 200, create 201, delete 204. Validation 400, no login 401, forbidden/CSRF 403, absent resource 404, business/constraint conflict 409.

| Method | Path | Body / query |
|---|---|---|
| GET | /api/items | q, category_id, seller_id, condition, status, min_price, max_price, limit (1–100), offset |
| GET | /api/items/:id | — |
| POST | /api/items | title, description, price, item_condition, category_id, location; optional image_url |
| PATCH | /api/items/:id | Any listing fields; status only available/removed |
| DELETE | /api/items/:id | — |
| POST | /api/orders | item_id; optional pickup_location (defaults to listing location) |
| GET | /api/orders | Current user's buyer and seller orders |
| PATCH | /api/orders/:id/status | status: confirmed/completed/cancelled |
| GET | /api/categories | — |
| GET | /api/csrf | Returns CSRF token and establishes cookie |

Example create body:

```json
{"title":"Database textbook","description":"Clean copy","price":"120.00","item_condition":"good","category_id":"1","location":"HKU"}
```

Listing reads default to available; supply a status to browse other states. Detail reads are public. Search/filter support is supplied for integration with E; favorites remain E's responsibility. Use item_condition in writes, condition in query strings. Money accepts zero but rejects negatives, >2 fractional decimals and values outside DECIMAL(10,2). Descriptions are limited to 65,535 UTF-8 bytes (MySQL TEXT), and requests to 64 KiB; oversized requests return JSON with HTTP 413. Unknown JSON fields are rejected; seller/buyer IDs and order amount come from trusted server state.

## Business rules and SQL explanation

All values use `%s` bound parameters. Listing ownership is checked server-side. UTC timestamps and random positive 62-bit IDs match B's non-AUTO_INCREMENT schema; duplicate IDs retry up to three times.

CREATE: INSERT INTO items (...) VALUES (...). READ: SELECT with WHERE filters and ordered pagination. UPDATE: UPDATE items SET ... WHERE id=%s after locking and ownership checks. DELETE: delete favorites then the unused listing in one transaction. Any order history prevents hard deletion, including cancelled orders. This follows B's database guide and supersedes the older architecture note that only mentioned completed orders.

Ordering locks the item with SELECT ... FOR UPDATE, checks availability, ownership and active orders, snapshots price/location in INSERT INTO orders, then updates the item to reserved before COMMIT. Failures roll back. Concurrent purchases of the same item serialize on its row lock. This is an implementation design, not a claim of an executed concurrency test.

Seller: pending→confirmed, pending/confirmed→cancelled, confirmed→completed. Buyer: pending→cancelled only. Cancellation reopens the item; completion marks sold. Terminal orders cannot transition. Status updates lock the item first and order second. Listing PATCH cannot bypass the order flow or edit reserved/sold listings. Favorites writers should also lock the item first to coordinate with deletion.

## Verification

Run `python -m unittest discover -s tests -p 'test_backend.py' -v`.
These tests cover validation, CSRF, unauthorized deletion, retained history, order snapshot/reservation SQL, commit and rollback using a mocked database. They do NOT establish real MySQL or concurrency correctness. MySQL was unavailable in the implementation environment.

Before merging, run against a disposable MySQL database with schema/seed: create/read/edit/delete a new listing; verify deletion removes favorites; reject non-owner edits; reject suspended users; place two simultaneous orders for the same item and assert exactly one 201 and one 409, one active order and reserved state; cancel/reorder; seller confirm/complete; reject buyer completion and terminal transitions; confirm order snapshots persist and history blocks deletion. Test through A's login and D's UI once integrated. Do not use production data for these tests.

## C presentation script (approximately 45 seconds; rehearse)

I implemented the listing CRUD APIs and order workflow. Each request uses parameterized SQL, and the server checks login, ownership and input values. Sellers can insert, read, update and delete their own unused listings. Listings with order history cannot be deleted. When a buyer places an order, the backend locks the item in a transaction, checks availability, stores the agreed price and pickup location, and reserves the item. Both changes commit together, or both roll back. Cancellation makes the item available again, while completion marks it sold. The backend also checks which status changes each buyer or seller is allowed to perform.

中文理解：CRUD 对应 INSERT、SELECT、UPDATE、DELETE；参数绑定避免把输入拼进 SQL；事务确保订单与物品状态一起成功或失败；行锁用于让同一物品的并发购买依次检查；订单保存成交时的价格与地点，后续商品修改不会改变历史快照。讲解时把事务/行锁称为实现措施，不要声称它们已由 B 的课程 SQL 验证覆盖。

## Compatibility review of the supplied ZIPs

Both supplied branches contain identical schema.sql, seed.sql and queries.sql. Neither includes authentication or frontend source, so Flask/session choice and frontend JSON compatibility are provisional. The architecture explicitly leaves framework selection to the team; backend/ is a new directory, not an established team convention. Layers currently share one small module with SQL helpers rather than separate service/repository files; adapt this after A supplies the application's actual structure.

Use the ER branch's historical-order cardinality and deletion description together with B's database guide. The old main ER prose claims a unique orders.item_id, but the actual SQL intentionally has no such constraint. Do not change SQL to match that obsolete prose. Both requirements files still describe seller status changes broadly; this API follows B's stricter workflow: reserved/sold must be reached through order transitions. Confirm that D's UI uses the order buttons for these states.

The API supplies no seller/category display-name enrichment on item reads: D receives seller_id/category_id, and categories can be resolved through /api/categories. Item images are URLs, not uploaded files. List responses are arrays with limit/offset but no total count. Orders return all current-user buyer/seller orders, with seller_id and title. Confirm these choices with D before frontend integration. A must expose a current-user identity to the UI if D needs buyer/seller-specific controls.

The upload-only package adds requirements-c.txt instead of replacing a shared dependency file. Install it in the shared backend environment if Flask is adopted. Keep B's SQL, other members' documents and the root README unchanged for this review PR. Add a link to this guide to the root README only when integrating the agreed application.
