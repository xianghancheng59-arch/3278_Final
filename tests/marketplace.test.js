const { test } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp } = require('../src/app');
const { id, money, listing, itemQuery } = require('../src/validation');
const { transaction, canTransition } = require('../src/marketplace');

test('IDs preserve BIGINT precision and reject unsafe numbers and injection', () => {
  assert.equal(id('9223372036854775807'), '9223372036854775807');
  assert.equal(id('00042'), '42');
  for (const value of [true, null, 0, -1, '1 OR 1=1', '9223372036854775808', 9007199254740992, [], {}]) {
    assert.throws(() => id(value));
  }
});

test('prices use exact decimal strings and reject invalid precision/range', () => {
  assert.equal(money(0), '0.00');
  assert.equal(money('12.3'), '12.30');
  assert.equal(money('99999999.99'), '99999999.99');
  for (const value of [-1, '1.001', '100000000', NaN, Infinity, true, null, '1e2']) assert.throws(() => money(value));
});

test('listing validation prevents owner/status overrides and invalid MySQL text', () => {
  const data = { title: 'Book', description: '', price: '12.00', category_id: '1', item_condition: 'good', location: 'HKU' };
  assert.equal(listing(data, true).price, '12.00');
  for (const invalid of [{ ...data, seller_id: '2' }, { ...data, status: 'sold' }, { ...data, title: '' },
    { ...data, description: '字'.repeat(22000) }, { ...data, image_url: 'javascript:alert(1)' }, { ...data, price: false }]) {
    assert.throws(() => listing(invalid, true));
  }
  assert.throws(() => listing({ status: 'reserved' }));
  assert.throws(() => listing({}));
});

test('filters bind untrusted text and enforce enum, money and pagination limits', () => {
  const { sql, args } = itemQuery({ q: "' OR 1=1 --", category_id: '1', limit: '2', offset: '1' });
  assert.equal(sql.includes("' OR 1=1 --"), false);
  assert.ok(args.includes("%' OR 1=1 --%"));
  for (const query of [{ limit: '101' }, { offset: '-1' }, { offset: '9007199254740992' }, { limit: ['1', '2'] },
    { min_price: '10', max_price: '2' }, { status: 'anything' }, { condition: 'broken' }, { q: ['a'] }]) {
    assert.throws(() => itemQuery(query));
  }
});

test('complete order permission matrix', () => {
  const allowed = new Set(['seller:pending:confirmed', 'seller:pending:cancelled', 'seller:confirmed:cancelled', 'seller:confirmed:completed', 'buyer:pending:cancelled']);
  for (const role of ['seller', 'buyer', 'stranger']) {
    for (const current of ['pending', 'confirmed', 'completed', 'cancelled']) {
      for (const target of ['confirmed', 'completed', 'cancelled']) {
        assert.equal(canTransition(current, target, role === 'seller', role === 'buyer'), allowed.has(`${role}:${current}:${target}`), `${role}:${current}:${target}`);
      }
    }
  }
});

test('transaction commits success and always releases the connection', async () => {
  const events = [];
  const db = { beginTransaction: async () => events.push('begin'), commit: async () => events.push('commit'),
    rollback: async () => events.push('rollback'), release: () => events.push('release') };
  assert.equal(await transaction({ getConnection: async () => db }, async () => 'ok'), 'ok');
  assert.deepEqual(events, ['begin', 'commit', 'release']);
  events.length = 0;
  await assert.rejects(transaction({ getConnection: async () => db }, async () => { throw new Error('failure'); }));
  assert.deepEqual(events, ['begin', 'rollback', 'release']);
});

test('public requests and malformed/oversized JSON receive consistent responses', async () => {
  const pool = { execute: async () => [[]], getConnection: async () => { throw new Error('must not reach DB'); } };
  const app = createApp({ pool, users: {}, jwtSecret: 'test-key-with-at-least-thirty-two-bytes' });
  await request(app).get('/api/items').expect(200, []);
  await request(app).get('/api/categories').expect(200, []);
  await request(app).post('/api/items').send({}).expect(401);
  await request(app).get('/api/orders').expect(401);
  await request(app).get('/api/favorites').expect(401);
  await request(app).post('/api/items/1/favorite').send({}).expect(401);
  await request(app).get('/api/csrf').expect(401);
  await request(app).post('/api/items').type('json').send('{bad').expect(400);
  await request(app).post('/api/items').send({ description: 'x'.repeat(65536) }).expect(413).expect('Content-Type', /json/);
});
