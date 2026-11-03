import assert from "node:assert/strict";
import test from "node:test";
import { canPurchaseArticle } from "./purchaseEligibility";

test("resale purchases go exclusively to active depots", () => {
  const article = { article_type: "RESALE" as const, is_active: true };
  assert.equal(canPurchaseArticle({ store_type: "CENTRAL_WAREHOUSE", is_active: true }, article), true);
  for (const store_type of ["POS", "RESELLER", "MANUFACTURER"] as const) {
    assert.equal(canPurchaseArticle({ store_type, is_active: true }, article), false);
  }
  assert.equal(canPurchaseArticle({ store_type: "CENTRAL_WAREHOUSE", is_active: false }, article), false);
  assert.equal(canPurchaseArticle({ store_type: "CENTRAL_WAREHOUSE", is_active: true }, { ...article, is_active: false }), false);
});

test("raw material purchases remain available to depots and manufacturers", () => {
  const article = { article_type: "RAW_MATERIAL" as const, is_active: true };
  for (const store_type of ["CENTRAL_WAREHOUSE", "MANUFACTURER"] as const) {
    assert.equal(canPurchaseArticle({ store_type, is_active: true }, article), true);
  }
  assert.equal(canPurchaseArticle({ store_type: "POS", is_active: true }, article), false);
});
