const crypto = require('node:crypto');
const { Router } = require('express');
const { COOKIE_NAME } = require('./auth');
const { APIError, id, text, body, listing, itemQuery, publicRow } = require('./validation');

async function one(db, sql, args = []) {
  const [rows] = await db.execute(sql, args);
  return rows[0] || null;
}

async function transaction(pool, operation) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await operation(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function insert(db, table, values) {
  // Table/column names are supplied by this module only; every value is bound.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    values.id = ((crypto.randomBytes(8).readBigUInt64BE() & ((1n << 62n) - 1n)) + 1n).toString();
    try {
      await db.execute(`INSERT INTO ${table} (${Object.keys(values).join(',')}) VALUES (${Object.keys(values).map(() => '?').join(',')})`, Object.values(values));
      return;
    } catch (error) {
      if (error.code !== 'ER_DUP_ENTRY' || attempt === 2) throw error;
    }
  }
}

async function lockedItem(db, itemId) {
  const row = await one(db, 'SELECT * FROM items WHERE id=? FOR UPDATE', [id(itemId)]);
  if (!row) throw new APIError('Item not found', 404);
  return row;
}

function owned(row, userId) {
  if (String(row.seller_id) !== userId) throw new APIError('Seller only', 403);
}

function history(db, itemId, active = false) {
  return one(db, "SELECT id FROM orders WHERE item_id=?" + (active ? " AND status IN ('pending','confirmed')" : '') + ' LIMIT 1 FOR UPDATE', [itemId]);
}

function canTransition(current, target, seller, buyer) {
  return (seller && ({ pending: ['confirmed', 'cancelled'], confirmed: ['completed', 'cancelled'] }[current] || []).includes(target)) ||
    (buyer && current === 'pending' && target === 'cancelled');
}

