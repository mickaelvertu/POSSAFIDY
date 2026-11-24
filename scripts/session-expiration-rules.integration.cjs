const { test } = require('node:test');
const assert = require('node:assert/strict');
const { commit, write, token, origin, root } = require('./sale-rules-fixture.cjs');

test('server requires a fresh sign-in after four hours even with a refreshed token', async () => {
  assert.equal((await commit([write('users/super', { role: 'SUPER_ADMIN', status: 'ACTIVE' })])).status, 200);
  const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
  const jwt = payload => Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url') + '.' + Buffer.from(JSON.stringify(payload)).toString('base64url') + '.';
  const read = async auth => (await fetch(`${origin}/v1/${root}/users/super`, { headers: { Authorization: `Bearer ${auth}` } })).status;
  assert.equal(await read(token), 200);
  const now = Math.floor(Date.now() / 1000);
  assert.equal(await read(jwt({ ...claims, auth_time: now - 14401, iat: now, exp: now + 3600 })), 403);
  const missingAuthTime = { ...claims }; delete missingAuthTime.auth_time;
  assert.equal(await read(jwt(missingAuthTime)), 403);
});

test('article visibility is assigned by an administrator, including for new accounts', async () => {
  const uid = 'visibility-profile';
  const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
  const selfToken = token.split('.')[0] + '.' +
    Buffer.from(JSON.stringify({ ...claims, sub: uid, user_id: uid })).toString('base64url') + '.';
  const path = 'users/' + uid;
  const pending = { uid, email: 'profile@example.test', status: 'PENDING', role: null, permissions: [], assignedStores: [] };
  const unrestricted = { ...pending, visibleArticleTypes: ['RAW_MATERIAL'] };
  assert.equal((await commit([write(path, unrestricted)], selfToken)).status, 403);
  assert.equal((await commit([write(path, pending)], selfToken)).status, 200);
  assert.equal((await commit([write(path, unrestricted)], selfToken)).status, 403);

  const active = { ...pending, role: 'VENDEUR', status: 'ACTIVE', visibleArticleTypes: ['RESALE'] };
  assert.equal((await commit([write('users/super', { role: 'SUPER_ADMIN', status: 'ACTIVE' })])).status, 200);
  assert.equal((await commit([write(path, active)], token)).status, 200);
  assert.equal((await commit([write(path, { ...active, firstName: 'Test' })], selfToken)).status, 200);
  assert.equal((await commit([write(path, { ...active, visibleArticleTypes: ['RESALE', 'RAW_MATERIAL'] })], selfToken)).status, 403);
  assert.equal((await commit([write(path, { ...active, visibleArticleTypes: undefined })], selfToken)).status, 403);
});
