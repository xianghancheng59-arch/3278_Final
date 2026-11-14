# Database setup and verification

## Initialize a fresh database

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

Seed users have an unusable password marker (`!`). Register seller and buyer accounts through the website before recording. Set `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_DATABASE`, `MYSQL_USER` and `MYSQL_PASSWORD` in the backend's local `.env`. Connect your SQL client to the same host, port and database to see changes made on the website.

## Database verification

Requires Python 3.9+ and installed MySQL server/client binaries; no Python packages are needed:

```powershell
python tests/verify_database.py --mysql-bin 'C:\Program Files\MySQL\MySQL Server 8.0\bin'
```

The script starts an isolated temporary MySQL server on a random loopback port, runs the SQL and **37 checks**, then shuts down and cleans up. It does not use your existing databases. Coverage includes keys, invalid data, order history and CRUD persistence. The separate integration suite in the [README](../README.md#run-locally) exercises authentication, the marketplace API and concurrent orders.

## Troubleshooting

- **Cannot connect:** start MySQL and check the host/port. The automated verifier starts its own server.
- **Access denied:** check your MySQL credentials and database-creation privileges. Seed users are application records, not MySQL accounts.
- **Cannot open SOURCE file:** start mysql from the repository root.
- **Database/table already exists:** stop and use a fresh database.
- **CHECK constraints unsupported:** run `SELECT VERSION();` and use MySQL 8.0.16+.

For the complete Node.js + Express API and React marketplace, follow [the authentication module run guide](authentication.md#run-locally). The complete stack requires Node.js 20+ in addition to the MySQL prerequisites above.
