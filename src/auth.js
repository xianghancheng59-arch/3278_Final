const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Router } = require('express');
const { rateLimit } = require('express-rate-limit');

const COOKIE_NAME = 'campusswap_token';
const TOKEN_TTL_SECONDS = 60 * 60 * 8;
const EMAIL_PATTERN = /^[^\s@]+@connect\.hku\.hk$/i;

function createUserId() {
  const bytes = crypto.randomBytes(7);
  const id = (bytes[0] & 0x1f) * 2 ** 48 + bytes.readUIntBE(1, 6);
  return id || 1;
}

function publicUser(user) {
  return {
    id: String(user.id),
    fullName: user.fullName ?? user.full_name,
    email: user.email
  };
}

function createAuthRouter({ users, jwtSecret, isProduction = false }) {
  const router = Router();
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Too many authentication attempts. Please try again later.' }
  });

  const cookieOptions = {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    path: '/',
  };

  function issueToken(user, res) {
    const safeUser = publicUser(user);
    const token = jwt.sign(safeUser, jwtSecret, {
      subject: safeUser.id,
      expiresIn: TOKEN_TTL_SECONDS,
      issuer: 'campusswap-api',
      audience: 'campusswap-web'
    });
    res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: TOKEN_TTL_SECONDS * 1000 });
    return safeUser;
  }

  router.post('/register', authLimiter, async (req, res, next) => {
    const fullName = typeof req.body?.fullName === 'string' ? req.body.fullName.trim() : '';
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    if (!fullName || fullName.length > 100) {
      return res.status(400).json({ error: 'Name is required and must be at most 100 characters.' });
    }
    if (!EMAIL_PATTERN.test(email) || email.length > 254) {
      return res.status(400).json({ error: 'Use a valid @connect.hku.hk email address.' });
    }
    if (Buffer.byteLength(password, 'utf8') < 8 || Buffer.byteLength(password, 'utf8') > 72) {
      return res.status(400).json({ error: 'Password must be 8 to 72 bytes long.' });
    }

    try {
      const passwordHash = await bcrypt.hash(password, 12);
      let user;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const id = createUserId();
        try {
          user = await users.create({
            id,
            fullName,
            email,
            passwordHash,
            now: new Date()
          });
          break;
        } catch (error) {
          if (error.code === 'ER_DUP_ENTRY' && attempt < 2) continue;
          if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'An account with this email already exists.' });
          }
          throw error;
        }
      }

      const safeUser = issueToken(user, res);
      return res.status(201).json({ user: safeUser });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/login', authLimiter, async (req, res, next) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!email || !password || Buffer.byteLength(password, 'utf8') > 72) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    try {
      const user = await users.findByEmail(email);
      const validPassword = user?.passwordHash && user.passwordHash !== '!'
        ? await bcrypt.compare(password, user.passwordHash)
        : false;
      if (!validPassword || user.status !== 'active') {
        return res.status(401).json({ error: 'Email or password is incorrect.' });
      }

      return res.json({ user: issueToken(user, res) });
    } catch (error) {
      return next(error);
    }
  });

  router.get('/me', async (req, res) => {
    const token = req.cookies?.[COOKIE_NAME];
    if (!token) return res.status(401).json({ error: 'Authentication required.' });

    let claims;
    try {
      claims = jwt.verify(token, jwtSecret, {
        issuer: 'campusswap-api',
        audience: 'campusswap-web'
      });
    } catch {
      res.clearCookie(COOKIE_NAME, cookieOptions);
      return res.status(401).json({ error: 'Authentication required.' });
    }

    try {
      const user = await users.findPublicById(claims.sub);
      if (!user || user.status !== 'active') {
        res.clearCookie(COOKIE_NAME, cookieOptions);
        return res.status(401).json({ error: 'Authentication required.' });
      }
      return res.json({ user: publicUser(user) });
    } catch {
      return res.status(503).json({ error: 'Account service is temporarily unavailable.' });
    }
  });

  router.post('/logout', (req, res) => {
    res.clearCookie(COOKIE_NAME, cookieOptions);
    return res.status(204).end();
  });

  return router;
}

function requireAuth(jwtSecret, users) {
  return async (req, res, next) => {
    const token = req.cookies?.[COOKIE_NAME];
    if (!token) return res.status(401).json({ error: 'Authentication required.' });
    try {
      const claims = jwt.verify(token, jwtSecret, {
        issuer: 'campusswap-api',
        audience: 'campusswap-web'
      });
      const account = await users.findPublicById(claims.sub);
      if (!account || account.status !== 'active') {
        return res.status(401).json({ error: 'Authentication required.' });
      }
      req.user = publicUser(account);
      return next();
    } catch (error) {
      if (error.name !== 'JsonWebTokenError' && error.name !== 'TokenExpiredError' && error.name !== 'NotBeforeError') {
        return next(error);
      }
      return res.status(401).json({ error: 'Authentication required.' });
    }
  };
}

module.exports = { COOKIE_NAME, createAuthRouter, requireAuth };
