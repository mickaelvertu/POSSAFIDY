import type { CreditCustomer, CreditPayment } from '../types';
export interface ManualCreditDebt {
  id: string; customer_id: string; customer_name: string; reference: string; note: string;
  amount: number; amount_paid: number; due_at: number; created_at: number;
  created_by: string; created_by_name: string; updated_at: number;
  payments: CreditPayment[]; last_audit_id: string;
}
export function validateManualDebt(customer: CreditCustomer, amount: number, dueAt: number, reference: string) {
  if (!customer.is_active) throw new Error('Ce compte revendeur est désactivé.');
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('Saisissez un montant entier positif en ariary.');
  if (!Number.isSafeInteger(dueAt) || dueAt <= 0 || Number.isNaN(new Date(dueAt).getTime())) throw new Error('Indiquez une échéance valide.');
  if (!reference.trim() || reference.trim().length > 150) throw new Error('Indiquez une référence de 150 caractères maximum.');
  if (customer.outstanding_balance + amount > customer.credit_limit) throw new Error('Le montant dépasse le crédit disponible. Ajustez le plafond du revendeur si nécessaire.');
}
export function manualDebtRemaining(debt: Pick<ManualCreditDebt, 'amount' | 'amount_paid'>) { return Math.max(0, debt.amount - debt.amount_paid); }
export function validateManualPayment(debt: ManualCreditDebt, amount: number) {
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > manualDebtRemaining(debt)) throw new Error('Le montant doit être positif et ne pas dépasser le solde restant.');
}
