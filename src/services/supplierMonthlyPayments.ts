import type { Purchase } from "../types";

/** Group actual payments by supplier, regardless of invoice creation or due date. */
export function supplierMonthlyPayments(purchases: Purchase[], month: string) {
  const totals = new Map<string, { total: number; count: number }>();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return totals;
  const [year, monthNumber] = month.split("-").map(Number);
  const start = new Date(year, monthNumber - 1, 1).getTime();
  const end = new Date(year, monthNumber, 1).getTime();
  for (const purchase of purchases) {
    for (const payment of purchase.payments ?? []) {
      if (payment.paid_at < start || payment.paid_at >= end || !Number.isFinite(payment.paid_at) || !Number.isFinite(payment.amount) || payment.amount <= 0) continue;
      const previous = totals.get(purchase.supplier_id) ?? { total: 0, count: 0 };
      totals.set(purchase.supplier_id, { total: previous.total + payment.amount, count: previous.count + 1 });
    }
  }
  return totals;
}
