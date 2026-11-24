const { test } = require('node:test');
const assert = require('node:assert/strict');
const { commit, write, token, origin, project } = require('./sale-rules-fixture.cjs');

test('production routes allow workshops and depots but deny POS in both directions', async t => {
  await fetch(origin + '/emulator/v1/projects/' + project + '/databases/(default)/documents', { method: 'DELETE', headers: { Authorization: 'Bearer owner' } });
  const seed = await commit([
    write('users/super', { role: 'SUPER_ADMIN', status: 'ACTIVE', permissions: [], assignedStores: [] }),
    ...[['lab', 'MANUFACTURER', true], ['depot', 'CENTRAL_WAREHOUSE', true], ['pos', 'POS', true], ['reseller', 'RESELLER', true], ['workshop', 'MANUFACTURER', true], ['closed', 'CENTRAL_WAREHOUSE', false]].map(([id, store_type, is_active]) => write('stores/' + id, { store_type, is_active }))
  ]);
  assert.equal(seed.status, 200, JSON.stringify(seed.body));
  const transfer = (id, destination) => ({ id, source_store_id: 'lab', destination_store_id: destination,
    type: 'MANUFACTURER_TO_CENTRAL', status: 'DRAFT', requested_by: 'super', requested_by_name: 'Super', created_at: 1,
    lines: [{ article_id: 'finished', quantity_sent: 5 }] });
  await t.test('allows production to active depot', async () => {
    const result = await commit([write('transfers/allowed', transfer('allowed', 'depot'))], token);
    assert.equal(result.status, 200, JSON.stringify(result.body));
  });
  for (const destination of ['pos', 'reseller', 'closed']) await t.test('denies production to ' + destination + ' even as super admin', async () => {
    const result = await commit([write('transfers/deny-' + destination, transfer('deny-' + destination, destination))], token);
    assert.equal(result.status, 403, JSON.stringify(result.body));
  });
  for (const [id, from, to, expected] of [
    ['workshop-route', 'lab', 'workshop', 200],
    ['workshop-reverse', 'workshop', 'lab', 200],
    ['depot-route', 'depot', 'lab', 200],
    ['pos-route', 'pos', 'lab', 403],
    ['reseller-route', 'reseller', 'lab', 403],
    ['depot-pos', 'depot', 'pos', 200]
  ]) await t.test(from + ' to ' + to + ' returns ' + expected, async () => {
    const draft = { ...transfer(id, to), source_store_id: from, type: 'STORE_TO_STORE' };
    const result = await commit([write('transfers/' + id, draft)], token);
    assert.equal(result.status, expected, JSON.stringify(result.body));
  });
  await t.test('cannot edit a depot draft to route directly to a POS', async () => {
    const result = await commit([write('transfers/allowed', { ...transfer('allowed', 'pos'), updated_at: 2 })], token);
    assert.equal(result.status, 403, JSON.stringify(result.body));
  });
  await t.test('cannot approve a legacy production-to-POS draft', async () => {
    const draft = { ...transfer('legacy', 'pos'), requested_by: 'maker' };
    assert.equal((await commit([write('transfers/legacy', draft)])).status, 200);
    const result = await commit([write('transfers/legacy', { ...draft, status: 'APPROVED', approved_by: 'super', approved_by_name: 'Super', approved_at: 2 })], token);
    assert.equal(result.status, 403, JSON.stringify(result.body));
  });
  await t.test('cannot edit a depot-to-POS draft into POS-to-production', async () => {
    const draft = { ...transfer('depot-pos', 'lab'), source_store_id: 'pos', type: 'STORE_TO_STORE', updated_at: 2 };
    const result = await commit([write('transfers/depot-pos', draft)], token);
    assert.equal(result.status, 403, JSON.stringify(result.body));
  });
  await t.test('legacy invalid transfers can still be cancelled', async () => {
    const draft = transfer('cancel', 'pos');
    assert.equal((await commit([write('transfers/cancel', draft)])).status, 200);
    const result = await commit([write('transfers/cancel', { ...draft, status: 'CANCELLED', cancelled_by: 'super', cancelled_by_name: 'Super', cancelled_at: 2, updated_at: 2 })], token);
    assert.equal(result.status, 200, JSON.stringify(result.body));
  });
  await t.test('production completion requires no depot and retains its manufacturer site', async () => {
    const draft = { id: 'production', manufacturer_store_id: 'lab', status: 'DRAFT', created_by: 'maker', consumptions: [{ article_id: 'raw', quantity: 2 }], outputs: [{ article_id: 'finished', quantity: 5 }] };
    assert.equal((await commit([write('productions/production', draft)])).status, 200);
    const result = await commit([write('productions/production', { ...draft, status: 'COMPLETED', validated_by: 'super', validated_by_name: 'Super', validated_at: 2 })], token);
    assert.equal(result.status, 200, JSON.stringify(result.body));
  });
});

