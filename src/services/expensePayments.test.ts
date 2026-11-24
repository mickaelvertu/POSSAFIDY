import test from 'node:test';
import assert from 'node:assert/strict';
import type { Expense } from '../types';
import { assertExpensePayment, expensePaidAmount, expenseRemainingAmount } from './expensePayments';
import { calculateCashClosing, calculateStoreDailyTotals, cashBusinessDate } from './cashClosingCalculation';

const expense = { id: 'e', store_id: 'pos', amount: 1000, status: 'VALIDATED', payment_status: 'PARTIAL', amount_paid: 300, payment_method: 'CASH' } as Expense;
test('partial expense balance and old fully paid expenses remain compatible', () => {
  assert.equal(expensePaidAmount(expense), 300);
  assert.equal(expenseRemainingAmount(expense), 700);
  assert.equal(expensePaidAmount({ ...expense, amount_paid: undefined, payment_status: 'PAID' }), 1000);
  assert.equal(expensePaidAmount({ ...expense, status: 'DRAFT', payment_status: 'PAID' }), 0);
  assert.equal(expenseRemainingAmount({ ...expense, payment_status: 'PAID', amount_paid: 1000 }), 0);
  assert.doesNotThrow(() => assertExpensePayment(expense, 700));
  for (const amount of [0, -1, 701, NaN, Infinity, 0.5]) assert.throws(() => assertExpensePayment(expense, amount));
});

test('cash closing counts only store installments on their actual payment dates', () => {
  const date = new Date('2026-11-16T12:00:00').getTime();
  const paid = { ...expense, payments: [
    { id: 'one', amount: 200, funding_source: 'STORE', paid_at: date },
    { id: 'two', amount: 100, funding_source: 'ADMIN_FUND', paid_at: date },
    { id: 'three', amount: 400, funding_source: 'STORE', paid_at: date + 86400000 }
  ] } as Expense;
  assert.equal(calculateCashClosing([], [paid], 'pos', cashBusinessDate(date)).expensesAmount, 200);
  assert.equal(calculateCashClosing([], [paid], 'pos', cashBusinessDate(date + 86400000)).expensesAmount, 400);
  assert.equal(calculateStoreDailyTotals([], [paid], 'pos', cashBusinessDate(date)).expensesAmount, 300);
  assert.equal(calculateCashClosing([], [{ ...paid, status: 'CANCELLED' }], 'pos', cashBusinessDate(date)).expensesAmount, 0);
});
