import test from 'node:test';
import assert from 'node:assert/strict';
import { doc, getDoc, getDocs, collection, terminate } from 'firebase/firestore';
import { db } from '../src/firebase';
import { receiveTreasuryFunds, moveTreasuryFunds, adoptHistoricalHandover } from '../src/services/treasuryService';
import { confirmCashHandoverReceipt, recordCashHandoverDeposit } from '../src/services/cashHandoverService';
import { recordSupplierPayment } from '../src/services/inventoryService';
import { cancelExpense, deleteExpense, payValidatedExpense, saveExpense, STORE_EXPENSE_FUNDS, updateDraftExpense, validateExpense } from '../src/services/expenseService';
import { assertFundDebit, handoverAvailable } from '../src/services/treasuryCalculation';
import type { AppUser, CashHandover, Expense, Purchase, SalaryAdvance, TreasuryFund } from '../src/types';
const { commit, write, token, origin, project } = require('../scripts/sale-rules-fixture.cjs');
const user = { uid: 'super', displayName: 'Admin A' } as AppUser;
const recipient = { uid: 'second', displayName: 'Admin B' } as AppUser;
const audit = (id: string) => ({ id, user_id: 'super', action: 'TEST', entity_type: 'CASH_HANDOVER', entity_id: 'h', created_at: 2 } as any);
const read = async (path: string) => (await getDoc(doc(db, path))).data()!;
const handover = { id: 'h', handover_number: 'REM-TEST', store_id: 'pos', store_name: 'POS', business_date: '2026-11-04', expected_cash_sales: 500, cash_sale_count: 1, declared_amount: 500, declared_by: 'seller', declared_by_name: 'Vendeur', declared_at: 1, status: 'DECLARED', deposits: [], deposited_amount: 0 } as CashHandover;
const purchase = { id: 'p', purchase_number: 'ACH-TEST', store_id: 'warehouse', status: 'APPROVED', total: 1000, amount_paid: 0, payment_status: 'UNPAID', payments: [], updated_at: 1 } as unknown as Purchase;

