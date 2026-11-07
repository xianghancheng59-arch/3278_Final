# CampusSwap

A full-stack campus second-hand marketplace with user authentication, item listings, search, favorites, and order management backed by a relational database.

## Project scope

CampusSwap helps students list, discover, and exchange second-hand items on campus. The MVP demonstrates database-backed create, read, update, and delete operations for listings, favorites, and orders.

The design and implementation are documented here so that each team member can build against the same data model and API boundary:

- [Requirements and MVP acceptance checklist](docs/requirements.md)
- [ER diagram and relationship explanation](docs/er-diagram.md)
- [System architecture and API boundary](docs/architecture.md)
- [Registration/login implementation and feature handoff](docs/authentication.md)
- [Member C CRUD/orders, frontend contract and verified integration tests](docs/member-c.md)

## Planned core features

- User registration, login, logout, and profile updates
- Listing creation, browsing, search, editing, and deletion
- Category, condition, price, and status filters
- Favorites for logged-in users
- Single-item order flow with seller and buyer status updates

## Backend stack

The backend uses **Node.js 20+, Express 5, MySQL 8, and `mysql2/promise`**. The registration/login module also includes a responsive HTML/CSS/JavaScript account page served by Express. Authentication uses bcrypt password hashes and an HTTP-only signed JWT cookie. Protected feature routes receive the shared `req.user.id` through the auth middleware.

## Run locally

1. Create the MySQL database using [the database setup guide](docs/database-setup.md).
2. Run `npm ci` and copy `.env.example` to `.env`.
3. Set your local MySQL credentials and a random `JWT_SECRET` of at least 32 characters.
4. Run `npm start` and open `http://localhost:3000`.

Run `npm test` for the authentication and C unit/API tests (14 passing tests; no MySQL service required). To run the real login/CRUD/order/concurrency integration suite on a disposable MySQL instance, use `python3 scripts/test-mysql.py --mysql-bin /path/to/mysql/bin`. See [C's integration guide](docs/member-c.md) for frontend CSRF handling and test details.

Authentication and C's listing/order APIs run together on port 3000. The current web page is A's account UI; D's marketplace pages and E's favorites API still need team integration. The former Flask backend has been replaced.


## Member B contribution — added 2026-11-05

The original project description and design documents above are retained. This section records the added database implementation.

- [Database setup and verification](docs/database-setup.md): prerequisites, exact commands and troubleshooting.
- [Database guide](docs/database.md): table definitions, constraints, seed scenarios and backend handoff.
- [Schema](sql/schema.sql), [seed data](sql/seed.sql), and [query examples](sql/queries.sql).
- [Verification script](tests/verify_database.py): 37 checks passed on isolated MySQL 8.0.46.

The dataset contains 5 users, 5 categories, 10 items, 4 favorites and 5 orders. At the time of B's original delivery, authentication, API and frontend implementation were pending. A's authentication and C's APIs are now integrated on this branch. Seed password markers remain unusable; register new accounts through the account page for seller/buyer demos.

Follow the setup guide to create a fresh database. The scripts do not overwrite existing data. Backend owners should use the database guide for the implemented order-history and deletion rules.
