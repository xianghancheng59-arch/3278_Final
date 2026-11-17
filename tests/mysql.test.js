const { test } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const sharp = require('sharp');
const { createApp } = require('../src/app');
const { createPool, createUserRepository } = require('../src/db');
const { COOKIE_NAME } = require('../src/auth');

test('A login + C marketplace on disposable real MySQL', { skip: process.env.C_MYSQL_TEST !== '1' }, async (t) => {
  assert.equal(process.env.MYSQL_DATABASE, 'campusswap_c_test');
  const pool = createPool();
  t.after(() => pool.end());
  await verifyMarketplace(t, pool);
});

test('SQLite marketplace and persistence after reconnect', { skip: !process.env.C_SQLITE_TEST_DIR }, async (t) => {
  const path = require('node:path');
  const { pathToFileURL } = require('node:url');
  const { createSqlitePool } = require('../src/sqlite');
  const directory = process.env.C_SQLITE_TEST_DIR;
  const options = { url: pathToFileURL(path.join(directory, 'test.sqlite')).href };
  let pool = await createSqlitePool(options);
  try {
    await verifyMarketplace(t, pool);
    const jwtSecret = 'sqlite-reconnect-test-key-at-least-32-bytes';
    const makeApp = () => createApp({ pool, users: createUserRepository(pool), jwtSecret });
    const app = makeApp(), agent = request.agent(app);
    const login = await agent.post('/api/auth/login').send({ email: 'seller@connect.hku.hk', password: 'integration-password-123' }).expect(200);
    const cookie = login.headers['set-cookie'][0].split(';')[0];
    const csrf = (await agent.get('/api/csrf').expect(200)).body.csrf_token;
    const jpeg = await sharp({ create: { width: 20, height: 20, channels: 3, background: '#9900ff' } }).jpeg().toBuffer();
    const fields = { title: 'Persistent photo', description: '', price: '1', category_id: '1', item_condition: 'good', location: 'HKU' };
    const create = agent.post('/api/items').set('X-CSRF-Token', csrf);
    for (const [key, value] of Object.entries(fields)) create.field(key, value);
    const saved = (await create.attach('photo', jpeg, { filename: 'photo.jpg', contentType: 'image/jpeg' }).expect(201)).body;
    const originalBytes = (await request(app).get(saved.image_url).expect(200)).body;
    await pool.execute("UPDATE items SET price='91.25' WHERE id=113");
    pool.end();
    pool = await createSqlitePool(options);
    assert.equal((await pool.execute('SELECT price FROM items WHERE id=113'))[0][0].price, '91.25');
    const reopened = makeApp();
    assert.deepEqual((await request(reopened).get(saved.image_url).expect(200)).body, originalBytes);
    await request(reopened).delete(`/api/items/${saved.id}`).set('Cookie', cookie).set('X-CSRF-Token', csrf).expect(204);
    // Simulate upgrading the old five-table database without losing existing data.
    await pool.execute('DROP TABLE item_photos');
    const ordinary = (await request(reopened).post('/api/items').set('Cookie', cookie).set('X-CSRF-Token', csrf).send(fields).expect(201)).body;
    await request(reopened).patch(`/api/items/${ordinary.id}`).set('Cookie', cookie).set('X-CSRF-Token', csrf).send({ price: '2' }).expect(200);
    await request(reopened).delete(`/api/items/${ordinary.id}`).set('Cookie', cookie).set('X-CSRF-Token', csrf).expect(204);
    pool.end();
    pool = await createSqlitePool(options);
    assert.equal((await pool.execute('SELECT price FROM items WHERE id=113'))[0][0].price, '91.25');
    assert.equal((await pool.execute('SELECT COUNT(*) AS n FROM item_photos'))[0][0].n, '0');
  } finally {
    pool.end();
  }
});

