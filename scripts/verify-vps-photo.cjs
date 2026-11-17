#!/usr/bin/env node
'use strict';

// Bounded HTTPS smoke test. Uses two new accounts and one temporary listing;
// never touches existing users/items. State includes secrets until finish/cleanup.
//
// node scripts/verify-vps-photo.cjs prepare --base https://47.238.127.170:8443 --state /tmp/campusswap-vps-smoke.json
// Restart the VPS application, then:
// node scripts/verify-vps-photo.cjs finish --state /tmp/campusswap-vps-smoke.json
// If prepare/finish fails, retry finish or use cleanup with the same state file.
// Accounts have no deletion API. Delete only the recorded IDs/emails from the DB
// after checking their foreign-key references. Never copy state into the repo.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const help = `Usage:
  node scripts/verify-vps-photo.cjs prepare --base HTTPS_ORIGIN --state ABSOLUTE_NEW_FILE
  node scripts/verify-vps-photo.cjs finish --state ABSOLUTE_EXISTING_FILE
  node scripts/verify-vps-photo.cjs cleanup --state ABSOLUTE_EXISTING_FILE

prepare: verify authentication and photo CRUD; leave a hidden listing for restart testing.
finish: verify persistence after the operator restarts the service, then delete the listing.
cleanup: delete only this run's listing without requiring persistence assertions.

