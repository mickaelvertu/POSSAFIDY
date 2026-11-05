const { test } = require('node:test');
const assert = require('node:assert/strict');
const { commit, write, token } = require('./sale-rules-fixture.cjs');

test('DEP declarations require an assigned responsible or an administrator', async () => {
  const cases = [
    ['RESPONSABLE_MAGASIN', ['dep'], 'ACTIVE', ['cash_handover.create'], 'CENTRAL_WAREHOUSE', 200],
    ['RESPONSABLE_MAGASIN', [], 'ACTIVE', ['cash_handover.create'], 'CENTRAL_WAREHOUSE', 403],
    ['ADMIN', [], 'ACTIVE', [], 'CENTRAL_WAREHOUSE', 200],
    ['SUPER_ADMIN', [], 'ACTIVE', [], 'CENTRAL_WAREHOUSE', 200],
    ['MAGASINIER', ['dep'], 'ACTIVE', ['cash_handover.create'], 'CENTRAL_WAREHOUSE', 403],
    ['RESPONSABLE_MAGASIN', ['dep'], 'INACTIVE', ['cash_handover.create'], 'CENTRAL_WAREHOUSE', 403],
    ['RESPONSABLE_MAGASIN', ['dep'], 'ACTIVE', [], 'CENTRAL_WAREHOUSE', 403],
    ['ADMIN', [], 'ACTIVE', [], 'MANUFACTURER', 403],
    ['RESPONSABLE_MAGASIN', ['dep'], 'ACTIVE', ['cash_handover.create'], 'POS', 200],
  ];
  for (const [i, [role, assignedStores, status, permissions, storeType, expected]] of cases.entries()) {
    const receipt = { id: `role-receipt-${i}`, sale_id: 'seeded', store_id: 'dep', amount: 100, method: 'CASH',
      paid_at: 1, business_date: '2026-11-05', collected_by: 'super', collected_by_name: 'Test',
      recorded_by: 'super', recorded_by_name: 'Test', destination: 'HANDOVER', handover_id: '' };
    assert.equal((await commit([
      write('users/super', { role, assignedStores, status, permissions }),
      write('stores/dep', { store_type: storeType, is_active: true }),
      write(`resellerReceipts/${receipt.id}`, receipt),
    ])).status, 200);
    const id = `dep-declaration-${i}`;
    const result = await commit([write(`cashHandovers/${id}`, {
      id, handover_number: id, store_id: 'dep', store_name: 'DEP', business_date: '2026-11-05',
      expected_cash_sales: 100, cash_sale_count: 1, declared_amount: 100,
      declared_by: 'super', declared_by_name: 'Test', declared_at: 1,
      status: 'DECLARED', deposited_amount: 0, deposits: [], receipt_ids: [receipt.id],
    }), write(`resellerReceipts/${receipt.id}`, { ...receipt, handover_id: id })], token);
    assert.equal(result.status, expected, `${role}, ${storeType}, ${status}: ${JSON.stringify(result.body)}`);
  }
});
