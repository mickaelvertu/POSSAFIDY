import { test } from "node:test";
import assert from "node:assert/strict";
import type { StockMovement, StockTransfer } from "../types";
import { posReceiptProof } from "./transferReceipt";

const current = { id: "transfer", type: "CENTRAL_TO_POS", status: "IN_TRANSIT", destination_store_id: "MAG-047" } as StockTransfer;
const updated = {
  ...current, status: "VALIDATED",
  lines: Array.from({ length: 50 }, (_, i) => ({ article_id: `article-${i}`, quantity_accepted: 20 }))
} as StockTransfer;
const movement = { store_id: "MAG-047", article_id: "article-0", quantity: 20, reference_type: "TRANSFER", reference_id: current.id } as StockMovement;

test("50-article receipt links each stock credit to the correct transfer line", () => {
  updated.lines.forEach((line, line_index) => {
    assert.deepEqual(posReceiptProof(current, updated, { ...movement, article_id: line.article_id }), {
      transfer_receipt: { transfer_id: current.id, line_index }
    });
  });
  assert.ok(posReceiptProof(current, { ...updated, status: "DISCREPANCY" }, movement).transfer_receipt);
});

test("unrelated, mismatched, grouped duplicate or quarantine credits have no receipt proof", () => {
  for (const change of [
    { store_id: "other" }, { article_id: "unknown" }, { quantity: 40 }, { quantity: -20 },
    { reference_id: "other" }, { reference_type: "SALE" }, { stock_bucket: "QUARANTINE" as const }
  ]) {
    assert.deepEqual(posReceiptProof(current, updated, { ...movement, ...change }), {});
  }
});

test("shipping, repeated receipts, cancellations and other routes keep normal authorization", () => {
  for (const status of ["APPROVED", "VALIDATED", "CANCELLED"] as const) {
    assert.deepEqual(posReceiptProof({ ...current, status }, updated, movement), {});
  }
  assert.deepEqual(posReceiptProof(current, { ...updated, status: "CANCELLED" }, movement), {});
  assert.deepEqual(posReceiptProof(current, { ...updated, id: "other" }, movement), {});
  assert.deepEqual(posReceiptProof({ ...current, type: "STORE_RETURN" }, updated, movement), {});
});
