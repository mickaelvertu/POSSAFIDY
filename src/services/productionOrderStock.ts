import type { Production, StockTransfer, StoreStock } from '../types';

export function productionOrderStock(stocks: StoreStock[], transfers: StockTransfer[], productions: Production[], storeIds?: string[]) {
  const allowed = (id: string) => storeIds === undefined || storeIds.includes(id);
  const approved = new Map<string, number>();
  const used = new Map<string, number>();
  const key = (storeId: string, articleId: string) => JSON.stringify([storeId, articleId]);
  for (const transfer of transfers) {
    if (transfer.type !== 'RECYCLING' || !['VALIDATED', 'DISCREPANCY'].includes(transfer.status) || !allowed(transfer.destination_store_id)) continue;
    for (const line of transfer.lines) {
      if (line.recycling_decision !== 'RECYCLED' || !line.recycled_available) continue;
      const id = key(transfer.destination_store_id, line.article_id);
      approved.set(id, (approved.get(id) || 0) + line.quantity_accepted);
    }
  }
  for (const production of productions) {
    if (production.status !== 'COMPLETED' || !allowed(production.manufacturer_store_id)) continue;
    for (const line of production.consumptions) {
      if (line.source !== 'RECYCLED') continue;
      const id = key(production.manufacturer_store_id, line.article_id);
      used.set(id, (used.get(id) || 0) + line.quantity);
    }
  }
  const totals = new Map<string, { normal: number; quarantine: number; ready: number }>();
  for (const stock of stocks) {
    if (!allowed(stock.store_id)) continue;
    const total = totals.get(stock.article_id) || { normal: 0, quarantine: 0, ready: 0 };
    const quarantine = stock.quarantine_quantity || 0;
    const id = key(stock.store_id, stock.article_id);
    total.normal += stock.quantity; // quantity already excludes the separate quarantine bucket.
    total.quarantine += quarantine;
    total.ready += Math.max(0, Math.min((approved.get(id) || 0) - (used.get(id) || 0), quarantine));
    totals.set(stock.article_id, total);
  }
  return totals;
}
