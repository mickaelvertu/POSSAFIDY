import test from 'node:test';
import assert from 'node:assert/strict';
import { doc, getDoc, collection, getDocs, terminate } from 'firebase/firestore';
import { db } from '../src/firebase';
import { validateExpense, payValidatedExpense, cancelExpense, deleteExpense, STORE_EXPENSE_FUNDS } from '../src/services/expenseService';
import type { AuditLog, Expense } from '../src/types';
const { commit, write, origin, root, project, token } = require('../scripts/sale-rules-fixture.cjs');
const read = async (path: string) => (await getDoc(doc(db, path))).data()!;
const audit = (id: string) => ({ id, user_id: 'super', action: 'TEST', entity_type: 'EXPENSE', entity_id: 'e', created_at: Date.now() } as AuditLog);
const draft = (id: string, amount = 1000, payment_status: Expense['payment_status'] = 'PAID') => ({ id, expense_number: `DEP-${id}`, category: 'RENT', amount, description: 'Loyer', expense_date: Date.now(), status: 'DRAFT', payment_status, payment_method: 'CASH', store_id: 'pos', created_by: 'super', created_by_name: 'Admin', created_at: 1 } as Expense);

test('partial expense payments and security rules', async t => {
  try {
    await fetch(`${origin}/emulator/v1/projects/${project}/databases/(default)/documents`, { method: 'DELETE', headers: { Authorization: 'Bearer owner' } });
    const funds = [['a', 300], ['b', 400], ['c', 1000], ['other', 500]] as const;
    assert.equal((await commit([
      write('users/super', { role: 'SUPER_ADMIN', status: 'ACTIVE', assignedStores: [], permissions: [] }),
      write('stores/pos', { id: 'pos', name: 'POS', is_active: true, store_type: 'POS' }),
      ...funds.map(([id, amount]) => write(`treasuryFunds/${id}`, { id, owner_id: id === 'other' ? 'other' : 'super', owner_name: 'Admin', source: 'OTHER', source_reference: id, initial_amount: amount, balance: amount, handover_id: '', last_movement_id: 'initial', created_at: 1 })),
      write('expenses/e', draft('e')), write('expenses/legacy', draft('legacy', 50)),
      write('expenses/mixed', draft('mixed')), write('expenses/resume', draft('resume', 100))
    ])).status, 200);

    await t.test('validation can pay only the available amount and preserve the remainder', async () => {
      const expense = await validateExpense(draft('e'), 'super', audit('first'), true, true, undefined, undefined, 'a', 300);
      assert.equal(expense.payment_status, 'PARTIAL'); assert.equal(expense.amount_paid, 300);
      assert.equal(expense.payments?.length, 1); assert.equal((await read('treasuryFunds/a')).balance, 0);
      assert.equal((await read('treasuryMovements/expense-payment-first')).amount, 300);
    });
    await t.test('a later installment uses another fund; insufficient, excessive and stale payments are rejected', async () => {
      await assert.rejects(() => payValidatedExpense('e', 'a', 'super', audit('empty'), 1, 300));
      await assert.rejects(() => payValidatedExpense('e', 'c', 'super', audit('over'), 701, 300));
      await assert.rejects(() => payValidatedExpense('e', 'other', 'super', audit('foreign'), 100, 300));
      const partial = await payValidatedExpense('e', 'b', 'super', audit('second'), 400, 300);
      assert.equal(partial.amount_paid, 700); assert.equal(partial.payment_status, 'PARTIAL');
      assert.equal((await read('treasuryFunds/b')).balance, 0);
      await assert.rejects(() => payValidatedExpense('e', 'c', 'super', audit('stale'), 100, 300));
      const paid = await payValidatedExpense('e', 'c', 'super', audit('final'), 300, 700);
      assert.equal(paid.amount_paid, 1000); assert.equal(paid.payment_status, 'PAID'); assert.equal(paid.payments?.length, 3);
      await assert.rejects(() => payValidatedExpense('e', 'c', 'super', audit('duplicate'), 1, 1000));
    });
    await t.test('forged histories and payments without the actual debit are denied by Firestore', async () => {
      const before = await read('expenses/mixed');
      const payment = { id: 'fake', amount: 100, fund_id: 'c', funding_source: 'ADMIN_FUND', fund_name: 'c', paid_by: 'super', paid_by_name: 'Admin', paid_at: 1 };
      const after = { ...before, status: 'VALIDATED', validated_by: 'super', validated_at: 1, payments: [payment], amount_paid: 100, treasury_paid_amount: 100, payment_status: 'PARTIAL' };
      assert.equal((await commit([write('expenses/mixed', after)], token)).status, 403);
    });
    await t.test('cancellation refunds each original fund exactly once', async () => {
      const cancelled = await cancelExpense('e', 'Annulation', 'Admin', audit('cancel'));
      assert.equal(cancelled.refunded_amount, 1000);
      assert.equal(cancelled.refunded_payment_ids?.length, 3);
      assert.equal((await read('treasuryFunds/a')).balance, 300);
      assert.equal((await read('treasuryFunds/b')).balance, 400);
      assert.equal((await read('treasuryFunds/c')).balance, 1000);
      await cancelExpense('e', 'Annulation', 'Admin', audit('cancel-again'));
      assert.equal((await read('treasuryFunds/a')).balance, 300);
    });
    await t.test('store cash and personal funds can share an expense; the same fund can be used twice', async () => {
      const partial = await validateExpense(draft('mixed'), 'super', audit('store'), true, true, undefined, undefined, STORE_EXPENSE_FUNDS, 200);
      assert.equal(partial.treasury_paid_amount, 0);
      await payValidatedExpense('mixed', 'c', 'super', audit('mixed-one'), 300, 200);
      await payValidatedExpense('mixed', 'c', 'super', audit('mixed-two'), 500, 500);
      assert.equal((await read('treasuryFunds/c')).balance, 200);
      const cancelled = await cancelExpense('mixed', 'Retour', 'Admin', audit('cancel-mixed'));
      assert.equal(cancelled.refunded_amount, 800); assert.equal((await read('treasuryFunds/c')).balance, 1000);
    });
    await t.test('interrupted refunds can resume and deletion is blocked until refunds finish', async () => {
      await validateExpense(draft('resume', 100), 'super', audit('resume-paid'), true, true, undefined, undefined, 'c', 40);
      const partial = await read('expenses/resume');
      assert.equal((await commit([write('expenses/resume', { ...partial, status: 'CANCELLED', cancelled_by: 'super', cancelled_by_name: 'Admin', cancelled_at: 1, cancellation_reason: 'Interruption' })], token)).status, 200);
      await assert.rejects(() => deleteExpense({ ...partial, id: 'resume' } as Expense, audit('premature-delete')));
      const resumed = await cancelExpense('resume', 'Interruption', 'Admin', audit('resume-refund'));
      assert.equal(resumed.refunded_amount, 40);
      await deleteExpense(resumed, audit('delete-after-refund'));
      assert.equal((await getDoc(doc(db, 'expenses/resume'))).exists(), false);
    });
    await t.test('legacy full validation and refund stay compatible', async () => {
      const paid = await validateExpense(draft('legacy', 50), 'super', audit('legacy'), true, true, undefined, undefined, 'c');
      assert.equal(paid.treasury_movement_id, 'expense-legacy');
      const cancelled = await cancelExpense('legacy', 'Retour', 'Admin', audit('legacy-cancel'));
      assert.equal(cancelled.treasury_reversal_id, 'expense-refund-legacy');
      assert.equal((await read('treasuryFunds/c')).balance, 1000);
    });
    assert.ok((await getDocs(collection(db, 'treasuryMovements'))).size > 0);
  } finally { await terminate(db); }
});