async function verifyMarketplace(t, pool) {
  const users = createUserRepository(pool), jwtSecret = 'isolated-integration-test-key-32-bytes';
  const app = createApp({ pool, users, jwtSecret });
  const dorm = await request(app).get('/api/items').query({category_id: '4'}).expect(200);
  assert.deepEqual(dorm.body.map(item => item.image_url).sort(), [
    '/images/products/cookware-set.jpg', '/images/products/dehumidifier.jpg', '/images/products/dinnerware-set.jpg',
    '/images/products/dish-rack.jpg', '/images/products/drying-rack.jpg'
  ]);
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
  const upload = (who, method, url, fields, bytes, contentType = 'image/png') => {
    const call = who.agent[method](url).set('X-CSRF-Token', who.token);
    for (const [key, value] of Object.entries(fields)) call.field(key, String(value));
    return call.attach('photo', bytes, { filename: 'listing-photo', contentType });
  };
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
    assert.equal(response.body[0].seller_name, seller.user.fullName);
    const detail = await request(app).get(`/api/items/${item.id}`).expect(200);
    assert.equal(detail.body.seller_name, seller.user.fullName);
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
    assert.equal(saved[0].seller_name, seller.user.fullName);
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
      VALUES (?, ?, 1, 'Big ID', '', 1.00, 'good', 'available', 'HKU', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`, [largeId, seller.user.id]);
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
    await pool.execute('INSERT INTO favorites VALUES (?, ?, CURRENT_TIMESTAMP)', [buyer.user.id, unused.id]);
    await send(seller, 'delete', `/api/items/${unused.id}`).expect(204);
    assert.equal((await pool.execute('SELECT * FROM favorites WHERE item_id=?', [unused.id]))[0].length, 0);
  });
  await t.test('photos persist, normalize, replace without stale caches, retain, clear and clean up on deletion', async () => {
    const red = await sharp({ create: { width: 1700, height: 30, channels: 3, background: '#ff0000' } }).png().toBuffer();
    const blue = await sharp({ create: { width: 30, height: 30, channels: 3, background: '#0000ff' } }).webp().toBuffer();
    let uploaded = (await upload(seller, 'post', '/api/items', data, red).expect(201)).body;
    const itemPath = `/api/items/${uploaded.id}`;
    const photoRow = async () => (await pool.execute('SELECT * FROM item_photos WHERE item_id=?', [uploaded.id]))[0][0];
    const firstUrl = uploaded.image_url;
    assert.match(firstUrl, new RegExp(`^${itemPath}/photo\\?v=[a-f0-9]{32}$`));
    assert.equal((await row('items', uploaded.id)).image_url, firstUrl);
    const first = await request(app).get(firstUrl).expect(200).expect('Content-Type', /image\/jpeg/);
    assert.match(first.headers['cache-control'], /no-cache/);
    const normalized = await sharp(first.body).metadata();
    assert.equal(normalized.width, 1600);
    assert.equal(normalized.format, 'jpeg');
    assert.deepEqual(first.body, Buffer.from((await photoRow()).jpeg_bytes));
    await request(app).get(firstUrl).set('If-None-Match', first.headers.etag).expect(304);

    await send(seller, 'patch', itemPath, { title: 'Photo retained without resending' }).expect(200);
    await send(seller, 'patch', itemPath, { image_url: firstUrl, price: '121' }).expect(200);
    assert.equal((await row('items', uploaded.id)).image_url, firstUrl);
    uploaded = (await upload(seller, 'patch', itemPath, {}, blue, 'image/webp').expect(200)).body;
    assert.notEqual(uploaded.image_url, firstUrl);
    const replaced = await request(app).get(uploaded.image_url).expect(200);
    assert.notDeepEqual(replaced.body, first.body);
    assert.notEqual(replaced.headers.etag, first.headers.etag);
    const revalidated = await request(app).get(firstUrl).set('If-None-Match', first.headers.etag).expect(200);
    assert.deepEqual(revalidated.body, replaced.body);
    await send(buyer, 'post', `${itemPath}/favorite`, {}).expect(204);
    assert.equal((await buyer.agent.get('/api/favorites').expect(200)).body[0].image_url, uploaded.image_url);

    await send(seller, 'patch', itemPath, { image_url: null }).expect(200);
    assert.equal((await row('items', uploaded.id)).image_url, null);
    assert.equal(await photoRow(), undefined);
    await request(app).get(uploaded.image_url).expect(404);
    await upload(seller, 'patch', itemPath, {}, red).expect(200);
    await send(seller, 'patch', itemPath, { image_url: '/images/products/dehumidifier.jpg' }).expect(200);
    assert.equal(await photoRow(), undefined);
    await upload(seller, 'patch', itemPath, {}, red).expect(200);
    await send(seller, 'patch', itemPath, { image_url: 'https://example.com/photo.jpg' }).expect(200);
    assert.equal(await photoRow(), undefined);
    uploaded = (await upload(seller, 'patch', itemPath, {}, red).expect(200)).body;
    await send(seller, 'delete', itemPath).expect(204);
    assert.equal(await photoRow(), undefined);
    await request(app).get(uploaded.image_url).expect(404);
    assert.equal((await pool.execute('SELECT * FROM favorites WHERE item_id=?', [uploaded.id]))[0].length, 0);
  });
  await t.test('photo permissions and invalid uploads never partially update listings or photos', async () => {
    const png = await sharp({ create: { width: 12, height: 12, channels: 3, background: '#00ff00' } }).png().toBuffer();
    const uploaded = (await upload(seller, 'post', '/api/items', data, png).expect(201)).body;
    const itemPath = `/api/items/${uploaded.id}`;
    const initial = await row('items', uploaded.id);
    const initialPhoto = Buffer.from((await pool.execute('SELECT jpeg_bytes FROM item_photos WHERE item_id=?', [uploaded.id]))[0][0].jpeg_bytes);
    await upload(buyer, 'patch', itemPath, { title: 'Stolen' }, png).expect(403);
    await seller.agent.patch(itemPath).attach('photo', Buffer.from('bad'), { filename: 'fake.png', contentType: 'image/png' }).expect(403);
    await request(app).post('/api/items').attach('photo', png, { filename: 'photo.png', contentType: 'image/png' }).expect(401);
    await send(seller, 'post', '/api/items', { ...data, image_url: uploaded.image_url }).expect(400);
    const another = await create();
    await send(seller, 'patch', `/api/items/${another.id}`, { image_url: uploaded.image_url }).expect(400);
    await upload(seller, 'patch', itemPath, { title: 'Invalid SVG' }, Buffer.from('<svg/>'), 'image/svg+xml').expect(400);
    await upload(seller, 'patch', itemPath, { title: 'Forged image' }, Buffer.from('not a PNG')).expect(400);
    await upload(seller, 'patch', itemPath, { title: 'Mismatched type' }, png, 'image/jpeg').expect(400);
    await upload(seller, 'patch', itemPath, { title: 'Oversize' }, Buffer.alloc(5 * 1024 * 1024 + 1)).expect(413);
    const hugeDimensions = await sharp({ create: { width: 5001, height: 5000, channels: 3, background: '#000000' } }).png().toBuffer();
    await upload(seller, 'patch', itemPath, {}, hugeDimensions).expect(400);
    await seller.agent.patch(itemPath).set('X-CSRF-Token', seller.token)
      .attach('photo', png, { filename: 'a.png', contentType: 'image/png' })
      .attach('photo', png, { filename: 'b.png', contentType: 'image/png' }).expect(400);
    assert.deepEqual(await row('items', uploaded.id), initial);
    assert.deepEqual(Buffer.from((await pool.execute('SELECT jpeg_bytes FROM item_photos WHERE item_id=?', [uploaded.id]))[0][0].jpeg_bytes), initialPhoto);
    const count = async (table) => String((await pool.execute(`SELECT COUNT(*) AS n FROM ${table}`))[0][0].n);
    const before = [await count('items'), await count('item_photos')];
    await upload(seller, 'post', '/api/items', { ...data, category_id: '999999' }, png).expect(409);
    assert.deepEqual([await count('items'), await count('item_photos')], before);

    const faultPool = { dialect: pool.dialect, execute: pool.execute.bind(pool), async getConnection() {
      const connection = await pool.getConnection();
      return new Proxy(connection, { get(target, key) {
        if (key === 'execute') return (sql, args) => {
          if (sql.startsWith('INSERT INTO item_photos')) {
            const error = new Error('Injected photo write failure'); error.code = 'ER_LOCK_DEADLOCK'; throw error;
          }
          return target.execute(sql, args);
        };
        return typeof target[key] === 'function' ? target[key].bind(target) : target[key];
      } });
    } };
    const faultApp = createApp({ pool: faultPool, users, jwtSecret });
    await request(faultApp).patch(itemPath).set('Cookie', seller.cookie).set('X-CSRF-Token', seller.token)
      .field('title', 'Must roll back').attach('photo', png, { filename: 'photo.png', contentType: 'image/png' }).expect(409);
    const failedCreate = request(faultApp).post('/api/items').set('Cookie', seller.cookie).set('X-CSRF-Token', seller.token);
    for (const [key, value] of Object.entries(data)) failedCreate.field(key, value);
    await failedCreate.attach('photo', png, { filename: 'photo.png', contentType: 'image/png' }).expect(409);
    assert.deepEqual([await count('items'), await count('item_photos')], before);
    assert.deepEqual(await row('items', uploaded.id), initial);
    assert.deepEqual(Buffer.from((await pool.execute('SELECT jpeg_bytes FROM item_photos WHERE item_id=?', [uploaded.id]))[0][0].jpeg_bytes), initialPhoto);
    await send(seller, 'delete', itemPath).expect(204);
    await send(seller, 'delete', `/api/items/${another.id}`).expect(204);
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
    const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#00ff00' } }).png().toBuffer();
    await upload(seller, 'patch', `/api/items/${item.id}`, {}, png).expect(409);
    assert.equal((await pool.execute('SELECT * FROM item_photos WHERE item_id=?', [item.id]))[0].length, 0);
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
}
