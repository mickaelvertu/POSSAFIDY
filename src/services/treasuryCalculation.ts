import type { CashHandover, TreasuryFund } from "../types";

export function handoverAvailable(handover: CashHandover): number {
  return (handover.received_amount ?? 0) - handover.deposited_amount - (handover.allocated_amount ?? 0);
}

export function assertFundDebit(fund: TreasuryFund, owner: string, amount: number) {
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error("Le montant doit être un entier positif en ariary.");
  if (fund.owner_id !== owner) throw new Error("Vous ne pouvez utiliser que vos propres fonds.");
  if (amount > fund.balance) throw new Error("Le solde du fonds est insuffisant.");
}
