# Member E: search, filters, favorites, integration and testing

Member E completes the discovery layer and the final user-facing integration.

## Search and filters

The marketplace search sends the query as the `q` parameter to `GET /api/items`. MySQL performs the search against listing titles and descriptions using bound parameters. An empty result shows a clear empty state rather than an error.

The marketplace UI supports:

- Search by title or description.
- Category filtering.
- Item-condition filtering.
- Price-range filtering with server-side `min_price` and `max_price`.
- Availability filtering for `available`, `reserved`, `sold` and `removed`.
- A single reset action for restoring the default available-listing view.

The backend validates prices, status and condition values before building SQL. Search text and filter values are always passed as MySQL parameters.

## Database-backed favorites

Favorites use the composite key `(user_id, item_id)` already defined by the database:

| Method | Path | Behaviour |
| --- | --- | --- |
| `GET` | `/api/favorites` | Returns only the logged-in user's saved listings |
| `POST` | `/api/items/:id/favorite` | Saves an available listing; repeating the request is idempotent |
| `DELETE` | `/api/items/:id/favorite` | Removes the current user's saved listing |

Writes require both login and the JWT-bound CSRF token. The item row is locked while a favorite is added so it cannot race with listing deletion. The favorite page keeps full listing data, so saved listings remain visible even when they no longer match the current browse filters.

## Integrated startup

`npm run build` creates the React production assets in `dist/`. With `SERVE_FRONTEND=true`, Express serves those assets and direct browser routes from `http://localhost:3000`, while `/api/*` remains the JSON API.

The Vite development server remains available through `npm run dev:frontend`. Demo mode is opt-in and is enabled only with `VITE_DEMO_MODE=true`; the normal build uses the real backend.

## Verification

Run:

```sh
npm test
python3 scripts/test-mysql.py --mysql-bin /path/to/mysql/bin
npm run build
```

The unit/API suite checks invalid filters, malformed requests and authentication. The disposable-MySQL suite checks real search/filter queries, favorite persistence and privacy, duplicate favorite handling, unavailable listings, CSRF, CRUD, orders and concurrency.

Verified results:

- `npm test`: 14 passed, real-MySQL suite skipped by design.
- Disposable MySQL: 11 passed, including the new favorites scenario.
- `npm run build`: TypeScript and Vite production build succeeded.
- Integrated Express smoke test: React index, direct browser routes and JSON API 404 fallback all behaved correctly.

## Demonstration sequence

The following flow fits within the course video limit:

1. Start from a populated database and open `http://localhost:3000`.
2. Search for a listing and narrow it with category, condition, price and availability filters.
3. Log in, save an available listing, refresh the page, and show it under **Saved**.
4. Remove the favorite and run a query against MySQL to show the `favorites` row changed.
5. Create or edit a listing and show the matching row in MySQL.
6. Complete the remaining representative CRUD and order actions required by the presentation plan.

For the presentation, explain that search and filters are executed by parameterized backend SQL, while favorites use authentication, CSRF protection and the database composite primary key. Do not describe Demo Mode localStorage behaviour as database persistence.
