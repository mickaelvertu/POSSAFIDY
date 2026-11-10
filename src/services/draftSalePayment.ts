import type { Sale } from "../types";

/** Correct the initial draft receipt while retaining its date and collector. */
export function draftSalePayments(original: Sale, amountPaid: number) {
  if (!Number.isFinite(amountPaid) || amountPaid < 0) throw new Error("Le montant encaissé doit être un nombre positif ou nul.");
  if (!original.credit_customer_id || amountPaid === original.amount_paid) return original.credit_payments;
  const payments = original.credit_payments || [];
  if (payments.length > 1 || payments.some(payment => payment.cash_destination)) {
    throw new Error("Cette vente comporte des règlements séparés. Corrigez ces encaissements avant de modifier le montant du brouillon.");
  }
  const amount = Math.min(amountPaid, original.total);
  if (amount === 0) return [];
  return [{
    ...(payments[0] || {
      id: `draft-payment-${original.id}`,
      method: original.payment_method,
      paid_at: original.created_at,
      recorded_by: original.seller_id,
      recorded_by_name: original.seller_name
    }),
    amount
  }];
}
