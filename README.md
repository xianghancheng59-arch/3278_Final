# CampusSwap

A campus second-hand marketplace for listing items, finding bargains, saving favorites, and arranging in-person exchanges.

**Current status:** requirements, database implementation and ER design are available. Authentication, API and frontend implementation are pending; the full application cannot be started yet.

## Project guide

| Document | Contents |
|---|---|
| [Requirements](docs/requirements.md) | Features, scope and acceptance checklist |
| [ER diagram](docs/er-diagram.md) | Final diagram, relationships and editable source |
| [Database guide](docs/database.md) | Tables, constraints, seed data and backend handoff |
| [Architecture](docs/architecture.md) | Application layers and API boundaries |

Planned features: account registration/login, listing CRUD, search/filtering, favorites, and single-item orders. Online payment, shipping and live chat are outside the MVP.

## Database setup

Requires a running **MySQL 8.0.16+** server and client; tested on **8.0.46**. Keep the default strict SQL mode. Use your own local MySQL account and credentials.

Open a terminal in the repository root. In Windows PowerShell:

```powershell
& 'C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe' --host=127.0.0.1 --user=root --password --default-character-set=utf8mb4
```

Adjust the installation path/account as needed. With mysql on PATH, including macOS/Linux:

```sh
mysql --host=127.0.0.1 --user=root --password --default-character-set=utf8mb4
```

At the **mysql prompt**, run these commands one at a time and stop on errors:

```sql
CREATE DATABASE campusswap CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE campusswap;
SOURCE sql/schema.sql;
SOURCE sql/seed.sql;
SOURCE sql/queries.sql;
```

Use a fresh database. If `campusswap` already exists, choose another name in both CREATE DATABASE and USE. To reset/rehearse, create another empty database and repeat these steps. The scripts do not drop tables or overwrite data; repeating the seed on populated tables produces duplicate-key errors.

Expected dataset: **5 users, 5 categories, 10 items, 4 favorites and 5 orders**. Reports show six available items, two favorites for Bob, and an empty Sports category.

Seed users have an unusable password marker (`!`), so they cannot log in. The authentication implementation must create real password hashes. Future backend configuration must supply the host, port (normally 3306), selected database, and credentials through local environment settings.

## Database verification

Requires Python 3.9+ and installed MySQL server/client binaries; no Python packages are needed:

```powershell
python tests/verify_database.py --mysql-bin 'C:\Program Files\MySQL\MySQL Server 8.0\bin'
```

The script starts an isolated temporary MySQL server on a random loopback port, runs the SQL and **37 checks**, then shuts down and cleans up. It does not use your existing databases. Coverage includes keys, invalid data, order history and CRUD persistence; API, authentication and concurrent orders are not yet tested.

## Troubleshooting

- **Cannot connect:** start MySQL and check the host/port. The automated verifier starts its own server.
- **Access denied:** check your MySQL credentials and database-creation privileges. Seed users are application records, not MySQL accounts.
- **Cannot open SOURCE file:** start mysql from the repository root.
- **Database/table already exists:** stop and use a fresh database.
- **CHECK constraints unsupported:** run `SELECT VERSION();` and use MySQL 8.0.16+.

Full application installation and start commands will be added when the web stack is implemented.
