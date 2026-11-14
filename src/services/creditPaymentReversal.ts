import type { CreditPaymentReversal, Sale } from '../types';

export function applyCreditPaymentReversal(sale: Sale, reversal: CreditPaymentReversal): Sale {
  const payment = sale.credit_payments?.find(item => item.id === reversal.id);
  if (sale.status !== 'VALIDATED' || sale.customer_type !== 'REVENDEUR' || !payment ||
      sale.credit_payment_reversals?.some(item => item.id === reversal.id)) throw new Error('Ce paiement ne peut plus être annulé.');
  if (!reversal.reason.trim() || reversal.reason.trim().length > 1000) throw new Error('Indiquez un motif de 1 à 1 000 caractères.');
  if (!Number.isSafeInteger(payment.amount) || payment.amount <= 0 || sale.amount_paid < payment.amount) throw new Error('Montant du paiement incohérent.');
  const amountPaid = sale.amount_paid - payment.amount;
  return { ...sale, amount_paid: amountPaid, payment_status: amountPaid >= sale.total ? 'PAID' : amountPaid > 0 ? 'PARTIAL' : 'PENDING',
    credit_payments: sale.credit_payments!.filter(item => item.id !== payment.id),
    credit_payment_reversals: [...(sale.credit_payment_reversals || []), { ...reversal, payment, reason: reversal.reason.trim() }],
    last_credit_reversal_id: reversal.id };
}
