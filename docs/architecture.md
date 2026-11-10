# CampusSwap system design

## Layered architecture

```text
Browser UI
    |
    | HTTPS/JSON
    v
Web server / REST API
    |
    | validation, authentication, authorization
    v
Service and data-access layer
    |
    | parameterized SQL
    v
MySQL database
```

The browser owns page rendering and form interaction. The API owns authentication, validation, business rules, and HTTP responses. The data-access layer owns parameterized SQL and transactions. The database enforces keys, uniqueness, foreign keys, and non-negative prices as a second line of protection.

## API boundary

The backend is implemented with **Node.js 20+, Express 5, MySQL 8, and `mysql2/promise`**. Authentication uses bcryptjs password hashes and a signed JWT in an HTTP-only cookie. The MVP exposes these operations:

| Method | Endpoint | Purpose | Access |
| --- | --- | --- | --- |
| `POST` | `/api/auth/register` | Create an account | Public |
| `POST` | `/api/auth/login` | Start a session | Public |
| `POST` | `/api/auth/logout` | End a session | Public (session optional) |
| `GET` | `/api/auth/me` | Read the current account | Logged-in user |
| `GET` | `/api/items` | Search and filter listings | Public |
| `GET` | `/api/items/:id` | Read one listing | Public |
| `POST` | `/api/items` | Create a listing | Logged-in user |
| `PATCH` | `/api/items/:id` | Update own listing | Seller only |
| `DELETE` | `/api/items/:id` | Delete own listing | Seller only |
| `GET` | `/api/favorites` | Read current user's favorites | Logged-in user |
| `POST` | `/api/items/:id/favorite` | Add a favorite | Logged-in user |
| `DELETE` | `/api/items/:id/favorite` | Remove a favorite | Logged-in user |
| `POST` | `/api/orders` | Place an order | Logged-in user |
| `GET` | `/api/orders` | Read buyer/seller orders | Logged-in user |
| `PATCH` | `/api/orders/:id/status` | Update an allowed order status | Buyer or seller |
| `GET` | `/api/categories` | Read available categories | Public |

## Key transaction flows

### Create listing

1. Authenticate the seller.
2. Validate title, category, condition, and non-negative price.
3. Insert the row into `items` with status `available`.
4. Return the new listing so the UI can render it immediately.

### Place order

1. Authenticate the buyer and lock the selected item row in a transaction.
2. Confirm the item is available and its seller is not the buyer.
3. Insert the order with the current price and pickup location.
4. Update the item to `reserved`.
5. Commit both changes together so an item cannot be double-booked.

### Delete listing

1. Authenticate the seller and verify ownership.
2. Reject deletion of an item with any order history, including cancelled orders; otherwise remove the unused item and its favorites in a transaction.
3. Return a clear success response for the UI.

## Environment and reproducibility

Configuration is read from `.env` using `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE`, `JWT_SECRET`, and `PORT`. C uses A's authenticated `req.user.id` and a JWT-bound CSRF token for marketplace writes; see [the C integration guide](member-c.md). A setup script or SQL seed file should create the schema, insert categories, and add representative accounts and listings. The root README must document the exact commands for installing dependencies, setting environment variables, initializing the database, and starting the server.
