const { test } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const request = require('supertest');
const { createApp } = require('../src/app');

const jwtSecret = 'local-test-secret-with-at-least-32-bytes';

function setup({ withProtectedRoute = false } = {}) {
  const records = new Map();
  let nextId = 1;
  const users = {
    async create(data) {
      if ([...records.values()].some((user) => user.email === data.email)) {
        const error = new Error('duplicate');
        error.code = 'ER_DUP_ENTRY';
        throw error;
      }
      const user = {
        id: String(data.id || nextId++),
        fullName: data.fullName,
        email: data.email,
        passwordHash: data.passwordHash,
        status: 'active'
      };
      records.set(user.id, user);
      return user;
    },
    async findByEmail(email) {
      return [...records.values()].find((user) => user.email === email) || null;
    },
    async findPublicById(id) {
      const { passwordHash, ...user } = records.get(String(id)) || {};
      return user.id ? user : null;
    }
  };
  const app = createApp({
    users,
    jwtSecret,
    mountRoutes: withProtectedRoute
      ? (router, { requireAuth }) => router.get('/api/test/protected', requireAuth, (req, res) => res.json({ user: req.user }))
      : undefined
  });
  return { app, records };
}

test('registration creates a hashed account and authenticates the browser cookie', async () => {
  const { app, records } = setup();
  const agent = request.agent(app);
  const response = await agent.post('/api/auth/register').send({
    fullName: 'Alice Chan',
    email: ' ALICE@CONNECT.HKU.HK ',
    password: 'strong-password-123'
  }).expect(201);

  assert.equal(response.body.user.email, 'alice@connect.hku.hk');
  assert.equal(response.body.user.fullName, 'Alice Chan');
  assert.equal(response.headers['set-cookie'][0].includes('HttpOnly'), true);
  const stored = [...records.values()][0];
  assert.notEqual(stored.passwordHash, 'strong-password-123');
  assert.equal(await bcrypt.compare('strong-password-123', stored.passwordHash), true);
  await agent.get('/api/auth/me').expect(200, { user: response.body.user });
});

test('registration validates HKU email and password before creating a row', async () => {
  const { app, records } = setup();
  await request(app).post('/api/auth/register').send({
    fullName: 'Alice', email: 'alice@example.com', password: 'password123'
  }).expect(400);
  await request(app).post('/api/auth/register').send({
    fullName: 'Alice', email: 'alice@connect.hku.hk', password: 'short'
  }).expect(400);
  assert.equal(records.size, 0);
});

test('duplicate email is rejected and existing users can log in and log out', async () => {
  const { app } = setup();
  const agent = request.agent(app);
  const body = { fullName: 'Bob Lee', email: 'bob@connect.hku.hk', password: 'correct-password' };
  await agent.post('/api/auth/register').send(body).expect(201);
  await request(app).post('/api/auth/register').send(body).expect(409);
  await agent.post('/api/auth/logout').expect(204);
  await agent.get('/api/auth/me').expect(401);
  await agent.post('/api/auth/login').send({ email: body.email, password: body.password }).expect(200);
  await agent.get('/api/auth/me').expect(200);
});

test('bad password and seeded unusable password marker cannot log in', async () => {
  const { app, records } = setup();
  const passwordHash = await bcrypt.hash('real-password-123', 4);
  records.set('2', { id: '2', fullName: 'Eva Lam', email: 'eva@connect.hku.hk', passwordHash: '!', status: 'active' });
  records.set('3', { id: '3', fullName: 'Suspended User', email: 'suspended@connect.hku.hk', passwordHash, status: 'suspended' });
  await request(app).post('/api/auth/login').send({ email: 'eva@connect.hku.hk', password: 'anything-long' }).expect(401);
  await request(app).post('/api/auth/login').send({ email: 'suspended@connect.hku.hk', password: 'real-password-123' }).expect(401);
  await request(app).post('/api/auth/login').send({ email: 'missing@connect.hku.hk', password: 'anything-long' }).expect(401);
});

test('unauthenticated requests cannot read account details', async () => {
  const { app } = setup();
  await request(app).get('/api/auth/me').expect(401);
});

test('the handoff middleware supplies a string user id to protected feature routes', async () => {
  const { app } = setup({ withProtectedRoute: true });
  const agent = request.agent(app);
  await agent.post('/api/auth/register').send({
    fullName: 'Cathy Wong', email: 'cathy@connect.hku.hk', password: 'safe-password-123'
  }).expect(201);

  const response = await agent.get('/api/test/protected').expect(200);
  assert.equal(typeof response.body.user.id, 'string');
  assert.equal(response.body.user.email, 'cathy@connect.hku.hk');
  assert.equal(response.body.user.fullName, 'Cathy Wong');
});

test('the root page serves the account UI and its browser client', async () => {
  const { app } = setup();
  await request(app).get('/').expect(200).expect(/Create account/);
  await request(app).get('/app.js').expect(200).expect(/api\/auth\/me/);
  await request(app).get('/styles.css').expect(200).expect(/auth-panel/);
});
