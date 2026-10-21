import test from "node:test";
import assert from "node:assert/strict";
import type { StockTransfer } from "../types";
import { cancellationEffects } from "./transferCancellation";

const transfer = (status: StockTransfer["status"], type: StockTransfer["type"] = "STORE_TO_STORE") => ({
  status, type, source_store_id: "source", destination_store_id: "depot",
  lines: [{ article_id: "article", quantity_sent: 10, quantity_accepted: 8 }]
} as StockTransfer);

test("unshipped cancellation has no stock effect; pending receipt only restores the source", () => {
  for (const status of ["DRAFT", "APPROVED"] as const) assert.deepEqual(cancellationEffects(transfer(status)), []);
  for (const status of ["IN_TRANSIT", "RECEIVED"] as const) assert.deepEqual(cancellationEffects(transfer(status)), [
    { storeId: "source", articleId: "article", quantity: 10, quarantine: false }
  ]);
});
test("validated cancellation restores sent quantities and removes only accepted quantities", () => {
  for (const status of ["VALIDATED", "DISCREPANCY"] as const) {
    const effects = cancellationEffects(transfer(status));
    assert.deepEqual(effects.map(effect => effect.quantity), [10, -8]);
    assert.equal(effects[1].storeId, "depot");
  }
});
test("return and recycling buckets are reversed correctly; direct deposit has no source debit", () => {
  assert.deepEqual(cancellationEffects(transfer("VALIDATED", "STORE_RETURN")).map(effect => effect.quarantine), [false, true]);
  assert.deepEqual(cancellationEffects(transfer("VALIDATED", "RECYCLING")).map(effect => effect.quarantine), [true, true]);
  assert.deepEqual(cancellationEffects(transfer("VALIDATED", "DIRECT_DEPOSIT")).map(effect => effect.quantity), [-8]);
});
test("closed transfers and operations requiring purchase or production correction are rejected", () => {
  assert.throws(() => cancellationEffects(transfer("CANCELLED")));
  assert.throws(() => cancellationEffects({ ...transfer("VALIDATED"), purchase_id: "purchase" }));
  const decided = transfer("VALIDATED", "RECYCLING");
  decided.lines[0].recycling_decision = "DESTROYED";
  assert.throws(() => cancellationEffects(decided));
});
