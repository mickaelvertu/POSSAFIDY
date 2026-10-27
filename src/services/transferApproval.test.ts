import { test } from "node:test";
import assert from "node:assert/strict";
import type { AppUser, StockTransfer, Store } from "../types";
import { canApproveTransfer, isWorkshopTransfer } from "./transferApproval";

const stores: Store[] = ["source", "destination"].map(id => ({
  id, name: id, code: id, store_type: "MANUFACTURER", is_active: true, created_at: 1, updated_at: 1
}));
const transfer = {
  source_store_id: "source", destination_store_id: "destination", type: "MANUFACTURER_TO_STORE" as const,
  status: "DRAFT" as const, requested_by: "maker"
};
const operator = {
  uid: "maker", roleId: "PRODUCTION" as const, storeIds: ["source"], isActive: true,
  permissions: ["transfers.create", "transfers.ship"]
};

test("source production operator can approve their own workshop draft without admin rights", () => {
  assert.equal(canApproveTransfer(operator, transfer, stores), true);
  assert.equal(canApproveTransfer({ ...operator, uid: "source-colleague" }, transfer, stores), true);
});
test("destination and unrelated operators cannot approve a workshop draft", () => {
  for (const storeIds of [["destination"], ["other"], []]) {
    assert.equal(canApproveTransfer({ ...operator, storeIds }, transfer, stores), false);
  }
});
test("local approval requires both permissions, active account and draft status", () => {
  for (const permissions of [[], ["transfers.create"], ["transfers.ship"]]) {
    assert.equal(canApproveTransfer({ ...operator, permissions }, transfer, stores), false);
  }
  assert.equal(canApproveTransfer({ ...operator, isActive: false }, transfer, stores), false);
  for (const status of ["APPROVED", "IN_TRANSIT", "VALIDATED", "CANCELLED"] as StockTransfer["status"][]) {
    assert.equal(canApproveTransfer(operator, { ...transfer, status }, stores), false);
  }
});
test("local approval excludes depots, shops, inactive or missing workshops and purchases", () => {
  for (const store_type of ["CENTRAL_WAREHOUSE", "POS", "RESELLER"] as Store["store_type"][]) {
    for (const index of [0, 1]) {
      const routeStores = stores.map((s, i) => i === index ? { ...s, store_type } : s);
      assert.equal(canApproveTransfer(operator, transfer, routeStores), false);
    }
  }
  assert.equal(isWorkshopTransfer(transfer, stores.slice(0, 1)), false);
  assert.equal(isWorkshopTransfer(transfer, stores.map(s => ({ ...s, is_active: false }))), false);
  assert.equal(isWorkshopTransfer({ ...transfer, destination_store_id: "source" }, stores), false);
  assert.equal(isWorkshopTransfer({ ...transfer, purchase_id: "purchase" }, stores), false);
  for (const type of ["DIRECT_DEPOSIT", "RECYCLING", "SUPPLIER_TO_STORE", "STORE_RETURN"] as StockTransfer["type"][]) {
    assert.equal(isWorkshopTransfer({ ...transfer, type }, stores), false);
  }
});
test("other routes still require an administrator different from the requester", () => {
  const otherRoute = { ...transfer, type: "CENTRAL_TO_POS" as const };
  assert.equal(canApproveTransfer(operator, otherRoute, stores), false);
  for (const roleId of ["ADMIN", "SUPER_ADMIN"] as AppUser["roleId"][]) {
    const admin = { ...operator, roleId, uid: "administrator", storeIds: [], permissions: [] };
    assert.equal(canApproveTransfer(admin, otherRoute, stores), true);
    assert.equal(canApproveTransfer({ ...admin, uid: "maker" }, otherRoute, stores), false);
  }
});
