import { test } from "node:test";
import assert from "node:assert/strict";
import { buildActionNotifications, type NotificationContext } from "./notificationService";
import type { Sale, StockTransfer } from "../types";

const context: NotificationContext = {
  uid: "approver", storeIds: ["warehouse"], isAdmin: false,
  canReceiveTransfers: false, canReviewInventory: false, canShipSales: true,
  warehouseStoreIds: ["warehouse"], transfers: [], inventoryCounts: [], resellerOrders: [], sales: [],
};
const sale = { id: "sale", sale_number: "S-1", store_id: "warehouse", status: "DRAFT", customer_type: "REVENDEUR", customer_name: "Client", created_at: 1 } as Sale;
const transfer = { id: "transfer", transfer_number: "T-1", status: "DRAFT", type: "STORE_TO_STORE", requested_by: "maker", created_at: 2 } as StockTransfer;

test("warehouse drafts alert assigned validators and admins only", () => {
  assert.equal(buildActionNotifications({ ...context, sales: [sale] })[0]?.id, "sa-draft-sale");
  assert.equal(buildActionNotifications({ ...context, sales: [sale], storeIds: [] }).length, 0);
  assert.equal(buildActionNotifications({ ...context, sales: [sale], canShipSales: false }).length, 0);
  assert.equal(buildActionNotifications({ ...context, sales: [sale], warehouseStoreIds: [] }).length, 0);
  assert.equal(buildActionNotifications({ ...context, sales: [sale], isAdmin: true, storeIds: [] }).length, 1);
});

test("warehouse draft alert disappears once reviewed or cancelled", () => {
  for (const status of ["CHECKING", "CANCELLED", "VALIDATED"] as Sale["status"][]) {
    assert.equal(buildActionNotifications({ ...context, sales: [{ ...sale, status }] }).length, 0);
  }
});

test("transfer draft alerts use the actual approval policy without duplicate entries", () => {
  assert.equal(buildActionNotifications({ ...context, transfers: [transfer], canApproveTransfer: () => true }).length, 1);
  assert.equal(buildActionNotifications({ ...context, isAdmin: true, transfers: [transfer], canApproveTransfer: () => false }).length, 0);
  assert.equal(buildActionNotifications({ ...context, transfers: [{ ...transfer, status: "CANCELLED" }], canApproveTransfer: () => true }).length, 0);
});

test("notification targets preserve exact record IDs including hyphens", () => {
  const items = buildActionNotifications({
    ...context, sales: [{ ...sale, id: "warehouse-sale-123" }],
    transfers: [{ ...transfer, id: "warehouse-transfer-456" }], canApproveTransfer: () => true,
  });
  assert.deepEqual(items.map(item => [item.module, item.entityId]), [
    ["transfers", "warehouse-transfer-456"], ["sales", "warehouse-sale-123"],
  ]);
});
