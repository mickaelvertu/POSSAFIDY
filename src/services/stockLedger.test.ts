import { test } from "node:test";
import assert from "node:assert/strict";
import type { Article, Sale, StockMovement, StockTransfer, Store } from "../types";
import { buildStockLedger } from "./stockLedger";
import { ledgerDateBounds, ledgerStoreScope } from "./ledgerLoadPolicy";

test("ledger queries never broaden a non-admin's assigned stores", () => {
  assert.deepEqual(ledgerStoreScope([], ["one", "two"]), ["one", "two"]);
  assert.deepEqual(ledgerStoreScope(["two"], ["one", "two"]), ["two"]);
  assert.deepEqual(ledgerStoreScope([], []), []);
  assert.deepEqual(ledgerStoreScope([], undefined), [undefined]);
  assert.deepEqual(ledgerStoreScope(["two"], undefined), ["two"]);
  assert.throws(() => ledgerStoreScope(["other"], ["one"]), { code: "permission-denied" });
});

test("ledger date constraints include the whole selected local day", () => {
  const bounds = ledgerDateBounds({ startDate: "2026-10-01", endDate: "2026-10-30" });
  assert.equal(bounds.start, new Date(2026, 9, 1, 0, 0, 0, 0).getTime());
  assert.equal(bounds.end, new Date(2026, 9, 30, 23, 59, 59, 999).getTime());
  assert.deepEqual(ledgerDateBounds({}), { start: undefined, end: undefined });
  assert.throws(() => ledgerDateBounds({ startDate: "2026-10-30", endDate: "2026-10-01" }), { code: "invalid-argument" });
});

test("a period-only ledger preserves opening and closing balances and uses indexed references", () => {
  const sales = [{ id: "sale", customer_name: "Client" }] as Sale[];
  const transfers = [{ id: "transfer", source_store_id: "source", destination_store_id: "store" }] as StockTransfer[];
  // A full array scan per movement must never return to this hot path.
  sales.find = () => { throw new Error("Repeated sale scan"); };
  transfers.find = () => { throw new Error("Repeated transfer scan"); };
  const movements = [
    { id: "in", store_id: "store", article_id: "article", quantity: 4, before_quantity: 10, after_quantity: 14, created_at: 1, reference_type: "TRANSFER", reference_id: "transfer" },
    { id: "out", store_id: "store", article_id: "article", quantity: -2, before_quantity: 14, after_quantity: 12, created_at: 2, reference_type: "SALE", reference_id: "sale" },
  ] as StockMovement[];
  const [block] = buildStockLedger(movements, {
    getArticle: () => ({ id: "article", name: "Article", code: "A", unit: "piece" }) as Article,
    getStore: id => ({ id, name: id, code: id }) as Store, sales, transfers,
  }, "OUT");
  assert.equal(block.before, 10); assert.equal(block.after, 12);
  assert.equal(block.entries.length, 1); assert.equal(block.totalOut, -2);
  assert.match(block.entries[0].cause, /Client/);
});
