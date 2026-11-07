const path = require('node:path');
const express = require('express');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const { createAuthRouter, requireAuth } = require('./auth');

function createApp({ users, jwtSecret, isProduction = false, mountRoutes }) {
  if (!users) throw new Error('A user repository is required.');
  if (typeof jwtSecret !== 'string' || Buffer.byteLength(jwtSecret) < 32) {
    throw new Error('JWT_SECRET must contain at least 32 bytes.');
  }

  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(express.json({ limit: '10kb' }));
  app.use(cookieParser());
  const authMiddleware = requireAuth(jwtSecret, users);
  app.locals.requireAuth = authMiddleware;
  app.locals.authenticatedUserContract = 'req.user = { id, email, fullName }';
  app.use('/api/auth', createAuthRouter({ users, jwtSecret, isProduction }));
  if (mountRoutes) mountRoutes(app, { requireAuth: authMiddleware, users });
  app.use(express.static(path.join(__dirname, '..', 'public')));
  app.use((req, res) => res.status(404).json({ error: 'Not found.' }));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Request body must be valid JSON.' });
    }
    console.error(error);
    return res.status(500).json({ error: 'Internal server error.' });
  });
  return app;
}

module.exports = { createApp };
