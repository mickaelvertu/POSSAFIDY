import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { terminate } from 'firebase/firestore';
import { db } from '../src/firebase';
import { validateInventoryCount } from '../src/services/inventoryCountService';
import { savePayslip } from '../src/services/payrollService';
import type { AuditLog, InventoryCount, Payslip, StoreStock } from '../src/types';
import fixture from './sale-rules-fixture.cjs';
const { commit, write, origin, root, project } = fixture;
after(() => terminate(db));

const count = { id: 'count', count_number: 'INV-SERVICE', store_id: 'shop', store_name: 'Shop', status: 'SUBMITTED', created_by: 'counter', created_by_name: 'Counter', created_at: 1, updated_at: 1, manager_signed_at: 1, manager_signed_by: 'manager', manager_signed_by_name: 'Manager', lines: [{ article_id: 'soap', article_code: 'SOAP', article_name: 'Soap', unit: 'piece', system_quantity: 5, counted_quantity: 3, variance: -2, unit_cost: 1000, variance_value: -2000, reason: 'Test shortage' }] } as InventoryCount;
const stock = { id: 'stock', store_id: 'shop', article_id: 'soap', quantity: 10, reserved_quantity: 0, updated_at: 1 } as StoreStock;
const audit = (id: string, user = 'super') => ({ id, user_id: user, user_name: user, action: 'TEST', entity_id: 'count', entity_type: 'TEST', created_at: Date.now(), device_id: 'TEST' }) as AuditLog;
const slip = { id: 'pay', employee_id: 'employee', employee_name: 'Aina Test', period: '2026-10', base_salary: 20000, bonuses: 0, deductions: 0, advances_deducted: 0, net_salary: 18000, inventory_count_ids: ['count'], inventory_charges_deducted: 2000, created_at: 1, updated_at: 1, created_by: 'super', payment_status: 'PENDING' } as Payslip;
const settlement = { settled_at: Date.now(), settled_by: 'super', settled_by_name: 'Super', method: 'PAYSLIP' as const, reference: 'Test payroll', payslip_id: 'pay', note: undefined };

async function seed(role = 'SUPER_ADMIN') {
  await fetch(`${origin}/emulator/v1/projects/${project}/databases/(default)/documents`, { method: 'DELETE', headers: { Authorization: 'Bearer owner' } });
  assert.equal((await commit([
    write('users/super', { role, status: 'ACTIVE', permissions: [], assignedStores: [] }),
    write('employees/employee', { id: 'employee', first_name: 'Aina', last_name: 'Test', is_active: true }),
    write('stores/shop', { store_type: 'POS', is_active: true }), write('articles/soap', { article_type: 'RESALE' }),
    write('stocks/stock', stock), write('inventoryCounts/count', count),
  ])).status, 200);
}
async function read(path: string) { return fetch(`${origin}/v1/${root}/${path}`, { headers: { Authorization: 'Bearer owner' } }); }

test('real validation service assigns an unlinked employee and records the stock delta', async () => {
  await seed();
  const result = await validateInventoryCount(count, { soap: 'REJECTED' }, { id: 'super', name: 'Super' }, 'Test', [stock], () => audit('count-audit'), 'employee');
  assert.equal(result.count.charged_employee_id, 'employee');
  assert.equal(result.count.charged_to, 'employee');
  assert.equal(result.count.total_charged_amount, 2000);
  assert.equal(result.stocks[0].quantity, 8);
});
test('real validation service rejects non-super assignment before changing stock', async () => {
  await seed('ADMIN');
  await assert.rejects(validateInventoryCount(count, { soap: 'REJECTED' }, { id: 'super', name: 'Admin' }, 'Test', [stock], () => audit('count-audit'), 'employee'), /SUPER_ADMIN/);
  assert.equal((await (await read('stocks/stock')).json()).fields.quantity.integerValue, '10');
});
test('payroll failure leaves the charge pending; successful retry settles both exactly once', async () => {
  await seed();
  const validated = await validateInventoryCount(count, { soap: 'REJECTED' }, { id: 'super', name: 'Super' }, 'Test', [stock], () => audit('count-audit'), 'employee');
  const inventory = { counts: [validated.count], settlement, auditLog: audit('settlement-audit') };
  await assert.rejects(savePayslip(slip, audit('invalid-audit', 'another-user'), [], inventory, true));
  assert.equal((await read('payroll/pay')).status, 404);
  assert.equal((await (await read('inventoryCounts/count')).json()).fields.charge_settlement, undefined);
  const settled = await savePayslip(slip, audit('payroll-audit'), [], inventory, true);
  assert.equal(settled[0].charge_settlement?.payslip_id, 'pay');
  assert.equal((await read('payroll/pay')).status, 200);
  await assert.rejects(savePayslip(slip, audit('payroll-retry'), [], inventory, true), /existe déjà/);
});
