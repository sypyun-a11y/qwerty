const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createAuthHandler, createStateHandler, createSessionToken } = require('../api/_lib.cjs');

function response() {
  return {
    statusCode: 0,
    headers: {},
    body: null,
    setHeader(name, value) { this.headers[name] = value; },
    end(value) { this.body = value ? JSON.parse(value) : null; },
  };
}

function dbHarness(initial = { version: 0, data: { items: [], events: [], memos: [] } }) {
  let state = structuredClone(initial);
  return {
    async ensure() {},
    async read() { return structuredClone(state); },
    async write(next, expectedVersion) {
      if (state.version !== expectedVersion) return null;
      state = { version: state.version + 1, data: structuredClone(next) };
      return structuredClone(state);
    },
  };
}

test('auth rejects a wrong password and does not set a session cookie', async () => {
  const handler = createAuthHandler({ password: '5449', secret: 'test-secret' });
  const res = response();
  await handler({ method: 'POST', body: JSON.stringify({ password: 'wrong' }), headers: {} }, res);
  assert.equal(res.statusCode, 401);
  assert.equal(res.headers['Set-Cookie'], undefined);
});

test('auth accepts the configured password and sets an HttpOnly admin session cookie', async () => {
  const handler = createAuthHandler({ password: '5449', secret: 'test-secret' });
  const res = response();
  await handler({ method: 'POST', body: JSON.stringify({ password: '5449', role: 'admin' }), headers: {} }, res);
  assert.equal(res.statusCode, 200);
  assert.match(res.headers['Set-Cookie'], /qwerty_session=/);
  assert.match(res.headers['Set-Cookie'], /HttpOnly/);
  assert.deepEqual(res.body, { ok: true, role: 'admin' });
});

test('state GET requires a valid session and returns the shared versioned state', async () => {
  const db = dbHarness({ version: 7, data: { items: [{ id: 'a' }], events: [], memos: [] } });
  const handler = createStateHandler({ db, secret: 'test-secret' });
  const unauthenticated = response();
  await handler({ method: 'GET', headers: {} }, unauthenticated);
  assert.equal(unauthenticated.statusCode, 401);

  const token = createSessionToken({ role: 'viewer' }, 'test-secret');
  const authenticated = response();
  await handler({ method: 'GET', headers: { cookie: `qwerty_session=${token}` } }, authenticated);
  assert.equal(authenticated.statusCode, 200);
  assert.deepEqual(authenticated.body, { version: 7, data: { items: [{ id: 'a' }], events: [], memos: [] } });
});

test('state POST is admin-only and rejects stale optimistic versions', async () => {
  const db = dbHarness({ version: 2, data: { items: [], events: [], memos: [] } });
  const handler = createStateHandler({ db, secret: 'test-secret' });
  const viewerToken = createSessionToken({ role: 'viewer' }, 'test-secret');
  const viewerRes = response();
  await handler({ method: 'POST', headers: { cookie: `qwerty_session=${viewerToken}` }, body: JSON.stringify({ version: 2, data: { items: [{ id: 'blocked' }] } }) }, viewerRes);
  assert.equal(viewerRes.statusCode, 403);

  const adminToken = createSessionToken({ role: 'admin' }, 'test-secret');
  const staleRes = response();
  await handler({ method: 'POST', headers: { cookie: `qwerty_session=${adminToken}` }, body: JSON.stringify({ version: 1, data: { items: [{ id: 'stale' }] } }) }, staleRes);
  assert.equal(staleRes.statusCode, 409);
  assert.equal(staleRes.body.version, 2);

  const okRes = response();
  await handler({ method: 'POST', headers: { cookie: `qwerty_session=${adminToken}` }, body: JSON.stringify({ version: 2, data: { items: [{ id: 'saved' }], events: [], memos: [] } }) }, okRes);
  assert.equal(okRes.statusCode, 200);
  assert.equal(okRes.body.version, 3);
});