test('treasury services and security rules', async t => {
  await fetch(`${origin}/emulator/v1/projects/${project}/databases/(default)/documents`, { method: 'DELETE', headers: { Authorization: 'Bearer owner' } });
  const seeded = await commit([
    write('users/super', { role: 'ADMIN', status: 'ACTIVE', permissions: [], assignedStores: [] }),
    write('users/second', { role: 'ADMIN', status: 'ACTIVE', permissions: [], assignedStores: [] }),
    write('cashHandovers/h', handover), write('purchases/p', purchase)
  ]);
  assert.equal(seeded.status, 200);
  await t.test('POS receipt credits exactly once', async () => {
    await confirmCashHandoverReceipt(handover, 500, '', user.uid, user.displayName, audit('receipt'));
    assert.equal((await read('treasuryFunds/pos-h')).balance, 500);
    assert.equal((await read('cashHandovers/h')).treasury_fund_id, 'pos-h');
    await assert.rejects(confirmCashHandoverReceipt(handover, 500, '', user.uid, user.displayName, audit('duplicate')));
  });
  await t.test('transfer preserves source and removes money from POS deposit availability', async () => {
    await moveTreasuryFunds(user, 'pos-h', 200, 'Remise à Admin B', recipient);
    assert.equal((await read('treasuryFunds/pos-h')).balance, 300);
    assert.equal(handoverAvailable(await read('cashHandovers/h') as CashHandover), 300);
    const funds = (await getDocs(collection(db, 'treasuryFunds'))).docs.map(row => row.data());
    const received = funds.find(fund => fund.owner_id === 'second')!;
    assert.equal(received.balance, 200); assert.equal(received.source, 'POS'); assert.equal(received.source_reference, 'REM-TEST');
    await assert.rejects(moveTreasuryFunds(user, received.id, 1, 'Vol'));
  });
  await t.test('purchase payment atomically debits funds and updates invoice', async () => {
    await recordSupplierPayment(purchase, { id: 'pay-1', amount: 150, method: 'CASH', paid_at: 3, paid_by: 'super', paid_by_name: 'Admin A', treasury_fund_id: 'pos-h' });
    assert.equal((await read('treasuryFunds/pos-h')).balance, 150);
    assert.equal((await read('purchases/p')).amount_paid, 150);
    assert.equal(handoverAvailable(await read('cashHandovers/h') as CashHandover), 150);
    await assert.rejects(recordSupplierPayment(purchase, { id: 'pay-1', amount: 150, method: 'CASH', paid_at: 3, paid_by: 'super', paid_by_name: 'Admin A', treasury_fund_id: 'pos-h' }));
  });
  await t.test('bank deposit cannot reuse transferred or spent money', async () => {
    const current = await read('cashHandovers/h') as CashHandover;
    const deposit = { amount: 151, bank_name: 'Banque', reference: 'BORD', deposited_by: 'super', deposited_by_name: 'Admin A', deposited_at: 4 };
    await assert.rejects(recordCashHandoverDeposit(current, deposit, 'super', audit('too-large')));
    await recordCashHandoverDeposit(current, { ...deposit, amount: 150 }, 'super', audit('deposit'));
    assert.equal((await read('treasuryFunds/pos-h')).balance, 0);
    assert.equal(handoverAvailable(await read('cashHandovers/h') as CashHandover), 0);
  });
  await t.test('bank receipt and competing debits never overdraw', async () => {
    await receiveTreasuryFunds(user, 'BANK', 300, 'Retrait BANK-1');
    const fund = (await getDocs(collection(db, 'treasuryFunds'))).docs.map(row => row.data()).find(row => row.source === 'BANK')!;
    const results = await Promise.allSettled([moveTreasuryFunds(user, fund.id, 200, 'T1', recipient), moveTreasuryFunds(user, fund.id, 200, 'T2', recipient)]);
    assert.equal(results.filter(row => row.status === 'fulfilled').length, 1);
    assert.equal((await read(`treasuryFunds/${fund.id}`)).balance, 100);
    await moveTreasuryFunds(user, fund.id, 100, 'Banque / BORD');
    assert.equal((await read(`treasuryFunds/${fund.id}`)).balance, 0);
  });
  await t.test('forged balances, movements and invoice payments are rejected', async () => {
    const fund = await read('treasuryFunds/pos-h');
    assert.equal((await commit([write('treasuryFunds/pos-h', { ...fund, balance: 500 })], token)).status, 403);
    const movement = await read('treasuryMovements/pay-1');
    assert.equal((await commit([write('treasuryMovements/pay-1', { ...movement, amount: 1 })], token)).status, 403);
    const p = await read('purchases/p');
    assert.equal((await commit([write('purchases/p', { ...p, amount_paid: 200, updated_at: 5, payments: [...p.payments, { id: 'fake', amount: 50, method: 'CASH', paid_by: 'super', paid_at: 5 }] })], token)).status, 403);
    const fundValue = fund as TreasuryFund;
    for (const amount of [0, -1, 0.5, Infinity, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => assertFundDebit(fundValue, 'super', amount));
  });
  await t.test('head office expense tracks payer separately and draft edits do not debit funds', async () => {
    await commit([write('users/super', { role: 'SUPER_ADMIN', status: 'ACTIVE', permissions: [], assignedStores: [] }),
      write('cashHandovers/expense-pos', { ...handover, id: 'expense-pos' })]);
    await confirmCashHandoverReceipt({ ...handover, id: 'expense-pos' }, 500, '', 'super', 'Admin A', audit('exp-pos'));
    const draft = { id: 'general', expense_number: 'DEP-GLOBAL', category: 'RENT', description: 'Loyer siège', amount: 100,
      expense_date: 10, created_at: 10, created_by: 'super', created_by_name: 'Auteur initial', status: 'DRAFT', payment_status: 'PAID', payment_method: 'CASH' } as Expense;
    await saveExpense(draft, audit('draft'));
    const edited = await updateDraftExpense(draft, { ...draft, amount: 150 }, 'super', audit('edit'));
    assert.equal((await read('treasuryFunds/pos-expense-pos')).balance, 500);
    await assert.rejects(validateExpense(edited, 'super', audit('missing-fund'), true, true));
    const paid = await validateExpense(edited, 'super', audit('expense-pay'), true, true, undefined, undefined, 'pos-expense-pos');
    assert.equal(paid.paid_by, 'super'); assert.equal(paid.paid_by_name, 'Admin A');
    assert.equal(paid.created_by_name, 'Auteur initial'); assert.equal(paid.store_id, undefined);
    assert.equal((await read('treasuryFunds/pos-expense-pos')).balance, 350);
    assert.equal(handoverAvailable(await read('cashHandovers/expense-pos') as CashHandover), 350);
    assert.equal((await read('treasuryMovements/expense-general')).expense_id, 'general');
    await assert.rejects(validateExpense(edited, 'super', audit('duplicate-expense'), true, true, undefined, undefined, 'pos-expense-pos'));
    await assert.rejects(deleteExpense(paid, audit('delete-paid')));
    const deleted = await commit([{ delete: `projects/${project}/databases/(default)/documents/expenses/general` }], token);
    assert.equal(deleted.status, 403);
  });
  await t.test('validated unpaid expenses can be paid once without changing creator or store', async () => {
    const draft = { id: 'pending-general', expense_number: 'DEP-PENDING', category: 'ELECTRICITY', description: 'Facture siège', amount: 80,
      expense_date: 10, created_at: 10, created_by: 'someone-else', created_by_name: 'Comptable', status: 'DRAFT', payment_status: 'PENDING', payment_method: 'CASH' } as Expense;
    await commit([write('expenses/pending-general', draft)]);
    await validateExpense(draft, 'super', audit('pending-validation'), true, true);
    assert.equal((await read('treasuryFunds/pos-expense-pos')).balance, 350);
    const results = await Promise.allSettled([
      payValidatedExpense(draft.id, 'pos-expense-pos', 'super', audit('pending-payment-1')),
      payValidatedExpense(draft.id, 'pos-expense-pos', 'super', audit('pending-payment-2'))
    ]);
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    const paid = await read('expenses/pending-general');
    assert.equal(paid.created_by, 'someone-else'); assert.equal(paid.paid_by, 'super');
    assert.equal(paid.store_id, undefined); assert.equal(paid.payment_status, 'PAID');
    assert.equal((await read('treasuryFunds/pos-expense-pos')).balance, 270);
  });
  await t.test('insufficient funds and forged expense payments fail atomically', async () => {
    const draft = { id: 'too-expensive', expense_number: 'DEP-HIGH', category: 'OTHER', description: 'Achat', amount: 271,
      expense_date: 10, created_at: 10, created_by: 'super', created_by_name: 'Admin A', status: 'DRAFT', payment_status: 'PAID', payment_method: 'CASH' } as Expense;
    await saveExpense(draft, audit('large-draft'));
    await assert.rejects(validateExpense(draft, 'super', audit('insufficient'), true, true, undefined, undefined, 'pos-expense-pos'));
    assert.equal((await read('expenses/too-expensive')).status, 'DRAFT');
    assert.equal((await read('treasuryFunds/pos-expense-pos')).balance, 270);
    const foreign = (await getDocs(collection(db, 'treasuryFunds'))).docs.map(row => row.data()).find(row => row.owner_id === 'second')!;
    await assert.rejects(validateExpense(draft, 'super', audit('foreign-fund'), true, true, undefined, undefined, foreign.id));
    assert.equal((await commit([write('expenses/too-expensive', { ...draft, status: 'VALIDATED', validated_by: 'super', validated_at: 11 })], token)).status, 403);
    assert.equal((await commit([write('expenses/forged-draft', { ...draft, id: 'forged-draft', treasury_movement_id: 'fake' })], token)).status, 403);
    const paid = await read('expenses/general');
    assert.equal((await commit([write('expenses/general', { ...paid, amount: 1 })], token)).status, 403);
    await deleteExpense(draft, audit('delete-unpaid-draft'));
    assert.equal((await getDoc(doc(db, 'expenses/too-expensive'))).exists(), false);
    assert.equal((await read('treasuryFunds/pos-expense-pos')).balance, 270);
  });
  await t.test('salary advance, expense payment and treasury debit commit together', async () => {
    await commit([write('employees/employee', { first_name: 'Jean', last_name: 'Test', is_active: true })]);
    const draft = { id: 'advance-expense', expense_number: 'DEP-ADV', category: 'SALARY_ADVANCE', description: 'Avance', amount: 70,
      expense_date: 10, created_at: 10, created_by: 'super', created_by_name: 'Admin A', status: 'DRAFT', payment_status: 'PAID', payment_method: 'CASH',
      employee_id: 'employee', employee_name: 'Jean Test', salary_advance_id: 'advance-advance-expense' } as Expense;
    const advance = { id: draft.salary_advance_id!, employee_id: 'employee', employee_name: 'Jean Test', amount: 70, advance_date: 10,
      payment_method: 'CASH', reason: 'Avance', status: 'OUTSTANDING', expense_id: draft.id, created_by: 'super', created_at: 10, updated_at: 10 } as SalaryAdvance;
    await saveExpense(draft, audit('advance-draft'));
    await validateExpense(draft, 'super', audit('advance-expense-paid'), true, true, advance, audit('advance-created'), 'pos-expense-pos');
    assert.equal((await read('salaryAdvances/advance-advance-expense')).amount, 70);
    assert.equal((await read('expenses/advance-expense')).payment_status, 'PAID');
    assert.equal((await read('treasuryFunds/pos-expense-pos')).balance, 200);
  });
  await t.test('store funding validates and pays without debiting the declarant; global expenses cannot use store funds', async () => {
    await commit([write('stores/antsahabe', { name: 'Antsahabe', is_active: true, store_type: 'POS' })]);
    const draft = { id: 'store-paid', expense_number: 'DEP-STORE', category: 'TRANSPORT', description: 'Transport magasin', amount: 5800,
      expense_date: 10, created_at: 10, created_by: 'super', created_by_name: 'Déclarant', store_id: 'antsahabe', store_name: 'Antsahabe', status: 'DRAFT', payment_status: 'PAID', payment_method: 'CASH' } as Expense;
    await saveExpense(draft, audit('store-draft'));
    const paid = await validateExpense(draft, 'super', audit('store-paid'), true, true, undefined, undefined, STORE_EXPENSE_FUNDS);
    assert.equal(paid.funding_source, 'STORE'); assert.equal(paid.paid_by, undefined);
    assert.equal(paid.paid_by_name, 'Antsahabe'); assert.equal(paid.payment_recorded_by, 'super');
    assert.equal(paid.treasury_movement_id, undefined);
    assert.equal((await read('treasuryFunds/pos-expense-pos')).balance, 200);
    const pending = { ...draft, id: 'store-pending', payment_status: 'PENDING' as const };
    await saveExpense(pending, audit('store-pending-draft'));
    await validateExpense(pending, 'super', audit('store-pending-validation'), true, true);
    const settled = await payValidatedExpense(pending.id, STORE_EXPENSE_FUNDS, 'super', audit('store-pending-paid'));
    assert.equal(settled.funding_source, 'STORE'); assert.equal(settled.payment_status, 'PAID');
    await assert.rejects(payValidatedExpense(pending.id, STORE_EXPENSE_FUNDS, 'super', audit('store-double-pay')));
    await cancelExpense(paid.id, 'Restitution à la caisse', 'Admin A', audit('store-cancel'));
    assert.equal((await getDoc(doc(db, 'treasuryMovements/expense-refund-store-paid'))).exists(), false);
    assert.equal((await read('treasuryFunds/pos-expense-pos')).balance, 200);
    const global = { ...draft, id: 'store-global', store_id: undefined, store_name: undefined };
    await saveExpense(global, audit('store-global'));
    await assert.rejects(validateExpense(global, 'super', audit('invalid-store'), true, true, undefined, undefined, STORE_EXPENSE_FUNDS));
    assert.equal((await read('expenses/store-global')).status, 'DRAFT');
  });
  await t.test('ADMIN cancels paid expense once and restores the original POS fund', async () => {
    await commit([write('users/super', { role: 'ADMIN', status: 'ACTIVE', permissions: [], assignedStores: [] })]);
    const results = await Promise.allSettled([
      cancelExpense('general', 'Facture annulée, argent récupéré', 'Admin A', audit('cancel-1')),
      cancelExpense('general', 'Facture annulée, argent récupéré', 'Admin A', audit('cancel-2'))
    ]);
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    const expense = await read('expenses/general');
    assert.equal(expense.status, 'CANCELLED'); assert.equal(expense.cancelled_by, 'super');
    assert.equal((await read('treasuryFunds/pos-expense-pos')).balance, 350);
    assert.equal(handoverAvailable(await read('cashHandovers/expense-pos') as CashHandover), 350);
    assert.equal((await read('treasuryMovements/expense-general')).kind, 'EXPENSE');
    assert.equal((await read('treasuryMovements/expense-refund-general')).kind, 'EXPENSE_REFUND');
    await assert.rejects(deleteExpense(expense as Expense, audit('admin-delete')));
    assert.equal((await commit([{ delete: `projects/${project}/databases/(default)/documents/expenses/general` }], token)).status, 403);
    await assert.rejects(payValidatedExpense('general', 'pos-expense-pos', 'super', audit('pay-cancelled')));
  });
  await t.test('cancellation refunds the original payer even when another admin cancels', async () => {
    const fund = (await getDocs(collection(db, 'treasuryFunds'))).docs.map(row => row.data()).find(row => row.owner_id === 'second')!;
    const originalBalance = fund.balance;
    await commit([
      write(`treasuryFunds/${fund.id}`, { ...fund, balance: originalBalance - 50, last_movement_id: 'expense-other-payer' }),
      write('treasuryMovements/expense-other-payer', { id: 'expense-other-payer', kind: 'EXPENSE', fund_id: fund.id, destination_fund_id: '', from_user: 'second', to_user: '', amount: 50, reference: 'DEP-OTHER', purchase_id: '', expense_id: 'other-payer', created_by: 'second', created_at: 5 }),
      write('expenses/other-payer', { id: 'other-payer', expense_number: 'DEP-OTHER', status: 'VALIDATED', category: 'RENT', amount: 50, payment_status: 'PAID', payment_method: 'CASH', created_by: 'second', treasury_fund_id: fund.id, treasury_movement_id: 'expense-other-payer', paid_by: 'second' })
    ]);
    await cancelExpense('other-payer', 'Remboursement', 'Admin A', audit('cancel-other'));
    assert.equal((await read(`treasuryFunds/${fund.id}`)).balance, originalBalance);
    assert.equal((await read('treasuryFunds/pos-expense-pos')).balance, 350);
    assert.equal((await read('treasuryMovements/expense-refund-other-payer')).to_user, 'second');
  });
  await t.test('draft and unpaid cancellations do not create money; only SUPER_ADMIN deletes', async () => {
    const pending = { id: 'cancel-pending', expense_number: 'DEP-NOT-PAID', status: 'VALIDATED', category: 'RENT', amount: 60, payment_status: 'PENDING', created_by: 'second' };
    await commit([write('expenses/cancel-pending', pending)]);
    await cancelExpense('cancel-pending', 'Plus nécessaire', 'Admin A', audit('cancel-pending'));
    assert.equal((await read('treasuryFunds/pos-expense-pos')).balance, 350);
    assert.equal((await getDoc(doc(db, 'treasuryMovements/expense-refund-cancel-pending'))).exists(), false);
    await commit([write('users/super', { role: 'SUPER_ADMIN', status: 'ACTIVE', permissions: [], assignedStores: [] })]);
    await deleteExpense(await read('expenses/general') as Expense, audit('super-delete-cancelled'));
    assert.equal((await getDoc(doc(db, 'expenses/general'))).exists(), false);
    assert.equal((await read('treasuryFunds/pos-expense-pos')).balance, 350);
    assert.equal((await read('treasuryMovements/expense-refund-general')).amount, 150);
    assert.equal((await commit([write('expenses/general', { ...pending, id: 'general', status: 'DRAFT', created_by: 'super', description: '', created_at: 20, expense_date: 20 })], token)).status, 403);
  });
  await t.test('salary deductions block cancellation; untouched advances cancel atomically', async () => {
    const advance = await read('salaryAdvances/advance-advance-expense');
    await commit([write('salaryAdvances/advance-advance-expense', { ...advance, amount_deducted: 10, payslip_id: 'payroll-test' })]);
    await assert.rejects(cancelExpense('advance-expense', 'Erreur', 'Admin A', audit('cancel-deducted')));
    assert.equal((await read('expenses/advance-expense')).status, 'VALIDATED');
    assert.equal((await read('treasuryFunds/pos-expense-pos')).balance, 350);
    await commit([write('salaryAdvances/advance-advance-expense', advance)]);
    await cancelExpense('advance-expense', 'Avance restituée', 'Admin A', audit('cancel-advance'));
    assert.equal((await getDoc(doc(db, 'salaryAdvances/advance-advance-expense'))).exists(), false);
    assert.equal((await read('treasuryFunds/pos-expense-pos')).balance, 420);
  });
  await t.test('non-admin and forged cancellations are rejected', async () => {
    await commit([write('users/super', { role: 'COMPTABLE', status: 'ACTIVE', permissions: ['expenses.view', 'expenses.create'], assignedStores: [] })]);
    await assert.rejects(cancelExpense('pending-general', 'Interdit', 'Comptable', audit('unauthorized-cancel')));
    const paid = (await commit([write('expenses/nonadmin', { id: 'nonadmin', category: 'RENT', status: 'VALIDATED', amount: 1, payment_status: 'PENDING', created_by: 'super' })]));
    assert.equal(paid.status, 200);
    assert.equal((await commit([write('expenses/nonadmin', { id: 'nonadmin', category: 'RENT', status: 'CANCELLED', amount: 1, payment_status: 'PENDING', created_by: 'super', cancelled_by: 'super', cancelled_by_name: 'Comptable', cancelled_at: 1, cancellation_reason: 'Interdit' })], token)).status, 403);
    await commit([write('users/super', { role: 'SUPER_ADMIN', status: 'ACTIVE', permissions: [], assignedStores: [] })]);
  });
  await t.test('historical handovers stay usable; non-admins cannot access treasury', async () => {
    const old = { ...handover, id: 'old', status: 'RECEIVED', received_amount: 100, received_by: 'super' };
    assert.equal((await commit([write('cashHandovers/old', old)])).status, 200);
    await recordCashHandoverDeposit(old as CashHandover, { amount: 100, bank_name: 'Banque', reference: 'OLD', deposited_by: 'super', deposited_by_name: 'Admin A', deposited_at: 6 }, 'super', audit('old'));
    assert.equal((await read('cashHandovers/old')).deposited_amount, 100);
    const remaining = { ...old, id: 'historical', deposited_amount: 40, status: 'PARTIALLY_DEPOSITED' };
    assert.equal((await commit([write('cashHandovers/historical', remaining)])).status, 200);
    await adoptHistoricalHandover(user, 'historical');
    assert.equal((await read('treasuryFunds/pos-historical')).balance, 60);
    await assert.rejects(adoptHistoricalHandover(user, 'historical'));
    await recordCashHandoverDeposit(await read('cashHandovers/historical') as CashHandover, { amount: 60, bank_name: 'Banque', reference: 'HIST', deposited_by: 'super', deposited_by_name: 'Admin A', deposited_at: 7 }, 'super', audit('historical'));
    assert.equal((await read('treasuryFunds/pos-historical')).balance, 0);
    await commit([write('users/super', { role: 'COMPTABLE', status: 'ACTIVE', permissions: [], assignedStores: [] })]);
    await assert.rejects(getDoc(doc(db, 'treasuryFunds/pos-h')));
    await assert.rejects(receiveTreasuryFunds(user, 'OTHER', 10, 'Forbidden'));
  });
  await terminate(db);
});
