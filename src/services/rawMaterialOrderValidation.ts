import type { Article, AppUser, Purchase, Store, Supplier } from '../types';
import type { RawMaterialOrder, RawMaterialOrderLine } from './rawMaterialOrderTypes';
import { validatePosLines } from './posOrderValidation';

export function validateRawMaterialLines(lines: RawMaterialOrderLine[], articles: Article[]) {
  validatePosLines(lines);
  return lines.map(line => {
    const article = articles.find(item => item.id === line.article_id);
    if (!article?.is_active || article.article_type !== 'RAW_MATERIAL') throw new Error('Choisissez uniquement des matières premières actives.');
    if (!Number.isFinite(line.unit_cost) || line.unit_cost < 0 || !Number.isFinite(line.quantity * line.unit_cost)) throw new Error('Le prix unitaire doit être un nombre positif ou nul.');
    return { article_id: article.id, article_code: article.code, article_name: article.name, unit: article.unit, quantity: line.quantity, unit_cost: line.unit_cost };
  });
}

export function buildRawMaterialPurchase(order: RawMaterialOrder, lines: RawMaterialOrderLine[], store: Store, supplier: Supplier, articles: Article[], user: AppUser, note: string, now: number): Purchase {
  if (order.status !== 'PENDING' || order.purchase_id) throw new Error('Cette commande a déjà été traitée.');
  if (store.id !== order.store_id || !store.is_active || store.store_type !== 'CENTRAL_WAREHOUSE') throw new Error('Choisissez un dépôt central actif.');
  if (!supplier.is_active || supplier.deleted_at) throw new Error('Choisissez un fournisseur actif.');
  const canonical = validateRawMaterialLines(lines, articles);
  const total = canonical.reduce((sum, line) => sum + line.quantity * line.unit_cost, 0);
  if (!Number.isFinite(total)) throw new Error('Le montant total de la commande est trop élevé.');
  return {
    id: `purchase-raw-${order.id}`, purchase_number: `ACH-${order.order_number}`,
    status: 'DRAFT', supplier_id: supplier.id, supplier_name: supplier.name, store_id: store.id,
    created_by: user.uid, created_by_name: user.displayName,
    invoice_number: '', lines: canonical.map((line, index) => ({ ...line, id: `raw-${order.id}-${index}`, total: line.quantity * line.unit_cost })),
    total, amount_paid: 0, payment_status: 'UNPAID', payments: [], expected_payment_at: now,
    notes: [`Commande ${order.order_number}`, order.notes, note].filter(Boolean).join('\n'),
    raw_material_order_id: order.id, created_at: now, updated_at: now
  };
}
