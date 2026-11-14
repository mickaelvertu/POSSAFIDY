import test from 'node:test';
import assert from 'node:assert/strict';
import type { AppUser, Article, Store, Supplier } from '../types';
import type { RawMaterialOrder, RawMaterialOrderLine } from './rawMaterialOrderTypes';
import { buildRawMaterialPurchase, validateRawMaterialLines } from './rawMaterialOrderValidation';

const article = { id: 'raw', code: 'MP-1', name: 'Huile', unit: 'L', article_type: 'RAW_MATERIAL', is_active: true } as Article;
const lines: RawMaterialOrderLine[] = [{ article_id: 'raw', article_code: 'old', article_name: 'Old', unit: 'old', quantity: 2.5, unit_cost: 400 }];
const store = { id: 'dep', store_type: 'CENTRAL_WAREHOUSE', is_active: true } as Store;
const supplier = { id: 'supplier', name: 'Fournisseur', is_active: true } as Supplier;
const user = { uid: 'admin', displayName: 'Admin' } as AppUser;
const order = { id: 'order', order_number: 'CMD-DEP-1', store_id: 'dep', status: 'PENDING', purchase_id: '', notes: 'Urgent', lines: [{ ...lines[0], quantity: 10 }] } as RawMaterialOrder;

test('DEP conversion builds a linked unpaid draft using canonical articles and adjusted quantities', () => {
  const purchase = buildRawMaterialPurchase(order, lines, store, supplier, [article], user, 'Retenu', 100);
  assert.equal(purchase.id, 'purchase-raw-order');
  assert.equal(purchase.raw_material_order_id, order.id);
  assert.equal(purchase.status, 'DRAFT');
  assert.equal(purchase.store_id, store.id);
  assert.equal(purchase.supplier_id, supplier.id);
  assert.equal(purchase.total, 1000);
  assert.equal(purchase.lines[0].article_name, 'Huile');
  assert.equal(purchase.lines[0].quantity, 2.5);
  assert.equal(purchase.payment_status, 'UNPAID');
  assert.equal(purchase.amount_paid, 0);
  assert.deepEqual(purchase.payments, []);
  assert.match(purchase.notes!, /CMD-DEP-1\nUrgent\nRetenu/);
  assert.equal(order.lines[0].quantity, 10);
  assert.equal(buildRawMaterialPurchase(order, lines, store, supplier, [article], user, '', 101).id, purchase.id);
});

test('DEP rejects resale, inactive or missing articles, duplicates and invalid amounts', () => {
  for (const articles of [[], [{ ...article, is_active: false }], [{ ...article, article_type: 'RESALE' as const }]]) {
    assert.throws(() => validateRawMaterialLines(lines, articles));
  }
  assert.throws(() => validateRawMaterialLines([], [article]));
  assert.throws(() => validateRawMaterialLines([...lines, ...lines], [article]));
  for (const quantity of [0, -1, NaN, Infinity]) assert.throws(() => validateRawMaterialLines([{ ...lines[0], quantity }], [article]));
  for (const unit_cost of [-1, NaN, Infinity]) assert.throws(() => validateRawMaterialLines([{ ...lines[0], unit_cost }], [article]));
  assert.throws(() => validateRawMaterialLines([{ ...lines[0], quantity: Number.MAX_VALUE, unit_cost: 2 }], [article]));
});

test('DEP conversion rejects processed orders and unavailable destination or supplier', () => {
  const build = (o = order, s = store, supplierRow = supplier) => buildRawMaterialPurchase(o, lines, s, supplierRow, [article], user, '', 100);
  for (const status of ['REJECTED', 'PURCHASE_CREATED'] as const) assert.throws(() => build({ ...order, status }));
  assert.throws(() => build({ ...order, purchase_id: 'existing' }));
  assert.throws(() => build(order, { ...store, id: 'other' }));
  assert.throws(() => build(order, { ...store, store_type: 'POS' }));
  assert.throws(() => build(order, { ...store, is_active: false }));
  assert.throws(() => build(order, store, { ...supplier, is_active: false }));
  assert.throws(() => build(order, store, { ...supplier, deleted_at: 1 }));
});
