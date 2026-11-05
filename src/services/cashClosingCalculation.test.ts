import { test } from "node:test";
import assert from "node:assert/strict";
import type { Expense, Sale } from "../types";
import { calculateCashClosing, calculateStoreDailyTotals, cashBusinessDate } from "./cashClosingCalculation";

const today = new Date(2026, 9, 15, 12).getTime();
const sale = { store_id: "pos", status: "VALIDATED", payment_method: "CASH", payment_status: "PAID", amount_paid: 1200, change_returned: 200, created_at: today } as Sale;
const expense = { store_id: "pos", status: "VALIDATED", payment_method: "CASH", payment_status: "PAID", amount: 300, expense_date: today } as Expense;

test("closing subtracts paid cash expenses for the same POS and business day", () => {
  const result = calculateCashClosing([sale], [expense], "pos", cashBusinessDate(today));
  assert.deepEqual(result, { salesAmount: 1000, expensesAmount: 300, netAmount: 700, saleCount: 1 });
});

test("admin treasury payments remain store charges without debiting POS cash twice", () => {
  const treasuryExpense = { ...expense, treasury_movement_id: "expense-test", treasury_fund_id: "fund", paid_by: "admin" };
  assert.equal(calculateCashClosing([sale], [treasuryExpense], "pos", cashBusinessDate(today)).netAmount, 1000);
  assert.equal(calculateStoreDailyTotals([{ ...sale, total: 1000 }], [treasuryExpense], "pos", cashBusinessDate(today)).expensesAmount, 300);
});

test("cancelled expenses do not reduce store totals or POS closing", () => {
  const cancelled = { ...expense, status: "CANCELLED" as const };
  assert.equal(calculateCashClosing([sale], [cancelled], "pos", cashBusinessDate(today)).netAmount, 1000);
  assert.equal(calculateStoreDailyTotals([{ ...sale, total: 1000 }], [cancelled], "pos", cashBusinessDate(today)).expensesAmount, 0);
});

test("closing excludes other stores, dates, drafts, unpaid and noncash transactions", () => {
  const excludedExpenses = [
    { ...expense, store_id: "other" }, { ...expense, expense_date: today - 86400000 },
    { ...expense, status: "DRAFT" }, { ...expense, payment_status: "PENDING" },
    { ...expense, payment_method: "MOBILE_MONEY" }
  ] as Expense[];
  const excludedSales = [
    { ...sale, store_id: "other" }, { ...sale, created_at: today - 86400000 },
    { ...sale, status: "DRAFT" }, { ...sale, payment_status: "PENDING" },
    { ...sale, payment_method: "MOBILE_MONEY" }
  ] as Sale[];
  assert.equal(calculateCashClosing([sale, ...excludedSales], [expense, ...excludedExpenses], "pos", cashBusinessDate(today)).netAmount, 700);
});

test("expenses exceeding sales preserve the deficit instead of silently declaring zero", () => {
  assert.equal(calculateCashClosing([], [expense], "pos", cashBusinessDate(today)).netAmount, -300);
});

test("store overview includes credit and noncash sales, but only paid expenses", () => {
  const sales = [
    { ...sale, total: 1000 },
    { ...sale, total: 2000, payment_method: "MOBILE_MONEY" },
    { ...sale, total: 3000, payment_status: "PENDING", amount_paid: 0 },
    { ...sale, total: 9000, status: "DRAFT" },
    { ...sale, total: 9000, store_id: "other" },
    { ...sale, total: 9000, created_at: today - 86400000 }
  ] as Sale[];
  const expenses = [expense, { ...expense, payment_method: "MOBILE_MONEY", amount: 200 },
    { ...expense, status: "DRAFT" }, { ...expense, payment_status: "PENDING" },
    { ...expense, store_id: "other" }, { ...expense, expense_date: today - 86400000 }] as Expense[];
  assert.deepEqual(calculateStoreDailyTotals(sales, expenses, "pos", cashBusinessDate(today)), {
    salesAmount: 6000, expensesAmount: 500, netAmount: 5500
  });
});

test("later credit settlements belong to their receipt date and preserve the original closing", () => {
  const yesterday = today - 86400000;
  const credit = { ...sale, created_at: yesterday, amount_paid: 900, change_returned: 0, credit_payments: [
    { id: 'cash', amount: 300, method: 'CASH', paid_at: today },
    { id: 'mobile', amount: 200, method: 'MVOLA', paid_at: today },
  ] } as Sale;
  assert.equal(calculateCashClosing([credit], [], 'pos', cashBusinessDate(yesterday)).salesAmount, 400);
  assert.equal(calculateCashClosing([credit], [], 'pos', cashBusinessDate(today)).salesAmount, 300);
});

test("direct admin treasury receipts are excluded from store cash handover", () => {
  const credit = { ...sale, created_at: today - 86400000, amount_paid: 400, change_returned: 0,
    credit_payments: [{ id: 'admin', amount: 400, method: 'CASH', paid_at: today, cash_destination: 'TREASURY' }] } as Sale;
  assert.equal(calculateCashClosing([credit], [], 'pos', cashBusinessDate(today)).netAmount, 0);
  assert.equal(calculateCashClosing([credit], [], 'pos', cashBusinessDate(today - 86400000)).netAmount, 0);
});
