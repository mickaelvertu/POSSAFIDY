import test from 'node:test';
import assert from 'node:assert/strict';
import { purchaseCancellationPlan } from './purchaseCancellation';
import type { Purchase, StockTransfer } from '../types';
const purchase = { id: 'p', status: 'RECEIVED', transfer_id: 't', store_id: 'depot', total: 100, amount_paid: 0, payments: [], payment_status: 'UNPAID' } as unknown as Purchase;
const transfer = { id: 't', purchase_id: 'p', destination_store_id: 'depot', type: 'SUPPLIER_TO_STORE', status: 'DISCREPANCY', lines: [{ article_id: 'a', quantity_accepted: 2 }, { article_id: 'a', quantity_accepted: 3 }, { article_id: 'b', quantity_accepted: 0 }] } as unknown as StockTransfer;
test('only accepted quantities are grouped for supplier returns', () => {
  assert.deepEqual([...purchaseCancellationPlan(purchase, transfer).quantities], [['a', 5]]);
});
test('inconsistent receipt, missing delivery and negative quantities block cancellation', () => {
  assert.throws(() => purchaseCancellationPlan(purchase));
  assert.throws(() => purchaseCancellationPlan(purchase, { ...transfer, status: 'IN_TRANSIT' }));
  assert.throws(() => purchaseCancellationPlan(purchase, { ...transfer, lines: [{ article_id: 'a', quantity_accepted: -1 }] } as StockTransfer));
  assert.throws(() => purchaseCancellationPlan(purchase, { ...transfer, destination_store_id: 'other' }));
  assert.throws(() => purchaseCancellationPlan({ ...purchase, status: 'CANCELLED' }, transfer));
});
test('payment history and payment status must match the paid amount', () => {
  assert.throws(() => purchaseCancellationPlan({ ...purchase, amount_paid: 10 }, transfer));
  assert.throws(() => purchaseCancellationPlan({ ...purchase, payment_status: 'PAID' }, transfer));
  const paid = { ...purchase, amount_paid: 100, payment_status: 'PAID', payments: [{ amount: 100 }] } as Purchase;
  assert.equal(purchaseCancellationPlan(paid, transfer).refundDue, 100);
});
