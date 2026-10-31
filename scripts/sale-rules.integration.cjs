const { test } = require('node:test');
const assert = require('node:assert/strict');
const { run, commit, write, token, origin, root, project } = require('./sale-rules-fixture.cjs');

test('sale validation honors roles, store scope, and rule limits atomically', async t => {
  await t.test('active super admin with only five explicit permissions validates 18 POS articles', async () => {
    assert.equal(await run(18), 200);
  });
  await t.test('warehouse sale supports 50 distinct articles', async () => {
    assert.equal(await run(50, 'CENTRAL_WAREHOUSE'), 200);
  });
  await t.test('active admin inherits validation permissions', async () => {
    assert.equal(await run(18, 'POS', { role: 'ADMIN', permissions: [] }), 200);
  });
  await t.test('authorized shop manager validates 18 articles', async () => {
    assert.equal(await run(18, 'POS', { role: 'RESPONSABLE_MAGASIN', permissions: ['sales.view', 'sales.validate'], stores: ['store'] }), 200);
  });
  await t.test('disabled super admin is denied', async () => {
    assert.equal(await run(18, 'POS', { status: 'DISABLED' }), 403);
  });
  await t.test('manager outside the assigned store is denied', async () => {
    assert.equal(await run(18, 'POS', { role: 'RESPONSABLE_MAGASIN', permissions: ['sales.validate'], stores: ['other'] }), 403);
  });
  await t.test('seller without stock validation permissions is denied', async () => {
    assert.equal(await run(18, 'POS', { role: 'VENDEUR', permissions: ['sales.view', 'sales.create'], stores: ['store'] }), 403);
    const response = await fetch(`${origin}/v1/${root}/sales/sale`, { headers: { Authorization: 'Bearer owner' } });
    assert.equal((await response.json()).fields.status.stringValue, 'VERIFIED');
  });
  await t.test('even a super admin cannot sell raw materials from a POS store', async () => {
    assert.equal(await run(1, 'POS', { articleType: 'RAW_MATERIAL' }), 403);
  });
  await t.test('missing profile cannot read stores or elevate itself during signup', async () => {
    await fetch(`${origin}/emulator/v1/projects/${project}/databases/(default)/documents`, { method: 'DELETE', headers: { Authorization: 'Bearer owner' } });
    await commit([write('stores/store', { store_type: 'POS' })]);
    const response = await fetch(`${origin}/v1/${root}/stores/store`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(response.status, 403);
    assert.equal((await commit([write('users/super', { email: 'test@example.test', role: 'SUPER_ADMIN', status: 'ACTIVE', permissions: [], assignedStores: [] })], token)).status, 403);
    assert.equal((await commit([write('users/super', { email: 'test@example.test', role: null, status: 'PENDING', permissions: [], assignedStores: [] })], token)).status, 200);
  });
});
