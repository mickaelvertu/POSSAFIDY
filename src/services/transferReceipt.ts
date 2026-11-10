import type { StockMovement, StockTransfer, Store, UserProfile } from "../types";

export function isAssignedDepotManager(user: Pick<UserProfile, "roleId" | "storeIds">, store: Pick<Store, "id" | "store_type"> | undefined) {
  return user.roleId === "RESPONSABLE_MAGASIN" && store?.store_type === "CENTRAL_WAREHOUSE"
    && user.storeIds.includes(store.id);
}

export function canConfirmReceiptActors(
  transfer: Pick<StockTransfer, "received_by" | "requested_by" | "approved_by">,
  validatorId: string | undefined,
  destination: Pick<Store, "store_type"> | undefined,
  depotManager: boolean
) {
  if (!validatorId || !destination) return false;
  return destination.store_type !== "CENTRAL_WAREHOUSE" || depotManager || (
    validatorId !== transfer.received_by && validatorId !== transfer.requested_by && validatorId !== transfer.approved_by
  );
}

/** Link a positive POS receipt to its exact line in the atomic transfer update. */
export function posReceiptProof(current: StockTransfer, updated: StockTransfer, movement: StockMovement) {
  const index = updated.lines.findIndex(line => line.article_id === movement.article_id);
  const line = updated.lines[index];
  return current.type === "CENTRAL_TO_POS"
    && ["IN_TRANSIT", "RECEIVED"].includes(current.status)
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
