const { test } = require('node:test');
const assert = require('node:assert/strict');
const { commit, write, token, root } = require('./sale-rules-fixture.cjs');
const remove = path => ({ delete: root + '/' + path });
test('purchase deletion protects payments, receipts and linked deliveries', async () => {
  for (const [role, status, paid, transferStatus, expected] of [
    ['SUPER_ADMIN', 'DRAFT', 0, null, 200],
    ['ADMIN', 'DRAFT', 0, null, 403],
    ['SUPER_ADMIN', 'APPROVED', 0, 'IN_TRANSIT', 200],
    ['SUPER_ADMIN', 'APPROVED', 10, 'IN_TRANSIT', 403],
    ['SUPER_ADMIN', 'RECEIVED', 0, 'VALIDATED', 403],
    ['SUPER_ADMIN', 'APPROVED', 0, 'RECEIVED', 403],
  ]) {
    const purchase = { id: 'delete-test', status, amount_paid: paid, payments: paid ? [{ amount: paid }] : [], ...(transferStatus ? { transfer_id: 'delete-transfer' } : {}) };
    assert.equal((await commit([
      write('users/super', { role, status: 'ACTIVE', permissions: [], assignedStores: [] }),
      write('purchases/delete-test', purchase),
      ...(transferStatus ? [write('transfers/delete-transfer', { status: transferStatus, type: 'SUPPLIER_TO_STORE', purchase_id: 'delete-test' })] : []),
    ])).status, 200);
    if (transferStatus) assert.equal((await commit([remove('purchases/delete-test')], token)).status, 403);
    const result = await commit([remove('purchases/delete-test'), ...(transferStatus ? [remove('transfers/delete-transfer')] : [])], token);
    assert.equal(result.status, expected, JSON.stringify({ role, status, paid, transferStatus, result }));
  }
});
