# Member C: Express CRUD and order integration

C now runs inside A's Node.js/Express application. Based on A commit `0b65e67` on `user_log`, with A's original auth code, UI and tests retained. B's SQL is unchanged. This replaces the provisional Flask backend; the Python app, its requirements and its mocked tests have been removed.

## Start the integrated application

Use Node.js 20+ and MySQL 8.0.16+ (integration tests also passed on MySQL 8.4.11).

```sh
npm ci
cp frontend/.env.example frontend/.env
npm ci --prefix frontend
npm run build
cp .env.example .env
# Edit MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE,
# JWT_SECRET (at least 32 random bytes), and SERVE_FRONTEND=true in .env.
# Initialize a NEW database using docs/database-setup.md first.
npm start
```

Open http://localhost:3000. `src/server.js` passes the shared pool to `createApp`, which mounts authentication, C's marketplace routes and E's favorites routes. The built React marketplace is served from the same origin. No Python API, second port, DB_* variables or SESSION_SECRET is needed. Do not commit .env or database credentials.

Register two accounts with different @connect.hku.hk addresses for seller/buyer testing. B's seed accounts use `!` password markers and cannot log in.

## Authentication and frontend handoff

- Reuse A's `/api/auth/register`, `/api/auth/login`, `/api/auth/me` and `/api/auth/logout` unchanged.
- A sets the HttpOnly `campusswap_token` cookie. C uses A's `requireAuth` and `req.user.id`, including an active-account check. Never supply seller_id or buyer_id in a write body.
- After login/register, call **GET /api/csrf**. It now requires authentication and returns `{ csrf_token }`. Send that token in **X-CSRF-Token** for C's POST/PATCH/DELETE requests. Fetch it again after a new login; discard it on logout.
- The token is an HMAC bound to A's verified JWT cookie. There is no Flask session or separate CSRF cookie. A's auth endpoints keep their existing request contract and do not require this C token.
- Serve frontend and API from the same origin, or configure D's development proxy for **all /api paths**, including /api/auth and /api/csrf. Use one consistent hostname. No CORS is enabled. Fetch uses `credentials: 'same-origin'`; the frontend never reads/stores the JWT.
- The current user response is `{ user: { id, fullName, email } }`. Use it to choose seller/buyer buttons. Server permissions remain authoritative.

