import type { Purchase } from '../types';
export type CalendarPaymentEntry = Pick<Purchase, 'id' | 'supplier_id' | 'supplier_name' | 'purchase_number' | 'status' | 'payment_status' | 'expected_payment_at' | 'total' | 'amount_paid'>;

export function calendarDays(anchor: Date, view: 'month' | 'week'): Date[] {
  const start = new Date(anchor.getFullYear(), anchor.getMonth(), view === 'month' ? 1 : anchor.getDate());
  const end = new Date(start);
  if (view === 'month') end.setMonth(end.getMonth() + 1, 0);
  start.setDate(start.getDate() - (start.getDay() + 6) % 7);
  if (view === 'week') end.setTime(start.getTime());
  end.setDate(end.getDate() + 6 - (end.getDay() + 6) % 7);
  const days: Date[] = [];
  for (const day = new Date(start); day <= end; day.setDate(day.getDate() + 1)) days.push(new Date(day));
  return days;
}

export function scheduledSupplierPurchases<T extends CalendarPaymentEntry>(purchases: T[], includePaid = false): T[] {
  return purchases.filter(p => p.status !== 'DRAFT' && p.status !== 'CANCELLED'
    && (includePaid || (p.payment_status !== 'PAID' && p.total > p.amount_paid))
    && Number.isFinite(p.expected_payment_at) && Number.isFinite(p.total - p.amount_paid) && p.total > 0)
    .sort((a, b) => a.expected_payment_at - b.expected_payment_at || a.supplier_name.localeCompare(b.supplier_name, 'fr'));
}

export function supplierCalendarTotals(purchases: Pick<CalendarPaymentEntry, 'total' | 'amount_paid'>[]) {
  return purchases.reduce((totals, purchase) => {
    const paid = Math.min(purchase.total, Math.max(0, purchase.amount_paid));
    return { paid: totals.paid + paid, unpaid: totals.unpaid + purchase.total - paid, total: totals.total + purchase.total };
  }, { paid: 0, unpaid: 0, total: 0 });
}

export const calendarDateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
