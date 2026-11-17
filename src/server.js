require('dotenv').config();

const { createApp } = require('./app');
const { createPool, createUserRepository } = require('./db');

async function start() {
  let pool;
  if (process.env.SQLITE_URL) {
    const { createSqlitePool } = require('./sqlite');
    pool = await createSqlitePool({ url: process.env.SQLITE_URL, authToken: process.env.SQLITE_AUTH_TOKEN });
  } else {
    pool = createPool();
  }
  const app = createApp({
    pool,
    users: createUserRepository(pool),
    jwtSecret: process.env.JWT_SECRET,
    isProduction: process.env.NODE_ENV === 'production',
    serveFrontend: process.env.SERVE_FRONTEND === 'true',
    trustProxy: process.env.TRUST_PROXY || undefined
  });
  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || undefined;

  const server = app.listen({ port, host }, () => {
    console.log(`CampusSwap server listening on http://${host || 'localhost'}:${port}`);
  });

  async function shutdown() {
    server.close(async () => {
      await pool.end();
      process.exit(0);
    });
  }

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

start().catch(error => {
  console.error('Failed to start CampusSwap:', error.code || error.name);
  process.exitCode = 1;
});
