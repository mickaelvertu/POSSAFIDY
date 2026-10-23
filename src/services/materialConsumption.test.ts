import assert from "node:assert/strict";
import test from "node:test";
import type { Article, Store, UserProfile } from "../types";
import { canConsumeMaterials, validateMaterialConsumption } from "./materialConsumption";

const material = { is_active: true, article_type: "RAW_MATERIAL" } as Article;
const manager = { roleId: "RESPONSABLE_MAGASIN", storeIds: ["depot"], permissions: ["stock.edit"] } as UserProfile;
const depot = { id: "depot", store_type: "CENTRAL_WAREHOUSE", is_active: true } as Store;

test("assigned store managers can consume materials, without access to other stores", () => {
  assert.equal(canConsumeMaterials(manager, depot), true);
  assert.equal(canConsumeMaterials(manager, { ...depot, id: "other" }), false);
  assert.equal(canConsumeMaterials({ ...manager, permissions: ["stock.view"] }, depot), false);
  assert.equal(canConsumeMaterials({ ...manager, permissions: ["production.create"] }, depot), true);
  assert.equal(canConsumeMaterials(manager, { ...depot, store_type: "MANUFACTURER" }), true);
});

test("POS and reseller stores cannot consume raw materials, including as administrator", () => {
  for (const roleId of ["RESPONSABLE_MAGASIN", "ADMIN", "SUPER_ADMIN"] as const) {
    for (const store_type of ["POS", "RESELLER"] as const) {
      assert.equal(canConsumeMaterials({ ...manager, roleId }, { ...depot, store_type }), false);
    }
  }
  assert.equal(canConsumeMaterials(manager, { ...depot, is_active: false }), false);
});

test("material consumption supports fractional quantities and consuming the remaining stock", () => {
  assert.doesNotThrow(() => validateMaterialConsumption(material, 0.25, 1, "Fabrication locale"));
  assert.doesNotThrow(() => validateMaterialConsumption(material, 1, 1, "Utilisation"));
});

test("material consumption rejects overspending, invalid quantities, products and missing reasons", () => {
  for (const quantity of [0, -1, NaN, Infinity, 2]) {
    assert.throws(() => validateMaterialConsumption(material, quantity, 1, "Utilisation"));
  }
  assert.throws(() => validateMaterialConsumption(material, 1, 1, "  "));
  assert.throws(() => validateMaterialConsumption({ ...material, is_active: false }, 1, 1, "Utilisation"));
  assert.throws(() => validateMaterialConsumption({ ...material, article_type: "RESALE" }, 1, 1, "Utilisation"));
  assert.throws(() => validateMaterialConsumption(undefined, 1, 1, "Utilisation"));
});
