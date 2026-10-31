const { test } = require('node:test');
const assert = require('node:assert/strict');
const { commit, write, token, origin, root, project } = require('./sale-rules-fixture.cjs');

const submitted = { id: 'count', count_number: 'INV-TEST', store_id: 'shop', store_name: 'Test shop', status: 'SUBMITTED', created_by: 'counter', created_by_name: 'Counter', manager_signed_by: 'manager', manager_signed_by_name: 'Manager', manager_signed_at: 1, updated_at: 1, lines: [{ article_id: 'soap', variance: -1, variance_value: -1000, reason: 'Test shortage' }] };
const employee = { id: 'employee-a', first_name: 'Aina', last_name: 'Test', user_id: 'employee-login', is_active: true, store_id: 'another-shop' };
const assigned = { ...submitted, status: 'VALIDATED', reviewed_by: 'super', reviewed_at: 2, updated_at: 2, charged_employee_id: 'employee-a', charged_to: 'employee-login', charged_to_name: 'Aina Test', total_charged_amount: 1000, charge_assigned_by: 'super', charge_assigned_at: 2 };
async function seed(role = 'SUPER_ADMIN', count = submitted, target = employee) {
  await fetch(`${origin}/emulator/v1/projects/${project}/databases/(default)/documents`, { method: 'DELETE', headers: { Authorization: 'Bearer owner' } });
  const result = await commit([
    write('users/super', { role, status: 'ACTIVE', permissions: [], assignedStores: [] }),
    write('employees/employee-a', target), write('inventoryCounts/count', count),
  ]);
  assert.equal(result.status, 200);
}
const settlement = { settled_by: 'super', settled_by_name: 'Reviewer', settled_at: 3, method: 'PAYSLIP', reference: 'Paie test', payslip_id: 'pay-test' };
const payslip = { id: 'pay-test', employee_id: 'employee-a', inventory_count_ids: ['count'], inventory_charges_deducted: 1000, base_salary: 20000, bonuses: 0, deductions: 0, net_salary: 19000 };

test('inventory employee assignment and payroll settlement', async t => {
  await t.test('super admin can assign the shortage to an employee in any store', async () => {
    await seed();
    assert.equal((await commit([write('inventoryCounts/count', assigned)], token)).status, 200);
  });
  await t.test('regular admin cannot choose another employee', async () => {
    await seed('ADMIN');
    assert.equal((await commit([write('inventoryCounts/count', assigned)], token)).status, 403);
  });
  await t.test('regular admin retains default signatory responsibility', async () => {
    await seed('ADMIN');
    assert.equal((await commit([write('inventoryCounts/count', { ...submitted, status: 'VALIDATED', reviewed_by: 'super', reviewed_at: 2, charged_to: 'manager', charged_to_name: 'Manager', total_charged_amount: 1000 })], token)).status, 200);
  });
  await t.test('nonexistent employee and forged employee identity are denied', async () => {
    await seed();
    assert.equal((await commit([write('inventoryCounts/count', { ...assigned, charged_employee_id: 'missing' })], token)).status, 403);
    assert.equal((await commit([write('inventoryCounts/count', { ...assigned, charged_to: 'counter' })], token)).status, 403);
  });
  await t.test('an employee without a login can be assigned', async () => {
    const unlinked = { ...employee }; delete unlinked.user_id;
    await seed('SUPER_ADMIN', submitted, unlinked);
    assert.equal((await commit([write('inventoryCounts/count', { ...assigned, charged_to: 'employee-a' })], token)).status, 200);
  });
  await t.test('a settled assignment cannot be transferred to another employee', async () => {
    await seed('SUPER_ADMIN', assigned);
    assert.equal((await commit([write('inventoryCounts/count', { ...assigned, charged_employee_id: 'employee-b' })], token)).status, 403);
  });
  await t.test('payroll settlement without a matching payslip is denied', async () => {
    await seed('SUPER_ADMIN', assigned);
    assert.equal((await commit([write('inventoryCounts/count', { ...assigned, updated_at: 3, charge_settlement: settlement })], token)).status, 403);
  });
  await t.test('wrong employee payroll fails atomically', async () => {
    await seed('SUPER_ADMIN', assigned);
    const result = await commit([write('inventoryCounts/count', { ...assigned, updated_at: 3, charge_settlement: settlement }), write('payroll/pay-test', { ...payslip, employee_id: 'employee-b' })], token);
    assert.equal(result.status, 403);
    const response = await fetch(`${origin}/v1/${root}/payroll/pay-test`, { headers: { Authorization: 'Bearer owner' } });
    assert.equal(response.status, 404);
  });
  await t.test('correct payroll and charge settle together, and cannot be deducted twice', async () => {
    await seed('SUPER_ADMIN', assigned);
    assert.equal((await commit([write('inventoryCounts/count', { ...assigned, updated_at: 3, charge_settlement: settlement }), write('payroll/pay-test', payslip)], token)).status, 200);
    assert.equal((await commit([write('inventoryCounts/count', { ...assigned, updated_at: 4, charge_settlement: { ...settlement, payslip_id: 'pay-second' } }), write('payroll/pay-second', { ...payslip, id: 'pay-second' })], token)).status, 403);
    assert.equal((await fetch(`${origin}/v1/${root}/payroll/pay-second`, { headers: { Authorization: 'Bearer owner' } })).status, 404);
  });
  await t.test('assigned employee sees their own charge after linking a login', async () => {
    await seed('SUPER_ADMIN', { ...assigned, charged_to: 'employee-a' }, { ...employee, user_id: 'staff' });
    await commit([write('users/staff', { role: 'STAFF', status: 'ACTIVE', permissions: [], assignedStores: [] })]);
    const payload = { sub: 'staff', user_id: 'staff', aud: project, iss: `https://securetoken.google.com/${project}`, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600, firebase: { identities: {}, sign_in_provider: 'custom' } };
    const staffToken = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url') + '.' + Buffer.from(JSON.stringify(payload)).toString('base64url') + '.';
    const response = await fetch(`${origin}/v1/${root}:runQuery`, { method: 'POST', headers: { Authorization: `Bearer ${staffToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'inventoryCounts' }], where: { fieldFilter: { field: { fieldPath: 'charged_employee_id' }, op: 'EQUAL', value: { stringValue: 'employee-a' } } } } }) });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).filter(row => row.document).length, 1);
  });
});
