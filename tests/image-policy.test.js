const { test } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp } = require('../src/app');

test('page policy permits local and HTTPS listing photos while retaining script and object restrictions', async () => {
  const app = createApp({
    users: { async findPublicById() { return null; } },
    jwtSecret: 'image-policy-test-secret-at-least-32-bytes'
  });
  const response = await request(app).get('/').expect(200);
  const header = response.headers['content-security-policy'];
  assert.ok(header, 'HTML responses must carry a content security policy');
  const directives = Object.fromEntries(header.split(';').map((directive) => {
    const [name, ...sources] = directive.trim().split(/\s+/);
    return [name, sources];
  }));

  assert.ok(directives['img-src'].includes("'self'"), 'bundled /images/products assets must load');
  assert.ok(directives['img-src'].includes('https:'), 'HTTPS seed and user listing photos must load');
  assert.ok(directives['img-src'].includes('blob:'), 'local upload previews must load');
  assert.ok(!directives['img-src'].includes('*'), 'image access must not allow every scheme');
  assert.deepEqual(directives['script-src'], ["'self'"]);
  assert.deepEqual(directives['script-src-attr'], ["'none'"]);
  assert.deepEqual(directives['object-src'], ["'none'"]);
});
