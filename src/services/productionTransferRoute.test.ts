import { test } from "node:test";
import assert from "node:assert/strict";
import { productionTransferAllowed } from "./productionTransferRoute";
import type { Store, StoreTypeCode } from "../types";
const store = (store_type: StoreTypeCode, is_active = true) => ({ store_type, is_active }) as Store;
test("production exchanges with production and depots in both directions", () => {
  for (const type of ["MANUFACTURER", "CENTRAL_WAREHOUSE"] as StoreTypeCode[]) {
    assert.equal(productionTransferAllowed(store("MANUFACTURER"), store(type)), true);
    assert.equal(productionTransferAllowed(store(type), store("MANUFACTURER")), true);
  }
});
test("production and POS cannot exchange in either direction", () => {
  assert.equal(productionTransferAllowed(store("MANUFACTURER"), store("POS")), false);
  assert.equal(productionTransferAllowed(store("POS"), store("MANUFACTURER")), false);
});
test("inactive or missing stores are rejected and depot to POS remains allowed", () => {
  assert.equal(productionTransferAllowed(store("MANUFACTURER"), store("CENTRAL_WAREHOUSE", false)), false);
  assert.equal(productionTransferAllowed(undefined, store("MANUFACTURER")), false);
  assert.equal(productionTransferAllowed(store("CENTRAL_WAREHOUSE"), store("POS")), true);
});
