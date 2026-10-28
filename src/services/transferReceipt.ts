import type { StockMovement, StockTransfer } from "../types";

/** Link a positive POS receipt to its exact line in the atomic transfer update. */
export function posReceiptProof(current: StockTransfer, updated: StockTransfer, movement: StockMovement) {
  const index = updated.lines.findIndex(line => line.article_id === movement.article_id);
  const line = updated.lines[index];
  return current.type === "CENTRAL_TO_POS"
    && current.status === "IN_TRANSIT"
    && ["VALIDATED", "DISCREPANCY"].includes(updated.status)
    && current.id === updated.id
    && movement.reference_type === "TRANSFER"
    && movement.reference_id === current.id
    && !movement.stock_bucket
    && movement.quantity > 0
    && movement.store_id === current.destination_store_id
    && line?.quantity_accepted === movement.quantity
    ? { transfer_receipt: { transfer_id: updated.id, line_index: index } }
    : {};
}
