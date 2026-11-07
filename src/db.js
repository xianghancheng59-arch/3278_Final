const mysql = require('mysql2/promise');

function createPool(env = process.env) {
  const required = ['MYSQL_HOST', 'MYSQL_USER', 'MYSQL_DATABASE'];
  const missing = required.filter((key) => !env[key]);
  if (missing.length) {
    throw new Error(`Missing database configuration: ${missing.join(', ')}`);
  }

  return mysql.createPool({
    host: env.MYSQL_HOST,
    port: Number(env.MYSQL_PORT || 3306),
    user: env.MYSQL_USER,
    password: env.MYSQL_PASSWORD || '',
    database: env.MYSQL_DATABASE,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    timezone: 'Z',
    supportBigNumbers: true,
    bigNumberStrings: true,
    charset: 'utf8mb4'
  });
}

function createUserRepository(pool) {
  return {
    async create({ id, fullName, email, passwordHash, now }) {
      await pool.execute(
        `INSERT INTO users
          (id, full_name, email, password_hash, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'active', ?, ?)`,
        [id, fullName, email, passwordHash, now, now]
      );
      return { id: String(id), fullName, email, status: 'active' };
    },

    async findByEmail(email) {
      const [rows] = await pool.execute(
        `SELECT id, full_name AS fullName, email, password_hash AS passwordHash, status
         FROM users WHERE email = ? LIMIT 1`,
        [email]
      );
      return rows[0] || null;
    },

    async findPublicById(id) {
      const [rows] = await pool.execute(
        `SELECT id, full_name AS fullName, email, status
         FROM users WHERE id = ? LIMIT 1`,
        [id]
      );
      return rows[0] || null;
    }
  };
}

module.exports = { createPool, createUserRepository };
