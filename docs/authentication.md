# Registration and login module — Member A

## Backend stack

- **Runtime:** Node.js 20 or later
- **Web framework:** Express 5, serving both the JSON API and the static account page
- **Database:** MySQL 8, using the existing `users` table from `sql/schema.sql`
- **Database driver:** `mysql2/promise`; all SQL values are parameterized
- **Password hashing:** `bcryptjs` with work factor 12
- **Authentication:** signed JWT in an HTTP-only, SameSite=Strict cookie; token lifetime is eight hours
- **Security middleware:** Helmet response headers and rate limiting on registration/login
- **Frontend:** semantic HTML, responsive CSS, and browser `fetch`; no frontend build step

The auth module owns the account UI and `/api/auth/*` routes. It does not own listings, favorites, or orders. Other feature routes should use the `requireAuth` middleware supplied by the `mountRoutes` hook to verify the cookie and then read the authenticated account from `req.user`.

## Frontend-to-backend interaction

1. The browser serves `public/index.html` from the same Express origin as the API.
2. The registration form sends `POST /api/auth/register` with `{ "fullName", "email", "password" }` as JSON. The server normalizes the email, validates the HKU domain, hashes the password, inserts the user, and sets the auth cookie. A new account is signed in immediately.
3. The login form sends `POST /api/auth/login` with `{ "email", "password" }`. The server checks the password hash and account status, then sets the same cookie.
4. On page load, the frontend sends `GET /api/auth/me`. The browser attaches the cookie automatically. The API returns only `{ "user": { "id", "fullName", "email" } }`.
5. Logout sends `POST /api/auth/logout`; the server expires the cookie.

The browser never stores a token in localStorage and never receives `password_hash`. Cookie authentication is same-origin and `SameSite=Strict`; HTTPS deployments also set the cookie's `Secure` flag.

## API contract

| Method and path | Request | Success | Common errors |
| --- | --- | --- | --- |
| `POST /api/auth/register` | `{ fullName, email, password }` | `201 { user }` and auth cookie | `400` invalid input, `409` duplicate email, `429` rate limit |
| `POST /api/auth/login` | `{ email, password }` | `200 { user }` and auth cookie | `400` missing fields, `401` invalid credentials/suspended user, `429` rate limit |
| `GET /api/auth/me` | Auth cookie | `200 { user }` | `401` missing/expired/invalid session |
| `POST /api/auth/logout` | Auth cookie optional | `204` and expired cookie | - |

All error responses use `{ "error": "..." }`. Email addresses must end in `@connect.hku.hk`; input is trimmed and lowercased before lookup/insert. Passwords must be 8–72 UTF-8 bytes. Names are trimmed and limited to 100 characters.

## Database interaction

The module reuses Member B's `users` table without adding an auth-only schema. It writes `id`, `full_name`, normalized `email`, `password_hash`, `status`, and UTC timestamps. New IDs are random positive integers within JavaScript's exact integer range, which fit the existing BIGINT primary key and avoid unsafe `MAX(id)+1` allocation. A primary-key collision is retried; the unique email constraint handles duplicate registration.

The seed users' `password_hash` value is `!`, an intentionally unusable marker. Login explicitly rejects that marker. Register a real account through the form or API for a working login.

## Handoff to other feature branches

Add protected routes through the `mountRoutes` hook before the app's 404 handler:

```js
const app = createApp({
  users,
  jwtSecret: process.env.JWT_SECRET,
  mountRoutes: (app, { requireAuth }) => {
    app.get('/api/my-items', requireAuth, async (req, res) => {
      // Use req.user.id as seller_id; do not accept an owner id from the browser.
    });
  }
});
```

C's routes are now mounted by `createApp` when a `pool` is supplied (as done in `src/server.js`). The existing `mountRoutes` hook remains available for E and other features. After login, C's write requests also require a token from `/api/csrf`; see [C's frontend contract](member-c.md). Auth endpoints retain the contract above.

The shared user shape is `{ id: string, email: string, fullName: string }`. Keep `id` as a string at the API boundary to preserve BIGINT precision. Public listing routes do not need authentication; mutations must authenticate and enforce ownership on the server.

## Run locally

Follow [database-setup.md](database-setup.md) to create the `campusswap` database and apply the schema. Then:

```sh
npm install
cp .env.example .env
```

Edit `.env` with the local MySQL account and a random JWT secret of at least 32 characters, then run:

```sh
npm start
```

Open `http://localhost:3000`. For automated tests, run `npm test`; the tests use a fake repository and do not need a running MySQL server.
