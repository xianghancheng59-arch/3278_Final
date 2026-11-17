// Exercise the deployed HTTP server and independently check its MySQL rows.
// Only runs against an explicitly named local review database. Retains demo
// accounts and a cancelled order; the fixture listing is hidden from browsing.
require('dotenv').config();
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createPool } = require('../src/db');
const base = process.env.REVIEW_BASE_URL || 'http://127.0.0.1:3001';
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(base).hostname), 'Local review server required');
assert.match(process.env.MYSQL_DATABASE || '', /^campusswap_review_/, 'Review database required');
const evidence = [];
function record(step, result) { evidence.push({ step, ...result }); console.log('PASS', step, JSON.stringify(result)); }
async function call(actor, method, path, data, expected) {
  const headers = { 'Content-Type': 'application/json' };
  if (actor.cookie) headers.Cookie = actor.cookie;
  if (actor.csrf) headers['X-CSRF-Token'] = actor.csrf;
  const response = await fetch(base + path, { method, headers, body: data === undefined ? undefined : JSON.stringify(data) });
  const value = response.status === 204 ? null : await response.json();
  assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(value)}`);
  if (response.headers.get('set-cookie')) actor.cookie = response.headers.get('set-cookie').split(';')[0];
  return value;
}
(async () => {
  const pool = createPool();
  const stamp = Date.now();
  const seller = {}, buyer = {};
  const password = 'Local-CRUD-Review-1117!';
  try {
    for (const [name, actor] of [['seller', seller], ['buyer', buyer]]) {
      actor.email = `review.${name}.${stamp}@connect.hku.hk`;
      actor.user = (await call(actor, 'POST', '/api/auth/register', { fullName: `Review ${name}`, email: actor.email, password }, 201)).user;
      actor.csrf = (await call(actor, 'GET', '/api/csrf', undefined, 200)).csrf_token;
    }
    const draft = { title: `HTTP CRUD ${stamp}`, description: 'Disposable CRUD verification item', price: '150.00', category_id: '1', item_condition: 'good', location: 'Main Library' };
    const item = await call(seller, 'POST', '/api/items', draft, 201);
    const dbRow = async () => (await pool.execute('SELECT id,title,price,status FROM items WHERE id=?', [item.id]))[0][0];
    assert.equal((await dbRow()).price, '150.00');
    record('CREATE: HTTP 201 and MySQL row', { id: item.id, price: '150.00' });
    assert.equal((await call({}, 'GET', `/api/items/${item.id}`, undefined, 200)).title, draft.title);
    const search = await call({}, 'GET', '/api/items?q=' + encodeURIComponent(draft.title) + '&category_id=1&min_price=150&max_price=150', undefined, 200);
    assert.ok(search.some(row => row.id === item.id));
    record('READ: detail and combined search filters', { id: item.id });
    await call(buyer, 'PATCH', `/api/items/${item.id}`, { price: '1' }, 403);
    await call(buyer, 'DELETE', `/api/items/${item.id}`, undefined, 403);
    await call(seller, 'PATCH', `/api/items/${item.id}`, { price: '120.00' }, 200);
    assert.equal((await dbRow()).price, '120.00');
    record('UPDATE: same MySQL row; non-owner rejected', { id: item.id, price: '120.00' });
    await call(buyer, 'POST', `/api/items/${item.id}/favorite`, {}, 204);
    assert.ok((await call(buyer, 'GET', '/api/favorites', undefined, 200)).some(row => row.id === item.id));
    await call(seller, 'DELETE', `/api/items/${item.id}`, undefined, 204);
    assert.equal(await dbRow(), undefined);
    assert.equal((await pool.execute('SELECT * FROM favorites WHERE item_id=?', [item.id]))[0].length, 0);
    await call({}, 'GET', `/api/items/${item.id}`, undefined, 404);
    record('DELETE: MySQL row/favorites gone, detail HTTP 404', { id: item.id });
    const orderItem = await call(seller, 'POST', '/api/items', { ...draft, title: `Order history demo ${stamp}` }, 201);
    const order = await call(buyer, 'POST', '/api/orders', { item_id: orderItem.id }, 201);
    await call(seller, 'PATCH', `/api/orders/${order.id}/status`, { status: 'confirmed' }, 200);
    await call(seller, 'PATCH', `/api/orders/${order.id}/status`, { status: 'cancelled' }, 200);
    assert.equal((await call({}, 'GET', `/api/items/${orderItem.id}`, undefined, 200)).status, 'available');
    await call(seller, 'DELETE', `/api/items/${orderItem.id}`, undefined, 409);
    await call(seller, 'PATCH', `/api/items/${orderItem.id}`, { status: 'removed' }, 200);
    record('ORDER: confirm/cancel and historical-order deletion protection', { itemId: orderItem.id, orderId: order.id });
    await call(seller, 'POST', '/api/auth/logout', {}, 204);
    await call(seller, 'GET', '/api/auth/me', undefined, 401);
    await call(seller, 'POST', '/api/auth/login', { email: seller.email, password }, 200);
    await call(seller, 'GET', '/api/auth/me', undefined, 200);
    record('AUTH: logout and fresh login', { passed: true });
    fs.mkdirSync('review', { recursive: true });
    fs.writeFileSync('review/http-crud-evidence.json', JSON.stringify({ base, database: process.env.MYSQL_DATABASE, evidence }, null, 2) + '\n');
  } finally { await pool.end(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