function createMarketplaceRouter({ pool, requireAuth, jwtSecret }) {
  const router = Router();
  // Bind the CSRF token to A's verified auth cookie without a second session store.
  function csrfToken(req) {
    return crypto.createHmac('sha256', jwtSecret).update('campusswap-csrf\0').update(req.cookies[COOKIE_NAME]).digest('hex');
  }
  function csrf(req, res, next) {
    const supplied = req.get('X-CSRF-Token') || '';
    const expected = csrfToken(req);
    if (!/^[a-f0-9]{64}$/.test(supplied) || !crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) {
      throw new APIError('CSRF token required', 403);
    }
    next();
  }
  const write = [requireAuth, csrf];

  router.get('/csrf', requireAuth, (req, res) => {
    res.set('Cache-Control', 'no-store').json({ csrf_token: csrfToken(req) });
  });
  router.get('/categories', async (req, res) => {
    const [rows] = await pool.execute('SELECT id,name FROM categories ORDER BY id');
    res.json(rows.map(publicRow));
  });
  router.get('/items', async (req, res) => {
    const { sql, args } = itemQuery(req.query);
    const [rows] = await pool.execute(sql, args);
    res.json(rows.map(publicRow));
  });
  router.get('/items/:id', async (req, res) => {
    const row = await one(pool, 'SELECT * FROM items WHERE id=?', [id(req.params.id)]);
    if (!row) throw new APIError('Item not found', 404);
    res.json(publicRow(row));
  });
  router.post('/items', ...write, async (req, res) => {
    const values = listing(req.body, true), now = new Date();
    Object.assign(values, { seller_id: req.user.id, status: 'available', created_at: now, updated_at: now });
    await transaction(pool, (db) => insert(db, 'items', values));
    res.status(201).json(publicRow(values));
  });
  router.patch('/items/:id', ...write, async (req, res) => {
    const values = listing(req.body);
    const row = await transaction(pool, async (db) => {
      const row = await lockedItem(db, req.params.id);
      owned(row, req.user.id);
      if (['reserved', 'sold'].includes(row.status) || await history(db, row.id, true)) {
        throw new APIError('Listing locked by order', 409);
      }
      if (await one(db, "SELECT id FROM orders WHERE item_id=? AND status='completed' LIMIT 1 FOR UPDATE", [row.id])) {
        throw new APIError('Sold listing cannot change', 409);
      }
      values.updated_at = new Date();
      await db.execute(`UPDATE items SET ${Object.keys(values).map((key) => `${key}=?`).join(',')} WHERE id=?`, [...Object.values(values), row.id]);
      return { ...row, ...values };
    });
    res.json(publicRow(row));
  });
  router.delete('/items/:id', ...write, async (req, res) => {
    await transaction(pool, async (db) => {
      const row = await lockedItem(db, req.params.id);
      owned(row, req.user.id);
      if (['reserved', 'sold'].includes(row.status) || await history(db, row.id)) {
        throw new APIError('Order history prevents deletion', 409);
      }
      await db.execute('DELETE FROM favorites WHERE item_id=?', [row.id]);
      await db.execute('DELETE FROM items WHERE id=?', [row.id]);
    });
    res.status(204).end();
  });
  router.post('/orders', ...write, async (req, res) => {
    const data = body(req.body, ['item_id', 'pickup_location']);
    const itemId = id(data.item_id);
    const values = await transaction(pool, async (db) => {
      const row = await lockedItem(db, itemId);
      if (String(row.seller_id) === req.user.id) throw new APIError('Cannot buy your own listing', 403);
      if (row.status !== 'available' || await history(db, row.id, true)) throw new APIError('Item unavailable', 409);
      const now = new Date();
      const values = { buyer_id: req.user.id, item_id: row.id, agreed_amount: row.price,
        pickup_location: text(data.pickup_location === undefined ? row.location : data.pickup_location, 160),
        status: 'pending', created_at: now, updated_at: now };
      await insert(db, 'orders', values);
      await db.execute("UPDATE items SET status='reserved',updated_at=? WHERE id=?", [now, row.id]);
      return values;
    });
    res.status(201).json(publicRow(values));
  });
  router.get('/orders', requireAuth, async (req, res) => {
    const [rows] = await pool.execute('SELECT o.*,i.title,i.seller_id FROM orders o JOIN items i ON i.id=o.item_id WHERE o.buyer_id=? OR i.seller_id=? ORDER BY o.created_at DESC,o.id DESC', [req.user.id, req.user.id]);
    res.set('Cache-Control', 'no-store').json(rows.map(publicRow));
  });
  router.patch('/orders/:id/status', ...write, async (req, res) => {
    const target = body(req.body, ['status']).status, orderId = id(req.params.id);
    if (!['confirmed', 'completed', 'cancelled'].includes(target)) throw new APIError('Invalid order status');
    const result = await transaction(pool, async (db) => {
      const initial = await one(db, 'SELECT item_id FROM orders WHERE id=?', [orderId]);
      if (!initial) throw new APIError('Order not found', 404);
      // All writers lock item first, then order, to keep a consistent lock order.
      const row = await lockedItem(db, initial.item_id);
      const order = await one(db, 'SELECT * FROM orders WHERE id=? FOR UPDATE', [orderId]);
      if (!order) throw new APIError('Order not found', 404);
      const seller = String(row.seller_id) === req.user.id, buyer = String(order.buyer_id) === req.user.id;
      if (!seller && !buyer) throw new APIError('Order participant only', 403);
      if (row.status !== 'reserved' || !canTransition(order.status, target, seller, buyer)) throw new APIError('Invalid order transition', 409);
      const now = new Date(), state = { confirmed: 'reserved', cancelled: 'available', completed: 'sold' }[target];
      await db.execute('UPDATE orders SET status=?,updated_at=? WHERE id=?', [target, now, order.id]);
      await db.execute('UPDATE items SET status=?,updated_at=? WHERE id=?', [state, now, row.id]);
      return { ...order, status: target, updated_at: now };
    });
    res.json(publicRow(result));
  });
  return router;
}

module.exports = { createMarketplaceRouter, transaction, canTransition };
