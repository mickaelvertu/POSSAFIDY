import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { terminate } from 'firebase/firestore';
import { db } from '../src/firebase';
import { validateInventoryCount } from '../src/services/inventoryCountService';
import { savePayslip } from '../src/services/payrollService';
import { saveTransferWithStockEffects } from '../src/services/inventoryService';
import { validateSale } from '../src/services/operationsService';
import type { Sale } from '../src/types';
import type { StockTransfer, StockMovement } from '../src/types';
import type { AuditLog, InventoryCount, Payslip, StoreStock } from '../src/types';
import fixture from './sale-rules-fixture.cjs';
const { commit, write, origin, root, project } = fixture;
// Node exposes navigator without the browser's onLine property.
if (typeof navigator !== 'undefined') Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
test('manager ships 60 POS return lines atomically; wrong quantities and replay are denied', async () => {
  await seed();
  const lines = Array.from({ length: 60 }, (_, i) => ({ article_id: `return-${i}`, quantity_sent: 2 }));
  const transfer = { id: 'return', transfer_number: 'RETURN', type: 'STORE_TO_STORE', status: 'APPROVED', source_store_id: 'shop', destination_store_id: 'central', requested_by: 'super', approved_by: 'admin', lines, created_at: 1, updated_at: 1 } as StockTransfer;
  const rows = lines.map(line => ({ id: `stock-${line.article_id}`, store_id: 'shop', article_id: line.article_id, quantity: 10, reserved_quantity: 0, updated_at: 1 }));
  assert.equal((await commit([
    write('users/super', { role: 'RESPONSABLE_MAGASIN', status: 'ACTIVE', permissions: ['transfers.view', 'transfers.ship', 'stock.view'], assignedStores: ['shop'] }),
    write('stores/central', { store_type: 'CENTRAL_WAREHOUSE', is_active: true }),
    write('transfers/return', transfer),
    ...lines.map(line => write(`articles/${line.article_id}`, { article_type: 'RESALE' })),
    ...rows.map(row => write(`stocks/${row.id}`, row)),
  ])).status, 200);
  const shipped = { ...transfer, status: 'IN_TRANSIT', shipped_by: 'super', shipped_at: 2, updated_at: 2 } as StockTransfer;
  const movements = lines.map(line => ({ id: `ship-${line.article_id}`, store_id: 'shop', article_id: line.article_id, movement_type: 'STORE_TO_STORE', reference_type: 'TRANSFER', reference_id: 'return', quantity: -2, before_quantity: 10, after_quantity: 8, created_by: 'super', created_at: 2 })) as StockMovement[];
  // Reproduce the original per-article rules budget failure with the old payload.
  const legacy = await commit([
    ...rows.map(row => write(`stocks/${row.id}`, { ...row, quantity: 8, updated_at: 2 })),
    ...movements.map(movement => write(`movements/${movement.id}`, movement)),
    write('transfers/return', shipped),
  ], fixture.token);
  assert.ok([403, 500].includes(legacy.status), JSON.stringify(legacy));
  await assert.rejects(saveTransferWithStockEffects(shipped, rows, movements.map((movement, i) => i === 0 ? { ...movement, quantity: -3 } : movement), audit('bad-shipment')));
  assert.equal((await (await read('stocks/stock-return-0')).json()).fields.quantity.integerValue, '10');
  const result = await saveTransferWithStockEffects(shipped, rows, movements, audit('shipment'));
  assert.equal(result.stocks.length, 60);
  assert.ok(result.stocks.every(row => row.quantity === 8));
  await assert.rejects(saveTransferWithStockEffects(shipped, rows, movements, audit('replay')));
});
after(() => terminate(db));

test('real POS service validates 100 products, aggregates duplicates, and leaves insufficient stock sales untouched', async () => {
  await seed();
  const lines = Array.from({ length: 100 }, (_, i) => ({ article_id: `product-${i}`, quantity: 1, unit_price: 100, total: 100, discount: 0 }));
  const sale = { id: 'large-pos', sale_number: 'POS-100', store_id: 'shop', customer_type: 'PARTICULIER', customer_name: 'Test', seller_id: 'super', seller_name: 'Manager', status: 'VERIFIED', created_at: 1, subtotal: 10200, discount: 0, tax: 0, total: 10200, amount_paid: 10200, payment_method: 'CASH', lines: [...lines, { ...lines[0], quantity: 2, total: 200 }, { article_id: 'service', line_type: 'SERVICE', quantity: 1, unit_price: 0, total: 0 }] } as Sale;
  const rows = lines.map(line => ({ id: `row-${line.article_id}`, store_id: 'shop', article_id: line.article_id, quantity: 10, reserved_quantity: 0, updated_at: 1 }));
  assert.equal((await commit([
    write('users/super', { role: 'RESPONSABLE_MAGASIN', status: 'ACTIVE', permissions: ['sales.view', 'sales.validate', 'stock.view'], assignedStores: ['shop'] }),
    write('sales/large-pos', sale),
    ...lines.map(line => write(`articles/${line.article_id}`, { article_type: 'RESALE' })),
    ...rows.map((row, i) => write(`stocks/${row.id}`, { ...row, quantity: i === 99 ? 0 : 10 })),
  ])).status, 200);
  await assert.rejects(validateSale(sale, rows, 'super', 'Manager'), /Stock insuffisant/);
  assert.equal((await (await read('stocks/row-product-0')).json()).fields.quantity.integerValue, '10');
  assert.equal((await (await read('sales/large-pos')).json()).fields.status.stringValue, 'VERIFIED');
  assert.equal((await commit([write('stocks/row-product-99', rows[99])])).status, 200);
  const result = await validateSale(sale, rows, 'super', 'Manager');
  assert.equal(result.stocks.length, 100);
  assert.equal(result.movements.length, 100);
  assert.equal(result.stocks.find(row => row.article_id === 'product-0')?.quantity, 7);
  assert.equal(result.sale.status, 'VALIDATED');
  await assert.rejects(validateSale(sale, rows, 'super', 'Manager'));
  assert.equal((await (await read('stocks/row-product-0')).json()).fields.quantity.integerValue, '7');
});

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
