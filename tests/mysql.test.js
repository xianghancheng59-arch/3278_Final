const { test } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { createApp } = require('../src/app');
const { createPool, createUserRepository } = require('../src/db');
const { COOKIE_NAME } = require('../src/auth');

test('A login + C marketplace on disposable real MySQL', { skip: process.env.C_MYSQL_TEST !== '1' }, async (t) => {
  assert.equal(process.env.MYSQL_DATABASE, 'campusswap_c_test');
  const pool = createPool();
  t.after(() => pool.end());
  const users = createUserRepository(pool), jwtSecret = 'isolated-integration-test-key-32-bytes';
  const app = createApp({ pool, users, jwtSecret });
  const data = { title: 'Integration textbook', description: 'Clean copy', price: '120.00', item_condition: 'good', category_id: '1', location: 'HKU' };
  async function register(name) {
    const agent = request.agent(app);
    const response = await agent.post('/api/auth/register').send({ fullName: name, email: `${name}@connect.hku.hk`, password: 'integration-password-123' }).expect(201);
    const token = (await agent.get('/api/csrf').expect(200)).body.csrf_token;
    return { agent, token, user: response.body.user, cookie: response.headers['set-cookie'][0].split(';')[0] };
  }
  const seller = await register('seller'), buyer = await register('buyer'), other = await register('other');
  const send = (who, method, path, value) => who.agent[method](path).set('X-CSRF-Token', who.token).send(value);
  const create = async (value = {}) => (await send(seller, 'post', '/api/items', { ...data, ...value }).expect(201)).body;
  const row = async (table, rowId) => (await pool.execute(`SELECT * FROM ${table} WHERE id=?`, [rowId]))[0][0];
  let item, order;

  await t.test('A registration cookie authorizes C; CSRF is bound to that cookie', async () => {
    await seller.agent.get('/api/auth/me').expect(200, { user: seller.user });
    await seller.agent.post('/api/items').send(data).expect(403);
    await seller.agent.post('/api/items').set('X-CSRF-Token', buyer.token).send(data).expect(403);
    item = await create();
    assert.equal(item.seller_id, seller.user.id);
    assert.equal((await row('items', item.id)).id, item.id);
    assert.match(item.created_at, /Z$/);
  });
  await t.test('real SELECT, filters, pagination, invalid input and injection handling', async () => {
    await request(app).get('/api/categories').expect(200).then((r) => assert.equal(r.body.length, 5));
    const response = await request(app).get('/api/items').query({
      seller_id: seller.user.id, category_id: '1', condition: 'good', status: 'available',
      q: 'textbook', min_price: '120', max_price: '120', limit: '1', offset: '0'
    }).expect(200);
    assert.equal(response.body[0].id, item.id);
    assert.equal(response.body[0].price, '120.00');
    await request(app).get('/api/items').query({ q: "' OR 1=1 --" }).expect(200, []);
    await request(app).get('/api/items').query({ category_id: '1 OR 1=1' }).expect(400);
    await request(app).get('/api/items/9223372036854775808').expect(400);
    await request(app).get('/api/items/9223372036854775807').expect(404);
    await send(seller, 'post', '/api/items', { ...data, category_id: '999999' }).expect(409);
    await send(seller, 'post', '/api/items', { ...data, seller_id: buyer.user.id }).expect(400);
  });
  await t.test('favorites are private, persistent, idempotent and availability-aware', async () => {
    const unused = await create({ title: 'Favorite integration', price: '55.50' });
    await buyer.agent.get('/api/favorites').expect(200, []);
    await buyer.agent.post(`/api/items/${unused.id}/favorite`).send({}).expect(403);
    await send(buyer, 'post', `/api/items/${unused.id}/favorite`, {}).expect(204);
    await send(buyer, 'post', `/api/items/${unused.id}/favorite`, {}).expect(204);

    const saved = (await buyer.agent.get('/api/favorites').expect(200)).body;
    assert.equal(saved.length, 1);
    assert.equal(saved[0].id, unused.id);
    assert.equal(saved[0].title, 'Favorite integration');
    assert.deepEqual((await other.agent.get('/api/favorites').expect(200)).body, []);

    await send(seller, 'patch', `/api/items/${unused.id}`, { status: 'removed' }).expect(200);
    await send(other, 'post', `/api/items/${unused.id}/favorite`, {}).expect(409);
    await send(seller, 'patch', `/api/items/${unused.id}`, { status: 'available' }).expect(200);

    await send(buyer, 'delete', `/api/items/${unused.id}/favorite`, {}).expect(204);
    await buyer.agent.get('/api/favorites').expect(200, []);
    await send(seller, 'delete', `/api/items/${unused.id}`, {}).expect(204);
  });
  await t.test('BIGINT IDs survive database reads, edits and deletes exactly', async () => {
    const largeId = '4611686018427387903';
    await pool.execute(`INSERT INTO items (id,seller_id,category_id,title,description,price,item_condition,status,location,created_at,updated_at)
      VALUES (?, ?, 1, 'Big ID', '', 1.00, 'good', 'available', 'HKU', UTC_TIMESTAMP(), UTC_TIMESTAMP())`, [largeId, seller.user.id]);
    assert.equal((await request(app).get(`/api/items/${largeId}`).expect(200)).body.id, largeId);
    await send(seller, 'patch', `/api/items/${largeId}`, { price: '2.01' }).expect(200);
    assert.equal((await row('items', largeId)).price, '2.01');
    await send(seller, 'delete', `/api/items/${largeId}`).expect(204);
    assert.equal(await row('items', largeId), undefined);
  });
  await t.test('ownership, manual status rules, and favorite cleanup on deletion', async () => {
    const unused = await create();
    await send(buyer, 'patch', `/api/items/${unused.id}`, { title: 'Steal' }).expect(403);
    await send(buyer, 'delete', `/api/items/${unused.id}`).expect(403);
    await send(seller, 'patch', `/api/items/${unused.id}`, { status: 'sold' }).expect(400);
    await send(seller, 'patch', `/api/items/${unused.id}`, { status: 'removed' }).expect(200);
    await send(buyer, 'post', '/api/orders', { item_id: unused.id }).expect(409);
    await send(seller, 'patch', `/api/items/${unused.id}`, { status: 'available', title: 'Edited' }).expect(200);
    await pool.execute('INSERT INTO favorites VALUES (?, ?, UTC_TIMESTAMP())', [buyer.user.id, unused.id]);
    await send(seller, 'delete', `/api/items/${unused.id}`).expect(204);
    assert.equal((await pool.execute('SELECT * FROM favorites WHERE item_id=?', [unused.id]))[0].length, 0);
  });
  await t.test('two concurrent buyers produce one order and one 409', async () => {
    const responses = await Promise.all([send(buyer, 'post', '/api/orders', { item_id: item.id }), send(other, 'post', '/api/orders', { item_id: item.id })]);
    assert.deepEqual(responses.map((r) => r.status).sort(), [201, 409]);
    order = responses.find((r) => r.status === 201).body;
    assert.equal(order.agreed_amount, '120.00');
    assert.equal(order.pickup_location, 'HKU');
    assert.equal((await row('items', item.id)).status, 'reserved');
    assert.equal((await pool.execute('SELECT * FROM orders WHERE item_id=?', [item.id]))[0].length, 1);
    await send(seller, 'patch', `/api/items/${item.id}`, { price: '1' }).expect(409);
    await send(seller, 'delete', `/api/items/${item.id}`).expect(409);
  });
  await t.test('cancel/reorder preserves historical price, location and deletion restriction', async () => {
    const winner = order.buyer_id === buyer.user.id ? buyer : other;
    const loser = winner === buyer ? other : buyer;
    await send(loser, 'patch', `/api/orders/${order.id}/status`, { status: 'cancelled' }).expect(403);
    await send(winner, 'patch', `/api/orders/${order.id}/status`, { status: 'completed' }).expect(409);
    await send(winner, 'patch', `/api/orders/${order.id}/status`, { status: 'cancelled' }).expect(200);
    assert.equal((await row('items', item.id)).status, 'available');
    await send(seller, 'delete', `/api/items/${item.id}`).expect(409);
    await send(seller, 'patch', `/api/items/${item.id}`, { price: '88.50', location: 'Library' }).expect(200);
    const old = await row('orders', order.id);
    assert.equal(old.agreed_amount, '120.00');
    assert.equal(old.pickup_location, 'HKU');
    await send(seller, 'post', '/api/orders', { item_id: item.id }).expect(403);
    order = (await send(buyer, 'post', '/api/orders', { item_id: item.id }).expect(201)).body;
    assert.equal(order.agreed_amount, '88.50');
    assert.equal(order.pickup_location, 'Library');
  });
  await t.test('participant-only histories, seller confirmation/completion and terminal states', async () => {
    assert.ok((await seller.agent.get('/api/orders').expect(200)).body.some((o) => o.id === order.id));
    assert.ok((await buyer.agent.get('/api/orders').expect(200)).body.some((o) => o.id === order.id));
    assert.ok(!(await other.agent.get('/api/orders').expect(200)).body.some((o) => o.id === order.id));
    await send(buyer, 'patch', `/api/orders/${order.id}/status`, { status: 'confirmed' }).expect(409);
    await send(seller, 'patch', `/api/orders/${order.id}/status`, { status: 'confirmed' }).expect(200);
    await send(buyer, 'patch', `/api/orders/${order.id}/status`, { status: 'cancelled' }).expect(409);
    await send(seller, 'patch', `/api/orders/${order.id}/status`, { status: 'completed' }).expect(200);
    assert.equal((await row('items', item.id)).status, 'sold');
    await send(seller, 'patch', `/api/orders/${order.id}/status`, { status: 'cancelled' }).expect(409);
    await send(seller, 'patch', `/api/items/${item.id}`, { status: 'available' }).expect(409);
  });
  await t.test('failure after INSERT rolls back both order and item changes', async () => {
    const unused = await create();
    const faultPool = { execute: pool.execute.bind(pool), async getConnection() {
      const connection = await pool.getConnection();
      return new Proxy(connection, { get(target, key) {
        if (key === 'execute') return (sql, args) => {
          if (sql.startsWith("UPDATE items SET status='reserved'")) {
            const error = new Error('Injected transaction failure'); error.code = 'ER_LOCK_DEADLOCK'; throw error;
          }
          return target.execute(sql, args);
        };
        return typeof target[key] === 'function' ? target[key].bind(target) : target[key];
      } });
    } };
    const faultApp = createApp({ pool: faultPool, users, jwtSecret });
    await request(faultApp).post('/api/orders').set('Cookie', buyer.cookie).set('X-CSRF-Token', buyer.token).send({ item_id: unused.id }).expect(409);
    assert.equal((await row('items', unused.id)).status, 'available');
    assert.equal((await pool.execute('SELECT * FROM orders WHERE item_id=?', [unused.id]))[0].length, 0);
  });
  await t.test('suspension, expired/tampered cookies, logout and fresh login enforce A authentication', async () => {
    await pool.execute("UPDATE users SET status='suspended' WHERE id=?", [other.user.id]);
    await other.agent.get('/api/orders').expect(401);
    await send(other, 'post', '/api/items', data).expect(401);
    await request(app).get('/api/orders').set('Cookie', `${COOKIE_NAME}=tampered`).expect(401);
    const expired = jwt.sign({}, jwtSecret, { subject: buyer.user.id, issuer: 'campusswap-api', audience: 'campusswap-web', expiresIn: -1 });
    await request(app).get('/api/orders').set('Cookie', `${COOKIE_NAME}=${expired}`).expect(401);
    await buyer.agent.post('/api/auth/logout').send({}).expect(204);
    await buyer.agent.get('/api/orders').expect(401);
    await buyer.agent.post('/api/auth/login').send({ email: 'buyer@connect.hku.hk', password: 'integration-password-123' }).expect(200);
    buyer.token = (await buyer.agent.get('/api/csrf').expect(200)).body.csrf_token;
    await send(buyer, 'post', '/api/items', data).expect(201);
  });
});
