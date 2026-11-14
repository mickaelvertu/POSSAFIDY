import type { Purchase, StockTransfer } from '../types';

export function purchaseCancellationPlan(purchase: Purchase, transfer?: StockTransfer) {
  const status = purchase.status || 'RECEIVED';
  if (status === 'CANCELLED') throw new Error('Cet achat est déjà annulé.');
  if (!['DRAFT', 'APPROVED', 'RECEIVED'].includes(status)) throw new Error("Statut d'achat incompatible avec une annulation.");
  const paid = purchase.amount_paid;
  if (!Number.isFinite(paid) || paid < 0 || paid > purchase.total ||
    purchase.payments.some(p => !Number.isFinite(p.amount) || p.amount <= 0) ||
    purchase.payments.reduce((sum, p) => sum + p.amount, 0) !== paid ||
    purchase.payment_status !== (paid === 0 ? 'UNPAID' : paid === purchase.total ? 'PAID' : 'PARTIAL')) {
    throw new Error('Les paiements et le statut de paiement sont incohérents. Rapprochez les règlements avant annulation.');
  }
  if (status === 'DRAFT' && (paid > 0 || transfer || purchase.transfer_id)) throw new Error('Ce brouillon contient déjà une livraison ou un paiement.');
  if (status !== 'DRAFT' && (!transfer || transfer.id !== purchase.transfer_id || transfer.purchase_id !== purchase.id || transfer.type !== 'SUPPLIER_TO_STORE' || transfer.destination_store_id !== purchase.store_id)) {
    throw new Error('Livraison fournisseur absente ou incohérente : rapprochement manuel nécessaire.');
  }
  if (transfer && (!Array.isArray(transfer.lines) || transfer.lines.length === 0)) throw new Error('La livraison ne contient aucune ligne exploitable.');
  const credited = transfer && ['VALIDATED', 'DISCREPANCY'].includes(transfer.status);
  if (transfer && !['IN_TRANSIT', 'RECEIVED', 'VALIDATED', 'DISCREPANCY'].includes(transfer.status)) throw new Error('Cette livraison ne peut plus être annulée.');
  if ((status === 'RECEIVED') !== !!credited) throw new Error("Le statut de l'achat ne correspond pas à sa réception.");
  const quantities = new Map<string, number>();
  if (credited && transfer) for (const line of transfer.lines) {
    if (!line.article_id || !Number.isFinite(line.quantity_accepted) || line.quantity_accepted < 0) throw new Error('Quantité réceptionnée invalide.');
    if (line.quantity_accepted > 0) quantities.set(line.article_id, (quantities.get(line.article_id) || 0) + line.quantity_accepted);
  }
  return { refundDue: paid, quantities };
}