Example after successful login (check response.ok in the frontend's shared request helper):

```js
const tokenResponse = await fetch('/api/csrf', { credentials: 'same-origin' });
if (!tokenResponse.ok) throw new Error('Please log in again');
const { csrf_token } = await tokenResponse.json();
const response = await fetch('/api/items', {
  method: 'POST', credentials: 'same-origin',
  headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf_token },
  body: JSON.stringify({ title: 'Database textbook', description: 'Clean copy',
    price: '120.00', item_condition: 'good', category_id: '1', location: 'HKU' })
});
const result = await response.json();
if (!response.ok) throw new Error(result.error);
```

## API contract for D and E

Paths and business rules are retained from C's previous version. IDs and amounts are **strings**; never convert IDs to JavaScript Number. Dates are UTC ISO strings. Single resources are objects, lists are arrays. Errors are `{ "error": "..." }`. Reads/patch return 200, create 201, deletion 204 (no JSON body). Errors: 400 invalid input, 401 unauthenticated/unavailable account, 403 ownership/CSRF, 404 absent resource, 409 conflict, 413 body over 64 KiB. Unexpected errors return generic 500 JSON.

| Method | Path | Input / access |
| --- | --- | --- |
| GET | /api/categories | Public |
| GET | /api/items | Public; q, category_id, seller_id, condition, status, min_price, max_price, limit (1–100), offset |
| GET | /api/items/:id | Public |
| POST | /api/items | Login + CSRF; title, description, price, item_condition, category_id, location; optional image_url |
| PATCH | /api/items/:id | Owner + CSRF; listing fields; status only available/removed |
| DELETE | /api/items/:id | Owner + CSRF; no order history |
| POST | /api/orders | Login + CSRF; item_id, optional pickup_location (defaults to listing location) |
| GET | /api/orders | Login; current user's buyer and seller orders, with title/seller_id |
| PATCH | /api/orders/:id/status | Participant + CSRF; status confirmed/completed/cancelled subject to rules below |
| GET | /api/favorites | Login; returns the current user's saved listings |
| POST | /api/items/:id/favorite | Login + CSRF; saves an available listing idempotently |
| DELETE | /api/items/:id/favorite | Login + CSRF; removes the current user's favorite |
| GET | /api/csrf | Login; returns csrf_token; do not cache |

Listing search defaults to available; specify status to see other states. Use `condition` in filters and `item_condition` in write bodies. No total-count wrapper or seller-name enrichment is added. Resolve category names through /api/categories. Images remain URLs. Monetary values permit zero and at most two decimal places within DECIMAL(10,2). Description is limited to MySQL TEXT's 65,535 UTF-8 bytes, additionally subject to the total JSON body limit. Auth fields remain fullName/email/password.

## SQL, transactions and permissions

`src/validation.js` validates input, preserves exact decimal strings and rejects unsafe numeric IDs. `src/marketplace.js` implements CRUD and order rules. `src/db.js` enables supportBigNumbers + bigNumberStrings for exact BIGINT handling. All SQL values use `?` parameters. Dynamic identifiers come only from internal whitelists. IDs are random positive 62-bit strings with collision retries; B's schema needs no AUTO_INCREMENT change.

- CREATE: INSERT INTO items (...) VALUES (...).
- READ: SELECT with parameterized filters and ordered pagination.
- UPDATE: lock the item, verify ownership/order state, then UPDATE items SET ... WHERE id=?.
- DELETE: lock the item, reject **any** order history (including cancelled), then delete its favorites and unused item in the same transaction.
- ORDER: SELECT item ... FOR UPDATE; reject self-purchase/unavailable items; INSERT order with price/location snapshots; UPDATE item to reserved; COMMIT both, or ROLLBACK both.
- State updates also lock the item first, then the order. Seller: pending→confirmed/cancelled; confirmed→completed/cancelled. Buyer: pending→cancelled only. Cancellation reopens the item; completion marks it sold. Terminal orders cannot transition. Reserved/sold listings cannot be edited directly.
- Connections are released after commit/rollback. Lock conflicts return 409 and require the client to refresh before retrying.
- FAVORITES: GET is scoped to `req.user.id`; writers require CSRF and lock the item before inserting to coordinate with listing deletion.

## Verification and reproducibility

```sh
npm test
python3 scripts/test-mysql.py --mysql-bin /absolute/path/to/mysql/bin
```

On Windows use `python` if that is your Python 3 command. The second command needs official MySQL server/client binaries and Python 3; it initializes a new temporary data directory and database, starts a loopback-only server on a temporary port, applies B's unchanged schema/seed, runs the real integration tests, then stops and cleans up that instance. It does not use the database configured in .env. Do not run tests/mysql.test.js against an existing database manually.

Verified on 2026-11-07 with Node 24.12.0 and MySQL 8.4.11:

- `npm test`: **14 passed**, 0 failed. The separate real-MySQL suite is intentionally skipped by this command. A's 7 original tests remain unchanged. C includes a 36-case order permission matrix inside one test.
- Disposable MySQL run: **10 scenario subtests passed**, plus their parent suite (Node reports 11 passed), 0 failed, 0 skipped.
- Real scenarios: A register/login cookie → C writes; CSRF rejection; search/filtering/pagination/injection input; persistent and private favorites; BIGINT read/update/delete; ownership and favorite cleanup; two concurrent buyers yielding exactly one 201 and one 409; cancellation/reorder with preserved snapshots; participant-only history and seller completion; injected failure after order INSERT with full rollback; suspended/expired/tampered/logged-out sessions rejected.
- B's SQL, A's src/auth.js and A's tests/auth.test.js are unchanged. npm's dependency installation audit reported 0 vulnerabilities at verification time.

D's marketplace UI and E's search, filter and favorites integration are now served together with the API. Browser-based seller/buyer flows should still be rehearsed before the final demonstration. A's existing stateless JWT logout clears the browser cookie; it does not add server-side revocation of already copied tokens.

## C presentation script (approximately 45 seconds; rehearse)

I implemented the listing CRUD APIs and order workflow in our shared Express backend. The APIs reuse the login middleware and check ownership, input values and CSRF tokens. All SQL values use bound parameters. Sellers can create, read, update and delete unused listings, while order history prevents deletion. Ordering locks the item in a transaction, saves the agreed price and pickup location, then reserves the item. Both changes commit together or roll back. Cancellation reopens the item and completion marks it sold. Our real MySQL tests verified rollback and confirmed that two simultaneous buyers cannot both purchase the same item.

中文交接：C 已迁入 A 的 Express/JWT 架构；登录、CRUD、订单和 E 的收藏共用同一服务与 users 表。登录后先取 /api/csrf，写请求带 X-CSRF-Token；ID 和金额保持字符串。搜索、筛选和收藏均连接真实数据库，React 页面通过 npm run build 后由 Express 在 3000 端口提供。
