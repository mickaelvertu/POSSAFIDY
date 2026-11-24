import { test } from "node:test";
import assert from "node:assert/strict";
import type { StockMovement, StockTransfer } from "../types";
import { canAccessTransferDestination, canConfirmReceiptActors, isAssignedDepotManager, posReceiptProof } from "./transferReceipt";

test("POS confirmation permits the receiver while central confirmation separates actors", () => {
  const transfer = { received_by: "receiver", requested_by: "requester", approved_by: "approver" };
  for (const validator of Object.values(transfer)) {
    assert.equal(canConfirmReceiptActors(transfer, validator, { store_type: "POS" }, false), true);
    assert.equal(canConfirmReceiptActors(transfer, validator, { store_type: "CENTRAL_WAREHOUSE" }, false), false);
    assert.equal(canConfirmReceiptActors(transfer, validator, { store_type: "CENTRAL_WAREHOUSE" }, true), true);
  }
  assert.equal(canConfirmReceiptActors(transfer, "other", { store_type: "CENTRAL_WAREHOUSE" }, false), true);
  assert.equal(canConfirmReceiptActors(transfer, undefined, { store_type: "POS" }, false), false);
  assert.equal(canConfirmReceiptActors(transfer, "receiver", undefined, false), false);
});

test("only the assigned depot manager can confirm their own central receipt", () => {
  const manager = { roleId: "RESPONSABLE_MAGASIN" as const, storeIds: ["DEP-01"] };
  const depot = { id: "DEP-01", store_type: "CENTRAL_WAREHOUSE" as const };
  assert.equal(isAssignedDepotManager(manager, depot), true);
  assert.equal(isAssignedDepotManager({ ...manager, storeIds: ["other"] }, depot), false);
  assert.equal(isAssignedDepotManager({ ...manager, roleId: "MAGASINIER" }, depot), false);
  assert.equal(isAssignedDepotManager({ ...manager, roleId: "ADMIN" }, depot), false);
  assert.equal(isAssignedDepotManager(manager, { ...depot, store_type: "POS" }), false);
  assert.equal(isAssignedDepotManager(manager, undefined), false);
});

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
  updated.lines.forEach((line, line_index) => {
    assert.deepEqual(posReceiptProof({ ...current, status: "RECEIVED" }, updated, { ...movement, article_id: line.article_id }), {
      transfer_receipt: { transfer_id: current.id, line_index }
    });
  });
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

 test("administrators can receive across stores while other roles remain assigned", () => {
  assert.equal(canAccessTransferDestination({roleId: "ADMIN", storeIds: []}, "POS-1"), true);
  assert.equal(canAccessTransferDestination({roleId: "SUPER_ADMIN", storeIds: []}, "POS-1"), true);
  assert.equal(canAccessTransferDestination({roleId: "MAGASINIER", storeIds: []}, "POS-1"), false);
  assert.equal(canAccessTransferDestination({roleId: "MAGASINIER", storeIds: ["POS-1"]}, "POS-1"), true);
});
