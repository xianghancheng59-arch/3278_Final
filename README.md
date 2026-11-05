# CampusSwap

A full-stack campus second-hand marketplace with user authentication, item listings, search, favorites, and order management backed by a relational database.

## Project scope

CampusSwap helps students list, discover, and exchange second-hand items on campus. The MVP demonstrates database-backed create, read, update, and delete operations for listings, favorites, and orders.

The design is documented before implementation so that each team member can build against the same data model and API boundary:

- [Requirements and MVP acceptance checklist](docs/requirements.md)
- [ER diagram and relationship explanation](docs/er-diagram.md)
- [System architecture and API boundary](docs/architecture.md)

## Planned core features

- User registration, login, logout, and profile updates
- Listing creation, browsing, search, editing, and deletion
- Category, condition, price, and status filters
- Favorites for logged-in users
- Single-item order flow with seller and buyer status updates

## Development status

Requirements and system design are documented. Member B has added the database implementation below; authentication, API and frontend implementation are not yet present.

## Database implementation (Member B)

The repository now includes the five-table MySQL schema, fictional seed data, read-only report queries, a database handoff, and disposable-server verification. Authentication, API and UI implementation are still outstanding; there is not yet an application start command.

- [Database contract, rules, seed guide and B presentation](docs/database.md)
- [Schema](sql/schema.sql), [seed](sql/seed.sql), [reports](sql/queries.sql)
- [Database verification script](tests/verify_database.py)

### Create and populate a fresh database

Prerequisite: a running MySQL **8.0.16+** server and its command-line client; tested on 8.0.46. Use a local MySQL account with permission to create a database and tables. Keep the server's default strict SQL mode. Passwords below are entered interactively, never committed.

In PowerShell, from this repository's root:

```powershell
Set-Location D:\GitHub_Repositories\3278_Final
& 'C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe' --host=127.0.0.1 --user=root --password --default-character-set=utf8mb4
```

Adjust the installation path/account to your machine. On macOS/Linux, from the repository root, use `mysql --host=127.0.0.1 --user=root --password --default-character-set=utf8mb4`.

At the **mysql prompt**, execute the following commands one at a time. Stop on any error:

```sql
CREATE DATABASE campusswap CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE campusswap;
SOURCE sql/schema.sql;
SOURCE sql/seed.sql;
SOURCE sql/queries.sql;
```

If the database already exists, do not continue into it blindly. Choose a fresh name, such as `campusswap_review`, for both CREATE DATABASE and USE. Scripts do not drop existing tables or overwrite existing records. Re-running seed.sql against populated tables should produce duplicate-key errors; it is intentionally a fresh-install script.

Expected data: **5 users, 5 categories, 10 items, 4 favorites, 5 orders**. Reports include six available items, two favorites for Bob, and the Sports category with zero items. Connection settings for the future backend are host `127.0.0.1`, your server port (normally `3306`), the database name you created, and your own MySQL credentials. They must be supplied through local environment configuration when the backend is implemented. No database credentials are included in this repository.

**Seed users cannot log in yet:** their password field contains an unusable marker. A must create valid hashes using the actual authentication library. The repository currently has no login implementation; no demo password is claimed.

For development reset/rehearsal, create a new explicitly named empty database and rerun the same schema/seed steps. Update the backend database selection when a backend exists. Deleting an old database is optional and must be deliberate; these scripts never reset your existing database automatically.

### Repeat B's database checks

Requires Python 3.9+ and locally installed MySQL client **and server** binaries. No Python package installation is needed. On Windows:

```powershell
python tests/verify_database.py --mysql-bin 'C:\Program Files\MySQL\MySQL Server 8.0\bin'
```

The script creates its own temporary data directory and MySQL server on a random loopback port. It does not connect to the normal server, request its password, or use its databases. On completion it shuts down that server and removes its temporary files. Expected final output: `PASS: 37 checks; schema, seed and report SQL executed on disposable MySQL.`

This verifies database SQL/constraints, not the unfinished login/API/UI or concurrent order handling. Full application installation/start commands must be added by the feature owners once they choose and implement the web stack.

### Common setup issues

- **mysql is not found:** use the full path above or your actual MySQL client location.
- **Access denied:** use your local MySQL account/password and check its privileges; seed identities are application users, not MySQL server accounts.
- **Cannot connect:** start your existing MySQL server and check its port before following the manual setup. The automated verifier starts its own isolated server.
- **Cannot open SOURCE file:** launch mysql from this repository root, not from the sql folder.
- **Table/database already exists:** stop and select a fresh database; do not mix the seed into a teammate's populated database.
- **CHECK syntax unsupported / not enforced:** verify server version with `SELECT VERSION();`; use MySQL 8.0.16 or newer.

### Known design reconciliation

The older ER document says an item has at most one lifetime order. B follows the requirements' **at most one active order**, preserving cancelled history. The database allows multiple historical orders; C must enforce the active-order and state-transition rules in the backend. All order references prevent hard-deletion of their item. See the handoff for this discrepancy and the exact deletion policy. The ER document has not yet been changed.
