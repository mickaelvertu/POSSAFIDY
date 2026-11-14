import type { Expense, Purchase, TreasuryFund, TreasuryMovement } from '../types';

/** Resolve the same counterparties for the ledger, search, popups and exports. */
export function treasuryCounterparties(funds: TreasuryFund[], purchases: Purchase[], expenses: Expense[]) {
  const fundsById = new Map(funds.map(f => [f.id, f]));
  const owners = new Map(funds.map(f => [f.owner_id, f.owner_name]));
  const purchasesById = new Map(purchases.map(p => [p.id, p]));
  const purchasesByReference = new Map(purchases.map(p => [p.purchase_number, p]));
  const expensesById = new Map(expenses.map(e => [e.id, e]));
  const expensesByReference = new Map(expenses.map(e => [e.expense_number, e]));
  const person = (id: string) => owners.get(id) || id;
  const origins = { POS: 'Remise POS / DEP', BANK: 'Retrait bancaire', OTHER: 'Autre source', OPENING: 'Solde initial' };
  return (m: TreasuryMovement): { from: string; to: string } => {
    const purchase = purchasesById.get(m.purchase_id) || purchasesByReference.get(m.reference);
    const expense = expensesById.get(m.expense_id || '') || expensesByReference.get(m.reference.split(' / ')[0]);
    const beneficiary = expense?.payee?.trim() || expense?.employee_name?.trim();
    let from = m.from_user ? person(m.from_user) : 'Source externe';
    let to = m.to_user ? person(m.to_user) : 'Destinataire non renseigné';
    if (m.kind === 'PURCHASE') to = purchase?.supplier_name?.trim() ? `Fournisseur · ${purchase.supplier_name.trim()}` : 'Fournisseur non renseigné';
    if (m.kind === 'EXPENSE') to = beneficiary ? `Bénéficiaire · ${beneficiary}` : 'Bénéficiaire non renseigné';
    if (m.kind === 'EXPENSE_REFUND') from = beneficiary ? `Remboursement · ${beneficiary}` : 'Remboursement de dépense';
    if (m.kind === 'RECEIPT_REVERSAL') to = 'Annulation d’encaissement revendeur';
    if (m.kind === 'DEPOSIT') to = m.reference.trim() ? `Banque · ${m.reference.trim()}` : 'Banque';
    if (m.kind === 'RECEIPT' && !m.from_user) {
      const fund = fundsById.get(m.destination_fund_id);
      if (fund) from = `${origins[fund.source]}${fund.source_reference ? ' · ' + fund.source_reference : ''}`;
    }
    return { from, to };
  };
}
