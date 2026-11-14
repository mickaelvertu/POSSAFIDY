import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { db, runOnlineTransaction } from '../firebase';
import type { AppUser, Article, Store, Supplier } from '../types';
import { createAuditLog } from './auditService';
import { isPosOrderAdmin } from './posOrderService';
import { buildRawMaterialPurchase, validateRawMaterialLines } from './rawMaterialOrderValidation';
import type { RawMaterialOrder, RawMaterialOrderLine } from './rawMaterialOrderTypes';
import { validatePosLines } from './posOrderValidation';

export function subscribeRawMaterialOrders(user: AppUser, next: (orders: RawMaterialOrder[]) => void, error: (error: Error) => void) {
  const sorted = (rows: RawMaterialOrder[]) => next(rows.sort((a, b) => b.created_at - a.created_at));
  if (isPosOrderAdmin(user)) return onSnapshot(collection(db, 'rawMaterialOrders'), snapshot => sorted(snapshot.docs.map(row => row.data() as RawMaterialOrder)), error);
  if (!user.storeIds.length) { next([]); return () => {}; }
  const byStore = new Map<string, RawMaterialOrder[]>();
  const stops = user.storeIds.map(id => onSnapshot(query(collection(db, 'rawMaterialOrders'), where('created_by', '==', user.uid), where('store_id', '==', id)), snapshot => {
    byStore.set(id, snapshot.docs.map(row => row.data() as RawMaterialOrder)); sorted([...byStore.values()].flat());
  }, error));
  return () => stops.forEach(stop => stop());
}

export async function createRawMaterialOrder(user: AppUser, storeId: string, lines: RawMaterialOrderLine[], notes: string) {
  validatePosLines(lines);
  if (!user.isActive || (!isPosOrderAdmin(user) && (user.roleId !== 'RESPONSABLE_MAGASIN' || !user.storeIds.includes(storeId)))) throw new Error('Accès refusé pour ce dépôt.');
  const ref = doc(collection(db, 'rawMaterialOrders'));
  return runOnlineTransaction(async transaction => {
    const [store, ...articles] = await Promise.all([transaction.get(doc(db, 'stores', storeId)), ...lines.map(line => transaction.get(doc(db, 'articles', line.article_id)))]);
    if (!store.exists() || !store.data().is_active || store.data().store_type !== 'CENTRAL_WAREHOUSE') throw new Error('Choisissez un dépôt central actif.');
    const canonical = validateRawMaterialLines(lines.map(line => ({ ...line, unit_cost: 0 })), articles.map(row => ({ ...row.data(), id: row.id }) as Article));
    const now = Date.now();
    const order: RawMaterialOrder = { id: ref.id, order_number: `CMD-DEP-${ref.id.slice(0, 8).toUpperCase()}`, store_id: storeId, created_by: user.uid, created_by_name: user.displayName, lines: canonical, reviewed_lines: [], notes: notes.trim(), admin_note: '', status: 'PENDING', supplier_id: '', purchase_id: '', reviewed_by: '', created_at: now, updated_at: now };
    transaction.set(ref, order);
  });
}

export async function reviewRawMaterialOrder(user: AppUser, original: RawMaterialOrder, lines: RawMaterialOrderLine[], supplierId: string, note: string, decision: 'SAVE' | 'REJECT' | 'PURCHASE') {
  if (!user.isActive || !isPosOrderAdmin(user)) throw new Error('Analyse réservée aux administrateurs.');
  if (decision !== 'REJECT') {
    validatePosLines(lines);
  }
  if (decision === 'REJECT' && !note.trim()) throw new Error('Indiquez le motif du refus.');
  return runOnlineTransaction(async transaction => {
    const ref = doc(db, 'rawMaterialOrders', original.id);
    const snap = await transaction.get(ref);
    if (!snap.exists()) throw new Error('Commande introuvable.');
    const current = snap.data() as RawMaterialOrder;
    if (current.status !== 'PENDING' || current.purchase_id || current.updated_at !== original.updated_at) throw new Error('Cette commande a changé. Ouvrez-la à nouveau.');
    const now = Math.max(Date.now(), current.updated_at + 1);
    const articleDocs = decision === 'REJECT' ? [] : await Promise.all(lines.map(line => transaction.get(doc(db, 'articles', line.article_id))));
    const articles = articleDocs.map(row => ({ ...row.data(), id: row.id }) as Article);
    const canonical = decision === 'REJECT' ? current.reviewed_lines : validateRawMaterialLines(lines, articles);
    let purchaseId = '';
    if (decision === 'PURCHASE') {
      if (!supplierId) throw new Error('Choisissez un fournisseur.');
      const [store, supplier, existing] = await Promise.all([
        transaction.get(doc(db, 'stores', current.store_id)), transaction.get(doc(db, 'suppliers', supplierId)), transaction.get(doc(db, 'purchases', `purchase-raw-${current.id}`))
      ]);
      if (!store.exists() || !supplier.exists()) throw new Error('Dépôt ou fournisseur introuvable.');
      if (existing.exists()) throw new Error('Un achat existe déjà pour cette commande.');
      const purchase = buildRawMaterialPurchase(current, canonical, { ...store.data(), id: store.id } as Store, { ...supplier.data(), id: supplier.id } as Supplier, articles, user, note.trim(), now);
      purchaseId = purchase.id;
      const audit = createAuditLog(user, 'PURCHASE_DRAFT_CREATED', 'PURCHASE', purchase.id, undefined, purchase, purchase.store_id);
      transaction.set(doc(db, 'purchases', purchase.id), purchase);
      transaction.set(doc(db, 'auditLogs', audit.id), audit);
    }
    transaction.update(ref, { reviewed_lines: canonical, supplier_id: decision === 'REJECT' ? current.supplier_id : supplierId, admin_note: note.trim(), reviewed_by: user.uid, status: decision === 'PURCHASE' ? 'PURCHASE_CREATED' : decision === 'REJECT' ? 'REJECTED' : 'PENDING', purchase_id: purchaseId, updated_at: now });
  });
}