The state file is mode0600 and contains generated passwords/session cookies until cleanup.
finish/cleanup retain only test user/item identifiers and evidence for database cleanup.
TLS certificate validation is required. No requests are retried automatically.
`;

function check(condition, message) {
  if (!condition) throw new Error(message);
}

function parseArgs() {
  const args = process.argv.slice(2);
  if (!args.length || args[0] === '--help') return null;
  const mode = args.shift();
  check(['prepare', 'finish', 'cleanup'].includes(mode), 'Unknown mode; use --help.');
  const options = { mode };
  while (args.length) {
    const key = args.shift();
    check(['--state', '--base'].includes(key) && args.length, 'Invalid arguments; use --help.');
    check(!options[key.slice(2)], 'Duplicate argument.');
    options[key.slice(2)] = args.shift();
  }
  check(options.state && path.isAbsolute(options.state), '--state must be an absolute path.');
  check(mode !== 'prepare' || options.base, 'prepare requires --base.');
  check(mode === 'prepare' || !options.base, 'finish/cleanup use the origin recorded in --state.');
  return options;
}

function httpsOrigin(value) {
  const url = new URL(value);
  check(url.protocol === 'https:' && !url.username && !url.password &&
    url.pathname === '/' && !url.search && !url.hash, 'Use a bare HTTPS origin.');
  check(process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '0', 'TLS verification must remain enabled.');
  return url.origin;
}

function sha256(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }

async function main() {
  const options = parseArgs();
  if (!options) { process.stdout.write(help); return; }
  const flags = options.mode === 'prepare'
    ? fs.constants.O_RDWR | fs.constants.O_CREAT | fs.constants.O_EXCL
    : fs.constants.O_RDWR | fs.constants.O_NOFOLLOW;
  const fd = fs.openSync(options.state, flags, 0o600);
  let state;
  try {
    const stat = fs.fstatSync(fd);
    check(stat.isFile() && (stat.mode & 0o077) === 0, 'State must be a private regular file (mode0600).');
    if (typeof process.getuid === 'function') check(stat.uid === process.getuid(), 'State must belong to the current user.');
    if (options.mode === 'prepare') {
      state = { format: 'campusswap-vps-photo-smoke-v1', base: httpsOrigin(options.base),
        startedAt: new Date().toISOString(), phase: 'preparing', actors: {}, item: null, evidence: [], requests: 0 };
    } else {
      state = JSON.parse(fs.readFileSync(fd, 'utf8'));
      check(state.format === 'campusswap-vps-photo-smoke-v1', 'Unrecognized smoke state.');
      state.base = httpsOrigin(state.base);
      check(state.phase !== 'cleaned', 'This run has already been cleaned.');
    }

    function save() {
      const bytes = Buffer.from(JSON.stringify(state, null, 2) + '\n');
      fs.writeSync(fd, bytes, 0, bytes.length, 0);
      fs.ftruncateSync(fd, bytes.length);
      fs.fsyncSync(fd);
    }
    function passed(step) {
      state.evidence.push({ step, at: new Date().toISOString() });
      save();
      console.log(`PASS ${step}`);
    }
    save();

    async function send(actor, method, route, data, expected, { csrf = true, headers: extra = {} } = {}) {
      check(++state.requests <= 100, 'Request budget exceeded; inspect the private state before continuing.');
      check(route.startsWith('/') && !route.startsWith('//'), 'Expected a same-origin API path.');
      const headers = { ...extra };
      if (actor?.cookie) headers.Cookie = actor.cookie;
      if (csrf && actor?.csrf) headers['X-CSRF-Token'] = actor.csrf;
      let body;
      if (data instanceof FormData) body = data;
      else if (data !== undefined) {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify(data);
      }
      const response = await fetch(state.base + route, {
        // Explicit no-cache uses max-age=0. Undici's default conditional-request
        // mode adds Cache-Control:no-cache, which suppresses Express's304 path.
        method, headers, body, cache: 'no-cache', redirect: 'error', signal: AbortSignal.timeout(20000)
      });
      const label = route.split('?')[0].replace(/\/items\/\d+/g, '/items/:id');
      check(response.status === expected, `${method} ${label}: expected HTTP${expected}, received HTTP${response.status}.`);
      return response;
    }
    async function json(actor, method, route, data, expected = 200, options) {
      const response = await send(actor, method, route, data, expected, options);
      return expected === 204 ? null : response.json();
    }
    function storeCookie(actor, response) {
      const cookie = response.headers.get('set-cookie') || '';
      check(/^campusswap_token=/.test(cookie), 'Authentication cookie missing.');
      check(/;\s*Secure(?:;|$)/i.test(cookie) && /;\s*HttpOnly(?:;|$)/i.test(cookie) &&
        /;\s*SameSite=Strict(?:;|$)/i.test(cookie), 'Production cookie flags are missing.');
      actor.cookie = cookie.split(';')[0];
    }
    async function token(actor) {
      const result = await json(actor, 'GET', '/api/csrf');
      check(/^[a-f0-9]{64}$/.test(result.csrf_token), 'CSRF token is malformed.');
      actor.csrf = result.csrf_token;
      save();
    }
    async function login(actor) {
      const response = await send(null, 'POST', '/api/auth/login', { email: actor.email, password: actor.password }, 200);
      storeCookie(actor, response);
      const result = await response.json();
      check(result.user.id === actor.id, 'Login returned a different account.');
      save();
      await token(actor);
    }
    async function photo(url, expected = 200, headers = {}) {
      const response = await send(null, 'GET', url, undefined, expected, { headers });
      if (expected !== 200) { await response.arrayBuffer(); return null; }
      const bytes = Buffer.from(await response.arrayBuffer());
      check(/^image\/jpeg(?:;|$)/i.test(response.headers.get('content-type') || ''), 'Uploaded photo is not served as JPEG.');
      check(bytes.length > 100 && bytes[0] === 0xff && bytes[1] === 0xd8, 'Uploaded photo has invalid JPEG bytes.');
      check(/no-cache/.test(response.headers.get('cache-control') || ''), 'Photo cache must revalidate.');
      const etag = response.headers.get('etag');
      check(/^"[a-f0-9]{32}"$/.test(etag || ''), 'Photo version ETag missing.');
      return { sha256: sha256(bytes), bytes: bytes.length, etag };
    }
    function upload(filename, fields = {}) {
      const form = new FormData();
      for (const [key, value] of Object.entries(fields)) form.set(key, String(value));
      const bytes = fs.readFileSync(path.join(__dirname, '../frontend/public/images/products', filename));
      form.set('photo', new Blob([bytes], { type: 'image/jpeg' }), filename);
      return form;
    }
    async function detail() { return json(null, 'GET', `/api/items/${state.item.id}`); }
    async function cleanup() {
      const seller = state.actors.seller;
      if (state.item && !state.item.deleted) {
        check(seller?.id && seller.password, 'Missing seller credentials; use private IDs for targeted database cleanup.');
        await login(seller);
        await json(seller, 'DELETE', `/api/items/${state.item.id}`, undefined, 204);
        state.item.deleted = true;
        save();
        await json(null, 'GET', `/api/items/${state.item.id}`, undefined, 404);
        await photo(`/api/items/${state.item.id}/photo`, 404);
        passed('delete listing and photo; both endpoints return404');
      }
      for (const actor of Object.values(state.actors)) {
        if (actor.cookie) await json(actor, 'POST', '/api/auth/logout', undefined, 204);
        delete actor.password;
        delete actor.cookie;
        delete actor.csrf;
      }
      state.phase = 'cleaned';
      state.completedAt = new Date().toISOString();
      save();
      console.log('DONE Temporary listing deleted. Exact test account IDs/emails remain only in the private state for database cleanup.');
    }

    try {
      if (options.mode === 'cleanup') { await cleanup(); return; }
      if (options.mode === 'finish') {
        check(state.phase === 'awaiting-restart' && state.item?.photo, 'prepare did not reach the restart checkpoint; use cleanup or inspect private state.');
        const seller = state.actors.seller;
        const me = await json(seller, 'GET', '/api/auth/me');
        check(me.user.id === seller.id, 'Existing session did not survive restart.');
        const persisted = await detail();
        check(persisted.title === state.item.title && persisted.price === '123.45' &&
          persisted.status === 'removed' && persisted.image_url === state.item.imageUrl, 'Listing fields changed across restart.');
        const persistedPhoto = await photo(persisted.image_url);
        check(persistedPhoto.sha256 === state.item.photo.sha256 && persistedPhoto.etag === state.item.photo.etag,
          'Photo bytes/version changed across restart.');
        passed('session, listing fields and photo bytes persist after operator restart');
        await cleanup();
        return;
      }

      const homepage = await send(null, 'GET', '/', undefined, 200);
      check(/<div[^>]+id=["']root["']/.test(await homepage.text()), 'Built React homepage is missing.');
      const categories = await json(null, 'GET', '/api/categories');
      check(categories.some(category => category.id === '2'), 'Electronics category is missing.');
      for (const filename of ['rtx-5090.jpg', 'dehumidifier.jpg']) {
        const image = await send(null, 'GET', `/images/products/${filename}`, undefined, 200);
        check(/^image\/jpeg/.test(image.headers.get('content-type') || ''), 'Reference product photo is missing.');
        await image.arrayBuffer();
      }
      passed('HTTPS homepage, database categories and both bundled photos');

      const runId = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
      for (const name of ['seller', 'other']) {
        const actor = state.actors[name] = { email: `vps-smoke.${name}.${runId}@connect.hku.hk`,
          password: crypto.randomBytes(24).toString('base64url') };
        save();
        const response = await send(null, 'POST', '/api/auth/register', {
          fullName: `Temporary VPS smoke ${name}`, email: actor.email, password: actor.password
        }, 201);
        const result = await response.json();
        actor.id = result.user.id;
        // Persist the created account ID before later checks can fail.
        save();
        storeCookie(actor, response);
        save();
        const me = await json(actor, 'GET', '/api/auth/me');
        check(me.user.id === actor.id, 'New account session is not usable.');
        await token(actor);
      }
      const { seller, other } = state.actors;
      await json(seller, 'POST', '/api/auth/logout', undefined, 204);
      delete seller.cookie;
      delete seller.csrf;
      save();
      await json(seller, 'GET', '/api/auth/me', undefined, 401);
      await login(seller);
      passed('register, secure cookies, session, logout, login and CSRF');

      const fields = { title: `Temporary VPS photo smoke ${runId}`, description: 'Temporary deployment verification; will be removed.',
        price: '100.00', category_id: '2', item_condition: 'good', location: 'HKU' };
      await json(seller, 'POST', '/api/items', fields, 403, { csrf: false });
      const created = await json(seller, 'POST', '/api/items', upload('rtx-5090.jpg', fields), 201);
      state.item = { id: created.id, title: fields.title, imageUrl: created.image_url };
      save();
      check(created.seller_id === seller.id, 'Created listing has an unexpected seller.');
      check(/^\/api\/items\/\d+\/photo\?v=[a-f0-9]{32}$/.test(created.image_url), 'Uploaded photo URL is missing.');
      check((await detail()).title === fields.title, 'Created listing cannot be read.');
      const firstPhoto = await photo(created.image_url);
      await photo(created.image_url, 304, { 'If-None-Match': firstPhoto.etag });
      await json(other, 'PATCH', `/api/items/${created.id}`, { price: '1' }, 403);
      await json(other, 'PATCH', `/api/items/${created.id}`, upload('dehumidifier.jpg'), 403);
      await json(other, 'DELETE', `/api/items/${created.id}`, undefined, 403);
      passed('create/read photo listing; conditional cache, CSRF and seller ownership');

      const replaced = await json(seller, 'PATCH', `/api/items/${created.id}`, upload('dehumidifier.jpg'));
      state.item.imageUrl = replaced.image_url;
      save();
      check(replaced.id === created.id && replaced.image_url !== created.image_url, 'Photo replacement did not retain item ID/change image version.');
      const secondPhoto = await photo(replaced.image_url);
      check(secondPhoto.sha256 !== firstPhoto.sha256 && secondPhoto.etag !== firstPhoto.etag, 'Replacement photo matches the old image.');
      const revalidated = await photo(created.image_url, 200, { 'If-None-Match': firstPhoto.etag });
      check(revalidated.sha256 === secondPhoto.sha256, 'Old image URL returns stale cached bytes.');
      const priced = await json(seller, 'PATCH', `/api/items/${created.id}`, { price: '123.45' });
      check(priced.price === '123.45' && priced.image_url === replaced.image_url, 'Price edit changed the photo.');
      check((await photo(priced.image_url)).sha256 === secondPhoto.sha256, 'Price edit changed stored image bytes.');
      passed('replace5090 with dehumidifier, refresh cache and retain photo during price update');

      const invalid = new FormData();
      invalid.set('photo', new Blob(['not an image'], { type: 'image/jpeg' }), 'fake.jpg');
      invalid.set('price', '1.00');
      await json(seller, 'PATCH', `/api/items/${created.id}`, invalid, 400);
      const unchanged = await detail();
      check(unchanged.price === '123.45' && unchanged.image_url === replaced.image_url,
        'Malformed photo partially updated the listing.');
      check((await photo(unchanged.image_url)).sha256 === secondPhoto.sha256, 'Malformed photo corrupted stored image.');
      const removed = await json(seller, 'PATCH', `/api/items/${created.id}`, { image_url: null });
      check(removed.image_url === null, 'Remove photo did not clear image_url.');
      await photo(replaced.image_url, 404);
      passed('malformed upload rolls back fields/photo; removing photo returns404');

      const restored = await json(seller, 'PATCH', `/api/items/${created.id}`, upload('dehumidifier.jpg'));
      state.item.imageUrl = restored.image_url;
      state.item.photo = await photo(restored.image_url);
      save();
      await json(seller, 'PATCH', `/api/items/${created.id}`, { status: 'removed' });
      const hidden = await detail();
      check(hidden.status === 'removed' && hidden.image_url === restored.image_url, 'Checkpoint listing was not hidden with its photo retained.');
      state.phase = 'awaiting-restart';
      state.checkpointAt = new Date().toISOString();
      passed('reupload and retain hidden listing for restart persistence verification');
      console.log('READY Restart the VPS application, then run finish with the same private state file.');
    } catch (error) {
      state.lastFailure = { at: new Date().toISOString(), message: error.message };
      save();
      throw error;
    }
  } finally { fs.closeSync(fd); }
}

main().catch(error => {
  console.error(`FAIL ${error.message}`);
  console.error('Inspect the private state for exact fixture IDs; use cleanup after resolving connectivity.');
  process.exitCode = 1;
});
