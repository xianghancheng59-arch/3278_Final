const { createClient } = require('@libsql/client');
const { readFileSync } = require('node:fs');
const path = require('node:path');

function sqliteError(error) {
  const code = error.code || '';
  if (/UNIQUE|PRIMARYKEY/.test(code) || /UNIQUE constraint failed/i.test(error.message)) {
    error.code = 'ER_DUP_ENTRY';
  } else if (code.startsWith('SQLITE_CONSTRAINT')) {
    error.code = 'ER_CHECK_CONSTRAINT_VIOLATED';
  } else if (/SQLITE_BUSY|SQLITE_LOCKED/.test(code)) {
    error.code = 'ER_LOCK_WAIT_TIMEOUT';
  }
  return error;
}

async function execute(target, sql, params = []) {
  // A SQLite write transaction reserves the writer before any availability check.
  const stmt = sql.replace(/ FOR UPDATE$/, '');
  const args = params.map(value => value instanceof Date ? value.toISOString() : value);
  try {
    const result = await target.execute({ sql: stmt, args });
    const rows = result.rows.map(row => {
      const values = { ...row };
      for (const name of result.columns) {
        const value = values[name];
        if (value == null) continue;
        if (name === 'price' || name === 'agreed_amount') values[name] = Number(value).toFixed(2);
        else if (typeof value === 'bigint') values[name] = value.toString();
      }
      return values;
    });
    return [rows];
  } catch (error) {
    throw sqliteError(error);
  }
}

async function createSqlitePool({ url, authToken }) {
  const client = createClient({ url, authToken, intMode: 'bigint' });
  try {
    const tx = await client.transaction('write');
    try {
      const tables = await tx.execute("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('users','categories','items','favorites','orders')");
      if (!tables.rows.length) {
        for (const file of ['schema-sqlite.sql', 'seed.sql']) {
          await tx.executeMultiple(readFileSync(path.join(__dirname, '../sql', file), 'utf8'));
        }
      } else if (tables.rows.length !== 5) {
        throw new Error('Incomplete CampusSwap schema. Check the configured database.');
      }
      // Upgrade an existing five-table database without resetting listings or users.
      await tx.executeMultiple(readFileSync(path.join(__dirname, '../sql/migrations/2026-11-17-item-photos-sqlite.sql'), 'utf8'));
      await tx.commit();
    } finally {
      tx.close();
    }
  } catch (error) {
    client.close();
    throw error;
  }
  return {
    dialect: 'sqlite',
    execute: (sql, args) => execute(client, sql, args),
    async getConnection() {
      let tx;
      return {
        async beginTransaction() {
          try { tx = await client.transaction('write'); }
          catch (error) { throw sqliteError(error); }
        },
        execute: (sql, args) => execute(tx, sql, args),
        commit: () => tx.commit(),
        rollback: () => tx && !tx.closed && tx.rollback(),
        release: () => tx?.close()
      };
    },
    end: () => client.close()
  };
}

module.exports = { createSqlitePool };
