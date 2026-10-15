import type { Expense, Sale } from "../types";

export const cashBusinessDate = (timestamp: number) => {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

export function calculateCashClosing(sales: Sale[], expenses: Expense[], storeId: string, businessDate: string) {
  const cashSales = sales.filter(sale => sale.store_id === storeId && sale.status === "VALIDATED" &&
    sale.payment_method === "CASH" && sale.payment_status !== "PENDING" && cashBusinessDate(sale.created_at) === businessDate);
  const salesAmount = cashSales.reduce((total, sale) => total + Math.max(0, sale.amount_paid - (sale.change_returned || 0)), 0);
  const expensesAmount = expenses.filter(expense => expense.store_id === storeId && expense.status !== "DRAFT" &&
    expense.payment_method === "CASH" && expense.payment_status === "PAID" && cashBusinessDate(expense.expense_date) === businessDate)
    .reduce((total, expense) => total + expense.amount, 0);
  return { salesAmount, expensesAmount, netAmount: salesAmount - expensesAmount, saleCount: cashSales.length };
}
