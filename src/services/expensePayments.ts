import type { Expense } from '../types';

export function expensePaidAmount(expense: Expense): number {
  if (expense.status === 'DRAFT') return 0;
  return expense.amount_paid ?? (expense.payment_status === 'PAID' ? expense.amount : 0);
}

export const expenseRemainingAmount = (expense: Expense) => Math.max(0, expense.amount - expensePaidAmount(expense));

export function assertExpensePayment(expense: Expense, amount: number) {
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > expenseRemainingAmount(expense)) {
    throw new Error('Indiquez un montant entier positif, inférieur ou égal au reste à payer.');
  }
}

export const expensePaymentLabel = (expense: Expense) => expense.payment_status === 'PAID' ? 'Payée' : expense.payment_status === 'PARTIAL' ? 'Partiellement payée' : 'À payer';
