import { collection, doc, getDocs, onSnapshot, query, where } from 'firebase/firestore';
import { db, runOnlineTransaction } from '../firebase';
import type { AppUser, Article, Sale } from '../types';
import { aggregateProductionSales, productionPeriod, type ProductionOrder, type ProductionPeriod } from './productionOrderCalculation';
import { validatePosLines } from './posOrderValidation';
import type { PosOrderLine } from './posOrderTypes';
export const productionOrderAdmin = (user: AppUser) => user.isActive && ['ADMIN', 'SUPER_ADMIN'].includes(user.roleId);
export function subscribeProductionOrders(user: AppUser, next: (rows: ProductionOrder[]) => void, error: (error: Error) => void) {
  const rows = new Map<string, ProductionOrder[]>();
  const emit = () => next([...rows.values()].flat().sort((a,b) => b.created_at - a.created_at));
  if (productionOrderAdmin(user)) return onSnapshot(collection(db, 'productionOrders'), s => { rows.set('all', s.docs.map(d => d.data() as ProductionOrder)); emit(); }, error);
  next([]);
  const stops = user.storeIds.map(id => onSnapshot(query(collection(db, 'productionOrders'), where('store_id', '==', id), where('status', '==', 'PUBLISHED')), s => { rows.set(id, s.docs.map(d => d.data() as ProductionOrder)); emit(); }, error));
  return () => stops.forEach(stop => stop());
}
export async function generateProductionOrder(user: AppUser, articles: Article[], period: ProductionPeriod, date: string, storeId: string) {
  if (!productionOrderAdmin(user)) throw new Error('Action réservée aux administrateurs.');
  const { start, end } = productionPeriod(period, date);
  const snapshot = await getDocs(query(collection(db, 'sales'), where('created_at', '>=', start), where('created_at', '<', end)));
  const lines = aggregateProductionSales(snapshot.docs.map(d => d.data() as Sale), articles, start, end);
  if (!lines.length) throw new Error('Aucune quantit? vendue ?ligible sur cette p?riode. Choisissez une autre semaine ou un autre mois.');
  validatePosLines(lines);
  const ref = doc(collection(db, 'productionOrders'));
  await runOnlineTransaction(async tx => {
    const store = await tx.get(doc(db, 'stores', storeId));
    if (!store.exists() || !store.data().is_active || store.data().store_type !== 'MANUFACTURER') throw new Error('Choisissez un magasin PRD actif.');
    const now = Date.now();
    tx.set(ref, { id: ref.id, order_number: `CMD-PRD-${ref.id.slice(0,8).toUpperCase()}`, store_id: storeId, period, start, end, lines, reviewed_lines: lines, admin_note: '', status: 'DRAFT', created_by: user.uid, created_at: now, updated_at: now } satisfies ProductionOrder);
  });
}
export async function saveProductionOrder(user: AppUser, order: ProductionOrder, lines: PosOrderLine[], note: string, publish: boolean) {
  if (!productionOrderAdmin(user)) throw new Error('Action réservée aux administrateurs.');
  validatePosLines(lines);
  await runOnlineTransaction(async tx => {
    const ref = doc(db, 'productionOrders', order.id);
    const current = await tx.get(ref);
    const store = await tx.get(doc(db, 'stores', order.store_id));
    const articles = await Promise.all(lines.map(line => tx.get(doc(db, 'articles', line.article_id))));
    if (!current.exists() || current.data().status !== 'DRAFT' || current.data().updated_at !== order.updated_at) throw new Error('Commande modifiée. Fermez et ouvrez à nouveau la commande.');
    if (!store.exists() || !store.data().is_active || store.data().store_type !== 'MANUFACTURER') throw new Error('Magasin PRD indisponible.');
    const canonical = lines.map((line, i) => { const a = articles[i].data() as Article | undefined; if (!a?.is_active || a.article_type !== 'RESALE') throw new Error('Un article est indisponible.'); return { ...line, article_code: a.code, article_name: a.name, unit: a.unit }; });
    tx.update(ref, { reviewed_lines: canonical, admin_note: note.trim(), status: publish ? 'PUBLISHED' : 'DRAFT', updated_at: Math.max(Date.now(), order.updated_at + 1) });
  });
}
