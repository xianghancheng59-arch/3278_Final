class APIError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function id(value) {
  if ((typeof value !== 'string' && typeof value !== 'number') ||
      (typeof value === 'number' && !Number.isSafeInteger(value))) {
    throw new APIError('Invalid ID');
  }
  const raw = String(value);
  if (!/^[0-9]{1,19}$/.test(raw) || BigInt(raw) < 1n || BigInt(raw) >= 2n ** 63n) {
    throw new APIError('Invalid ID');
  }
  return BigInt(raw).toString();
}

function money(value) {
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new APIError('Invalid price');
  }
  const raw = String(value).trim();
  if (!/^\d{1,8}(\.\d{1,2})?$/.test(raw)) {
    throw new APIError('Price must be non-negative with at most two decimal places');
  }
  const [whole, fraction = ''] = raw.split('.');
  return `${BigInt(whole)}.${fraction.padEnd(2, '0')}`;
}

function text(value, limit, required = true) {
  if (typeof value !== 'string' || [...value].length > limit || (required && !value.trim())) {
    throw new APIError('Invalid text field');
  }
  return value.trim();
}

function body(value, allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).some((key) => !allowed.includes(key))) {
    throw new APIError('Invalid JSON fields');
  }
  return value;
}

const conditions = ['new', 'like_new', 'good', 'fair'];
const states = ['available', 'reserved', 'sold', 'removed'];
const fields = ['title', 'description', 'price', 'item_condition', 'category_id', 'location', 'image_url'];

function listing(value, creating = false) {
  const data = body(value, creating ? fields : [...fields, 'status']);
  if (creating && fields.filter((key) => key !== 'image_url').some((key) => !(key in data))) {
    throw new APIError('Missing listing fields');
  }
  const out = {};
  for (const [key, value] of Object.entries(data)) {
    if (key === 'price') out[key] = money(value);
    else if (key === 'category_id') out[key] = id(value);
    else if (key === 'item_condition') {
      if (!conditions.includes(value)) throw new APIError('Invalid condition');
      out[key] = value;
    } else if (key === 'status') {
      if (!['available', 'removed'].includes(value)) throw new APIError('Reserved/sold status is managed by orders');
      out[key] = value;
    } else if (key === 'image_url') {
      out[key] = value === null ? null : text(value, 2048, false);
      if (out[key]) {
        let url;
        try { url = new URL(out[key]); } catch { throw new APIError('Invalid image URL'); }
        if (!['https:', 'http:'].includes(url.protocol)) throw new APIError('Invalid image URL');
      }
    } else {
      out[key] = text(value, key === 'description' ? 65535 : 160, key !== 'description');
      if (key === 'description' && Buffer.byteLength(out[key], 'utf8') > 65535) {
        throw new APIError('Description exceeds MySQL TEXT byte limit');
      }
    }
  }
  if (!Object.keys(out).length) throw new APIError('No changes supplied');
  return out;
}

function itemQuery(query) {
  const clauses = [], args = [];
  for (const [key, column] of [['category_id', 'category_id'], ['seller_id', 'seller_id'], ['condition', 'item_condition'], ['status', 'status']]) {
    if (query[key] === undefined) continue;
    let value = query[key];
    if (key.endsWith('_id')) value = id(value);
    if (key === 'condition' && !conditions.includes(value)) throw new APIError('Invalid condition filter');
    if (key === 'status' && !states.includes(value)) throw new APIError('Invalid status filter');
    clauses.push(`${column}=?`);
    args.push(value);
  }
  if (query.status === undefined) clauses.push("status='available'");
  if (query.q !== undefined) {
    const q = text(query.q, 160, false);
    clauses.push('(title LIKE ? OR description LIKE ?)');
    args.push(`%${q}%`, `%${q}%`);
  }
  for (const [key, op] of [['min_price', '>='], ['max_price', '<=']]) {
    if (query[key] !== undefined) {
      clauses.push(`price${op}?`);
      args.push(money(query[key]));
    }
  }
  if (query.min_price !== undefined && query.max_price !== undefined &&
      BigInt(money(query.min_price).replace('.', '')) > BigInt(money(query.max_price).replace('.', ''))) {
    throw new APIError('min_price exceeds max_price');
  }
  const limit = query.limit ?? '50', offset = query.offset ?? '0';
  if (typeof limit !== 'string' || typeof offset !== 'string' || !/^\d+$/.test(limit) || !/^\d+$/.test(offset) ||
      !Number.isSafeInteger(Number(offset)) || Number(limit) < 1 || Number(limit) > 100) {
    throw new APIError('Invalid pagination');
  }
  // Pass LIMIT/OFFSET as strings: MySQL can reject double-typed execute() parameters here.
  args.push(String(Number(limit)), String(Number(offset)));
  return { sql: `SELECT * FROM items WHERE ${clauses.join(' AND ')} ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?`, args };
}

function publicRow(row) {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key,
    value === null ? null : (key === 'id' || key.endsWith('_id') || key === 'price' || key === 'agreed_amount')
      ? String(value) : value]));
}

module.exports = { APIError, id, money, text, body, listing, itemQuery, publicRow };