test('assigned depot manager records and confirms the same receipt', async t => {
  const transfer = { id: 'depot-receipt', source_store_id: 'lab', destination_store_id: 'depot', type: 'MANUFACTURER_TO_CENTRAL', status: 'IN_TRANSIT', requested_by: 'super', approved_by: 'super', created_at: 1, lines: [{ article_id: 'finished', quantity_sent: 5, quantity_received: 0, quantity_accepted: 0, quantity_rejected: 0 }] };
  const received = { ...transfer, status: 'RECEIVED', received_by: 'super', received_by_name: 'Manager', received_at: 2, updated_at: 2, has_discrepancy: false, lines: [{ ...transfer.lines[0], quantity_received: 5, quantity_accepted: 5 }] };
  const confirmed = { ...received, status: 'VALIDATED', validated_by: 'super', validated_by_name: 'Manager', validated_at: 3, updated_at: 3 };
  const profile = { role: 'RESPONSABLE_MAGASIN', status: 'ACTIVE', permissions: [], assignedStores: ['depot'] };
  assert.equal((await commit([
    write('users/super', profile),
    write('stores/lab', { store_type: 'MANUFACTURER', is_active: true }),
    write('stores/depot', { store_type: 'CENTRAL_WAREHOUSE', is_active: true }),
    write('transfers/depot-receipt', transfer)
  ])).status, 200);
  await t.test('records receipt before confirming', async () => {
    assert.equal((await commit([write('transfers/depot-receipt', received)], token)).status, 200);
  });
  for (const [label, change] of [
    ['unassigned manager', { assignedStores: ['other'] }],
    ['disabled manager', { status: 'DISABLED' }],
    ['warehouse operator without validation permission', { role: 'MAGASINIER', permissions: ['transfers.receive'] }],
    ['warehouse operator confirming own receipt', { role: 'MAGASINIER', permissions: ['transfers.validate'] }]
  ]) await t.test('denies ' + label, async () => {
    assert.equal((await commit([write('users/super', { ...profile, ...change })])).status, 200);
    assert.equal((await commit([write('transfers/depot-receipt', confirmed)], token)).status, 403);
  });
  await t.test('assigned manager confirms once and cannot change recorded quantities', async () => {
    assert.equal((await commit([write('users/super', profile)])).status, 200);
    assert.equal((await commit([write('transfers/depot-receipt', { ...confirmed, lines: [{ ...received.lines[0], quantity_accepted: 4 }] })], token)).status, 403);
    assert.equal((await commit([write('transfers/depot-receipt', confirmed)], token)).status, 200);
    assert.equal((await commit([write('transfers/depot-receipt', { ...confirmed, updated_at: 4 })], token)).status, 403);
  });
});

test('transfer receipt permissions are inherited by role and scoped to the destination', async t => {
  const transfer = {
    id: 'role-receipt', source_store_id: 'lab', destination_store_id: 'workshop',
    type: 'STORE_TO_STORE', status: 'IN_TRANSIT', requested_by: 'requester', approved_by: 'approver', created_at: 1,
    lines: [{ article_id: 'finished', quantity_sent: 5 }],
  };
  const received = {
    ...transfer, status: 'RECEIVED', received_by: 'super', has_discrepancy: false,
    lines: [{ ...transfer.lines[0], quantity_received: 5, quantity_accepted: 5 }],
  };
  const validated = { ...received, status: 'VALIDATED', validated_by: 'super' };
  for (const [role, assignedStores, expected] of [
    ['SUPER_ADMIN', [], 200], ['ADMIN', [], 200],
    ['RESPONSABLE_MAGASIN', ['workshop'], 200], ['PRODUCTION', ['workshop'], 200],
    ['RESPONSABLE_MAGASIN', ['lab'], 403], ['PRODUCTION', ['lab'], 403],
    ['MAGASINIER', ['workshop'], 403],
  ]) {
    await t.test(`${role} with assignments [${assignedStores}] returns ${expected}`, async () => {
      assert.equal((await commit([
        write('users/super', { role, status: 'ACTIVE', permissions: [], assignedStores }),
        write('stores/workshop', { store_type: 'MANUFACTURER', is_active: true }),
        write('transfers/role-receipt', transfer),
      ])).status, 200);
      const receipt = await commit([write('transfers/role-receipt', received)], token);
      assert.equal(receipt.status, expected, JSON.stringify(receipt.body));
      if (expected === 403) assert.equal((await commit([write('transfers/role-receipt', received)])).status, 200);
      const validation = await commit([write('transfers/role-receipt', validated)], token);
      assert.equal(validation.status, expected, JSON.stringify(validation.body));
    });
  }
});
