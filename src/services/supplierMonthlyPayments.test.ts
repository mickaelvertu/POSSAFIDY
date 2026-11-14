import assert from "node:assert/strict";
import test from "node:test";
import type { Purchase, SupplierPayment } from "../types";
import { supplierMonthlyPayments } from "./supplierMonthlyPayments";

const payment = (amount: number, paid_at: number) => ({ amount, paid_at } as SupplierPayment);
const purchase = (supplier_id: string, payments: SupplierPayment[]) => ({ supplier_id, payments, created_at: new Date(2025, 0, 1).getTime() } as Purchase);

test("monthly totals use actual payment dates and combine partial payments across invoices", () => {
  const result = supplierMonthlyPayments([
    purchase("A", [payment(100, new Date(2026, 10, 1).getTime()), payment(30, new Date(2026, 9, 31, 23, 59).getTime())]),
    purchase("A", [payment(50, new Date(2026, 10, 30, 23, 59, 59, 999).getTime()), payment(99, new Date(2026, 11, 1).getTime())]),
    purchase("B", [payment(20, new Date(2026, 10, 15).getTime())]),
  ], "2026-11");
  assert.deepEqual(result.get("A"), { total: 150, count: 2 });
  assert.deepEqual(result.get("B"), { total: 20, count: 1 });
});

test("invalid months and malformed payments do not affect totals", () => {
  const rows = [purchase("A", [payment(NaN, Date.now()), payment(2, NaN), payment(-2, new Date(2026, 10, 5).getTime())])];
  assert.equal(supplierMonthlyPayments(rows, "").size, 0);
  assert.equal(supplierMonthlyPayments(rows, "2026-13").size, 0);
  assert.equal(supplierMonthlyPayments(rows, "2026-11").size, 0);
});
