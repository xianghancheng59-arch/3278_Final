require('dotenv').config();

const { createApp } = require('./app');
const { createPool, createUserRepository } = require('./db');

const pool = createPool();
const app = createApp({
  users: createUserRepository(pool),
  jwtSecret: process.env.JWT_SECRET,
  isProduction: process.env.NODE_ENV === 'production'
});
const port = Number(process.env.PORT || 3000);

const server = app.listen(port, () => {
  console.log(`CampusSwap auth server listening on http://localhost:${port}`);
});

async function shutdown() {
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
