const { test } = require('node:test');
const assert = require('node:assert/strict');
const { commit, write, token, origin, root, project } = require('./sale-rules-fixture.cjs');

const expense = (id, store = 'shop', author = 'other', status = 'VALIDATED') => ({
  id, expense_number: id, category: 'RENT', description: 'Loyer', amount: 1000,
  expense_date: 1, created_at: 1, store_id: store, created_by: author,
  status, payment_status: 'PAID', payment_method: 'CASH',
});
async function seed(role, permissions = [], assignedStores = ['shop'], status = 'ACTIVE') {
  await fetch(`${origin}/emulator/v1/projects/${project}/databases/(default)/documents`, { method: 'DELETE', headers: { Authorization: 'Bearer owner' } });
  const result = await commit([
    write('users/super', { role, permissions, assignedStores, status }),
    write('expenses/store', expense('store')),
    write('expenses/draft', expense('draft', 'shop', 'other', 'DRAFT')),
    write('expenses/outside', expense('outside', 'outside')),
    write('expenses/own', expense('own', 'outside', 'super', 'DRAFT')),
    write('expenses/global', expense('global', null)),
  ]);
  assert.equal(result.status, 200);
}
async function queryExpenses(filters = []) {
  const clauses = filters.map(([field, value]) => ({ fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: { stringValue: value } } }));
  return fetch(`${origin}/v1/${root}:runQuery`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'expenses' }], ...(clauses.length ? { where: clauses.length === 1 ? clauses[0] : { compositeFilter: { op: 'AND', filters: clauses } } } : {}) } }),
  });
}
test('expense queries match roles, stores, authors and cash reconciliation', async t => {
  for (const role of ['ADMIN', 'SUPER_ADMIN']) await t.test(`${role} reads all expenses without assigned stores or explicit permissions`, async () => {
    await seed(role, [], []);
    const result = await queryExpenses();
    assert.equal(result.status, 200, await result.text());
  });
  for (const permission of ['expenses.view', 'expenses.create']) await t.test(`${permission} reads assigned stores and own records, never all stores`, async () => {
    await seed('COMPTABLE', [permission]);
    assert.equal((await queryExpenses([['store_id', 'shop']])).status, 200);
    assert.equal((await queryExpenses([['created_by', 'super']])).status, 200);
    assert.equal((await queryExpenses([['store_id', 'outside']])).status, 403);
    assert.equal((await queryExpenses()).status, 403);
    const own = expense('new', 'shop', 'super', 'DRAFT');
    assert.equal((await commit([write('expenses/new', own)], token)).status, permission === 'expenses.create' ? 200 : 403);
    if (permission === 'expenses.create') {
      const edited = { ...own, amount: 2000 };
      assert.equal((await commit([write('expenses/new', edited)], token)).status, 200);
      assert.equal((await commit([write('expenses/new', { ...edited, status: 'VALIDATED', validated_by: 'super', validated_at: 2 })], token)).status, 200);
      assert.equal((await commit([write('expenses/new', { ...edited, status: 'DRAFT' })], token)).status, 403);
    }
    assert.equal((await commit([write('expenses/draft', { ...expense('draft', 'shop', 'other', 'DRAFT'), amount: 2000 })], token)).status, 403);
    assert.equal((await commit([write('expenses/own', { ...expense('own', 'outside', 'super', 'DRAFT'), status: 'VALIDATED', validated_by: 'super', validated_at: 2 })], token)).status, 403);
  });
  for (const permission of ['cash_handover.view', 'cash_handover.create', 'cash_handover.receive', 'cash_handover.deposit']) await t.test(`${permission} reads only validated expenses in assigned stores`, async () => {
    await seed('RESPONSABLE_MAGASIN', [permission]);
    assert.equal((await queryExpenses([['store_id', 'shop'], ['status', 'VALIDATED']])).status, 200);
    assert.equal((await queryExpenses([['store_id', 'shop']])).status, 403);
    assert.equal((await queryExpenses([['store_id', 'outside'], ['status', 'VALIDATED']])).status, 403);
    assert.equal((await queryExpenses([['created_by', 'super']])).status, 403);
    assert.equal((await commit([write('expenses/new', expense('new', 'shop', 'super', 'DRAFT'))], token)).status, 403);
  });
  for (const role of ['VENDEUR', 'MAGASINIER', 'RESPONSABLE_MAGASIN', 'CONTROLEUR', 'PRODUCTION', 'COMPTABLE', 'STAFF', 'REVENDEUR']) await t.test(`${role} without expense or cash rights cannot query expenses`, async () => {
    await seed(role);
    assert.equal((await queryExpenses([['store_id', 'shop']])).status, 403);
    assert.equal((await queryExpenses([['created_by', 'super']])).status, 403);
  });
  await t.test('disabled admin and removed store assignments take effect immediately', async () => {
    await seed('ADMIN', [], [], 'DISABLED');
    assert.equal((await queryExpenses()).status, 403);
    await seed('COMPTABLE', ['expenses.view'], []);
    assert.equal((await queryExpenses([['store_id', 'shop']])).status, 403);
    assert.equal((await queryExpenses([['created_by', 'super']])).status, 200);
  });
});
