import type { Article, Sale } from '../types';
import type { PosOrderLine } from './posOrderTypes';
export type ProductionPeriod = 'WEEK' | 'MONTH';
export interface ProductionOrder {
  id: string; order_number: string; store_id: string; period: ProductionPeriod;
  start: number; end: number; lines: PosOrderLine[]; reviewed_lines: PosOrderLine[];
  admin_note: string; status: 'DRAFT' | 'PUBLISHED'; created_by: string;
  created_at: number; updated_at: number;
}
// Calendar periods in the business timezone (UTC+3), with an exclusive end.
export function productionPeriod(period: ProductionPeriod, date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Choisissez une date valide.');
  const day = new Date(`${date}T00:00:00+03:00`);
  if (!Number.isFinite(day.getTime()) || new Date(day.getTime() + 10800000).toISOString().slice(0, 10) !== date) throw new Error('Date invalide.');
  const calendar = new Date(day.getTime() + 10800000);
  if (period === 'MONTH') {
    return { start: Date.UTC(calendar.getUTCFullYear(), calendar.getUTCMonth(), 1) - 10800000, end: Date.UTC(calendar.getUTCFullYear(), calendar.getUTCMonth() + 1, 1) - 10800000 };
  }
  const start = day.getTime() - ((calendar.getUTCDay() + 6) % 7) * 86400000;
  return { start, end: start + 7 * 86400000 };
}
export function aggregateProductionSales(sales: Sale[], articles: Article[], start: number, end: number): PosOrderLine[] {
  const catalogue = new Map(articles.filter(a => a.is_active && a.article_type === 'RESALE').map(a => [a.id, a]));
  const totals = new Map<string, number>();
  for (const sale of sales) {
    if (sale.status !== 'VALIDATED' || sale.created_at < start || sale.created_at >= end) continue;
    for (const line of sale.lines) {
      if (line.line_type === 'SERVICE' || !catalogue.has(line.article_id) || !Number.isFinite(line.quantity) || line.quantity <= 0) continue;
      totals.set(line.article_id, (totals.get(line.article_id) || 0) + line.quantity);
    }
  }
  return [...totals].map(([id, quantity]) => { const a = catalogue.get(id)!; return { article_id: id, article_code: a.code, article_name: a.name, unit: a.unit, quantity: Math.round(quantity * 1e6) / 1e6 }; }).sort((a, b) => a.article_name.localeCompare(b.article_name));
}

