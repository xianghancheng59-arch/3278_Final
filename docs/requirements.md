# CampusSwap requirements

CampusSwap is a campus-focused second-hand marketplace. It lets students list items they no longer need, discover items from other students, and manage a simple order workflow for an in-person exchange.

## Product goal

Provide a small, reproducible marketplace that demonstrates database-backed create, read, update, and delete operations without the scope of a production e-commerce platform.

## User roles

- **Visitor:** browse available listings and open a listing detail page.
- **Registered user:** manage a profile, publish and manage their own listings, save favorites, and place orders.
- **Seller:** update listing details and move an item through available, reserved, sold, or removed states.
- **Buyer:** view their orders and cancel an order while it is still pending.

The same account can act as a buyer and a seller. There is no separate administrator role in the MVP.

## MVP functional requirements

### Account and profile

1. A user can register with a unique HKU-style email address and password.
2. A user can log in and log out.
3. A logged-in user can update their display name and contact details.

### Listings

1. A seller can create a listing with a title, description, price, condition, category, location, and optional image URL.
2. Anyone can browse available listings and search by title or description.
3. Anyone can filter listings by category, condition, price range, and status.
4. A seller can read, edit, or delete their own listings.
5. A seller can change a listing status to `available`, `reserved`, `sold`, or `removed`.
6. A listing cannot be edited or deleted by a different user.

### Favorites

1. A logged-in user can add an available listing to favorites.
2. A user can view their saved listings and remove a favorite.
3. The same user cannot favorite the same listing twice.

### Orders

1. A logged-in user can place an order for an available listing.
2. A listing can have at most one active order.
3. A buyer can view their orders and cancel a pending order.
4. A seller can confirm, complete, or cancel an order for one of their listings.
5. The order stores the agreed amount and pickup location so that the transaction record remains understandable if the listing later changes.

## Core data rules

- Email addresses are unique and stored in normalized lowercase form.
- Prices are non-negative and use two decimal places.
- A listing must belong to an existing user and category.
- A user cannot order their own listing.
- Only available listings can receive a new order.
- An item marked `sold` cannot be ordered again.
- Deleting a listing removes its favorites; order history is retained with a restricted listing reference where possible.

## Non-functional requirements

- The application must be runnable from a clean checkout by following the README.
- Database credentials must be supplied through environment variables rather than committed to Git.
- All write endpoints must validate input and return useful error messages.
- Authentication and seller/buyer ownership checks must be enforced on the server.
- SQL must use parameterized queries or the selected ORM's parameter binding.
- The UI should work on a laptop-sized viewport and show loading, empty, and error states.

## Out of scope for the MVP

- Online payment and delivery tracking
- Real-time chat and push notifications
- Social sign-in
- Multiple images per listing
- Ratings, reviews, and administrator moderation

These can be added later without changing the core CRUD demonstration.

## Acceptance checklist

- [ ] A new user can register and log in.
- [ ] A seller can create, read, update, and delete a listing.
- [x] A visitor can search and filter listings.
- [x] A buyer can favorite a listing and place an order.
- [ ] A buyer or seller can perform the permitted order status updates.
- [ ] The database can be recreated and populated with sample data from the README instructions.
- [ ] The two-minute demonstration video shows representative CRUD and database operations.
