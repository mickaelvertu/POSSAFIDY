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
