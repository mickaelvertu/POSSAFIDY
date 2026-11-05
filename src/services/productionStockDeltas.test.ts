import { test } from "node:test";
import assert from "node:assert/strict";
import { productionStockDeltas } from "./productionStockDeltas";
import type { Production } from "../types";
const production = { status: "COMPLETED", manufacturer_store_id: "lab",
  consumptions: [{ article_id: "raw", quantity: 3 }, { article_id: "recycled", quantity: 2, source: "RECYCLED" }],
  outputs: [{ article_id: "finished", quantity: 4 }, { article_id: "finished", quantity: 1 }]
} as Production;
test("validated production consumes laboratory materials and keeps finished products in the laboratory", () => {
  assert.deepEqual(productionStockDeltas(production), [
    { storeId: "lab", articleId: "raw", normal: -3, recycled: 0 },
    { storeId: "lab", articleId: "recycled", normal: 0, recycled: -2 },
    { storeId: "lab", articleId: "finished", normal: 5, recycled: 0 }
  ]);
});
test("draft production never changes stock", () => {
  assert.deepEqual(productionStockDeltas({ ...production, status: "DRAFT" }), []);
});
test("an article consumed and produced in the same laboratory is consolidated once", () => {
  const deltas = productionStockDeltas({ ...production, outputs: [{ article_id: "raw", quantity: 5 }] } as Production);
  assert.deepEqual(deltas[0], { storeId: "lab", articleId: "raw", normal: 2, recycled: 0 });
});
