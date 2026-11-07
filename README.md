# CampusSwap

A full-stack campus second-hand marketplace with user authentication, item listings, search, favorites, and order management backed by a relational database.

## Project scope

CampusSwap helps students list, discover, and exchange second-hand items on campus. The MVP demonstrates database-backed create, read, update, and delete operations for listings, favorites, and orders.

The design and implementation are documented here so that each team member can build against the same data model and API boundary:

- [Requirements and MVP acceptance checklist](docs/requirements.md)
- [ER diagram and relationship explanation](docs/er-diagram.md)
- [System architecture and API boundary](docs/architecture.md)
- [Registration/login implementation and feature handoff](docs/authentication.md)

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
2. Install Node dependencies and copy `.env.example` to `.env`.
3. Set your local MySQL credentials and a random `JWT_SECRET` of at least 32 characters.
4. Run `npm start` and open `http://localhost:3000`.

Run the auth API tests with `npm test`; they use a fake repository and do not require a MySQL service.


## Member B contribution — added 2026-11-05

The original project description and design documents above are retained. This section records the added database implementation.

- [Database setup and verification](docs/database-setup.md): prerequisites, exact commands and troubleshooting.
- [Database guide](docs/database.md): table definitions, constraints, seed scenarios and backend handoff.
- [Schema](sql/schema.sql), [seed data](sql/seed.sql), and [query examples](sql/queries.sql).
- [Verification script](tests/verify_database.py): 37 checks passed on isolated MySQL 8.0.46.

The dataset contains 5 users, 5 categories, 10 items, 4 favorites and 5 orders. Authentication, API and frontend implementation are still pending. Seed password markers are unusable, so no working demo login credentials are provided yet.

Follow the setup guide to create a fresh database. The scripts do not overwrite existing data. Backend owners should use the database guide for the implemented order-history and deletion rules.
