import type { Expense, Sale } from "../types";

export const cashBusinessDate = (timestamp: number) => {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

export function calculateStoreDailyTotals(sales: Sale[], expenses: Expense[], storeId: string, businessDate: string) {
  const validatedSales = sales.filter(sale => sale.store_id === storeId && sale.status === "VALIDATED" && cashBusinessDate(sale.created_at) === businessDate);
  const salesAmount = validatedSales.reduce((total, sale) => total + sale.total, 0);
  const expensesAmount = expenses.filter(expense => expense.store_id === storeId && expense.status !== "DRAFT" && expense.status !== "CANCELLED" &&
    expense.payment_status === "PAID" && cashBusinessDate(expense.expense_date) === businessDate)
    .reduce((total, expense) => total + expense.amount, 0);
  return { salesAmount, expensesAmount, netAmount: salesAmount - expensesAmount };
}

export function calculateCashClosing(sales: Sale[], expenses: Expense[], storeId: string, businessDate: string) {
  let salesAmount = 0;
  let saleCount = 0;
  for (const sale of sales) {
    if (sale.store_id !== storeId || sale.status !== "VALIDATED") continue;
    const payments = sale.credit_payments || [];
    // amount_paid is cumulative. Separate the original payment from later
    // settlements so today's receipt never changes an older day's closing.
    const initial = sale.payment_method === "CASH" && sale.payment_status !== "PENDING" && cashBusinessDate(sale.created_at) === businessDate
      ? Math.max(0, sale.amount_paid - payments.reduce((sum, payment) => sum + payment.amount, 0) - (sale.change_returned || 0)) : 0;
    const later = payments.filter(payment => payment.method === "CASH" && payment.cash_destination !== "TREASURY" &&
      cashBusinessDate(payment.paid_at) === businessDate).reduce((sum, payment) => sum + payment.amount, 0);
    salesAmount += initial + later;
    if (initial + later > 0) saleCount++;
  }
  const expensesAmount = expenses.filter(expense => expense.store_id === storeId && expense.status !== "DRAFT" && expense.status !== "CANCELLED" &&
    !expense.treasury_movement_id && expense.payment_method === "CASH" && expense.payment_status === "PAID" && cashBusinessDate(expense.expense_date) === businessDate)
    .reduce((total, expense) => total + expense.amount, 0);
  return { salesAmount, expensesAmount, netAmount: salesAmount - expensesAmount, saleCount };
}
