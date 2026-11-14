import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyCreditPaymentReversal } from './creditPaymentReversal';
import type { CreditPayment, CreditPaymentReversal, Sale } from '../types';
const payment = { id: 'p', amount: 116500 } as CreditPayment;
const reversal = { id: 'p', payment, sale_id: 'sale', reason: 'Erreur de saisie', reversed_by: 'admin' } as CreditPaymentReversal;
const sale = { id: 'sale', customer_type: 'REVENDEUR', status: 'VALIDATED', total: 116500, amount_paid: 116500,
  payment_status: 'PAID', credit_payments: [payment] } as Sale;
test('reversing a full payment restores the unpaid invoice and preserves evidence', () => {
  const updated = applyCreditPaymentReversal(sale, reversal);
  assert.equal(updated.amount_paid, 0);
  assert.equal(updated.payment_status, 'PENDING');
  assert.deepEqual(updated.credit_payments, []);
  assert.deepEqual(updated.credit_payment_reversals?.[0].payment, payment);
  assert.equal(sale.credit_payments?.length, 1);
  assert.throws(() => applyCreditPaymentReversal(updated, reversal));
});
test('only the selected payment is reversed and a reason is mandatory', () => {
  const other = { ...payment, id: 'other', amount: 10000 };
  const updated = applyCreditPaymentReversal({ ...sale, total: 126500, amount_paid: 126500, credit_payments: [other, payment] }, reversal);
  assert.equal(updated.amount_paid, 10000);
  assert.equal(updated.payment_status, 'PARTIAL');
  assert.deepEqual(updated.credit_payments, [other]);
  assert.throws(() => applyCreditPaymentReversal(sale, { ...reversal, reason: ' ' }));
  assert.throws(() => applyCreditPaymentReversal({ ...sale, status: 'CANCELLED' }, reversal));
});
