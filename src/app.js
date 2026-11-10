const path = require('node:path');
const fs = require('node:fs');
const express = require('express');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const { createAuthRouter, requireAuth } = require('./auth');
const { createMarketplaceRouter } = require('./marketplace');
const { APIError } = require('./validation');

function createApp({ users, jwtSecret, isProduction = false, mountRoutes, pool, serveFrontend = false }) {
  if (!users) throw new Error('A user repository is required.');
  if (typeof jwtSecret !== 'string' || Buffer.byteLength(jwtSecret) < 32) {
    throw new Error('JWT_SECRET must contain at least 32 bytes.');
  }

  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(express.json({ limit: '64kb' }));
  app.use(cookieParser());
  const authMiddleware = requireAuth(jwtSecret, users);
  app.locals.requireAuth = authMiddleware;
  app.locals.authenticatedUserContract = 'req.user = { id, email, fullName }';
  app.use('/api/auth', createAuthRouter({ users, jwtSecret, isProduction }));
  if (pool) app.use('/api', createMarketplaceRouter({ pool, requireAuth: authMiddleware, jwtSecret }));
  if (mountRoutes) mountRoutes(app, { requireAuth: authMiddleware, users });
  const frontendDirectory = path.join(__dirname, '..', 'dist');
  const frontendIndex = path.join(frontendDirectory, 'index.html');
  const serveBuiltFrontend = serveFrontend && fs.existsSync(frontendIndex);
  const staticDirectory = serveBuiltFrontend ? frontendDirectory : path.join(__dirname, '..', 'public');
  app.use(express.static(staticDirectory));
  if (serveBuiltFrontend) {
    app.get(/^(?!\/api(?:\/|$)).*/, (req, res) => res.sendFile(frontendIndex));
  }
  app.use((req, res) => res.status(404).json({ error: 'Not found.' }));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error instanceof APIError) return res.status(error.status).json({ error: error.message });
    if (error.type === 'entity.too.large') return res.status(413).json({ error: 'Request body exceeds 64 KiB.' });
    if (['ER_DUP_ENTRY', 'ER_NO_REFERENCED_ROW_2', 'ER_ROW_IS_REFERENCED_2', 'ER_CHECK_CONSTRAINT_VIOLATED'].includes(error.code)) {
      return res.status(409).json({ error: 'Database constraint conflict.' });
    }
    if (['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT'].includes(error.code)) {
      return res.status(409).json({ error: 'Concurrent update conflict; retry the request.' });
    }
    if (error.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Request body must be valid JSON.' });
    }
    console.error(error);
    return res.status(500).json({ error: 'Internal server error.' });
  });
  return app;
}

module.exports = { createApp };
