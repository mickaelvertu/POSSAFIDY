import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { db, runOnlineTransaction } from '../firebase';
import type { AppUser, Purchase, StockTransfer, StoreStock, StockMovement } from '../types';
import { purchaseCancellationPlan } from './purchaseCancellation';
import { transferLinesEqual } from './transferComparison';
import { createAuditLog } from './auditService';

export async function cancelPurchase(original: Purchase, actor: AppUser, reason: string) {
  if (actor.roleId !== 'SUPER_ADMIN') throw new Error('Annulation réservée au super administrateur.');
  if (!reason.trim()) throw new Error("Indiquez le motif de l'annulation.");
  const initial = original.transfer_id ? await getDoc(doc(db, 'transfers', original.transfer_id)) : null;
  const transfer = initial?.exists() ? initial.data() as StockTransfer : undefined;
  const plan = purchaseCancellationPlan(original, transfer);
  if (plan.quantities.size > 200) throw new Error('Cet achat comporte trop de lignes pour une annulation atomique (200 articles maximum).');
  const targets = await Promise.all([...plan.quantities].map(async ([articleId, quantity]) => {
    const matches = await getDocs(query(collection(db, 'stocks'), where('store_id', '==', original.store_id), where('article_id', '==', articleId)));
    if (matches.size !== 1) throw new Error('Stock absent ou en doublon pour ' + articleId + '. Corrigez le stock avant annulation.');
    return { ref: matches.docs[0].ref, articleId, quantity };
  }));
  return runOnlineTransaction(async transaction => {
    const ref = doc(db, 'purchases', original.id);
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) throw new Error('Achat introuvable.');
    const current = snapshot.data() as Purchase;
    if (current.updated_at !== original.updated_at || current.store_id !== original.store_id || current.transfer_id !== original.transfer_id) throw new Error("L'achat a changé. Rechargez avant annulation.");
    const transferRef = current.transfer_id ? doc(db, 'transfers', current.transfer_id) : null;
    const linked = transferRef ? await transaction.get(transferRef) : null;
    const latest = linked?.exists() ? linked.data() as StockTransfer : undefined;
    const checked = purchaseCancellationPlan(current, latest);
    if (transfer && (!latest || latest.status !== transfer.status || !transferLinesEqual(latest.lines, transfer.lines))) throw new Error('La réception a changé. Rechargez avant annulation.');
    const stockSnapshots = await Promise.all(targets.map(target => transaction.get(target.ref)));
    const now = Date.now();
    const stocks: StoreStock[] = [];
    const movements: StockMovement[] = [];
    targets.forEach((target, index) => {
      const stock = stockSnapshots[index].data() as StoreStock | undefined;
      if (!stock || stock.store_id !== current.store_id || stock.article_id !== target.articleId) throw new Error('Stock modifié ou absent.');
      const after = stock.quantity - target.quantity;
      if (!Number.isFinite(after) || after < 0 || after < (stock.reserved_quantity || 0)) throw new Error('Stock disponible insuffisant pour ' + target.articleId + ' : annulation impossible.');
      stocks.push({ ...stock, quantity: after, purchase_cancellation_id: current.id, updated_at: now });
      movements.push({ id: 'cancel-purchase-' + current.id + '-' + index, store_id: current.store_id, article_id: target.articleId, movement_type: 'INVENTORY_ADJUSTMENT', quantity: -target.quantity, reference_type: 'PURCHASE_CANCELLATION', reference_id: current.id, reference_number: current.purchase_number, before_quantity: stock.quantity, after_quantity: after, created_by: actor.uid, created_by_name: actor.displayName, notes: reason.trim(), created_at: now });
    });
    const purchase: Purchase = { ...current, status: 'CANCELLED', cancelled_by: actor.uid, cancelled_by_name: actor.displayName, cancelled_at: now, cancellation_reason: reason.trim(), refund_due_amount: checked.refundDue, updated_at: now };
    const cancelledTransfer: StockTransfer | undefined = latest ? { ...latest, status: 'CANCELLED', cancelled_by: actor.uid, cancelled_by_name: actor.displayName, cancelled_at: now, updated_at: now } : undefined;
    const auditLog = createAuditLog(actor, 'PURCHASE_CANCELLED', 'PURCHASE', current.id, current, purchase, current.store_id);
    stocks.forEach((stock, index) => transaction.set(targets[index].ref, stock));
    movements.forEach(movement => transaction.set(doc(db, 'movements', movement.id), movement));
    transaction.set(ref, purchase);
    if (transferRef && cancelledTransfer) transaction.set(transferRef, cancelledTransfer);
    transaction.set(doc(db, 'auditLogs', auditLog.id), auditLog);
    return { purchase, transfer: cancelledTransfer, stocks, movements, auditLog };
  });
}
