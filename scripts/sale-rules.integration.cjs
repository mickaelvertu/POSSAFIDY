const { test } = require('node:test');
const assert = require('node:assert/strict');
const { run, commit, write, token, origin, root, project } = require('./sale-rules-fixture.cjs');

test('sale validation honors roles, store scope, and rule limits atomically', async t => {
  for (const count of [31, 50, 100]) await t.test(`POS validates ${count} distinct articles with shared catalog checks`, async () => {
    assert.equal(await run(count, 'POS', { checked: true }), 200);
  });
  await t.test('assigned manager validates 100 POS products with only sale permissions', async () => {
    assert.equal(await run(100, 'POS', { checked: true, role: 'RESPONSABLE_MAGASIN', permissions: ['sales.view', 'sales.validate'], stores: ['store'] }), 200);
  });
  await t.test('reseller shop validates 50 products', async () => {
    assert.equal(await run(50, 'RESELLER', { checked: true }), 200);
  });
  await t.test('checked validation still denies raw material and unassigned stores', async () => {
    assert.equal(await run(31, 'POS', { checked: true, articleType: 'RAW_MATERIAL' }), 403);
    assert.equal(await run(31, 'POS', { checked: true, role: 'RESPONSABLE_MAGASIN', permissions: ['sales.view', 'sales.validate'], stores: ['other'] }), 403);
  });
  await t.test('stale catalog checks cannot debit any stock', async () => {
    // The emulator can report INTERNAL for a large commit with many denied writes.
    assert.ok([403, 500].includes(await run(31, 'POS', { checked: true, stale: true })));
    const response = await fetch(`${origin}/v1/${root}/stocks/stock-article-0`, { headers: { Authorization: 'Bearer owner' } });
    assert.equal((await response.json()).fields.quantity.integerValue, '100');
  });
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
  await t.test('sale finalization rejects edit-only and out-of-store users before stock writes', async () => {
    assert.equal(await run(1, 'POS', {
      statusOnly: true, role: 'VENDEUR', permissions: ['sales.view', 'sales.edit'], stores: ['store']
    }), 403);
    assert.equal(await run(1, 'POS', {
      statusOnly: true, role: 'RESPONSABLE_MAGASIN', permissions: ['sales.view', 'sales.validate'], stores: ['other']
    }), 403);
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

test('draft receipt corrections enforce ownership and payment consistency', async () => {
  const sale = { id: 'draft-correction', sale_number: 'DRAFT-CORRECTION', store_id: 'store', customer_type: 'PARTICULIER', customer_name: 'Client', seller_id: 'super', seller_name: 'Seller', status: 'DRAFT', created_at: 1, subtotal: 100, discount: 0, tax: 0, total: 100, amount_paid: 100, payment_method: 'CASH', payment_status: 'PAID', change_returned: 0, lines: [{ article_id: 'article', quantity: 1, total: 100, unit_price: 100, discount: 0 }] };
  assert.equal((await commit([
    write('users/super', { role: 'VENDEUR', status: 'ACTIVE', permissions: ['sales.view', 'sales.create'], assignedStores: ['store'] }),
    write('stores/store', { store_type: 'POS', is_active: true }),
    write('sales/draft-correction', sale)
  ])).status, 200);
  const corrected = { ...sale, amount_paid: 150, change_returned: 50 };
  assert.equal((await commit([write('sales/draft-correction', corrected)], token)).status, 200);
  assert.equal((await commit([write('sales/draft-correction', { ...corrected, amount_paid: -1 })], token)).status, 403);
  assert.equal((await commit([write('sales/draft-correction', { ...corrected, payment_status: 'PENDING' })], token)).status, 403);
  assert.equal((await commit([write('sales/draft-correction', { ...corrected, change_returned: 0 })], token)).status, 403);
  assert.equal((await commit([write('sales/draft-correction', { ...sale, seller_id: 'other' })])).status, 200);
  assert.equal((await commit([write('sales/draft-correction', { ...corrected, seller_id: 'other' })], token)).status, 403);
  assert.equal((await commit([write('sales/draft-correction', { ...sale, status: 'VALIDATED' })])).status, 200);
  assert.equal((await commit([write('sales/draft-correction', { ...corrected, status: 'VALIDATED' })], token)).status, 403);
});
