import assert from "node:assert/strict";
import { test } from "node:test";
import type { Sale } from "../types";
import { draftSalePayments } from "./draftSalePayment";
const sale = { id: "sale", credit_customer_id: "customer", total: 100, amount_paid: 30, payment_method: "CASH", created_at: 1, seller_id: "seller", seller_name: "Seller", credit_payments: [{ id: "payment", amount: 30, method: "CASH", paid_at: 1, recorded_by: "seller", recorded_by_name: "Seller" }] } as Sale;
test("draft correction preserves receipt attribution and date", () => {
  assert.deepEqual(draftSalePayments(sale, 60), [{ ...sale.credit_payments![0], amount: 60 }]);
  assert.deepEqual(draftSalePayments(sale, 0), []);
  assert.equal(draftSalePayments({ ...sale, credit_payments: [] }, 50)?.[0].amount, 50);
});
test("draft correction rejects invalid amounts and separately accounted receipts", () => {
  for (const amount of [-1, NaN, Infinity]) assert.throws(() => draftSalePayments(sale, amount));
  assert.throws(() => draftSalePayments({ ...sale, credit_payments: [{ ...sale.credit_payments![0], cash_destination: "TREASURY" }] }, 60));
  assert.throws(() => draftSalePayments({ ...sale, credit_payments: [...sale.credit_payments!, ...sale.credit_payments!] }, 60));
});
