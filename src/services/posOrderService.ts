import { validatePosLines } from './posOrderValidation';
﻿import { collection, doc, onSnapshot, query, setDoc, where } from 'firebase/firestore';
import { db, runOnlineTransaction } from '../firebase';
import type { AppUser, Article, StockTransfer, Store } from '../types';
import type { PosOrder, PosOrderLine } from './posOrderTypes';

export const isPosOrderAdmin = (user: AppUser) => ['ADMIN', 'SUPER_ADMIN'].includes(user.roleId);
export function subscribePosOrders(user: AppUser, next: (orders: PosOrder[]) => void, error: (error: Error) => void) {
  if (isPosOrderAdmin(user)) return onSnapshot(collection(db, 'posOrders'), snapshot => next(snapshot.docs.map(row => row.data() as PosOrder).sort((a, b) => b.created_at - a.created_at)), error);
  const rowsByStore = new Map<string, PosOrder[]>();
  if (!user.storeIds.length) { next([]); return () => {}; }
  const stops = user.storeIds.map(storeId => onSnapshot(query(collection(db, 'posOrders'), where('created_by', '==', user.uid), where('store_id', '==', storeId)), snapshot => {
    rowsByStore.set(storeId, snapshot.docs.map(row => row.data() as PosOrder));
    next([...rowsByStore.values()].flat().sort((a, b) => b.created_at - a.created_at));
  }, error));
  return () => stops.forEach(stop => stop());
}
export async function createPosOrder(user: AppUser, store: Store, lines: PosOrderLine[], notes: string) {
  if (!user.isActive || (!isPosOrderAdmin(user) && (user.roleId !== 'RESPONSABLE_MAGASIN' || !user.storeIds.includes(store.id)))) throw new Error('Accès refusé pour ce magasin.');
  if (!store.is_active || store.store_type !== 'POS') throw new Error('Sélectionnez un point de vente actif.');
  validatePosLines(lines);
  const ref = doc(collection(db, 'posOrders'));
  const now = Date.now();
  const order: PosOrder = { id: ref.id, order_number: `CMD-POS-${ref.id.slice(0, 8).toUpperCase()}`, store_id: store.id, created_by: user.uid, created_by_name: user.displayName, lines, reviewed_lines: [], notes, admin_note: '', status: 'PENDING', source_store_id: '', transfer_id: '', reviewed_by: '', created_at: now, updated_at: now };
  await setDoc(ref, order);
}
export async function reviewPosOrder(user: AppUser, original: PosOrder, lines: PosOrderLine[], sourceId: string, note: string, decision: 'SAVE' | 'REJECT' | 'TRANSFER') {
  if (!user.isActive || !isPosOrderAdmin(user)) throw new Error('Analyse réservée aux administrateurs.');
  if (decision !== 'REJECT') validatePosLines(lines);
  if (decision === 'REJECT' && !note.trim()) throw new Error('Indiquez le motif du refus.');
  return runOnlineTransaction(async transaction => {
    const ref = doc(db, 'posOrders', original.id);
    const snap = await transaction.get(ref);
    if (!snap.exists()) throw new Error('Commande introuvable.');
    const current = snap.data() as PosOrder;
    if (current.status !== 'PENDING' || current.updated_at !== original.updated_at) throw new Error('Cette commande a changé. Ouvrez-la à nouveau.');
    const now = Math.max(Date.now(), current.updated_at + 1);
    let transfer: StockTransfer | undefined;
    if (decision === 'TRANSFER') {
      const transferId = `trf-pos-${current.id}`;
      const [source, destination, existing, ...articleDocs] = await Promise.all([
        transaction.get(doc(db, 'stores', sourceId)), transaction.get(doc(db, 'stores', current.store_id)), transaction.get(doc(db, 'transfers', transferId)),
        ...lines.map(line => transaction.get(doc(db, 'articles', line.article_id)))
      ]);
      if (!source.exists() || source.data().store_type !== 'CENTRAL_WAREHOUSE' || !source.data().is_active || !destination.exists() || destination.data().store_type !== 'POS' || !destination.data().is_active) throw new Error('Le dépôt et le point de vente doivent être actifs.');
      if (existing.exists()) throw new Error('Un transfert existe déjà pour cette commande.');
      const canonicalLines = lines.map((line, index) => {
        const article = articleDocs[index].data() as Article | undefined;
        if (!article?.is_active) throw new Error(`Article indisponible : ${line.article_name}.`);
        return { ...line, article_code: article.code, article_name: article.name, unit: article.unit };
      });
      transfer = { id: transferId, transfer_number: `TRF-${current.order_number}`, type: 'CENTRAL_TO_POS', source_store_id: sourceId, destination_store_id: current.store_id, status: 'DRAFT', requested_by: user.uid, requested_by_name: user.displayName, lines: canonicalLines.map((line, index) => ({ ...line, id: `${transferId}-${index}`, transfer_id: transferId, quantity_sent: line.quantity, quantity_received: 0, quantity_accepted: 0, quantity_rejected: 0 })), note: `Commande ${current.order_number}. ${note}`, created_at: now, updated_at: now };
      transaction.set(doc(db, 'transfers', transferId), transfer);
    }
    transaction.update(ref, { reviewed_lines: decision === 'REJECT' ? current.reviewed_lines : lines, admin_note: note, source_store_id: sourceId, reviewed_by: user.uid, status: decision === 'TRANSFER' ? 'TRANSFER_CREATED' : decision === 'REJECT' ? 'REJECTED' : 'PENDING', transfer_id: transfer?.id || '', updated_at: now });
  });
}
