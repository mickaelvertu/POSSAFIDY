import type { AppUser, StockTransfer, Store } from "../types";

type TransferRoute = Pick<StockTransfer, "source_store_id" | "destination_store_id" | "type" | "purchase_id">;
type ApprovalTransfer = TransferRoute & Pick<StockTransfer, "status" | "requested_by">;
type Operator = Pick<AppUser, "uid" | "roleId" | "storeIds" | "permissions" | "isActive">;

export function isWorkshopTransfer(transfer: TransferRoute, stores: Store[]): boolean {
  return transfer.purchase_id === undefined
    && ["MANUFACTURER_TO_STORE", "STORE_TO_STORE"].includes(transfer.type)
    && transfer.source_store_id !== transfer.destination_store_id
    && [transfer.source_store_id, transfer.destination_store_id].every(id =>
      stores.some(store => store.id === id && store.store_type === "MANUFACTURER" && store.is_active));
}

export function canApproveTransfer(user: Operator, transfer: ApprovalTransfer, stores: Store[]): boolean {
  if (!user.isActive || transfer.status !== "DRAFT") return false;
  const admin = ["ADMIN", "SUPER_ADMIN"].includes(user.roleId);
  const sourceApproval = isWorkshopTransfer(transfer, stores)
    && user.storeIds.includes(transfer.source_store_id)
    && (admin || ["transfers.create", "transfers.ship"].every(permission => user.permissions.includes(permission)));
  return sourceApproval || (admin && user.uid !== transfer.requested_by);
}
