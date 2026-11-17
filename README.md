# CampusSwap

A full-stack campus second-hand marketplace with user authentication, item listings, search, favorites, and order management backed by a relational database.

## Hosted SQLite and local MySQL

Pushing or merging into `main` runs [the deployment workflow](.github/workflows/deploy-render.yml). It calls the existing Render service using the repository secret `RENDER_DEPLOY_HOOK`. GitHub Actions confirms that Render accepted the request. The Render **Deploys** page shows the deployed commit and whether the build went live. The [service configuration](render.yaml) specifies the free Singapore instance.

The Render web service runs the React interface and Express API together. Its six marketplace tables, including uploaded listing photos, live in a persistent Turso SQLite database. An empty SQLite database is initialized from `sql/schema-sqlite.sql` and `sql/seed.sql` in a single transaction. Restarts preserve listings, favorites and orders.

Set `SQLITE_URL` and `SQLITE_AUTH_TOKEN` in Render's private environment, along with `SERVE_FRONTEND=true`, `NODE_ENV=production`, and a generated `JWT_SECRET` of at least 32 bytes. Build with `npm ci && npm ci --prefix frontend --include=dev && npm run build` and start with `npm start`. Rotate the database token in Render before it expires.

For local SQLite, set `SQLITE_URL=file:campusswap.sqlite`. Without `SQLITE_URL`, the server uses the existing MySQL settings documented below. Run `npm test` to exercise the API against a disposable SQLite file, including concurrent ordering and reconnecting after a price change.

## Project scope

CampusSwap helps students list, discover, and exchange second-hand items on campus. The MVP demonstrates database-backed create, read, update, and delete operations for listings, favorites, and orders.

The design and implementation are documented here so that each team member can build against the same data model and API boundary:

- [Requirements and MVP acceptance checklist](docs/requirements.md)
- [ER diagram and relationship explanation](docs/er-diagram.md)
- [System architecture and API boundary](docs/architecture.md)
- [Registration/login implementation and feature handoff](docs/authentication.md)
- [Member C CRUD/orders, frontend contract and verified integration tests](docs/member-c.md)
- [Member E search, filters, favorites, testing and demo notes](docs/member-e.md)

## Core features

- User registration, login, and logout
- Listing creation, browsing, search, editing, and deletion
- Seller photo upload, replacement and removal with persistent database storage ([guide](docs/photo-updates.md))
- Category, condition, price, and status filters
- Favorites for logged-in users
- Single-item order flow with seller and buyer status updates

## Backend stack

The backend uses **Node.js 20.9+, Express 5, MySQL 8, and `mysql2/promise`**, with a React/Vite marketplace and API served from the same origin. Authentication uses bcrypt password hashes and an HTTP-only signed JWT cookie. Protected feature routes receive the shared `req.user.id` through the auth middleware; the original HTML account page remains available as a fallback when the React build is disabled.

## Run locally

1. Create the MySQL database using [the database setup guide](docs/database-setup.md).
2. Install both dependency sets:

   ```sh
   npm ci
   npm ci --prefix frontend
   ```

3. Copy and edit the backend configuration:

   ```sh
   cp .env.example .env
   ```

   Set your MySQL credentials, choose a random `JWT_SECRET` of at least 32 bytes, and keep `SERVE_FRONTEND=true` for the integrated application.

4. Build the React marketplace and start Express:

   ```sh
   npm run build
   npm start
   ```

5. Open `http://localhost:3000`. Register a new account because the seed users have intentionally unusable password markers.

For frontend hot-reload development, run `npm start` in one terminal and `npm run dev:frontend` in another. Open `http://127.0.0.1:5173`; Vite proxies `/api` to the backend. Set `VITE_DEMO_MODE=false` if you create `frontend/.env` from its example.

Run `npm test` for the authentication and marketplace unit/API tests without a MySQL service. To run login, search, filters, favorites, CRUD, orders and concurrency against a disposable real MySQL instance, use:

```sh
python3 scripts/test-mysql.py --mysql-bin /path/to/mysql/bin
```

Verified results: `npm test` reports 28 passing tests with the real-MySQL suite skipped; the disposable-MySQL script reports 13 passing tests with the SQLite suite skipped. Photo upload, replacement, removal, ownership and transaction rollback are included.

The built React marketplace, authentication, listing/order APIs and database-backed favorites run together on port 3000. See [Member E's guide](docs/member-e.md) for search/filter behavior, test coverage and the demonstration sequence.


## Member B contribution — added 2026-11-05

The original project description and design documents above are retained. This section records the added database implementation.

- [Database setup and verification](docs/database-setup.md): prerequisites, exact commands and troubleshooting.
- [Database guide](docs/database.md): table definitions, constraints, seed scenarios and backend handoff.
- [Schema](sql/schema.sql), [seed data](sql/seed.sql), [query examples](sql/queries.sql), and [household/image migration](sql/migrations/2026-11-17-listing-images-and-household-items.sql).
- [Verification script](tests/verify_database.py): 37 checks passed on isolated MySQL 8.0.46.

The dataset contains 5 users, 5 categories, 16 items, 4 favorites and 5 orders. For an existing database, follow the migrations in [the photo guide](docs/photo-updates.md) to enable uploads and add the two reference products. The household/image migration fills missing images only on matching original fixtures and adds the four household listings without changing user-created items. At the time of B's original delivery, authentication, API and frontend implementation were pending. Authentication, marketplace APIs, the React interface and E's database-backed search/filter/favorite work are now integrated. Seed password markers remain unusable; register new accounts through the marketplace for seller/buyer demos.

Follow the setup guide to create a fresh database. The scripts do not overwrite existing data. Backend owners should use the database guide for the implemented order-history and deletion rules.
